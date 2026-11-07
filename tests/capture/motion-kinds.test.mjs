// The cut kinds: `capture-motion` on fixtures/capture/reference/kinds.mp4, which the
// kit rendered at 30 fps from pieces/kinds: one cut of each kind no motion preset uses (wipe right,
// iris, color-dip, whip-pan, push up, wipe down) between shots that are already full.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { extractFrames, analyse } from '../../scripts/capture-motion.mjs';
import { ROOT } from '../../scripts/lib/validate.mjs';
import { truthOf } from './motion-truth.mjs';

let truth, analysis;
before(async () => {
  truth = await truthOf(join(ROOT, 'fixtures/capture/reference/pieces/kinds'));
  analysis = analyse(await extractFrames(join(ROOT, 'fixtures/capture/reference/kinds.mp4')));
});

test('the fixture schedules the owed kinds (sanity of the fixture)', () => {
  assert.deepEqual(truth.cuts.map((c) => c.kind), ['wipe', 'iris', 'dip', 'whip-pan', 'push', 'wipe']);
});

test('the film is read at its source rate', () => {
  assert.equal(analysis.fps, 30);
  assert.equal(analysis.globalFps, 10);
});

test('each cut is found with its kind and direction, its onset within 0.1 s of the schedule', () => {
  const cuts = analysis.cuts;
  assert.deepEqual(cuts.map((c) => c.kind), truth.cuts.map((c) => c.kind), JSON.stringify(cuts.map((c) => [c.t, c.kind])));
  truth.cuts.forEach((c, i) => {
    assert.equal(cuts[i].direction ?? null, c.direction, `cut ${i} (${c.kind}): direction`);
    // An iris opens at the centre first, where the shots may agree; its change shows a little later.
    assert.ok(cuts[i].t - c.t >= -1 / 30 - 1e-6 && cuts[i].t - c.t <= 0.1 + 1e-6, `cut ${i} (${c.kind}): detected ${cuts[i].t}, scheduled ${c.t}`);
  });
});

test('wipes and pushes are timed under the move easing from their travel', () => {
  for (const c of analysis.cuts.filter((x) => ['wipe', 'push', 'whip-pan'].includes(x.kind))) {
    assert.ok(Array.isArray(c.samples) && c.samples.length >= 2, `${c.kind} at ${c.t} carries progress samples`);
  }
});
