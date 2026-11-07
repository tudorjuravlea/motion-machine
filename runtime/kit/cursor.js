// A recorded pointer track turned into a cursor that is a pure function of t.
//
// The track is the sidecar `<capture>.cursor.json` (`mm capture site --script`, or any recorder that
// writes the same shape): `{ version, provider, surface, samples: [{ timeMs, cx, cy, visible,
// cursorType, interactionType }], targets: [{ timeMs, selector, box }] }` with cx, cy and the target
// boxes as 0..1 of the captured surface. Recorded pointer motion is jittery and has no weight, so the
// whole path is smoothed offline, once, by a spring that chases it on a fixed 240 Hz grid; sampling
// the result is a binary search and a lerp, so any t in any order gives the same point.
//
// Adapted from OpenScreen (siddharthvaddem/openscreen, MIT, Copyright (c) 2025 Siddharth Vaddem; see
// NOTICE): the sidecar shape, the visible-run split, the 240 Hz semi-implicit spring path, the click
// bounce window and its two-phase scale, and the cursor blur law. The art (arrow, hand and I-beam
// shapes) is our own and carries no colour: the pattern fills it from palette roles.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The cursor kinds a track may name (the sidecar's `cursorType`). */
export const CURSOR_TYPES = ['arrow', 'text', 'pointer', 'crosshair', 'open-hand', 'closed-hand', 'resize-ew', 'resize-ns', 'resize-nesw', 'resize-nwse', 'move', 'not-allowed', 'wait', 'app-starting', 'help', 'up-arrow'];
const INTERACTIONS = ['move', 'click', 'mouseup'];
/** The smoothing grid: 240 steps a second keeps the spring stable and crisp at any playback rate. */
export const STEP_MS = 1000 / 240;
/** How long a click's bounce runs. */
export const CLICK_MS = 260;
/** After its last sample a visible cursor holds still; the spring is given this long to arrive. */
const TAIL_MS = 4000;

const CSS_CURSOR = {
  pointer: 'pointer', text: 'text', 'vertical-text': 'text', crosshair: 'crosshair', grab: 'open-hand', grabbing: 'closed-hand',
  'ew-resize': 'resize-ew', 'col-resize': 'resize-ew', 'e-resize': 'resize-ew', 'w-resize': 'resize-ew',
  'ns-resize': 'resize-ns', 'row-resize': 'resize-ns', 'n-resize': 'resize-ns', 's-resize': 'resize-ns',
  'nesw-resize': 'resize-nesw', 'ne-resize': 'resize-nesw', 'sw-resize': 'resize-nesw',
  'nwse-resize': 'resize-nwse', 'nw-resize': 'resize-nwse', 'se-resize': 'resize-nwse',
  move: 'move', 'all-scroll': 'move', 'not-allowed': 'not-allowed', 'no-drop': 'not-allowed', wait: 'wait', progress: 'app-starting', help: 'help',
};

/** A computed CSS `cursor` value as a cursor type: the keyword after any url() fallbacks, an arrow for the rest. */
export function cursorTypeOf(css) {
  const word = String(css ?? '').split(',').pop().trim().toLowerCase();
  return CSS_CURSOR[word] ?? 'arrow';
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * A sidecar read the way the source reads one: samples with a finite time are kept, sorted, their
 * position clamped to 0..1, an unknown type or interaction made an arrow or a move, `visible`
 * defaulting to true; a target with no box is dropped. Returns null for anything that is not a track.
 */
export function readTrack(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.samples)) return null;
  const samples = raw.samples
    .filter((s) => s && finite(s.timeMs) && finite(s.cx) && finite(s.cy))
    .map((s) => ({
      timeMs: s.timeMs, cx: clamp(s.cx, 0, 1), cy: clamp(s.cy, 0, 1), visible: s.visible !== false,
      cursorType: CURSOR_TYPES.includes(s.cursorType) ? s.cursorType : 'arrow',
      interactionType: INTERACTIONS.includes(s.interactionType) ? s.interactionType : 'move',
    }))
    .sort((a, b) => a.timeMs - b.timeMs);
  if (!samples.length) return null;
  const targets = (Array.isArray(raw.targets) ? raw.targets : [])
    .filter((g) => g && finite(g.timeMs) && g.box && ['x', 'y', 'w', 'h'].every((k) => finite(g.box[k])))
    .map((g) => ({ timeMs: g.timeMs, selector: typeof g.selector === 'string' ? g.selector : '', box: { x: g.box.x, y: g.box.y, w: g.box.w, h: g.box.h } }))
    .sort((a, b) => a.timeMs - b.timeMs);
  return { version: finite(raw.version) ? raw.version : 2, provider: raw.provider ?? 'none', surface: raw.surface ?? null, samples, targets };
}

