// W-DEAD (SPEC §7): its negative warns with exactly this id; a warning never fails the gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, warnsOnly } from './_harness.mjs';

const run = gate();

test('fixtures/negatives/W-DEAD warns W-DEAD and nothing else', async () => {
  const r = warnsOnly(await run('W-DEAD'), 'W-DEAD');
  assert.match(r.evidence.reason, /nothing arrives/);
});

test('the window is measured from the schedule: 4.8 s against 4 s', async () => {
  const r = warnsOnly(await run('W-DEAD'), 'W-DEAD');
  assert.equal(r.evidence.measured, 4.8);
  assert.equal(r.evidence.threshold, 4);
});
