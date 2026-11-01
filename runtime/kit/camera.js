// An automatic camera for a recorded screen session. Zoom regions are read off a pointer track (the
// sidecar of cursor.js): one lands at each click target, the camera has started about a second before
// the click and has arrived as the pointer does; two zooms close together are joined by a pan; the
// view never leaves the recording; the follow of the cursor, the chase that gives the camera weight
// and the motion blur are all derived from the inputs alone, so any t in any order gives the same
// picture. Units: times in ms (the sidecar's), positions and boxes 0..1 of the recording.
//
// Adapted from OpenScreen (siddharthvaddem/openscreen, MIT, Copyright (c) 2025 Siddharth Vaddem; see
// NOTICE): the zoom timing profile (lead-in, overlap, lead-out, the curve), connected pans, the focus
// bounds and their soft edge, the stage-normalised zoom transform, the distance-adaptive cursor
// follow, the dwell-ranking and spacing of suggestions, the camera's spring constants and the motion
// blur law. What is ours: the follow and the chase are precomputed or closed-form instead of stepped
// per frame, the suggestions come from click targets and their boxes, not from a dwell guess.

import { cubicBezier } from './ease.js';
import { tiltOf, lerpTilt } from './demoframe.js';
import { rawAt } from './cursor.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, u) => a + (b - a) * u;

/** The depth ladder: six named steps of magnification. */
export const DEPTHS = { gentle: 1.25, soft: 1.5, medium: 1.8, close: 2.2, tight: 3.5, macro: 5 };
/** The window the camera takes to zoom out, and 1.5 times that to zoom in; the zoom has landed 500 ms into the window. */
export const LEAD_OUT_MS = 1015.05;
export const LEAD_IN_MS = LEAD_OUT_MS * 1.5;
export const OVERLAP_MS = 500;
/** Two zooms at most this far apart are joined by a pan of PAN_MS, not a zoom out and in. */
export const PAN_GAP_MS = 1500;
export const PAN_MS = 1000;
/** Two suggested zooms land at least this far apart. */
export const SPACING_MS = 1800;
/** The camera's spring: overdamped, so it arrives without overshoot. */
export const CHASE = { k: 320, c: 40, m: 0.92 };

const REACH = cubicBezier(0.16, 1, 0.3, 1);
const PAN = cubicBezier(0.1, 0, 0.2, 1);

/** A depth as a magnification: a step's name or a number, held to 1..5; a name that is none is `medium`. */
export function depthScale(depth) {
  if (typeof depth === 'string' && Object.hasOwn(DEPTHS, depth)) return DEPTHS[depth];
  const n = Number(depth);
  return Number.isFinite(n) && depth !== '' && depth !== null ? clamp(n, 1, 5) : DEPTHS.medium;
}

/** The deepest step of the ladder that still shows a box with room round it (a box fills at most 35 % of the view). */
export function pickDepth(box) {
  const room = 0.35 / Math.max(box.w, box.h, 1e-6);
  const steps = Object.values(DEPTHS);
  return steps.filter((s) => s <= room + 1e-9).at(-1) ?? steps[0];
}

/** How far a zoom has come at t: 0 before its lead-in, eased up to 1 as it lands, 1 while held, eased out after its end. */
export function regionStrength(region, timeMs) {
  const landed = region.startMs + OVERLAP_MS, from = landed - LEAD_IN_MS, to = region.endMs + LEAD_OUT_MS;
  if (timeMs < from || timeMs > to) return 0;
  if (timeMs < landed) return REACH((timeMs - from) / LEAD_IN_MS);
  if (timeMs <= region.endMs) return 1;
  return 1 - REACH(clamp01((timeMs - region.endMs) / LEAD_OUT_MS));
}

/** Where the zoom's centre may be at a magnification so that the view stays inside the recording (`ratio`: the view's share of each axis). */
export function focusBounds(scale, ratio) {
  const mx = Math.min(0.5, (ratio?.widthRatio ?? 1) / (2 * scale)), my = Math.min(0.5, (ratio?.heightRatio ?? 1) / (2 * scale));
  return { minX: mx, maxX: 1 - mx, minY: my, maxY: 1 - my };
}

/** A centre held inside its bounds. */
export function clampFocus(focus, scale, ratio) {
  const b = focusBounds(scale, ratio);
  return { cx: clamp(clamp01(focus.cx), b.minX, b.maxX), cy: clamp(clamp01(focus.cy), b.minY, b.maxY) };
}

