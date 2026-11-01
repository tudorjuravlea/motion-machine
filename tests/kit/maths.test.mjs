// The small maths a pattern keeps reaching for: clamp, mapRange, wrap, wrapYoyo, snap, a seeded random by index,
// and the three ways round a circle (shortest arc, clockwise, counter-clockwise).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clamp, mapRange, wrap, wrapYoyo, snap, randomAt, randomIn, arcDelta, rotateTo } from '../../runtime/kit/maths.js';

const close = (a, b, eps = 1e-12, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('clamp and mapRange', () => {
  assert.equal(clamp(0, 1, 1.5), 1);
  assert.equal(clamp(0, 1, -2), 0);
  assert.equal(clamp(0, 1, 0.3), 0.3);
  assert.equal(mapRange(0, 10, 100, 200, 5), 150);
  assert.equal(mapRange(0, 10, 100, 200, 20), 300, 'not clamped');
  assert.equal(mapRange(10, 0, 0, 1, 2.5), 0.75, 'a reversed input range');
  assert.equal(mapRange(3, 3, 7, 9, 3), 7, 'a zero-width range gives the start');
});

test('omit the last argument and you get the function', () => {
  assert.equal(clamp(0, 1)(5), 1);
  assert.equal(mapRange(0, 10, 0, 100)(2), 20);
  assert.equal(wrap(0, 360)(-10), 350);
  assert.equal(wrapYoyo(0, 100)(150), 50);
  assert.equal(snap(5)(12), 10);
  assert.equal(snap([0, 10, 20])(13), 10);
});

test('wrap: round and round a range, whichever way it was left', () => {
  assert.equal(wrap(0, 360, -10), 350);
  assert.equal(wrap(0, 360, 370), 10);
  assert.equal(wrap(0, 360, 360), 0, 'the top of the range is the bottom');
  assert.equal(wrap(0, 360, 0), 0);
  assert.equal(wrap(-1, 1, 1.5), -0.5);
  assert.equal(wrap(5, 8, 5 - 7), 7);
  assert.equal(wrap(0, 1, 0.25), 0.25);
});

test('wrapYoyo: there and back again', () => {
  assert.equal(wrapYoyo(0, 100, 150), 50);
  assert.equal(wrapYoyo(0, 100, 100), 100);
  assert.equal(wrapYoyo(0, 100, 250), 50);
  assert.equal(wrapYoyo(0, 100, 200), 0);
  assert.equal(wrapYoyo(0, 100, -30), 30, 'it also runs the other way');
  assert.equal(wrapYoyo(10, 20, 23), 17);
  for (let v = -300; v <= 300; v += 7.3) { const y = wrapYoyo(0, 100, v); assert.ok(y >= 0 && y <= 100, `${v} -> ${y}`); }
});

test('snap: to a step, or to the nearest of a list', () => {
  assert.equal(snap(0.25, 0.7), 0.75);
  assert.equal(snap(10, 14), 10);
  assert.equal(snap(10, 15), 20);
  assert.equal(snap(10, -14), -10);
  close(snap(0.1, 0.3), 0.3, 1e-12, 'no float dust');
  assert.equal(snap([0, 10, 20], 13), 10);
  assert.equal(snap([0, 10, 20], 16), 20);
  assert.equal(snap([5, 1, 9], 2), 1, 'the list need not be sorted');
  assert.equal(snap([0, 10], 5), 0, 'a tie goes to the first');
  assert.equal(snap(0, 3.3), 3.3, 'a step of 0 leaves it alone');
  assert.throws(() => snap([], 1), TypeError);
});

test('randomAt: a float in [0, 1) that is a function of (seed, index) alone', () => {
  const run = Array.from({ length: 50 }, (_, i) => randomAt(7, i));
  const back = Array.from({ length: 50 }, (_, i) => randomAt(7, 49 - i)).reverse();
  assert.deepEqual(run, back, 'any order gives the same values');
  assert.ok(run.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(run, Array.from({ length: 50 }, (_, i) => randomAt(8, i)));
  assert.equal(new Set(run).size, 50);
  assert.equal(randomAt('cards', 3), randomAt('cards', 3));
});

test('randomIn: between two values, snapped to a step or a list', () => {
  for (let i = 0; i < 40; i++) {
    const x = randomIn(1, i, 10, 20);
    assert.ok(x >= 10 && x < 20);
    assert.equal(randomIn(1, i, 0, 500, 5) % 5, 0);
    assert.ok([2, 4, 8].includes(randomIn(1, i, 0, 10, [2, 4, 8])));
  }
  assert.equal(randomIn(1, 3, 10, 20), 10 + 10 * randomAt(1, 3));
});

test('arcDelta: the turn from one heading to another, shortest, clockwise or counter-clockwise (degrees)', () => {
  assert.equal(arcDelta(170, -170, 'short'), 20, 'the short way round, not 340 back');
  assert.equal(arcDelta(-170, 170, 'short'), -20);
  assert.equal(arcDelta(10, 350, 'short'), -20);
  assert.equal(arcDelta(0, 180, 'short'), 180, 'half a turn goes clockwise');
  assert.equal(arcDelta(170, -170, 'cw'), 20);
  assert.equal(arcDelta(-170, 170, 'cw'), 340);
  assert.equal(arcDelta(170, -170, 'ccw'), -340);
  assert.equal(arcDelta(-170, 170, 'ccw'), -20);
  assert.equal(arcDelta(30, 30, 'cw'), 0);
  assert.equal(arcDelta(30, 30, 'ccw'), 0);
  assert.equal(arcDelta(30, 390, 'short'), 0, 'a full turn away is no turn');
  assert.throws(() => arcDelta(0, 1, 'sideways'), TypeError);
});

test('rotateTo: the absolute angle, from a number or a "170_short" string', () => {
  assert.equal(rotateTo(170, '-170_short'), 190);
  assert.equal(rotateTo(170, '-170_ccw'), -170);
  assert.equal(rotateTo(100, 250), 250, 'a number is the angle itself');
  assert.equal(rotateTo(100, '250'), 250);
  assert.equal(rotateTo(720, '10_short'), 730, 'it carries on from where it is');
  assert.equal(rotateTo(0, '350_cw'), 350);
  assert.equal(rotateTo(0, '350_ccw'), -10);
  assert.throws(() => rotateTo(0, '10_up'), TypeError);
  assert.throws(() => rotateTo(0, 'ten'), TypeError);
});

test('maths.js is pure: no clock, no randomness, no DOM', () => {
  const src = readFileSync(new URL('../../runtime/kit/maths.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Date|Math\.random|performance|setTimeout|setInterval|requestAnimationFrame|document|window/);
});
