// motion.reduceMotion: an optional motion field for decks, "user" (follow the reader's setting) or "always".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';

const v = validators();
const calm = JSON.parse(readFileSync(join(ROOT, 'styles/motion/calm.json'), 'utf8'));
const withReduce = (r) => ({ ...calm, motion: { ...calm.motion, reduceMotion: r } });

test('a motion half may say "user" or "always", and reduceMotion stays optional', () => {
  assert.ok(v.motion(withReduce('always')), JSON.stringify(v.motion.errors));
  assert.ok(v.motion(withReduce('user')));
  assert.ok(v.motion(calm), 'reduceMotion stays optional');
});

test('reduceMotion refuses anything else, so a style cannot switch the reader\'s preference off', () => {
  for (const r of ['never', 'off', true, 1, '']) assert.equal(v.motion(withReduce(r)), false, `reduceMotion ${JSON.stringify(r)}`);
});
