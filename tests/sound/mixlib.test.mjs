// The mix's pure parts (SPEC §9): the stop-down curve, voice-safe ducking, tonal fit to the music's key and the level
// model's traps. Arrays in, arrays out: nothing here renders or runs ffmpeg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DUCK_PRESETS, STOP_DOWN, duckCurve, stopDownCurve, speechSpansFromWords, speechSpansFromAudio,
  chromaOf, tonalCentre, pitchOfCue, fitShift, shiftPitch, aloneOverBedDb, bedIsSilent, monoAsDual, NO_BED_LUFS,
} from '../../scripts/lib/sound-mix.mjs';
import { ungatedLufs } from '../../scripts/lib/audio-measure.mjs';

const SR = 48000;
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const db = (g) => 20 * Math.log10(g);
const tone = (hz, seconds, amp = 0.3) => Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
const noise = (seconds, amp, seed = 3) => { const r = mulberry(seed); return Float32Array.from({ length: Math.round(seconds * SR) }, () => (r() - 0.5) * 2 * amp); };

test('the duck presets: light about -4 dB, normal -9, deep -14, fast attack, release 160-240 ms', () => {
  assert.deepEqual(Object.keys(DUCK_PRESETS), ['light', 'normal', 'deep']);
  assert.deepEqual([DUCK_PRESETS.light.db, DUCK_PRESETS.normal.db, DUCK_PRESETS.deep.db], [-4, -9, -14]);
  for (const p of Object.values(DUCK_PRESETS)) { assert.ok(p.attackMs <= 10); assert.ok(p.releaseMs >= 160 && p.releaseMs <= 240); }
});

test('duckCurve: gain is unity outside speech, the preset depth inside it, back to unity after the release', () => {
  const n = 5 * SR;
  for (const [name, p] of Object.entries(DUCK_PRESETS)) {
    const g = duckCurve(n, SR, [{ from: 1, to: 3 }], p);
    const at = (t) => db(g[Math.round(t * SR)]);
    assert.ok(Math.abs(at(0.5)) < 0.01, `${name} before: ${at(0.5)}`);
    assert.ok(Math.abs(at(2) - p.db) < 0.3, `${name} inside: ${at(2)} against ${p.db}`);
    assert.ok(at(1.05) < p.db * 0.85, `${name}: fast attack, ${at(1.05)} dB 50 ms in`);
    assert.ok(at(4.5) > -0.2, `${name} after: ${at(4.5)}`);
  }
});

test('stopDownCurve: the bed sits at -9 dB for 0.4 s before the hit and is back on it', () => {
  const g = stopDownCurve(6 * SR, SR, [3], STOP_DOWN);
  const at = (t) => db(g[Math.round(t * SR)]);
  assert.deepEqual([STOP_DOWN.db, STOP_DOWN.lengthS], [9, 0.4]);
  assert.ok(Math.abs(at(2.5)) < 0.01);
  assert.ok(Math.abs(at(2.8) + 9) < 0.3, `mid dip ${at(2.8)}`);
  assert.ok(at(3.15) > -1, `on the hit's decay ${at(3.15)}`);
  assert.ok(Math.abs(at(4)) < 0.01);
  // brand knobs
  const deep = stopDownCurve(6 * SR, SR, [3], { ...STOP_DOWN, db: 12, lengthS: 0.5 });
  assert.ok(Math.abs(db(deep[Math.round(2.75 * SR)]) + 12) < 0.3);
  assert.ok(Math.abs(db(deep[Math.round(2.45 * SR)])) < 0.01, 'the dip starts 0.5 s before the hit');
});

test('speechSpansFromWords: words close together are one span, a pause longer than 0.25 s ends it', () => {
  const spans = speechSpansFromWords([{ start: 1, end: 1.4 }, { start: 1.5, end: 2 }, { start: 3, end: 3.4 }]);
  assert.deepEqual(spans, [{ from: 1, to: 2 }, { from: 3, to: 3.4 }]);
});

