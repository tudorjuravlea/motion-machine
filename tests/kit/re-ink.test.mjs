// transitions/re-ink without a browser: two linear squeegee pulls with a ragged front. The first
// pulls the incoming scene over the outgoing one, printed in a second role set of the brand (the
// same palette, its roles swapped); the second re-inks that same geometry back into the brand's
// own roles. In the second pull the outgoing scene is hidden, the incoming scene is drawn as itself
// and a copy of it in the second role set (made after the seek, so it carries the drawn state)
// covers what the front has not reached yet. Role values are read from the style, never written as
// literals; at p = 1 nothing is left.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import reink, { front, ROLE_SETS, paints } from '../../patterns/transitions/re-ink/pattern.js';

const BASE = { canvas: 'c-canvas', ink: 'c-ink', muted: 'c-muted', surface: 'c-surface', line: 'c-line', accent: 'c-accent', accentInk: 'c-accentInk' };
const W = 1920, H = 1080;

function el(name, parent) {
  const style = {}, attrs = {};
  const api = {
    removeProperty(k) { delete style[k === 'clip-path' ? 'clipPath' : k]; },
    setProperty(k, v) { style[k] = String(v); },
    getPropertyValue(k) { return style[k] ?? ''; },
  };
  const node = {
    name, raw: style, attrs, parentNode: parent, nextSibling: null,
    style: new Proxy(style, { get: (o, k) => (k in api ? api[k] : o[k]), set: (o, k, v) => { o[k] = v; return true; } }),
    offsetWidth: W, offsetHeight: H,
    getAttribute: (k) => (k === 'style' ? (Object.keys(style).length ? 'x' : null) : attrs[k] ?? null),
    setAttribute: (k, v) => { attrs[k] = v; },
    removeAttribute: (k) => { delete attrs[k]; },
    cloneNode() { const c = el(`${name}-copy`, parent); Object.assign(c.raw, style); Object.assign(c.attrs, attrs); return c; },
  };
  return node;
}
// A stage holding the two sections, a computed style that resolves roles (overrides first), and a
// queue for afterSettle.
function stage() {
  const kids = [];
  const parent = { kids, insertBefore(n, ref) { const i = ref ? kids.indexOf(ref) : kids.length; kids.splice(i < 0 ? kids.length : i, 0, n); } };
  const from = el('from', parent), to = el('to', parent);
  kids.push(from, to);
  const view = { getComputedStyle: (n) => ({ getPropertyValue: (k) => n.raw[k] ?? BASE[k.replace('--mm-color-', '')] ?? '' }) };
  for (const n of [from, to]) n.ownerDocument = { defaultView: view };
  const late = [];
  return { parent, from, to, late };
}
function cut(l, params = {}) {
  const s = stage();
  reink.at(s.to, l, { from: s.from, to: s.to, params, u: l * 0.5, d: 0.5, afterSettle: (fn) => s.late.push(fn) });
  for (const fn of s.late) fn();
  return s;
}
const STILL = ['transform', 'opacity', 'visibility', 'clipPath', 'filter'];

