// Recipe cues through the real paths: `layers` on an OfflineAudioContext in Chromium plays the same samples as
// `renderRecipe` in Node; `mm sound` finds a cue that is data, voices it in the style's sound profile, takes
// the beat's emphasis, renders a stereo mix and records how far it leans; W-MIX warns when the lean passes 0.5 dB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, ensurePiece, ctxFor, variant, withPicture } from '../../fixtures/sound/setup.mjs';
import { openRenderer } from '../../scripts/lib/cue-render.mjs';
import { buildSound, loadCueModules, probe } from '../../scripts/sound.mjs';
import { loadCueModule, loadProfile } from '../../scripts/lib/sound-profile.mjs';
import { renderRecipe } from '../../runtime/kit/synth.js';
import wMix from '../../scripts/check/W-MIX.mjs';
import * as M from '../../scripts/lib/audio-measure.mjs';

const PATTERNS = join(ROOT, 'patterns');
const PICTURE = 'kit-smoke-cues-16x9.mp4';
const recipe = (n) => JSON.parse(readFileSync(join(PATTERNS, 'sound', n, 'recipe.json'), 'utf8'));
let r;
before(async () => { await ensurePiece(); r = await openRenderer(); });
after(async () => { await r?.close(); });

test('an OfflineAudioContext plays the samples renderRecipe computes in Node, whatever the profile and emphasis', async () => {
  for (const [name, profileName, emphasis] of [['ready', null, 'normal'], ['tap', 'glass', 'strong'], ['open', 'soft-ui', 'subtle'], ['success', 'glass', 'normal']]) {
    const profile = profileName ? loadProfile(profileName) : null;
    const web = await r.renderChannels([{ cue: name, recipe: recipe(name), profile, at: 0.05, feel: 'soft-ui', opts: { emphasis } }], { seconds: 2 });
    const node = renderRecipe(recipe(name), { sampleRate: web.sampleRate, emphasis, profile });
    const at = Math.round(0.05 * web.sampleRate);
    let worst = 0;
    for (let c = 0; c < 2; c++) for (let i = 0; i < node.length; i++) worst = Math.max(worst, Math.abs(web.channels[c][at + i] - node.channels[c][i]));
    assert.ok(worst < 1e-6, `${name}: the browser and Node differ by ${worst}`);
    for (let c = 0; c < 2; c++) for (let i = 0; i < at; i++) assert.equal(web.channels[c][i], 0, 'silence before the cue');
  }
});

test('the browser renders a recipe the same way twice, to the last bit', async () => {
  const job = { cue: 'ready', recipe: recipe('ready'), profile: loadProfile('glass'), at: 0.05, feel: 'soft-ui', opts: { seed: 3 } };
  const a = await r.renderChannels([job], { seconds: 1 }), b = await r.renderChannels([job], { seconds: 1 });
  for (let c = 0; c < 2; c++) assert.equal(Buffer.compare(Buffer.from(a.channels[c].buffer), Buffer.from(b.channels[c].buffer)), 0);
});

test('a mono context hears the mid: left and right folded', async () => {
  const one = await r.renderChannels([{ cue: 'ready', recipe: recipe('ready'), at: 0.05, feel: 'soft-ui', opts: {} }], { seconds: 1, channels: 1 });
  const two = renderRecipe(recipe('ready'), { sampleRate: one.sampleRate });
  const at = Math.round(0.05 * one.sampleRate);
  let worst = 0;
  for (let i = 0; i < two.length; i++) worst = Math.max(worst, Math.abs(one.channels[0][at + i] - (two.channels[0][i] + two.channels[1][i]) / 2));
  assert.ok(worst < 1e-6, `mono is ${worst} from (L+R)/2`);
});

test('the loaders: pattern.js is a code cue, recipe.json a data cue, a folder with both plays its code until a profile asks for the recipe', async () => {
  const code = await loadCueModule(PATTERNS, 'tick'), data = await loadCueModule(PATTERNS, 'tap');
  assert.equal(code.recipe, undefined);
  assert.equal(data.recipe.name, 'tap');
  assert.equal(data.group, 'sound');
  assert.equal(await loadCueModule(PATTERNS, 'no-such-cue'), null);
  const bare = await loadCueModule(PATTERNS, 'success'), voiced = await loadCueModule(PATTERNS, 'success', loadProfile('glass'));
  assert.equal(bare.recipe, undefined, 'no profile: the code cue');
  assert.equal(voiced.recipe.name, 'success', 'a profile: the recipe');
  assert.equal(bare.durationS, 0.5);
  assert.ok(voiced.durationS > 0.5 && voiced.durationS <= 0.6);
  const mods = await loadCueModules(['ready', 'hit', 'nope'], PATTERNS, null);
  assert.ok(mods.ready.recipe && mods.hit && mods.nope === null);
});

