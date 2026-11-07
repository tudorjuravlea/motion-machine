// The sound negatives through the whole gate: each starts from _base/film, so it
// fails or warns with exactly its id; the G-PEAK and W-LOUDNESS negatives' shipped mixes are tracked files, so the
// result is the same in a fresh clone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, failsOnly, warnsOnly, row } from './_harness.mjs';

const run = gate();

test('G-PEAK: the tracked out/mix.wav clips (true peak above -1 dBTP) and fails G-PEAK; W-LOUDNESS is the same mix seen by a warning', async () => {
  const res = await run('G-PEAK');
  const r = failsOnly(res, 'G-PEAK', { inherent: ['W-LOUDNESS'] });
  assert.equal(r.evidence.file, 'out/mix.wav');
  assert.ok(r.evidence.truePeak > -1, String(r.evidence.truePeak));
  assert.match(r.evidence.reason, /dBTP/);
});

test('W-LOUDNESS: a quiet but clean mix (-24 LUFS, true peak -21 dBTP) only warns; G-PEAK passes and the gate exits 0', async () => {
  const res = await run('W-LOUDNESS');
  const r = warnsOnly(res, 'W-LOUDNESS');
  assert.equal(r.evidence.file, 'out/mix.wav');
  assert.ok(Math.abs(r.evidence.measured + 24) <= 0.5, String(r.evidence.measured));
  assert.equal(row(res, 'G-PEAK').status, 'PASS');
});

test('W-CUE: a cue 120 ms off the grid warns W-CUE only (W-MIX is a partial SKIP: no peaks yet)', async () => {
  const res = await run('W-CUE');
  const r = warnsOnly(res, 'W-CUE', { inherent: ['W-SOUND-SHAPE'] });      // the first cue of these pieces comes late: the same fixture seen by the shape rule
  assert.equal(r.evidence.measured, 120);
  assert.equal(r.evidence.instant, 1.37);
  assert.equal(row(res, 'W-MIX').status, 'SKIP');
});

test('W-MIX: three ticks within 45 ms warn W-MIX only (cooldown twice, three sounding at once)', async () => {
  const r = warnsOnly(await run('W-MIX'), 'W-MIX', { inherent: ['W-SOUND-SHAPE'] });
  assert.deepEqual(r.evidence.kinds.sort(), ['cooldown', 'overlap']);
  assert.equal(r.evidence.reasons.filter((x) => x.kind === 'cooldown').length, 2);
});
