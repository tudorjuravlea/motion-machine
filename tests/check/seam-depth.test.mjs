// W-SEAM's depth axis (SPEC §7): an exit that recedes (its scale falls) answered by an entrance that grows from small is a mirrored
// vector across the cut. fixtures/negatives/W-SEAM-DEPTH has the style headline shrink away and the next headline grow in.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { gate, warnsOnly, row } from './_harness.mjs';
import { variant, cleanup, beat } from './_variant.mjs';
import { MIN_DEPTH, depthOf } from '../../scripts/check/W-SEAM.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-SEAM'] };
const check = async (dir) => row(await run(dir, only), 'W-SEAM');
const depth = (edit) => variant('W-SEAM-DEPTH', ({ story }) => edit(beat(story, 'style', 'headline'), beat(story, 'rests', 'headline')));

test('depthOf reads the sign of a scale change and ignores one under the minimum', () => {
  assert.equal(MIN_DEPTH, 0.02);
  assert.equal(depthOf(1, 0.8), 'recede');
  assert.equal(depthOf(0.8, 1), 'approach');
  assert.equal(depthOf(1, 1.01), null);
  assert.equal(depthOf(null, 1), null);
});

test('fixtures/negatives/W-SEAM-DEPTH warns W-SEAM and nothing else: a receding exit and a growing entrance', async () => {
  const r = warnsOnly(await run('W-SEAM-DEPTH'), 'W-SEAM');
  assert.match(r.evidence.reason, /recedes.*grows from small.*mirrored vector across the cut/);
  assert.equal(r.evidence.seams[0].exitDepth, 'recede');
  assert.equal(r.evidence.seams[0].enterDepth, 'approach');
  assert.equal(r.evidence.seams[0].mirroredDepth, true);
});

test('an entrance that also shrinks into place carries the movement on: no warning', async () => {
  const r = await check(depth((out, inn) => { inn.fx = 'entrances/settle-in'; }));
  assert.equal(r.status, 'PASS', JSON.stringify(r.evidence));
  assert.equal(r.evidence.seams[0].mirroredDepth, false);
});

test('an entrance with no depth change leaves nothing to match: SKIP', async () => {
  const r = await check(depth((out, inn) => { inn.fx = 'entrances/fade'; }));
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /nothing to match/);
});
