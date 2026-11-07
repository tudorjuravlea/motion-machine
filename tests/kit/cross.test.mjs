// 3d/phone move "cross": the phone faces the viewer on the left, then, from crossAt for
// crossFor seconds, travels to the right while making one full turn, showing its back half-way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cross } from '../../runtime/kit/device3d.js';

const P = { from: -0.28, to: 0.28, crossAt: 2, crossFor: 2.4 };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

test('before the cross it faces the viewer at `from`; after it, at `to`, facing again', () => {
  for (const u of [0, 1, 2]) { const s = cross(1, u, P); assert.ok(near(s.x, -0.28) && near(Math.cos(s.ry), 1)); }
  for (const u of [4.4, 9]) { const s = cross(1, u, P); assert.ok(near(s.x, 0.28) && near(Math.cos(s.ry), 1, 1e-9)); }
});

test('half-way it is in the middle with its back to the viewer, so a screen swap there is never seen', () => {
  const s = cross(1, 2 + 1.2, P);
  assert.ok(near(s.x, 0), String(s.x));
  assert.ok(near(Math.cos(s.ry), -1), String(s.ry));
});

test('the travel and the turn are one smooth move: monotone in x, one full turn', () => {
  let last = -Infinity;
  for (let u = 2; u <= 4.4; u += 0.1) { const s = cross(1, u, P); assert.ok(s.x >= last - 1e-12); last = s.x; }
  assert.ok(near(Math.abs(cross(1, 4.4, P).ry - cross(1, 2, P).ry), 2 * Math.PI, 1e-9));
});

test('a deck rest is at `to`, facing', () => {
  const s = cross(1, 0, P, { deck: true });
  assert.ok(near(s.x, 0.28) && near(s.ry, 0));
});
