// G-DEAD (SPEC §7): its negative fails with exactly this id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, failsOnly } from './_harness.mjs';

const run = gate();

test('fixtures/negatives/G-DEAD fails G-DEAD and no other G- rule', async () => {
  const r = failsOnly(await run('G-DEAD'), 'G-DEAD');
  assert.match(r.evidence.reason, /nothing arrives/);
});

test('the window is measured from the schedule: 4.8 s against 4 s', async () => {
  const r = failsOnly(await run('G-DEAD'), 'G-DEAD');
  assert.equal(r.evidence.measured, 4.8);
  assert.equal(r.evidence.threshold, 4);
});
