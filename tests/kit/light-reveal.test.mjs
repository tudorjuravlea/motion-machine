// entrances/light-reveal, the maths: a soft light front crosses the block; what it has passed is
// fully on and stays on, what it has not reached waits at the base strength, and at p = 1 the
// whole block is on. The glint rides the front.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import LIGHT, { frontAt, strengthAt } from '../../patterns/entrances/light-reveal/pattern.js';

test('at p = 0 nothing is lit; at p = 1 everything is', () => {
  for (const soft of [0.1, 0.35, 0.6]) {
    for (let x = 0; x <= 1; x += 0.01) {
      assert.equal(strengthAt(x, 0, soft, 0.07), 0.07, `x ${x} at p 0`);
      assert.equal(strengthAt(x, 1, soft, 0.07), 1, `x ${x} at p 1`);
    }
  }
});

test('the front only advances, and a point once lit stays lit', () => {
  let lastFront = -Infinity;
  const xs = [0, 0.2, 0.5, 0.8, 1];
  let last = xs.map(() => 0);
  for (let i = 0; i <= 200; i++) {
    const p = i / 200, f = frontAt(p, 0.35);
    assert.ok(f.front >= lastFront); lastFront = f.front;
    const now = xs.map((x) => strengthAt(x, p, 0.35, 0.07));
    now.forEach((v, j) => assert.ok(v >= last[j] - 1e-12 && v >= 0.07 - 1e-12 && v <= 1, `x ${xs[j]} at p ${p}`));
    last = now;
  }
});

test('the lit side is behind the front by the soft width, in share of the block', () => {
  const f = frontAt(0.5, 0.35);
  assert.ok(Math.abs(f.front - f.lit - 0.35) < 1e-12);
  assert.ok(f.lit < 0.5 && f.front > 0.5);
});

test('the module is an entrance on the slow role with angle, soft, base and glint params', () => {
  assert.equal(LIGHT.group, 'entrances');
  assert.equal(LIGHT.name, 'light-reveal');
  assert.equal(LIGHT.dur, 'slow');
  assert.deepEqual(Object.keys(LIGHT.params).sort(), ['angle', 'base', 'glint', 'soft']);
});
