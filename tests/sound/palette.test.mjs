// W-PALETTE (SPEC §7, §9): every cue a piece plays is measured against the style's sound profile: register, attack,
// length band of its family, the loudest 100 ms against the profile's level, the peak. The shipped palette passes
// under its own profiles; a deliberately off cue warns, naming the cue, the measure and the band.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, ROOT, ctxFor as ctxIn, ensurePiece, variant } from '../../fixtures/sound/setup.mjs';
import wPalette from '../../scripts/check/W-PALETTE.mjs';
import { IDS } from '../../scripts/check.mjs';
import { judgeCue, misses } from '../../scripts/lib/sound-palette.mjs';
import { loadProfile } from '../../scripts/lib/sound-profile.mjs';
import { recipeModule, renderRecipe } from '../../runtime/kit/synth.js';
import { calibratedGain } from '../../scripts/sound-listen.mjs';

const SR = 48000;
const LIB = join(ROOT, 'patterns');
const ctxFor = (dir, o = {}) => ctxIn(dir, { patternsBase: LIB, ...o });
const glass = loadProfile('glass');
// the first data palette; the cues the newer layers make are held to the profiles in tests/sound/engine-cues.test.mjs (two of them cannot be)
const PALETTE = ['ready', 'attention', 'success', 'warning', 'error', 'loading', 'tap', 'toggle-on', 'toggle-off', 'open', 'close'];
const recipes = readdirSync(join(LIB, 'sound')).filter((n) => PALETTE.includes(n) && existsSync(join(LIB, 'sound', n, 'recipe.json'))).sort()
  .map((n) => JSON.parse(readFileSync(join(LIB, 'sound', n, 'recipe.json'), 'utf8')));
const kinds = (j) => misses(j).map((c) => c.check);

before(async () => { await ensurePiece(); });

test('the rule is in the gate\'s order, after the last warning', () => {
  assert.ok(IDS.includes('W-PALETTE') && IDS.includes('W-SAMPLE-LICENSE'));
  assert.ok(IDS.indexOf('W-PALETTE') > IDS.indexOf('W-SAMEBOX'));
});

test('the shipped palette passes under its own profiles, at every emphasis', () => {
  assert.ok(recipes.length >= 11);
  for (const profileName of ['glass', 'soft-ui']) {
    const profile = loadProfile(profileName);
    for (const recipe of recipes) for (const emphasis of ['subtle', 'normal', 'strong']) {
      const { channels, sampleRate } = renderRecipe(recipe, { sampleRate: SR, emphasis, profile });
      const j = judgeCue(channels, sampleRate, profile, { durationS: recipeModule(recipe, profile).durationS, emphasis });
      assert.deepEqual(misses(j).map((c) => `${c.check}: ${c.message}`), [], `${recipe.name} (${emphasis}) under ${profileName}`);
    }
  }
});

test('judgeCue names each way a sound is off the profile', () => {
  // every probe is calibrated to -30 LUFS as written (the glass level), then the test moves one thing
  const tone = (f, t60, edit = () => {}) => {
    const r = { name: 'probe', meaning: 'a probe for the tests', durationS: t60 + 0.01, layers: [{ kind: 'tone', f, attackS: 0.002, t60, peak: 1 }] };
    edit(r);
    return { ...r, masterGain: calibratedGain(r) };
  };
  const judge = (recipe, opts = {}) => { const { channels } = renderRecipe(recipe, { sampleRate: SR }); return judgeCue(channels, SR, glass, { durationS: recipe.durationS, ...opts }); };
  const louder = (r, db) => ({ ...r, masterGain: r.masterGain * 10 ** (db / 20) });
  assert.deepEqual(kinds(judge(tone(880, 0.3))), [], 'a plain tone at the matched level is inside');
  assert.deepEqual(kinds(judge(louder(tone(880, 0.3), 10))), ['level'], '10 dB too loud');
  assert.deepEqual(kinds(judge(louder(tone(880, 0.3), 25))), ['level', 'peak'], '25 dB too loud: over the ceiling too');
  assert.deepEqual(kinds(judge(louder(tone(880, 0.3), -6))), ['level'], '6 dB too quiet');
  assert.ok(kinds(judge(tone(8000, 0.3))).includes('register'), 'a tone centred at 8 kHz');
  assert.ok(kinds(judge(tone(25, 0.3))).includes('register'), 'a tone under the floor');
  assert.ok(kinds(judge(tone(880, 0.3, (r) => { r.layers[0].attackS = 0.008; }))).includes('attack'), 'an 8 ms struck attack against 1-3 ms');
  assert.ok(!kinds(judge(tone(880, 0.3, (r) => { r.layers[0].attackS = 0.05; }))).includes('attack'), 'a swell has no attack band');
  assert.ok(!kinds(judge(tone(880, 1.4))).includes('length'), 'a swell has no length band');
  const declared = tone(880, 1.45); declared.durationS = 0.5;
  assert.ok(kinds(judge(declared)).includes('length'), 'an outcome cue (0.5 s) that rings for a second');
  const short = tone(880, 0.05); short.durationS = 0.5;
  assert.ok(kinds(judge(short)).includes('length'), 'an outcome cue (0.5 s) that rings for 40 ms');
  assert.deepEqual(misses(judge(louder(tone(880, 0.3), 2.5), { emphasis: 'strong' })).map((c) => c.check), [], 'a bigger arrangement may sit twice the tolerance off');
  assert.deepEqual(kinds(judge(louder(tone(880, 0.3), 2.5))), ['level'], 'and a normal one may not');
});

