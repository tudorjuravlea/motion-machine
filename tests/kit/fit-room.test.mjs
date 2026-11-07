// A headline is fitted to its room by one search: from the authored size (or a cap under it), down
// in 4 % steps to a floor of 0.6, stopping at the first size where nothing crosses the safe area or
// lands on another slot. An overflow the headline does not cause (it stays the same
// at every size) never shrinks it; a part it does cause shrinks it only until that part is gone.
// Without a laid-out DOM the scene fit applies nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shrinkToRoom, fitHeadline, bodyFloor, fitWords } from '../../runtime/kit/fit.js';
import { FLOORS } from '../../scripts/check/_lib.mjs';

const FIT_FLOOR = 0.6, FIT_STEP = 0.96;

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('a headline with room keeps its authored size, and is measured once', () => {
  const seen = [];
  close(shrinkToRoom((px) => { seen.push(px); return 0; }, 200), 200, 'fits');
  assert.deepEqual(seen, [200]);
});

test('an overflowing headline takes the largest 4 % step that fits', () => {
  const seen = [];
  const px = shrinkToRoom((s) => { seen.push(s); return Math.max(0, s - 150); }, 200);
  assert.ok(px <= 150 + 0.5 && px / FIT_STEP > 150, `${px} is the first step at or under 150`);
  for (let i = 1; i < seen.length; i++) close(seen[i] / seen[i - 1], FIT_STEP, 'steps of 4 %');
  close(seen.at(-1), px, 'stops at the first size that fits');
});

test('an overflow the headline does not cause leaves it at its authored size', () => {
  close(shrinkToRoom(() => 40, 200), 200, 'constant excess');
});

test('a mixed overflow shrinks only until the headline\'s own part is gone', () => {
  const px = shrinkToRoom((s) => 40 + Math.max(0, s - 150), 200);
  assert.ok(px <= 150 + 0.5 && px / FIT_STEP > 150, `${px}: the remaining 40 px are not the headline's`);
});

test('a headline that never fits stops at the floor', () => {
  close(shrinkToRoom((s) => s, 200), 200 * FIT_FLOOR, 'floor');
});

test('a cap below the authored size starts lower (the hook\'s size over 1.25 holds the ladder), even below the floor', () => {
  const seen = [];
  close(shrinkToRoom((s) => { seen.push(s); return 0; }, 200, { max: 160 }), 160, 'starts at the cap');
  assert.deepEqual(seen, [160]);
  close(shrinkToRoom((s) => s, 200, { max: 100 }), 100, 'a cap under the floor is kept, not raised');
  assert.ok(shrinkToRoom((s) => Math.max(0, s - 120), 200, { max: 160 }) <= 120, 'and still shrinks from there');
  close(shrinkToRoom(() => 0, 200, { max: 199.7 }), 200, 'a cap within half a pixel changes nothing');
});

test('the search is a pure function of the excess it reads', () => {
  const f = (s) => Math.max(0, Math.sin(s) * 10 + s - 140);
  close(shrinkToRoom(f, 213.7), shrinkToRoom(f, 213.7), 'same input, same size');
});

test('without a laid-out DOM the scene fit applies nothing', () => {
  assert.equal(fitHeadline(null), null);
  assert.equal(fitHeadline({ querySelector: () => null }), null);
});

test('a word fit never goes under the body floor the gate holds every rest to, in every format and kind', () => {
  for (const [kind, formats] of Object.entries(FLOORS)) for (const [format, f] of Object.entries(formats)) assert.equal(bodyFloor(kind, format), f.body, `${kind} ${format}`);
  assert.equal(fitWords({ textContent: '', offsetWidth: 0, ownerDocument: { defaultView: {} } }, 44), null, 'nothing to fit without text and a laid-out box');
});

