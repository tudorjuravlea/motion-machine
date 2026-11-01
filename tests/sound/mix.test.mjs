// The mix of `mm sound` (SPEC §9), measured on the stems it writes: the stop-down dips the bed before a hit and returns on it, a voice
// track makes the bed and the cues duck under speech, a tonal cue moves onto the music's key and a noise bed leaves it alone, a cue with
// no bed before it falls back to the profile's level, and cue-over-bed is the level model of Earshot (cue alone = bed + 10 log10(10^(x/10) - 1)).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT, ROOT, ctxFor, ensurePiece, variant } from '../../fixtures/sound/setup.mjs';
import { buildSound } from '../../scripts/sound.mjs';
import { decodeStereo } from '../../scripts/lib/audio-decode.mjs';
import { loudest100ms, ungatedLufs } from '../../scripts/lib/audio-measure.mjs';
import { aloneOverBedDb, chromaOf, fitShift, pitchOfCue } from '../../scripts/lib/sound-mix.mjs';
import wMix from '../../scripts/check/W-MIX.mjs';
import wAudible from '../../scripts/check/W-AUDIBLE.mjs';

const SR = 48000;
const LIB = join(ROOT, 'patterns');
before(async () => { await ensurePiece(); });

const wavOf = (x) => {                                     // mono float32 WAV
  const b = Buffer.alloc(44 + x.length * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(32, 34); b.write('data', 36); b.writeUInt32LE(x.length * 4, 40);
  x.forEach((v, i) => b.writeFloatLE(v, 44 + i * 4));
  return b;
};
const write = (name, x) => { mkdirSync(OUT, { recursive: true }); const f = join(OUT, name); writeFileSync(f, wavOf(x)); return f; };
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rms = (x, a, b) => { let s = 0; const i0 = Math.round(a * SR), i1 = Math.round(b * SR); for (let i = i0; i < i1; i++) s += x[i] * x[i]; return Math.sqrt(s / (i1 - i0)); };
const peak = (x, a, b) => { let m = 0; for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) m = Math.max(m, Math.abs(x[i])); return m; };
const db = (v) => 20 * Math.log10(v);
const stem = async (dir, name) => (await decodeStereo(join(dir, 'out', 'stems', `${name}.wav`), SR));
const quiet = { cuesPer10s: [0, 12] };

async function build(name, o) {
  const dir = await variant(name, { ...o, style: { sound: { ...quiet, ...(o.style?.sound ?? {}) } } });
  await buildSound(dir, { patterns: LIB });
  return dir;
}

test('stop-down: the bed sits 9 dB down for 0.4 s before a hit and is back on it; off, or with other knobs, it follows the brand', async () => {
  const cues = ['bed', 'hit', null, null], track = null, beats = null;
  const on = await build('stop-on', { cues, track, beats });
  const off = await build('stop-off', { cues, track, beats, style: { sound: { stopDown: false } } });
  const deep = await build('stop-deep', { cues, track, beats, style: { sound: { stopDown: { db: 12, lengthS: 0.5 } } } });
  const [a] = await stem(on, 'bed'), [b] = await stem(off, 'bed'), [c] = await stem(deep, 'bed');
  const ratio = (x, y, t0, t1) => db(rms(x, t0, t1) / rms(y, t0, t1));
  assert.ok(Math.abs(ratio(a, b, 1.0, 1.2) + 9) <= 0.8, `inside the dip: ${ratio(a, b, 1.0, 1.2)} dB`);
  assert.ok(Math.abs(ratio(a, b, 0.4, 0.7)) <= 0.05, 'before the dip the bed is untouched');
  assert.ok(Math.abs(ratio(a, b, 1.4, 1.9)) <= 0.8 && ratio(a, b, 1.4, 1.9) > -0.8, `after the hit the bed is back: ${ratio(a, b, 1.4, 1.9)} dB`);
  assert.ok(Math.abs(ratio(c, b, 0.85, 1.15) + 12) <= 0.8, `deeper: ${ratio(c, b, 0.85, 1.15)} dB`);
  assert.ok(Math.abs(ratio(c, b, 0.55, 0.7)) <= 0.05, 'longer: it starts at 0.5 s before the hit, not earlier');
  const j = JSON.parse(readFileSync(join(on, 'out', 'cues.json'), 'utf8'));
  assert.equal(j.mix.stopDown.db, -9);
});

