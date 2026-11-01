// runtime/kit/diagram.js: the text grammar and the pure helpers the structure-diagram patterns share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { items, parseTree, separate, span, clock, LOOK, lookVars, edgePlan } from '../../runtime/kit/diagram.js';

test('items splits on | > , and newlines, trims, drops empties', () => {
  assert.deepEqual(items('Plan|Do > Check,Act'), ['Plan', 'Do', 'Check', 'Act']);
  assert.deepEqual(items(' a ||b\n\nc, '), ['a', 'b', 'c']);
  assert.deepEqual(items(''), []);
  assert.deepEqual(items(undefined), []);
});

test('parseTree: > prefixes give the depth, a comma lists siblings, a node belongs to the last shallower one', () => {
  const t = parseTree('CEO|>Product|>>Design,Research|>Engineering|>>Platform');
  assert.deepEqual(t.map((n) => [n.text, n.depth, n.parent?.text ?? null]), [
    ['CEO', 0, null], ['Product', 1, 'CEO'], ['Design', 2, 'Product'], ['Research', 2, 'Product'],
    ['Engineering', 1, 'CEO'], ['Platform', 2, 'Engineering'],
  ]);
  assert.deepEqual(t[0].children.map((n) => n.text), ['Product', 'Engineering']);
  assert.deepEqual(t[1].children.map((n) => n.text), ['Design', 'Research']);
});

test('parseTree: the shape of a flow, root|a,b,c, is a root with three children', () => {
  const t = parseTree('Brief|>Design,Build,Test');
  assert.deepEqual(t.map((n) => n.depth), [0, 1, 1, 1]);
  assert.equal(t[0].children.length, 3);
});

test('parseTree: indentation (two spaces a level) works on lines, and a level cannot be skipped', () => {
  const t = parseTree('Root\n  A\n    A1\n  B\n        deep');
  assert.deepEqual(t.map((n) => [n.text, n.depth]), [['Root', 0], ['A', 1], ['A1', 2], ['B', 1], ['deep', 2]]);
});

test('parseTree: a second root becomes a child of the first; the count is capped', () => {
  const t = parseTree('A|B|>C');
  assert.deepEqual(t.map((n) => [n.text, n.depth, n.parent?.text ?? null]), [['A', 0, null], ['B', 1, 'A'], ['C', 1, 'A']]);
  assert.equal(parseTree(Array.from({ length: 40 }, (_, i) => `n${i}`).join('|')).length, 16);
  assert.deepEqual(parseTree(''), []);
});

test('span maps a range of q to 0..1 and clamps', () => {
  assert.equal(span(0.5, 0.25, 0.75), 0.5);
  assert.equal(span(0, 0.25, 0.75), 0);
  assert.equal(span(1, 0.25, 0.75), 1);
});

test('clock: p = 1 is exactly 1; a beat reads its own seconds over its length; else p', () => {
  assert.equal(clock(1, { u: 0.1, d: 1 }), 1);
  assert.equal(clock(0.2, { u: 0.5, d: 2 }), 0.25);
  assert.equal(clock(0.2, { u: Infinity, d: 2 }), 1);
  assert.equal(clock(0.4, {}), 0.4);
});

test('separate pushes overlapping boxes apart inside the bounds and leaves clear ones alone', () => {
  const boxes = [{ x: 100, y: 100, w: 80, h: 40 }, { x: 110, y: 105, w: 80, h: 40 }, { x: 400, y: 300, w: 60, h: 30 }];
  const out = separate(boxes, { w: 500, h: 400 }, 8);
  const clear = (a, b) => Math.abs(a.x - b.x) >= (a.w + b.w) / 2 + 8 - 0.01 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2 + 8 - 0.01;
  assert.ok(clear(out[0], out[1]));
  assert.deepEqual([out[2].x, out[2].y], [400, 300]);
  for (const b of out) assert.ok(b.x - b.w / 2 >= 0 && b.x + b.w / 2 <= 500 && b.y - b.h / 2 >= 0 && b.y + b.h / 2 <= 400);
  assert.deepEqual(separate(boxes, { w: 500, h: 400 }, 8), out, 'the same input gives the same output');
});

