// motion.frameHold: an optional motion field, 1 (every frame), 2 ("on
// twos") or 3 (on threes). The motion and style schemas accept it, refuse other values, and compose carries it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';

const v = validators();
const calm = JSON.parse(readFileSync(join(ROOT, 'styles/motion/calm.json'), 'utf8'));
const withHold = (h) => ({ ...calm, motion: { ...calm.motion, frameHold: h } });

test('a motion half may hold frames on twos, and frameHold stays optional', () => {
  assert.ok(v.motion(withHold(2)), JSON.stringify(v.motion.errors));
  assert.ok(v.motion(withHold(1)));
  assert.ok(v.motion(calm), 'frameHold stays optional');
});

test('frameHold refuses 0, 4 and fractions', () => {
  for (const h of [0, 4, 1.5]) assert.equal(v.motion(withHold(h)), false, `frameHold ${h}`);
});
