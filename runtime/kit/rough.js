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
const WAVELENGTH = 20;           // the coherent voice: pen half-widths of outline per drift cell

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

/**
 * Any drawn shape: a polyline through `points` ([x, y][]), open or `closed`. It is sampled run by run
 * like a box's outline, so its corners stay corners, and takes every stroke, voice, wash and hatch.
 */
export function polyOf(points, closed = false) {
  return { kind: 'poly', points: points.map(([x, y]) => [x, y]), closed: !!closed };
}

// a polyline's runs: one per segment, a closed one's last segment back to its first point
function polyRuns({ points, closed }) {
  const n = points.length, out = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % n];
    out.push({ len: Math.hypot(x1 - x0, y1 - y0), at: (u) => [lerp(x0, x1, u), lerp(y0, y1, u)] });
  }
  return out;
}
const closedOf = (shape) => (shape.kind === 'poly' ? shape.closed : shape.kind !== 'line');

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
  if (shape.kind === 'poly') return polyRuns(shape).map((run) => Math.max(1, Math.ceil(run.len / step)));
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
  if (shape.kind === 'poly') {
    const pts = polyRuns(shape).flatMap((run, k) => Array.from({ length: plan[k] }, (_, i) => run.at(i / plan[k])));
    return shape.closed ? pts : [...pts, [...shape.points.at(-1)]];
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
  if (sh.kind === 'poly') return sh.points.length >= 2 && sh.points.every(([x, y]) => ok(x, y)) && polyRuns(sh).some((r) => r.len > 0);
  return ok(sh.x, sh.y, sh.w, sh.h, sh.r) && sh.w > 0 && sh.h > 0;
}

// Where each sample sits along the outline, in px from its start: a closed outline's runs laid end to
// end (a corner of radius 0 adds no length, so its two samples share a place), a line from its first
// end. `total` is the outline's whole length, the period of a closed shape's wander.
function arcsOf(shape, plan) {
  if (shape.kind === 'ellipse') {
    const n = plan[0], total = ellipsePerimeter(shape.rx, shape.ry);
    return { at: Array.from({ length: n }, (_, i) => (i / n) * total), total };
  }
  if (shape.kind === 'line') {
    const n = plan[0], total = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
    return { at: Array.from({ length: n + 1 }, (_, i) => (i / n) * total), total };
  }
  const at = [];
  let start = 0;
  if (shape.kind === 'poly') {
    polyRuns(shape).forEach((run, k) => { for (let i = 0; i < plan[k]; i++) at.push(start + (i / plan[k]) * run.len); start += run.len; });
    if (!shape.closed) at.push(start);
    return { at, total: start };
  }
  runs(shape).forEach((run, k) => { for (let i = 0; i < plan[k]; i++) at.push(start + (i / plan[k]) * run.len); start += run.len; });
  return { at, total: start };
}

/**
 * Smooth value noise in [-1, 1] over u: one seeded value per whole u, eased between them with a
 * smoothstep. With a `period` (a whole number of cells) it wraps, so u = 0 and u = period agree.
 */
function noise1(seed, cells, period = 0) {
  const next = random(seed >>> 0);
  const n = Math.max(1, Math.ceil(cells) + 2);
  const v = Array.from({ length: period > 0 ? period : n }, () => next() * 2 - 1);
  return (u) => {
    const i = Math.floor(u), f = u - i, e = f * f * (3 - 2 * f);
    const at = (k) => (period > 0 ? v[((k % period) + period) % period] : v[Math.min(v.length - 1, Math.max(0, k))]);
    return at(i) + (at(i + 1) - at(i)) * e;
  };
}

// Each point moved along both axes by two smooth noises read at its place on the outline: a hand's
// slow drift instead of a shiver. A closed outline reads a whole number of cells round its length,
// so the last point drifts into the first. Linear in amp from one stream.
function drift(points, arcs, closed, seed, amp, wavelength) {
  if (!(amp > 0)) return points.map(([x, y]) => [x, y]);
  const cells = Math.max(closed ? 3 : 1, arcs.total / wavelength);
  const period = closed ? Math.round(cells) : 0;
  const k = closed ? period / (arcs.total || 1) : 1 / wavelength;
  const nx = noise1(seed, cells, period), ny = noise1(seed + 101, cells, period);
  return points.map(([x, y], i) => { const u = arcs.at[i] * k; return [x + nx(u) * amp, y + ny(u) * amp]; });
}

