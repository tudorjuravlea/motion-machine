// The head box read from a person matte: a head over shoulders, a head with a gap under it, a speaker
// close enough to fill the width, an empty mask; and the clip's face (the median over a clip's frames)
// the kit uses, which is steady within a shot and changes at a cut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headBox } from '../../scripts/lib/footage-face.mjs';
import { faceOfClip } from '../../runtime/kit/footage.js';

const W = 200, H = 120;
const blank = () => new Uint8Array(W * H);
const rect = (m, x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 255; return m; };
const disc = (m, cx, cy, r) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * W + x] = 255; return m; };
const near = (a, b, e = 0.02) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('a head over a neck and shoulders: the box is the head, not the shoulders', () => {
  const m = disc(blank(), 100, 30, 18);            // head: rows 12..48
  rect(m, 92, 48, 108, 62);                         // neck
  rect(m, 40, 62, 160, 120);                        // shoulders and chest, leaving through the foot
  const [x0, y0, x1, y1] = headBox(m, W, H);
  near(x0, 82 / W); near(x1, 118 / W); near(y0, 12 / H); assert.ok(y1 >= 46 / H && y1 <= 64 / H, `bottom ${y1}`);
});

test('a head with a gap under it ends at the gap', () => {
  const m = disc(blank(), 80, 30, 18);
  rect(m, 60, 100, 100, 120);
  const [, y0, , y1] = headBox(m, W, H);
  near(y0, 12 / H); near(y1, 48 / H);
});

test('a speaker who fills the width has no shoulder step: the head is capped to a share of the person', () => {
  const m = rect(blank(), 0, 10, 200, 120);
  const [, y0, , y1] = headBox(m, W, H);
  near(y0, 10 / H);
  assert.ok(y1 <= (10 + 0.6 * 110 + 1) / H + 1e-9, `capped, got ${y1}`);
});

test('no person gives no box', () => {
  assert.equal(headBox(blank(), W, H), null);
  assert.equal(headBox(rect(blank(), 5, 5, 6, 6), W, H), null, 'a speck is not a person');
});

test('the clip\'s face is the median of its frames\' boxes, so it is steady in a shot and changes at a cut', () => {
  const edit = { fps: 30, frames: 90, picture: [{ start: 0, from: 0, length: 30 }, { start: 30, from: 100, length: 60 }] };
  const boxes = [];
  for (let i = 0; i < 200; i++) boxes.push(i < 100 ? [0.3 + (i % 3) * 0.001, 0.1, 0.5, 0.3] : [0.5, 0.2, 0.7, 0.45]);
  boxes[5] = null; boxes[10] = [0.9, 0.9, 1, 1];   // a lost frame and an outlier
  const f = { edit, face: { boxes } };
  const a = faceOfClip(f, 0), b = faceOfClip(f, 1);
  near(a[0], 0.301, 0.002); near(a[3], 0.3, 1e-9);
  assert.deepEqual(b, [0.5, 0.2, 0.7, 0.45]);
  assert.equal(faceOfClip({ edit, face: null }, 0), null);
  assert.equal(faceOfClip({ edit, face: { boxes: boxes.map(() => null) } }, 0), null);
});
