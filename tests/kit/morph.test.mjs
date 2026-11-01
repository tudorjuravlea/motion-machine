// morph: the correspondence between two shapes, worked out once when the story is built, and sampled
// by t. Subpaths are paired by size and place, an unmatched piece grows from a point, the start point
// is the cyclic offset with the least squared distance, point counts are equalised by splitting the
// longest segments, anchors can be redistributed at equal arc length with corners kept, and a
// rotational option turns the shape about an origin without tearing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, shape, stringify, bbox, subArea, measure, lengthOf, transform } from '../../runtime/kit/pathkit.js';
import { plan, sample, sampleD, antiTear, pairSubs } from '../../runtime/kit/morph.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);
const CIRCLE = shape('circle', { cx: 100, cy: 100, r: 60 });
const SQUARE = shape('rect', { x: 40, y: 40, width: 120, height: 120 });
// an invented two-part mark: a bold block with a round hole (a counter), nothing from any brand
const MARK = parse('M30 30 H170 V170 H30 Z M100 70 a30 30 0 1 0 0.01 0 Z');
const area = (p) => p.subs.reduce((s, u) => s + subArea(u), 0);

test('plan: equal segment counts on every pair, and exact ends at q = 0 and q = 1', () => {
  for (const [a, b] of [[CIRCLE, SQUARE], [SQUARE, MARK], [MARK, CIRCLE]]) {
    const pl = plan(a, b);
    for (const u of pl.pairs) assert.equal(u.a.length, u.b.length);
    const s0 = sample(pl, 0), s1 = sample(pl, 1);
    near(lengthOf(s0, 64), lengthOf(a, 64), 1e-3 * lengthOf(a, 64), 'the start has the length of the first shape');
    near(lengthOf(s1, 64), lengthOf(b, 64), 1e-3 * lengthOf(b, 64), 'the end has the length of the second');
    near(Math.abs(area(s1)), Math.abs(area(b)), Math.abs(area(b)) * 2e-3 + 1e-6, 'the end has the area of the second');
  }
});

test('plan: a circle to a square keeps one piece, and the middle is between them in area', () => {
  const pl = plan(CIRCLE, SQUARE);
  assert.equal(pl.info.pieces, 1);
  assert.equal(pl.info.grown, 0);
  const mid = sample(pl, 0.5);
  assert.equal(mid.subs.length, 1);
  const a = Math.abs(area(mid)), lo = Math.PI * 60 * 60, hi = 120 * 120;
  assert.ok(a > lo * 0.9 && a < hi, `${lo} * 0.9 < ${a} < ${hi}`);
});

test('pairing: the biggest piece goes with the biggest, the counter with the counter', () => {
  const ring = parse('M0 0 H100 V100 H0 Z M30 30 H70 V70 H30 Z');
  const ring2 = parse('M200 200 H320 V320 H200 Z M230 230 H290 V290 H230 Z');
  const ps = pairSubs(ring, ring2);
  assert.deepEqual(ps.map((p) => [p.a, p.b]).sort(), [[0, 0], [1, 1]]);
  // listed in the other order, the pairing still matches by size
  const swapped = { subs: ring2.subs.slice().reverse() };
  const qs = pairSubs(ring, swapped);
  assert.deepEqual(qs.map((p) => [p.a, p.b]).sort(), [[0, 1], [1, 0]]);
});

test('pairing: an unmatched piece grows from a point, in either direction', () => {
  const one = plan(SQUARE, MARK);
  assert.equal(one.info.pieces, 2);
  assert.equal(one.info.grown, 1);
  const p0 = sample(one, 0);
  // at q = 0 the grown piece is a single point: its bounding box has no size
  const hole0 = p0.subs.map((u) => bbox({ subs: [u] })).sort((m, n) => m.w - n.w)[0];
  assert.ok(hole0.w < 1e-6 && hole0.h < 1e-6, `the new piece starts as a point (${hole0.w} x ${hole0.h})`);
  const p1 = sample(one, 1);
  const hole1 = p1.subs.map((u) => bbox({ subs: [u] })).sort((m, n) => m.w - n.w)[0];
  near(hole1.w, 60, 0.5);
  // the other way the counter shrinks to a point
  const back = plan(MARK, SQUARE);
  assert.equal(back.info.grown, 1);
  const e = sample(back, 1).subs.map((u) => bbox({ subs: [u] })).sort((m, n) => m.w - n.w)[0];
  assert.ok(e.w < 1e-6);
  // the point is on the shape the counter shrinks into (inside the square's box), not at the origin
  const pt = sample(back, 1).subs.find((u) => bbox({ subs: [u] }).w < 1e-6).segs[0];
  assert.ok(pt[0] >= 40 - 1e-6 && pt[0] <= 160 + 1e-6 && pt[1] >= 40 - 1e-6 && pt[1] <= 160 + 1e-6);
});

