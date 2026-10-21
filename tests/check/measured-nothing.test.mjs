// SPEC §7: a rule that measured nothing, or only part of what it should, never reports PASS.
// W-PACE on a film shorter than one half window, G-EDGE and G-OVERLAP on a film with no text at
// its rests, G-LOUD on files the story does not ship: each says SKIP and why.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import wPace, { paceWindows } from '../../scripts/check/W-PACE.mjs';
import gEdge from '../../scripts/check/G-EDGE.mjs';
import gOverlap from '../../scripts/check/G-OVERLAP.mjs';
import gLoud from '../../scripts/check/G-LOUD.mjs';

const arrivals = (times) => times.map((t) => ({ kind: 'arrive', t }));

test('W-PACE: a film shorter than 5 s has no window to judge and says SKIP with the reason', async () => {
  const ctx = { story: { kind: 'film' }, style: { pacing: { arrivalsPer10s: [3, 9] } }, schedule: { duration: 4.5, events: arrivals([0.5, 1.5, 2.5]) } };
  assert.deepEqual(paceWindows(ctx.schedule), []);
  const r = await wPace(ctx);
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /shorter than 5 s/);
});

test('W-PACE: a film of 12 s judges its one full window (the 2 s tail is too short) and passes inside the band', async () => {
  const ctx = { story: { kind: 'film' }, style: { pacing: { arrivalsPer10s: [3, 9] } }, schedule: { duration: 12, events: arrivals([0.5, 2, 4, 6, 8, 10.5, 11]) } };
  const r = await wPace(ctx);
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.windows.length, 1);
});

/** A context whose sample() returns the given text boxes at every rest. */
const textCtx = (boxes, rests = [1, 2]) => ({
  floors: { safe: 80 }, format: '16x9', story: {},
  schedule: { kind: 'film', rests, duration: 3, events: [] },
  sample: async () => ({ probe: { frame: { w: 1920, h: 1080 }, elements: boxes } }),
});
const box = (x, y, w, h, selector) => ({ text: 'Hello', ink: { x, y, w, h }, selector });

test('G-EDGE and G-OVERLAP: no text at any rest is SKIP with a reason, not PASS', async () => {
  for (const rule of [gEdge, gOverlap]) {
    const r = await rule(textCtx([]));
    assert.equal(r.status, 'SKIP');
    assert.match(r.evidence.reason, /no text/);
  }
});

test('G-EDGE and G-OVERLAP: a pass says how much it measured', async () => {
  const ctx = textCtx([box(200, 200, 100, 40, '.a'), box(400, 400, 100, 40, '.b')]);
  for (const rule of [gEdge, gOverlap]) {
    const r = await rule(ctx);
    assert.equal(r.status, 'PASS');
    assert.equal(r.evidence.instants, 2);
    assert.equal(r.evidence.texts, 4);
  }
});

// ---- G-LOUD: only what the story ships is measured ----------------------------------------------
let dir;
const ff = (args) => assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]).status, 0);
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'mm-loud-'));
  mkdirSync(join(dir, 'out'));
  ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', join(dir, 'out', 'mix.wav')]);   // loud and stale
  ff(['-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=1:r=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(dir, 'out', 'film-16x9.mp4')]);   // what ships: silent
  ff(['-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=1:r=10', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-shortest', join(dir, 'out', 'old-id-16x9.mp4')]);   // a leftover with sound
  copyFileSync(join(dir, 'out', 'old-id-16x9.mp4'), join(dir, 'out', 'film-16x9.partial.mp4'));
  writeFileSync(join(dir, 'out', 'noise.txt'), '');
});
after(() => rmSync(dir, { recursive: true, force: true }));

test('G-LOUD: a silent MP4 that ships, a stale loud mix.wav, a leftover MP4 of another id: SKIP, nothing else is measured', async () => {
  const r = await gLoud({ dir, style: {}, story: { id: 'film', formats: ['16x9'] } });
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /no audio stream/);
});

test('G-LOUD: with no MP4 that ships, out/mix.wav is what is measured', async () => {
  const r = await gLoud({ dir, style: {}, story: { id: 'other', formats: ['9x16'] } });
  assert.notEqual(r.status, 'SKIP');
  assert.equal(r.evidence.files.length, 1);
  assert.equal(r.evidence.files[0].file, 'out/mix.wav');
});
