// Samples (SPEC §9): a style or story maps a cue to a sound file; `mm sound` places it like a synthesised cue
// (trimmed, matched to the profile's level) and the file has a record beside it that W-SAMPLE-LICENSE reads.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, ensurePiece, variant, ctxFor } from '../../fixtures/sound/setup.mjs';
import { runCheck } from '../../scripts/check.mjs';
import { buildSound } from '../../scripts/sound.mjs';
import { decodeStereo } from '../../scripts/lib/audio-decode.mjs';
import * as M from '../../scripts/lib/audio-measure.mjs';
import { loadProfile } from '../../scripts/lib/sound-profile.mjs';
import { loadSample, matchSample, readRecord, recordFile, sampleMap, sampleProblems, trimSample } from '../../scripts/lib/sound-sample.mjs';
import { renderRecipe } from '../../runtime/kit/synth.js';
import { wavOf } from '../../scripts/sound-listen.mjs';
import wSample from '../../scripts/check/W-SAMPLE-LICENSE.mjs';

const SR = 48000;
const TONE = { name: 'sample-tone', meaning: 'a tone for the tests', durationS: 0.25, layers: [{ kind: 'tone', f: 1234, attackS: 0.002, t60: 0.2, peak: 1 }] };
const RECORD = { source: 'rendered for the tests', licence: 'CC0-1.0', author: 'the test' };

/** A piece variant with `files` ({ 'assets/sounds/x.wav': samples }) written into it, the first cue mapped to a sample. */
async function piece(name, { style = {}, story = {}, record = RECORD, mapped = { tick: 'assets/sounds/tone.wav' }, quiet = 0 } = {}) {
  const dir = await variant(name, { cues: ['tick'], track: null, beats: null, style: { sound: { samples: mapped, ...(style.sound ?? {}) } }, story });
  mkdirSync(join(dir, 'assets', 'sounds'), { recursive: true });
  const { channels } = renderRecipe({ ...TONE, masterGain: 10 ** (-quiet / 20) }, { sampleRate: SR });
  writeFileSync(join(dir, 'assets', 'sounds', 'tone.wav'), wavOf(channels, SR));
  if (record) writeFileSync(join(dir, 'assets', 'sounds', 'tone.json'), JSON.stringify(record));
  return dir;
}

before(async () => { await ensurePiece(); });

test('the story\'s map wins over the style\'s; a record is x.json beside x.wav', () => {
  const m = sampleMap({ audio: { samples: { tick: 'assets/sounds/b.wav', hit: 'assets/sounds/h.wav' } } }, { sound: { samples: { tick: 'assets/sounds/a.wav', ready: 'assets/sounds/r.mp3' } } }, '/p');
  assert.deepEqual(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [v.rel, v.from]])), { tick: ['assets/sounds/b.wav', 'story'], hit: ['assets/sounds/h.wav', 'story'], ready: ['assets/sounds/r.mp3', 'style'] });
  assert.equal(recordFile('/p/assets/sounds/b.wav'), '/p/assets/sounds/b.json');
  assert.equal(recordFile('/p/assets/sounds/r.mp3'), '/p/assets/sounds/r.json');
  assert.deepEqual(sampleMap({}, {}, '/p'), {});
});

test('trimSample cuts the silence on both sides and keeps the sound and a little room around it', () => {
  const tone = renderRecipe(TONE, { sampleRate: SR }).channels;
  const pad = Math.round(0.5 * SR), n = tone[0].length;
  const padded = tone.map((c) => { const o = new Float32Array(pad + n + pad); o.set(c, pad); return o; });
  const t = trimSample(padded, SR);
  const kept = t[0].length / SR;
  assert.ok(kept > n / SR * 0.5 && kept < n / SR + 0.05, `kept ${kept} s of a ${n / SR} s sound`);
  assert.ok(Math.abs(t[0][t[0].length - 1]) < 1e-3, 'ends faded');
  const first = t[0].findIndex((x) => Math.abs(x) > 1e-3);
  assert.ok(first / SR < 0.006, `the sound starts ${first / SR} s in`);
  assert.equal(trimSample([new Float32Array(100), new Float32Array(100)], SR)[0].length, 0, 'silence trims to nothing');
});

