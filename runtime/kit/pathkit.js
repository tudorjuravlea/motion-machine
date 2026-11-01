// pathkit: SVG path data as real geometry, for the shape morph, the draw-on and the carry along a
// path. A path is { subs: [{ closed, segs }] } and every segment is one cubic as eight numbers
// [x0, y0, c1x, c1y, c2x, c2y, x1, y1]: lines, quadratics and arcs are converted when the data is
// read, so every later step handles one kind of curve. Pure: no DOM, no clock; the same data gives
// the same numbers in Node and in the page. Written for MM from the SVG path grammar; the idea of an
// arc-length table with a continuous angle beside it, and of a slice as real geometry, is the ordinary
// way to treat a path as a curve.

const TAU = Math.PI * 2;
/** The cubic handle length that makes four segments a circle: 4/3 tan(pi/8). */
const K = 0.5522847498307936;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const line = (x0, y0, x1, y1) => [x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x1, y1];

// ---------------------------------------------------------------------------------------------
// reading path data

const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/y;

/** One elliptical arc as cubics (the SVG endpoint-to-centre conversion, a quarter turn at most per cubic). */
function arcToCubics(x1, y1, rx, ry, deg, large, sweep, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) return [line(x1, y1, x2, y2)];
  const phi = (deg * Math.PI) / 180, c = Math.cos(phi), s = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = c * dx + s * dy, yp = -s * dx + c * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { const k = Math.sqrt(lam); rx *= k; ry *= k; }
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  let co = den ? Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp) / den)) : 0;
  if (!!large === !!sweep) co = -co;
  const cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const th1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dth = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dth > 0) dth -= TAU; else if (sweep && dth < 0) dth += TAU;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9));
  const step = dth / n, h = (4 / 3) * Math.tan(step / 4);
  const P = (t) => [cx + c * rx * Math.cos(t) - s * ry * Math.sin(t), cy + s * rx * Math.cos(t) + c * ry * Math.sin(t)];
  const D = (t) => [-c * rx * Math.sin(t) - s * ry * Math.cos(t), -s * rx * Math.sin(t) + c * ry * Math.cos(t)];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = th1 + i * step, b = a + step;
    const p0 = i ? P(a) : [x1, y1], p1 = i === n - 1 ? [x2, y2] : P(b), da = D(a), db = D(b);
    out.push([p0[0], p0[1], p0[0] + h * da[0], p0[1] + h * da[1], p1[0] - h * db[0], p1[1] - h * db[1], p1[0], p1[1]]);
  }
  return out;
}

/**
 * Path data as geometry. Every command is read, absolute or relative, with implicit repeats and no
 * separators where none are needed; an arc's two flags may be glued to the next number (`a8 8 0 018 8`).
 * A bad number ends the path where it is, as the specification says. A subpath that is only a move is
 * dropped. `closed` is set by `z`.
 * @returns {{ subs: { closed: boolean, segs: number[][] }[] }}
 */
