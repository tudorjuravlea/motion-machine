// 3d/laptop's pose move: a pose is written "key:value …", and a move travels from one to another with each key in its own
// part of the beat's time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poseOf, poseAt } from '../../patterns/3d/laptop/pattern.js';

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} ≠ ${b}`);

test('a pose left empty is the open notebook facing the viewer at the standard distance', () => {
  assert.deepEqual(poseOf('').pose, { lid: 1, turn: 0, x: 0, rise: 0, back: 1, fill: 0, alpha: 1 });
});

test('a pose reads its keys, keeps the others, ignores what it does not know and notes each key\'s window', () => {
  const { pose, when } = poseOf('lid:0.3 turn:-0.6 x:.8 spin:9 fill:1@0.4-1 nonsense');
  assert.deepEqual(pose, { lid: 0.3, turn: -0.6, x: 0.8, rise: 0, back: 1, fill: 1, alpha: 1 });
  assert.deepEqual(when, { fill: [0.4, 1] });
});

test('a move starts on `from`, ends on `to`, and a key left out of `to` stays as in `from`', () => {
  const from = 'lid:0.3 turn:-0.6 x:0.8 back:1.2', to = 'lid:1@0-0.5 turn:0 x:0 fill:1@0.4-1';
  assert.deepEqual(poseAt(from, to, 0), { lid: 0.3, turn: -0.6, x: 0.8, rise: 0, back: 1.2, fill: 0, alpha: 1 });
  assert.deepEqual(poseAt(from, to, 1), { lid: 1, turn: 0, x: 0, rise: 0, back: 1.2, fill: 1, alpha: 1 });
});

test('a key moves only inside its window, eased', () => {
  const at = (s) => poseAt('lid:0', 'lid:1@0-0.5 fill:1@0.4-1', s);
  close(at(0.25).lid, 0.5, 'half-way through its window');
  close(at(0.5).lid, 1, 'done at the end of its window');
  close(at(0.4).fill, 0, 'not yet begun');
  close(at(0.7).fill, 0.5, 'half-way');
  assert.ok(at(0.1).lid < 0.2, 'eased in: slow at the start');
});
