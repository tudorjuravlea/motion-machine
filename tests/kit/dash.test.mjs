// dash: a stroke drawn on by a dash window over a path of pathLength 1. No dot at progress 0 with round
// caps, a sliding "comet" window, a pen at constant speed, and arrowheads that trim the line by half their size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowAt, dashOf, headsOf, setDash } from '../../runtime/kit/dash.js';

const near = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('trail: the window grows from the start at constant speed', () => {
  assert.deepEqual(windowAt(0), { a: 0, b: 0 });
  assert.deepEqual(windowAt(1), { a: 0, b: 1 });
  for (let q = 0; q <= 1; q += 0.1) { const w = windowAt(q); near(w.a, 0); near(w.b, q); }
  const w = windowAt(0.5, { from: 0.2, to: 0.8 });
  near(w.a, 0.2); near(w.b, 0.5, 1e-12, 'half of the way from 0.2 to 0.8');
});

test('trail: progress outside 0..1 is clamped', () => {
  assert.deepEqual(windowAt(-3), { a: 0, b: 0 });
  assert.deepEqual(windowAt(7), { a: 0, b: 1 });
});

test('comet: a segment of fixed share enters, slides and leaves, at the same speed as the trail head', () => {
  const c = 0.2;
  assert.deepEqual(windowAt(0, { comet: c }), { a: 0, b: 0 });
  near(windowAt(0.25, { comet: c }).b, 0.25 * 1.2);
  const mid = windowAt(0.5, { comet: c });
  near(mid.b - mid.a, c, 1e-12, 'in full flight it is as long as asked');
  const out = windowAt(0.9, { comet: c });
  assert.ok(out.b === 1 && out.b - out.a < c, 'leaving, it shortens');
  assert.deepEqual(windowAt(1, { comet: c }), { a: 1, b: 1 });
  // head positions are linear in q: constant speed
  let prev = windowAt(0, { comet: c }).b;
  for (let q = 0.05; q <= 0.8; q += 0.05) { const b = windowAt(q, { comet: c }).b; near(b - prev, 0.05 * 1.2, 1e-12); prev = b; }
});

test('dashOf: nothing is drawn at an empty window, so a round cap leaves no dot at progress 0', () => {
  assert.equal(dashOf({ a: 0, b: 0 }).hidden, true);
  assert.equal(dashOf({ a: 1, b: 1 }).hidden, true);
  assert.equal(dashOf({ a: 0.4, b: 0.4 + 1e-9 }).hidden, true);
  assert.equal(dashOf({ a: 0, b: 0.001 }).hidden, false);
});

test('dashOf: one dash of the window length starting at a, and no second dash on the path', () => {
  const d = dashOf({ a: 0.25, b: 0.6 });
  const [dash, gap] = d.array.split(' ').map(Number);
  near(dash, 0.35, 1e-6);
  assert.ok(gap >= 1, 'the gap is long enough that the pattern does not repeat inside the path');
  near(d.offset, -0.25, 1e-6, 'the dash begins at a');
  // a dash pattern repeats every dash+gap from the offset: the next dash starts beyond the path
  assert.ok(0.25 + dash + gap > 1 && 0.25 - (dash + gap) < 0);
  const full = dashOf({ a: 0, b: 1 });
  near(Number(full.array.split(' ')[0]), 1, 1e-6);
  near(full.offset, 0, 1e-12);
});

test('setDash writes pathLength, the dash and the offset on a node, and hides it when empty', () => {
  const log = {};
  const node = { setAttribute: (k, v) => { log[k] = v; }, style: {} };
  setDash(node, { a: 0, b: 0 });
  assert.equal(node.style.visibility, 'hidden');
  assert.equal(log.pathLength, '1');
  setDash(node, { a: 0.1, b: 0.5 });
  assert.equal(node.style.visibility, '');
  assert.match(node.style.strokeDasharray, /^0\.4\d* \d/);
  assert.match(String(node.style.strokeDashoffset), /^-0\.1/);
});

test('arrowheads: the line stops half a head short of the tip, and a head never outgrows half the line it is on', () => {
  const len = 400, size = 24;
  let h = headsOf({ a: 0, b: 1 }, { len, size, head: 'end' });
  near(h.size, 24);
  near(h.window.b, 1 - 12 / len, 1e-9, 'trimmed by half the head size at the head end');
  near(h.window.a, 0);
  assert.deepEqual(h.heads.map((x) => x.at), ['end']);
  near(h.heads[0].t, 1);
  // early in the draw the visible line is short: the head is at most half of it
  h = headsOf({ a: 0, b: 0.05 }, { len, size, head: 'end' });
  near(h.size, 10, 1e-9, '20 px visible, a head of at most 10');
  near(h.window.b, 0.05 - 5 / len, 1e-9);
  // both ends
  h = headsOf({ a: 0, b: 1 }, { len, size, head: 'both' });
  near(h.window.a, 12 / len, 1e-9);
  near(h.window.b, 1 - 12 / len, 1e-9);
  assert.deepEqual(h.heads.map((x) => x.at).sort(), ['end', 'start']);
  near(h.heads.find((x) => x.at === 'start').t, 0);
  // no line yet: no head
  h = headsOf({ a: 0, b: 0 }, { len, size, head: 'end' });
  assert.equal(h.heads.length, 0);
  // no head asked for: the window is untouched
  h = headsOf({ a: 0, b: 1 }, { len, size, head: 'none' });
  assert.deepEqual(h.window, { a: 0, b: 1 });
  assert.equal(h.heads.length, 0);
});

test('a comet carries its head at the window end, trimmed the same way', () => {
  const h = headsOf({ a: 0.3, b: 0.5 }, { len: 1000, size: 24, head: 'end' });
  near(h.heads[0].t, 0.5);
  near(h.window.b, 0.5 - 12 / 1000);
  near(h.size, 24);
});
