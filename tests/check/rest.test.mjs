// G-REST (SPEC §7): its negative fails with exactly this id (W-HOLD is the same defect: a scene still
// arriving at its end has a rest of 0 s).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, failsOnly } from './_harness.mjs';

const run = gate();

test('fixtures/negatives/G-REST fails G-REST, names the selector and the progress at the scene end', async () => {
  const r = failsOnly(await run('G-REST'), 'G-REST', { inherent: ['W-HOLD'] });
  assert.match(r.evidence.reason, /mid-entrance/);
  assert.equal(r.evidence.selector, '[data-scene="style"] [data-slot="sub"]');
  assert.ok(r.evidence.measured > 0 && r.evidence.measured < 1);
});
