// Stagger v2 (SPEC §6): grid [cols, rows(, layers)], radial distance from an origin, an axis, amount or each, a seeded
// random order, a jitter ramp, `use`, `total`, ease-then-reverse. The old 1-D forms (first, center, last, index,
// ease, cap) give the same offsets as before: tests/kit/motion-baseline.test.mjs compares them bit for bit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { staggerValues, staggerOffsets, distribute } from '../../runtime/kit/stagger.js';
import { stagger, clip, schedule } from '../../runtime/kit/schedule.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const rounded = (a) => a.map((x) => +x.toFixed(2));

test("the anime fixtures: a 5 x 3 grid from the centre, in units of one step (22.4, 14.1, 10 at 10 per step)", () => {
  const v = staggerValues(15, { grid: [5, 3], from: 'center' }).values;
  // row by row; the centre is (2, 1)
  assert.deepEqual(rounded(v), [2.24, 1.41, 1, 1.41, 2.24, 2, 1, 0, 1, 2, 2.24, 1.41, 1, 1.41, 2.24]);
  const t = staggerOffsets(15, { grid: [5, 3], from: 'center', each: 10 });
  close(t[0], 22.36, 0.05, 'the corners: 22.4');
  close(t[1], 14.14, 0.05, 'a diagonal neighbour: 14.1');
  close(t[2], 10, 1e-9, 'straight above the centre: 10');
  assert.equal(t[7], 0, 'the centre goes first');
  close(Math.max(...staggerOffsets(15, { grid: [5, 3], from: [1, 1], each: 10 })), 44.72, 0.05, 'from the far corner: 44.7');
  close(Math.max(...staggerOffsets(8, { grid: [2, 2, 2], each: 10 })), 17.32, 0.05, 'a 2 x 2 x 2 block from the first: 17.32');
});

test('origins on a grid: first, last, an index, a ratio pair, centre, edges', () => {
  const g = (from) => staggerValues(12, { grid: [4, 3], from }).values;
  assert.deepEqual(g('first').slice(0, 4).map((x) => +x.toFixed(3)), [0, 1, 2, 3]);
  assert.equal(g('last')[11], 0);
  assert.equal(g(5)[5], 0, 'index 5 is (1, 1)');
  assert.deepEqual(g([0, 0]), g('first'));
  assert.deepEqual(g([1, 1]), g('last'));
  assert.deepEqual(g([0.5, 0.5]), g('center'), 'the ratio pair 0.5, 0.5 is the centre');
  const e = g('edges');
  assert.equal(e[0], 0); assert.equal(e[3], 0); assert.equal(e[8], 0);
  assert.equal(e[5], 1, 'the middle row of 3, second column: one in from the edge');
  assert.equal(Math.max(...e), 1);
  // edges on a row: the ends first, the middle last
  assert.deepEqual(staggerValues(7, { from: 'edges' }).values, [0, 1, 2, 3, 2, 1, 0]);
});

