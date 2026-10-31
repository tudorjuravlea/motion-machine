// The readings W-POP and W-DEADSTOP take from frame strips (scripts/check/_strips.mjs), on synthetic
// frames: a frame is N = 10 000 pixels, so one pixel is 0.01 % of the picture and each threshold
// has an edge a pixel wide. No browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { share, pops, deadStop, stitch, plan, motionsOf, LUMA_STEP, POP_SHARE, POP_RETURN, JUMP_SHARE, MAX_FRAMES, FPS } from '../../scripts/check/_strips.mjs';

const N = 10000;
/** A frame whose first `lit` pixels are bright. */
const frame = (lit) => { const f = new Uint8Array(N); f.fill(255, 0, lit); return f; };
/** A frame lit from `from` for `len` pixels (so two frames can differ by a chosen count). */
const band = (from, len) => { const f = new Uint8Array(N); f.fill(255, from, from + len); return f; };

test('share counts the pixels that moved by more than the step, and not those that moved by exactly it', () => {
  const a = new Uint8Array(N), b = new Uint8Array(N);
  b.fill(LUMA_STEP, 0, 100);
  assert.equal(share(a, b), 0, 'a move of exactly the step is not a change');
  b.fill(LUMA_STEP + 1, 0, 100);
  assert.equal(share(a, b), 0.01);
});

test('a lone frame among identical ones is a pop; the edge is POP_SHARE of the picture', () => {
  const px = POP_SHARE * N;   // 20 pixels
  const still = frame(0);
  const frames = (lone) => [still, still, lone, still, still];
  const run = (fs) => pops([0, fs.length - 1], (n) => fs[n]);
  assert.equal(run(frames(frame(px))).length, 1, 'exactly the threshold is a pop');
  assert.equal(run(frames(frame(px))).at(0).frame, 2);
  assert.equal(run(frames(frame(px - 1))).length, 0, 'a pixel under it is not');
});

test('the neighbours must match: they may differ by POP_RETURN of the pop, and no more', () => {
  const m = 100;   // the pop differs from both neighbours by 100 pixels
  const lone = band(0, m);
  const before = band(m, 0);   // dark
  const mk = (diffPx) => [before, band(5000, diffPx), lone, before, before];
  // frames: [dark, X, lone, dark, dark]: the lone frame at 2, neighbours X (index 1) and dark (index 3)
  const at = (diffPx) => pops([0, 4], (n) => mk(diffPx)[n]).filter((p) => p.frame === 2);
  // X differs from dark by diffPx pixels (elsewhere), and from the lone frame by diffPx + m
  assert.equal(at(POP_RETURN * m).length, 1, 'neighbours 30 pixels apart: a pop');
  assert.equal(at(POP_RETURN * m + 2).length, 0, 'neighbours more than 30 pixels apart: not');
});

test('a motion that carries on is not a pop, however large its steps', () => {
  const fs = [0, 400, 800, 1200, 1600].map((px) => frame(px));
  assert.deepEqual(pops([0, 4], (n) => fs[n]), []);
});

test('a dead stop: one step carries JUMP_SHARE of the change and the frames after it stand still', () => {
  const still = Array(10).fill(0);
  const make = (jump, rest) => [rest, jump, ...still];
  assert.ok(deadStop(make(0.06, 0.04)), '60 % of the change in one step: a dead stop');
  assert.equal(deadStop(make(0.06, 0.04)).share, JUMP_SHARE);
  assert.equal(deadStop(make(0.05, 0.04)), null, 'a step under 60 % of the change is an ease');
});

test('a dead stop needs the tail to stand still for three frames and a third of the motion', () => {
  const s = (tail) => [0, 0.05, ...Array(tail).fill(0)];
  assert.equal(deadStop(s(3)), null, 'under six steps in all is a cut, not an ease');
  assert.ok(deadStop(s(6)), 'a jump then six still frames');
  assert.equal(deadStop([0.05, 0, 0, 0, 0, 0, 0.05, 0, 0, 0]), null, 'two jumps share the change: neither carries 60 %');
  const half = [0.05, 0.001, 0.001, 0.001, 0.001, 0.001, 0.05, 0.001];
  assert.equal(deadStop(half), null, 'a second jump after the first is a motion, not a dead stop');
});

