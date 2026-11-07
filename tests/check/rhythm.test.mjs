// W-RHYTHM (SPEC §7): scene lengths too even. With four scenes or more, the longest over the shortest under 1.5 warns.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { gate, row } from './_harness.mjs';
import { variant, cleanup } from './_variant.mjs';
import { RATIO, MIN_SCENES } from '../../scripts/check/W-RHYTHM.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-RHYTHM'] };
const check = async (dir) => row(await run(dir, only), 'W-RHYTHM');
/** Scene lengths, and no gate block: the base fixtures may carry one that loosens W-RHYTHM for their own sake. */
const lengths = (...ds) => ({ story, style }) => { delete style.gate; ds.forEach((d, i) => { story.scenes[i].duration = d; }); story.scenes.length = ds.length; };
const even = () => variant('_base/film', ({ style }) => { delete style.gate; });

test('the limits are 1.5 and four scenes', () => { assert.equal(RATIO, 1.5); assert.equal(MIN_SCENES, 4); });

test('five scenes of one length warn, with the ratio and the scene count', async () => {
  const r = await check(even());
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.measured, 1);
  assert.equal(r.evidence.threshold, 1.5);
  assert.equal(r.evidence.scenes, 5);
  assert.match(r.evidence.reason, /longest scene is 1 times the shortest/);
});

test('scenes of uneven length pass and the pass says how many it read', async () => {
  const r = await check(variant('_base/film', lengths(4, 5, 6, 8, 5)));
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.measured, 2);
  assert.equal(r.evidence.scenes, 4 + 1);
});

test('a ratio just under the limit warns and just over passes', async () => {
  assert.equal((await check(variant('_base/film', lengths(5, 6, 7, 7.4, 6)))).status, 'WARN');   // 1.48
  assert.equal((await check(variant('_base/film', lengths(5, 6, 7, 7.6, 6)))).status, 'PASS');   // 1.52
});

test('fewer than four scenes is a SKIP with a reason', async () => {
  const r = await check(variant('_base/film', lengths(5, 5, 5)));
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /3 scenes.*at least 4/);
});

test('a deck is a SKIP', async () => assert.match((await check('_base/deck')).evidence.reason, /deck/));

test('a style\'s gate.rhythmRatio sets the limit and the evidence says so', async () => {
  const lax = await check(variant('_base/film', ({ style }) => { style.gate = { rhythmRatio: 1 }; }));   // ratio 1 is not under 1
  assert.equal(lax.status, 'PASS');
  assert.equal(lax.evidence.threshold, 1);
  const strict = await check(variant('_base/film', (v) => { lengths(4, 5, 6, 8, 5)(v); v.style.gate = { rhythmRatio: 3 }; }));
  assert.equal(strict.status, 'WARN');
  assert.equal(strict.evidence.threshold, 3);
});
