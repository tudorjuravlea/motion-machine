// W-LENGTH (SPEC §7): its negative warns with exactly this id; a length outside the band never blocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, warnsOnly } from './_harness.mjs';

const run = gate();

test('fixtures/negatives/W-LENGTH warns W-LENGTH and nothing else', async () => {
  const r = warnsOnly(await run('W-LENGTH'), 'W-LENGTH');
  assert.match(r.evidence.reason, /outside/);
});