test('an axis spreads along one direction only, from any origin, without negative values', () => {
  const x = staggerValues(12, { grid: [4, 3], axis: 'x' }).values;
  assert.deepEqual(x, [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
  const y = staggerValues(12, { grid: [4, 3], axis: 'y' }).values;
  assert.deepEqual(y, [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]);
  const last = staggerValues(12, { grid: [4, 3], axis: 'x', from: 'last' }).values;
  assert.deepEqual(last, [3, 2, 1, 0, 3, 2, 1, 0, 3, 2, 1, 0]);
  const mid = staggerValues(12, { grid: [4, 3], axis: 'y', from: 'center' }).values;
  assert.deepEqual(mid, [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1]);
  for (const v of [x, y, last, mid]) assert.ok(v.every((q) => q >= 0));
  const z = staggerValues(8, { grid: [2, 2, 2], axis: 'z' }).values;
  assert.deepEqual(z, [0, 0, 0, 0, 1, 1, 1, 1]);
});

test('each is the step per unit, amount is the whole spread', () => {
  const each = staggerOffsets(5, { each: 0.1 });
  assert.deepEqual(each.map((x) => +x.toFixed(9)), [0, 0.1, 0.2, 0.3, 0.4]);
  const amount = staggerOffsets(5, { amount: 1 });
  assert.deepEqual(amount, [0, 0.25, 0.5, 0.75, 1]);
  const grid = staggerOffsets(15, { grid: [5, 3], from: 'center', amount: 2 });
  close(Math.max(...grid), 2, 1e-12);
  assert.equal(Math.min(...grid), 0);
  assert.deepEqual(staggerOffsets(5, { each: 0.1, start: 0.5 }).map((x) => +x.toFixed(9)), [0.5, 0.6, 0.7, 0.8, 0.9]);
});

test('the 1-D normaliser: with an ease, the last item reaches the full eased delay', () => {
  for (const n of [2, 3, 7, 12]) {
    const o = staggerOffsets(n, { each: 0.1, ease: 'quad.in' });
    close(o[n - 1], 0.1 * (n - 1), 1e-12, `n=${n}: the last item`);
    close(o[0], 0, 1e-12);
  }
  const mid = staggerOffsets(5, { each: 1, ease: (x) => x * x });
  assert.deepEqual(mid.map((x) => +x.toFixed(9)), [0, 0.25, 1, 2.25, 4]);
  // ease by name works the same
  assert.deepEqual(staggerOffsets(5, { each: 1, ease: 'quad.in' }).map((x) => +x.toFixed(9)), [0, 0.25, 1, 2.25, 4]);
});

test('ease then reverse: the order flips after the ease has bent the spacing', () => {
  const a = staggerOffsets(5, { each: 1, ease: (x) => x * x, reverse: true });
  assert.deepEqual(a.map((x) => +x.toFixed(9)), [4, 3.75, 3, 1.75, 0]);
  assert.deepEqual(staggerOffsets(5, { each: 1, reverse: true }), [4, 3, 2, 1, 0]);
  const g = staggerValues(12, { grid: [4, 3], from: 'first', reverse: true }).values;
  assert.equal(g[11], 0);
  assert.equal(g[0], Math.hypot(3, 2));
});

test('random: a seeded order, every step used once, the same in any seek order', () => {
  const a = staggerOffsets(8, { each: 1, from: 'random', seed: 3 }), b = staggerOffsets(8, { each: 1, from: 'random', seed: 3 });
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort((p, q) => p - q), [0, 1, 2, 3, 4, 5, 6, 7], 'a permutation of the steps');
  assert.notDeepEqual(a, staggerOffsets(8, { each: 1, from: 'random', seed: 4 }));
  assert.notDeepEqual(a, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(staggerOffsets(8, { each: 1, from: 'random' }), staggerOffsets(8, { each: 1, from: 'random', seed: 0 }), 'seed defaults to 0');
  assert.deepEqual(staggerOffsets(6, { each: 1, from: 'random', seed: 'cards' }), staggerOffsets(6, { each: 1, from: 'random', seed: 'cards' }));
});

test('jitter: a seeded wobble whose size ramps with the delay', () => {
  const flat = staggerOffsets(10, { each: 0.1, jitter: 0.02, seed: 1 }), plain = staggerOffsets(10, { each: 0.1 });
  const d = flat.map((x, i) => x - plain[i]);
  assert.ok(d.every((x) => Math.abs(x) <= 0.02 + 1e-12));
  assert.ok(d.some((x) => Math.abs(x) > 1e-4), 'it moves things');
  assert.deepEqual(flat, staggerOffsets(10, { each: 0.1, jitter: 0.02, seed: 1 }));
  assert.notDeepEqual(flat, staggerOffsets(10, { each: 0.1, jitter: 0.02, seed: 2 }));
  // a ramp [0, 0.05]: none on the first, up to 0.05 on the last
  const ramp = staggerOffsets(10, { each: 0.1, jitter: [0, 0.05], seed: 7 });
  assert.equal(ramp[0], 0);
  assert.ok(Math.abs(ramp[9] - plain[9]) <= 0.05 + 1e-12);
  // nothing starts before the cascade does
  assert.ok(staggerOffsets(10, { each: 0.01, jitter: 0.5, seed: 1 }).every((x) => x >= 0));
});

test('use: rank the items by a data value; total: lay the grid out for more slots than items', () => {
  const bars = staggerOffsets(5, { each: 1, use: [30, 10, 50, 20, 40] });
  assert.deepEqual(bars, [2, 0, 4, 1, 3], 'the smallest value goes first');
  assert.deepEqual(staggerOffsets(4, { each: 1, use: [5, 5, 5, 5] }), [0, 1, 2, 3], 'ties keep their order');
  assert.deepEqual(staggerOffsets(3, { each: 1, use: [2, NaN, 1] }), [1, 2, 0], 'a value that is not a number goes last');
  // 3 items in a row of 5 slots from the centre: the slots, not the items, set the distances
  assert.deepEqual(staggerOffsets(3, { each: 1, from: 'center', total: 5 }), [2, 1, 0]);
  assert.deepEqual(staggerOffsets(3, { each: 1, from: 'last', total: 5 }), [4, 3, 2]);
});

test('distribute: spread any value over the items by the same geometry', () => {
  assert.deepEqual(distribute(5, [0, 1]), [0, 0.25, 0.5, 0.75, 1]);
  const v = distribute(5, [0.5, 3], { from: 'center', ease: 'quad.out' });
  close(v[2], 0.5, 1e-12, 'the middle keeps the first value');
  close(v[0], 3, 1e-12, 'the edges reach the last');
  assert.deepEqual(distribute(3, [10, 10]), [10, 10, 10]);
  assert.deepEqual(distribute(1, [4, 9]), [4]);
});

test('degenerate: no items, one item, no spread', () => {
  assert.deepEqual(staggerOffsets(0, { each: 1 }), []);
  assert.deepEqual(staggerOffsets(1, { each: 1, start: 0.3 }), [0.3]);
  assert.deepEqual(staggerOffsets(4, { each: 1, from: 'center', grid: [1, 1] }).length, 4);
  assert.throws(() => staggerOffsets(3, { each: 1, ease: 'nope' }), TypeError);
  assert.throws(() => staggerOffsets(3, { each: 1, from: 'sideways' }), TypeError);
  assert.throws(() => staggerOffsets(3, { each: 1, axis: 'w' }), TypeError);
});

test('the cap bounds the whole spread: the step shrinks, the order stays', () => {
  const o = staggerOffsets(11, { each: 0.1, cap: 0.6 });
  close(Math.max(...o), 0.6, 1e-12);
  assert.deepEqual(staggerOffsets(5, { each: 0.1, cap: 5 }).map((x) => +x.toFixed(9)), [0, 0.1, 0.2, 0.3, 0.4]);
  close(Math.max(...staggerOffsets(15, { grid: [5, 3], from: 'center', each: 0.5, cap: 0.6 })), 0.6, 1e-12);
});

test('schedule.stagger takes the new options and keeps the old ones', () => {
  const items = Array.from({ length: 6 }, () => clip(0.4));
  assert.deepEqual(stagger(0.1, items, { from: 'edges' }).offsets.map((x) => +x.toFixed(9)), [0, 0.1, 0.2, 0.2, 0.1, 0]);
  assert.deepEqual(stagger(1, items, { from: 'random', seed: 5 }).offsets, staggerOffsets(6, { each: 1, from: 'random', seed: 5 }));
  assert.deepEqual(stagger(0.1, items, { grid: [3, 2], axis: 'y' }).offsets.map((x) => +x.toFixed(9)), [0, 0, 0, 0.1, 0.1, 0.1]);
});

// ---- the cascade of a beat (params.stagger as an object, the brand's defaults in style.motion.stagger)

const editorial = JSON.parse(readFileSync(new URL('../../styles/presets/editorial.json', import.meta.url), 'utf8'));   // eachS 0.07, capS 0.6
const story = (params) => ({
  id: 'c', kind: 'film', formats: ['16x9'], title: 'c', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null },
  scenes: [{ id: 's', layout: 'layouts/statement', duration: 8, cut: 'transitions/hard-cut', move: null, say: '',
    beats: [{ at: 0.4, slot: 'headline', fx: 'entrances/fade', text: 'a | b | c | d | e | f', params: { each: true, ...params } }] }],
});
const itemOf = (s) => s.items.find((x) => x.each);

test('a cascade beat may give params.stagger as an object: each, from, ease, grid, axis, seed', () => {
  const plain = itemOf(schedule(story({}), editorial)).each.offsets;
  assert.deepEqual(plain.map((x) => +x.toFixed(3)), [0, 0.07, 0.14, 0.21, 0.28, 0.35]);
  const centre = itemOf(schedule(story({ stagger: { each: 0.1, from: 'center' } }), editorial)).each;
  assert.deepEqual(centre.offsets, [0.25, 0.15, 0.05, 0.05, 0.15, 0.25].map((x) => +x.toFixed(3)));
  assert.equal(centre.step, 0.05, 'step is the capped span over n - 1');
  assert.equal(centre.total, +(0.25 + editorial.motion.durations.standard / 1000).toFixed(3));
  const grid = itemOf(schedule(story({ stagger: { each: 0.1, grid: [3, 2], from: 'first' } }), editorial)).each.offsets;
  assert.deepEqual(grid, [0, 0.1, 0.2, 0.1, 0.141, 0.224]);
  const seeded = itemOf(schedule(story({ stagger: { each: 0.1, from: 'random', seed: 2 } }), editorial)).each.offsets;
  assert.deepEqual([...seeded].sort((a, b) => a - b), [0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  assert.deepEqual(seeded, itemOf(schedule(story({ stagger: { each: 0.1, from: 'random', seed: 2 } }), editorial)).each.offsets);
  // a bare number is still the gap in seconds, and the cascade still stops at capS
  assert.deepEqual(itemOf(schedule(story({ stagger: 0.15 }), editorial)).each.offsets, [0, 0.12, 0.24, 0.36, 0.48, 0.6]);
});

test('the brand sets its cascade order once: style.motion.stagger.from and .ease', () => {
  const style = structuredClone(editorial);
  style.motion.stagger = { ...style.motion.stagger, from: 'center', ease: 'quad.out' };
  const a = itemOf(schedule(story({}), style)).each.offsets;
  assert.ok(a[2] < a[0], 'from the centre');
  assert.deepEqual(a, itemOf(schedule(story({}), style)).each.offsets);
  // a beat's own object wins over the brand's
  const b = itemOf(schedule(story({ stagger: { from: 'first', ease: 'linear' } }), style)).each.offsets;
  assert.deepEqual(b.map((x) => +x.toFixed(3)), [0, 0.07, 0.14, 0.21, 0.28, 0.35]);
});

test('a cascade ease that does not parse falls back to linear with one warning', () => {
  const s = schedule(story({ stagger: { each: 0.1, ease: 'bak.out' } }), editorial);
  assert.deepEqual(itemOf(s).each.offsets.map((x) => +x.toFixed(3)), [0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  assert.equal(s.warnings.filter((w) => /easing/.test(w)).length, 1);
  const g = schedule(story({ stagger: { each: 0.1, from: 'sideways' } }), editorial);
  assert.equal(g.warnings.filter((w) => /stagger/.test(w)).length, 1);
});

test('stagger.js is pure: no clock, no randomness, no DOM', () => {
  const src = readFileSync(new URL('../../runtime/kit/stagger.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Date|Math\.random|performance|setTimeout|setInterval|requestAnimationFrame|document|window/);
});