test('mm sound plays recipe cues in the style\'s profile with the beat\'s emphasis, in stereo, and records the lean', async () => {
  const dir = await variant('recipes', {
    cues: ['ready', 'ready', 'tap', 'open'],
    style: { sound: { profile: 'glass', cuesPer10s: [0, 12] } },
    edit: (s) => { s.scenes[0].beats[0].params = { ...(s.scenes[0].beats[0].params ?? {}), cue: { emphasis: 'subtle' } }; s.scenes[0].beats[1].params = { ...(s.scenes[0].beats[1].params ?? {}), cue: { emphasis: 'strong' } }; },
  });
  await withPicture(dir, PICTURE);
  const res = await buildSound(dir, { patterns: PATTERNS });
  const json = JSON.parse(readFileSync(join(dir, 'out', 'cues.json'), 'utf8'));
  assert.deepEqual(new Set(json.cues.filter((c) => c.name !== 'bed').map((c) => c.profile)), new Set(['glass']));
  assert.equal(typeof json.loudness.balanceDb, 'number');
  assert.ok(Math.abs(json.loudness.balanceDb) <= 0.5, `the mix leans ${json.loudness.balanceDb} dB`);
  assert.ok(res.cues.length === json.cues.length);
  // the mix is stereo, and its cue stem too
  for (const f of ['out/mix.wav', 'out/stems/cues.wav']) assert.equal((await probe(join(dir, f))).streams[0].channels, 2, f);
  // the two ready cues are two renders (subtle and strong are different arrangements), not one reused
  const emph = json.cues.filter((c) => c.name === 'ready').map((c) => c.emphasis);
  assert.ok(emph.includes('subtle') && emph.includes('strong'), JSON.stringify(emph));
  const peaks = Object.fromEntries(json.cues.filter((c) => c.name === 'ready').map((c) => [c.emphasis, c.peakDb]));
  assert.notEqual(peaks.subtle, peaks.strong);
  // and the gate reads the same files
  const ctx = await ctxFor(dir, { patternsBase: PATTERNS });
  const w = await wMix(ctx);
  assert.equal(w.evidence.balanceDb, json.loudness.balanceDb);
  assert.ok(!(w.evidence.kinds ?? []).includes('balance'));
});

test('W-MIX warns when the stereo mix leans more than 0.5 dB, naming the side; a mix at the limit passes', async () => {
  const dir = await variant('recipes-lean', { cues: ['ready', 'tap', 'tap', 'open'], style: { sound: { profile: 'glass', cuesPer10s: [0, 12] } } });
  mkdirSync(join(dir, 'out'), { recursive: true });
  const ctx = await ctxFor(dir, { patternsBase: PATTERNS });
  const put = (balanceDb) => writeFileSync(join(dir, 'out', 'cues.json'), JSON.stringify({ loudness: { balanceDb }, cues: [{ name: 'bed', at: 0, peakDb: -20 }] }));
  put(0.9);
  const left = await wMix(ctx);
  assert.equal(left.status, 'WARN');
  assert.ok(left.evidence.kinds.includes('balance'));
  assert.match(left.evidence.reason, /leans left by 0\.90 dB, the limit is 0\.5 dB/);
  put(-0.7);
  assert.match((await wMix(ctx)).evidence.reason, /leans right by 0\.70 dB/);
  put(0.5);
  assert.ok(!((await wMix(ctx)).evidence.kinds ?? []).includes('balance'));
  assert.ok(existsSync(join(dir, 'out', 'cues.json')));
});

test('a measured stereo mix shows what the mixer recorded: the same K-weighted lean, decoded from the file', async () => {
  const dir = await variant('recipes', { cues: ['ready', 'tap', 'tap', 'open'], style: { sound: { profile: 'soft-ui', cuesPer10s: [0, 12] } } });
  await withPicture(dir, PICTURE);
  await buildSound(dir, { patterns: PATTERNS });
  const json = JSON.parse(readFileSync(join(dir, 'out', 'cues.json'), 'utf8'));
  const { spawnSync } = await import('node:child_process');
  const pcm = spawnSync('ffmpeg', ['-v', 'error', '-i', join(dir, 'out', 'mix.wav'), '-ac', '2', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 29 }).stdout;
  const n = pcm.length / 8, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = pcm.readFloatLE(i * 8); R[i] = pcm.readFloatLE(i * 8 + 4); }
  assert.ok(Math.abs(M.balanceDb([L, R], 48000) - json.loudness.balanceDb) < 0.01);
});

test('a recipe that does not validate is named by the mixer\'s loader, and is an unresolved cue to the gate\'s', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-badrecipe-'));
  try {
    mkdirSync(join(dir, 'sound', 'bad'), { recursive: true });
    writeFileSync(join(dir, 'sound', 'bad', 'recipe.json'), JSON.stringify({ name: 'bad', meaning: 'a recipe with no layers', durationS: 0.3, layers: [] }));
    await assert.rejects(() => loadCueModules(['bad'], dir, null, { strict: true }), /recipe .*recipe\.json is invalid/);
    assert.equal((await loadCueModules(['bad'], dir)).bad, null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