export function parse(d) {
  const s = String(d ?? '');
  const subs = [];
  let i = 0, cur = null, cx = 0, cy = 0, sx = 0, sy = 0, cmd = '', rc = null, fresh = true;
  const skip = () => { while (i < s.length && /[\s,]/.test(s[i])) i++; };
  const num = () => { skip(); NUMBER.lastIndex = i; const m = NUMBER.exec(s); if (!m) return NaN; i = NUMBER.lastIndex; return parseFloat(m[0]); };
  const flag = () => { skip(); const ch = s[i]; if (ch === '0' || ch === '1') { i++; return +ch; } return NaN; };
  const begin = (x, y) => { cur = { closed: false, segs: [] }; subs.push(cur); cx = sx = x; cy = sy = y; fresh = false; };
  const add = (seg) => { if (fresh) begin(cx, cy); cur.segs.push(seg); cx = seg[6]; cy = seg[7]; };
  for (;;) {
    skip();
    if (i >= s.length) break;
    const ch = s[i];
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) { cmd = ch; i++; if (/[Zz]/.test(ch)) {
      if (cur && !fresh) { if (Math.hypot(cx - sx, cy - sy) > 1e-9) cur.segs.push(line(cx, cy, sx, sy)); cur.closed = true; cx = sx; cy = sy; }
      fresh = true; rc = null; cmd = ''; continue;
    } } else if (!cmd || !/[-+.\d]/.test(ch)) break;
    const up = cmd.toUpperCase(), rel = cmd !== up, n = ARITY[up], a = [];
    let bad = false;
    for (let k = 0; k < n; k++) { const v = up === 'A' && (k === 3 || k === 4) ? flag() : num(); if (Number.isNaN(v)) { bad = true; break; } a.push(v); }
    if (bad) break;
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (up === 'M') { begin(a[0] + ox, a[1] + oy); rc = null; cmd = rel ? 'l' : 'L'; continue; }
    if (up === 'L') { add(line(cx, cy, a[0] + ox, a[1] + oy)); rc = null; }
    else if (up === 'H') { add(line(cx, cy, a[0] + ox, cy)); rc = null; }
    else if (up === 'V') { add(line(cx, cy, cx, a[0] + (rel ? cy : 0))); rc = null; }
    else if (up === 'C') { add([cx, cy, a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy, a[4] + ox, a[5] + oy]); rc = { k: 'C', x: a[2] + ox, y: a[3] + oy }; }
    else if (up === 'S') {
      const px = rc?.k === 'C' ? 2 * cx - rc.x : cx, py = rc?.k === 'C' ? 2 * cy - rc.y : cy;
      add([cx, cy, px, py, a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy]); rc = { k: 'C', x: a[0] + ox, y: a[1] + oy };
    } else if (up === 'Q' || up === 'T') {
      const qx = up === 'Q' ? a[0] + ox : rc?.k === 'Q' ? 2 * cx - rc.x : cx, qy = up === 'Q' ? a[1] + oy : rc?.k === 'Q' ? 2 * cy - rc.y : cy;
      const ex = a[up === 'Q' ? 2 : 0] + ox, ey = a[up === 'Q' ? 3 : 1] + oy;
      add([cx, cy, cx + ((qx - cx) * 2) / 3, cy + ((qy - cy) * 2) / 3, ex + ((qx - ex) * 2) / 3, ey + ((qy - ey) * 2) / 3, ex, ey]); rc = { k: 'Q', x: qx, y: qy };
    } else if (up === 'A') {
      const ex = a[5] + ox, ey = a[6] + oy;
      if (fresh) begin(cx, cy);
      for (const seg of arcToCubics(cx, cy, a[0], a[1], a[2], a[3], a[4], ex, ey)) { cur.segs.push(seg); }
      cx = ex; cy = ey; rc = null;
    }
  }
  return { subs: subs.filter((u) => u.segs.length > 0) };
}

/** Path data again: `M`, then `L` for a straight segment and `C` for a curve, `Z` for a closed subpath. */
export function stringify(path, digits = 3) {
  const k = 10 ** digits;
  const f = (v) => { const r = Math.round(v * k) / k; return String(Object.is(r, -0) ? 0 : r); };
  const out = [];
  for (const sub of path.subs) {
    if (!sub.segs.length) continue;
    out.push(`M${f(sub.segs[0][0])} ${f(sub.segs[0][1])}`);
    for (const g of sub.segs) {
      const straight = Math.abs(g[2] - (g[0] * 2 + g[6]) / 3) + Math.abs(g[3] - (g[1] * 2 + g[7]) / 3) + Math.abs(g[4] - (g[0] + g[6] * 2) / 3) + Math.abs(g[5] - (g[1] + g[7] * 2) / 3) < 1e-9;
      out.push(straight ? `L${f(g[6])} ${f(g[7])}` : `C${f(g[2])} ${f(g[3])} ${f(g[4])} ${f(g[5])} ${f(g[6])} ${f(g[7])}`);
    }
    if (sub.closed) out.push('Z');
  }
  return out.join('');
}

