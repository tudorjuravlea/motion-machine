// hairline: the drawing maths of the thin-line style (rounded rings, the hull that makes a solid's
// silhouette, the one crease, and the partial path that draws a line on). Pure: no DOM, no camera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rrect, circ, hull, run, solid, extremes, length, partial } from '../../runtime/kit/hairline.js';

const flat = (u, v, h) => [u + 0.5 * v, 0.5 * v - h];   // a plain oblique view: x across, depth up the page, h up

test('rrect samples every corner with unit outward normals, inside its box', () => {
  const ring = rrect(0, 0, 10, 6, 2, 4);
  assert.equal(ring.length, 4 * 5);
  for (const q of ring) {
    assert.ok(Math.abs(Math.hypot(q.nu, q.nv) - 1) < 1e-9);
    assert.ok(q.u >= -1e-9 && q.u <= 10 + 1e-9 && q.v >= -1e-9 && q.v <= 6 + 1e-9);
  }
  assert.ok(ring.some((q) => Math.abs(q.u - 10) < 1e-9 && q.nu === 1));
  const big = rrect(0, 0, 4, 4, 9, 4);
  assert.ok(big.every((q) => Math.abs(Math.hypot(q.u - 2, q.v - 2) - 2) < 1e-9), 'the radius is cut to half the shorter side');
});

test('circ is centred where asked', () => {
  const c = circ(3, 12, 5, -1);
  assert.equal(c.length, 12);
  assert.ok(c.every((q) => Math.abs(Math.hypot(q.u - 5, q.v + 1) - 3) < 1e-9));
});

test('hull keeps the outside points only', () => {
  const h = hull([[0, 0], [4, 0], [4, 4], [0, 4], [2, 2], [1, 3]]);
  assert.equal(h.length, 4);
  for (const p of [[0, 0], [4, 0], [4, 4], [0, 4]]) assert.ok(h.some((q) => q[0] === p[0] && q[1] === p[1]));
});

test('run is the one cyclic run that passes, in ring order', () => {
  const ring = circ(1, 8);
  const r = run(ring, (q) => q.nv > 0.1);
  assert.equal(r.length, 3);
  assert.ok(r.every((q) => q.nv > 0.1));
  assert.deepEqual(run(ring, () => false), []);
  assert.equal(run(ring, () => true).length, 8);
});

test('solid: the silhouette is the hull of both rings, the crease the facing run of the inner ring on the lid', () => {
  const ring = rrect(0, 0, 10, 20, 2), inner = rrect(1, 1, 9, 19, 1);
  const s = solid(flat, (q) => q.nv > 0, ring, inner, 0, 3);
  const xs = s.sil.map((p) => p[0]), ys = s.sil.map((p) => p[1]);
  assert.ok(Math.abs(Math.min(...ys) - (0 - 3)) < 1e-9, 'the lid reaches the top');
  assert.ok(Math.abs(Math.max(...ys) - 10) < 1e-9, 'the base reaches the bottom');
  assert.ok(Math.max(...xs) <= 10 + 10 + 1e-9);
  assert.ok(s.crease.length > 2 && s.crease.length < inner.length, 'the crease is part of the inner ring');
  for (const p of s.crease) assert.ok(s.sil.length && p[1] >= -3 - 1e-9);
  assert.deepEqual(solid(flat, () => true, ring, null, 0, 3).crease, []);
});

test('extremes are the leftmost, rightmost and lowest points', () => {
  const e = extremes([[0, 5], [3, 9], [7, 2], [-1, 4]]);
  assert.deepEqual(e, [3, 2, 1]);
});

test('length and partial draw a line on by its length', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(length(sq, false), 30);
  assert.equal(length(sq, true), 40);
  assert.deepEqual(partial(sq, true, 0), []);
  assert.equal(partial(sq, true, 1).length, 5, 'a closed line drawn whole returns to its start');
  const half = partial(sq, true, 0.5);
  assert.deepEqual(half[half.length - 1], [10, 10]);
  assert.ok(Math.abs(length(half, false) - 20) < 1e-9);
  const q = partial(sq, false, 0.25);
  assert.ok(Math.abs(length(q, false) - 7.5) < 1e-9);
  assert.deepEqual(partial(sq, false, 2), sq, 'past 1 is whole');
});
