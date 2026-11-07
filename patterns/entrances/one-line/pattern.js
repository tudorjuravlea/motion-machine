// entrances/one-line: a mark is drawn as one continuous line. The beat's `asset` is an SVG (a logo
// outline, a product silhouette, a signature); its paths and shapes are read into polylines, put in a
// near-to-near order and joined by smooth bridges, so the pen never lifts. The pen slows on curves
// and speeds up on straights, with no jump in speed, and a slow pen draws a little wider, as ink does.
// The line never draws thinner on screen than 1.5 px, however far a camera pulls back. Optionally a
// camera follows the nib with a little lag and is back on the whole mark at the end; optionally the
// finished line shivers on the kit's boil clock (never in a deck). At p = 1 the whole mark is drawn.
// The SVG is read once per page (fetched, then kept by its address: the same file always gives the
// same geometry); the first seek that needs it draws once it has arrived, inside the kit's settle.
import { random } from '../../../runtime/kit/random.js';

const NS = 'http://www.w3.org/2000/svg';
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r1 = (x) => Math.round(x * 10) / 10;
const pen = (x) => (1 - Math.cos(Math.PI * clamp01(x))) / 2;   // the pen lands and lifts softly
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const HANDLE = 0.42;     // a bridge's handles, as a share of the gap it crosses
const RETRACE = 0.05;    // going over the line again costs this much of a bridge of the same length
const TURN_SPAN = 4;     // samples either side over which a turn is measured
const SMOOTH = 12;       // half-width, in samples, of the filter that keeps the pace from jumping
const THIN = 0.88, WIDE = 0.3;   // a line's width runs from 0.88 to 1.18 of its weight, fast to slow
const FLOOR = 1.5;       // px on screen: the thinnest the line may look
const STEP = 1.5;        // px between the line's samples in the slot

const params = {
  curves: { type: 'number', default: 1.5, meaning: 'how much the pen slows on curves, 0 (an even pace) to 3' },
  weight: { type: 'number', default: 1, meaning: 'the line\'s weight against the style\'s pen, 0.5 to 3' },
  fit: { type: 'number', default: 0.86, meaning: 'how much of the slot the mark fills, 0.4 to 1, at its own proportions' },
  follow: { type: 'number', default: 0, meaning: 'a camera that follows the nib with a little lag and is back on the whole mark at the end, 0 (off) to 1' },
  boil: { type: 'boolean', default: false, meaning: 'the finished line shivers on the kit\'s boil clock (never in a deck)' },
  whole: { type: 'boolean', default: false, meaning: 'a planning view: the whole line at once, its bridges in the accent, to check the order before rendering' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

// ---------------------------------------------------------------------------------------------
// reading an SVG

const NUM = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const segs = (len) => Math.max(4, Math.min(96, Math.ceil(len / 2)));
function cubic(out, p0, p1, p2, p3) {
  const n = segs(dist(p0, p1) + dist(p1, p2) + dist(p2, p3));
  for (let i = 1; i <= n; i++) {
    const t = i / n, s = 1 - t;
    out.push([s * s * s * p0[0] + 3 * s * s * t * p1[0] + 3 * s * t * t * p2[0] + t * t * t * p3[0], s * s * s * p0[1] + 3 * s * s * t * p1[1] + 3 * s * t * t * p2[1] + t * t * t * p3[1]]);
  }
}
function quad(out, p0, p1, p2) {
  const n = segs(dist(p0, p1) + dist(p1, p2));
  for (let i = 1; i <= n; i++) { const t = i / n, s = 1 - t; out.push([s * s * p0[0] + 2 * s * t * p1[0] + t * t * p2[0], s * s * p0[1] + 2 * s * t * p1[1] + t * t * p2[1]]); }
}
// an elliptical arc from p0 to p1, through its centre (the SVG specification's endpoint conversion)
function arc(out, p0, rx, ry, deg, large, sweep, p1) {
  if (!rx || !ry || (p0[0] === p1[0] && p0[1] === p1[1])) { out.push(p1); return; }
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (deg * Math.PI) / 180, co = Math.cos(phi), si = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1 = co * dx + si * dy, y1 = -si * dx + co * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (den || 1)));
  const cx1 = (k * rx * y1) / ry, cy1 = (-k * ry * x1) / rx;
  const cx = co * cx1 - si * cy1 + (p0[0] + p1[0]) / 2, cy = si * cx1 + co * cy1 + (p0[1] + p1[1]) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = segs(Math.abs(dt) * Math.max(rx, ry));
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n;
    out.push(i === n ? [p1[0], p1[1]] : [cx + rx * Math.cos(t) * co - ry * Math.sin(t) * si, cy + rx * Math.cos(t) * si + ry * Math.sin(t) * co]);
  }
}

