// Motion blur (`--sub N`, SPEC §2 item 8): the N instants of a frame lie in the half of the frame interval that
// ends on the frame (a 180 degree shutter), and when a hard cut falls inside that span the instants before the cut
// move to the cut, so no frame blends two scenes. `--sub 1` is the frame's own instant and nothing else.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { instantsOfFrame } from '../../scripts/export.mjs';
import { mm, stampChecked, workCopy } from './cli-helpers.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('--sub 1 is the frame instant alone, cuts or not', () => {
  assert.deepEqual(instantsOfFrame(7, 10, 1), [0.7]);
  assert.deepEqual(instantsOfFrame(30, 10, 1, [3]), [3]);
});

test('--sub N spreads the instants over the half frame ending on the frame', () => {
  const t = instantsOfFrame(10, 10, 4);
  assert.equal(t.length, 4);
  near(t.at(-1), 1);                       // the last instant is the frame itself
  near(t[0], 1 - 0.5 * 0.1 * 3 / 4);       // the first lies 3/4 of a half frame earlier
  for (let j = 1; j < 4; j++) near(t[j] - t[j - 1], 0.5 * 0.1 / 4);
  assert.ok(1 - t[0] < 0.05, 'all inside half a frame interval');
});

test('the first frame never reaches before zero', () => {
  for (const t of instantsOfFrame(0, 10, 4)) assert.equal(t, 0);
});

test('a hard cut inside the span: instants before it move to the cut, those after stay', () => {
  // frame 10 at 10 fps spans (0.95, 1]; a cut at 0.98 leaves the instants 0.95625.. before it
  const t = instantsOfFrame(10, 10, 4, [0.98]);
  assert.equal(t.length, 4);
  for (const x of t) assert.ok(x >= 0.98 - 1e-12, `${x} is on or after the cut`);
  near(t.at(-1), 1);
  assert.equal(t[0], 0.98);
});

test('a cut on the frame itself pulls every instant to it; a cut past the frame or before the span changes nothing', () => {
  assert.deepEqual(instantsOfFrame(30, 10, 4, [3]), [3, 3, 3, 3]);
  assert.deepEqual(instantsOfFrame(30, 10, 4, [3.05]), instantsOfFrame(30, 10, 4));
  assert.deepEqual(instantsOfFrame(30, 10, 4, [2.9]), instantsOfFrame(30, 10, 4));
});

// end to end: the smoke film has a hard cut at 3 s; a --sub 4 frame on the cut holds nothing of the outgoing scene
let w;
before(() => { w = workCopy('export-blur'); stampChecked(w.film); });
after(() => w?.cleanup());

const grayFrame = (file, n) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${n}),scale=216:216,format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  assert.equal(r.status, 0, String(r.stderr));
  return r.stdout;
};
const meanDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

test('--sub 4: the frame at a hard cut is the incoming scene alone; --sub 1 is unchanged by the rule', () => {
  const keep = join(w.dir, 'keep'); mkdirSync(keep);
  const name = 'kit-smoke-film-1x1.mp4';
  const run = (sub) => {
    const r = mm(['export', w.film, '--fps', '10', '--sub', String(sub), '--formats', '1x1']);
    assert.equal(r.status, 0, r.out);
    const f = join(keep, `sub${sub}.mp4`);
    copyFileSync(join(w.film, 'out', name), f);
    return f;
  };
  const one = run(1), four = run(4);
  const cutOne = grayFrame(one, 30), cutFour = grayFrame(four, 30);
  const before = grayFrame(one, 29);
  assert.ok(meanDiff(before, cutOne) > 0.5, 'the scenes differ at the cut (the fixture shows what it should)');
  assert.ok(meanDiff(cutFour, cutOne) < 0.5, `the cut frame at --sub 4 equals the incoming scene alone (${meanDiff(cutFour, cutOne).toFixed(3)})`);
});
