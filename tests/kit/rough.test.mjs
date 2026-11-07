// The pen stroke geometry (runtime/kit/rough.js): a shape sampled densely, every point
// jittered by a seeded stream, smoothed through the midpoints and drawn twice; a small second jitter
// per boil frame makes it shiver. Pure: Node runs it as the browser does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeOf, planOf, sample, pathOf, stroke, lerpBox, jitter } from '../../runtime/kit/rough.js';
import { random } from '../../runtime/kit/random.js';

const BOX = { x: 10, y: 20, w: 300, h: 120 };
const box = (r = 16) => shapeOf('box', BOX, r);
// the control points of every Q in a path, and the number of subpaths
const controls = (d) => [...d.matchAll(/Q(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const subpaths = (d) => (d.match(/M/g) ?? []).length;
// distance from a point to the ideal rounded box's outline
function offBox([px, py], { x, y, w, h, r }) {
  const cx = Math.min(Math.max(px, x + r), x + w - r), cy = Math.min(Math.max(py, y + r), y + h - r);
  const inCorner = (px < x + r || px > x + w - r) && (py < y + r || py > y + h - r);
  if (inCorner) return Math.abs(Math.hypot(px - cx, py - cy) - r);
  return Math.min(Math.abs(px - x), Math.abs(px - x - w), Math.abs(py - y), Math.abs(py - y - h));
}
const maxOff = (d, shape) => Math.max(...controls(d).map((p) => offBox(p, shape)));

test('the same seed draws the same stroke; another seed another', () => {
  const a = stroke(box(), { seed: 7, pen: 6 }), b = stroke(box(), { seed: 7, pen: 6 }), c = stroke(box(), { seed: 8, pen: 6 });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('a closed shape is drawn twice: two closed subpaths, the pen going over itself', () => {
  const d = stroke(box(), { seed: 3, pen: 6 });
  assert.equal(subpaths(d), 2);
  assert.equal((d.match(/Z/g) ?? []).length, 2);
  const open = stroke(shapeOf('line', BOX), { seed: 3, pen: 6 });
  assert.equal(subpaths(open), 2);
  assert.equal((open.match(/Z/g) ?? []).length, 0);
});

test('roughness 0 lies on the ideal shape: every control point is on the outline', () => {
  const s = box(16);
  assert.ok(maxOff(stroke(s, { seed: 11, pen: 6, roughness: 0 }), s) <= 0.06);
  assert.ok(maxOff(stroke(s, { seed: 11, pen: 6, roughness: 1 }), s) > 1, 'roughness 1 leaves the outline');
});

test('a square box keeps sharp corners: the corner itself is a sample, twice', () => {
  const s = box(0);
  const pts = sample(s, planOf(s, 8));
  for (const c of [[10, 20], [310, 20], [310, 140], [10, 140]]) {
    assert.equal(pts.filter(([x, y]) => x === c[0] && y === c[1]).length, 2, `corner ${c}`);
  }
});

test('straightening is continuous: half the roughness, half the wander, from the same stream', () => {
  const s = box(16);
  const full = maxOff(stroke(s, { seed: 5, pen: 6, roughness: 1 }), s);
  const half = maxOff(stroke(s, { seed: 5, pen: 6, roughness: 0.5 }), s);
  assert.ok(Math.abs(half - full / 2) <= 0.1, `${half} vs ${full / 2}`);
});

test('boil: three frames of one sketch, each its own, each the same at every call; a shiver, not a redraw', () => {
  const s = box(16), o = { seed: 9, pen: 6, roughness: 1, boil: 0.45 };
  const f = [0, 1, 2].map((frame) => stroke(s, { ...o, frame }));
  assert.equal(new Set(f).size, 3);
  assert.equal(stroke(s, { ...o, frame: 1 }), f[1]);
  const gap = (d1, d2) => { const a = controls(d1), b = controls(d2); return a.reduce((m, p, i) => m + Math.hypot(p[0] - b[i][0], p[1] - b[i][1]), 0) / a.length; };
  const shiver = gap(f[0], f[1]), redraw = gap(f[0], stroke(s, { ...o, seed: 10, frame: 0 }));
  assert.ok(shiver < redraw / 2, `a boil frame moves ${shiver} px, a new seed ${redraw} px`);
  assert.equal(stroke(s, { ...o, boil: 0, frame: 0 }), stroke(s, { ...o, boil: 0, frame: 2 }), 'boil 0 is one still stroke');
});

test('a fixed plan keeps the point count through a morph, and t = 0 is the first box', () => {
  const a = { x: 0, y: 0, w: 200, h: 80, r: 12 }, b = { x: 40, y: 30, w: 320, h: 140, r: 24 };
  const plan = planOf(shapeOf('box', a, a.r), 8);
  const n = sample(shapeOf('box', a, a.r), plan).length;
  for (const t of [0, 0.3, 1]) {
    const m = lerpBox(a, b, t);
    assert.equal(sample(shapeOf('box', m, m.r), plan).length, n, `t = ${t}`);
  }
  assert.deepEqual(lerpBox(a, b, 0), a);
  assert.deepEqual(lerpBox(a, b, 1), b);
});

test('jitter stays within its amplitude and pathOf passes through the midpoints', () => {
  const pts = [[0, 0], [10, 0], [20, 0], [30, 0]];
  const j = jitter(pts, random(1), 2);
  for (let i = 0; i < pts.length; i++) assert.ok(Math.abs(j[i][0] - pts[i][0]) <= 2 && Math.abs(j[i][1] - pts[i][1]) <= 2);
  assert.equal(pathOf(pts, false), 'M0 0Q10 0 15 0Q20 0 25 0L30 0');
  assert.equal(pathOf([[0, 0], [10, 0], [10, 10]], true), 'M5 5Q0 0 5 0Q10 0 10 5Q10 10 5 5Z');
});

test('an ellipse is sampled by its perimeter and a line keeps both ends', () => {
  const e = shapeOf('circle', BOX);
  assert.equal(e.kind, 'ellipse');
  assert.ok(sample(e, planOf(e, 8)).length >= Math.floor((Math.PI * (BOX.w + BOX.h) / 2) / 8));
  const l = shapeOf('line', BOX), pts = sample(l, planOf(l, 8));
  assert.deepEqual(pts[0], [l.x1, l.y1]);
  assert.deepEqual(pts.at(-1), [l.x2, l.y2]);
});

test('the boil clock: the frame comes from the time alone, 0.4 s a frame by default; a deck or a still style never shivers', async () => {
  const { boilFrame, BOIL_PERIOD } = await import('../../runtime/kit/rough.js');
  assert.equal(BOIL_PERIOD, 0.4);
  assert.deepEqual([0, 0.39, 0.4, 0.81, 1.2, 1.25].map((t) => boilFrame(t)), [0, 0, 1, 2, 0, 0]);
  assert.equal(boilFrame(1.2 - 1e-12), 0, 'an instant a rounding hair short of a step is that step');
  assert.deepEqual([0.2, 0.5, 0.9].map((t) => boilFrame(t, { period: 0.25, n: 2 })), [0, 0, 1]);
  assert.equal(boilFrame(0.9, { deck: true }), 0, 'a deck rest is a still picture');
  assert.equal(boilFrame(0.9, { period: 0 }), 0, 'period 0 is a style that does not boil');
});

test('review fixes: the two passes shiver apart; a box with no size draws nothing instead of throwing', () => {
  const d = stroke(box(16), { seed: 4, pen: 6, roughness: 0, boil: 0.45, frame: 1 });
  const [a, b] = d.split('M').filter(Boolean);
  assert.notEqual(a, b, 'each pass has its own boil stream');
  for (const bad of [{ x: 0, y: 0, w: -10, h: 5 }, { x: 0, y: 0, w: NaN, h: 5 }, { x: 0, y: 0, w: 0, h: 0 }]) {
    for (const kind of ['box', 'circle', 'line']) assert.equal(stroke(shapeOf(kind, bad, 2), { seed: 1, pen: 6 }), '', `${kind} ${JSON.stringify(bad)}`);
  }
});
