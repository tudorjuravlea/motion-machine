// G-OVERLAP (SPEC §7): its negatives fail with exactly this id; ::after text is a text box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, failsOnly } from './_harness.mjs';

const run = gate();

test('G-OVERLAP/box: the sub line climbs into the headline', async () => {
  const r = failsOnly(await run('G-OVERLAP/box'), 'G-OVERLAP');
  assert.match(r.evidence.reason, /intersect/);
});

test('G-OVERLAP/pseudo: ::after text laid over the headline', async () => {
  const r = failsOnly(await run('G-OVERLAP/pseudo'), 'G-OVERLAP');
  assert.match(r.evidence.selector, /::after/);
});
