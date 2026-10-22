// emphasis/dimension's pure layout: given the two ink edges the line spans (x0, x1, in the slot's own
// pixels) and the width of its label, where the halves and the label go. When the label fits with
// room for two halves, it sits in a gap centred on the line; when it does not (the line measures the
// label's own words), the line passes under it, unbroken, centred on the same span.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutOf } from '../../patterns/emphasis/dimension/pattern.js';

test('a label narrower than the span sits in a gap centred on the line', () => {
  const L = layoutOf({ x0: 112.4, x1: 871.9, labelW: 140, gap: 16, minHalf: 40 });
  assert.equal(L.mode, 'gap');
  assert.ok(Math.abs(L.pad + 140 / 2 - (112.4 + 871.9) / 2) < 1e-9, `the label is centred: ${L.pad}`);
  assert.ok(Math.abs(L.g0 - (L.pad - 16)) < 1e-9 && Math.abs(L.g1 - (L.pad + 140 + 16)) < 1e-9, 'a gap of `gap` on each side');
  assert.ok(Math.abs((L.g0 - 112.4) - (871.9 - L.g1)) < 1e-9, 'two equal halves');
  assert.equal(L.x0, 112.4); assert.equal(L.x1, 871.9);
});

test('a label too wide for a gap and two halves: the line passes under it, unbroken', () => {
  for (const labelW of [700, 760, 900]) {
    const L = layoutOf({ x0: 100, x1: 860, labelW, gap: 16, minHalf: 40 });
    assert.equal(L.mode, 'under', `label ${labelW}`);
    assert.equal(L.g0, L.g1, 'no gap');
    assert.equal(L.g0, 480, 'the halves meet at the middle');
    assert.equal(L.pad, null, 'the label stays where its layout puts it');
  }
  // the edge case: exactly room for the label, two gaps and two least halves is still a gap
  assert.equal(layoutOf({ x0: 0, x1: 300, labelW: 188, gap: 16, minHalf: 40 }).mode, 'gap');
  assert.equal(layoutOf({ x0: 0, x1: 300, labelW: 189, gap: 16, minHalf: 40 }).mode, 'under');
});