test('a fixed box does not move', () => {
  const out = separate([{ x: 100, y: 100, w: 80, h: 40, fixed: true }, { x: 110, y: 105, w: 80, h: 40 }], { w: 500, h: 400 }, 8);
  assert.deepEqual([out[0].x, out[0].y], [100, 100]);
  assert.ok(Math.abs(out[1].x - 100) >= 88 - 0.01 || Math.abs(out[1].y - 100) >= 48 - 0.01);
});

test('LOOK names the brand knobs every diagram shares, and lookVars turns them into palette-role variables', () => {
  assert.deepEqual(Object.keys(LOOK), ['shape', 'line', 'accent', 'edge', 'face']);
  const v = lookVars({ shape: 'disc', line: 0.01, accent: 'ink', edge: 'line', face: 'mono' });
  assert.equal(v['--dg-radius'], 'var(--mm-radius-4)');
  assert.equal(v['--dg-accent'], 'var(--mm-color-ink)');
  assert.equal(v['--dg-accent-ink'], 'var(--mm-color-canvas)');
  assert.equal(v['--dg-edge'], 'var(--mm-color-line)');
  assert.equal(v['--dg-face'], 'var(--mm-font-mono)');
  assert.equal(v['--dg-line'], '0.01');
  const d = lookVars({});
  assert.equal(d['--dg-radius'], 'var(--mm-radius-2)');
  assert.equal(d['--dg-accent'], 'var(--mm-color-accent)');
  assert.equal(d['--dg-accent-ink'], 'var(--mm-color-accentInk)');
  assert.equal(lookVars({ accent: 'neon' })['--dg-accent'], 'var(--mm-color-accent)', 'an unknown role falls back');
  assert.equal(lookVars({ line: 9 })['--dg-line'], '0.02', 'the stroke share is clamped');
});

test('edgePlan: an edge draws on from nothing with no head, then grows a head trimmed by half its size', () => {
  const d = 'M 0 0 L 400 0';
  let e = edgePlan(d, 0, { head: 'end', size: 24 });
  assert.equal(e.hidden, true, 'nothing at q = 0, so no dot from a round cap');
  assert.equal(e.heads.length, 0);
  e = edgePlan(d, 1, { head: 'end', size: 24 });
  assert.equal(e.heads.length, 1);
  assert.ok(Math.abs(e.heads[0].x - 400) < 1e-6 && Math.abs(e.heads[0].y) < 1e-6, 'the tip is on the end of the path');
  assert.ok(Math.abs(e.heads[0].angle) < 1e-9, 'pointing along the line');
  assert.ok(Math.abs(e.window.b - (1 - 12 / 400)) < 1e-9, 'the line stops half a head short');
  e = edgePlan(d, 0.05, { head: 'end', size: 24 });
  assert.ok(Math.abs(e.heads[0].size - 10) < 1e-9, 'a short line carries a small head');
});

test('edgePlan: a head at the start points back along the path; a head on a curve follows the tangent', () => {
  const e = edgePlan('M 0 0 L 100 0', 1, { head: 'both', size: 10 });
  const start = e.heads.find((h) => h.at === 'start'), end = e.heads.find((h) => h.at === 'end');
  assert.ok(Math.abs(Math.abs(start.angle) - Math.PI) < 1e-9);
  assert.ok(Math.abs(end.angle) < 1e-9);
  const c = edgePlan('M 0 0 C 0 100 100 100 100 0', 1, { head: 'end', size: 10 });
  assert.ok(Math.abs(c.heads[0].angle - -Math.PI / 2) < 1e-6, 'the curve ends going up the page');
  assert.ok(Math.abs(c.heads[0].x - 100) < 1e-6);
});
