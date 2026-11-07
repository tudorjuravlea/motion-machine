// exits/knife-cut, the maths: a thin rule grows across each line of the text, through its middle,
// then the element folds shut onto the middle of the block; the rules go as the fold closes, so the
// last instant of the exit leaves nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import KNIFE, { phasesAt, CUT, linesOf } from '../../patterns/exits/knife-cut/pattern.js';

test('at q = 0 nothing has changed: no rule, no fold', () => {
  assert.deepEqual(phasesAt(0), { rule: 0, fold: 1, alpha: 0 });
});

test('the rule crosses the whole element before the fold starts', () => {
  for (let i = 0; i <= 100; i++) {
    const q = (i / 100) * CUT;
    const s = phasesAt(q);
    assert.equal(s.fold, 1, `no fold while the rule grows (q ${q})`);
  }
  assert.equal(phasesAt(CUT).rule, 1);
});

test('the fold only closes, and the end of the exit leaves nothing: no height, no rule', () => {
  let last = 1;
  for (let i = 0; i <= 500; i++) {
    const s = phasesAt(i / 500);
    assert.ok(s.fold <= last + 1e-12, `fold reopens at ${i / 500}`);
    last = s.fold;
  }
  assert.deepEqual(phasesAt(1), { rule: 1, fold: 0, alpha: 0 });
  const near = phasesAt(0.999);
  assert.ok(near.fold < 0.01 && near.alpha < 0.01, JSON.stringify(near));
});

test('each line of text gets its own cut through its middle; the fold closes on the middle of the block', () => {
  // two lines laid out as client rects (one per text run), inside an element at (100, 200), drawn at scale 2
  const own = { left: 100, top: 200 };
  const rects = [
    { left: 110, right: 300, top: 210, bottom: 290, width: 190 }, { left: 300, right: 420, top: 212, bottom: 288, width: 120 },
    { left: 110, right: 260, top: 330, bottom: 410, width: 150 },
    { left: 400, right: 400, top: 330, bottom: 410, width: 0 },
  ];
  const { lines, mid } = linesOf(rects, own, 2);
  assert.equal(lines.length, 2);
  assert.deepEqual([lines[0].x0, lines[0].x1], [5, 160]);
  assert.deepEqual([lines[1].x0, lines[1].x1], [5, 80]);
  assert.ok(lines[0].y > 5 + 0.4 * 40 && lines[0].y < 5 + 0.7 * 40, `the first cut sits inside its line: ${lines[0].y}`);
  assert.ok(lines[1].y > lines[0].y + 40);
  assert.equal(mid, (5 + 105) / 2);
  assert.deepEqual(linesOf([], own, 1), { lines: [], mid: null });
});

test('the module is an exit with a colour param for the rule', () => {
  assert.equal(KNIFE.group, 'exits');
  assert.equal(KNIFE.name, 'knife-cut');
  assert.deepEqual(KNIFE.params.rule.default, 'ink');
});
