// The pure maths behind the gauge, unit-grid, waterfall, bubble, versus, delta and swing patterns:
// what a value fills, the order units light in, where a waterfall's bars start and end, how big a
// circle is for its value, which way a change points and when a swing is still.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rolesFor, fraction, swing } from '../../patterns/data/gauge/pattern.js';
import { ranks, pop, shown } from '../../patterns/data/unit-grid/pattern.js';
import { bars, landing } from '../../patterns/data/waterfall/pattern.js';
import { radii } from '../../patterns/data/bubble/pattern.js';
import { judge } from '../../patterns/data/delta/pattern.js';
import { angleAt } from '../../patterns/entrances/swing/pattern.js';

const same = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

test('gauge: a value fills its share of the dial, clamped, and the hero role comes first', () => {
  same(fraction(68, 0, 100), 0.68);
  same(fraction(150, 0, 100), 1);
  same(fraction(-5, 0, 100), 0);
  same(fraction(50, 20, 120), 0.3);
  assert.equal(fraction(5, 10, 10), 0, 'an empty range fills nothing');
  assert.deepEqual(rolesFor('accent', 3), ['accent', 'ink', 'muted']);
  assert.deepEqual(rolesFor('ink', 3), ['ink', 'muted', 'accent']);
  assert.deepEqual(rolesFor('muted', 4), ['muted', 'ink', 'accent', 'muted']);
  assert.deepEqual(rolesFor('nope', 1), ['accent']);
});

test('gauge: the needle reaches the value, wobbles, and is exactly on it at the end', () => {
  const ease = (x) => x;
  same(swing(0, ease), 0);
  same(swing(0.7, ease), 1);
  same(swing(1, ease, 0.04, 0.5), 1);
  assert.ok(swing(0.75, ease, 0.04, 0.5) > 1, 'it overshoots first');
  assert.ok(swing(0.85, ease, 0.04, 0.5) < 1, 'then falls short');
  assert.equal(swing(0.85, ease, 0, 0.5), 1, 'settle 0 stops it dead on the value');
  assert.equal(swing(0.5, ease, 0.04, 0.5), swing(0.5, ease), 'the wobble starts after the swing');
});

test('unit-grid: reading order is the cell order; distance order lights outward from the corner', () => {
  assert.deepEqual(ranks(2, 3), [0, 1, 2, 3, 4, 5]);
  const tl = ranks(3, 3, { order: 'distance', corner: 'tl' });
  assert.equal(tl[0], 0, 'the corner cell is first');
  assert.equal(tl[8], 8, 'the far corner is last');
  assert.ok(tl[1] < tl[4] && tl[3] < tl[4] && tl[4] < tl[5], 'ranks grow with the distance');
  const br = ranks(3, 3, { order: 'distance', corner: 'br' });
  assert.equal(br[8], 0);
  assert.equal(br[0], 8);
  assert.deepEqual(new Set(br).size, 9, 'every cell has its own rank');
  assert.deepEqual([...tl].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('unit-grid: each unit pops at its own time, and the figure is the whole units landed times what a unit stands for', () => {
  assert.equal(pop(0, 10, 0), 0);
  assert.equal(pop(9, 10, 1), 1);
  assert.ok(pop(0, 10, 0.1) > 0 && pop(9, 10, 0.1) === 0, 'the first unit starts before the last');
  assert.equal(shown(37, 1, 37, 0), 0);
  assert.equal(shown(37, 1, 37, 1), 37, 'at rest the figure is the value');
  for (let q = 0; q <= 1; q += 0.02) assert.ok(shown(37.5, 1, 38, q) <= 37.5, `no figure past the value at ${q}`);
  let prev = 0;
  for (let q = 0; q <= 1; q += 0.02) { const s = shown(62, 1, 62, q); assert.ok(s >= prev, 'the figure only climbs'); prev = s; }
});

test('waterfall: the start from zero, each change from the running total, the total from zero', () => {
  const b = bars([100, 45, -30]);
  assert.deepEqual(b.map((x) => x.kind), ['start', 'up', 'down', 'total']);
  assert.deepEqual(b.map((x) => [x.from, x.to]), [[0, 100], [100, 145], [145, 115], [0, 115]]);
  assert.equal(b.at(-1).delta, 115);
  assert.equal(landing(0, 4, 0), 0);
  assert.equal(landing(3, 4, 1), 1);
  assert.ok(landing(0, 4, 0.3) > landing(1, 4, 0.3), 'bars land in turn');
});

test('bubble: area goes with the value, the larger takes the full size, a wide ratio is flagged', () => {
  const r = radii(400, 100);
  same(r.big / r.small, 2, 1e-9);   // area 4x is radius 2x
  assert.equal(r.clamped, false);
  const flip = radii(100, 400);
  assert.ok(flip.small > flip.big, 'a reference larger than the value is the larger circle');
  assert.ok(radii(1_000_000, 1).clamped, 'a ratio past the smallest dot is flagged');
  assert.deepEqual(radii(0, 0), { big: 0, small: 0, clamped: false });
  assert.ok(radii(480, 12).small < radii(480, 12).big);
});

test('delta: the caret follows the sign unless told, and good news is the chosen direction', () => {
  assert.deepEqual(judge(12), { dir: 'up', good: true });
  assert.deepEqual(judge(-8), { dir: 'down', good: false });
  assert.deepEqual(judge(-8, 'auto', 'down'), { dir: 'down', good: true });
  assert.deepEqual(judge(0), { dir: 'flat', good: false });
  assert.deepEqual(judge(5, 'down'), { dir: 'down', good: false });
});

test('swing: the angle starts out, damps with the square of the time left and is zero at the end', () => {
  same(angleAt(0, 16, 1.5), 16);
  same(angleAt(1, 16, 1.5), 0);
  same(angleAt(2, 16, 1.5), 0, 1e-9);
  assert.ok(Math.abs(angleAt(0.9, 16, 1.5)) < 0.2, 'the last swing is small');
  assert.ok(angleAt(0.3, 16, 1.5) < 0 || angleAt(0.15, 16, 1.5) < 16, 'it swings');
  assert.equal(angleAt(0.5, 16, 1.5), angleAt(0.5, 16, 1.5), 'pure');
});