test('W-PALETTE skips with no profile, no cues or palette none', async () => {
  const none = await variant('palette-none', { cues: ['tick'], track: null, beats: null });
  const r1 = await wPalette(await ctxFor(none));
  assert.equal(r1.status, 'SKIP');
  assert.match(r1.evidence.reason, /sound\.profile is not set/);
  const noCues = await variant('palette-nocues', { cues: [], track: null, beats: null, style: { sound: { profile: 'glass' } } });
  assert.equal((await wPalette(await ctxFor(noCues))).evidence.reason, 'the schedule has no cues');
  const off = await variant('palette-off', { cues: ['tap'], track: null, beats: null, style: { sound: { profile: 'glass', palette: 'none' } } });
  assert.match((await wPalette(await ctxFor(off))).evidence.reason, /palette is "none"/);
  const broken = await variant('palette-broken', { cues: ['tap'], track: null, beats: null, style: { sound: { profile: 'no-such-profile' } } });
  assert.match((await wPalette(await ctxFor(broken))).evidence.reason, /cannot be read/);
});

test('W-PALETTE passes the shipped palette under its own profile', async () => {
  for (const profile of ['glass', 'soft-ui']) {
    const dir = await variant(`palette-pass-${profile}`, { cues: ['ready', 'success', 'tap', 'open'], track: null, beats: null, style: { sound: { profile } } });
    const r = await wPalette(await ctxFor(dir));
    assert.equal(r.status, 'PASS', JSON.stringify(r.evidence.misses ?? r.evidence));
    assert.equal(r.evidence.profile, profile);
    assert.deepEqual(r.evidence.readings.map((x) => x.kind), ['recipe', 'recipe', 'recipe', 'recipe']);
  }
});

/** A patterns base of its own holding the cue recipes given, under fixtures/sound/out/. */
function base(name, cues) {
  const dir = join(OUT, name, 'patterns');
  for (const [cue, recipe] of Object.entries(cues)) {
    mkdirSync(join(dir, 'sound', cue), { recursive: true });
    writeFileSync(join(dir, 'sound', cue, 'recipe.json'), JSON.stringify({ name: cue, meaning: 'a probe for the tests', ...recipe }));
  }
  return dir;
}

test('W-PALETTE warns for a cue that is off the profile, once per miss, naming the cue and the band', async () => {
  const patterns = base('palette-hiss', { hiss: { durationS: 0.3, layers: [{ kind: 'noise', filter: { type: 'highpass', f: 9000, q: 0.7 }, attackS: 0.002, t60: 0.2, peak: 1 }], masterGain: 0.05 } });
  const dir = await variant('palette-hiss', { cues: ['hiss', 'tap'], track: null, beats: null, style: { sound: { profile: 'glass' } } });
  const r = await wPalette(await ctxFor(dir, { patternsBase: patterns }));
  // `tap` is not in this base: it is named as not measured, and the hiss warns
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.misses.some((m) => m.cue === 'hiss' && m.check === 'register'), true, r.evidence.reason);
  assert.match(r.evidence.reason, /hiss: its centre of sound is \d+ Hz, above the profile's 5000 Hz/);
  assert.ok(r.evidence.unmeasured.some((u) => /^tap:/.test(u)));
  assert.equal(r.evidence.selector !== undefined, true);
});