/** SVG path data as polylines: `[{ points, closed }]`, one per subpath, every command flattened. */
export function parsePath(d) {
  const tok = String(d ?? '').match(NUM) ?? [];
  const parts = [];
  let i = 0, cmd = '', cur = [0, 0], start = [0, 0], prevC = null, prevQ = null, part = null;
  const isCmd = (t) => /^[a-z]$/i.test(t);
  const num = () => Number(tok[i++]);
  const flag = () => {   // an arc flag may run into what follows it ("01" is two flags)
    const t = tok[i];
    if (/^[01]/.test(t) && t.length > 1 && t[1] !== '.') { tok[i] = t.slice(1); return Number(t[0]); }
    i++; return Number(t);
  };
  const begin = (p) => { part = { points: [[p[0], p[1]]], closed: false }; parts.push(part); };
  while (i < tok.length) {
    if (isCmd(tok[i])) cmd = tok[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const at = (x, y) => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    if (C === 'Z') {
      if (part) { part.closed = true; const f = part.points[0], l = part.points.at(-1); if (part.points.length > 1 && f[0] === l[0] && f[1] === l[1]) part.points.pop(); }
      cur = [...start]; part = null; prevC = prevQ = null;
      continue;
    }
    if (i >= tok.length || isCmd(tok[i])) continue;
    if (!part && C !== 'M') begin(cur);
    const out = part ? part.points : null;
    if (C === 'M') {
      cur = at(num(), num()); start = [...cur]; begin(cur);
      cmd = rel ? 'l' : 'L';   // more pairs after a move are lines
      prevC = prevQ = null;
      continue;
    }
    if (C === 'L') { cur = at(num(), num()); out.push(cur); prevC = prevQ = null; }
    else if (C === 'H') { const x = num(); cur = [rel ? cur[0] + x : x, cur[1]]; out.push(cur); prevC = prevQ = null; }
    else if (C === 'V') { const y = num(); cur = [cur[0], rel ? cur[1] + y : y]; out.push(cur); prevC = prevQ = null; }
    else if (C === 'C') { const a = at(num(), num()), b = at(num(), num()), e = at(num(), num()); cubic(out, cur, a, b, e); prevC = b; prevQ = null; cur = e; }
    else if (C === 'S') { const a = prevC ? [2 * cur[0] - prevC[0], 2 * cur[1] - prevC[1]] : cur; const b = at(num(), num()), e = at(num(), num()); cubic(out, cur, a, b, e); prevC = b; prevQ = null; cur = e; }
    else if (C === 'Q') { const a = at(num(), num()), e = at(num(), num()); quad(out, cur, a, e); prevQ = a; prevC = null; cur = e; }
    else if (C === 'T') { const a = prevQ ? [2 * cur[0] - prevQ[0], 2 * cur[1] - prevQ[1]] : cur; const e = at(num(), num()); quad(out, cur, a, e); prevQ = a; prevC = null; cur = e; }
    else if (C === 'A') { const rx = num(), ry = num(), rot = num(), la = flag(), sw = flag(); const e = at(num(), num()); arc(out, cur, rx, ry, rot, la, sw, e); prevC = prevQ = null; cur = e; }
    else i++;
  }
  return parts.filter((p) => p.points.length > 1);
}

const attrsOf = (s) => Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [m[1], m[2]]));
const nums = (s) => (String(s ?? '').match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);