test('first pull: the incoming scene is drawn behind the front in the second role set; the outgoing one is untouched', () => {
  const { from, to, parent } = cut(0.2);
  for (const k of STILL) assert.equal(from.raw[k], undefined, `outgoing ${k}`);
  assert.match(to.style.clipPath, /^polygon\(/);
  assert.equal(to.style.getPropertyValue('--mm-color-canvas'), 'c-ink', 'invert by default: the canvas takes the ink');
  assert.equal(to.style.getPropertyValue('--mm-color-ink'), 'c-canvas');
  assert.equal(parent.kids.length, 2, 'no copy in the first pull');
});

test('second pull: the outgoing scene is hidden, the incoming one is itself, a re-inked copy covers what the front has not reached', () => {
  const { from, to, parent } = cut(0.7);
  assert.equal(from.style.opacity, '0'); assert.equal(from.style.visibility, 'hidden');
  assert.equal(to.style.clipPath, undefined);
  assert.equal(to.style.getPropertyValue('--mm-color-canvas'), '', 'the incoming scene wears the brand\'s own roles');
  assert.equal(parent.kids.length, 3);
  const copy = parent.kids[2];
  assert.equal(parent.kids[1], to, 'the copy sits above the incoming scene');
  assert.ok('data-mm-overlay' in copy.attrs, 'the copy is an overlay the kit removes on every seek');
  assert.equal(copy.attrs['data-scene'], undefined, 'the copy is not a scene');
  assert.match(copy.style.clipPath, /^polygon\(/);
  assert.equal(copy.style.getPropertyValue('--mm-color-canvas'), 'c-ink');
});

test('the accent role set paints the scene on the accent with its ink; every value is one of the style\'s own roles', () => {
  const { to } = cut(0.2, { inks: 'accent' });
  assert.equal(to.style.getPropertyValue('--mm-color-canvas'), 'c-accent');
  assert.equal(to.style.getPropertyValue('--mm-color-ink'), 'c-accentInk');
  for (const set of Object.values(ROLE_SETS)) for (const [k, v] of Object.entries(set)) {
    assert.ok(k in BASE && v in BASE, `${k} -> ${v} maps role to role`);
  }
  const vals = Object.keys(to.raw).filter((k) => k.startsWith('--mm-color-')).map((k) => to.raw[k]);
  for (const v of vals) assert.ok(Object.values(BASE).includes(v), v);
});

// Even-odd point in polygon over the frame grid.
function share(pts) {
  let hit = 0, all = 0;
  for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) {
    const x = (i / 40) * W, y = (j / 40) * H;
    let c = false;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      const [xa, ya] = pts[a], [xb, yb] = pts[b];
      if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) c = !c;
    }
    hit += c; all++;
  }
  return hit / all;
}

test('each pull crosses the whole frame: nothing behind the front at its start, the whole frame at its end', () => {
  for (const side of ['left', 'right', 'top', 'bottom']) {
    assert.equal(share(front(W, H, 0, side).behind), 0, `${side} start`);
    assert.equal(share(front(W, H, 1, side).behind), 1, `${side} end`);
    assert.equal(share(front(W, H, 0, side).ahead), 1, `${side} ahead at start`);
    assert.equal(share(front(W, H, 1, side).ahead), 0, `${side} ahead at end`);
    const mid = share(front(W, H, 0.5, side).behind);
    assert.ok(mid > 0.3 && mid < 0.7, `${side} half way ${mid}`);
  }
});

test('the pull is linear (a squeegee does not ease) and its front is ragged', () => {
  const meanX = (x) => { const p = front(W, H, x, 'left').behind.slice(0, -2); return p.reduce((s, q) => s + q[0], 0) / p.length; };
  const d1 = meanX(0.4) - meanX(0.2), d2 = meanX(0.8) - meanX(0.6);
  assert.ok(Math.abs(d1 - d2) < 1e-6, `equal steps (${d1} vs ${d2})`);
  const xs = new Set(front(W, H, 0.5, 'left').behind.slice(0, -2).map((q) => Math.round(q[0])));
  assert.ok(xs.size > 8, 'ragged');
  assert.equal(JSON.stringify(front(W, H, 0.37, 'left')), JSON.stringify(front(W, H, 0.37, 'left')), 'a pure function');
});

test('at p = 1 nothing is left on either section and no copy is made', () => {
  const s = stage();
  reink.at(s.to, 1, { from: s.from, to: s.to, params: {}, u: 0.5, d: 0.5, afterSettle: (fn) => s.late.push(fn) });
  for (const fn of s.late) fn();
  assert.deepEqual([s.from.raw, s.to.raw, s.parent.kids.length], [{}, {}, 2]);
});

// A stage whose incoming scene draws on a canvas (3D, a screen, footage): a copy of it would show
// none of those pixels, so re-ink wipes with a plate in a palette role instead.
function canvasCut(l, params = {}) {
  const s = stage();
  s.to.querySelector = (sel) => (/canvas/.test(sel) ? { tagName: 'CANVAS' } : null);
  for (const n of [s.from, s.to]) n.ownerDocument.createElement = (tag) => Object.assign(el(`plate-${tag}`, s.parent), { className: '' });
  reink.at(s.to, l, { from: s.from, to: s.to, params, u: l * 0.5, d: 0.5, afterSettle: (fn) => s.late.push(fn) });
  for (const fn of s.late) fn();
  return s;
}
const plateOf = (s) => s.parent.kids.find((k) => k.name.startsWith('plate'));

