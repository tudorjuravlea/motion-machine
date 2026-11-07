// G-EDGE (SPEC §7): its negatives fail with exactly this id; ::before/::after text has a box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, failsOnly } from './_harness.mjs';

const run = gate();

test('G-EDGE/box: a headline across the safe margin', async () => {
  const r = failsOnly(await run('G-EDGE/box'), 'G-EDGE');
  assert.match(r.evidence.reason, /safe margin/);
});

test('G-EDGE/pseudo: ::before text placed across the safe margin', async () => {
  const r = failsOnly(await run('G-EDGE/pseudo'), 'G-EDGE');
  assert.match(r.evidence.selector, /data-slot="sub"\]::before$/);
});

test('G-EDGE/platform: with platform "reels", a caption inside the bottom UI zone fails', async () => {
  const r = failsOnly(await run('G-EDGE/platform'), 'G-EDGE');
  assert.match(r.evidence.reason, /reels UI zone/);
});
