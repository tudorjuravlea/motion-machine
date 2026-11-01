// screen/zoom-to, mode auto: the camera reads the pointer track of the recording on the screen. The fold
// gives it the recording's own time (the frame screen/play has set), so every instant is a function of t.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, fold, locate, view } from '../../runtime/kit/screen.js';
import { paramsOf } from '../../runtime/kit/params.js';
import { readTrack } from '../../runtime/kit/cursor.js';
import { softenFocus } from '../../runtime/kit/camera.js';
import play from '../../patterns/screen/play/pattern.js';
import zoom from '../../patterns/screen/zoom-to/pattern.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const BOX = { w: 720, h: 450 };
const track = readTrack({ version: 2, surface: { w: 1440, h: 900 }, samples: [
  { timeMs: 0, cx: 0.5, cy: 0.5 }, { timeMs: 2000, cx: 0.3, cy: 0.3, interactionType: 'click' }, { timeMs: 3000, cx: 0.7, cy: 0.6 },
  { timeMs: 3200, cx: 0.7, cy: 0.6, interactionType: 'click' }, { timeMs: 9000, cx: 0.7, cy: 0.6 }],
targets: [
  { timeMs: 2000, selector: '#a', box: { x: 0.25, y: 0.25, w: 0.1, h: 0.1 } },
  { timeMs: 3200, selector: '#b', box: { x: 0.65, y: 0.55, w: 0.1, h: 0.1 } }] });
const meta = { kind: 'sequence', fps: 30, frames: 300, w: 1440, h: 900, duration: 10, cursor: 'cursor.json', track };
const init = initialState('assets/rec/', meta);
const ctxOf = (e) => ({ params: paramsOf(e.module, e.action.params), d: e.d, box: BOX, ease: (_n, p) => p, locate: (state, target) => locate(state, target, BOX) });
const at = (t, params, from = init) => fold(from, [
  { action: { do: 'screen/play', params: {} }, module: play, start: 0, d: 10 },
  { action: { do: 'screen/zoom-to', params }, module: zoom, start: 0, d: 10 }], t, ctxOf).state;

test('auto mode zooms at the click target, framed so the whole box is in view', () => {
  const s = at(4.15, { mode: 'auto', depth: 2.2, follow: 0, hold: 1, spacing: 1.2 });
  near(s.zoom.s, 2.2, 0.02);
  const v = view(s.zoom);
  const half = 0.5 / v.s;
  assert.ok(v.x - half <= 0.65 && v.x + half >= 0.75 && v.y - half <= 0.55 && v.y + half >= 0.65, 'the box of #b is in view');
  const f = softenFocus({ cx: 0.7, cy: 0.6 }, 2.2);
  near(s.zoom.x, f.cx, 0.02); near(s.zoom.y, f.cy, 0.02);
  assert.equal(at(0, { mode: 'auto' }).zoom.s, 1, 'before any click the view is the whole recording');
});

test('the camera is the recording\'s own clock: the frame screen/play has reached decides it', () => {
  const a = at(4.15, { mode: 'auto', depth: 2.2, follow: 0 });
  assert.equal(a.frameTime, 4.15);
  // a recording played from 3 s in shows what the camera did at that part of the recording
  const shifted = fold(init, [
    { action: { do: 'screen/play', params: { from: 3 } }, module: play, start: 0, d: 10 },
    { action: { do: 'screen/zoom-to', params: { mode: 'auto', depth: 2.2, follow: 0 } }, module: zoom, start: 0, d: 10 }], 1.15, ctxOf).state;
  near(shifted.frameTime, 4.15, 1e-9);
  assert.deepEqual(shifted.zoom, a.zoom);
});

test('every instant is a pure function of t: forward and reverse seeks agree', () => {
  const ts = [0, 0.5, 1.3, 2.0, 2.4, 3.3, 4.0, 5.5, 9.9];
  const params = { mode: 'auto', depth: 'close', follow: 0.5, tilt: 'iso', blur: 1 };
  assert.deepEqual(ts.map((t) => at(t, params)), [...ts].reverse().map((t) => at(t, params)).reverse());
});

