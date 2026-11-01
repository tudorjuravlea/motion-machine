// runtime/kit/camera.js: an automatic camera for a recorded screen session. Zooms land at the click
// targets of a pointer track, with the source's lead-in profile, connected pans, a depth ladder, a
// soft-edge focus clamp, a follow of the cursor and a closed-form overdamped chase; every instant is
// a pure function of t.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cubicBezier } from '../../runtime/kit/ease.js';
import {
  DEPTHS, LEAD_IN_MS, LEAD_OUT_MS, OVERLAP_MS, PAN_GAP_MS, PAN_MS, SPACING_MS, CHASE,
  depthScale, regionStrength, focusBounds, clampFocus, softenFocus, transformOf, focusOf, viewOf,
  followPath, suggestZooms, withoutAuto, connectedPairs, authoredAt, chaseSeries, cameraOf, motionBlur, pickDepth,
} from '../../runtime/kit/camera.js';
import { readTrack } from '../../runtime/kit/cursor.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('the lead-in profile: the camera starts about a second before the zoom has landed, and lands at 0.9941', () => {
  assert.equal(OVERLAP_MS, 500); near(LEAD_OUT_MS, 1015.05, 1e-9); near(LEAD_IN_MS, 1522.575, 1e-9);
  const r = { startMs: 5000, endMs: 7000 };
  assert.equal(regionStrength(r, 5000 + OVERLAP_MS - LEAD_IN_MS - 1), 0, 'nothing before the lead-in window');
  near(regionStrength(r, 5000), 0.9941, 5e-4);
  near(regionStrength(r, 5000 + OVERLAP_MS), 1, 1e-9);
  assert.equal(regionStrength(r, 6500), 1, 'held at 1 until the end');
  near(regionStrength(r, 7000), 1, 1e-9);
  assert.ok(regionStrength(r, 7000 + 300) < 1 && regionStrength(r, 7000 + 300) > 0.05, 'easing out');
  assert.equal(regionStrength(r, 7000 + LEAD_OUT_MS + 1), 0, 'and out after 1015.05 ms');
  // the curve is cubic-bezier(0.16, 1, 0.3, 1): the documented samples
  const f = cubicBezier(0.16, 1, 0.3, 1);
  near(f(0.1), 0.494, 2e-3); near(f(0.25), 0.826, 2e-3); near(f(0.5), 0.972, 2e-3);
});

test('depth ladder: six named steps, a number is clamped to 1..5', () => {
  assert.deepEqual(Object.values(DEPTHS), [1.25, 1.5, 1.8, 2.2, 3.5, 5]);
  assert.deepEqual(Object.keys(DEPTHS), ['gentle', 'soft', 'medium', 'close', 'tight', 'macro']);
  assert.equal(depthScale('close'), 2.2);
  assert.equal(depthScale(3), 3);
  assert.equal(depthScale(9), 5);
  assert.equal(depthScale(0.2), 1);
  assert.equal(depthScale('nonsense'), 1.8, 'an unknown name falls back to the default step');
});

test('a depth that fits: the deepest step that still shows the target box with room round it', () => {
  assert.equal(pickDepth({ x: 0.4, y: 0.4, w: 0.1, h: 0.05 }), 3.5, 'a small button gets a deep step');
  assert.equal(pickDepth({ x: 0.4, y: 0.4, w: 0.02, h: 0.02 }), 5, 'a tiny one the deepest');
  assert.equal(pickDepth({ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }), 1.5);
  assert.equal(pickDepth({ x: 0, y: 0, w: 1, h: 1 }), 1.25, 'a box as big as the screen gets the shallowest step');
});

