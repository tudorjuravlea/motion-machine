// The pen stroke (after drawably, MIT; restated): a shape sampled densely, every
// point jittered by a seeded stream, smoothed through the midpoints and drawn twice, the second
// pass a little wilder, so it reads as one confident line that went over itself. A boil frame adds
// a second, much smaller jitter on top of the same base: the drawing shivers, it is not redrawn.
// Pure: no DOM, no clock; the same arguments give the same path in Node and in the page.
//
// Sizes follow the pen: at a pen width of 2 px a point every 8 px and a wander of 1.5 px per unit
// of roughness, as drawably draws a UI control; a wider pen scales both, so a stroke at video size
// keeps the look instead of going still. Roughness 0 lies exactly on the shape, and the wander is
// linear in roughness from one stream, so easing roughness to 0 straightens a sketch into the
// exact shape continuously (transitions/sketch-to-ink).
import { random } from './random.js';

export const STEP = 8;           // px between samples at a pen of 2 px
const WANDER = 1.5;              // px of jitter per unit of roughness at a pen of 2 px
const SECOND = 1.4;              // the second pass wanders this much more than the first
const BOIL_SALT = 7919;          // a prime: each boil frame its own stream, apart from the base
const PASS_SALT = 104729;        // another prime: the second pass's boil stream, apart from the first's

const r1 = (x) => Math.round(x * 10) / 10;
const lerp = (a, b, t) => a + (b - a) * t;

/** A shape from a box: 'box' (corner radius r), 'pill', 'circle' (the inscribed ellipse) or 'line' (along the bottom). */
export function shapeOf(kind, { x, y, w, h }, r = 0) {
  if (!(w >= 0 && h >= 0)) w = h = NaN;   // a negative size is no shape: stroke() draws nothing
  if (kind === 'circle') return { kind: 'ellipse', cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 };
  if (kind === 'line') return { kind: 'line', x1: x, y1: y + h, x2: x + w, y2: y + h };
  const max = Math.max(0, Math.min(w, h) / 2);
  return { kind: 'box', x, y, w, h, r: kind === 'pill' ? max : Math.min(Math.max(0, Number(r) || 0), max) };
}

/** Linear between two boxes ({x, y, w, h, r}); exactly a at t <= 0 and b at t >= 1. */
export function lerpBox(a, b, t) {
  if (t <= 0) return { ...a };
  if (t >= 1) return { ...b };
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t), r: lerp(a.r ?? 0, b.r ?? 0, t) };
}

// A rounded box's outline as eight runs, clockwise from the top edge's start: four edges and four
// quarter arcs (an arc of radius 0 is its corner, so a square corner is sampled as a point).
function runs({ x, y, w, h, r }) {
  const arc = (cx, cy, a0) => ({ len: (Math.PI / 2) * r, at: (u) => [cx + r * Math.cos(a0 + u * Math.PI / 2), cy + r * Math.sin(a0 + u * Math.PI / 2)] });
  const edge = (x0, y0, x1, y1) => ({ len: Math.hypot(x1 - x0, y1 - y0), at: (u) => [lerp(x0, x1, u), lerp(y0, y1, u)] });
  return [
    edge(x + r, y, x + w - r, y), arc(x + w - r, y + r, -Math.PI / 2),
    edge(x + w, y + r, x + w, y + h - r), arc(x + w - r, y + h - r, 0),
    edge(x + w - r, y + h, x + r, y + h), arc(x + r, y + h - r, Math.PI / 2),
    edge(x, y + h - r, x, y + r), arc(x + r, y + r, Math.PI),
  ];
}

function ellipsePerimeter(rx, ry) {   // Ramanujan's second approximation
  const h = ((rx - ry) / (rx + ry || 1)) ** 2;
  return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/**
 * How many samples each run of a shape gets at one sample per `step` px. A plan made from one box
 * and kept through a morph keeps every point's place on the outline, so the jitter morphs with it.
 */
export function planOf(shape, step = STEP) {
  if (shape.kind === 'ellipse') return [Math.max(8, Math.ceil(ellipsePerimeter(shape.rx, shape.ry) / step))];
  if (shape.kind === 'line') return [Math.max(2, Math.ceil(Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) / step))];
  return runs(shape).map((run) => Math.max(1, Math.ceil(run.len / step)));
}

