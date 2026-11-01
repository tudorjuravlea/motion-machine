// runtime/kit/press.js: the deck's press model without a browser (SPEC §10). Next goes on to the next
// rest (a press under way finishes); Back restarts the step it is in, else goes to the rest before;
// a jump (a hash, ?press=, goto) lands on a rest and plays nothing; reduced motion is the user's
// preference or the style's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuesOfPress, nextRest, pressFromLocation, prevRest, reducedMotion } from '../../runtime/kit/press.js';

test('Next: from a rest to the next rest; under way, to the end of that press; nowhere past the last', () => {
  assert.equal(nextRest(0, 3), 1);
  assert.equal(nextRest(2, 3), 3);
  assert.equal(nextRest(1.4, 3), 2, 'mid-press: the press finishes');
  assert.equal(nextRest(2.9, 3), 3);
  assert.equal(nextRest(3, 3), null, 'the final pose: a press does nothing');
  assert.equal(nextRest(2.5, 3), 3);
});

test('Back: mid-step it restarts the step (the rest it began from); at a rest it goes to the rest before; never below 0', () => {
  assert.equal(prevRest(3), 2);
  assert.equal(prevRest(1), 0);
  assert.equal(prevRest(0), 0);
  assert.equal(prevRest(1.4), 1, 'mid-step: back to the start of this step');
  assert.equal(prevRest(0.3), 0);
  assert.equal(prevRest(2.999), 2);
});

test('a deep link: ?press=n, rounded and clamped to the deck; else a numeric hash; else none', () => {
  assert.equal(pressFromLocation('?press=2', '', 5), 2);
  assert.equal(pressFromLocation('?format=16x9&press=4', '', 5), 4);
  assert.equal(pressFromLocation('?press=9', '', 5), 5);
  assert.equal(pressFromLocation('?press=-3', '', 5), 0);
  assert.equal(pressFromLocation('?press=2.6', '', 5), 3);
  assert.equal(pressFromLocation('?press=abc', '#3', 5), 3, 'a press that is not a number falls back to the hash');
  assert.equal(pressFromLocation('', '#4', 5), 4);
  assert.equal(pressFromLocation('?press=1', '#4', 5), 1, '?press= wins over the hash');
  assert.equal(pressFromLocation('?press=', '', 5), null);
  assert.equal(pressFromLocation('', '#x', 5), null);
  assert.equal(pressFromLocation('', '', 5), null);
});

test('reduced motion is the reader\'s preference or the style\'s (motion.reduceMotion "always"); "user" and no field follow the reader', () => {
  assert.equal(reducedMotion({}, false), false);
  assert.equal(reducedMotion({}, true), true);
  assert.equal(reducedMotion({ motion: { reduceMotion: 'user' } }, false), false);
  assert.equal(reducedMotion({ motion: { reduceMotion: 'always' } }, false), true);
  assert.equal(reducedMotion({ motion: { reduceMotion: 'always' } }, true), true);
});

test('cuesOfPress: the sprite events a press plays, in the order they sound, none for rest 0', () => {
  const events = [{ press: 2, at: 0.3, key: 'b' }, { press: 1, at: 0, key: 'a' }, { press: 2, at: 0, key: 'c' }, { press: 2, at: 0.3, key: 'd' }];
  assert.deepEqual(cuesOfPress(events, 2).map((e) => e.key), ['c', 'b', 'd']);
  assert.deepEqual(cuesOfPress(events, 0), []);
  assert.deepEqual(cuesOfPress(events, 5), []);
  assert.deepEqual(cuesOfPress(undefined, 1), []);
});