// An open stroke's two ends pushed on along their own direction by `o` px: the run a quick hand
// makes past where it meant to stop.
function overrun(points, arcs, o) {
  const n = points.length;
  const out = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1; return [a[0] + (dx / l) * o, a[1] + (dy / l) * o]; };
  return {
    points: [out(points[0], points[1]), ...points, out(points[n - 1], points[n - 2])],
    arcs: { at: [-o, ...arcs.at, arcs.total + o], total: arcs.total + 2 * o },
  };
}

/**
 * The stroke as its two passes, each its own path `d`: the first line, then the pass that goes over
 * it (a pattern may draw the second thinner and fainter, as a ghost). Options beyond stroke()'s:
 * `coherent` (the wander drifts along the length; a closed outline has no seam), `wavelength` (px
 * of outline per drift cell in that voice, in pen half-widths), `ghost` (the second pass's wander
 * against the first's) and `overshoot` (an open stroke runs past each end by this many pen
 * half-widths). Leaving all four out draws exactly the stroke stroke() always drew.
 */
export function passes(shape, { seed = 0, roughness = 1, boil = 0, frame = 0, pen = 2, plan, coherent = false, wavelength = WAVELENGTH, ghost = SECOND, overshoot = 0 } = {}) {
  if (!hasSize(shape)) return ['', ''];   // nothing to draw: a box with no size, a NaN from a layout not yet laid out
  const s = Math.max(0.5, pen / 2);
  const p = plan ?? planOf(shape, Math.max(4, STEP * s));
  let pts = sample(shape, p);
  const closed = closedOf(shape);
  const amp = WANDER * Math.max(0, roughness) * s;
  let arcs = coherent || (!closed && overshoot > 0) ? arcsOf(shape, p) : null;
  if (!closed && overshoot > 0) ({ points: pts, arcs } = overrun(pts, arcs, overshoot * s));
  const g = Math.max(0, Number(ghost) || 0);
  if (coherent) {
    const lambda = Math.max(1, wavelength) * s;
    const pass = (k, n) => {
      const base = drift(pts, arcs, closed, (seed + n * PASS_SALT) >>> 0, amp * k, lambda);
      // the shiver drifts too: the whole line re-wanders a little together, each pass by its own stream
      return boil > 0 ? drift(base, arcs, closed, (seed + (frame + 1) * BOIL_SALT + n * PASS_SALT) >>> 0, boil * s, lambda) : base;
    };
    return [pathOf(pass(1, 0), closed), pathOf(pass(g, 1), closed)];
  }
  const next = random(seed);
  const pass = (k, n) => {
    const base = jitter(pts, next, amp * k);
    // each pass shivers by its own stream, so the two lines move apart and back like a pen's
    return boil > 0 ? jitter(base, random((seed + (frame + 1) * BOIL_SALT + n * PASS_SALT) >>> 0), boil * s) : base;
  };
  const first = pass(1, 0), second = pass(g, 1);
  return [pathOf(first, closed), pathOf(second, closed)];
}

/**
 * The stroke: two passes of the shape, each its own path in one `d`. `pen` is the stroke width in
 * px; `roughness` the base wander (1 = drawably's default); `boil` the shiver in pen half-widths and
 * `frame` which of its frames. `plan` fixes the sampling (keep the first box's plan through a morph).
 * Takes passes()'s voices too.
 */
export function stroke(shape, opts = {}) {
  return passes(shape, opts).join('');
}

// Each point of a closed outline's samples with its outward unit normal, from its neighbours (the
// outlines here run clockwise on screen, so outward is the tangent turned a quarter anticlockwise).
// Two samples in one place (a square corner) take the turn of the run on either side.
function normals(pts) {
  const n = pts.length;
  // a polyline may run either way round: its signed area says which way is out
  let area = 0;
  for (let i = 0; i < n; i++) area += pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1];
  const k = area < 0 ? -1 : 1;
  return pts.map((p, i) => {
    let a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    if (a[0] === p[0] && a[1] === p[1]) a = pts[(i - 2 + n) % n];
    if (b[0] === p[0] && b[1] === p[1]) b = pts[(i + 2) % n];
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    return [(k * ty) / l, (-k * tx) / l];
  });
}

/**
 * A watercolour wash of a closed shape: `layers` copies of its outline, each pushed outward by a
 * share of `bleed` (pen half-widths) that the outer layers take more of, its edge made ragged by a
 * slow noise along the length, each layer fainter than the one inside it (`alpha` for the first).
 * `offset` (pen half-widths) shifts every layer off the outline the same way, at `angle` radians or
 * a seeded one, as a print's second plate lands off register. Returns `[{ d, alpha }]`, innermost
 * first; a pattern fills each with one palette role, so every pixel is that role over the ground.
 */
