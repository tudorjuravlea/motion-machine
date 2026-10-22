// The pen stroke's opt-in voices (runtime/kit/rough.js): a coherent wander along the length, a
// ghost pass of its own wander, an overshoot past an open stroke's ends, and the pen presets that
// bundle them. Without these options the stroke is byte for byte the one it always was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { shapeOf, planOf, sample, stroke, passes, lerpBox, STEP, PENS } from '../../runtime/kit/rough.js';

const BOX = { x: 10, y: 20, w: 300, h: 120 };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const controls = (d) => [...d.matchAll(/Q(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
function offBox([px, py], { x, y, w, h, r }) {
  const cx = Math.min(Math.max(px, x + r), x + w - r), cy = Math.min(Math.max(py, y + r), y + h - r);
  const inCorner = (px < x + r || px > x + w - r) && (py < y + r || py > y + h - r);
  if (inCorner) return Math.abs(Math.hypot(px - cx, py - cy) - r);
  return Math.min(Math.abs(px - x), Math.abs(px - x - w), Math.abs(py - y), Math.abs(py - y - h));
}
const maxOff = (d, shape) => Math.max(...controls(d).map((p) => offBox(p, shape)));
// the first pass's offsets from the ideal samples (a closed path's Q controls are its points, in order)
function offsets(shape, opts) {
  const s = Math.max(0.5, (opts.pen ?? 2) / 2);
  const pts = sample(shape, planOf(shape, Math.max(4, STEP * s)));
  const c = controls(passes(shape, opts)[0]);
  assert.equal(c.length, pts.length);
  return c.map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
}
const step = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('without the new options the stroke is exactly the one it always was', () => {
  const cases = [];
  for (const kind of ['box', 'pill', 'circle', 'line']) {
    for (const o of [{ seed: 7, pen: 6 }, { seed: 3, pen: 2, roughness: 2 }, { seed: 9, pen: 6, roughness: 0.4, boil: 0.45, frame: 2 }, { seed: 1, pen: 6, roughness: 0, boil: 0.45, frame: 1 }]) cases.push([kind, o]);
  }
  const all = cases.map(([k, o]) => stroke(shapeOf(k, BOX, 16), o)).join('|');
  assert.equal(sha(all), '37fb49670b3876981b3bbaa56fda0b02c6add152f0696db350d1eb74a0f35b64');
  const plan = planOf(shapeOf('box', { x: 0, y: 0, w: 200, h: 80 }, 12), 12);
  const m = lerpBox({ x: 0, y: 0, w: 200, h: 80, r: 12 }, { x: 40, y: 30, w: 320, h: 140, r: 24 }, 0.4);
  assert.equal(sha(stroke(shapeOf('box', m, m.r), { seed: 5, pen: 6, roughness: 0.6, plan })), 'bcf16397b883961d18a4668731021f7fb990f61c538432a20307663d10b97f87');
});

test('passes() gives the two passes on their own; stroke() is the two joined', () => {
  for (const o of [{ seed: 4, pen: 6 }, { seed: 4, pen: 6, coherent: true, overshoot: 2 }]) {
    const [a, b] = passes(shapeOf('box', BOX, 16), o);
    assert.ok(a.startsWith('M') && b.startsWith('M'));
    assert.equal(a + b, stroke(shapeOf('box', BOX, 16), o));
  }
  assert.deepEqual(passes(shapeOf('box', { x: 0, y: 0, w: -1, h: 4 }), { seed: 1 }), ['', '']);
});

test('coherent: the same arguments draw the same path; roughness 0 lies exactly on the shape; the wander is linear in roughness', () => {
  const s = shapeOf('box', BOX, 16), o = { seed: 11, pen: 6, coherent: true };
  assert.equal(stroke(s, o), stroke(s, o));
  assert.notEqual(stroke(s, o), stroke(s, { ...o, seed: 12 }));
  assert.ok(maxOff(stroke(s, { ...o, roughness: 0 }), s) <= 0.06);
  assert.ok(maxOff(stroke(s, { ...o, roughness: 0, boil: 0, ghost: 0.9 }), s) <= 0.06);
  const full = maxOff(passes(s, { ...o, roughness: 1 })[0], s), half = maxOff(passes(s, { ...o, roughness: 0.5 })[0], s);
  assert.ok(full > 1, `roughness 1 leaves the outline (${full})`);
  assert.ok(Math.abs(half - full / 2) <= 0.1, `${half} vs ${full / 2}`);
});

test('coherent: the wander is a slow drift along the length, not a jitter from point to point', () => {
  const s = shapeOf('box', BOX, 16);
  const mean = (o) => { const f = offsets(s, o); return f.reduce((m, p, i) => m + step(p, f[(i + 1) % f.length]), 0) / f.length; };
  const white = mean({ seed: 2, pen: 6 }), coherent = mean({ seed: 2, pen: 6, coherent: true });
  assert.ok(coherent < white / 3, `neighbour step ${coherent} px coherent, ${white} px white`);
});

test('coherent: a closed outline has no seam; the step across the join is no larger than any other neighbour step', () => {
  for (const [kind, seed] of [['box', 1], ['box', 2], ['circle', 3], ['pill', 4], ['circle', 5]]) {
    const s = shapeOf(kind, BOX, 16);
    const f = offsets(s, { seed, pen: 6, coherent: true, roughness: 1.5 });
    const inner = Math.max(...f.slice(1).map((p, i) => step(p, f[i])));
    const seam = step(f[0], f.at(-1));
    assert.ok(seam <= inner + 0.15, `${kind}: seam ${seam} px, largest inner step ${inner} px`);
  }
});

test('overshoot: an open stroke runs past each end by overshoot x pen / 2; a closed outline ignores it', () => {
  const l = shapeOf('line', BOX), pen = 6;
  const d = passes(l, { seed: 3, pen, roughness: 0, overshoot: 2, coherent: true })[0];
  const first = /^M(-?[\d.]+) (-?[\d.]+)/.exec(d).slice(1).map(Number), last = /L(-?[\d.]+) (-?[\d.]+)$/.exec(d).slice(1).map(Number);
  assert.ok(Math.abs(Math.hypot(first[0] - l.x1, first[1] - l.y1) - 2 * pen / 2) <= 0.1, `start ${first}`);
  assert.ok(Math.abs(Math.hypot(last[0] - l.x2, last[1] - l.y2) - 2 * pen / 2) <= 0.1, `end ${last}`);
  assert.ok(first[0] < l.x1 && last[0] > l.x2, 'outward, along the line');
  const white = passes(l, { seed: 3, pen, roughness: 0, overshoot: 1 })[0];
  assert.ok(/^M7 140/.test(white), `white mode overshoots too: ${white.slice(0, 12)}`);
  const s = shapeOf('box', BOX, 16);
  assert.equal(stroke(s, { seed: 3, pen, coherent: true, overshoot: 3 }), stroke(s, { seed: 3, pen, coherent: true }));
});

test('ghost: the second pass wanders by its own factor, and in the coherent voice by its own stream', () => {
  const s = shapeOf('box', BOX, 16), o = { seed: 6, pen: 6, coherent: true };
  const [a, b] = passes(s, o);
  assert.notEqual(a, b);
  const calm = maxOff(passes(s, { ...o, ghost: 0.5 })[1], s), wild = maxOff(passes(s, { ...o, ghost: 1.5 })[1], s);
  assert.ok(Math.abs(wild - 3 * calm) <= 0.3, `ghost x0.5 ${calm} px, x1.5 ${wild} px`);
  assert.equal(passes(s, { ...o, ghost: 0.5 })[0], a, 'the first pass does not depend on the ghost');
});

test('coherent boil: each frame its own, the same at every call, and each within the shiver it states', () => {
  const s = shapeOf('box', BOX, 16), pen = 6, o = { seed: 9, pen, coherent: true, roughness: 1, boil: 0.45 };
  const f = [0, 1, 2].map((frame) => stroke(s, { ...o, frame }));
  assert.equal(new Set(f).size, 3);
  assert.equal(stroke(s, { ...o, frame: 1 }), f[1]);
  const still = controls(passes(s, { ...o, boil: 0 })[0]);
  for (const frame of [0, 1, 2]) {
    const c = controls(passes(s, { ...o, frame })[0]);
    const most = Math.max(...c.map((p, i) => Math.max(Math.abs(p[0] - still[i][0]), Math.abs(p[1] - still[i][1]))));
    assert.ok(most > 0 && most <= 0.45 * pen / 2 + 0.1, `frame ${frame} moves up to ${most} px`);
  }
  assert.equal(stroke(s, { ...o, boil: 0, frame: 0 }), stroke(s, { ...o, boil: 0, frame: 2 }));
});

test('pen presets: pencil, marker and charcoal, each a coherent voice with a thinner, fainter ghost; only charcoal overshoots', () => {
  assert.deepEqual(Object.keys(PENS).sort(), ['charcoal', 'marker', 'pencil']);
  for (const [name, p] of Object.entries(PENS)) {
    assert.equal(p.coherent, true, name);
    for (const k of ['width', 'roughness', 'wavelength', 'ghost', 'ghostAlpha', 'ghostWidth', 'overshoot']) assert.equal(typeof p[k], 'number', `${name}.${k}`);
    assert.ok(p.ghostAlpha > 0 && p.ghostAlpha < 1 && p.ghostWidth > 0 && p.ghostWidth < 1, `${name}: the ghost is thinner and fainter`);
    const s = shapeOf('box', BOX, 16);
    assert.ok(maxOff(stroke(s, { ...p, seed: 2, pen: 6 * p.width, roughness: 0 }), s) <= 0.06, name);
  }
  assert.ok(PENS.marker.width > PENS.charcoal.width && PENS.charcoal.width > PENS.pencil.width, 'marker widest, pencil thinnest');
  assert.ok(PENS.charcoal.overshoot > 0 && PENS.pencil.overshoot === 0 && PENS.marker.overshoot === 0);
  assert.ok(PENS.charcoal.ghost > 1 && PENS.pencil.ghost < 1, 'charcoal\'s ghost is the wilder, pencil\'s the calmer');
});
