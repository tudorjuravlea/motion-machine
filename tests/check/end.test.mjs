// G-END (SPEC §7): its negative fails with exactly this id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, failsOnly } from './_harness.mjs';

const run = gate();

test('fixtures/negatives/G-END fails G-END and no other G- rule', async () => {
  const r = failsOnly(await run('G-END'), 'G-END');
  assert.match(r.evidence.reason, /changes the picture/);
});