test('the focus clamp: the view never leaves the frame; the soft edge eases into the boundary', () => {
  assert.deepEqual(focusBounds(2), { minX: 0.25, maxX: 0.75, minY: 0.25, maxY: 0.75 });
  assert.deepEqual(focusBounds(1), { minX: 0.5, maxX: 0.5, minY: 0.5, maxY: 0.5 });
  assert.deepEqual(clampFocus({ cx: 0.05, cy: 0.99 }, 2), { cx: 0.25, cy: 0.75 });
  const s = (v) => softenFocus({ cx: v, cy: 0.5 }, 2).cx;
  near(s(0.25), 0.25, 1e-9); near(s(0.75), 0.75, 1e-9);
  near(s(0.5), 0.5, 1e-9); near(s(0.4), 0.4, 1e-9);   // inside the soft margin: untouched
  assert.ok(s(0.3) < 0.3 && s(0.3) > 0.25, 'near the edge it is eased toward the boundary');
  let prev = -1;
  for (let v = 0; v <= 1.0001; v += 0.01) { const o = s(v); assert.ok(o >= prev - 1e-12, 'monotone'); prev = o; }
  assert.ok(softenFocus({ cx: 0, cy: 1 }, 2).cx >= 0.25);
  // the view's own half-width differs per axis when the stage and the picture differ
  assert.deepEqual(focusBounds(2, { widthRatio: 0.5, heightRatio: 1 }), { minX: 0.125, maxX: 0.875, minY: 0.25, maxY: 0.75 });
});

test('zoom transform: the focus glides to the centre as strength rises; focusOf is its inverse', () => {
  const t0 = transformOf(2, { cx: 0.7, cy: 0.3 }, 0);
  assert.deepEqual(t0, { scale: 1, x: 0, y: 0 });
  const t1 = transformOf(2, { cx: 0.7, cy: 0.3 }, 1);
  near(t1.scale, 2); near(t1.x, 0.5 - 0.7 * 2); near(t1.y, 0.5 - 0.3 * 2);
  const half = transformOf(2, { cx: 0.7, cy: 0.3 }, 0.5);
  near(half.scale, 1.5); near(half.x, (0.5 - 1.4) * 0.5);
  const f = focusOf(t1);
  near(f.cx, 0.7); near(f.cy, 0.3);
  // the screen layer's own view of the same camera (screen.js view(): a centre and a scale)
  const v = viewOf(transformOf(2, { cx: 0.7, cy: 0.3 }, 1));
  near(v.x, 0.7); near(v.y, 0.3); near(v.s, 2);
  const w = viewOf(half);
  assert.ok(w.x - 0.5 / w.s >= -1e-9 && w.x + 0.5 / w.s <= 1 + 1e-9, 'a half-strength view is inside the frame too');
});

test('connected pans: a gap of at most 1.5 s pans between zooms; a longer one zooms out and in', () => {
  assert.equal(PAN_GAP_MS, 1500); assert.equal(PAN_MS, 1000);
  const A = { id: 'a', startMs: 2000, endMs: 4000, depth: 1.5, focus: { cx: 0.3, cy: 0.3 }, tilt: 'none' };
  const B = { id: 'b', startMs: 5000, endMs: 7000, depth: 3.5, focus: { cx: 0.7, cy: 0.6 }, tilt: 'none' };
  const C = { ...B, id: 'c', startMs: 5600 };
  assert.equal(connectedPairs([A, B]).length, 1);
  assert.equal(connectedPairs([A, C]).length, 0, 'a 1.6 s gap is too long');
  assert.equal(connectedPairs([A, { ...B, startMs: 5500 }]).length, 1, 'exactly 1.5 s still connects');
  // during the pan the camera stays zoomed in and moves from A's framing to B's
  const mid = authoredAt([A, B], 4500, { connect: true });
  assert.equal(mid.strength, 1);
  const p = cubicBezier(0.1, 0, 0.2, 1)(0.5);
  near(p, 0.828, 2e-3);
  near(mid.scale, 1.5 + (3.5 - 1.5) * p, 1e-9);
  near(mid.focus.cx, focusAt(0.3, 1.5) + (focusAt(0.7, 3.5) - focusAt(0.3, 1.5)) * p, 1e-9);
  const end = authoredAt([A, B], 5000, { connect: true });
  near(end.scale, 3.5, 1e-9);
  // not connected: it zooms all the way out between them
  const D = { ...B, id: 'd', startMs: 7000 };
  assert.equal(authoredAt([A, D], 4000 + LEAD_OUT_MS + 1, { connect: true }).strength, 0);
  // a connect-off camera never pans
  assert.ok(authoredAt([A, B], 4500, { connect: false }).strength < 1);
});
function focusAt(c, s) { return softenFocus({ cx: c, cy: c }, s).cx; }

