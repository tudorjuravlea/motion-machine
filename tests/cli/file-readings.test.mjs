// The readings the file check makes of a finished MP4, on made-up samples and frames with known answers
// (scripts/lib/file-sound.mjs, scripts/lib/file-picture.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignLag, monoLossDb, quietShare, syncReading, tailDb } from '../../scripts/lib/file-sound.mjs';
import { flashes, flashRate, slideshowShare, stillSpans } from '../../scripts/lib/file-picture.mjs';

const RATE = 6000;
/** Noise bursts at the given seconds, seeded, over `seconds`. */
function bursts(seconds, at, seed = 1) {
  const x = new Float32Array(Math.round(seconds * RATE));
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 - 0.5; };
  for (const t of at) for (let i = 0; i < 0.15 * RATE; i++) x[Math.round(t * RATE) + i] = rnd() * Math.exp(-i / 300);
  return x;
}
const shift = (x, n) => { const o = new Float32Array(x.length); for (let i = 0; i < x.length; i++) { const k = i - n; if (k >= 0 && k < x.length) o[i] = x[k]; } return o; };

test('alignLag finds a shift in either direction, to a sample', () => {
  const a = bursts(8, [0.5, 2.2, 3.7, 6.1]);
  assert.equal(alignLag(a, a, RATE), 0);
  assert.equal(alignLag(a, shift(a, 1800), RATE), 1800);
  assert.equal(alignLag(a, shift(a, -600), RATE), -600);
});

test('syncReading: the same sound reads 0 ms and a correlation of 1; another sound reads near 0', () => {
  const a = bursts(8, [0.5, 2.2, 3.7, 6.1]);
  const same = syncReading(a, a, RATE);
  assert.equal(same.lagMs, 0);
  assert.ok(same.r > 0.999);
  assert.ok(same.deficitDb < 0.1);
  const other = syncReading(a, bursts(8, [1.1, 3.0, 5.0, 7.0], 9), RATE);
  assert.ok(other.r < 0.2, String(other.r));
});

test('syncReading: a sound muted in one place shows as a deficit there, though the rest aligns', () => {
  const a = bursts(8, [0.5, 2.2, 3.7, 6.1]);
  const b = a.slice();
  b.fill(0, Math.round(3.7 * RATE), Math.round(3.9 * RATE));
  const r = syncReading(a, b, RATE);
  assert.equal(r.lagMs, 0);
  assert.ok(r.deficitDb > 20, String(r.deficitDb));
  assert.ok(Math.abs(r.at - 3.7) < 0.06, String(r.at));
});

test('syncReading: silence against a sound is no alignment, r 0, and does not throw', () => {
  const a = bursts(4, [1]);
  const r = syncReading(a, new Float32Array(a.length), RATE);
  assert.equal(r.r, 0);
});

test('monoLossDb: identical channels lose nothing, opposite channels lose everything', () => {
  const a = bursts(2, [0.5]);
  assert.ok(Math.abs(monoLossDb(a, a)) < 0.01);
  const anti = a.map((x) => -x);
  assert.ok(monoLossDb(a, anti) > 40);
});

test('tailDb reads the last 50 ms: silence is very low, a sound still playing is not', () => {
  const quiet = new Float32Array(RATE);
  assert.ok(tailDb(quiet, quiet, RATE) < -100);
  const loud = new Float32Array(RATE).fill(0.25);
  assert.ok(Math.abs(tailDb(loud, loud, RATE) + 12) < 0.1);
});

test('quietShare is the share of the length under -50 dB', () => {
  const x = new Float32Array(RATE * 10);
  x.fill(0.1, 0, RATE * 2);
  const s = quietShare(x, x, RATE);
  assert.ok(Math.abs(s - 0.8) < 0.01, String(s));
});

test('flashes: one frame in and back is a flash, a hard cut is not, a slow change is not', () => {
  const flat = new Array(60).fill(100);
  assert.deepEqual(flashes(flat), { single: [], double: [] });
  const cut = [...new Array(30).fill(50), ...new Array(30).fill(200)];
  assert.deepEqual(flashes(cut), { single: [], double: [] });
  const one = flat.slice(); one[20] = 230;
  assert.deepEqual(flashes(one).single, [20]);
  const two = flat.slice(); two[20] = 0; two[21] = 0;
  assert.deepEqual(flashes(two).double, [20]);
  const ramp = Array.from({ length: 60 }, (_, i) => i * 2);
  assert.deepEqual(flashes(ramp), { single: [], double: [] });
});

test('flashRate is the most flashes in any one second', () => {
  assert.equal(flashRate([10, 15, 20, 25, 90], 30), 4);
  assert.equal(flashRate([], 30), 0);
});

test('stillSpans lists spans of unchanging frames, longest first, and leaves out the ending', () => {
  const pair = new Array(300).fill(1);
  for (let i = 50; i < 200; i++) pair[i] = 0;
  for (let i = 260; i < 300; i++) pair[i] = 0;
  const s = stillSpans(pair, 30);
  assert.equal(s.length, 1);
  assert.ok(Math.abs(s[0].seconds - 5) < 0.05, JSON.stringify(s));
});

test('slideshowShare is the share of frame pairs that barely change', () => {
  const pair = [0, ...new Array(90).fill(0.1), ...new Array(10).fill(5)];
  assert.ok(Math.abs(slideshowShare(pair) - 0.9) < 0.001);
});