test('into a scene with a canvas: no copy of the scene, a plate overlay in the second set\'s ground role behind the front', () => {
  const first = canvasCut(0.2);
  const plate = plateOf(first);
  assert.ok(plate, 'a plate is laid');
  assert.ok('data-mm-overlay' in plate.attrs, 'the kit removes it on every seek');
  assert.equal(plate.style.background, 'var(--mm-color-ink)', 'invert: the plate is the ink, the ground of the second set');
  assert.match(plate.style.clipPath, /^polygon\(/);
  assert.ok(first.to.style.visibility === 'hidden', 'the incoming scene waits under the plate in the first pull');
  for (const k of STILL) assert.equal(first.from.raw[k], undefined, `outgoing ${k}`);
  assert.equal(first.to.style.getPropertyValue('--mm-color-canvas'), '', 'no role swap on a scene with a canvas');
  assert.equal(plateOf(canvasCut(0.3, { inks: 'accent' })).style.background, 'var(--mm-color-accent)');
  const second = canvasCut(0.7);
  assert.ok(second.from.style.visibility === 'hidden', 'the outgoing scene is gone in the second pull');
  assert.equal(second.to.raw.visibility, undefined, 'the incoming scene is drawn as itself');
  assert.equal(second.parent.kids.filter((k) => k.name.endsWith('-copy')).length, 0, 'never a copy');
  assert.match(plateOf(second).style.clipPath, /^polygon\(/);
  const end = canvasCut(1);
  assert.equal(plateOf(end), undefined); assert.deepEqual(end.to.raw, {});
});

// What the incoming scene will hold is read from the story, not from the canvases present when the
// cut runs: a pattern that makes its canvas once it runs (after the cut has begun) still gets a plate.
function storyCut(l, { fx = [], move = null } = {}) {
  const s = stage();
  s.to.dataset = { scene: 'in' };
  s.to.querySelector = (sel) => (fx.some((f) => sel.split(', ').some((q) => q === `[data-fx="${f}"]` || (q === '[data-fx^="3d/"]' && f.startsWith('3d/')))) ? { tagName: 'DIV' } : null);
  for (const n of [s.from, s.to]) {
    n.ownerDocument.createElement = (tag) => Object.assign(el(`plate-${tag}`, s.parent), { className: '' });
    n.ownerDocument.defaultView.mm = { schedule: { scenes: [{ id: 'before', move: null }, { id: 'in', move }] } };
  }
  reink.at(s.to, l, { from: s.from, to: s.to, params: {}, u: l * 0.5, d: 0.5, scene: 'in', afterSettle: (fn) => s.late.push(fn) });
  for (const fn of s.late) fn();
  return s;
}

test('into a scene whose slot pattern or move draws on a canvas of its own: a plate wipe in both pulls, before any canvas exists', () => {
  for (const opts of [{ fx: ['3d/point-cloud'] }, { fx: ['entrances/photo-wake'] }, { move: 'moves/depth-parallax' }]) {
    for (const l of [0.2, 0.7]) {
      const s = storyCut(l, opts);
      assert.ok(plateOf(s), `${JSON.stringify(opts)} at ${l}: a plate`);
      assert.equal(s.parent.kids.filter((k) => k.name.endsWith('-copy')).length, 0, `${JSON.stringify(opts)} at ${l}: never a copy`);
    }
  }
  const plain = storyCut(0.7, { fx: ['entrances/rise'], move: 'moves/push-in' });
  assert.equal(plateOf(plain), undefined, 'a scene of type and shapes is copied, not plated');
  assert.equal(plain.parent.kids.filter((k) => k.name.endsWith('-copy')).length, 1);
});

test('every pattern that puts a canvas of its own into the page is one re-ink plates', () => {
  const root = join(import.meta.dirname, '../../patterns');
  const drawers = [];
  for (const g of readdirSync(root)) for (const n of readdirSync(join(root, g))) {
    const f = join(root, g, n, 'pattern.js');
    if (!existsSync(f)) continue;
    if (/canvas\.(className\s*=|setAttribute\(\s*'data-(media|3d)')/.test(readFileSync(f, 'utf8'))) drawers.push(`${g}/${n}`);
  }
  assert.ok(drawers.length >= 7, `found ${drawers.join(', ')}`);
  assert.deepEqual(drawers.filter((r) => !paints(r)), [], 'drawn on a canvas but copied by re-ink');
});