test('start point: the same circle begun on the other side morphs into itself without collapsing', () => {
  const c = shape('circle', { cx: 0, cy: 0, r: 50 });
  const flipped = parse(stringify(transform(c, [-1, 0, 0, -1, 0, 0]), 6));   // same circle, its path begins at the left
  const pl = plan(c, flipped);
  for (const q of [0.25, 0.5, 0.75]) {
    const m = measure(sample(pl, q));
    for (let f = 0; f <= 1; f += 0.05) near(Math.hypot(m.at(f).x, m.at(f).y), 50, 1, `radius at ${f} of ${q}`);
  }
});

test('winding: a circle run the other way still morphs into itself', () => {
  const c = shape('circle', { cx: 0, cy: 0, r: 50 });
  const back = parse(stringify({ subs: [{ closed: true, segs: c.subs[0].segs.slice().reverse().map((g) => [g[6], g[7], g[4], g[5], g[2], g[3], g[0], g[1]]) }] }, 6));
  assert.ok(area(back) < 0);
  const pl = plan(c, back);
  const m = measure(sample(pl, 0.5));
  for (let f = 0; f <= 1; f += 0.05) near(Math.hypot(m.at(f).x, m.at(f).y), 50, 1);
});

test('open paths: a line to a curve keeps the nearer ends together', () => {
  const a = parse('M0 0 L 100 0'), b = parse('M100 50 C 100 100 0 100 0 50');
  const pl = plan(a, b);
  const mid = sample(pl, 0.5).subs[0].segs;
  // the curve is run backwards so its near end (0,50) meets the line's start (0,0): the middle starts at (0,25)
  near(mid[0][0], 0, 1e-6);
  near(mid[0][1], 25, 1e-6);
  const swapped = plan(a, parse('M0 50 C 0 100 100 100 100 50'));
  near(sample(swapped, 0.5).subs[0].segs[0][0], 0, 1e-6, 'the near end pairs with the near end');
});

test('smoothing: anchors are redistributed at equal arc length, corners stay where they were', () => {
  const pl = plan(SQUARE, CIRCLE, { smoothing: 0.08 });
  const s0 = sample(pl, 0);
  const b0 = bbox(s0);
  near(b0.x, 40, 1e-6); near(b0.w, 120, 1e-6);
  // the four corners of the square are still anchors of the redistributed outline
  const anchors = s0.subs[0].segs.map((g) => [Math.round(g[0] * 1e3) / 1e3, Math.round(g[1] * 1e3) / 1e3]);
  for (const c of [[40, 40], [160, 40], [160, 160], [40, 160]]) assert.ok(anchors.some((p) => p[0] === c[0] && p[1] === c[1]), `corner ${c} kept`);
  // between corners the segments are of equal length (within a tenth) along the long edges
  const top = s0.subs[0].segs.filter((g) => g[1] === 40 && g[7] === 40).map((g) => Math.abs(g[6] - g[0]));
  assert.ok(top.length >= 2, 'the top edge is split');
  assert.ok(Math.max(...top) - Math.min(...top) < 0.1 * Math.max(...top) + 1e-9, 'equal arcs between corners');
  // and a bigger smoothing means fewer anchors
  const coarse = plan(SQUARE, CIRCLE, { smoothing: 0.4 });
  assert.ok(sample(coarse, 0).subs[0].segs.length < s0.subs[0].segs.length);
});

test('smoothing leaves the shape where it was: the redistributed circle is still a circle', () => {
  const pl = plan(CIRCLE, SQUARE, { smoothing: 0.05 });
  const m = measure(sample(pl, 0));
  for (let f = 0; f <= 1; f += 0.02) near(Math.hypot(m.at(f).x - 100, m.at(f).y - 100), 60, 0.5, `at ${f}`);
});