// an affine matrix [a, b, c, d, e, f] (x' = a x + c y + e, y' = b x + d y + f), and m x n (n first)
const ID = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
/** An SVG `transform` attribute's list as one matrix: matrix, translate, scale, rotate (about a point), skewX and skewY. */
export function matrixOf(list) {
  let m = ID;
  for (const [, fn, args] of String(list ?? '').matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const v = nums(args), rad = (deg) => (deg * Math.PI) / 180;
    let n = ID;
    if (fn === 'matrix' && v.length === 6) n = v;
    else if (fn === 'translate') n = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
    else if (fn === 'scale') n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (fn === 'rotate') {
      const c = Math.cos(rad(v[0] || 0)), s = Math.sin(rad(v[0] || 0)), cx = v[1] || 0, cy = v[2] || 0;
      n = mul(mul([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (fn === 'skewX') n = [1, 0, Math.tan(rad(v[0] || 0)), 1, 0, 0];
    else if (fn === 'skewY') n = [1, Math.tan(rad(v[0] || 0)), 0, 1, 0, 0];
    m = mul(m, n);
  }
  return m;
}

/**
 * An SVG document's drawing: `{ box: { x, y, w, h }, parts: [{ points, closed }], unsupported }` from
 * its viewBox (or width and height) and every path, circle, ellipse, rect, line, polyline and polygon,
 * in document order, each under its own `transform` and its groups' (outermost last). Definitions,
 * clip paths, masks and symbols are skipped. `unsupported` names what the drawing holds but this
 * reader does not draw (`<use>`, a CSS transform in a style, a nested `<svg>`), so the page can say so.
 */
export function markOf(text) {
  const src = String(text).replace(/<!--[\s\S]*?-->/g, '').replace(/<(defs|clipPath|mask|symbol|pattern)\b[\s\S]*?<\/\1>/g, '');
  const root = attrsOf(/<svg\b([^>]*)>/.exec(src)?.[1] ?? '');
  const vb = nums(root.viewBox);
  const box = vb.length === 4 ? { x: vb[0], y: vb[1], w: vb[2], h: vb[3] } : { x: 0, y: 0, w: nums(root.width)[0] || 100, h: nums(root.height)[0] || 100 };
  const parts = [], unsupported = new Set(), stack = [ID];
  let svgs = 0;
  for (const [, close, tag, rest, self] of src.matchAll(/<(\/?)([a-zA-Z][\w:-]*)\b([^>]*?)(\/?)>/g)) {
    if (close) { if (tag !== 'svg') stack.length = Math.max(1, stack.length - 1); continue; }
    if (tag === 'svg' && svgs++) unsupported.add('a nested <svg>');
    const a = attrsOf(rest), n = (k) => Number(a[k]) || 0;
    if (/(^|;)\s*transform\s*:/.test(a.style ?? '')) unsupported.add('a CSS transform');
    const m = mul(stack[stack.length - 1], matrixOf(a.transform));
    if (tag === 'use') unsupported.add('<use>');
    const own = [];
    if (tag === 'path') own.push(...parsePath(a.d));
    else if (tag === 'circle' || tag === 'ellipse') {
      const rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry'), cx = n('cx'), cy = n('cy');
      if (rx > 0 && ry > 0) own.push(...parsePath(`M${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}Z`));
    } else if (tag === 'rect') {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height');
      if (w > 0 && h > 0) {
        const rx = Math.min(w / 2, a.rx != null ? n('rx') : n('ry')), ry = Math.min(h / 2, a.ry != null ? n('ry') : n('rx'));
        own.push(...parsePath(rx > 0 && ry > 0
          ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
          : `M${x} ${y}H${x + w}V${y + h}H${x}Z`));
      }
    } else if (tag === 'line') own.push(...parsePath(`M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`));
    else if (tag === 'polyline' || tag === 'polygon') {
      const v = nums(a.points);
      if (v.length >= 4) own.push(...parsePath(`M${v.slice(0, 2).join(' ')}L${v.slice(2, v.length - (v.length % 2)).join(' ')}${tag === 'polygon' ? 'Z' : ''}`));
    }
    const plain = m.every((x, i) => x === ID[i]);
    for (const p of own) parts.push(plain ? p : { ...p, points: p.points.map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]) });
    if (!self && tag !== 'svg') stack.push(m);
  }
  return { box, parts, unsupported: [...unsupported] };
}

// ---------------------------------------------------------------------------------------------
// planning the one line

// a polyline's unit direction leaving its start (or arriving at its end), measured over `span` units
function tangent(points, atEnd, span = 3) {
  const n = points.length;
  const a = atEnd ? points[n - 1] : points[0];
  for (let k = 1; k < n; k++) {
    const b = atEnd ? points[n - 1 - k] : points[k];
    const l = dist(a, b);
    if (l >= span || k === n - 1) return l ? (atEnd ? [(a[0] - b[0]) / l, (a[1] - b[1]) / l] : [(b[0] - a[0]) / l, (b[1] - a[1]) / l]) : [1, 0];
  }
  return [1, 0];
}

// a closed part entered at its vertex i, running forward or backward, back to where it began
function loopFrom(points, i, forward) {
  const n = points.length, out = [];
  for (let k = 0; k <= n; k++) out.push(points[(forward ? i + k : i - k + n * 2) % n]);
  return out;
}

/** Evenly spaced samples along a polyline (`step` apart, both ends kept), each with the flag of its stretch. */
function resample(points, flags, step) {
  const out = [points[0]], fl = [flags[1] ?? false];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], l = dist(a, b);
    if (!l) continue;
    let t = step - carry;
    while (t <= l + 1e-9) { out.push([a[0] + ((b[0] - a[0]) * t) / l, a[1] + ((b[1] - a[1]) * t) / l]); fl.push(flags[i]); t += step; }
    carry = l - (t - step);
  }
  const last = points.at(-1);
  if (dist(out.at(-1), last) > 1e-6) { out.push([last[0], last[1]]); fl.push(flags.at(-1)); }
  return { points: out, bridge: fl };
}