test('a dead stop ignores a tail that still moves a little: under 5 % of the jump counts as still', () => {
  const jump = 0.1;
  const tail = (v) => [jump, ...Array(8).fill(v)];
  assert.ok(deadStop(tail(jump * 0.049)), 'each tail step under 5 % of the jump');
  assert.equal(deadStop(tail(jump * 0.2)), null, 'a tail that eases on is an ease-out');
});

test('an eased motion is not a dead stop: ease-out cubic over 18 frames puts 15 % in its first step', () => {
  const f = (x) => 1 - (1 - x) ** 3;
  const steps = Array.from({ length: 18 }, (_, k) => (f((k + 1) / 18) - f(k / 18)) * 0.1);
  assert.equal(deadStop(steps), null);
});

test('a stitch: one motion stops abruptly and another starts abruptly within two frames', () => {
  const ramp = (n, v) => Array(n).fill(v);
  const a = ramp(8, 0.01), b = ramp(8, 0.01);
  assert.ok(stitch(a, b), 'no frame between');
  assert.equal(stitch(a, b).gap, 0);
  assert.ok(stitch([...a, 0, 0], b), 'two still frames');
  assert.equal(stitch([...a, 0, 0, 0], b), null, 'three still frames are a pause, not a stitch');
  assert.ok(stitch(a, b, 2), 'two frames between the windows');
  assert.equal(stitch(a, b, 3), null);
});

test('a motion that eases out of one and into the next is not a stitch', () => {
  const out = [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.003, 0.0005];   // decelerates: the last moving step is 30 % of the peak
  const into = [0, 0.003, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01];
  assert.equal(stitch(out, into), null);
  assert.ok(stitch([...out.slice(0, 6), 0.0036], [0.0036, ...into.slice(2)]), 'at 36 % of the peak both ends are abrupt');
  assert.equal(stitch([...out.slice(0, 6), 0.0034], [0.0034, ...into.slice(2)]), null, 'at 34 % they ease');
});

test('a motion of fewer than three moving frames is not a gesture to stitch', () => {
  assert.equal(stitch([0.01, 0.01, 0, 0], [0.01, 0.01, 0.01, 0.01]), null);
});

test('plan reads the frames of each motion and a frame either side, and keeps out of a cut', () => {
  const schedule = {
    duration: 6,
    events: [
      { t: 0, kind: 'cut', d: 0 }, { t: 3, kind: 'cut', d: 0.4 },
      { t: 1, kind: 'arrive', selector: 'a', d: 0.5 },
      { t: 3.2, kind: 'arrive', selector: 'b', d: 0.5 },
      { t: 4.5, kind: 'move', selector: 'screen', d: 0.5, screen: true },
      { t: 4.5, kind: 'move', selector: 'ambient', d: 1, ambient: true },
    ],
  };
  const p = plan(schedule);
  assert.deepEqual(p.runs[0], [29, 46], 'a: 1.0 s to 1.5 s is frames 30..45, plus one either side');
  assert.ok(!p.frames.has(89) && !p.frames.has(90) && !p.frames.has(101), 'a cut 3 s to 3.4 s and the frame before it are left out');
  assert.ok(p.frames.has(102) && !p.frames.has(100), 'b starts inside the cut, so only its frames from the cut\'s end are read');
  assert.ok(!p.frames.has(136) && !p.frames.has(140), 'a screen motion and an ambient one are not read');
  assert.equal(p.capped, false);
  const hard = plan({ duration: 3, events: [{ t: 1, kind: 'cut', d: 0 }, { t: 1, kind: 'arrive', selector: 'c', d: 0.5 }] });
  assert.ok(hard.frames.has(30) && !hard.frames.has(29), 'a hard cut leaves out only the frame before it: the new scene\'s first frame is read');
});

test('a move longer than 1.5 s is read at its first second and its last half second', () => {
  const { win } = motionsOf({ events: [{ t: 0, kind: 'move', selector: 'cam', d: 4 }] });
  assert.deepEqual(win.map((w) => [w.from, w.to]), [[0, 1], [3.5, 4]]);
});

test('the number of frames read is bounded per format', () => {
  const events = Array.from({ length: 40 }, (_, i) => ({ t: i * 1.5, kind: 'arrive', selector: `s${i}`, d: 1 }));
  const p = plan({ duration: 62, events });
  assert.equal(p.capped, true);
  assert.equal(p.frames.size, MAX_FRAMES);
  assert.equal(FPS, 30);
});
