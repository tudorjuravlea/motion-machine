// transitions/brush-wipe without a browser: tilted painted bands with ragged ends sweep in until
// they cover the whole frame, the scenes swap under that cover, and the bands drag off the far
// side. The geometry is a pure function of the cut's time and the frame (the same polygons on
// every call); before the middle only the outgoing scene is drawn, from the middle only the
// incoming one; band colours are palette roles or blends of two roles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import brush, { geometry } from '../../patterns/transitions/brush-wipe/pattern.js';

// Even-odd point in polygon.
function inside([x, y], pts) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function grid(W, H, n = 48) {
  const out = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) out.push([(i / n) * W, (j / n) * H]);
  return out;
}
const covered = (W, H, l, params) => {
  const polys = geometry(W, H, l, params).map((b) => b.points);
  return grid(W, H).filter((pt) => polys.some((p) => inside(pt, p))).length / grid(W, H).length;
};

test('at the middle of the cut the bands cover every point of the frame, in every format and tilt', () => {
  for (const [W, H] of [[1920, 1080], [1080, 1920], [1080, 1080], [1080, 1350]]) {
    for (const params of [{}, { tilt: 15 }, { tilt: -15, bands: 3 }, { bands: 8, side: 'right' }]) {
      assert.equal(covered(W, H, 0.5, params), 1, `${W}x${H} ${JSON.stringify(params)}`);
    }
  }
});

test('the frame is clear at both ends of the cut and part covered between', () => {
  assert.equal(covered(1920, 1080, 0.001, {}), 0, 'nothing drawn yet');
  assert.equal(covered(1920, 1080, 0.999, {}), 0, 'everything dragged off');
  const a = covered(1920, 1080, 0.25, {}), b = covered(1920, 1080, 0.75, {});
  assert.ok(a > 0.05 && a < 0.95, `sweeping in at l = 0.25 (${a})`);
  assert.ok(b > 0.05 && b < 0.95, `dragging off at l = 0.75 (${b})`);
});

test('the bands sweep from the side they name', () => {
  const left = geometry(1920, 1080, 0.2, {}).flatMap((b) => b.points);
  const right = geometry(1920, 1080, 0.2, { side: 'right' }).flatMap((b) => b.points);
  const meanX = (pts) => pts.reduce((s, p) => s + p[0], 0) / pts.length;
  assert.ok(meanX(left) < 960 && meanX(right) > 960, `${meanX(left)} / ${meanX(right)}`);
});

test('the geometry is a pure function: the same polygons on every call, edges ragged', () => {
  const a = JSON.stringify(geometry(1920, 1080, 0.3, {}));
  for (let i = 0; i < 3; i++) assert.equal(JSON.stringify(geometry(1920, 1080, 0.3, {})), a);
  const lead = geometry(1920, 1080, 0.3, {})[0].points;
  const xs = new Set(lead.map((p) => Math.round(p[0])));
  assert.ok(xs.size > 6, 'the band ends are ragged, not straight');
});

test('band colours are palette roles or blends of two roles; unknown pairs fall back to accent', () => {
  const colours = (params) => [...new Set(geometry(1920, 1080, 0.5, params).map((b) => b.fill))];
  for (const c of [...colours({}), ...colours({ pair: 'ink' }), ...colours({ pair: 'muted' })]) {
    assert.match(c, /^var\(--mm-color-[a-zA-Z]+\)$|^color-mix\(in srgb, var\(--mm-color-[a-zA-Z]+\) \d+%, var\(--mm-color-[a-zA-Z]+\)\)$/, c);
  }
  assert.deepEqual(colours({ pair: 'neon' }), colours({}));
  assert.ok(colours({}).includes('var(--mm-color-accent)'));
});

// A section with a stub document, enough for the pattern to append its drawing.
function section() {
  const style = {}, kids = [];
  const node = () => {
    const n = { attrs: {}, kids: [], style: { setProperty() {} } };
    n.setAttribute = (k, v) => { n.attrs[k] = v; };
    n.append = (...c) => n.kids.push(...c);
    n.appendChild = (c) => n.kids.push(c);
    return n;
  };
  return {
    kids, raw: style,
    ownerDocument: { createElementNS: () => node() },
    style: new Proxy(style, { get: (o, k) => (k === 'removeProperty' ? (n) => delete o[n] : o[k]), set: (o, k, v) => { o[k] = v; return true; } }),
    offsetWidth: 1920, offsetHeight: 1080,
    getAttribute: () => null, removeAttribute() {},
    append(...c) { kids.push(...c); }, appendChild(c) { kids.push(c); },
  };
}
const hidden = (el) => el.style.opacity === '0' && el.style.visibility === 'hidden';

test('before the middle only the outgoing scene is drawn, with the bands on it; from the middle only the incoming one', () => {
  for (let i = 1; i < 40; i++) {
    const l = i / 40, from = section(), to = section();
    brush.at(to, l, { from, to, u: l * 0.6, d: 0.6, params: {} });
    if (l < 0.5) {
      assert.ok(hidden(to) && !hidden(from), `l = ${l}`);
      assert.equal(to.kids.length, 0);
      assert.equal(from.kids.length, 1, 'one drawing on the outgoing scene');
      assert.ok('data-mm-overlay' in from.kids[0].attrs, 'the drawing is an overlay the kit removes on every seek');
    } else {
      assert.ok(hidden(from) && !hidden(to), `l = ${l}`);
      assert.equal(from.kids.length, 0);
      assert.equal(to.kids.length, 1);
    }
  }
  const from = section(), to = section();
  brush.at(to, 1, { from, to, u: 0.6, d: 0.6, params: {} });
  assert.deepEqual([from.raw, to.raw, from.kids.length, to.kids.length], [{}, {}, 0, 0], 'nothing at p = 1');
});