/** The shape's points under a plan: a closed outline (box, ellipse) without its closing point; a line with both ends. */
export function sample(shape, plan = planOf(shape)) {
  if (shape.kind === 'ellipse') {
    const n = plan[0];
    return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [shape.cx + shape.rx * Math.cos(a), shape.cy + shape.ry * Math.sin(a)]; });
  }
  if (shape.kind === 'line') {
    const n = plan[0];
    return Array.from({ length: n + 1 }, (_, i) => [lerp(shape.x1, shape.x2, i / n), lerp(shape.y1, shape.y2, i / n)]);
  }
  return runs(shape).flatMap((run, k) => Array.from({ length: plan[k] }, (_, i) => run.at(i / plan[k])));
}

/** Each point moved by up to amp px on each axis, two draws per point from `next` whatever amp is. */
export function jitter(points, next, amp) {
  return points.map(([x, y]) => [x + (next() * 2 - 1) * amp, y + (next() * 2 - 1) * amp]);
}

/** SVG path data through the points' midpoints, each point a quadratic control (1 decimal). */
export function pathOf(points, closed) {
  const n = points.length;
  const mid = (a, b) => `${r1((a[0] + b[0]) / 2)} ${r1((a[1] + b[1]) / 2)}`;
  const pt = (p) => `${r1(p[0])} ${r1(p[1])}`;
  if (closed) {
    let d = `M${mid(points[n - 1], points[0])}`;
    for (let i = 0; i < n; i++) d += `Q${pt(points[i])} ${mid(points[i], points[(i + 1) % n])}`;
    return `${d}Z`;
  }
  let d = `M${pt(points[0])}`;
  for (let i = 1; i < n - 1; i++) d += `Q${pt(points[i])} ${mid(points[i], points[i + 1])}`;
  return `${d}L${pt(points[n - 1])}`;
}

function hasSize(sh) {
  const ok = (...v) => v.every(Number.isFinite);
  if (sh.kind === 'ellipse') return ok(sh.cx, sh.cy, sh.rx, sh.ry) && sh.rx > 0 && sh.ry > 0;
  if (sh.kind === 'line') return ok(sh.x1, sh.y1, sh.x2, sh.y2) && Math.hypot(sh.x2 - sh.x1, sh.y2 - sh.y1) > 0;
  return ok(sh.x, sh.y, sh.w, sh.h, sh.r) && sh.w > 0 && sh.h > 0;
}

/**
 * The stroke: two passes of the shape, each its own path in one `d`. `pen` is the stroke width in
 * px; `roughness` the base wander (1 = drawably's default); `boil` the shiver in pen half-widths and
 * `frame` which of its frames. `plan` fixes the sampling (keep the first box's plan through a morph).
 */
export function stroke(shape, { seed = 0, roughness = 1, boil = 0, frame = 0, pen = 2, plan } = {}) {
  if (!hasSize(shape)) return '';   // nothing to draw: a box with no size, a NaN from a layout not yet laid out
  const s = Math.max(0.5, pen / 2);
  const pts = sample(shape, plan ?? planOf(shape, Math.max(4, STEP * s)));
  const next = random(seed);
  const amp = WANDER * Math.max(0, roughness) * s;
  const closed = shape.kind !== 'line';
  const pass = (k, n) => {
    const base = jitter(pts, next, amp * k);
    // each pass shivers by its own stream, so the two lines move apart and back like a pen's
    return boil > 0 ? jitter(base, random((seed + (frame + 1) * BOIL_SALT + n * PASS_SALT) >>> 0), boil * s) : base;
  };
  const first = pass(1, 0), second = pass(SECOND, 1);
  return pathOf(first, closed) + pathOf(second, closed);
}

export const BOIL_PERIOD = 0.4;  // s a boil frame holds: drawably's 1200 ms cycle of three frames

/**
 * Which boil frame shows at time t (s): every stroke on screen steps together, from the time alone
 * (drawably's per-path CSS clocks fell out of step and flashed blank; a shared clock cannot). A deck
 * rest is a still picture, and a style with period 0 does not boil: both are always frame 0.
 */
export function boilFrame(t, { period = BOIL_PERIOD, n = 3, deck = false } = {}) {
  if (deck || !(period > 0) || !(n > 1)) return 0;
  return Math.floor(Math.max(0, t) / period + 1e-9) % n;
}

/**
 * The inking contract between entrances/sketch and transitions/sketch-to-ink: fractions of one
 * piece's own stretch of the cut. The line straightens and moves onto the finished box first, the
 * label and the finished slot hand over in the middle, the line lifts last.
 */
export const INK = { straight: [0, 0.6], handover: [0.35, 0.8], lift: [0.6, 1] };
