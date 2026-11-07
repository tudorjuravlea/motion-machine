// runtime/kit/cursor.js: a recorded pointer track (the sidecar `<capture>.cursor.json`) turned into a
// cursor that is a pure function of t: the offline spring-smoothed path, the click bounce, the motion
// blur, hotspot-anchored shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTrack, cursorTypeOf, springConfig, smoothPath, typeAt, clickBounce, bounceScale, blurPx, shapeOf, STEP_MS, CLICK_MS } from '../../runtime/kit/cursor.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const RAW = {
  version: 2, provider: 'none', surface: { w: 1000, h: 500 },
  samples: [
    { timeMs: 500, cx: 0.8, cy: 0.5, visible: true, cursorType: 'pointer', interactionType: 'click' },
    { timeMs: 0, cx: 0.1, cy: 0.5, visible: true, cursorType: 'arrow', interactionType: 'move' },
    { timeMs: 400, cx: 0.8, cy: 0.5, visible: true, cursorType: 'arrow', interactionType: 'move' },
    { timeMs: 700, cx: 0.8, cy: 0.5, visible: true, cursorType: 'pointer', interactionType: 'mouseup' },
  ],
  targets: [{ timeMs: 500, selector: '#go', box: { x: 0.7, y: 0.4, w: 0.2, h: 0.2 } }],
};

test('readTrack sorts, clamps and defaults what a sidecar leaves out; garbage is null', () => {
  const t = readTrack(RAW);
  assert.deepEqual(t.samples.map((s) => s.timeMs), [0, 400, 500, 700]);
  assert.equal(readTrack({ samples: [] }), null);
  assert.equal(readTrack(null), null);
  assert.equal(readTrack('x'), null);
  const loose = readTrack({ version: 2, samples: [{ timeMs: 10, cx: 2, cy: -1 }, { timeMs: NaN, cx: 0, cy: 0 }, { timeMs: 20, cx: 0.5, cy: 0.5, cursorType: 'banana', interactionType: 'wiggle', visible: false }] });
  assert.equal(loose.samples.length, 2, 'a sample with no finite time is dropped');
  assert.deepEqual([loose.samples[0].cx, loose.samples[0].cy], [1, 0], 'cx and cy are clamped to 0..1');
  assert.equal(loose.samples[0].visible, true);
  assert.equal(loose.samples[0].cursorType, 'arrow');
  assert.equal(loose.samples[1].cursorType, 'arrow', 'an unknown cursor type reads as an arrow');
  assert.equal(loose.samples[1].interactionType, 'move');
  assert.equal(loose.samples[1].visible, false);
  assert.deepEqual(t.targets[0].box, { x: 0.7, y: 0.4, w: 0.2, h: 0.2 });
  assert.deepEqual(readTrack({ samples: [{ timeMs: 0, cx: 0, cy: 0 }], targets: [{ timeMs: 1, box: { x: 'a' } }] }).targets, [], 'a target with no box is dropped');
});

test('the CSS cursor of an element reads as a cursor type', () => {
  assert.equal(cursorTypeOf('pointer'), 'pointer');
  assert.equal(cursorTypeOf('text'), 'text');
  assert.equal(cursorTypeOf('default'), 'arrow');
  assert.equal(cursorTypeOf('auto'), 'arrow');
  assert.equal(cursorTypeOf('grab'), 'open-hand');
  assert.equal(cursorTypeOf('grabbing'), 'closed-hand');
  assert.equal(cursorTypeOf('col-resize'), 'resize-ew');
  assert.equal(cursorTypeOf('ns-resize'), 'resize-ns');
  assert.equal(cursorTypeOf('not-allowed'), 'not-allowed');
  assert.equal(cursorTypeOf('url(x.png), pointer'), 'pointer', 'the fallback keyword after a url() is the one that counts');
  assert.equal(cursorTypeOf(undefined), 'arrow');
});

test('the spring behind the smoothing: the slider maps to k, c, m as the source documents', () => {
  const d = springConfig(0.67);
  near(d.k, 319.6, 0.05); near(d.c, 60.5, 0.05); near(d.m, 1.04, 0.005);
  assert.deepEqual(springConfig(0.5), { k: 340, c: 58, m: 1 });
  assert.deepEqual(springConfig(0), { k: 760, c: 34, m: 0.55 });
  const a = springConfig(0.25), b = springConfig(0.5);
  assert.ok(a.k > b.k, 'a lower slider is stiffer');
  assert.equal(springConfig(9).k, springConfig(1).k, 'the slider is clamped to 0..1');
});

test('the smoothed path is a pure function of t: forward and reverse seeks agree', () => {
  const path = smoothPath(readTrack(RAW), 0.67);
  const ts = [0, 33, 120, 399, 400, 455, 500, 640, 1200, 3000];
  const fwd = ts.map((t) => path.at(t));
  const rev = [...ts].reverse().map((t) => path.at(t)).reverse();
  assert.deepEqual(fwd, rev);
  assert.deepEqual(smoothPath(readTrack(RAW), 0.67).at(455), path.at(455), 'a path built again gives the same point');
});

