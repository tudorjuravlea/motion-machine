// Drawn fills (runtime/kit/rough.js): a watercolour wash that bleeds past the outline in a few
// ragged layers, optionally shifted off it like a misregistered print, and a hatch of near-parallel
// lines clipped to the shape. Pure geometry; the colour is a pattern's palette role.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeOf, planOf, sample, pathOf, wash, hatch, STEP } from '../../runtime/kit/rough.js';

const BOX = { x: 40, y: 60, w: 300, h: 160 };
const points = (d) => [...d.matchAll(/[MQL ]?(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
// signed distance from the rounded box's outline: > 0 outside
function signed([px, py], { x, y, w, h, r }) {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r), qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

test('wash: layers of the same seed are the same; each layer fainter than the one before', () => {
  const s = shapeOf('box', BOX, 20);
  const a = wash(s, { seed: 3, pen: 6 }), b = wash(s, { seed: 3, pen: 6 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, wash(s, { seed: 4, pen: 6 }));
  assert.equal(a.length, 4, 'four layers by default');
  for (const l of a) assert.ok(l.d.startsWith('M') && l.d.endsWith('Z') && l.alpha > 0 && l.alpha <= 1);
  for (let i = 1; i < a.length; i++) assert.ok(a[i].alpha < a[i - 1].alpha, 'fainter outward');
  assert.equal(wash(s, { seed: 3, pen: 6, layers: 2 }).length, 2);
});

test('wash: every layer bleeds outward past the outline, never inside it, and no farther than its bleed', () => {
  const s = shapeOf('box', BOX, 20), pen = 6, bleed = 3;
  const layers = wash(s, { seed: 7, pen, bleed });
  layers.forEach((l, k) => {
    const dist = points(l.d).map((p) => signed(p, s));
    assert.ok(Math.min(...dist) >= -0.15, `layer ${k} dips inside by ${-Math.min(...dist)} px`);
    assert.ok(Math.max(...dist) <= bleed * (pen / 2) * 1.6 + 0.2, `layer ${k} bleeds ${Math.max(...dist)} px`);
  });
  const reach = (l) => Math.max(...points(l.d).map((p) => signed(p, s)));
  assert.ok(reach(layers.at(-1)) > reach(layers[0]), 'outer layers bleed farther');
  const sq = shapeOf('box', BOX, 0), flat = wash(sq, { seed: 7, pen, bleed: 0 });
  for (const l of flat) assert.ok(Math.max(...points(l.d).map((p) => Math.abs(signed(p, sq)))) <= 0.1, 'bleed 0 lies on the outline');
});

test('wash: an offset shifts every layer off its outline the same way, like a second plate', () => {
  const s = shapeOf('circle', BOX), pen = 6;
  const base = wash(s, { seed: 2, pen }), off = wash(s, { seed: 2, pen, offset: 3, angle: 0 });
  base.forEach((l, k) => {
    const a = points(l.d), b = points(off[k].d);
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
      assert.ok(Math.abs(b[i][0] - a[i][0] - 3 * pen / 2) <= 0.11 && Math.abs(b[i][1] - a[i][1]) <= 0.11, `point ${i}`);
    }
  });
  const seeded = wash(s, { seed: 2, pen, offset: 3 });
  assert.deepEqual(seeded, wash(s, { seed: 2, pen, offset: 3 }), 'without an angle the plate shifts by the seed, the same every time');
});

test('wash: a line has no inside to wash; a shape with no size draws nothing', () => {
  assert.deepEqual(wash(shapeOf('line', BOX), { seed: 1 }), []);
  assert.deepEqual(wash(shapeOf('box', { x: 0, y: 0, w: 0, h: 0 }), { seed: 1 }), []);
});

test('hatch: near-parallel lines at the angle, a gap apart, covering the shape, with the exact outline as their clip', () => {
  const s = shapeOf('box', BOX, 20), pen = 4, gap = 5, angle = Math.PI / 4;
  const h = hatch(s, { seed: 5, pen, gap, angle });
  assert.deepEqual(h, hatch(s, { seed: 5, pen, gap, angle }));
  assert.equal(h.clip, pathOf(sample(s, planOf(s, Math.max(4, STEP * pen / 2))), true));
  const lines = [...h.d.matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)].map((m) => m.slice(1).map(Number));
  assert.ok(lines.length > 0);
  const nx = -Math.sin(angle), ny = Math.cos(angle);
  for (const [x1, y1, x2, y2] of lines) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    assert.ok(Math.abs(Math.sin(a - angle)) <= 0.05, `a line at ${a} rad, not ${angle}`);
  }
  const across = lines.map(([x1, y1, x2, y2]) => ((x1 + x2) / 2) * nx + ((y1 + y2) / 2) * ny).sort((a, b) => a - b);
  for (let i = 1; i < across.length; i++) assert.ok(Math.abs(across[i] - across[i - 1] - gap * pen / 2) <= 0.6 * pen / 2 + 0.1, `gap ${across[i] - across[i - 1]}`);
  // the lines span the outline's whole extent across them, the outer ones within half a gap of its edge
  const corners = sample(s, planOf(s, 2)).map(([x, y]) => x * nx + y * ny);
  assert.ok(across[0] <= Math.min(...corners) + gap * pen / 4 + 0.1 && across.at(-1) >= Math.max(...corners) - gap * pen / 4 - 0.1);
  assert.deepEqual(hatch(shapeOf('line', BOX), { seed: 1 }), { clip: '', d: '' });
});
