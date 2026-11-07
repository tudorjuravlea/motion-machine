// Authored product UI: a whole short interaction drawn as a pure function of its beat's time. A ui
// pattern lays every part out at its final geometry first and only then reads the clock, so words
// never reflow and any frame can be reached from any other. Colour comes from palette roles in
// ui.css; a cursor here is authored, where cursor.js plays back a recorded one.
import { shapeOf } from './cursor.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (x) => x * x * (3 - 2 * x);

/** Seconds into the beat: the whole beat at a rest (p = 1) or past its end, which covers a deck and reduced motion. */
export function elapsed(p, ctx) {
  if (p >= 1) return ctx.d;
  return clamp(ctx.u, 0, ctx.d);
}

/** A script of named steps, in order: `[name, seconds, { after }?]`; `after` is a gap from the step before, negative to overlap it. `at(name, t)` reads 0 to 1 over that step; a pattern exports as `steps` the starts a viewer would count as beats. */
export function timeline(steps) {
  const spans = new Map();
  let end = 0, total = 0;
  for (const [name, d, opts] of steps) {
    const start = end + (opts?.after ?? 0);
    spans.set(name, { start, d });
    end = start + d;
    total = Math.max(total, end);
  }
  const span = (name) => {
    const s = spans.get(name);
    if (!s) throw new Error(`timeline: unknown step "${name}"`);
    return s;
  };
  return {
    total: Math.round(total * 1e6) / 1e6,
    start: (name) => span(name).start,
    end: (name) => span(name).start + span(name).d,
    at(name, t) {
      const s = span(name);
      return s.d > 0 ? clamp01((t - s.start) / s.d) : (t >= s.start ? 1 : 0);
    },
  };
}

/** How long a hand takes to cross `px` page pixels, longer for a longer way and within a human range. `scale` is the type size against a UI's usual 15 px. */
export function travelS(px, scale = 1) {
  return clamp(0.26 + 0.0009 * (px / scale), 0.3, 0.65);
}

/**
 * Where an authored cursor is at t. `stops` are `{ x, y, at }`: it reaches each stop at that time,
 * leaving only as late as the distance allows, and bows a little on the way as a hand does.
 */
export function cursorAt(t, stops, scale = 1) {
  if (t <= stops[0].at) return { x: stops[0].x, y: stops[0].y };
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    if (t >= b.at) continue;
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
    const leave = Math.max(a.at, b.at - travelS(dist, scale));
    if (t <= leave || dist === 0) return { x: a.x, y: a.y };
    const e = smooth((t - leave) / (b.at - leave));
    const bow = Math.sin(Math.PI * e) * Math.min(dist * 0.08, 24 * scale);
    return { x: a.x + dx * e - (dy / dist) * bow, y: a.y + dy * e + (dx / dist) * bow };
  }
  const last = stops[stops.length - 1];
  return { x: last.x, y: last.y };
}

/** A press at time `at`: the scale of what is pressed, down in 80 ms, held, back. */
export function pressAt(t, at, depth = 0.9) {
  const x = t - at;
  if (x <= 0 || x >= 0.3) return 1;
  if (x < 0.08) return 1 - (1 - depth) * smooth(x / 0.08);
  if (x <= 0.18) return depth;
  return depth + (1 - depth) * smooth((x - 0.18) / 0.12);
}

/** How far item `i` of `n` has appeared: starts spread across `span` seconds from `start`, each fading over `fade`, the last whole as the window ends. */
export function shownOf(t, i, n, { start = 0, span = 1, fade = 0.2 } = {}) {
  const from = start + (n > 1 ? (i * (span - fade)) / (n - 1) : 0);
  return clamp01((t - from) / fade + 1e-9);
}

/** A list param, split on `sep`, trimmed and with blanks gone. */
export const listOf = (v, sep = '|') => String(v ?? '').split(sep).map((s) => s.trim()).filter(Boolean);

/** An element of class `cls` under `parent`, holding `text` if given. */
export function part(parent, cls, text) {
  const n = parent.ownerDocument.createElement('div');
  n.className = cls;
  if (text != null) n.textContent = text;
  parent.append(n);
  return n;
}

/** A filler bar, `w` em wide: a quiet stand-in for a word the story is not about. */
export function bar(parent, w, cls = '') {
  const n = part(parent, `mm-ui__bar ${cls}`.trim());
  n.style.width = `${w}em`;
  return n;
}

/** The panel of a scene, emptied and rebuilt for this seek, with the slot's own words kept in `dataset.mmLabel`. */
export function panel(el, cls) {
  if (el.dataset.mmLabel === undefined) el.dataset.mmLabel = el.textContent.trim();
  el.replaceChildren();
  return part(el, `mm-ui ${cls}`);
}

/** How the panel arrives: it rises a little and fades in, only over its first step. */
export function arrive(root, q, ctx) {
  const e = ctx.ease('enter', q);
  root.style.opacity = String(Math.round(e * 1000) / 1000);
  root.style.transform = `translateY(${Math.round((1 - e) * ctx.unit * 0.12 * 10) / 10}px)`;
}

