// The arithmetic of `mm footage cut`, on synthetic sample buffers (no ffmpeg): the loudness curve,
// the room floor from the quietest windows and the speech level as the mean of the windows well over
// it, quiet as floor + 40 % of the gap, pauses removed
// down to a lead and a tail of quiet, ranges snapped to whole frames without drift, words mapped to
// the output clock, the voice joined with 30 ms crossfades, and a WAV that is the same bytes every time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, HOP_S, WIN_S, MIN_GAP_DB, gainFor, keptRanges, levels, loudnessCurve, mapWords, planEdit, quantize, quietRuns, renderVoice, wav16 } from '../../scripts/lib/footage.mjs';

const RATE = 48000;
/** Speech-like tone in `spans` (seconds), seeded room noise elsewhere, `len` seconds long. */
function synth(len, spans, { room = 0.003, voice = 0.25 } = {}) {
  const n = Math.round(len * RATE), out = new Float32Array(n);
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const on = spans.some(([a, b]) => t >= a && t < b);
    out[i] = room * (2 * rnd() - 1) + (on ? voice * (0.75 + 0.25 * Math.sin(2 * Math.PI * 5 * t)) * Math.sin(2 * Math.PI * 180 * t) : 0);
  }
  return out;
}
const SPANS = [[0.4, 2.4], [3.6, 5.6], [5.9, 7.4], [9.4, 11.4]];
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

test('the curve is RMS in dBFS over 25 ms windows every 10 ms', () => {
  const x = synth(1, [[0, 1]], { room: 0 });
  const c = loudnessCurve(x, RATE);
  assert.equal(HOP_S, 0.01); assert.equal(WIN_S, 0.025);
  assert.equal(c.length, Math.floor((RATE - 0.025 * RATE) / (0.01 * RATE)) + 1);
  // a sine of amplitude A under a 0.75..1 envelope sits near 20 log10(0.25 * 0.875 / sqrt 2) ≈ -16 dB
  const mid = c[Math.floor(c.length / 2)];
  assert.ok(mid > -20 && mid < -13, `speech level ${mid}`);
});

test('the floor comes from the quietest windows, speech from the windows well over it; quiet is the floor plus 40 % of the gap', () => {
  const c = loudnessCurve(synth(12, SPANS), RATE);
  const l = levels(c);
  assert.ok(l.floorDb < -50 && l.floorDb > -60, `floor ${l.floorDb}`);
  assert.ok(l.speechDb > -20 && l.speechDb < -13, `speech ${l.speechDb}`);
  near(l.quietDb, l.floorDb + 0.4 * (l.speechDb - l.floorDb), 1e-9, 'threshold');
});

test('a recording whose speech stands less than 12 dB over a room that fills its pauses is refused, saying so', () => {
  assert.equal(MIN_GAP_DB, 12);
  const samples = synth(12, SPANS, { room: 0.1 });
  assert.throws(() => planEdit({ samples, rate: RATE, fps: 30, frames: 360 }), /speech stands only [\d.]+ dB over the room .*pauses .*12 dB/);
});

test('speech with no pause anywhere gives one clip and no cut, with a note instead of a refusal', () => {
  const e = planEdit({ samples: synth(12, [[0, 12]]), rate: RATE, fps: 30, frames: 360 });
  assert.equal(e.cuts.length, 0);
  assert.deepEqual(e.picture, [{ start: 0, from: 0, length: 360 }]);
  assert.match(e.note, /no pause longer than 0\.5 s/);
});

test('speech tightly spoken (dips, no pause over the max) is measured and left uncut', () => {
  const spans = []; for (let t = 0.3; t < 11.7; t += 0.5) spans.push([t, t + 0.35]);   // 0.15 s gaps
  const e = planEdit({ samples: synth(12, spans), rate: RATE, fps: 30, frames: 360 });
  assert.equal(e.cuts.length, 0, JSON.stringify(e.cuts));
  assert.ok(e.levels.speechDb - e.levels.floorDb >= 12, JSON.stringify(e.levels));
  assert.match(e.note, /no pause longer than 0\.5 s/);
});