test('matchSample puts the loudest 100 ms on the target level', () => {
  const tone = renderRecipe(TONE, { sampleRate: SR }).channels;
  for (const target of [-30, -32, -24]) {
    const { channels, gainDb } = matchSample(tone, SR, target);
    assert.ok(Math.abs(M.loudest100ms(channels, SR) - target) < 0.01);
    assert.ok(Number.isFinite(gainDb));
  }
});

test('a sample is placed at the profile\'s level: -30 under glass, the profile\'s own under another', async () => {
  const dir = await piece('sample-level');
  const entry = sampleMap({}, { sound: { samples: { tick: 'assets/sounds/tone.wav' } } }, dir).tick;
  for (const name of ['glass', 'soft-ui']) {
    const profile = loadProfile(name);
    const s = await loadSample(entry, profile);
    assert.ok(Math.abs(M.loudest100ms(s.channels, s.sampleRate) - profile.loudness.cueLufs100ms) < 0.05, name);
    assert.deepEqual(s.record, RECORD);
  }
  assert.ok(Math.abs(M.loudest100ms((await loadSample(entry, null)).channels, SR) + 30) < 0.05, 'no profile: the palette\'s matched level');
});

test('readRecord and sampleProblems name what is wrong', async () => {
  const dir = await piece('sample-record');
  const file = join(dir, 'assets', 'sounds', 'tone.wav'), entry = { rel: 'assets/sounds/tone.wav', file };
  assert.deepEqual(sampleProblems(entry), []);
  writeFileSync(join(dir, 'assets', 'sounds', 'tone.json'), JSON.stringify({ source: 'x', licence: 'CC0-1.0' }));
  assert.match(readRecord(file).reason, /invalid.*author/);
  writeFileSync(join(dir, 'assets', 'sounds', 'tone.json'), '{ nope');
  assert.match(readRecord(file).reason, /not JSON/);
  writeFileSync(join(dir, 'assets', 'sounds', 'tone.json'), JSON.stringify({ ...RECORD, licence: '' }));
  assert.match(readRecord(file).reason, /invalid/);
  assert.match(sampleProblems({ rel: 'assets/sounds/gone.wav', file: join(dir, 'assets/sounds/gone.wav') })[0], /does not exist/);
});

test('W-SAMPLE-LICENSE: skips with nothing mapped, passes with a record, warns for a missing record, file or field', async () => {
  const none = await variant('sample-none', { cues: ['tick'], track: null, beats: null });
  assert.equal((await wSample(await ctxFor(none))).status, 'SKIP');
  const ok = await piece('sample-ok');
  const pass = await wSample(await ctxFor(ok));
  assert.equal(pass.status, 'PASS');
  assert.equal(pass.evidence.measured, 1);

  const noRecord = await piece('sample-no-record', { record: null });
  const w1 = await wSample(await ctxFor(noRecord));
  assert.equal(w1.status, 'WARN');
  assert.match(w1.evidence.reason, /no record tone\.json/);
  assert.equal(w1.evidence.selector, 'tick');

  const noLicence = await piece('sample-no-licence', { record: { source: 'somewhere', author: 'someone' } });
  const w2 = await wSample(await ctxFor(noLicence));
  assert.equal(w2.status, 'WARN');
  assert.match(w2.evidence.reason, /licence/);

  const gone = await piece('sample-gone', { mapped: { tick: 'assets/sounds/missing.wav' } });
  const w3 = await wSample(await ctxFor(gone));
  assert.equal(w3.status, 'WARN');
  assert.match(w3.evidence.reason, /does not exist/);

  const viaStory = await piece('sample-story', { mapped: {}, record: null, story: { audio: { samples: { tick: 'assets/sounds/tone.wav' } } } });
  assert.equal((await wSample(await ctxFor(viaStory))).status, 'WARN', 'the story\'s map is read too');
});

