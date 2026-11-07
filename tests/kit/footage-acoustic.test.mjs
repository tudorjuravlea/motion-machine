// The sound under `mm footage review`, without a video: stretches of speech, noise and silence told
// apart by energy against a gate clamped to the clip's speech level and by spectral flatness; a clip
// classed silent, noise or speech; dead air proposed only where the transcript has no word and the
// sound is not speech (0.5 s at least, 0.15 s of padding).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse, deadAirIn, nonSpeechIn, spectralFlatness, gateFor, GATE_MIN_DB, GATE_MAX_DB, DEAD_AIR_PAD_S } from '../../scripts/lib/footage-acoustic.mjs';
import { review } from '../../scripts/lib/footage-review.mjs';
import { synthesize, RATE } from '../../evals/footage-cuts/synth.mjs';

const W = (...rows) => rows.map(([text, start, dur = 0.3]) => ({ text, start, end: Math.round((start + dur) * 1000) / 1000 }));
const kinds = (a, from, to) => nonSpeechIn(a.stretches, from, to);

test('the gate follows the speech level and stays between -40 and -22 dBFS', () => {
  assert.equal(gateFor(-25), GATE_MIN_DB, 'a speech level of -25: 20 dB under is the floor of the clamp');
  assert.equal(gateFor(-60), GATE_MIN_DB, 'a very quiet clip does not drag the gate down into the room');
  assert.equal(gateFor(-2), GATE_MAX_DB, 'a very hot clip does not push the gate above -22');
  assert.ok(gateFor(-10) > GATE_MIN_DB && gateFor(-10) < GATE_MAX_DB);
});

test('spectral flatness: a voiced sound is far from flat, noise is near it, brown noise too', () => {
  const tone = synthesize({ duration: 1, words: W(['aa', 0, 1]) });
  const white = synthesize({ duration: 1, words: [], sound: { room: -30 } });
  const brown = synthesize({ duration: 1, words: [], sound: { room: -90, extra: [{ kind: 'noise', colour: 'brown', from: 0, to: 1, db: -30 }] } });
  const at = (x) => spectralFlatness(x.subarray(4000, 4000 + 512));
  assert.ok(at(tone) < 0.1, `voiced ${at(tone)}`);
  assert.ok(at(white) > 0.3, `white ${at(white)}`);
  assert.ok(at(brown) > 0.15, `brown ${at(brown)}: a rumble is still noise, not a voice`);
});

const SPEC = {
  duration: 12,
  words: W(['alpha', 1.0, 1.5], ['beta', 3.0, 1.5], ['gamma', 9.0, 1.5]),
  sound: { extra: [{ kind: 'noise', from: 5.0, to: 6.0 }, { kind: 'voice', from: 7.0, to: 8.0 }] },
};

test('stretches: speech where the words are, noise where it is planted, silence in the rest', () => {
  const a = analyse(synthesize(SPEC), RATE);
  assert.equal(a.class, 'speech');
  const at = (t) => a.stretches.find((s) => t >= s.a && t < s.b)?.kind;
  assert.equal(at(1.5), 'speech');
  assert.equal(at(3.8), 'speech');
  assert.equal(at(0.4), 'silence');
  assert.equal(at(2.8), 'silence');
  assert.equal(at(5.5), 'noise');
  assert.equal(at(7.5), 'speech', 'a voiced sound with no word is still speech to the ear');
  assert.equal(at(8.6), 'silence');
  assert.ok(a.stretches[0].a === 0 && Math.abs(a.stretches.at(-1).b - 12) < 1e-9, 'the stretches tile the clip');
  for (let i = 1; i < a.stretches.length; i++) assert.equal(a.stretches[i].a, a.stretches[i - 1].b);
});

test('a short breath of noise inside a phrase does not split the speech', () => {
  const spec = { duration: 4, words: W(['one', 0.5, 0.8], ['two', 1.4, 0.8]), sound: { extra: [{ kind: 'noise', from: 1.3, to: 1.4, db: -40 }] } };
  const a = analyse(synthesize(spec), RATE);
  const speech = a.stretches.filter((s) => s.kind === 'speech');
  assert.equal(speech.length, 1, JSON.stringify(a.stretches));
});

test('a clip is classed silent, noise or speech', () => {
  assert.equal(analyse(synthesize({ duration: 5, words: [] }), RATE).class, 'silent');
  assert.equal(analyse(new Float32Array(RATE * 3), RATE).class, 'silent');
  assert.equal(analyse(synthesize({ duration: 5, words: [], sound: { extra: [{ kind: 'noise', from: 1, to: 4, db: -28 }] } }), RATE).class, 'noise');
  assert.equal(analyse(synthesize({ duration: 5, words: [], sound: { room: -36 } }), RATE).class, 'noise', 'a loud room tone is noise, not silence');
  assert.equal(analyse(synthesize(SPEC), RATE).class, 'speech');
  assert.equal(analyse(new Float32Array(100), RATE).class, 'silent', 'shorter than one window');
});

