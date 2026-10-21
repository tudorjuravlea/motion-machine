// The sound negatives through the whole gate: each starts from _base/film, so it
// fails or warns with exactly its id; the G-LOUD negative's shipped mix is a tracked file, so the
// result is the same in a fresh clone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, failsOnly, warnsOnly, row } from './_harness.mjs';

const run = gate();

test('G-LOUD: the tracked out/mix.wav measures -8 LUFS and fails G-LOUD only', async () => {
  const r = failsOnly(await run('G-LOUD'), 'G-LOUD');
  assert.equal(r.evidence.file, 'out/mix.wav');
  assert.ok(Math.abs(r.evidence.measured + 8) <= 0.5, String(r.evidence.measured));
});

test('W-CUE: a cue 120 ms off the grid warns W-CUE only (W-MIX is a partial SKIP: no peaks yet)', async () => {
  const res = await run('W-CUE');
  const r = warnsOnly(res, 'W-CUE');
  assert.equal(r.evidence.measured, 120);
  assert.equal(r.evidence.instant, 1.37);
  assert.equal(row(res, 'W-MIX').status, 'SKIP');
});

test('W-MIX: three ticks within 45 ms warn W-MIX only (cooldown twice, three sounding at once)', async () => {
  const r = warnsOnly(await run('W-MIX'), 'W-MIX');
  assert.deepEqual(r.evidence.kinds.sort(), ['cooldown', 'overlap']);
  assert.equal(r.evidence.reasons.filter((x) => x.kind === 'cooldown').length, 2);
});