// the bridge from the end of `pts` (leaving along `out`) into `next` (entered along its own start): a
// cubic whose handles run 0.42 of the gap along both directions, so it meets the line without a corner
function bridgeTo(end, out, next) {
  const s = next[0], gap = dist(end, s);
  if (gap <= 1e-6) return [];
  const into = tangent(next, false), h = HANDLE * gap;
  const b = [];
  cubic(b, end, [end[0] + out[0] * h, end[1] + out[1] * h], [s[0] - into[0] * h, s[1] - into[1] * h], s);
  return b.slice(0, -1);
}
const lengthOf = (pts, from) => pts.reduce((a, p, i) => a + dist(p, i ? pts[i - 1] : from), 0);

// the ways into a part: an open one from either end, a closed one from any of its points (every
// `every`-th), either way round, back to where it began
function entries(part, every = 1) {
  if (!part.closed) return [part.points, [...part.points].reverse()];
  const out = [];
  for (let i = 0; i < part.points.length; i += every) out.push(loopFrom(part.points, i, true), loopFrom(part.points, i, false));
  return out;
}

// the cheapest next step from a line ending at `end` (leaving along `out`): which part, entered how,
// and the length of the bridge into it (the bridge's own drawn length, so a looping bridge costs more)
function cheapest(left, end, out) {
  let best = null;
  left.forEach((p, k) => {
    for (const run of entries(p)) {
      if (best && dist(end, run[0]) >= best.cost) continue;   // a bridge is never shorter than its gap
      const cost = lengthOf(bridgeTo(end, out, run), end) + dist(end, run[0]) * 0.01;
      if (!best || cost < best.cost) best = { k, run, cost };
    }
  });
  return best;
}