const edge = (t) => -t * t * t + 2 * t * t;   // eases into a boundary: it arrives with no speed
function soft(v, min, max, softness) {
  const c = clamp(v, min, max);
  if (softness <= 0 || max <= min) return c;
  if (c < min + softness) return min + softness * edge((c - min) / softness);
  if (c > max - softness) return max - softness * edge((max - c) / softness);
  return c;
}

/** A centre held inside its bounds with a soft edge, so the view comes to the recording's edge without a hard stop. */
export function softenFocus(focus, scale, ratio) {
  const b = focusBounds(scale, ratio);
  return {
    cx: soft(clamp01(focus.cx), b.minX, b.maxX, Math.min(0.12, (b.maxX - b.minX) * 0.35)),
    cy: soft(clamp01(focus.cy), b.minY, b.maxY, Math.min(0.12, (b.maxY - b.minY) * 0.35)),
  };
}

/**
 * The camera as a transform of the whole recording at a zoom's magnification and strength: scale 1 to
 * `zoomScale`, and the translate (in fractions of the stage) that brings the focus to the middle, both
 * in proportion to the strength.
 */
export function transformOf(zoomScale, focus, strength) {
  const p = clamp01(strength);
  return { scale: 1 + (zoomScale - 1) * p, x: (0.5 - focus.cx * zoomScale) * p + 0, y: (0.5 - focus.cy * zoomScale) * p + 0 };
}

/** The centre a transform looks at (the inverse of transformOf at full strength; the view's centre at any other). */
export function focusOf(tr) {
  return { cx: (0.5 - tr.x) / tr.scale, cy: (0.5 - tr.y) / tr.scale };
}

/** A transform as the screen layer's zoom state: the centre of the view and its magnification. */
export function viewOf(tr) {
  return { x: (0.5 - tr.x) / tr.scale, y: (0.5 - tr.y) / tr.scale, s: tr.scale };
}

// ---------------------------------------------------------------------------------------------
// following the cursor

const FOLLOW = { min: 0.1, max: 0.25, ramp: 0.15, referenceMs: 25 };
const FOLLOW_TAIL_MS = 3000;
const STEP_MS = 1000 / 240;
const follows = new WeakMap();

/**
 * Where a zoomed camera looks when it follows the cursor: the focus chases the recorded pointer, faster
 * the farther behind it is (a share of the gap per 25 ms between 0.1 and 0.25), whatever the render
 * rate. The source steps this per frame; here it is run once over a fixed 240 Hz grid for the whole
 * track, so `at(t)` is a lerp. `at(timeMs)` is `{ cx, cy }`.
 */
export function followPath(track) {
  const hit = follows.get(track);
  if (hit) return hit;
  const first = track.samples[0].timeMs, last = track.samples.at(-1).timeMs + FOLLOW_TAIL_MS;
  const n = Math.max(2, Math.ceil((last - first) / STEP_MS) + 1);
  const xs = new Float64Array(n), ys = new Float64Array(n);
  const start = rawAt(track, first);
  xs[0] = start.cx; ys[0] = start.cy;
  for (let i = 1; i < n; i++) {
    const raw = rawAt(track, first + i * STEP_MS);
    const dist = Math.hypot(raw.cx - xs[i - 1], raw.cy - ys[i - 1]);
    const base = FOLLOW.min + (FOLLOW.max - FOLLOW.min) * Math.min(1, dist / FOLLOW.ramp);
    const f = 1 - (1 - base) ** (STEP_MS / FOLLOW.referenceMs);
    xs[i] = xs[i - 1] + (raw.cx - xs[i - 1]) * f;
    ys[i] = ys[i - 1] + (raw.cy - ys[i - 1]) * f;
  }
  const path = {
    at(timeMs) {
      const u = (timeMs - first) / STEP_MS;
      if (!(u > 0)) return { cx: xs[0], cy: ys[0] };
      if (u >= n - 1) return { cx: xs[n - 1], cy: ys[n - 1] };
      const i = Math.floor(u), k = u - i;
      return { cx: lerp(xs[i], xs[i + 1], k), cy: lerp(ys[i], ys[i + 1], k) };
    },
  };
  follows.set(track, path);
  return path;
}

// ---------------------------------------------------------------------------------------------
// zoom regions

/** What a pointer's click does to the camera: tags every zoom it makes `auto`, so they can be taken out again. */
export function withoutAuto(regions) {
  return regions.filter((r) => r.source !== 'auto');
}