/**
 * The spring a smoothing slider (0..1) stands for: stiff and light at the bottom, loose and heavy at
 * the top. Two ramps meet at 0.5, where k 340, c 58 and m 1 are the same from either side.
 */
export function springConfig(smoothing) {
  const s = clamp(Number.isFinite(smoothing) ? smoothing : 0, 0, 1);
  if (s <= 0.5) { const n = s / 0.5; return { k: 760 - 420 * n, c: 34 + 24 * n, m: 0.55 + 0.45 * n }; }
  const n = (s - 0.5) / 1.5;
  return { k: 340 - 180 * n, c: 58 + 22 * n, m: 1 + 0.35 * n };
}

/** The index of the last entry of `times` at or before t, or -1. */
function atOrBefore(times, t) {
  let lo = 0, hi = times.length - 1, r = -1;
  while (lo <= hi) { const mid = lo + ((hi - lo) >> 1); if (times[mid] <= t) { r = mid; lo = mid + 1; } else hi = mid - 1; }
  return r;
}

/** Maximal runs of visible samples; each knows when the next hidden sample takes the cursor away. */
function visibleRuns(samples) {
  const runs = [];
  let cur = null;
  for (const s of samples) {
    if (s.visible === false) { if (cur) { cur.until = s.timeMs; runs.push(cur); cur = null; } continue; }
    (cur ??= { samples: [], until: Infinity }).samples.push(s);
  }
  if (cur) runs.push(cur);
  return runs;
}

/** The raw linear position of a run's samples at t. */
function lerpRun(samples, times, t) {
  const last = samples.length - 1;
  if (t <= times[0]) return [samples[0].cx, samples[0].cy];
  if (t >= times[last]) return [samples[last].cx, samples[last].cy];
  const i = atOrBefore(times, t), a = samples[i], b = samples[i + 1], span = b.timeMs - a.timeMs;
  const u = span > 0 ? (t - a.timeMs) / span : 0;
  return [a.cx + (b.cx - a.cx) * u, a.cy + (b.cy - a.cy) * u];
}

/** Semi-implicit (symplectic) Euler spring across the targets, from the first one at rest. */
function springSmooth(targets, { k, c, m }) {
  const dt = STEP_MS / 1000, out = new Float64Array(targets.length);
  let x = targets[0], v = 0;
  out[0] = x;
  for (let i = 1; i < targets.length; i++) {
    v += ((-k * (x - targets[i]) - c * v) / m) * dt;
    x += v * dt;
    out[i] = x;
  }
  return out;
}

/** One run as a fixed-step series: times, smoothed x and y. A lone sample is a single point. */
function buildRun(run, spring) {
  const { samples } = run;
  const rawTimes = samples.map((s) => s.timeMs);
  const start = samples[0].timeMs, lastT = samples[samples.length - 1].timeMs;
  const end = Math.min(run.until, lastT + TAIL_MS);
  if (samples.length === 1 && !(end > start)) return { start, until: run.until, times: Float64Array.of(start), xs: Float64Array.of(samples[0].cx), ys: Float64Array.of(samples[0].cy) };
  const n = Math.max(1, Math.round((end - start) / STEP_MS)) + 1;
  const times = new Float64Array(n), rx = new Float64Array(n), ry = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i === n - 1 ? end : start + i * STEP_MS;
    times[i] = t;
    [rx[i], ry[i]] = lerpRun(samples, rawTimes, t);
  }
  return { start, until: run.until, times, xs: spring ? springSmooth(rx, spring) : rx, ys: spring ? springSmooth(ry, spring) : ry };
}

function sampleRun(r, t) {
  const last = r.times.length - 1;
  if (last === 0 || t <= r.times[0]) return { cx: r.xs[0], cy: r.ys[0], vx: 0, vy: 0 };
  if (t >= r.times[last]) return { cx: r.xs[last], cy: r.ys[last], vx: 0, vy: 0 };
  const i = atOrBefore(r.times, t), span = r.times[i + 1] - r.times[i], u = span > 0 ? (t - r.times[i]) / span : 0;
  const sec = span / 1000;
  return {
    cx: r.xs[i] + (r.xs[i + 1] - r.xs[i]) * u, cy: r.ys[i] + (r.ys[i + 1] - r.ys[i]) * u,
    vx: sec > 0 ? (r.xs[i + 1] - r.xs[i]) / sec : 0, vy: sec > 0 ? (r.ys[i + 1] - r.ys[i]) / sec : 0,
  };
}

const paths = new WeakMap();