// where the pen may leave a run: its end, or, after a closed loop, any later point of the loop gone
// over again (the pen retraces its own line, which adds no new ink), every `every`-th point
function exits(run, closed) {
  const out = [{ extra: [], end: run.at(-1), dir: tangent(run, true), cost: 0 }];
  if (!closed) return out;
  const loop = run.slice(1);   // the loop again, from just past where it began
  const every = Math.max(1, Math.floor(loop.length / 48));
  let len = 0;
  for (let k = 0; k < loop.length - 1; k++) {
    len += dist(loop[k], k ? loop[k - 1] : run.at(-1));
    if (k % every) continue;
    const extra = loop.slice(0, k + 1);
    out.push({ extra, end: extra.at(-1), dir: tangent([...run.slice(-3), ...extra], true), cost: len * RETRACE });
  }
  return out;
}

/**
 * One continuous line through every part: the first part in document order, from its start; then,
 * always, the part that is cheapest to reach (an open part from either end, a closed one from any of
 * its points, either way round), joined by a bridge whose handles leave and arrive along the line's
 * own direction, so nothing turns sharply. After a closed loop the pen may go on over its own line to
 * the point where the bridge onward is shortest. Returns `{ points, bridge }`, `step` apart.
 */
export function planLine(parts, { step = STEP } = {}) {
  const left = parts.filter((p) => p.points.length > 1).map((p) => ({ ...p }));
  if (!left.length) return { points: [], bridge: [] };
  const pts = [], flags = [];
  const add = (list, bridge) => { for (const p of list) { pts.push(p); flags.push(bridge); } };
  const first = left.shift();
  let run = first.closed ? loopFrom(first.points, 0, true) : first.points, closed = first.closed;
  add(run, false);
  while (left.length) {
    let best = null;
    for (const x of exits(run, closed)) {
      const c = cheapest(left, x.end, x.dir);
      if (c && (!best || c.cost + x.cost < best.cost + best.exit.cost)) best = { ...c, exit: x };
    }
    add(best.exit.extra, false);
    left.splice(best.k, 1);
    add(bridgeTo(best.exit.end, best.exit.dir, best.run), true);
    add(best.run, false);
    run = best.run; closed = best.run.length > 2 && dist(best.run[0], best.run.at(-1)) < 1e-9;
  }
  return resample(pts, flags, step);
}

// ---------------------------------------------------------------------------------------------
// timing and weight

/**
 * The time (0 to 1) the pen reaches each sample: each step weighted by how sharply the line turns
 * there (`curves` = how much a turn slows it), the weights smoothed so the pace never jumps, then
 * summed. Strictly increasing: every step takes some time.
 */
export function timeLine(points, { curves = 1.5 } = {}) {
  const n = points.length;
  if (n < 2) return n ? [0] : [];
  const turn = points.map((p, i) => {
    const a = points[Math.max(0, i - TURN_SPAN)], b = points[Math.min(n - 1, i + TURN_SPAN)];
    if (a === p || b === p) return 0;
    const t1 = Math.atan2(p[1] - a[1], p[0] - a[0]), t2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    return Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1)));
  });
  const c = Math.max(0, Number(curves) || 0);
  const w = [];
  for (let i = 1; i < n; i++) w.push(Math.max(1e-6, dist(points[i - 1], points[i])) * (1 + c * Math.min(2, 1.5 * (turn[i - 1] + turn[i]))));
  const sm = w.map((_, i) => {
    let s = 0, k = 0;
    for (let j = -SMOOTH; j <= SMOOTH; j++) { const v = w[i + j]; if (v == null) continue; const f = SMOOTH + 1 - Math.abs(j); s += v * f; k += f; }
    return s / k;
  });
  const total = sm.reduce((a, b) => a + b, 0);
  const T = [0];
  let acc = 0;
  for (let i = 0; i < sm.length; i++) { acc += sm[i]; T.push(i === sm.length - 1 ? 1 : acc / total); }
  return T;
}

/** The line's width at each sample from its pace: `base` x 0.88 where the pen is fastest to x 1.18 where it is slowest. */
export function widthsOf(T, base) {
  const n = T.length;
  if (n < 2) return T.map(() => base * THIN);
  const seg = T.slice(1).map((t, i) => t - T[i]);
  const at = T.map((_, i) => (i === 0 ? seg[0] : i === n - 1 ? seg[n - 2] : (seg[i - 1] + seg[i]) / 2));
  const lo = Math.min(...at), hi = Math.max(...at);
  return at.map((v) => base * (THIN + WIDE * (hi - lo > 1e-12 ? (v - lo) / (hi - lo) : 0.4)));
}