test('tilt rides on the zoom: zero with no zoom, the preset at full strength', () => {
  const A = { id: 'a', startMs: 2000, endMs: 4000, depth: 2, focus: { cx: 0.5, cy: 0.5 }, tilt: 'iso' };
  const out = authoredAt([A], 0, { connect: true });
  assert.deepEqual(out.tilt, { x: 0, y: 0 });
  const full = authoredAt([A], 3000, { connect: true });
  assert.deepEqual(full.tilt, { x: -10, y: -16 });
  const half = authoredAt([A], 2000 + OVERLAP_MS - LEAD_IN_MS * 0.9, { connect: true });
  assert.ok(half.tilt.y < 0 && half.tilt.y > -16);
});

test('the follow of the cursor: a pure function of t that is faster when the cursor is far', () => {
  const track = readTrack({ version: 2, samples: [
    { timeMs: 0, cx: 0.1, cy: 0.1 }, { timeMs: 100, cx: 0.9, cy: 0.9 }, { timeMs: 3000, cx: 0.9, cy: 0.9 },
    { timeMs: 3100, cx: 0.92, cy: 0.9 }, { timeMs: 6000, cx: 0.92, cy: 0.9 }] });
  const f = followPath(track);
  const ts = [0, 50, 300, 1000, 2900, 3050, 3200, 5900, 9000];
  assert.deepEqual(ts.map((t) => f.at(t)), [...ts].reverse().map((t) => f.at(t)).reverse());
  near(f.at(0).cx, 0.1);
  assert.ok(f.at(100).cx < 0.5, 'it lags the cursor');
  near(f.at(2900).cx, 0.9, 5e-3);
  near(f.at(9000).cx, 0.92, 1e-3);
  // distance-adaptive: a far chase closes a larger share of the gap in the same time than a near one
  const share = (a, b) => { const t = readTrack({ version: 2, samples: [{ timeMs: 0, cx: a, cy: 0.5 }, { timeMs: 1, cx: b, cy: 0.5 }, { timeMs: 5000, cx: b, cy: 0.5 }] }); return (followPath(t).at(150).cx - a) / (b - a); };
  assert.ok(share(0.1, 0.9) > share(0.1, 0.15) + 0.05, `${share(0.1, 0.9)} vs ${share(0.1, 0.15)}`);
});

const TRACK = readTrack({ version: 2, samples: [
  { timeMs: 0, cx: 0.5, cy: 0.5 }, { timeMs: 2000, cx: 0.3, cy: 0.3, interactionType: 'click' }, { timeMs: 2260, cx: 0.3, cy: 0.3, interactionType: 'mouseup' },
  { timeMs: 3000, cx: 0.7, cy: 0.6 }, { timeMs: 3200, cx: 0.7, cy: 0.6, interactionType: 'click' },
  { timeMs: 6000, cx: 0.7, cy: 0.6 }, { timeMs: 6200, cx: 0.2, cy: 0.8, interactionType: 'click' }, { timeMs: 9000, cx: 0.2, cy: 0.8 }],
targets: [
  { timeMs: 2000, selector: '#a', box: { x: 0.25, y: 0.25, w: 0.1, h: 0.1 } },
  { timeMs: 3200, selector: '#b', box: { x: 0.65, y: 0.55, w: 0.1, h: 0.1 } },
  { timeMs: 6200, selector: '#c', box: { x: 0.15, y: 0.75, w: 0.1, h: 0.1 } }] });