test('nonSpeechIn: the parts of a span the ear does not take for speech, silence and noise together', () => {
  const a = analyse(synthesize(SPEC), RATE);
  const p = kinds(a, 4.6, 7.3);
  assert.equal(p.length, 1, JSON.stringify(p));
  assert.ok(p[0].a >= 4.6 && p[0].b <= 7.05 && p[0].b > 6.9, JSON.stringify(p));
  assert.equal(p[0].sound, 'silence and noise');
  assert.deepEqual(kinds(a, 1.2, 1.8), [], 'speech all through');
  assert.equal(kinds(a, 3.2, 5.0).at(-1).sound, 'silence');
});

test('review with sound: a gap with no word is cut only where the sound is not speech', () => {
  const words = W(['alpha', 1.0, 1.5], ['beta', 3.0, 1.5], ['gamma', 9.0, 1.5]);
  const a = analyse(synthesize(SPEC), RATE);
  const r = review(words, { sound: a });
  const pauses = r.cuts.filter((c) => c.kind === 'long-pause');
  // the gap 4.5-9.0: silence to 5.0, noise 5-6, silence 6-7, a voice 7-8, silence 8-9
  const inVoice = pauses.filter((c) => c.start < 8 && c.end > 7);
  assert.deepEqual(inVoice, [], 'nothing is cut into the voiced sound');
  const noise = pauses.find((c) => c.start <= 5 && c.end >= 6 && c.end <= 7);
  assert.ok(noise, JSON.stringify(pauses));
  assert.ok(noise.start >= 4.5 + DEAD_AIR_PAD_S - 1e-9 && noise.end <= 7.01 - DEAD_AIR_PAD_S, 'padded either side');
  assert.equal(noise.sound, 'silence and noise');
  const after = pauses.find((c) => c.start > 8 && c.end < 9);
  assert.ok(after, `the silence after the voice (${JSON.stringify(pauses)})`);
  assert.equal(r.sound.class, 'speech');
  assert.ok(!('stretches' in r.sound), 'the stretches stay out of the proposal');
});

test('dead air: 0.5 s minimum of non-speech, 0.15 s padding either side', () => {
  const words = W(['one', 0.5, 0.5], ['two', 2.0, 0.5]);   // a 1.0 s gap
  const fixture = { duration: 3.5, words };
  const a = analyse(synthesize(fixture), RATE);
  const [c] = review(words, { sound: a }).cuts;
  assert.equal(c.kind, 'long-pause');
  assert.ok(c.start >= 1.0 + DEAD_AIR_PAD_S - 1e-9 && c.end <= 2.0 - DEAD_AIR_PAD_S + 1e-9, `${c.start}-${c.end}`);
  // a 0.45 s gap is below the minimum, a 0.55 s gap above it
  const short = W(['one', 0.5, 0.5], ['two', 1.45, 0.5]);
  assert.deepEqual(review(short, { sound: analyse(synthesize({ duration: 3, words: short }), RATE) }).cuts, []);
  const quiet = { stretches: [{ a: 0, b: 10, kind: 'silence' }] };
  assert.deepEqual(deadAirIn(quiet, { a: 1, b: 1.45 }), []);
  assert.equal(deadAirIn(quiet, { a: 1, b: 1.5 }).length, 1, 'exactly 0.5 s is enough');
});

test('a clip with no speech sound holds back every cut: its words cannot be trusted', () => {
  const words = W(['so', 0.5], ['so', 0.9], ['so', 1.3], ['what', 4.0], ['is', 4.4]);
  for (const fixture of [{ duration: 6, words: [] }, { duration: 6, words: [], sound: { extra: [{ kind: 'noise', from: 0.5, to: 5 }] } }]) {
    const a = analyse(synthesize(fixture), RATE);
    const r = review(words, { sound: a });
    assert.deepEqual(r.cuts, []);
    assert.match(r.sound.note, /no speech sound/);
  }
});

test('no audio at all: the pauses are judged by the words alone, as before, and the proposal says so', () => {
  const words = W(['one', 0.5, 0.5], ['two', 3.0, 0.5]);
  const r = review(words, { sound: { class: 'no-audio' } });
  assert.equal(r.cuts.filter((c) => c.kind === 'long-pause').length, 1);
  assert.equal(r.sound.class, 'no-audio');
  assert.match(r.sound.note, /no audio/);
  assert.deepEqual(review(words).cuts, r.cuts, 'the same cuts as with no sound given');
  assert.ok(!('sound' in review(words)), 'with no sound given the proposal has no sound entry');
});