test('mm sound mixes the sample in the cue\'s place, at the cue\'s instant, and records it in cues.json', async () => {
  const dir = await piece('sample-mix', { style: { sound: { profile: 'glass' } } });
  const res = await buildSound(dir);
  assert.equal(res.code, 0);
  const cues = JSON.parse(readFileSync(join(dir, 'out', 'cues.json'), 'utf8')).cues;
  assert.equal(cues.length, 1);
  assert.equal(cues[0].name, 'tick');
  assert.equal(cues[0].sample, 'assets/sounds/tone.wav');
  assert.equal(cues[0].profile, 'glass');
  assert.ok(!res.notes.some((n) => /W-SAMPLE-LICENSE/.test(n)), res.notes.join(' | '));
  // what plays is the sample: its 1234 Hz is the strongest peak of the mix, and it starts where the cue is (0.25 s on the 120 BPM grid)
  const mix = await decodeStereo(join(dir, 'out', 'mix.wav'), SR);
  const sp = M.spectrum(mix, SR), peaks = M.peaksOf(sp, { max: 3, floorDb: -6, minHz: 100 });
  assert.ok(peaks.some((p) => Math.abs(p.f / 1234 - 1) < 0.02), JSON.stringify(peaks));
  let peak = 0;
  for (const x of mix[0]) peak = Math.max(peak, Math.abs(x));
  const first = mix[0].findIndex((x) => Math.abs(x) > 0.1 * peak) / SR;
  assert.ok(Math.abs(first - 0.25) < 0.02, `the sample starts at ${first} s`);
});

test('mm sound says so when a sample has no record', async () => {
  const dir = await piece('sample-mix-bare', { record: null });
  const res = await buildSound(dir);
  assert.ok(res.notes.some((n) => /tone\.wav.*no record tone\.json.*W-SAMPLE-LICENSE/.test(n)), res.notes.join(' | '));
});

test('mm sound stops, naming the file, when a mapped sample is not there', async () => {
  const dir = await piece('sample-mix-gone', { mapped: { tick: 'assets/sounds/missing.wav' } });
  await assert.rejects(buildSound(dir), /missing\.wav.*does not exist/);
});

test('through the composer: both rules are found by name, W-SAMPLE-LICENSE reads the files and W-PALETTE measures the sample', async () => {
  const rulesDir = mkdtempSync(join(tmpdir(), 'mm-sample-rules-'));
  for (const id of ['W-SAMPLE-LICENSE', 'W-PALETTE']) symlinkSync(join(ROOT, 'scripts/check', `${id}.mjs`), join(rulesDir, `${id}.mjs`));
  const only = ['W-SAMPLE-LICENSE', 'W-PALETTE'];
  const rows = (r) => Object.fromEntries(r.rules.map((x) => [x.id, x]));
  const good = rows(await runCheck(await piece('sample-composer', { style: { sound: { profile: 'glass' } } }), { rulesDir, only }));
  assert.equal(good['W-SAMPLE-LICENSE'].status, 'PASS');
  assert.equal(good['W-PALETTE'].evidence.profile, 'glass');
  assert.equal(good['W-PALETTE'].evidence.readings[0].kind, 'sample');
  const bare = rows(await runCheck(await piece('sample-composer-bare', { record: null, style: { sound: { profile: 'glass' } } }), { rulesDir, only }));
  assert.equal(bare['W-SAMPLE-LICENSE'].status, 'WARN');
  for (const x of [...Object.values(good), ...Object.values(bare)]) assert.ok(!x.evidence.crash, JSON.stringify(x.evidence));
});