/** A width in the slot's px, widened so it is never under 1.5 px on screen at the slot's screen scale. */
export function screenWidth(w, scale, floor = FLOOR) {
  return Math.max(w, floor / (scale > 0 ? scale : 1));
}

/** How a mark's box fits a w x h slot at `fit`, whole, centred, at its own proportions: X = dx + k x. */
export function fitBox(box, w, h, fit) {
  const k = Math.min(w / box.w, h / box.h) * fit;
  return { k, dx: (w - box.w * k) / 2 - box.x * k, dy: (h - box.h * k) / 2 - box.y * k };
}

// the sample the pen has reached at time h, and how far along the step after it
function headAt(T, h) {
  let lo = 0, hi = T.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= h) lo = mid; else hi = mid; }
  return { i: lo, f: T[hi] > T[lo] ? clamp01((h - T[lo]) / (T[hi] - T[lo])) : 0 };
}

// ---------------------------------------------------------------------------------------------
// the page

const MARKS = new Map();   // an SVG's address -> its drawing (or the fetch on its way)
const PLANS = new Map();   // a drawing fitted to a slot -> its line, times and widths
// A note for the story author in mm.warnings, once per mark.
function warn(doc, msg) { const w = doc.defaultView?.mm?.warnings; if (Array.isArray(w) && !w.includes(msg)) w.push(msg); }
function markFor(url) {
  const c = MARKS.get(url);
  if (c) return c;
  const entry = { mark: null, wait: null };
  entry.wait = fetch(url).then((r) => (r.ok ? r.text() : '')).then((t) => { entry.mark = markOf(t); }, () => { entry.mark = { box: { x: 0, y: 0, w: 1, h: 1 }, parts: [] }; });
  MARKS.set(url, entry);
  return entry;
}
function planFor(url, mark, w, h, prm, base) {
  const key = `${url}|${w}|${h}|${prm.fit}|${prm.curves}|${base}`;
  if (PLANS.has(key)) return PLANS.get(key);
  const { k, dx, dy } = fitBox(mark.box, w, h, prm.fit);
  const parts = mark.parts.map((p) => ({ closed: p.closed, points: p.points.map(([x, y]) => [dx + k * x, dy + k * y]) }));
  const line = planLine(parts, { step: STEP });
  const T = timeLine(line.points, { curves: prm.curves });
  const plan = { ...line, T, widths: widthsOf(T, base) };
  PLANS.set(key, plan);
  return plan;
}
function read(p) {
  const n = (k, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(p[k])) ? Number(p[k]) : DEFAULTS[k]));
  return { curves: n('curves', 0, 3), weight: n('weight', 0.5, 3), fit: n('fit', 0.4, 1), follow: n('follow', 0, 1), boil: p.boil === true || p.boil === 'true', whole: p.whole === true || p.whole === 'true' };
}

// a small shiver for a boiling line: smooth noise across the line, one stream per boil frame
function shiver(points, seed, amp) {
  const next = random(seed >>> 0), cell = 24;
  const vx = Array.from({ length: Math.ceil(points.length / cell) + 2 }, () => next() * 2 - 1), vy = vx.map(() => next() * 2 - 1);
  const at = (v, i) => { const u = i / cell, k = Math.floor(u), f = u - k, e = f * f * (3 - 2 * f); return v[k] + (v[k + 1] - v[k]) * e; };
  return points.map(([x, y], i) => [x + at(vx, i) * amp, y + at(vy, i) * amp]);
}