test('ducking: a voice track with words makes the bed and the cues sit 9 dB down under speech, and come back after the release', async () => {
  const r = mulberry(11), voice = new Float32Array(6 * SR);
  for (let i = Math.round(1 * SR); i < Math.round(2 * SR); i++) { const t = i / SR; voice[i] = 0.2 * (Math.sin(2 * Math.PI * 500 * t) + 0.6 * Math.sin(2 * Math.PI * 1500 * t) + (r() - 0.5) * 0.2); }
  const file = write('duck-voice.wav', voice);
  writeFileSync(join(OUT, 'duck-voice.words.json'), JSON.stringify([{ text: 'hello', start: 1, end: 1.5 }, { text: 'there', start: 1.55, end: 2 }]));
  const cues = ['bed', 'tick', null, null];
  const plain = await build('duck-on', { cues, track: file, beats: null });
  const off = await build('duck-off', { cues, track: file, beats: null, style: { sound: { duck: 'off', stopDown: false } } });
  const noStop = await build('duck-only', { cues, track: file, beats: null, style: { sound: { stopDown: false } } });
  const [bedOn] = await stem(noStop, 'bed'), [bedOff] = await stem(off, 'bed');
  const ratio = (x, y, t0, t1) => db(rms(x, t0, t1) / rms(y, t0, t1));
  assert.ok(Math.abs(ratio(bedOn, bedOff, 1.3, 1.9) + 9) <= 1, `bed under speech: ${ratio(bedOn, bedOff, 1.3, 1.9)} dB`);
  assert.ok(Math.abs(ratio(bedOn, bedOff, 0.4, 0.9)) <= 0.05, 'bed before speech is untouched');
  assert.ok(Math.abs(ratio(bedOn, bedOff, 3, 3.5)) <= 0.1, 'bed after the release is back');
  const [cueOn] = await stem(noStop, 'cues'), [cueOff] = await stem(off, 'cues');
  assert.ok(Math.abs(db(peak(cueOn, 1.2, 1.5) / peak(cueOff, 1.2, 1.5)) + 9) <= 1.5, `cue under speech: ${db(peak(cueOn, 1.2, 1.5) / peak(cueOff, 1.2, 1.5))} dB`);
  const j = JSON.parse(readFileSync(join(noStop, 'out', 'cues.json'), 'utf8'));
  assert.deepEqual([j.mix.duck.name, j.mix.duck.db, j.mix.duck.speech], ['normal', -9, 'words']);
  const tick = j.cues.find((c) => c.name === 'tick');
  assert.equal(tick.audible.overSpeech, true); assert.equal(tick.audible.ducked, true);
  // W-AUDIBLE: over speech with ducking off warns; with ducking on it does not
  const bad = await wAudible(await ctxFor(off, { patternsBase: LIB }));
  assert.equal(bad.status, 'WARN'); assert.match(bad.evidence.reason, /speech/);
  assert.notEqual((await wAudible(await ctxFor(plain, { patternsBase: LIB }))).evidence.kinds?.includes('speech'), true);
  // the voice track itself is used unchanged
  const inMix = JSON.parse(readFileSync(join(plain, 'out', 'cues.json'), 'utf8')).mix.duck.voice;
  assert.match(inMix, /duck-voice\.wav$/);
});

test('tonal fit: a tonal cue moves onto the music\'s note, up to 2 semitones; a noise bed has no tonal centre and the cue stays', async () => {
  const profile = { profile: 'glass' }, cues = [null, 'ready', null, null];
  const plain = await build('tonal-base', { cues, track: null, beats: null, style: { sound: profile } });
  const cueAt = async (dir) => { const [l, r] = await stem(dir, 'cues'); return pitchOfCue([l.subarray(Math.round(1.2 * SR), Math.round(2.6 * SR)), r.subarray(Math.round(1.2 * SR), Math.round(2.6 * SR))], SR); };
  const base = await cueAt(plain);
  assert.equal(base.tonal, true, 'the ready cue is a tone');
  const note = base.hz * 2 ** (1 / 12);                                // the music rests a semitone above the cue
  const music = Float32Array.from({ length: 6 * SR }, (_, i) => 0.2 * Math.sin((2 * Math.PI * note * i) / SR));
  const track = write('tonal-music.wav', music);
  const fit = fitShift(base.hz, chromaOf(music, SR), 2);
  assert.ok(Math.abs(fit.semitones) > 0.5 && Math.abs(fit.semitones) <= 2);
  const fitted = await build('tonal-fit', { cues, track, beats: null, style: { sound: { ...profile, tonalFit: true } } });
  const rec = JSON.parse(readFileSync(join(fitted, 'out', 'cues.json'), 'utf8')).cues[0].tonalFit;
  assert.ok(Math.abs(rec.semitones - fit.semitones) <= 0.05, `recorded ${rec.semitones}, expected ${fit.semitones}`);
  const moved = await cueAt(fitted);
  assert.ok(Math.abs(1200 * Math.log2(moved.hz / fit.toHz)) <= 12, `the cue now sounds at ${moved.hz} Hz, the music's note is ${fit.toHz} Hz`);
  // off by default: the same music, no tonalFit, no change
  const unfitted = await build('tonal-off', { cues, track, beats: null, style: { sound: profile } });
  assert.ok(Math.abs(1200 * Math.log2((await cueAt(unfitted)).hz / base.hz)) <= 5);
  assert.equal(JSON.parse(readFileSync(join(unfitted, 'out', 'cues.json'), 'utf8')).cues[0].tonalFit, undefined);
  // a noise bed: skipped, and the cue keeps its pitch
  const r = mulberry(2);
  const noise = write('tonal-noise.wav', Float32Array.from({ length: 6 * SR }, () => (r() - 0.5) * 0.4));
  const skipped = await build('tonal-noise', { cues, track: noise, beats: null, style: { sound: { ...profile, tonalFit: true } } });
  assert.match(JSON.parse(readFileSync(join(skipped, 'out', 'cues.json'), 'utf8')).cues[0].tonalFit.skipped, /no tonal centre/);
  assert.ok(Math.abs(1200 * Math.log2((await cueAt(skipped)).hz / base.hz)) <= 5);
});