export function wash(shape, { seed = 0, pen = 2, layers = 4, bleed = 6, alpha = 0.09, offset = 0, angle, plan } = {}) {
  if (!closedOf(shape) || !hasSize(shape)) return [];
  const s = Math.max(0.5, pen / 2);
  const p = plan ?? planOf(shape, Math.max(4, STEP * s));
  const pts = sample(shape, p), arcs = arcsOf(shape, p), nrm = normals(pts);
  const n = Math.max(1, Math.round(layers));
  const a = Number.isFinite(angle) ? angle : random((seed + 5501) >>> 0)() * Math.PI * 2;
  const dx = Math.max(0, offset) * s * Math.cos(a), dy = Math.max(0, offset) * s * Math.sin(a);
  const reach = Math.max(0, bleed) * s;
  const cells = Math.max(3, Math.round(arcs.total / (8 * s)));
  return Array.from({ length: n }, (_, k) => {
    const rag = noise1((seed + (k + 1) * 7877) >>> 0, cells, cells);
    const share = (k + 1) / n;
    const ring = pts.map(([x, y], i) => {
      const grow = reach * (0.08 + 0.92 * share * (0.45 + 0.55 * Math.abs(rag((arcs.at[i] / arcs.total) * cells))));
      return [x + nrm[i][0] * grow + dx, y + nrm[i][1] * grow + dy];
    });
    return { d: pathOf(ring, true), alpha: Math.round(alpha * (1 - (0.5 * k) / n) * 1000) / 1000 };
  });
}

/**
 * A hatch for a closed shape: straight lines at `angle` radians, `gap` pen half-widths apart, long
 * enough to cross the shape's box, each end nudged across the line by up to `jitter` pen half-widths
 * from the seed so the lines read as drawn. Returns `{ clip, d }`: the shape's exact outline for a
 * clipPath, and the lines.
 */
export function hatch(shape, { seed = 0, pen = 2, angle = Math.PI / 4, gap = 5, jitter = 0.4, plan } = {}) {
  if (!closedOf(shape) || !hasSize(shape)) return { clip: '', d: '' };
  const s = Math.max(0.5, pen / 2);
  const pts = sample(shape, plan ?? planOf(shape, Math.max(4, STEP * s)));
  const ux = Math.cos(angle), uy = Math.sin(angle), nx = -uy, ny = ux;
  const along = pts.map(([x, y]) => x * ux + y * uy), across = pts.map(([x, y]) => x * nx + y * ny);
  const a0 = Math.min(...along) - s, a1 = Math.max(...along) + s;
  const c0 = Math.min(...across), c1 = Math.max(...across);
  const g = Math.max(1, gap * s), j = Math.max(0, jitter) * s;
  const count = Math.max(1, Math.ceil((c1 - c0) / g));
  const start = (c0 + c1) / 2 - ((count - 1) * g) / 2;   // centred, so the first and last lines sit inside the shape's extent
  const next = random(seed);
  let d = '';
  for (let i = 0; i < count; i++) {
    const c = start + i * g, e0 = c + (next() * 2 - 1) * j, e1 = c + (next() * 2 - 1) * j;
    d += `M${r1(a0 * ux + e0 * nx)} ${r1(a0 * uy + e0 * ny)}L${r1(a1 * ux + e1 * nx)} ${r1(a1 * uy + e1 * ny)}`;
  }
  return { clip: pathOf(pts, true), d };
}

/**
 * Pen presets: a voice for the stroke, each the coherent drift with a ghost pass. `width` scales a
 * pattern's own pen width; `roughness` and `ghost` are the wander of the line and of its ghost;
 * `ghostAlpha` and `ghostWidth` are how strong and how wide the ghost is drawn against the line;
 * `overshoot` is in pen half-widths. Pencil: thin, its ghost calmer and faint. Marker: wide and
 * steady. Charcoal: medium, a wilder ghost, and open strokes that run past their ends.
 */
export const PENS = Object.freeze({
  pencil: Object.freeze({ width: 0.8, roughness: 1, coherent: true, wavelength: 20, ghost: 0.9, ghostAlpha: 0.45, ghostWidth: 0.7, overshoot: 0 }),
  marker: Object.freeze({ width: 2.2, roughness: 0.55, coherent: true, wavelength: 14, ghost: 0.8, ghostAlpha: 0.35, ghostWidth: 0.65, overshoot: 0 }),
  charcoal: Object.freeze({ width: 1.4, roughness: 0.8, coherent: true, wavelength: 12, ghost: 1.35, ghostAlpha: 0.45, ghostWidth: 0.65, overshoot: 2.5 }),
});

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
