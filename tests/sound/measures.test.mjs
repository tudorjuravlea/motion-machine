// The new measures of scripts/lib/audio-measure.mjs (ported in idea from a model-free sound forge): the 28-band
// third-octave profile, the third-octave x 10 ms bandgram, and the bed-subtracted measurement of an event that sits on
// music (bed, masked bands, exposure over the bed, decay shape, stutter). Every sound here is built from numbers, so
// what each measure must say is known.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../scripts/lib/audio-measure.mjs';

const SR = 48000;
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; }; };
const mono = (x) => [x, Float32Array.from(x)];
const sine = (f, s, amp = 0.5) => Float32Array.from({ length: Math.round(s * SR) }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / SR));
const bandOf = (hz) => M.THIRD_OCTAVE_HZ.reduce((b, c, i) => (Math.abs(Math.log(c / hz)) < Math.abs(Math.log(M.THIRD_OCTAVE_HZ[b] / hz)) ? i : b), 0);
const argmax = (a) => a.reduce((b, v, i) => (v > a[b] ? i : b), 0);

test('28 third-octave bands from 31.5 Hz to 16 kHz', () => {
  assert.equal(M.THIRD_OCTAVE_HZ.length, 28);
  assert.ok(Math.abs(M.THIRD_OCTAVE_HZ[0] - 31.5) < 0.5 && Math.abs(M.THIRD_OCTAVE_HZ[27] - 16000) < 1);
  assert.equal(M.THIRD_OCTAVE_HZ[15], 1000);
});

test('the profile of a pure tone peaks in its own band, holds nearly all the energy there, and is dB under the total', () => {
  for (const hz of [125, 1000, 4000]) {
    const p = M.thirdOctaveProfile(mono(sine(hz, 0.3)), SR);
    assert.equal(p.length, 28);
    const k = argmax(p), want = bandOf(hz);
    assert.equal(k, want, `${hz} Hz peaks in band ${k} (${M.THIRD_OCTAVE_HZ[k]} Hz), wanted ${want}`);
    assert.ok(p[k] > -1.5, `${hz} Hz: ${p[k]} dB of the total in its band`);
    assert.ok(p.every((v) => v >= -60), 'floored at -60 dB');
    assert.ok(p[Math.min(27, k + 3)] < -20 && p[Math.max(0, k - 3)] < -20, 'bands a whole octave away are empty');
  }
});

test('the profile does not care how loud the sound is', () => {
  const a = M.thirdOctaveProfile(mono(sine(800, 0.2, 0.5)), SR), b = M.thirdOctaveProfile(mono(sine(800, 0.2, 0.05)), SR);
  for (let i = 0; i < 28; i++) assert.ok(Math.abs(a[i] - b[i]) < 0.05);
});

test('the bandgram is third-octave x 10 ms cells: a burst lights its band in its frames only', () => {
  const x = new Float32Array(Math.round(0.4 * SR));
  x.set(sine(1000, 0.1), Math.round(0.1 * SR));
  const g = M.bandgram(mono(x), SR);
  assert.ok(Math.abs(g.hopS - 0.01) < 1e-9);
  assert.ok(g.db.length >= 38 && g.db.length <= 42, `${g.db.length} frames`);
  assert.equal(g.db[0].length, 28);
  const inside = g.db[15][15], outside = g.db[35][15];
  assert.ok(inside > outside + 40, `burst ${inside} dB against ${outside} dB after it`);
  assert.equal(argmax(g.db[15]), 15, 'a 1 kHz burst is loudest in the 1 kHz band');
});

test('measure() carries the profile', () => {
  const m = M.measure(mono(sine(500, 0.2)), SR);
  assert.equal(m.bandsDb.length, 28);
  assert.equal(argmax(m.bandsDb), bandOf(500));
});

// ---- an event on a bed ---------------------------------------------------------------------------------------------
const bed = (seconds, seed = 1, level = 0.01) => { const r = rng(seed), x = sine(200, seconds, level); for (let i = 0; i < x.length; i++) x[i] += level * r(); return x; };
/** A recording: the bed all through, a 2 kHz event of the given peak and shape from `at` seconds. */
function onBed({ at = 1, peak = 0.3, db = (t) => -60 * t / 0.3, seconds = 2, tail = 0.4 } = {}) {
  const x = bed(seconds);
  const n = Math.round(tail * SR), o = Math.round(at * SR);
  for (let i = 0; i < n && o + i < x.length; i++) x[o + i] += peak * 10 ** (db(i / SR) / 20) * Math.sin((2 * Math.PI * 2000 * i) / SR);
  return { x, o, n };
}

