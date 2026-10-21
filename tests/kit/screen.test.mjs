// The screen fold: a screen's state at t is a fold over its beat's
// screen actions in start order, each reducing the state it receives at its own progress, so a
// later action always continues from wherever the earlier ones left the screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, fold, frameIndex, locate, view } from '../../runtime/kit/screen.js';

const SEQ = { kind: 'sequence', fps: 30, frames: 60, w: 660, h: 1430, duration: 2 };
const PAGE = { kind: 'page', viewport: { w: 390, h: 844, scale: 3 }, height: 20000, tiles: [], marks: { Pricing: { x: 0, y: 2000, w: 390, h: 400 }, Cta: { x: 95, y: 3000, w: 200, h: 50 } } };
// A stub scroll: linear from the incoming scrollY to params.y.
const scroll = { reduce: (s, p, c) => ({ ...s, scrollY: s.scrollY + (c.params.y - s.scrollY) * p }) };
const ctxOf = (e) => ({ params: e.action.params });
const timed = (...xs) => xs.map(([start, d, y]) => ({ action: { do: 'screen/scroll', params: { y } }, module: scroll, start, d }));

test('initialState reads the content kind and starts at rest', () => {
  const s = initialState('assets/rec/', SEQ);
  assert.equal(s.content.kind, 'sequence'); assert.equal(s.content.base, 'assets/rec/');
  assert.equal(s.frameTime, 0); assert.equal(s.scrollY, 0);
  assert.deepEqual(s.zoom, { x: 0.5, y: 0.5, s: 1 }); assert.deepEqual(s.swapping, []);
  assert.equal(initialState('assets/shot.png', null).content.kind, 'still');
  assert.equal(initialState('assets/site/', PAGE).content.kind, 'page');
});

test('fold before any action returns the initial state and nothing active', () => {
  const init = initialState('assets/site/', PAGE);
  const r = fold(init, timed([2, 1, 1000]), 1.5, ctxOf);
  assert.deepEqual(r.state, init); assert.equal(r.active.length, 0);
});

test('a scroll halfway through has covered half the distance', () => {
  const r = fold(initialState('assets/site/', PAGE), timed([2, 1, 1000]), 2.5, ctxOf);
  assert.equal(r.state.scrollY, 500);
  assert.equal(r.active.length, 1); assert.equal(r.active[0].p, 0.5);
});

test('two scrolls compose: the second starts from where the first ended', () => {
  const r = fold(initialState('assets/site/', PAGE), timed([0, 1, 1000], [2, 1, 3000]), 2.5, ctxOf);
  assert.equal(r.state.scrollY, 2000);
});

test('a finished action stays applied at p = 1 and is no longer active', () => {
  const r = fold(initialState('assets/site/', PAGE), timed([0, 1, 1000]), 5, ctxOf);
  assert.equal(r.state.scrollY, 1000); assert.equal(r.active.length, 0);
});

test('the sequence frame index is 1-based and holds the last frame past the clip', () => {
  const s = initialState('assets/rec/', SEQ);
  assert.equal(frameIndex({ ...s, frameTime: 0 }), 1);
  assert.equal(frameIndex({ ...s, frameTime: 1 }), 31);
  assert.equal(frameIndex({ ...s, frameTime: 5 }), 60);
  assert.equal(frameIndex({ ...s, frameTime: 10 }), 60);
  assert.equal(frameIndex({ ...s, frameTime: -1 }), 1);
});

test('a deck rest applies every action at or before it at p = 1', () => {
  // press n spans (n - 1, n]; an action on press n has start n - 1 and d 1
  const r = fold(initialState('assets/site/', PAGE), timed([0, 1, 1000], [1, 1, 3000], [2, 1, 9000]), 2, ctxOf);
  assert.equal(r.state.scrollY, 3000);
});

test('locate turns a mark or a percent point into screen fractions under the current scroll', () => {
  const box = { w: 390, h: 844 };
  const s = { ...initialState('assets/site/', PAGE), scrollY: 2600 };
  const c = locate(s, 'Cta', box);
  assert.ok(Math.abs(c.x - 195 / 390) < 1e-9); assert.ok(Math.abs(c.y - (3025 - 2600) / 844) < 1e-9);
  assert.deepEqual(locate(s, '25%,80%', box), { x: 0.25, y: 0.8 });
  assert.deepEqual(locate(s, 'Nope', box), { x: 0.5, y: 0.5 });   // G-PATTERN-REF names an unknown mark; drawing never throws
});