test('speechSpansFromAudio: voice-band bursts over a quiet floor are speech; a low hum and a quiet floor are not', () => {
  const x = noise(5, 0.0005, 1);
  const r = mulberry(9);
  // "speech": 300-3000 Hz partials with a 4 Hz syllable swing, 1.0 to 2.0 s and 3.2 to 3.6 s
  const say = (a, b) => { for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) { const t = i / SR; x[i] += 0.1 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)) * (Math.sin(2 * Math.PI * 500 * t) + 0.7 * Math.sin(2 * Math.PI * 1500 * t) + 0.3 * Math.sin(2 * Math.PI * 2500 * t) + (r() - 0.5) * 0.2); } };
  say(1, 2); say(3.2, 3.6);
  for (let i = 0; i < x.length; i++) x[i] += 0.1 * Math.sin((2 * Math.PI * 60 * i) / SR);
  const spans = speechSpansFromAudio([x], SR);
  assert.equal(spans.length, 2, JSON.stringify(spans));
  assert.ok(Math.abs(spans[0].from - 1) < 0.12 && Math.abs(spans[0].to - 2) < 0.15, JSON.stringify(spans[0]));
  assert.ok(Math.abs(spans[1].from - 3.2) < 0.12 && Math.abs(spans[1].to - 3.6) < 0.15, JSON.stringify(spans[1]));
  assert.deepEqual(speechSpansFromAudio([noise(3, 0.0005)], SR), [], 'a quiet floor is not speech');
  assert.deepEqual(speechSpansFromAudio([tone(60, 3, 0.3)], SR), [], 'a hum is not speech');
});

test('tonal fit: the music\'s key from its chroma, the cue\'s pitch, and the shift (at most 2 semitones) that puts one on the other', () => {
  const music = tone(440, 3);                                  // an A
  const chroma = chromaOf(music, SR);
  assert.equal(chroma.indexOf(Math.max(...chroma)), 9, 'A is pitch class 9');
  assert.ok(tonalCentre(chroma) >= 1.6, `centre ${tonalCentre(chroma)}`);
  const cue = [tone(466.16, 0.5)];                             // B flat 4, a semitone above
  const p = pitchOfCue(cue, SR);
  assert.equal(p.tonal, true);
  assert.ok(Math.abs(p.hz - 466.16) < 2, `pitch ${p.hz}`);
  const fit = fitShift(p.hz, chroma, 2);
  assert.ok(Math.abs(fit.semitones + 1) < 0.05, `shift ${fit.semitones}`);
  const moved = pitchOfCue(shiftPitch(cue, fit.semitones), SR);
  assert.ok(Math.abs(1200 * Math.log2(moved.hz / 440)) < 8, `moved to ${moved.hz} Hz`);
  // a cue three semitones away is out of reach of a ±2 fit when nothing else in range is in the music
  assert.equal(fitShift(440 * 2 ** (4 / 12), chroma, 2), null);
});

test('tonal fit is skipped for a music with no tonal centre (noise) and for a cue that is noise', () => {
  assert.ok(tonalCentre(chromaOf(noise(3, 0.2), SR)) < 1.6);
  assert.equal(pitchOfCue([noise(0.3, 0.3)], SR).tonal, false);
  assert.ok(tonalCentre(chromaOf(new Float32Array(SR), SR)) < 1.6, 'silence has no centre either');
});

test('level traps: a cue alone sits at bed + 10 log10(10^(x/10) - 1) when cue and bed together are x dB over the bed', () => {
  assert.ok(Math.abs(aloneOverBedDb(8) - 7.25) < 0.01, `${aloneOverBedDb(8)}`);
  assert.ok(Math.abs(aloneOverBedDb(3.0103) - 0) < 0.01, 'equal power adds 3 dB');
  assert.throws(() => aloneOverBedDb(0.2), /0\.5/);
  assert.throws(() => aloneOverBedDb(31), /30/);
});

test('level traps: a bed under -60 LUFS in the second before the cue is no bed', () => {
  assert.equal(NO_BED_LUFS, -60);
  const quiet = [tone(220, 3, 0.00001), tone(220, 3, 0.00001)];
  const loud = [tone(220, 3, 0.05), tone(220, 3, 0.05)];
  assert.equal(bedIsSilent(quiet, SR, 1.5), true);
  assert.equal(bedIsSilent(loud, SR, 1.5), false);
  assert.equal(bedIsSilent([new Float32Array(3 * SR), new Float32Array(3 * SR)], SR, 1.5), true, 'digital silence reads -inf, not -240');
});

test('level traps: a mono sound is measured as dual mono, so it does not land 3 dB hot after the upmix', () => {
  const m = tone(1000, 1, 0.1);
  const dual = ungatedLufs(monoAsDual([m]), SR), asStereo = ungatedLufs([m, m], SR), single = ungatedLufs([m], SR);
  assert.equal(dual, asStereo);
  assert.ok(Math.abs(dual - single - 3.01) < 0.05, `a lone channel reads ${single}, dual mono ${dual}`);
  assert.equal(monoAsDual([m, m]).length, 2);
});