/**
 * Zoom suggestions from the click targets of a track: each click that has a box is a candidate whose
 * zoom has landed at the click and is centred on the box; the ones that were looked at longest (until
 * the next click, at most 3 s) come first, one is kept only if no accepted one lands within `spacing` of
 * it, and none that overlaps a zoom already there (`existing`).
 * @param {object} track  @param {{ totalMs: number, existing?: object[], depth?: string|number, hold?: number, leadMs?: number, tilt?: string, spacing?: number }} o
 */
export function suggestZooms(track, o) {
  const { totalMs, existing = [], depth = 'medium', leadMs = 0, tilt = 'none', spacing = SPACING_MS } = o;
  const targets = track.targets ?? [];
  if (!(totalMs > 0) || !targets.length) return [];
  const hold = Math.min(totalMs, o.hold ?? Math.max(1000, totalMs * 0.05));
  const cands = targets.map((g, i) => ({ g, dwell: Math.min(3000, (targets[i + 1]?.timeMs ?? totalMs) - g.timeMs) }))
    .sort((a, b) => b.dwell - a.dwell || a.g.timeMs - b.g.timeMs);
  const reserved = existing.map((r) => ({ start: r.startMs, end: r.endMs }));
  const accepted = [];
  for (const { g } of cands) {
    const startMs = Math.max(0, Math.round(g.timeMs + leadMs)), endMs = Math.min(totalMs, startMs + hold);
    if (!(endMs > startMs) || accepted.some((a) => Math.abs(a.startMs - startMs) < spacing)) continue;
    if (reserved.some((s) => endMs > s.start && startMs < s.end)) continue;
    reserved.push({ start: startMs, end: endMs });
    accepted.push({
      id: '', source: 'auto', startMs, endMs, depth: depth === 'fit' ? pickDepth(g.box) : depthScale(depth),
      focus: { cx: g.box.x + g.box.w / 2, cy: g.box.y + g.box.h / 2 }, tilt, target: g.selector, box: g.box,
    });
  }
  accepted.sort((a, b) => a.startMs - b.startMs);
  accepted.forEach((r, i) => {
    r.id = `auto-${i + 1}`;
    if (tilt === 'alternate') r.tilt = i % 2 ? 'right' : 'left';
  });
  return accepted;
}

/** Pairs of zooms close enough to be joined by a pan: `{ from, to, start, end }` (the pan runs from the first one's end for a second). */
export function connectedPairs(regions) {
  const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);
  const pairs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1].startMs - sorted[i].endMs > PAN_GAP_MS) continue;
    pairs.push({ from: sorted[i], to: sorted[i + 1], start: sorted[i].endMs, end: sorted[i].endMs + PAN_MS });
  }
  return pairs;
}

const rest = { strength: 0, scale: 1, focus: { cx: 0.5, cy: 0.5 }, tilt: { x: 0, y: 0 }, region: null };

/**
 * The camera as the zoom regions author it at t, before the chase: the dominant zoom's strength, its
 * magnification, its centre (held in bounds with the soft edge; pulled toward the cursor by the
 * region's `follow` share when `opts.follow` gives the cursor) and its tilt. During a connected pan the
 * strength is 1 and the magnification, centre and tilt run from one zoom to the next.
 * @param {object[]} regions @param {number} timeMs @param {{ connect?: boolean, follow?: (t: number) => { cx: number, cy: number } }} [opts]
 */
export function authoredAt(regions, timeMs, opts = {}) {
  const pairs = opts.connect === false ? [] : connectedPairs(regions);
  const focusOfRegion = (r) => {
    let f = r.focus;
    const share = Number(r.follow) || 0;
    if (share > 0 && opts.follow) { const c = opts.follow(timeMs); f = { cx: lerp(f.cx, c.cx, share), cy: lerp(f.cy, c.cy, share) }; }
    return softenFocus(f, r.depth);
  };
  for (const { from, to, start, end } of pairs) {
    if (timeMs < start || timeMs > end) continue;
    const p = PAN(clamp01((timeMs - start) / Math.max(1, end - start)));
    const a = focusOfRegion(from), b = focusOfRegion(to);
    return { strength: 1, scale: lerp(from.depth, to.depth, p), focus: { cx: lerp(a.cx, b.cx, p), cy: lerp(a.cy, b.cy, p) }, tilt: lerpTilt(tiltOf(from.tilt), tiltOf(to.tilt), p), region: to, pan: true };
  }
  for (const { to, end } of pairs) {
    if (timeMs > end && timeMs < to.startMs) return { strength: 1, scale: to.depth, focus: focusOfRegion(to), tilt: tiltOf(to.tilt), region: to };
  }
  let best = null;
  for (const r of regions) {
    if (pairs.some((p) => p.from === r && timeMs > r.endMs) || pairs.some((p) => p.to === r && timeMs < p.end)) continue;
    const strength = regionStrength(r, timeMs);
    if (strength > 0 && (!best || strength > best.strength || (strength === best.strength && r.startMs > best.r.startMs))) best = { r, strength };
  }
  if (!best) return rest;
  return { strength: best.strength, scale: best.r.depth, focus: focusOfRegion(best.r), tilt: lerpTilt({ x: 0, y: 0 }, tiltOf(best.r.tilt), best.strength), region: best.r };
}