test('bedOf takes the quietest 150 ms of the 0.6 s before the event, 15 ms away from it', () => {
  const x = bed(2);
  const o = Math.round(1.2 * SR);
  for (let i = Math.round(0.75 * SR); i < Math.round(0.9 * SR); i++) x[i] *= 0.1;           // a 150 ms dip inside the window
  const b = M.bedOf(mono(x), SR, o);
  assert.ok(b.fromS >= 0.6 - 1e-6 && b.toS <= 1.2 - 0.015 + 1e-6, `${b.fromS}-${b.toS}`);
  assert.ok(Math.abs(b.fromS - 0.75) < 0.012, `the dip starts at 0.75, the bed window at ${b.fromS}`);
  const flat = M.bedOf(mono(bed(2)), SR, o);
  assert.ok(b.db < flat.db - 12, 'the dip is quieter than the plain bed');
  assert.equal(M.bedOf(mono(bed(2)), SR, Math.round(0.1 * SR)), null, 'no room before the event: no bed');
  assert.equal(b.bands.length, 28);
});

test('bed subtraction recovers a known event: its band, the masked bands, its exposure over the bed', () => {
  const { x, o, n } = onBed({ peak: 0.3 });
  const ch = mono(x);
  const b = M.bedOf(ch, SR, o);
  const plain = bed(2);
  let power = 0;
  for (const v of plain) power += (v * v) / plain.length;
  assert.ok(Math.abs(b.db - 10 * Math.log10(power)) < 1.0, `bed ${b.db} dB against ${10 * Math.log10(power)}`);
  const ev = M.eventMeasure([x.slice(o, o + n), x.slice(o, o + n)], SR, b);
  assert.equal(argmax(ev.balance), bandOf(2000), 'the event\'s own band stands out once the bed is taken away');
  assert.ok(ev.balance[bandOf(2000)] > -3);
  assert.equal(ev.masked[bandOf(200)], true, 'the bed\'s own 200 Hz band: the event adds nothing there');
  assert.equal(ev.masked[bandOf(2000)], false);
  assert.ok(ev.masked.filter(Boolean).length >= 15, 'most bands carry nothing of the event');
  assert.ok(ev.addedDb[bandOf(2000)] > 20);
  assert.equal(ev.exposed, true);
  assert.ok(ev.exposedDb > 15, `${ev.exposedDb} dB over the bed`);
});

test('an event 6 dB over the bed is not exposed: no family is read from it', () => {
  const { x, o, n } = onBed({ peak: 0.012 });
  const b = M.bedOf(mono(x), SR, o);
  const ev = M.eventMeasure([x.slice(o, o + n), x.slice(o, o + n)], SR, b);
  assert.ok(ev.exposedDb < 12, `${ev.exposedDb} dB over the bed`);
  assert.equal(ev.exposed, false);
});

test('an event with no bed to measure is exposed by default', () => {
  const ev = M.eventMeasure(mono(sine(1000, 0.2)), SR, null);
  assert.equal(ev.exposed, true);
  assert.equal(ev.exposedDb, null);
  assert.equal(ev.balance.length, 28);
});

test('decay shape: a straight fall in dB is exponential; one that holds then drops is convex; one that drops then lingers is concave', () => {
  const shape = (db) => { const { x, o, n } = onBed({ peak: 0.3, db, seconds: 2, tail: 0.5 }); return M.eventMeasure([x.slice(o, o + n), x.slice(o, o + n)], SR, M.bedOf(mono(x), SR, o)).decay; };
  const expo = shape((t) => -80 * t / 0.5), convex = shape((t) => -80 * (t / 0.5) ** 2.2), concave = shape((t) => -80 * (t / 0.5) ** 0.5);
  assert.equal(expo.shape, 'exponential', JSON.stringify(expo));
  assert.equal(convex.shape, 'convex', JSON.stringify(convex));
  assert.equal(concave.shape, 'concave', JSON.stringify(concave));
  assert.ok(convex.deviationDb > 2.5 && concave.deviationDb < -2.5 && Math.abs(expo.deviationDb) <= 2.5);
});

test('stutter: a 20 Hz gate shows as an amplitude modulation rate; a plain decay shows none', () => {
  const gated = sine(1000, 0.5, 0.3);
  for (let i = 0; i < gated.length; i++) if (Math.floor((i / SR) * 40) % 2) gated[i] = 0;          // 20 Hz on/off
  const s = M.eventMeasure(mono(gated), SR, null).stutterHz;
  assert.ok(s !== null && Math.abs(s - 20) <= 2, `${s}`);
  const plain = sine(1000, 0.5, 0.3);
  for (let i = 0; i < plain.length; i++) plain[i] *= 10 ** ((-60 * i) / SR / 0.5 / 20);
  assert.equal(M.eventMeasure(mono(plain), SR, null).stutterHz, null);
});
