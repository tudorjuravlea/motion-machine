// W-QUIET (SPEC §7): film quiet before the end; deck last press brings at most one element.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, warnsOnly } from './_harness.mjs';

const run = gate();

test('film: the last arrival 1.9 s before the end warns W-QUIET', async () => {
  const r = warnsOnly(await run('W-QUIET/film'), 'W-QUIET');
  assert.equal(r.evidence.measured, 1.9);
});

test('deck: a final press that brings two elements warns W-QUIET', async () => {
  const r = warnsOnly(await run('W-QUIET/deck'), 'W-QUIET');
  assert.equal(r.evidence.measured, 2);
  assert.equal(r.evidence.press, 6);
});