// ---------------------------------------------------------------------------------------------
// the chase

/**
 * The response of an overdamped spring (the camera's weight) chasing a piecewise-linear target, in
 * closed form: the target is a sum of ramps, and the response to each ramp is the integral of the
 * step response. No stepping: `at(timeMs)` is `{ value, rate }` (rate per second) for any t, in any
 * order; ramps long past are summed through prefix sums (they have settled to a lag of c/k).
 * @param {ArrayLike<number>} values the target every `stepMs`, from t = 0 (held after the last)
 * @param {number} stepMs @param {{ k: number, c: number, m?: number }} spring  overdamped
 */
export function chaseSeries(values, stepMs, { k, c, m = 1 }) {
  const w0 = Math.sqrt(k / m), zeta = c / (2 * Math.sqrt(k * m));
  if (!(zeta > 1)) throw new RangeError(`chase: the spring must be overdamped (zeta ${zeta.toFixed(3)})`);
  const root = Math.sqrt(zeta * zeta - 1), r1 = -w0 * (zeta - root), r2 = -w0 * (zeta + root), gap = r2 - r1;
  const step = (u) => (u <= 0 ? 0 : 1 - (r2 * Math.exp(r1 * u) - r1 * Math.exp(r2 * u)) / gap);
  const ramp = (u) => (u <= 0 ? 0 : u - ((r2 / r1) * (Math.exp(r1 * u) - 1) - (r1 / r2) * (Math.exp(r2 * u) - 1)) / gap);
  const lag = c / k, settled = 16 / Math.abs(r1);
  const n = values.length, dt = stepMs / 1000;
  const v0 = n ? values[0] : 0;
  // a ramp of slope change a[j] starts at t[j]
  const a = new Float64Array(n), t = new Float64Array(n);
  let prev = 0;
  for (let j = 0; j < n; j++) {
    const slope = j < n - 1 ? (values[j + 1] - values[j]) / dt : 0;
    a[j] = slope - prev; prev = slope; t[j] = j * dt;
  }
  const sumA = new Float64Array(n + 1), sumB = new Float64Array(n + 1);
  for (let j = 0; j < n; j++) { sumA[j + 1] = sumA[j] + a[j]; sumB[j + 1] = sumB[j] + a[j] * t[j]; }
  return {
    at(timeMs) {
      const u = timeMs / 1000;
      if (!(u > 0) || n < 2) return { value: v0, rate: 0 };
      let hi = Math.min(n - 1, Math.floor(u / dt + 1e-9));   // the last ramp that has begun
      const oldest = Math.max(-1, Math.min(hi, Math.ceil((u - settled) / dt) - 1));   // ramps up to here have settled
      let value = v0, rate = 0;
      if (oldest >= 0) { value += (u - lag) * sumA[oldest + 1] - sumB[oldest + 1]; rate += sumA[oldest + 1]; }
      for (let j = oldest + 1; j <= hi; j++) { value += a[j] * ramp(u - t[j]); rate += a[j] * step(u - t[j]); }
      return { value, rate };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// the camera

const cameras = new WeakMap();
const GRID_MS = 1000 / 60;
const SETTLE_MS = 2000;

/**
 * An automatic camera over a track. Zoom regions are the hand-drawn ones (`regions`) and, unless
 * `suggest` is false, one at each click target (tagged `auto`). Returns `{ regions, at(timeMs) }`, `at`
 * giving the screen layer's zoom state `{ x, y, s }` (the centre of the view and its magnification)
 * with `strength`, `tilt` (degrees) and the camera's velocity `vx, vy, vs` (stage fractions, and scale,
 * per second). Built once per track and options.
 * @param {object} track
 * @param {{ totalMs?: number, regions?: object[], suggest?: boolean, depth?: string|number, hold?: number, leadMs?: number, tilt?: string, spacing?: number, connect?: boolean, follow?: number, chase?: boolean }} [o]
 *   `follow`: how much of the cursor's follow the centre takes, 0..1; `chase`: false draws the authored camera as it is.
 */
export function cameraOf(track, o = {}) {
  const key = JSON.stringify(o);
  let byKey = cameras.get(track);
  if (!byKey) cameras.set(track, byKey = new Map());
  if (byKey.has(key)) return byKey.get(key);
  const totalMs = o.totalMs ?? track.samples.at(-1).timeMs;
  const share = clamp01(Number(o.follow) || 0);
  const manual = (o.regions ?? []).map((r, i) => ({ id: r.id ?? `manual-${i + 1}`, source: 'manual', tilt: 'none', follow: share, ...r }));
  const auto = o.suggest === false ? [] : suggestZooms(track, { totalMs, existing: manual, depth: o.depth, hold: o.hold, leadMs: o.leadMs, tilt: o.tilt, spacing: o.spacing })
    .map((r) => ({ ...r, follow: share }));
  const regions = [...manual, ...auto].sort((a, b) => a.startMs - b.startMs);
  const follow = (t) => followPath(track).at(t);
  const authored = (t) => {
    const a = authoredAt(regions, t, { connect: o.connect !== false, follow });
    const tr = transformOf(a.scale, a.focus, a.strength);
    return { ...tr, strength: a.strength, tilt: a.tilt };
  };
  const view = (tr, extra) => ({ ...viewOf(tr), tx: tr.x, ty: tr.y, ...extra });
  let camera;
  if (o.chase === false) {
    const h = 4;
    camera = {
      at(t) {
        const a = authored(t), b = authored(t + h), c = authored(t - h);
        return view(a, { strength: a.strength, tilt: a.tilt, vx: (b.x - c.x) / (2 * h / 1000), vy: (b.y - c.y) / (2 * h / 1000), vs: (b.scale - c.scale) / (2 * h / 1000) });
      },
    };
  } else {
    const end = regions.reduce((m, r) => Math.max(m, r.endMs), 0) + LEAD_OUT_MS + SETTLE_MS;
    const n = Math.ceil(end / GRID_MS) + 1;
    const samples = Array.from({ length: n }, (_, i) => authored(i * GRID_MS));
    const series = (pick) => chaseSeries(samples.map(pick), GRID_MS, CHASE);
    const sc = series((s) => s.scale), sx = series((s) => s.x), sy = series((s) => s.y);
    camera = {
      at(t) {
        const a = sc.at(t), x = sx.at(t), y = sy.at(t), g = authored(Math.min(Math.max(0, t), end));
        return view({ scale: a.value, x: x.value, y: y.value }, { strength: g.strength, tilt: g.tilt, vx: x.rate, vy: y.rate, vs: a.rate });
      },
    };
  }
  const built = { regions, at: camera.at };
  byKey.set(key, built);
  return built;
}

// ---------------------------------------------------------------------------------------------
// motion blur

/**
 * The blur of a camera moving at the velocity `v` (`vx`, `vy` in stage fractions per second, `vs` in
 * scale per second) over a stage of `stage.w` by `stage.h` px: none below 12 px/s, then a squared
 * response up to 14 px at 1400 px/s, times the amount's response (`amount` 0..1, curved so the top of
 * the slider has headroom: a(1 + 1.2a)). Returns `{ px, dx, dy }`: the blur's length and its unit
 * direction (a camera that only zooms blurs both ways alike).
 */
export function motionBlur(v, stage, amount) {
  const a = clamp01(Number(amount) || 0);
  const tx = Math.hypot(v.vx * stage.w, v.vy * stage.h);
  const speed = tx + Math.abs(v.vs) * Math.max(stage.w, stage.h) * 0.5;
  if (!(a > 0) || speed < 12) return { px: 0, dx: 0, dy: 0 };
  const norm = Math.min(1, speed / 1400);
  const px = norm * norm * 14 * (a * (1 + 1.2 * a));
  return tx > 0 ? { px, dx: (v.vx * stage.w) / tx, dy: (v.vy * stage.h) / tx } : { px, dx: Math.SQRT1_2, dy: Math.SQRT1_2 };
}