test('a cue with no bed in the second before it falls back to the profile\'s fixed level, and W-MIX does not hold it to the bed', async () => {
  const dir = await build('bed-fallback', { cues: ['bed', 'hit', 'tick', 'tick'], track: null, beats: null, style: { sound: { palette: 'soft-ui' } }, edit: (s) => { s.scenes[1].beats[1].at = 2.5; } });
  const cues = JSON.parse(readFileSync(join(dir, 'out', 'cues.json'), 'utf8')).cues;
  const late = cues.find((c) => c.name === 'tick' && c.at > 5);
  assert.equal(late.bedFallback, true, JSON.stringify(late));
  assert.equal(cues.find((c) => c.name === 'hit').bedFallback, undefined);
  const w = await wMix(await ctxFor(dir, { patternsBase: LIB }));
  assert.ok(!(w.evidence.kinds ?? []).includes('peak'), JSON.stringify(w.evidence));
});

test('cueOverBedDb: cue and bed together x dB over the bed puts the cue alone at bed + 10 log10(10^(x/10) - 1); outside 0.5-30 it is refused', async () => {
  const dir = await build('over-bed', { cues: ['bed', 'hit', null, null], track: null, beats: null, style: { sound: { cueOverBedDb: 8, stopDown: false } } });
  const [bl, br] = await stem(dir, 'bed'), [cl, cr] = await stem(dir, 'cues');
  const t = 1.25, win = (a) => [a.subarray(Math.round((t - 1) * SR), Math.round(t * SR))];
  const bedL = ungatedLufs([win(bl)[0], win(br)[0]], SR);
  const cueL = loudest100ms([cl.subarray(Math.round(1.2 * SR), Math.round(1.9 * SR)), cr.subarray(Math.round(1.2 * SR), Math.round(1.9 * SR))], SR);
  assert.ok(Math.abs(cueL - bedL - aloneOverBedDb(8)) <= 0.7, `cue ${cueL.toFixed(2)} LUFS over bed ${bedL.toFixed(2)} LUFS: ${(cueL - bedL).toFixed(2)} dB, expected ${aloneOverBedDb(8).toFixed(2)}`);
  await assert.rejects(() => build('over-bed-bad', { cues: ['bed', 'hit', null, null], track: null, beats: null, style: { sound: { cueOverBedDb: 40 } } }), /0\.5 to 30/);
});

test('the shipped palette: over a music track no cue is masked or silent; cues alone, as the demo films have them, pass W-AUDIBLE', async () => {
  const dir = await build('audible-demo', { cues: ['tick', 'hit', 'tick', 'tick'] });
  const w = await wAudible(await ctxFor(dir, { patternsBase: LIB }));
  assert.ok(!(w.evidence.kinds ?? []).some((k) => k !== 'harsh'), JSON.stringify(w.evidence));   // a bright tick over a pad with almost no 2-6 kHz is far over the music's presence: harsh is the rule doing its job
  const cues = JSON.parse(readFileSync(join(dir, 'out', 'cues.json'), 'utf8')).cues;
  for (const c of cues) assert.ok(['clear', 'ok', 'barely'].includes(c.audible.verdict), `${c.name}: ${JSON.stringify(c.audible)}`);
  // cues alone, as the shipped demo films have them (no track, no bed, no voice): nothing sounds with them, so only silence and presence are judged
  const alone = await build('audible-alone', { cues: ['tick', 'hit', 'tick', 'tick'], track: null, beats: null });
  const d = await wAudible(await ctxFor(alone, { patternsBase: LIB }));
  assert.equal(d.status, 'PASS', JSON.stringify(d.evidence));
  assert.equal(d.evidence.notJudged, d.evidence.measured);
});