function draw(el, q, prm, plan, { scale, frame, deck, seed }) {
  const doc = el.ownerDocument;
  const w = el.clientWidth || el.offsetWidth, h = el.clientHeight || el.offsetHeight;
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'mm-one-line');
  svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h));
  svg.setAttribute('aria-hidden', 'true');
  const g = doc.createElementNS(NS, 'g');
  svg.append(g);
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.append(svg);
  const n = plan.points.length;
  if (n < 2) return;
  const head = prm.whole || q >= 1 ? { i: n - 1, f: 0 } : headAt(plan.T, pen(q));
  let pts = plan.points;
  if (prm.boil && !deck && q >= 1) pts = shiver(pts, seed + (frame + 1) * 7919, 0.2 * plan.widths[0]);
  const drawing = !prm.whole && q < 1;
  const upto = head.i;
  const tip = drawing ? [pts[upto][0] + (pts[Math.min(n - 1, upto + 1)][0] - pts[upto][0]) * head.f, pts[upto][1] + (pts[Math.min(n - 1, upto + 1)][1] - pts[upto][1]) * head.f] : null;
  // the line as one filled shape per kind: a quad for every step between two samples, each end at its
  // sample's width across the line's direction there (the mean of the two steps that meet), so
  // neighbouring quads share their edge exactly; where the line turns sharply each quad keeps its own
  // direction and a disc fills the joint, and discs round both ends. Every piece winds the same way, so
  // the fill (nonzero) is their union, painted once: one antialiased edge round the whole line and
  // nothing across it, whatever the widths do.
  const widthAt = (i) => {
    let width = plan.widths[i];
    if (drawing) {   // the nib lands thin and the tip thins where it is still moving
      width *= 0.6 + 0.4 * clamp01(i / 6);
      width *= 0.55 + 0.45 * clamp01((upto - i) / 8);
    }
    return screenWidth(width, scale);
  };
  const kindAt = (i) => (prm.whole && plan.bridge[i] ? 'mm-one-line__ink mm-one-line__ink--bridge' : 'mm-one-line__ink');
  const P = [], Wd = [];
  for (let i = 0; i <= upto; i++) if (!P.length || dist(P[P.length - 1], pts[i]) > 1e-6) { P.push(pts[i]); Wd.push(widthAt(i)); }
  if (tip && dist(P[P.length - 1], tip) > 1e-6) { P.push(tip); Wd.push(widthAt(upto)); }
  const SHARP = 0.35;   // radians: a turn sharper than this gets a disc at its joint
  const dirOf = (i) => { const L = dist(P[i], P[i + 1]); return [(P[i + 1][0] - P[i][0]) / L, (P[i + 1][1] - P[i][1]) / L]; };
  const dirs = P.slice(0, -1).map((_, i) => dirOf(i));
  const turnAt = (i) => (i <= 0 || i >= dirs.length ? 0 : Math.abs(Math.atan2(dirs[i - 1][0] * dirs[i][1] - dirs[i - 1][1] * dirs[i][0], dirs[i - 1][0] * dirs[i][0] + dirs[i - 1][1] * dirs[i][1])));
  // the normal at sample i for the step on side `s` (0: the step before it, 1: the step after it)
  const normalAt = (i, s) => {
    let d = dirs[Math.min(dirs.length - 1, Math.max(0, i - 1 + s))];
    if (turnAt(i) <= SHARP && i > 0 && i < dirs.length) { const m = [dirs[i - 1][0] + dirs[i][0], dirs[i - 1][1] + dirs[i][1]], l = Math.hypot(m[0], m[1]); d = [m[0] / l, m[1] / l]; }
    return [-d[1], d[0]];
  };
  const shapes = new Map();   // kind -> { d, len, wsum }
  const add = (kind, d, len, wsum) => { const e = shapes.get(kind) ?? { d: [], len: 0, wsum: 0 }; e.d.push(d); e.len += len; e.wsum += wsum; shapes.set(kind, e); };
  const xy = (x, y) => `${r1(x)} ${r1(y)}`;
  const disc = (c, r) => `M${xy(c[0] + r, c[1])}A${r1(r)} ${r1(r)} 0 1 0 ${xy(c[0] - r, c[1])}A${r1(r)} ${r1(r)} 0 1 0 ${xy(c[0] + r, c[1])}Z`;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], L = dist(a, b), ha = Wd[i - 1] / 2, hb = Wd[i] / 2;
    const na = normalAt(i - 1, 1), nb = normalAt(i, 0);
    const kind = kindAt(Math.min(i, upto));
    add(kind, `M${xy(a[0] + na[0] * ha, a[1] + na[1] * ha)}L${xy(b[0] + nb[0] * hb, b[1] + nb[1] * hb)}L${xy(b[0] - nb[0] * hb, b[1] - nb[1] * hb)}L${xy(a[0] - na[0] * ha, a[1] - na[1] * ha)}Z`, L, L * (ha + hb));
    if (i === 1) add(kind, disc(a, ha), 0, 0);
    if (i === P.length - 1 || turnAt(i) > SHARP || kindAt(Math.min(i + 1, upto)) !== kind) add(kind, disc(b, hb), 0, 0);
  }
  for (const [kind, e] of shapes) {
    const p = doc.createElementNS(NS, 'path');
    p.setAttribute('class', kind);
    p.setAttribute('d', e.d.join(''));
    p.setAttribute('data-length', String(r1(e.len)));   // the centre line's length, in the slot's px
    p.setAttribute('data-width', String(Math.round((e.wsum / (e.len || 1)) * 100) / 100));   // its mean width
    g.append(p);
  }
  if (drawing && prm.follow > 0) {
    // the camera: the nib averaged over a moment just behind and a little ahead of it, eased in and out
    const s = Math.sin(Math.PI * q), z = 1 + 0.5 * prm.follow * s;
    let ax = 0, ay = 0, aw = 0;
    for (let j = 0; j < 10; j++) {
      const hh = clamp01(pen(q) - 0.08 + (0.12 * j) / 9), at = headAt(plan.T, hh), wt = 1 + (9 - j) / 9;
      ax += plan.points[at.i][0] * wt; ay += plan.points[at.i][1] * wt; aw += wt;
    }
    const cx = w / 2, cy = h / 2, m = Math.min(1, prm.follow * s * 1.2);
    const fx = cx + (ax / aw - cx) * m, fy = cy + (ay / aw - cy) * m;
    g.setAttribute('transform', `translate(${r1(cx)} ${r1(cy)}) scale(${Math.round(z * 1000) / 1000}) translate(${r1(-fx)} ${r1(-fy)})`);
  }
}

