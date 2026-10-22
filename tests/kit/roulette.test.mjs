// emphasis/roulette, the maths: a highlight starts on the first option, sweeps the row for a number
// of whole passes, slows down all the way (its speed never rises) and lands on the target, where it
// stays until p = 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ROULETTE, { indexAt, LAND, hugOf } from '../../patterns/emphasis/roulette/pattern.js';

const CASES = [[5, 4, 2], [5, 0, 1], [3, 1, 3], [7, 6, 0], [2, 1, 2], [1, 0, 2]];

test('the highlight starts on the first option and lands on the target, exactly, held to p = 1', () => {
  for (const [n, target, passes] of CASES) {
    assert.equal(indexAt(0, n, target, passes), 0);
    assert.equal(indexAt(1, n, target, passes), target, `n ${n} target ${target}`);
    for (let q = LAND; q <= 1; q += 0.01) assert.equal(indexAt(q, n, target, passes), target, `held at ${q}`);
  }
});

test('the deceleration is monotone: the speed through the options never rises', () => {
  for (const [n, target, passes] of CASES) {
    const N = 2000;
    let last = Infinity;
    const unwrapped = (q) => indexAt(q, n, target, passes, { unwrap: true });
    for (let i = 0; i < N; i++) {
      const v = (unwrapped((i + 1) / N) - unwrapped(i / N)) * N;
      assert.ok(v >= -1e-9, `never backwards at ${i / N}`);
      assert.ok(v <= last + 1e-6, `speed rises at ${i / N}: ${last} -> ${v}`);
      last = v;
    }
    assert.equal(unwrapped(1), passes * n + target, 'whole passes, then the target');
  }
});

test('the position is always on the row', () => {
  for (const [n, target, passes] of CASES) for (let i = 0; i <= 500; i++) {
    const s = indexAt(i / 500, n, target, passes);
    assert.ok(s >= 0 && s < n, `${s}`);
  }
});

test('the module is an emphasis on the hold role with a passes param', () => {
  assert.equal(ROULETTE.group, 'emphasis');
  assert.equal(ROULETTE.name, 'roulette');
  assert.equal(ROULETTE.dur, 'hold');
  assert.ok('passes' in ROULETTE.params);
});

test('the box hugs the option\'s text, not its layout box, and is never taller than a line', () => {
  // an option 1600 px wide whose word runs 300 px from x 650, drawn at half scale, its line 92 px apart
  const own = { left: 100, top: 50 };
  const rects = [{ left: 100 + 325, top: 50 + 3, width: 150, height: 52 }];
  const b = hugOf(rects, own, 0.5, { pad: 20, line: 92, bx: 0, by: 0 });
  assert.equal(b.x, 650 - 20); assert.equal(b.w, 300 + 40);
  assert.ok(b.h <= 92 + 1e-9, `height ${b.h} within the line pitch`);
  assert.ok(Math.abs(b.y + b.h / 2 - (6 + 52)) < 1e-9, 'centred on the text');
  // two lines of one option: the union, with no cap beyond the lines themselves
  const two = hugOf([{ left: 100, top: 50, width: 200, height: 46 }, { left: 100, top: 96, width: 120, height: 46 }], own, 1, { pad: 10, line: 46, bx: 0, by: 0 });
  assert.equal(two.w, 220); assert.equal(two.h, 92);
  assert.equal(hugOf([], own, 1, { pad: 10, line: 46 }), null);
});