/**
 * The cursor's place at any time, built once per track and smoothing (a pure function of both, kept
 * so a render does not build it again): `at(timeMs)` is `{ cx, cy, vx, vy }` (0..1 of the surface,
 * and its speed in surface fractions per second, read off the smoothed series), or null where the
 * track hides the cursor. `smoothing` 0 is the raw recorded path.
 * @param {object} track readTrack(...)  @param {number} smoothing 0..1
 */
export function smoothPath(track, smoothing = 0.67) {
  const key = (Number.isFinite(smoothing) ? clamp(smoothing, 0, 1) : 0).toFixed(2);
  let byKey = paths.get(track);
  if (!byKey) paths.set(track, byKey = new Map());
  if (byKey.has(key)) return byKey.get(key);
  const s = Number(key);
  const runs = visibleRuns(track.samples).map((r) => buildRun(r, s > 0 ? springConfig(s) : null));
  const path = {
    at(timeMs) {
      for (const r of runs) if (timeMs >= r.start && timeMs < r.until) return sampleRun(r, timeMs);
      return null;
    },
  };
  byKey.set(key, path);
  return path;
}

/** The cursor type in force at t: that of the last sample at or before it, an arrow before the first. */
export function typeAt(track, timeMs) {
  const i = atOrBefore(track.samples.map((s) => s.timeMs), timeMs);
  return i < 0 ? 'arrow' : track.samples[i].cursorType;
}

/** How far a click's bounce has to run at t: 1 at the click, 0 after 260 ms (and before any click). */
export function clickBounce(track, timeMs) {
  const { samples } = track;
  for (let i = atOrBefore(samples.map((s) => s.timeMs), timeMs); i >= 0; i--) {
    const age = timeMs - samples[i].timeMs;
    if (age > CLICK_MS) return 0;
    if (samples[i].interactionType === 'click') return 1 - age / CLICK_MS;
  }
  return 0;
}

/** The scale the cursor takes at a bounce's remaining progress: it dips as pressed, then rebounds past 1. `bounce` 0..5. */
export function bounceScale(progress, bounce) {
  if (!(progress > 0) || !(bounce > 0)) return 1;
  const intensity = clamp(bounce, 0, 5) / 5, elapsed = 1 - clamp(progress, 0, 1);
  if (elapsed < 0.38) return 1 - Math.sin((elapsed / 0.38) * Math.PI) * intensity * 0.24;
  return 1 + Math.sin(((elapsed - 0.38) / 0.62) * Math.PI) * intensity * 0.16;
}

/** The blur of a cursor moving at `speed` px/s, in px: proportional to the speed and to `amount` (0..1), at most 6. */
export function blurPx(speed, amount) {
  const a = clamp(Number.isFinite(amount) ? amount : 0, 0, 1);
  return Number.isFinite(speed) ? clamp(speed * a * 0.004, 0, 6) : 0;
}

// Cursor art: one path each, in a box of `w` by `h` units, and where the cursor's point is (`hot`).
// No colour: the pattern fills it from a palette role and outlines it in another.
const ARROW = { d: 'M2 2 L2 24.5 L7.6 19.4 L11.6 28.6 L15.6 26.9 L11.7 17.8 L19.2 17.6 Z', w: 22, h: 30, hot: [2, 2] };
const POINTER = { d: 'M8.2 14.2 V4.1 A2 2 0 0 1 12.2 4.1 V11.6 A1.7 1.7 0 0 1 15.4 11.1 A1.7 1.7 0 0 1 18.6 11.6 A1.7 1.7 0 0 1 21.8 12.4 V19.4 C21.8 23.6 19.4 26.6 15.3 26.6 H12.6 C10.4 26.6 9 25.6 7.6 23.6 L3.6 18.4 A1.7 1.7 0 0 1 6.2 16.3 L8.2 18.4 Z', w: 25, h: 29, hot: [10.2, 2] };
const TEXT = { d: 'M6.2 2 H18.4 V4.4 H13.4 V23.6 H18.4 V26 H6.2 V23.6 H11.2 V4.4 H6.2 Z', w: 24.6, h: 28, hot: [12.3, 14] };
const SHAPES = { arrow: ARROW, pointer: POINTER, 'open-hand': POINTER, 'closed-hand': POINTER, text: TEXT };

/** The art for a cursor type: `{ d, w, h, hot }` (path data, its box, the point the pointer is at); a type with no art of its own is the arrow. */
export function shapeOf(type) {
  return SHAPES[type] ?? ARROW;
}

const timeCache = new WeakMap();

/** The raw recorded position at t, linear between samples and held at the ends: `{ cx, cy }`. */
export function rawAt(track, timeMs) {
  let times = timeCache.get(track);
  if (!times) timeCache.set(track, times = track.samples.map((s) => s.timeMs));
  const [cx, cy] = lerpRun(track.samples, times, timeMs);
  return { cx, cy };
}
