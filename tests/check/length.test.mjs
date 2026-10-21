// G-LENGTH (SPEC §7): its negative fails with exactly this id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, failsOnly } from './_harness.mjs';

const run = gate();

test('fixtures/negatives/G-LENGTH fails G-LENGTH and no other G- rule', async () => {
  const r = failsOnly(await run('G-LENGTH'), 'G-LENGTH');
  assert.match(r.evidence.reason, /outside/);
});
