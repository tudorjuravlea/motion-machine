// G-LOOP and the loop kind: a story of kind "loop" is 4 to 15 s (G-LENGTH) and its last frame
// must be its first (G-LOOP); every film rule applies to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, failsOnly } from './_harness.mjs';

const run = gate();
test('G-LOOP/seam: a loop whose last frame is not its first fails G-LOOP and nothing else', async () => {
  const r = failsOnly(await run('G-LOOP/seam'), 'G-LOOP');
  assert.match(r.evidence.reason, /last frame/);
});
test('G-LOOP/ok: a loop that ends on its first frame passes G-LOOP and G-LENGTH', async () => {
  const report = await run('G-LOOP/ok');
  const byId = Object.fromEntries(report.rules.map((x) => [x.id, x]));
  assert.equal(byId['G-LOOP'].status, 'PASS', JSON.stringify(byId['G-LOOP']));
  assert.equal(byId['G-LENGTH'].status, 'PASS', JSON.stringify(byId['G-LENGTH']));
  assert.deepEqual(report.rules.filter((x) => x.status === 'FAIL').map((x) => x.id), []);
});
test('G-LOOP/auto: a loop with autoReturn ends on its first frame with no hand-built return', async () => {
  const report = await run('G-LOOP/auto');
  const byId = Object.fromEntries(report.rules.map((x) => [x.id, x]));
  assert.equal(byId['G-LOOP'].status, 'PASS', JSON.stringify(byId['G-LOOP']));
  assert.deepEqual(report.rules.filter((x) => x.status === 'FAIL').map((x) => `${x.id}: ${x.evidence.reason}`), []);
});
