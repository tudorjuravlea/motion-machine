// W-LOOP-SEAM (SPEC §7): a loop repeats, so the change entering it (frame 0 to frame 1) must match the change leaving it (the last
// two exported frames), not only the position. G-LOOP keeps judging the position. Only a story of kind "loop" is read.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { gate, row } from './_harness.mjs';
import { variant, cleanup } from './_variant.mjs';
import { MAX_MISMATCH, motionMismatch } from '../../scripts/check/W-LOOP-SEAM.mjs';

const run = gate();
after(cleanup);
const only = { only: ['G-LOOP', 'W-LOOP-SEAM'] };
/** A frame of 1000 pixels at level `v`, its first pixel `bump` levels brighter. */
const frame = (v, bump = 0) => { const d = new Uint8Array(4000).fill(v); for (let i = 0; i < 1000; i++) d[i * 4 + 3] = 255; d[0] += bump; return { data: d }; };

test('motionMismatch is 0 for the same change, 1 for a change against stillness, and ignores noise on still frames', () => {
  assert.equal(motionMismatch(frame(0), frame(10), frame(100), frame(110)).share, 0);
  const against = motionMismatch(frame(0), frame(0), frame(100), frame(140));
  assert.equal(against.share, 1);
  assert.equal(against.entering, 0);
  assert.equal(against.leaving, 40);
  assert.equal(motionMismatch(frame(0), frame(0), frame(100), frame(100)).share, 0);
  assert.equal(motionMismatch(frame(0), frame(0, 10), frame(100), frame(100)).share, 0, 'a change under the floor is stillness');
  assert.equal(motionMismatch(frame(0), frame(10), frame(100), frame(90)).share, 2, 'the same speed the other way is the widest mismatch');
  assert.ok(Math.abs(motionMismatch(frame(0), frame(10), frame(100), frame(115)).share - 1 / 3) < 1e-9, '10 levels entering, 15 leaving: a third of the larger');
  assert.ok(Math.abs(motionMismatch(frame(0), frame(10), frame(100), frame(130)).share - 2 / 3) < 1e-9, '10 entering, 30 leaving: two thirds, above the limit');
  assert.ok(MAX_MISMATCH > 1 / 3 && MAX_MISMATCH < 2 / 3);
});

test('fixtures/negatives/W-LOOP-SEAM warns W-LOOP-SEAM while G-LOOP passes: the position matches, the movement does not', async () => {
  const res = await run('W-LOOP-SEAM', only);
  assert.equal(row(res, 'G-LOOP').status, 'PASS', JSON.stringify(row(res, 'G-LOOP').evidence));
  const r = row(res, 'W-LOOP-SEAM');
  assert.equal(r.status, 'WARN', JSON.stringify(r.evidence));
  assert.ok(r.evidence.measured > MAX_MISMATCH, `${r.evidence.measured}`);
  assert.equal(r.evidence.threshold, MAX_MISMATCH);
  assert.ok(r.evidence.entering < r.evidence.leaving);
  assert.equal(res.code, 0, 'a warning never blocks');
});

test('G-LOOP/ok and G-LOOP/auto, which come to rest, pass', async () => {
  for (const dir of ['G-LOOP/ok', 'G-LOOP/auto']) {
    const r = row(await run(dir, only), 'W-LOOP-SEAM');
    assert.equal(r.status, 'PASS', `${dir}: ${JSON.stringify(r.evidence)}`);
    assert.ok(r.evidence.measured <= MAX_MISMATCH);
    assert.equal(r.evidence.frames, 4);
  }
});

test('a style\'s gate.loopSeam sets the limit and the evidence says so', async () => {
  const r = row(await run(variant('W-LOOP-SEAM', ({ style }) => { style.gate = { loopSeam: 2 }; }), only), 'W-LOOP-SEAM');
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.threshold, 2);
});

test('a film that is not a loop is a SKIP with a reason', async () => {
  const r = row(await run('_base/film', only), 'W-LOOP-SEAM');
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /not a loop/);
});