/** Draws the authored cursor, its point at (x, y) in the panel's own px, sized to the type. */
export function drawCursor(root, { x, y }, { type = 'arrow', press = 1, opacity = 1 } = {}) {
  const s = shapeOf(type);
  const doc = root.ownerDocument;
  const size = parseFloat(doc.defaultView.getComputedStyle(root).fontSize) * 1.15;
  const k = size / s.h;
  const box = doc.createElement('div');
  box.innerHTML = `<svg class="mm-ui__cursor" viewBox="0 0 ${s.w} ${s.h}" width="${s.w * k}" height="${size}"><path d="${s.d}"/></svg>`;
  const svg = box.firstElementChild;
  svg.style.transformOrigin = `${s.hot[0] * k}px ${s.hot[1] * k}px`;
  svg.style.transform = `translate(${x - s.hot[0] * k}px, ${y - s.hot[1] * k}px) scale(${press})`;
  svg.style.opacity = String(opacity);
  root.append(svg);
  return svg;
}

/** The type size against a UI's usual 15 px, for `travelS` and `cursorAt`. */
export const scaleOf = (root) => parseFloat(root.ownerDocument.defaultView.getComputedStyle(root).fontSize) / 15;

/** A point inside `n`, in `root`'s own px: `fx`, `fy` are fractions of the box. Layout px, so a camera or the stage's scale never touches it. */
export function pointIn(n, root, fx = 0.5, fy = 0.5) {
  let x = 0, y = 0;
  for (let c = n; c && c !== root; c = c.offsetParent) { x += c.offsetLeft; y += c.offsetTop; }
  return { x: x + n.offsetWidth * fx, y: y + n.offsetHeight * fy };
}

/** A leader's route from a note to what it names: it leaves level, turns once halfway through the empty ground, and arrives level, `gap` px short of the target. */
export function leaderRoute(from, to, gap) {
  const dir = Math.sign(from.x - to.x) || 1;
  const end = { x: to.x + dir * gap, y: to.y };
  if (from.y === to.y) return [from, end];
  const mid = (from.x + end.x) / 2;
  return [from, { x: mid, y: from.y }, { x: mid, y: to.y }, end];
}

/** The length of a route of `{ x, y }` points. */
export const lengthOf = (pts) => pts.slice(1).reduce((n, q, i) => n + Math.hypot(q.x - pts[i].x, q.y - pts[i].y), 0);

/** The first `len` px of a route. A dashed or dotted line reveals by being cut, so its marks never stretch or slide. */
export function cutAt(pts, len) {
  const out = [pts[0]];
  let left = len;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y);
    if (left >= d) { out.push(b); left -= d; continue; }
    if (left > 0) out.push({ x: a.x + ((b.x - a.x) * left) / d, y: a.y + ((b.y - a.y) * left) / d });
    break;
  }
  return out;
}

const r1 = (x) => Math.round(x * 10) / 10;

/**
 * Draws one line of the annotation family in `root`'s own px. Each kind means one thing: `lead` names
 * something visible, `send` carries a request, `reply` comes back, `stream` is data still flowing.
 * `reveal` is how much of the route shows, `phase` moves a stream's dots along a route that stays put,
 * and `end` (`dot`, `arrow` or none) waits for the line to reach it.
 */
export function drawLine(root, pts, { kind = 'lead', reveal = 1, phase = 0, end = '' } = {}) {
  const seen = cutAt(pts, lengthOf(pts) * clamp01(reveal));
  const d = seen.map((q, i) => `${i ? 'L' : 'M'}${r1(q.x)} ${r1(q.y)}`).join(' ');
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const turn = Math.round((Math.atan2(last.y - prev.y, last.x - prev.x) * 1800) / Math.PI) / 10;
  const em = parseFloat(root.ownerDocument.defaultView.getComputedStyle(root).fontSize);
  const mark = reveal < 1 || !end ? '' : end === 'dot'
    ? `<circle class="mm-ui__end" cx="${r1(last.x)}" cy="${r1(last.y)}" r="${r1(em * 0.14)}"/>`
    : `<path class="mm-ui__end" d="M${r1(-em / 2)} ${r1(-em * 0.3)} L0 0 L${r1(-em / 2)} ${r1(em * 0.3)} Z" transform="translate(${r1(last.x)} ${r1(last.y)}) rotate(${turn})"/>`;
  const box = root.ownerDocument.createElement('div');
  box.innerHTML = `<svg class="mm-ui__lines" width="${root.clientWidth}" height="${root.clientHeight}"><path class="mm-ui__line mm-ui__line--${kind}" d="${d}" stroke-dashoffset="${r1(-phase)}"/>${mark}</svg>`;
  const svg = box.firstElementChild;
  root.append(svg);
  return svg;
}