test('a little speech in a long quiet take is still measured: the room from the quiet, speech from the speech', () => {
  const e = planEdit({ samples: synth(12, [[5, 5.9]]), rate: RATE, fps: 30, frames: 360 });
  assert.ok(e.levels.floorDb < -50 && e.levels.speechDb > -20, JSON.stringify(e.levels));
  assert.equal(e.picture.length, 1);
  near(e.picture[0].from / 30, 5 - DEFAULTS.lead, 1 / 30 + 0.011, 'the take starts a lead before the speech');
  near(e.duration, 0.9 + DEFAULTS.lead + DEFAULTS.tail, 2 / 30, 'and ends a tail after it');
});

test('room tone alone and digital silence are refused: there is no speech to cut by', () => {
  assert.throws(() => planEdit({ samples: synth(12, []), rate: RATE, fps: 30, frames: 360 }), /no speech/);
  assert.throws(() => planEdit({ samples: new Float32Array(12 * RATE), rate: RATE, fps: 30, frames: 360 }), /silent/);
});

test('quiet runs span the audio every window of which is under the threshold', () => {
  const c = loudnessCurve(synth(12, SPANS), RATE);
  const runs = quietRuns(c, levels(c).quietDb);
  // head, the 1.2 s pause, the 0.3 s pause, the 2.0 s pause, tail
  assert.equal(runs.length, 5, JSON.stringify(runs));
  const want = [[0, 0.4], [2.4, 3.6], [5.6, 5.9], [7.4, 9.4], [11.4, 12]];
  runs.forEach((r, i) => { near(r.a, want[i][0], 0.011, `run ${i} start`); near(r.b, want[i][1], 0.011, `run ${i} end`); });
});

test('pauses over the max are cut down to a 250 ms tail and a 100 ms lead; shorter ones stay; head and tail are trimmed', () => {
  const c = loudnessCurve(synth(12, SPANS), RATE);
  const runs = quietRuns(c, levels(c).quietDb);
  const kept = keptRanges(runs, 12, DEFAULTS);
  assert.equal(DEFAULTS.maxPause, 0.5); assert.equal(DEFAULTS.lead, 0.1); assert.equal(DEFAULTS.tail, 0.25);
  const want = [[0.3, 2.65], [3.5, 7.65], [9.3, 11.65]];
  assert.equal(kept.length, 3, JSON.stringify(kept));
  kept.forEach((r, i) => { near(r.s, want[i][0], 0.011, `range ${i} start`); near(r.e, want[i][1], 0.011, `range ${i} end`); });
  const longer = keptRanges(runs, 12, { ...DEFAULTS, maxPause: 1.5 });
  assert.equal(longer.length, 2, 'a 1.2 s pause stays under a 1.5 s max');
});

test('a word over a pause keeps that pause whole', () => {
  const c = loudnessCurve(synth(12, SPANS), RATE);
  const runs = quietRuns(c, levels(c).quietDb);
  const kept = keptRanges(runs, 12, { ...DEFAULTS, words: [{ text: 'soft', start: 8.0, end: 8.4 }] });
  assert.equal(kept.length, 2);
  near(kept[1].s, 3.5, 0.011, 'the 2.0 s pause is kept inside the second range');
});

