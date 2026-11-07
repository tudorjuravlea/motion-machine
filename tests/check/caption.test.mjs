// W-CAPTION with a words-per-group range (SPEC §7): `motion.captions.wordsPerGroup` is in the motion contract, so a piece that
// declares it and keeps to it passes, a group outside it warns, and without it the half is not measured (a partial SKIP).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { gate, row } from './_harness.mjs';
import { variant, cleanup, scene } from './_variant.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-CAPTION'] };
/** The W-CAPTION fixture with its second caption turned into a plain fade, so one group shows at a time. */
const one = (range, edit = () => {}) => variant('W-CAPTION', (v) => {
  scene(v.story, 'style').beats.find((b) => b.slot === 'sub').fx = 'entrances/fade';
  if (range) v.style.motion.captions = { wordsPerGroup: range };
  edit(v);
});
const check = async (dir) => row(await run(dir, only), 'W-CAPTION');

test('a piece that declares wordsPerGroup and keeps to it passes, and the pass says what it read', async () => {
  const r = await check(one([2, 6]));
  assert.equal(r.status, 'PASS', JSON.stringify(r.evidence));
  assert.equal(r.evidence.groups, 1);
  assert.match(r.evidence.note, /checked against 2–6/);
});

test('a group outside the range warns', async () => {
  const r = await check(one([4, 8]));
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.measured, 2);
});

test('the range is part of the contract: two numbers, whole and in order', async () => {
  await assert.rejects(() => run(one([2])), /does not match contracts\/style.schema.json/);
  await assert.rejects(() => run(one([2.5, 6])), /does not match contracts\/style.schema.json/);
});

test('without a range the half is not measured: a partial SKIP, never a PASS', async () => {
  const r = await check(one(null));
  assert.equal(r.status, 'SKIP');
  assert.equal(r.evidence.partial, true);
});
