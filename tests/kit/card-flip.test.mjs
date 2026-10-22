// entrances/card-flip, the maths: the card turns 0 to 180 degrees and ends at exactly 180; the
// drawn rotation never passes a quarter turn, so no face is ever drawn mirrored: the cover shows
// for the first half of the turn, the content for the second, arriving at no rotation at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import FLIP, { turnAt, poseOf, depthFor } from '../../patterns/entrances/card-flip/pattern.js';

test('the turn ends at exactly 180 degrees at p = 1, smooth or stepped, and starts at 0', () => {
  for (const steps of [0, 1, 2, 3, 6, 7, 12]) {
    assert.equal(turnAt(1, steps), 180, `steps ${steps}`);
    assert.equal(turnAt(0, steps), 0);
    let last = 0;
    for (let i = 0; i <= 300; i++) {
      const a = turnAt(i / 300, steps);
      assert.ok(a >= last && a <= 180, `monotone and bounded at ${i / 300}: ${a}`);
      last = a;
    }
  }
  assert.equal(turnAt(1.3, 0), 180, 'a progress past 1 still lands at 180');
});

test('steps quantise the turn into that many equal stops', () => {
  const seen = new Set();
  for (let i = 0; i <= 600; i++) seen.add(turnAt(i / 600, 6));
  assert.deepEqual([...seen].sort((a, b) => a - b), [0, 30, 60, 90, 120, 150, 180]);
});

test('no face is ever drawn mirrored: the drawn angle stays within a quarter turn', () => {
  for (let a = 0; a <= 180; a += 0.25) {
    const { face, drawn } = poseOf(a);
    assert.ok(Math.cos((drawn * Math.PI) / 180) >= -1e-12, `turn ${a}: drawn ${drawn}`);
    assert.equal(face, a < 90 ? 'cover' : 'content', `turn ${a}`);
  }
  assert.deepEqual(poseOf(180), { face: 'content', drawn: 0 });
  assert.deepEqual(poseOf(0), { face: 'cover', drawn: 0 });
});

test('the perspective keeps the near edge inside the room the layout leaves', () => {
  for (const w of [200, 640, 1000]) for (const room of [1.02, 1.1, 1.5, 3]) {
    const P = depthFor(w, room);
    const grow = P / (P - w / 2);
    assert.ok(grow <= room + 1e-9, `w ${w} room ${room}: grows ${grow}`);
  }
  assert.equal(depthFor(500, 1), Infinity, 'no room: no perspective at all');
  assert.equal(depthFor(500, null), 2000, 'no layout to read: four card widths');
});

test('the module is an entrance with a steps param', () => {
  assert.equal(FLIP.group, 'entrances');
  assert.equal(FLIP.name, 'card-flip');
  assert.ok('steps' in FLIP.params);
});