test('with fillers, a long gap between transcribed words is cut even where a sound no word covers fills it', () => {
  // speech in the planted spans, and an unworded sound (an "um") in the middle of the 2.0 s pause
  const c = loudnessCurve(synth(12, [...SPANS, [8.2, 8.6]]), RATE);
  const runs = quietRuns(c, levels(c).quietDb);
  const words = [{ text: 'one', start: 0.4, end: 2.4 }, { text: 'two', start: 3.6, end: 5.6 }, { text: 'three', start: 5.9, end: 7.4 }, { text: 'four', start: 9.4, end: 11.4 }];
  const plain = keptRanges(runs, 12, { ...DEFAULTS, words });
  assert.ok(plain.some((r) => r.s <= 8.2 && r.e >= 8.6), `without fillers the sound is kept: ${JSON.stringify(plain)}`);
  const cut = keptRanges(runs, 12, { ...DEFAULTS, words, fillers: true });
  assert.ok(!cut.some((r) => r.e > 7.65 + 0.011 && r.s < 9.3 - 0.011), `with fillers nothing of the gap survives but its tail and lead: ${JSON.stringify(cut)}`);
  const want = [[0.3, 2.65], [3.5, 7.65], [9.3, 11.65]];
  assert.equal(cut.length, 3, JSON.stringify(cut));
  cut.forEach((r, i) => { near(r.s, want[i][0], 0.011, `range ${i} start`); near(r.e, want[i][1], 0.011, `range ${i} end`); });
  assert.deepEqual(keptRanges(runs, 12, { ...DEFAULTS, words: [], fillers: true }), keptRanges(runs, 12, { ...DEFAULTS, words: [] }), 'no words: fillers changes nothing');
});

test('with fillers, a sound before the first word and after the last is trimmed like the quiet around them', () => {
  // a breath at 0.6 s, the first word at 1.2 s; a click at 11.0 s after the last word ends at 10.4 s
  const c = loudnessCurve(synth(12, [[0.6, 0.8], [1.2, 5], [6, 10.4], [11, 11.2]]), RATE);
  const runs = quietRuns(c, levels(c).quietDb);
  const words = [{ text: 'one', start: 1.2, end: 5 }, { text: 'two', start: 6, end: 10.4 }];
  const plain = keptRanges(runs, 12, { ...DEFAULTS, words });
  assert.ok(plain[0].s < 0.6 && plain.at(-1).e > 11.2, `without fillers the breath and the click stay: ${JSON.stringify(plain)}`);
  const cut = keptRanges(runs, 12, { ...DEFAULTS, words, fillers: true });
  near(cut[0].s, 1.1, 0.001, 'the edit opens a lead before the first word');
  near(cut.at(-1).e, 10.65, 0.001, 'and closes a tail after the last');
});

test('with fillers, a quiet run that reaches into a word does not stop the gap after that word from being cut', () => {
  // the transcriber's word starts a little before the loudness rises: the quiet run overlaps it
  const runs = [{ a: 0, b: 0.3, head: true, tail: false }, { a: 2.3, b: 2.9, head: false, tail: false }, { a: 11.6, b: 12, head: false, tail: true }];
  const words = [{ text: 'one', start: 0.4, end: 2.4 }, { text: 'two', start: 2.5, end: 2.6 }, { text: 'three', start: 4, end: 11.5 }];
  const kept = keptRanges(runs, 12, { ...DEFAULTS, words, fillers: true });
  assert.equal(kept.length, 2, JSON.stringify(kept));
  near(kept[0].e, 2.85, 0.001, 'cut out a tail after the word');
  near(kept[1].s, 3.9, 0.001, 'cut in a lead before the next word');
});

test('ranges snap to whole frames and the total stays within half a frame of the exact sum', () => {
  for (const fps of [24, 25, 30, 60]) {
    const ranges = [{ s: 0.28, e: 2.6 }, { s: 3.48, e: 7.6 }, { s: 9.28, e: 11.6 }];
    const pic = quantize(ranges, fps, Math.floor(12 * fps));
    const exact = ranges.reduce((n, r) => n + r.e - r.s, 0) * fps;
    const total = pic.reduce((n, c) => n + c.length, 0);
    assert.ok(Math.abs(total - exact) <= 0.5, `${fps} fps: ${total} vs ${exact}`);
    pic.forEach((c, i) => {
      assert.ok(Number.isInteger(c.start) && Number.isInteger(c.from) && Number.isInteger(c.length));
      assert.equal(c.start, i ? pic[i - 1].start + pic[i - 1].length : 0, 'clips butt end to end');
      assert.ok(Math.abs(c.from / fps - ranges[i].s) <= 0.5 / fps + 1e-9, 'a cut-in moves at most half a frame');
      assert.ok(Math.abs((c.from + c.length) / fps - ranges[i].e) <= 1.5 / fps + 1e-9, 'a cut-out moves at most a frame and a half');
    });
  }
});

