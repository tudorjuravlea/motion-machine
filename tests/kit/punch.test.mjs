// moves/punch without a browser: on every other footage clip of a scene the footage (and only the
// footage) is scaled about its anchor; the scale is a step held for the whole clip, never animated;
// each scene starts the alternation again; with no footage nothing is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import punch from '../../patterns/moves/punch/pattern.js';
import { footageCtx } from '../../runtime/kit/footage.js';

const edit = { fps: 30, frames: 263, duration: 8.767, picture: [{ start: 0, from: 8, length: 70 }, { start: 70, from: 104, length: 123 }, { start: 193, from: 278, length: 70 }] };
function camera() {
  const footage = { style: {} }, caption = { style: {} };
  return { footage, caption, querySelectorAll: (sel) => (sel === '[data-footage]' ? [footage] : []), style: {} };
}
/** The move as the kit runs it: scene starting at `start`, film time t. */
function at(start, t, params = {}) {
  const cam = camera();
  punch.at(cam, 0.5, { u: t - start, d: 9, params, footage: footageCtx({ edit }, t) });
  return cam;
}

test('the first clip of a scene stays as shot; the next is punched in about the anchor; the one after is back', () => {
  assert.equal(at(0, 1).footage.style.transform, '');
  const p = at(0, 3).footage.style;
  assert.equal(p.transform, 'scale(1.15)');
  assert.equal(p.transformOrigin, '50% 35%');
  assert.equal(at(0, 7).footage.style.transform, '');
});

test('the scale is one step held for the whole clip, whatever the progress', () => {
  const seen = new Set();
  for (let t = 70.5 / 30; t < 193 / 30; t += 0.1) seen.add(at(0, t).footage.style.transform);
  assert.deepEqual([...seen], ['scale(1.15)']);
});

test('a scene restarts the alternation: its first clip is never punched, even when it starts on a cut', () => {
  assert.equal(at(70 / 30 - 0.0003, 3).footage.style.transform, '', 'a scene starting a hair before the cut opens on clip 1 unpunched');
  assert.equal(at(4, 7).footage.style.transform, 'scale(1.15)', 'a scene inside clip 1 punches clip 2');
});

test('params: scale within 1.05 to 1.3, anchor in percent of the footage', () => {
  const s = at(0, 3, { scale: 2, x: 40, y: 30 }).footage.style;
  assert.equal(s.transform, 'scale(1.3)');
  assert.equal(s.transformOrigin, '40% 30%');
  assert.equal(at(0, 3, { scale: 1 }).footage.style.transform, 'scale(1.05)');
});

test('only the footage moves: the camera and the text are untouched; with no footage nothing is written', () => {
  const cam = at(0, 3);
  assert.deepEqual(cam.style, {}); assert.deepEqual(cam.caption.style, {});
  const bare = camera();
  punch.at(bare, 0.5, { u: 3, d: 9, params: {} });
  assert.deepEqual(bare.footage.style, {});
});

test('the anchor is a point of the recording, mapped through the cover fit, so it holds whatever the frame shape', () => {
  // a 360 x 640 recording in a 1920 x 1080 box: cover scale 1920 / 360, the picture overhangs top and bottom
  const cam = camera();
  Object.assign(cam.footage, { offsetWidth: 1920, offsetHeight: 1080 });
  punch.at(cam, 0.5, { u: 3, d: 9, params: { x: 40, y: 42 }, footage: footageCtx({ edit, meta: { w: 360, h: 640 } }, 3) });
  const k = 1920 / 360, x = (1920 - 360 * k) / 2 + 0.4 * 360 * k, y = (1080 - 640 * k) / 2 + 0.42 * 640 * k;
  const [ox, oy] = cam.footage.style.transformOrigin.split(' ').map(parseFloat);
  assert.match(cam.footage.style.transformOrigin, /px .*px$/);
  assert.ok(Math.abs(ox - x) < 0.01 && Math.abs(oy - y) < 0.01, `${cam.footage.style.transformOrigin} vs ${x}px ${y}px`);
  // the recording's shape matches the box: the point is the same share of the box
  const sq = camera();
  Object.assign(sq.footage, { offsetWidth: 1080, offsetHeight: 1920 });
  punch.at(sq, 0.5, { u: 3, d: 9, params: { x: 40, y: 42 }, footage: footageCtx({ edit, meta: { w: 360, h: 640 } }, 3) });
  const [sx, sy] = sq.footage.style.transformOrigin.split(' ').map(parseFloat);
  assert.ok(Math.abs(sx - 432) < 0.01 && Math.abs(sy - 806.4) < 0.01, sq.footage.style.transformOrigin);
});
