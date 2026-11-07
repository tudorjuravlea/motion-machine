// transitions/iris without a browser: with no `target` the aperture is exactly what it always was
// (the same clip-path strings, so the same pixels); with `target` naming a slot of the incoming
// scene the aperture is centred on that slot's box and still reaches the farthest frame corner
// before the cut ends; a target that is missing or has no box falls back to the centre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import iris from '../../patterns/transitions/iris/pattern.js';

// A section of W x H layout pixels drawn at `scale` (the stage fits the frame to the window),
// holding slots by name with boxes in layout pixels.
function section(W, H, slots = {}, scale = 0.5) {
  const style = {};
  const api = {
    removeProperty(k) { delete style[k === 'clip-path' ? 'clipPath' : k]; },
  };
  const box = (x, y, w, h) => ({ left: x * scale, top: y * scale, width: w * scale, height: h * scale, right: (x + w) * scale, bottom: (y + h) * scale });
  return {
    style: new Proxy(style, { get: (o, k) => (k in api ? api[k] : o[k]), set: (o, k, v) => { o[k] = v; return true; } }),
    offsetWidth: W, offsetHeight: H,
    getAttribute: () => null, removeAttribute() {},
    getBoundingClientRect: () => box(0, 0, W, H),
    querySelector(sel) {
      const m = /^\[data-slot="([^"]+)"\]$/.exec(sel);
      const s = m && slots[m[1]];
      return s ? { getBoundingClientRect: () => box(...s) } : null;
    },
  };
}
const run = (p, format, params, el = section(1920, 1080)) => { iris.at(el, p, { format, params, to: el }); return el.style.clipPath; };

test('without a target the aperture is unchanged: the same clip-path at every progress, shape and format', () => {
  const table = [
    ['circle', '16x9', 0.25, 'circle(17.678% at 50% 50%)'],
    ['circle', '9x16', 0.5, 'circle(35.355% at 50% 50%)'],
    ['circle', '1x1', 0.9, 'circle(63.64% at 50% 50%)'],
    ['diamond', '16x9', 0.5, 'polygon(50% -19.444%, 89.063% 50%, 50% 119.444%, 10.938% 50%)'],
    ['diamond', '9x16', 0.25, 'polygon(50% 30.469%, 84.722% 50%, 50% 69.531%, 15.278% 50%)'],
    ['diamond', '1x1', 0.9, 'polygon(50% -40%, 140% 50%, 50% 140%, -40% 50%)'],
  ];
  for (const [shape, format, p, want] of table) {
    assert.equal(run(p, format, { shape }), want, `${shape} ${format} ${p}`);
    assert.equal(run(p, format, { shape, target: '' }), want, `${shape} ${format} ${p}, empty target`);
  }
  assert.equal(run(1, '16x9', { shape: 'circle' }), undefined, 'nothing is left at p = 1');
});

// The aperture's centre and radius, read back from what the pattern wrote.
const circleOf = (s) => { const m = /^circle\(([\d.]+)px at ([\d.]+)px ([\d.]+)px\)$/.exec(s); return m && { r: +m[1], x: +m[2], y: +m[3] }; };
const pointsOf = (s) => [...s.matchAll(/(-?[\d.]+)px (-?[\d.]+)px/g)].map((m) => [+m[1], +m[2]]);

test('a target centres the circle on the slot box and reaches the farthest corner before p = 1', () => {
  const el = section(1920, 1080, { logo: [200, 700, 300, 100] });
  const mid = circleOf(run(0.5, '16x9', { target: 'logo' }, el));
  assert.ok(mid, 'a circle in layout pixels');
  assert.ok(Math.abs(mid.x - 350) <= 2 && Math.abs(mid.y - 750) <= 2, `centred on the slot (${mid.x}, ${mid.y})`);
  const far = Math.hypot(1920 - 350, 750);
  const end = circleOf(run(0.999, '16x9', { target: 'logo' }, el));
  assert.ok(end.r >= far * 0.999 - 1, `the circle reaches the farthest corner (${end.r} vs ${far})`);
  assert.ok(Math.abs(mid.r - far / 2) < 1, 'the radius grows with p');
  assert.equal(circleOf(run(0, '16x9', { target: 'logo' }, el)).r, 0, 'no area at p = 0');
});

test('a target centres the diamond on the slot box, and its corners reach every frame corner at the end', () => {
  const el = section(1080, 1920, { cta: [140, 1500, 800, 200] });
  const pts = pointsOf(run(0.999, '9x16', { shape: 'diamond', target: 'cta' }, el));
  assert.equal(pts.length, 4);
  const cx = (pts[1][0] + pts[3][0]) / 2, cy = (pts[0][1] + pts[2][1]) / 2;
  assert.ok(Math.abs(cx - 540) <= 2 && Math.abs(cy - 1600) <= 2, `centred on the slot (${cx}, ${cy})`);
  const half = (pts[1][0] - pts[3][0]) / 2 / 0.999;   // the size it reaches at p = 1
  for (const [x, y] of [[0, 0], [1080, 0], [0, 1920], [1080, 1920]]) {
    assert.ok(Math.abs(x - cx) + Math.abs(y - cy) <= half + 1, `corner ${x},${y} inside the diamond`);
  }
});

test('a target that is missing, or has no box, falls back to the centred aperture', () => {
  const el = section(1920, 1080, { empty: [10, 10, 0, 0] });
  assert.equal(run(0.5, '16x9', { target: 'nope' }, el), 'circle(35.355% at 50% 50%)');
  assert.equal(run(0.5, '16x9', { target: 'empty' }, el), 'circle(35.355% at 50% 50%)');
});

test('a target that names no slot of the incoming scene is a kit warning, once; an existing slot without a box is not', () => {
  const warnings = [];
  const el = Object.assign(section(1920, 1080, { headline: [0, 0, 0, 0] }), { ownerDocument: { defaultView: { mm: { warnings } } }, getAttribute: (k) => (k === 'data-scene' ? 'b' : null) });
  run(0.3, '16x9', { target: 'hedline' }, el); run(0.6, '16x9', { target: 'hedline' }, el);
  assert.equal(warnings.length, 1, JSON.stringify(warnings));
  assert.match(warnings[0], /^transitions\/iris: .*"hedline".*scene b/);
  run(0.3, '16x9', { target: 'headline' }, el);
  assert.equal(warnings.length, 1);
});