test('screen/play shows its from frame before it starts, so the picture never jumps', async () => {
  const play = (await import('../../patterns/screen/play/pattern.js')).default;
  const init = initialState('assets/rec/', SEQ);
  const e = { action: { do: 'screen/play', params: { from: 1.5 } }, module: play, start: 2, d: 1 };
  const ctx = () => ({ params: { from: 1.5, rate: 1 }, d: 1 });
  assert.equal(fold(init, [e], 1, ctx).state.frameTime, 1.5);
  // a later play does not pull the picture back before it starts
  const first = { action: { do: 'screen/play', params: { from: 0 } }, module: play, start: 0, d: 1 };
  const ctx2 = (x) => ({ params: x.action.params, d: 1 });
  assert.equal(fold(init, [first, { ...e, action: { do: 'screen/play', params: { from: 5 } } }], 1.5, ctx2).state.frameTime, 1);
});

// ---- screen/island: the island's size is folded like any screen state ----
import { spring } from '../../runtime/kit/springs.js';
import { ease } from '../../runtime/kit/ease.js';
const EDITORIAL = JSON.parse((await import('node:fs')).readFileSync(new URL('../../styles/presets/editorial.json', import.meta.url), 'utf8'));
const islandCtx = (e) => ({ params: e.action.params, d: e.d, islandRest: { w: 0.31, h: 0.035 },
  spring: (t, role) => spring(t, EDITORIAL.motion.spring[role]), ease: (n, p) => ease(n, p, EDITORIAL) });
const island = async () => (await import('../../patterns/screen/island/pattern.js')).default;
const act = (module, start, params) => ({ action: { do: 'screen/island', params }, module, start, d: 1 });

test('the island opens from rest toward w x h, its width ahead of its height', async () => {
  const m = await island();
  const s = fold(initialState('assets/rec/', SEQ), [act(m, 0, { w: 0.86, h: 0.12, text: 'Timer' })], 0.3, islandCtx).state.island;
  const pw = (s.w - 0.31) / (0.86 - 0.31), ph = (s.h - 0.035) / (0.12 - 0.035);
  assert.ok(pw > ph, `width ${pw} should lead height ${ph}`);
  const end = fold(initialState('assets/rec/', SEQ), [act(m, 0, { w: 0.86, h: 0.12, text: 'Timer' })], 1, islandCtx).state.island;
  assert.deepEqual([end.w, end.h, end.text], [0.86, 0.12, 'Timer']);
});

test('a close that starts mid-open continues from the open size, and a reopen mid-close from the closing size', async () => {
  const m = await island();
  const open = act(m, 0, { w: 0.86, h: 0.12 }), close = act(m, 0.5, { close: true }), reopen = act(m, 1.0, { w: 0.6, h: 0.1 });
  const at = (t, list) => fold(initialState('assets/rec/', SEQ), list, t, islandCtx).state.island;
  const midOpen = at(0.5, [open]);
  const closeStart = at(0.5, [open, close]);
  assert.ok(Math.abs(closeStart.w - midOpen.w) < 1e-9 && Math.abs(closeStart.h - midOpen.h) < 1e-9, 'the close jumped');
  const midClose = at(1.0, [open, close]);
  const reopenStart = at(1.0, [open, close, reopen]);
  assert.ok(Math.abs(reopenStart.w - midClose.w) < 1e-9 && Math.abs(reopenStart.h - midClose.h) < 1e-9, 'the reopen jumped');
  const closed = at(9, [open, close]);
  assert.deepEqual([closed.w, closed.h, closed.text], [0.31, 0.035, '']);
});

test('a zoom never shows what lay outside the screen: its centre is clamped so the view covers the screen', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const v = view({ x: 0.5, y: 0.05, s: 1.4 });
  assert.ok(near(v.y, 0.5 / 1.4), `y ${v.y}`);
  assert.ok(near(v.x, 0.5));
  assert.deepEqual(view({ x: 0.9, y: 0.2, s: 1 }), { x: 0.5, y: 0.5, s: 1 }, 'at s = 1 the view is the screen');
  const mid = { x: 0.5, y: 0.5, s: 2 };
  assert.deepEqual(view(mid), mid, 'a centre well inside is kept');
  // a mark near the top of the screen, zoomed on, stays near the top instead of moving to the middle
  const state = { content: { kind: 'still', meta: null }, scrollY: 0, zoom: { x: 0.5, y: 0.05, s: 1.4 } };
  const at = locate(state, '50%,5%', { w: 100, h: 200 });
  assert.ok(at.y < 0.1, `the mark moved to y ${at.y}`);
});
