// The footage layer's pure half: the film's clock is the edit's output clock, so t maps to an
// output frame, the clip that holds it and the source frame that clip shows; past either end the
// first or last frame holds; the frame file is the sequence's 1-based name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipAt, footageCtx, frameFile, outputFrame, paintFootage, sourceFrame } from '../../runtime/kit/footage.js';

const edit = { fps: 30, frames: 263, duration: 8.767, picture: [{ start: 0, from: 8, length: 70 }, { start: 70, from: 104, length: 123 }, { start: 193, from: 278, length: 70 }],
  words: [{ text: 'every', at: 0.12, end: 0.48 }] };

test('t maps to the output frame, clamped to the edit', () => {
  assert.equal(outputFrame(edit, 0), 0);
  assert.equal(outputFrame(edit, 69 / 30), 69, 'a whole-frame instant is that frame despite float error');
  assert.equal(outputFrame(edit, 2.3499), 70);
  assert.equal(outputFrame(edit, -1), 0);
  assert.equal(outputFrame(edit, 99), 262);
});

test('each side of a cut shows the clip it belongs to, from the right source frame', () => {
  for (let k = 1; k < edit.picture.length; k++) {
    const prev = edit.picture[k - 1], c = edit.picture[k];
    const before = (c.start - 0.5) / 30, after = (c.start + 0.5) / 30;
    assert.equal(clipAt(edit, before), k - 1);
    assert.equal(clipAt(edit, after), k);
    assert.equal(sourceFrame(edit, before), prev.from + prev.length - 1, `last frame before cut ${k}`);
    assert.equal(sourceFrame(edit, after), c.from, `first frame after cut ${k}`);
  }
  assert.equal(sourceFrame(edit, 0), 8);
  assert.equal(sourceFrame(edit, 99), 278 + 69, 'past the end the last frame holds');
});

test('the frame file is the 1-based name mm media prep writes', () => {
  assert.equal(frameFile('assets/talk/', 0), 'assets/talk/f00001.jpg');
  assert.equal(frameFile('assets/talk/', 104), 'assets/talk/f00105.jpg');
});

test('the context patterns read: film time, the clip at any t, the words', () => {
  const c = footageCtx({ edit }, 2.5);
  assert.equal(c.t, 2.5); assert.equal(c.fps, 30); assert.equal(c.clip, 1);
  assert.equal(c.clipAt(0.1), 0); assert.equal(c.clipAt(7), 2);
  assert.deepEqual(c.words, edit.words);
  assert.deepEqual(footageCtx({ edit: { ...edit, words: undefined } }, 0).words, []);
});

test('the context carries the recording\'s size from media.json, for patterns that map a point of it', () => {
  const c = footageCtx({ edit, meta: { w: 360, h: 640 } }, 1);
  assert.equal(c.w, 360); assert.equal(c.h, 640);
});

test('a decode cut short by the next seek is not reported; a frame that really fails is, once per seek', async () => {
  // a picture whose decode rejects (as an aborted or a broken one does) once its src has been set
  const el = { attrs: {}, getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = v; },
    closest: () => null, decode() { return Promise.reject(new Error('aborted')); } };
  const f = { base: 'a/', meta: { frames: 400 }, edit, els: [el] }, warned = [], tracked = [];
  const track = (p) => { tracked.push(p); return p; };
  paintFootage(f, 0.5, track, (src) => warned.push(src));   // scrubbing: three seeks before any decode settles
  paintFootage(f, 2.5, track, (src) => warned.push(src));
  paintFootage(f, 5.0, track, (src) => warned.push(src));
  await Promise.all(tracked);
  assert.deepEqual(warned, [el.getAttribute('src')], 'only the frame still asked for is named');
});