export default {
  name: 'one-line',
  group: 'entrances',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const q = ctx.d > 0 && Number.isFinite(ctx.u) ? clamp01(ctx.u / ctx.d) : 1;
    if (q <= 0 && !(ctx.params?.whole === true || ctx.params?.whole === 'true')) return;
    const slot = el.closest('[data-asset]');
    const src = slot?.getAttribute('data-asset');
    if (!src || !/\.svg$/i.test(src)) return;
    const url = new URL(src, el.ownerDocument.baseURI).href;
    const prm = read(ctx.params ?? {});
    const w = el.clientWidth || el.offsetWidth, h = el.clientHeight || el.offsetHeight;
    if (!w || !h) return;
    // the pen's weight from the stylesheet, and the slot's scale on screen (a camera move, a cut)
    const probe = el.ownerDocument.createElementNS(NS, 'svg');
    probe.setAttribute('class', 'mm-one-line');
    const pp = el.ownerDocument.createElementNS(NS, 'path');
    pp.setAttribute('class', 'mm-one-line__ink');
    probe.append(pp); el.append(probe);
    const base = (parseFloat(getComputedStyle(pp).strokeWidth) || 4) * prm.weight;
    probe.remove();
    const r = el.getBoundingClientRect();
    const opts = { scale: r.width / (el.offsetWidth || 1) || 1, frame: ctx.boil(), deck: !!ctx.deck, seed: Math.floor(ctx.random() * 4294967296) };
    const entry = markFor(url);
    const go = () => {
      if (entry.mark.unsupported?.length) warn(el.ownerDocument, `entrances/one-line: ${src} holds ${entry.mark.unsupported.join(', ')}, which the line does not draw; flatten it in the drawing tool`);
      draw(el, q, prm, planFor(url, entry.mark, w, h, prm, base), opts);
    };
    if (entry.mark) { go(); return; }
    ctx.afterSettle(() => entry.wait.then(go));
  },
};