const num2 = (v, d = 0) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
function ellipse(cx, cy, rx, ry) {
  const kx = K * rx, ky = K * ry;
  return [
    [cx + rx, cy, cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
    [cx, cy + ry, cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
    [cx - rx, cy, cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
    [cx, cy - ry, cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
  ];
}

/**
 * A basic shape as a path: `circle`, `ellipse`, `rect` (with rx and ry), `line`, `polyline`, `polygon`.
 * A circle starts at its right-hand point and runs clockwise on the screen. Attributes may be numbers or strings.
 */
export function shape(tag, a = {}) {
  const one = (segs, closed) => ({ subs: segs.length ? [{ closed, segs }] : [] });
  if (tag === 'circle') { const r = num2(a.r); return r > 0 ? one(ellipse(num2(a.cx), num2(a.cy), r, r), true) : { subs: [] }; }
  if (tag === 'ellipse') { const rx = num2(a.rx), ry = num2(a.ry); return rx > 0 && ry > 0 ? one(ellipse(num2(a.cx), num2(a.cy), rx, ry), true) : { subs: [] }; }
  if (tag === 'line') return one([line(num2(a.x1), num2(a.y1), num2(a.x2), num2(a.y2))], false);
  if (tag === 'polyline' || tag === 'polygon') {
    const v = String(a.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
    const pts = []; for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
    if (pts.length < 2) return { subs: [] };
    const segs = []; for (let i = 1; i < pts.length; i++) segs.push(line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
    if (tag === 'polygon') segs.push(line(pts.at(-1)[0], pts.at(-1)[1], pts[0][0], pts[0][1]));
    return one(segs, tag === 'polygon');
  }
  if (tag === 'rect') {
    const x = num2(a.x), y = num2(a.y), w = num2(a.width), h = num2(a.height);
    if (!(w > 0 && h > 0)) return { subs: [] };
    let rx = a.rx != null && a.rx !== '' ? num2(a.rx) : a.ry != null && a.ry !== '' ? num2(a.ry) : 0;
    let ry = a.ry != null && a.ry !== '' ? num2(a.ry) : rx;
    rx = Math.min(Math.max(rx, 0), w / 2); ry = Math.min(Math.max(ry, 0), h / 2);
    if (!rx || !ry) {
      return one([line(x, y, x + w, y), line(x + w, y, x + w, y + h), line(x + w, y + h, x, y + h), line(x, y + h, x, y)], true);
    }
    return one([
      line(x + rx, y, x + w - rx, y), quarter(x + w - rx, y + ry, rx, ry, 3),
      line(x + w, y + ry, x + w, y + h - ry), quarter(x + w - rx, y + h - ry, rx, ry, 0),
      line(x + w - rx, y + h, x + rx, y + h), quarter(x + rx, y + h - ry, rx, ry, 1),
      line(x, y + h - ry, x, y + ry), quarter(x + rx, y + ry, rx, ry, 2),
    ], true);
  }
  return { subs: [] };
}
/** A quarter of an ellipse about (cx, cy), quarter q = 0 (right to bottom), 1 (bottom to left), 2 (left to top), 3 (top to right). */
function quarter(cx, cy, rx, ry, q) { return ellipse(cx, cy, rx, ry)[q]; }

// ---------------------------------------------------------------------------------------------
// one cubic

/** The point of a cubic at t. */
export function cubicAt(g, t) {
  const s = 1 - t, a = s * s * s, b = 3 * s * s * t, c = 3 * s * t * t, d = t * t * t;
  return [a * g[0] + b * g[2] + c * g[4] + d * g[6], a * g[1] + b * g[3] + c * g[5] + d * g[7]];
}

/** The derivative of a cubic at t; where it vanishes (a handle on its anchor) the direction of the chord or of the next control. */
export function cubicTan(g, t) {
  const s = 1 - t;
  let dx = 3 * (s * s * (g[2] - g[0]) + 2 * s * t * (g[4] - g[2]) + t * t * (g[6] - g[4]));
  let dy = 3 * (s * s * (g[3] - g[1]) + 2 * s * t * (g[5] - g[3]) + t * t * (g[7] - g[5]));
  if (Math.hypot(dx, dy) < 1e-12) {
    const pairs = t < 0.5 ? [[g[0], g[1], g[4], g[5]], [g[0], g[1], g[6], g[7]]] : [[g[2], g[3], g[6], g[7]], [g[0], g[1], g[6], g[7]]];
    for (const [x0, y0, x1, y1] of pairs) if (Math.hypot(x1 - x0, y1 - y0) > 1e-12) { dx = x1 - x0; dy = y1 - y0; break; }
  }
  return [dx, dy];
}

/** A cubic split at t into two (de Casteljau): the first runs 0..t, the second t..1. */
export function splitCubic(g, t) {
  const l = (a, b) => a + (b - a) * t;
  const ab = [l(g[0], g[2]), l(g[1], g[3])], bc = [l(g[2], g[4]), l(g[3], g[5])], cd = [l(g[4], g[6]), l(g[5], g[7])];
  const abc = [l(ab[0], bc[0]), l(ab[1], bc[1])], bcd = [l(bc[0], cd[0]), l(bc[1], cd[1])];
  const m = [l(abc[0], bcd[0]), l(abc[1], bcd[1])];
  return [[g[0], g[1], ab[0], ab[1], abc[0], abc[1], m[0], m[1]], [m[0], m[1], bcd[0], bcd[1], cd[0], cd[1], g[6], g[7]]];
}

/** The part of a cubic between t0 and t1 as one cubic. */
export function subCubic(g, t0, t1) {
  if (t0 <= 0 && t1 >= 1) return g.slice();
  const right = t0 > 0 ? splitCubic(g, t0)[1] : g;
  if (t1 >= 1) return right.slice();
  return splitCubic(right, (t1 - t0) / (1 - t0))[0];
}

/** The length of one cubic by n chords. */
export function cubicLength(g, n = 32) {
  let s = 0, p = [g[0], g[1]];
  for (let i = 1; i <= n; i++) { const q = cubicAt(g, i / n); s += Math.hypot(q[0] - p[0], q[1] - p[1]); p = q; }
  return s;
}

// ---------------------------------------------------------------------------------------------
// whole paths

/** A path with every point through m = [a, b, c, d, e, f] (the SVG matrix). */
export function transform(path, m) {
  const [a, b, c, d, e, f] = m;
  return { subs: path.subs.map((u) => ({ closed: u.closed, segs: u.segs.map((g) => {
    const o = new Array(8);
    for (let i = 0; i < 8; i += 2) { o[i] = a * g[i] + c * g[i + 1] + e; o[i + 1] = b * g[i] + d * g[i + 1] + f; }
    return o;
  }) })) };
}

/** The path run backwards: subpaths, segments and each segment's points in reverse. */
export function reverse(path) {
  return { subs: path.subs.slice().reverse().map((u) => ({ closed: u.closed, segs: u.segs.slice().reverse().map((g) => [g[6], g[7], g[4], g[5], g[2], g[3], g[0], g[1]]) })) };
}

/** The path's total length by `resolution` chords a segment. */
export function lengthOf(path, resolution = 32) {
  let s = 0;
  for (const u of path.subs) for (const g of u.segs) s += cubicLength(g, resolution);
  return s;
}

/** The tight bounding box { x, y, w, h } (curve extrema, not control points); null for an empty path. */
export function bbox(path) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const u of path.subs) for (const g of u.segs) {
    take(g[0], g[1]); take(g[6], g[7]);
    for (const o of [0, 1]) {
      const p0 = g[o], p1 = g[2 + o], p2 = g[4 + o], p3 = g[6 + o];
      const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;   // the derivative / 3 as a t^2 + b t + c
      const roots = [];
      if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) roots.push(-c / b); }
      else { const disc = b * b - 4 * a * c; if (disc >= 0) { const r = Math.sqrt(disc); roots.push((-b + r) / (2 * a), (-b - r) / (2 * a)); } }
      for (const t of roots) if (t > 0 && t < 1) { const q = cubicAt(g, t); take(q[0], q[1]); }
    }
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The signed area of a subpath taken as closed: positive when it runs clockwise on the screen. */
export function subArea(sub) {
  let a = 0;
  for (const g of sub.segs) {
    let p = [g[0], g[1]];
    for (let i = 1; i <= 8; i++) { const q = cubicAt(g, i / 8); a += p[0] * q[1] - q[0] * p[1]; p = q; }
  }
  return a / 2;
}

/**
 * The path as a curve to walk: an arc-length table (`resolution` chords a segment; the chord error is
 * about the square of the turn per chord over 24, so raise it for pixel work), and from it:
 *   length    total length
 *   turn      the signed turning from start to end, radians (a clockwise circle on the screen is +2pi)
 *   at(f, { wrap, window })   { x, y, angle, tx, ty } at the fraction f of the length; angle is continuous
 *             (never wrapped back into -pi..pi); wrap goes on past 1 for a loop, the angle keeping its turns;
 *             window (a share of the length) averages the angle over that span so a corner turns gradually
 *   slice(a, b)   the part between the fractions a and b as a path of real cubics (b < a runs backwards)
 */
export function measure(path, { resolution = 32 } = {}) {
  const N = Math.max(2, Math.round(resolution));
  const ents = [];
  let total = 0, prevA = 0, first = null;
  path.subs.forEach((sub, si) => sub.segs.forEach((seg) => {
    const cum = new Float64Array(N + 1), ang = new Float64Array(N + 1);
    let p = [seg[0], seg[1]];
    for (let i = 0; i <= N; i++) {
      const t = i / N, q = i ? cubicAt(seg, t) : p;
      if (i) cum[i] = cum[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1]);
      p = q;
      const d = cubicTan(seg, t);
      let a = Math.hypot(d[0], d[1]) > 1e-12 ? Math.atan2(d[1], d[0]) : prevA;
      if (first !== null || i) a += TAU * Math.round((prevA - a) / TAU);
      if (first === null) first = a;
      ang[i] = a; prevA = a;
    }
    ents.push({ si, seg, len: cum[N], start: total, cum, ang });
    total += cum[N];
  }));
  const last = ents.length ? ents.at(-1).ang[N] : 0;
  const turn = ents.length ? last - first : 0;

  // the entry and the position inside it for a distance s along the path
  function locate(s) {
    s = Math.min(Math.max(s, 0), total);
    let lo = 0, hi = ents.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ents[mid].start <= s) lo = mid; else hi = mid - 1; }
    let k = lo;
    while (k < ents.length - 1 && ents[k].len <= 1e-12) k++;      // a zero-length segment cannot be stood on
    const e = ents[k], local = Math.min(Math.max(s - e.start, 0), e.len);
    let a = 0, b = N;
    while (a < b - 1) { const mid = (a + b) >> 1; if (e.cum[mid] <= local) a = mid; else b = mid; }
    const span = e.cum[a + 1] - e.cum[a], f = span > 1e-15 ? (local - e.cum[a]) / span : 0;
    return { k, t: (a + f) / N, a, f };
  }
  const angleOf = (fr) => { const w = locate(clamp01(fr) * total), e = ents[w.k]; return e.ang[w.a] + (e.ang[w.a + 1] - e.ang[w.a]) * w.f; };

  function at(fr, { wrap = false, window = 0 } = {}) {
    if (!ents.length) return { x: 0, y: 0, angle: 0, tx: 1, ty: 0 };
    let laps = 0;
    if (wrap) { laps = Math.floor(fr); fr -= laps; if (fr === 0 && laps > 0) { fr = 1; laps -= 1; } }
    fr = clamp01(fr);
    const w = locate(fr * total), e = ents[w.k];
    const p = cubicAt(e.seg, w.t), d = cubicTan(e.seg, w.t), dl = Math.hypot(d[0], d[1]) || 1;
    let angle = e.ang[w.a] + (e.ang[w.a + 1] - e.ang[w.a]) * w.f;
    if (window > 0) {
      let sum = 0, n = 0;
      for (let i = 0; i <= 8; i++) { sum += angleOf(fr + (i / 8 - 0.5) * window); n++; }
      angle = sum / n;
    }
    return { x: p[0], y: p[1], angle: angle + laps * turn, tx: d[0] / dl, ty: d[1] / dl };
  }

  function slice(a, b) {
    a = clamp01(a); b = clamp01(b);
    if (!ents.length || Math.abs(a - b) < 1e-12) return { subs: [] };
    if (a > b) return reverse(slice(b, a));
    if (a <= 0 && b >= 1) return { subs: path.subs.map((u) => ({ closed: u.closed, segs: u.segs.map((g) => g.slice()) })) };
    const A = locate(a * total), B = locate(b * total);
    const subs = [];
    let cur = null, curSi = -1;
    for (let k = A.k; k <= B.k; k++) {
      const g = subCubic(ents[k].seg, k === A.k ? A.t : 0, k === B.k ? B.t : 1);
      if (Math.hypot(g[6] - g[0], g[7] - g[1]) + Math.hypot(g[2] - g[0], g[3] - g[1]) < 1e-9) continue;
      if (ents[k].si !== curSi) { cur = { closed: false, segs: [] }; subs.push(cur); curSi = ents[k].si; }
      cur.segs.push(g);
    }
    return { subs };
  }

  return { length: total, turn, at, slice };
}

/**
 * The path laid into a box the way `preserveAspectRatio="xMidYMid meet"` lays a drawing in its frame: `src`
 * is the box it is drawn in ({ x, y, w, h }, a viewBox or its own bounds), `dst` the box it is to fill. The scale
 * is even, the drawing is centred, and nothing leaves `dst`.
 */
export function fit(path, src, dst) {
  const k = Math.min(dst.w / src.w, dst.h / src.h);
  if (!(k > 0) || !Number.isFinite(k)) return { subs: [] };
  const ex = dst.x + (dst.w - src.w * k) / 2 - src.x * k, ey = dst.y + (dst.h - src.h * k) / 2 - src.y * k;
  return transform(path, [k, 0, 0, k, ex, ey]);
}
