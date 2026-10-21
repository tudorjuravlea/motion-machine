// screen/compare: a before-and-after divider on a device screen. A vertical line enters
// at the screen's right edge and travels to `stop`; right of it the `to` asset shows, left of it the
// screen's own content. Once there it holds, and a `to` recording keeps playing under it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, fold } from '../../runtime/kit/screen.js';
import compare from '../../patterns/screen/compare/pattern.js';

const ctx = (params = {}, d = 4) => ({ params: { to: 'assets/sketch/', stop: 0.5, move: 0.25, ...params }, d, ease: (_, p) => p });
const at = (p, params, d) => compare.reduce(initialState('assets/hifi.png', null), p, ctx(params, d)).compare;

test('the divider starts at the right edge, reaches stop after `move` of the action, then holds', () => {
  assert.equal(at(0).x, 1);
  assert.equal(at(0.125).x, 0.75);
  assert.equal(at(0.25).x, 0.5);
  assert.equal(at(1).x, 0.5);
  assert.equal(at(1).to, 'assets/sketch/');
});

test('the revealed recording runs on its own clock through the hold: seconds since the action began', () => {
  assert.equal(at(0.5, {}, 4).time, 2);
  assert.equal(at(1, {}, 4).time, 4);
});

test('stop is kept inside the screen and a compare without `to` changes nothing', () => {
  assert.equal(at(1, { stop: 1.4 }).x, 1);
  assert.equal(at(1, { stop: -0.2 }).x, 0);
  const s = initialState('assets/hifi.png', null);
  assert.equal(compare.reduce(s, 0.5, ctx({ to: '' })), s);
});

test('in a fold the compare outlives its action: later seeks show the held divider', () => {
  const timed = [{ action: { do: 'screen/compare', params: { to: 'assets/sketch/', stop: 0.4, move: 0.5 } }, module: compare, start: 1, d: 2 }];
  const ctxOf = (e) => ({ params: e.action.params, d: e.d, ease: (_, p) => p });
  const { state } = fold(initialState('assets/hifi.png', null), timed, 9, ctxOf);
  assert.deepEqual(state.compare, { to: 'assets/sketch/', x: 0.4, time: 2 });
});