test('pure in t: the same instants give the same path forward and in reverse', () => {
  const pl = plan(CIRCLE, MARK, { smoothing: 0.05 });
  const qs = [0, 0.1, 0.33, 0.5, 0.77, 1];
  const fwd = qs.map((q) => sampleD(pl, q));
  const rev = qs.slice().reverse().map((q) => sampleD(pl, q)).reverse();
  assert.deepEqual(fwd, rev);
  const again = plan(CIRCLE, MARK, { smoothing: 0.05 });
  assert.deepEqual(qs.map((q) => sampleD(again, q)), fwd, 'the plan is a function of its inputs');
});

test('circle to square to the mark: both legs pair, every middle is a finite path', () => {
  const legs = [plan(CIRCLE, SQUARE), plan(SQUARE, MARK)];
  for (const pl of legs) for (let q = 0; q <= 1.0001; q += 0.05) {
    const d = sampleD(pl, Math.min(1, q));
    assert.ok(!/NaN|Infinity/.test(d), d.slice(0, 60));
    assert.ok(parse(d).subs.length >= 1);
  }
  // the second leg starts exactly where the first ended
  near(lengthOf(sample(legs[0], 1), 64), lengthOf(sample(legs[1], 0), 64), 1e-6 + 2e-3 * lengthOf(SQUARE, 64));
});

test('rotational: a thin bar turned a quarter keeps its length of reach all the way round', () => {
  const bar = shape('rect', { x: -50, y: -10, width: 100, height: 20 });
  const turned = shape('rect', { x: -10, y: -50, width: 20, height: 100 });
  const half = (pl) => { const b = bbox(sample(pl, 0.5)); return Math.max(b.w, b.h) / 2; };
  const straight = half(plan(bar, turned));
  const turning = half(plan(bar, turned, { rotate: true }));
  assert.ok(turning > 41 && turning < 44, `a bar turned 45 degrees reaches about 42.4, got ${turning}`);
  assert.ok(straight < 35, `a straight blend of the two folds in to ${straight}`);
});

test('rotational: the origin is a share of each shape\'s own box and moves from one to the other', () => {
  const a = shape('circle', { cx: 0, cy: 0, r: 10 }), b = shape('circle', { cx: 100, cy: 0, r: 10 });
  const pl = plan(a, b, { rotate: true, origin: [0.5, 0.5], originTo: [0.5, 0.5] });
  const mid = bbox(sample(pl, 0.5));
  near(mid.x + mid.w / 2, 50, 0.5, 'the shape passes through the middle');
  near(mid.w, 20, 1.5, 'and stays the same size');
});

test('antiTear: neighbours never turn opposite ways round', () => {
  const deg = (d) => (d * Math.PI) / 180;
  // 170, then -170 (a tear): the second goes the long way round, the same way as the first
  let out = antiTear([deg(170), deg(-170), deg(175), deg(-165)]);
  assert.deepEqual(out.map((x) => Math.sign(x)), [1, 1, 1, 1]);
  near(out[1], deg(190), 1e-9);
  // small and opposite turns are left as they are: they are not a tear
  out = antiTear([deg(20), deg(-20), deg(30)]);
  near(out[1], deg(-20), 1e-9);
  // nearly opposite neighbours (sum under 54 degrees) are linked, however large
  out = antiTear([deg(100), deg(-100)]);
  near(out[1], deg(260), 1e-9);
  // a large turn against a small one is taken the long way (over 126 degrees)
  out = antiTear([deg(30), deg(-150)]);
  near(out[1], deg(210), 1e-9);
  // 100 against 30 stays as it is (under 126 degrees, and the two do not cancel)
  out = antiTear([deg(30), deg(-100)]);
  near(out[1], deg(-100), 1e-9);
  // a missing angle (an anchor on the origin) is skipped and does not break the chain
  out = antiTear([deg(170), null, deg(-170)]);
  assert.equal(out[1], 0);
  near(out[2], deg(190), 1e-9);
});

test('a one-point or empty input gives an empty plan, not an error', () => {
  const none = plan('', '');
  assert.equal(sampleD(none, 0.5), '');
  const onlyFrom = plan(CIRCLE, '');
  assert.ok(sampleD(onlyFrom, 0).length > 0);
  assert.ok(Math.abs(bbox(sample(onlyFrom, 1)) === null ? 0 : bbox(sample(onlyFrom, 1)).w) < 1e-6, 'the circle shrinks to a point');
});