test('suggestions come from the click targets, at least 1800 ms apart, the longer look first, tagged auto', () => {
  assert.equal(SPACING_MS, 1800);
  const s = suggestZooms(TRACK, { totalMs: 10000, depth: 2 });
  // #a (2000) and #b (3200) are 1200 ms apart: only one of them can stand; #b is looked at for 3.0 s, #a for 1.2 s
  assert.deepEqual(s.map((r) => r.target), ['#b', '#c']);
  assert.ok(s.every((r) => r.source === 'auto'));
  assert.ok(s.every((r, i) => i === 0 || r.startMs - s[i - 1].startMs >= SPACING_MS));
  assert.equal(s[0].startMs, 3200, 'the zoom has landed at the click');
  near(s[0].focus.cx, 0.7); near(s[0].focus.cy, 0.6);   // the box centre, not a dwell mean
  assert.equal(s[0].depth, 2);
  assert.ok(s.every((r) => r.endMs <= 10000 && r.endMs > r.startMs));
  assert.equal(withoutAuto([...s, { id: 'mine', source: 'manual', startMs: 0, endMs: 500 }]).length, 1);
});

test('a suggestion avoids a zoom somebody drew by hand, and the shorter hold when the clip is short', () => {
  const manual = [{ id: 'm', source: 'manual', startMs: 3000, endMs: 4500, depth: 2, focus: { cx: 0.5, cy: 0.5 }, tilt: 'none' }];
  const s = suggestZooms(TRACK, { totalMs: 10000, existing: manual });
  assert.ok(!s.some((r) => r.target === '#b'), 'it overlaps the hand-drawn zoom');
  assert.ok(s.some((r) => r.target === '#a' || r.target === '#c'));
  const short = suggestZooms(TRACK, { totalMs: 10000 });
  assert.ok(short[0].endMs - short[0].startMs >= 1000);
  assert.deepEqual(suggestZooms(readTrack({ version: 2, samples: [{ timeMs: 0, cx: 0, cy: 0 }] }), { totalMs: 5000 }), [], 'no targets, no suggestions');
});

test('the chase is the closed-form response of an overdamped spring, equal to a fine stepping of it', () => {
  near(CHASE.k, 320); near(CHASE.c, 40); near(CHASE.m, 0.92);
  const zeta = CHASE.c / (2 * Math.sqrt(CHASE.k * CHASE.m));
  assert.ok(zeta > 1, `overdamped: zeta ${zeta}`);
  // the target: rest at 0, a ramp up over 600 ms to 1, hold, then a ramp to 0.4
  const STEP = 1000 / 60;
  const target = (t) => (t < 200 ? 0 : t < 800 ? (t - 200) / 600 : t < 1800 ? 1 : t < 2400 ? 1 - 0.6 * (t - 1800) / 600 : 0.4);
  const values = Array.from({ length: 200 }, (_, i) => target(i * STEP));
  const c = chaseSeries(values, STEP, CHASE);
  // reference: semi-implicit Euler at 0.05 ms chasing the same piecewise-linear target
  const dt = 0.00005; let x = values[0], v = 0; const ref = new Map();
  const lin = (t) => { const i = Math.min(values.length - 2, Math.floor(t / STEP)); const u = (t - i * STEP) / STEP; return values[i] + (values[i + 1] - values[i]) * u; };
  for (let s = 0; s < 3000 / (dt * 1000); s++) {
    const tMs = s * dt * 1000;
    if (Math.abs(tMs - Math.round(tMs / 100) * 100) < dt * 500) ref.set(Math.round(tMs / 100) * 100, x);
    v += ((-CHASE.k * (x - lin(Math.min(tMs, 198 * STEP))) - CHASE.c * v) / CHASE.m) * dt;
    x += v * dt;
  }
  for (const t of [100, 500, 900, 1300, 1900, 2500]) near(c.at(t).value, ref.get(t), 2e-3);
  assert.equal(c.at(0).value, 0);
  near(c.at(60000).value, 0.4, 1e-6);   // long after: the target's final value
  // overdamped and a monotone ramp: it never overshoots the target it chases
  for (let t = 0; t < 1500; t += 25) assert.ok(c.at(t).value <= 1 + 1e-9, 'no overshoot');
  // pure: any order
  const ts = [0, 77, 1400, 300, 9000];
  assert.deepEqual(ts.map((t) => c.at(t)), ts.map((t) => c.at(t)));
  assert.deepEqual([...ts].reverse().map((t) => c.at(t)).reverse(), ts.map((t) => c.at(t)));
  // its velocity is the derivative of its value
  const h = 0.5;
  near(c.at(500).rate, ((c.at(500 + h).value - c.at(500 - h).value) / (2 * h)) * 1000, 2e-3);
});

