// G-DETERMINISM (SPEC §2.5): two fresh loads, one in order and one in reverse, at the three
// classic instants plus one instant per scene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, failsOnly, row } from './_harness.mjs';
import { instants } from '../../scripts/check/G-DETERMINISM.mjs';

const run = gate();

test('film instants: first frame, mid first entrance, last rest, then each scene\'s rest', async () => {
  const res = await run('_base/film', { only: ['G-DETERMINISM'] });
  const s = res.schedule;
  const at = instants(s);
  const first = s.events.find((e) => e.kind === 'arrive' && e.d > 0);
  assert.deepEqual([at.first, at.midEntrance, at.lastRest], [0, first.t + first.d / 2, s.rests.at(-1)]);
  for (const h of s.holds) assert.ok(Object.values(at).some((t) => Math.abs(t - h.from) < 1e-6), `scene ${h.scene} rest sampled`);
  const r = row(res, 'G-DETERMINISM');
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.order, 'forward and reverse');
  assert.equal(r.evidence.instants.length, Object.keys(at).length);
});

test('deck instants: rest 0, mid first entrance in press units, the last press, each scene\'s last rest', async () => {
  const res = await run('_base/deck', { only: ['G-DETERMINISM'] });
  const s = res.schedule;
  const first = s.events.find((e) => e.kind === 'arrive' && e.to > e.from);
  const at = instants(s);
  assert.deepEqual([at.first, at.midEntrance, at.lastRest], [0, (first.from + first.to) / 2, s.presses]);
  for (const sc of s.scenes) assert.ok(Object.values(at).includes(sc.end));
  assert.equal(row(res, 'G-DETERMINISM').status, 'PASS');
});

test('G-DETERMINISM/scene: randomness confined to the third scene is caught at that scene\'s instant', async () => {
  const r = failsOnly(await run('G-DETERMINISM/scene'), 'G-DETERMINISM');
  assert.equal(r.evidence.frame, 'scene:rests');
});

test('G-DETERMINISM/order: a frame that depends on the previous seek is caught by the reverse order', async () => {
  const r = failsOnly(await run('G-DETERMINISM/order'), 'G-DETERMINISM');
  assert.equal(r.evidence.frame, 'scene:sizes');
});