test('words land on the output clock; words in a removed pause are dropped; an end never passes its clip', () => {
  const pic = [{ start: 0, from: 8, length: 70 }, { start: 70, from: 104, length: 124 }];
  const out = mapWords([{ text: 'a', start: 0.4, end: 0.7 }, { text: 'gone', start: 3.0, end: 3.2 }, { text: 'b', start: 3.6, end: 3.9 }, { text: 'c', start: 2.5, end: 2.9 }], pic, 30);
  assert.deepEqual(out.map((w) => w.text), ['a', 'c', 'b']);
  near(out[0].at, 0.4 - 8 / 30, 1e-3, 'a');
  near(out[2].at, 70 / 30 + 3.6 - 104 / 30, 1e-3, 'b');
  assert.ok(out[1].end <= 70 / 30 + 1e-9, 'c ends where its clip does');
});

test('the voice is exactly as long as the picture and crossfades 30 ms at each join', () => {
  const src = new Float32Array(12 * RATE);
  for (let i = 0; i < src.length; i++) src[i] = (i % 1000) / 1000;   // a ramp: every sample says where it came from
  const pic = [{ start: 0, from: 8, length: 70 }, { start: 70, from: 104, length: 124 }];
  const v = renderVoice(src, pic, 30, { rate: RATE, join: DEFAULTS.join });
  assert.equal(v.length, (194 * RATE) / 30);
  const J = (70 * RATE) / 30, half = Math.round(0.015 * RATE);
  assert.equal(v[100], src[(8 * RATE) / 30 + 100], 'inside a clip the source plays unchanged');
  assert.equal(v[J + half + 10], src[(104 * RATE) / 30 + half + 10], 'past the fade, the next clip plays unchanged');
  const x = 0.5, a = src[(8 * RATE) / 30 + J], b = src[(104 * RATE) / 30];
  near(v[J], a * Math.cos((Math.PI * x) / 2) + b * Math.sin((Math.PI * x) / 2), 1e-6, 'equal-power mix at the join');
});

test('the voice gain reaches the target loudness, held under a -1 dBFS sample peak', () => {
  assert.deepEqual(gainFor({ lufs: -20, peakDb: -12 }, -14), { gainDb: 6, peakLimited: false });
  assert.deepEqual(gainFor({ lufs: -20, peakDb: -4 }, -14), { gainDb: 3, peakLimited: true });
  assert.deepEqual(gainFor({ lufs: -60, peakDb: -40 }, -14), { gainDb: 20, peakLimited: false }, 'clamped to 20 dB');
});

test('the WAV is mono 16-bit at 48 kHz and the same bytes for the same samples', () => {
  const s = new Float32Array([0, 0.5, -0.5, 1.2, -1.2]);
  const a = wav16(s, RATE), b = wav16(Float32Array.from(s), RATE);
  assert.ok(a.equals(b));
  assert.equal(a.toString('latin1', 0, 4), 'RIFF'); assert.equal(a.readUInt16LE(22), 1); assert.equal(a.readUInt32LE(24), RATE); assert.equal(a.readUInt16LE(34), 16);
  assert.equal(a.readUInt32LE(40), 10);
  assert.deepEqual([...Array(5)].map((_, i) => a.readInt16LE(44 + 2 * i)), [0, 16384, -16384, 32767, -32767]);
});

test('planEdit puts it together: picture, cuts in quiet, mapped words', () => {
  const e = planEdit({ samples: synth(12, SPANS), rate: RATE, fps: 30, frames: 360, words: [{ text: 'every', start: 0.4, end: 0.76 }] });
  const total = e.picture.reduce((n, c) => n + c.length, 0);
  assert.ok(Math.abs(total - 8.85 * 30) <= 1, `total ${total}`);
  assert.equal(e.frames, total);
  assert.equal(e.cuts.length, 2);
  assert.deepEqual(e.onSound, []);
  near(e.words[0].at, 0.1, 1 / 30 + 0.011, 'the first word, 100 ms after the start');
});
