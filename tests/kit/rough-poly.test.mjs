// Any drawn shape as a pen stroke (runtime/kit/rough.js): a polyline, open or closed, resampled
// evenly along its length, takes the same stroke, voices, wash and hatch as a box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polyOf, planOf, sample, stroke, passes, wash, hatch, STEP } from '../../runtime/kit/rough.js';

const controls = (d) => [...d.matchAll(/Q(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const allPts = (d) => [...d.matchAll(/[MQL ]?(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
const offPoly = (p, pts, closed) => {
  let m = Infinity;
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) m = Math.min(m, segDist(p, pts[i], pts[(i + 1) % pts.length]));
  return m;
};
const ZIG = [[0, 0], [60, 40], [120, 0], [180, 40]];
const SQUARE_ANTI = [[0, 0], [0, 100], [100, 100], [100, 0]];   // anticlockwise on screen

test('a polyline is resampled evenly along each run, keeping its corners; open with both ends, closed without its closing point', () => {
  const open = polyOf(ZIG), pts = sample(open, planOf(open, 10));
  assert.deepEqual(pts[0], [0, 0]);
  assert.deepEqual(pts.at(-1), [180, 40]);
  assert.equal(pts.length, 3 * Math.ceil(Math.hypot(60, 40) / 10) + 1);
  for (const v of ZIG) assert.ok(pts.some((p) => Math.hypot(p[0] - v[0], p[1] - v[1]) < 1e-9), `corner ${v} kept`);
  for (const p of pts) assert.ok(offPoly(p, ZIG, false) < 1e-9);
  for (let i = 1; i < pts.length; i++) assert.ok(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) <= 10 + 1e-9);
  const closed = polyOf(SQUARE_ANTI, true), c = sample(closed, planOf(closed, 10));
  assert.equal(c.length, 40);
  for (let i = 0; i < c.length; i++) assert.ok(Math.abs(Math.hypot(c[(i + 1) % 40][0] - c[i][0], c[(i + 1) % 40][1] - c[i][1]) - 10) < 1e-9);
});

test('roughness 0 lies on the polyline in both voices; an open one is drawn open, a closed one closed', () => {
  for (const coherent of [false, true]) {
    const o = polyOf(ZIG), d = stroke(o, { seed: 2, pen: 4, roughness: 0, coherent });
    assert.ok(Math.max(...[...controls(d), ...allPts(d).slice(0, 1), ...allPts(d).slice(-1)].map((p) => offPoly(p, ZIG, false))) <= 0.08, `open, coherent ${coherent}`);
    assert.equal((d.match(/Z/g) ?? []).length, 0);
    const c = polyOf(SQUARE_ANTI, true), e = stroke(c, { seed: 2, pen: 4, roughness: 0, coherent });
    assert.ok(Math.max(...controls(e).map((p) => offPoly(p, SQUARE_ANTI, true))) <= 0.08, `closed, coherent ${coherent}`);
    assert.equal((e.match(/Z/g) ?? []).length, 2);
  }
  assert.ok(stroke(polyOf(ZIG), { seed: 2, pen: 4 }) !== stroke(polyOf(ZIG), { seed: 2, pen: 4, roughness: 0 }));
  assert.equal(stroke(polyOf([[1, 1]]), { seed: 1 }), '', 'one point is no stroke');
  assert.equal(stroke(polyOf([[1, 1], [1, 1]]), { seed: 1 }), '', 'no length is no stroke');
});

test('a closed coherent polyline has no seam, and an open one overshoots its ends', () => {
  const c = polyOf(SQUARE_ANTI, true), pen = 4;
  const ideal = sample(c, planOf(c, Math.max(4, STEP * pen / 2)));
  const ctl = controls(passes(c, { seed: 8, pen, coherent: true, roughness: 1.5 })[0]);
  const f = ctl.map((p, i) => [p[0] - ideal[i][0], p[1] - ideal[i][1]]);
  const step = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const inner = Math.max(...f.slice(1).map((p, i) => step(p, f[i])));
  assert.ok(step(f[0], f.at(-1)) <= inner + 0.15);
  const d = passes(polyOf(ZIG), { seed: 1, pen, roughness: 0, overshoot: 2 })[0];
  const first = /^M(-?[\d.]+) (-?[\d.]+)/.exec(d).slice(1).map(Number);
  assert.ok(Math.abs(Math.hypot(first[0], first[1]) - 4) <= 0.1, `${first}`);
});

test('a wash of a closed polyline bleeds outward whichever way round it was drawn; hatch clips to it', () => {
  const inside = ([x, y]) => x > 0 && x < 100 && y > 0 && y < 100;
  for (const pts of [SQUARE_ANTI, [...SQUARE_ANTI].reverse()]) {
    const layers = wash(polyOf(pts, true), { seed: 3, pen: 4, bleed: 3 });
    assert.equal(layers.length, 4);
    for (const l of layers) for (const p of controls(l.d)) assert.ok(!inside(p), `a wash point inside the square: ${p}`);
  }
  assert.deepEqual(wash(polyOf(ZIG), { seed: 3 }), [], 'an open polyline has no inside');
  const h = hatch(polyOf(SQUARE_ANTI, true), { seed: 3, pen: 4 });
  assert.ok(h.clip.endsWith('Z') && h.d.startsWith('M'));
});