test('the camera lands on the click target and is a pure function of t', () => {
  const cam = cameraOf(TRACK, { totalMs: 10000, depth: 2, follow: 0, chase: true });
  assert.ok(cam.regions.length >= 2);
  const first = cam.regions[0];
  const landed = cam.at(first.endMs - 100);
  near(landed.s, 2, 5e-3);
  const v = { l: landed.x - 0.5 / landed.s, r: landed.x + 0.5 / landed.s, t: landed.y - 0.5 / landed.s, b: landed.y + 0.5 / landed.s };
  const box = TRACK.targets.find((g) => g.selector === first.target).box;
  assert.ok(v.l <= box.x && v.r >= box.x + box.w && v.t <= box.y && v.b >= box.y + box.h, 'the target box is inside the view');
  near(landed.x, softenFocus(first.focus, 2).cx, 5e-3);
  // before anything: a still, full-frame camera
  assert.deepEqual([cam.at(0).x, cam.at(0).y, cam.at(0).s], [0.5, 0.5, 1]);
  // order does not matter
  const ts = [0, 1500, 3300, 9000, 3300, 700, 12000];
  assert.deepEqual(ts.map((t) => cam.at(t)), [...ts].reverse().map((t) => cam.at(t)).reverse());
  // the view is always inside the frame
  for (let t = 0; t <= 12000; t += 100) { const c = cam.at(t); assert.ok(c.x - 0.5 / c.s >= -1e-6 && c.x + 0.5 / c.s <= 1 + 1e-6 && c.y - 0.5 / c.s >= -1e-6 && c.y + 0.5 / c.s <= 1 + 1e-6, `t ${t}`); }
});

test('with the chase off the camera is the authored profile itself', () => {
  const raw = cameraOf(TRACK, { totalMs: 10000, depth: 2, follow: 0, chase: false });
  const r = raw.regions[0];
  near(raw.at(r.startMs).s, 1 + (2 - 1) * regionStrength(r, r.startMs), 1e-9);
});

test('camera motion blur: none under 12 px/s, a squared response up to 14 px at 1400 px/s', () => {
  const stage = { w: 1000, h: 1000 };
  assert.deepEqual(motionBlur({ vx: 0.01, vy: 0, vs: 0 }, stage, 1), { px: 0, dx: 0, dy: 0 });
  const peak = motionBlur({ vx: 1.4, vy: 0, vs: 0 }, stage, 1);   // 1400 px/s
  near(peak.px, 14 * 1 * (1 + 1.2), 1e-9);   // slider 1 -> response 2.2
  near(peak.dx, 1); near(peak.dy, 0);
  const half = motionBlur({ vx: 0.7, vy: 0, vs: 0 }, stage, 0.5);   // normalised 0.5 -> 0.25; response 0.5 * 1.6 = 0.8
  near(half.px, 0.25 * 14 * 0.8, 1e-9);
  const diag = motionBlur({ vx: 0.5, vy: 0.5, vs: 0 }, stage, 1);
  near(Math.hypot(diag.dx, diag.dy), 1, 1e-9);
  // a pure scale change is a speed too: |ds/dt| * max(w, h) * 0.5
  assert.ok(motionBlur({ vx: 0, vy: 0, vs: 2 }, stage, 1).px > 0);
  assert.equal(motionBlur({ vx: 1.4, vy: 0, vs: 0 }, stage, 0).px, 0);
});