test('W-PALETTE reads the beat\'s params: the same cue, four times too loud, misses its level and its peak', async () => {
  const loud = (story) => { for (const sc of story.scenes) for (const b of sc.beats) if (b.cue) b.params = { ...(b.params ?? {}), cue: { gain: 4 } }; };
  const dir = await variant('palette-loud', { cues: ['ready'], track: null, beats: null, style: { sound: { profile: 'glass' } }, edit: loud });
  const r = await wPalette(await ctxFor(dir));
  assert.equal(r.status, 'WARN');
  assert.deepEqual(r.evidence.misses.map((m) => m.check).sort(), ['level', 'peak']);
  assert.match(r.evidence.reason, /ready: its loudest 100 ms is -18 LUFS, 12 dB over the profile's -30 LUFS/);
  // a brand sets the same gain for every use in style.patterns, and the rule sees that too
  const brand = await variant('palette-brand', { cues: ['ready'], track: null, beats: null, style: { sound: { profile: 'glass' }, patterns: { 'sound/ready': { gain: 4 } } } });
  assert.equal((await wPalette(await ctxFor(brand))).status, 'WARN');
});

test('W-PALETTE measures a sample as the mix will place it, and warns on an off one', async () => {
  const sampleOf = (name, recipe) => {
    const dir = join(OUT, name);
    mkdirSync(join(dir, 'assets', 'sounds'), { recursive: true });
    return { dir, put: (channels) => import('../../scripts/sound-listen.mjs').then(({ wavOf }) => { writeFileSync(join(dir, 'assets', 'sounds', 'x.wav'), wavOf(channels, SR)); }) };
  };
  const fine = sampleOf('palette-sample-ok');
  await fine.put(renderRecipe({ name: 'x', meaning: 'a sound for the tests', durationS: 0.3, layers: [{ kind: 'tone', f: 880, attackS: 0.002, t60: 0.25, peak: 1 }] }, { sampleRate: SR }).channels);
  const ok = await variant('palette-sample-ok', { cues: ['tap'], track: null, beats: null, style: { sound: { profile: 'glass', samples: { tap: 'assets/sounds/x.wav' } } } });
  const pass = await wPalette(await ctxFor(ok));
  assert.equal(pass.status, 'PASS', JSON.stringify(pass.evidence.misses));
  assert.equal(pass.evidence.readings[0].kind, 'sample');

  const bright = sampleOf('palette-sample-bright');
  await bright.put(renderRecipe({ name: 'x', meaning: 'a sound for the tests', durationS: 0.3, layers: [{ kind: 'tone', f: 9500, attackS: 0.002, t60: 0.25, peak: 1 }] }, { sampleRate: SR }).channels);
  const off = await variant('palette-sample-bright', { cues: ['tap'], track: null, beats: null, style: { sound: { profile: 'glass', samples: { tap: 'assets/sounds/x.wav' } } } });
  const warn = await wPalette(await ctxFor(off));
  assert.equal(warn.status, 'WARN');
  assert.deepEqual(warn.evidence.misses.map((m) => m.check), ['register'], 'matched to the profile\'s level, so only the register is off');
});

test('W-PALETTE draws a library code cue in the style\'s palette and measures it; a code cue elsewhere is named as not measured', async () => {
  const lib = await variant('palette-code', { cues: ['tick'], track: null, beats: null, style: { sound: { profile: 'glass' } } });
  const r = await wPalette(await ctxFor(lib));
  assert.ok(['PASS', 'WARN'].includes(r.status), JSON.stringify(r.evidence));
  const reading = (r.evidence.readings ?? []).find((x) => x.cue === 'tick');
  assert.equal(reading?.kind, 'code');
  assert.ok(reading.checks.every((c) => c.measured !== undefined));
  const elsewhere = await wPalette(await ctxFor(lib, { patternsBase: join(ROOT, 'fixtures', 'sound', 'patterns') }));
  assert.equal(elsewhere.status, 'SKIP');
  assert.equal(elsewhere.evidence.partial, true);
  assert.match(elsewhere.evidence.reason, /tick: .*outside the library/);
});