test('the zoom is a tilt as well when asked: the preset at full strength, none with no zoom', () => {
  assert.deepEqual(at(4.1, { mode: 'auto', depth: 'close', tilt: 'iso', follow: 0 }).tilt, { x: -10, y: -16 });
  const none = at(0, { mode: 'auto', tilt: 'iso' }).tilt;
  assert.deepEqual(none, { x: 0, y: 0 });
  assert.deepEqual(at(4.1, { mode: 'auto', depth: 'close', follow: 0 }).tilt, { x: 0, y: 0 }, 'no tilt unless asked for');
});

test('motion blur is zero at rest and appears while the camera moves, from its velocity', () => {
  const rest = at(0.2, { mode: 'auto', blur: 1 });
  assert.ok(!rest.blur || (rest.blur.sx === 0 && rest.blur.sy === 0));
  let max = 0;
  for (let t = 1.0; t < 4.5; t += 0.05) { const b = at(t, { mode: 'auto', blur: 1, depth: 'tight' }).blur; if (b) max = Math.max(max, b.sx, b.sy); }
  assert.ok(max > 0.5, `the blur peaks at ${max}`);
  for (let t = 1.0; t < 4.5; t += 0.5) assert.equal(at(t, { mode: 'auto', blur: 0 }).blur ?? null, null, 'no blur unless asked for');
});

test('zooms drawn by hand are in the auto camera too, and suggest: false leaves only those', () => {
  const s = at(3.5, { mode: 'auto', suggest: false, regions: [{ at: 2, hold: 2, x: 0.2, y: 0.8, depth: 'tight' }], follow: 0 });
  near(s.zoom.s, 3.5, 0.02);
  const f = softenFocus({ cx: 0.2, cy: 0.8 }, 3.5);
  near(s.zoom.x, f.cx, 0.02); near(s.zoom.y, f.cy, 0.02);
  near(at(7, { mode: 'auto', suggest: false, regions: [{ at: 2, hold: 2, x: 0.2, y: 0.8 }] }).zoom.s, 1, 1e-6);   // and nothing else zooms
});

test('with no pointer track on the recording the auto camera leaves the screen as it found it', () => {
  const bare = initialState('assets/rec/', { ...meta, track: undefined, cursor: undefined });
  const s = at(4.0, { mode: 'auto' }, bare);
  assert.deepEqual(s.zoom, { x: 0.5, y: 0.5, s: 1 });
});

test('the push-in on a mark or a percent point is what it always was', () => {
  const s = fold(init, [{ action: { do: 'screen/zoom-to', params: { at: '30%,40%', s: 2 } }, module: zoom, start: 0, d: 1 }], 1, ctxOf).state;
  near(s.zoom.s, 2); near(s.zoom.x, 0.3); near(s.zoom.y, 0.4);
  const half = fold(init, [{ action: { do: 'screen/zoom-to', params: { at: '30%,40%', s: 2 } }, module: zoom, start: 0, d: 1 }], 0.5, ctxOf).state;
  near(half.zoom.s, 1.5);
  assert.equal(half.tilt, undefined, 'and it tilts nothing');
});

test('a manual push-in can tilt too, by the share of the zoom it has made', () => {
  const s = fold(init, [{ action: { do: 'screen/zoom-to', params: { at: '30%,40%', s: 2, tilt: 'left' } }, module: zoom, start: 0, d: 1 }], 1, ctxOf).state;
  assert.deepEqual(s.tilt, { x: 0, y: -22 });
  const half = fold(init, [{ action: { do: 'screen/zoom-to', params: { at: '30%,40%', s: 2, tilt: 'left' } }, module: zoom, start: 0, d: 1 }], 0.5, ctxOf).state;
  near(half.tilt.y, -11);
});