test('the smoothed cursor trails the raw one, then settles on it', () => {
  const track = readTrack(RAW);
  const path = smoothPath(track, 0.67);
  const raw = smoothPath(track, 0);
  near(raw.at(200).cx, 0.1 + 0.7 * 0.5, 1e-9);   // smoothing 0: the raw linear path (0.1 at 0 ms, 0.8 at 400 ms)
  const mid = path.at(300).cx, rawMid = raw.at(300).cx;
  assert.ok(mid < rawMid - 0.01, `smoothed ${mid} should trail raw ${rawMid}`);
  assert.ok(Math.abs(path.at(700).cx - 0.8) > 0.005, 'still on its way a third of a second after the pointer stopped');
  assert.ok(Math.abs(path.at(1500).cx - 0.8) < 0.005, 'and arrived a second after');
  near(path.at(0).cx, 0.1, 1e-6);
});

test('a path hides where the track hides it, and never smooths across the gap', () => {
  const t = readTrack({ version: 2, samples: [
    { timeMs: 0, cx: 0.2, cy: 0.2, visible: true }, { timeMs: 100, cx: 0.3, cy: 0.2, visible: true },
    { timeMs: 200, cx: 0.9, cy: 0.9, visible: false },
    { timeMs: 300, cx: 0.5, cy: 0.5, visible: true }, { timeMs: 400, cx: 0.5, cy: 0.5, visible: true }] });
  const p = smoothPath(t, 0.67);
  assert.ok(p.at(150), 'a visible cursor holds its place until the sample that hides it');
  assert.equal(p.at(200), null, 'hidden from the hidden sample on');
  assert.equal(p.at(250), null);
  assert.ok(p.at(50) && p.at(350));
  near(p.at(300).cx, 0.5, 1e-6);   // the second run starts where its first sample is, not pulled from the first run
  assert.equal(p.at(-5), null, 'before the first sample there is no cursor');
});

test('the path carries its own speed, analytically: a still pointer has none, a moving one has some', () => {
  const p = smoothPath(readTrack(RAW), 0.67);
  const moving = p.at(200), still = p.at(2500);
  assert.ok(Math.hypot(moving.vx, moving.vy) > 0.1, 'moving: fractions of the surface per second');
  assert.ok(Math.hypot(still.vx, still.vy) < 1e-3);
  assert.equal(STEP_MS, 1000 / 240);
});

test('the cursor type is the one at or before t', () => {
  const t = readTrack(RAW);
  assert.equal(typeAt(t, 0), 'arrow');
  assert.equal(typeAt(t, 450), 'arrow');
  assert.equal(typeAt(t, 500), 'pointer');
  assert.equal(typeAt(t, 9000), 'pointer');
  assert.equal(typeAt(t, -10), 'arrow', 'before the first sample: an arrow');
});

test('the click bounce lasts 260 ms from the click sample and is a dip, then a rebound', () => {
  const t = readTrack(RAW);
  assert.equal(CLICK_MS, 260);
  assert.equal(clickBounce(t, 499), 0, 'before the click: no bounce running');
  near(clickBounce(t, 500), 1, 1e-9);   // progress 1 at the click, 0 after 260 ms
  near(clickBounce(t, 630), 0.5, 1e-9);
  assert.equal(clickBounce(t, 761), 0);
  assert.equal(clickBounce(t, 700), 1 - 200 / 260, 'a mouseup after the click does not end it');
  // the scale at bounce 5: a dip to 0.76 about 49 ms after the click, a rebound to 1.16 about 179 ms after, back to 1
  const scale = (ageMs) => bounceScale(1 - ageMs / 260, 5);
  near(scale(49.4), 0.76, 0.005);
  near(scale(179), 1.16, 0.005);
  near(scale(98.8), 1, 1e-6);
  near(bounceScale(1 - 49.4 / 260, 2.5), 0.88, 0.005);
  near(bounceScale(1 - 179 / 260, 2.5), 1.08, 0.005);
  assert.equal(bounceScale(0, 5), 1);
  assert.equal(bounceScale(0.5, 0), 1, 'bounce 0 is off');
});

test('cursor blur: none below nothing, proportional to speed, capped at 6 px', () => {
  assert.equal(blurPx(0, 0.35), 0);
  near(blurPx(1000, 0.35), 1.4, 1e-9);
  assert.equal(blurPx(1e6, 1), 6);
  assert.equal(blurPx(1000, 0), 0);
  assert.equal(blurPx(1000, -3), 0);
  assert.equal(blurPx(NaN, 0.5), 0);
});

test('shapes are anchored at their hotspot and fit their box', () => {
  for (const type of ['arrow', 'pointer', 'text']) {
    const s = shapeOf(type);
    assert.ok(s.d.startsWith('M'), `${type} has a path`);
    assert.ok(s.hot[0] >= 0 && s.hot[0] <= s.w && s.hot[1] >= 0 && s.hot[1] <= s.h, `${type}'s hotspot is inside its box`);
  }
  assert.deepEqual(shapeOf('resize-ew'), shapeOf('arrow'), 'a type with no art of its own draws as the arrow');
  assert.ok(shapeOf('open-hand').d === shapeOf('pointer').d, 'the hands share the pointer');
  const a = shapeOf('arrow');
  assert.ok(a.hot[0] < a.w / 3 && a.hot[1] < a.h / 3, 'the arrow points from its top left');
});
