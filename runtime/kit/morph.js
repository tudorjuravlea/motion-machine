// morph: one shape becoming another (a logo into a logo, an icon into an icon). The correspondence is
// worked out once, when the story is built, as a plan of paired cubic segments with the same count on
// both sides; a frame is then a blend of the plan at q, so it is a pure function of q.
//
//   1. subpaths are paired by the size of their anchor box and the nearness of their centres, biggest
//      first, so a ring's outline goes with an outline and its counter with a counter; a piece with
//      no partner is grown from (or shrunk to) a point on the other shape
//   2. winding is made to agree (a closed pair runs the same way round; an open pair is turned so its
//      nearer ends meet)
//   3. optionally the anchors are redistributed at equal arc length between corners (a corner is a
//      joint that turns by more than 0.2 rad), which keeps the corners and evens out the rest
//   4. the counts are equalised by splitting the longest segments, which never moves the outline
//   5. a closed pair begins at the cyclic offset whose squared distance between matching anchors is
//      least, once the shapes' centroids are laid over each other
//   6. optionally the blend is rotational: anchors turn about an origin (their radius and angle are
//      blended, not their x and y) and a handle turns with its anchor; an anti-tear rule keeps
//      neighbouring anchors from turning opposite ways round
//
// Written for MM from the way shape morphs are described in general: point pairing by size and place,
// the least-squared-distance start point, splitting the longest segments to equalise counts, and
// polar blending with a rule against folds. Pure: no DOM, no clock.
import { parse, bbox, measure, splitCubic, cubicLength, cubicTan, subArea, stringify } from './pathkit.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (x) => { const r = x - TAU * Math.floor((x + Math.PI) / TAU); return r; };   // into [-pi, pi)
/** A joint that turns by more than this many radians is a corner. */
export const CORNER = 0.2;
/** Neighbouring anchors that turn opposite ways by more than this (126 degrees) go the long way round together. */
const FAR = 0.7 * Math.PI;
/** Opposite neighbours whose turns cancel to within this (54 degrees) are linked. */
const CANCEL = 0.3 * Math.PI;

const pathOf = (x) => (typeof x === 'string' ? parse(x) : x && x.subs ? x : { subs: [] });
const anchorBox = (sub) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of sub.segs) for (const [x, y] of [[g[0], g[1]], [g[6], g[7]]]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, area: (x1 - x0) * (y1 - y0) };
};

/** A subpath as the plan wants it: no zero-length segment, `closed` also when it ends where it began. */
function clean(sub) {
  const segs = sub.segs.filter((g) => Math.hypot(g[6] - g[0], g[7] - g[1]) + Math.hypot(g[2] - g[0], g[3] - g[1]) + Math.hypot(g[4] - g[6], g[5] - g[7]) > 1e-9);
  if (!segs.length) return null;
  const b = anchorBox({ segs }), tol = 1e-4 * Math.max(1e-3, Math.hypot(b.w, b.h));
  const first = segs[0], last = segs.at(-1);
  const closed = sub.closed || (segs.length > 1 && Math.hypot(last[6] - first[0], last[7] - first[1]) < tol);
  return { closed, segs: segs.map((g) => g.slice()) };
}

/**
 * How the pieces of one path go with the pieces of another: [{ a, b }] with indices into each path's
 * `subs`, and null where a piece has no partner. Biggest first; a piece takes the unused partner whose
 * centre is nearest and whose size is nearest. Deterministic: ties go to the lower index.
 */
export function pairSubs(A, B) {
  const sa = pathOf(A).subs.map(clean), sb = pathOf(B).subs.map(clean);
  const ia = sa.map((s, i) => (s ? i : -1)).filter((i) => i >= 0), ib = sb.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const boxes = (subs, idx) => idx.map((i) => ({ i, ...anchorBox(subs[i]) }));
  const ba = boxes(sa, ia), bb = boxes(sb, ib);
  const bySize = (u, v) => v.area - u.area || u.cx - v.cx || u.cy - v.cy || u.i - v.i;
  ba.sort(bySize); bb.sort(bySize);
  const swap = ba.length > bb.length;
  const short = swap ? bb : ba, long = swap ? ba : bb;
  const all = [...ba, ...bb];
  const x0 = Math.min(...all.map((m) => m.x)), y0 = Math.min(...all.map((m) => m.y));
  const x1 = Math.max(...all.map((m) => m.x + m.w)), y1 = Math.max(...all.map((m) => m.y + m.h));
  const diag = Math.hypot(x1 - x0, y1 - y0) || 1;
  const e = diag * diag * 1e-6;
  const used = new Set(), out = [];
  for (const s of short) {
    let best = null, bestScore = Infinity;
    for (const l of long) {
      if (used.has(l.i)) continue;
      const score = Math.hypot(s.cx - l.cx, s.cy - l.cy) / diag + 0.5 * Math.abs(Math.log((s.area + e) / (l.area + e)));
      if (score < bestScore - 1e-12) { best = l; bestScore = score; }
    }
    used.add(best.i);
    out.push(swap ? { a: best.i, b: s.i } : { a: s.i, b: best.i });
  }
  for (const l of long) if (!used.has(l.i)) out.push(swap ? { a: l.i, b: null } : { a: null, b: l.i });
  return out;
}

const reverseSegs = (segs) => segs.slice().reverse().map((g) => [g[6], g[7], g[4], g[5], g[2], g[3], g[0], g[1]]);
const point = (x, y, closed) => ({ closed, segs: [[x, y, x, y, x, y, x, y]] });

/** The anchor of the other shape that a piece with no partner collapses into: nearest to the piece's centre, or the centre. */
function nearestAnchor(sub, others) {
  const c = anchorBox(sub);
  let best = [c.cx, c.cy], d = Infinity;
  for (const o of others) for (const g of o.segs) for (const [x, y] of [[g[0], g[1]], [g[6], g[7]]]) {
    const dd = (x - c.cx) ** 2 + (y - c.cy) ** 2;
    if (dd < d) { d = dd; best = [x, y]; }
  }
  return best;
}

/** Anchors at equal arc length between corners; the corners stay exactly where they are. */
function redistribute(sub, step) {
  const segs = sub.segs, n = segs.length;
  const turn = (i, j) => { const u = cubicTan(segs[i], 1), v = cubicTan(segs[j], 0); return Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])); };
  const corners = [];   // corner[i]: the joint after segment i
  for (let i = 0; i < n; i++) corners.push(i < n - 1 ? turn(i, i + 1) > CORNER : sub.closed ? turn(i, 0) > CORNER : true);
  let order = segs.map((_, i) => i), runs = [], start = 0;
  if (sub.closed) { const c = corners.indexOf(true); if (c >= 0) { start = (c + 1) % n; order = order.slice(start).concat(order.slice(0, start)); } }
  let run = [];
  for (const i of order) { run.push(segs[i]); if (corners[i]) { runs.push(run); run = []; } }
  if (run.length) runs.push(run);
  const out = [];
  for (const r of runs) {
    const m = measure({ subs: [{ closed: false, segs: r }] }, { resolution: 32 });
    const k = Math.max(1, Math.round(m.length / step));
    if (r.length === 1 && k === 1) { out.push(r[0]); continue; }
    if (!(m.length > 1e-9)) { out.push(...r); continue; }
    const h = m.length / k / 3;
    const first = r[0], last = r.at(-1);
    const unit = (v) => { const l = Math.hypot(v.tx, v.ty) || 1; return { ...v, tx: v.tx / l, ty: v.ty / l }; };
    let prev = unit({ x: first[0], y: first[1], tx: cubicTan(first, 0)[0], ty: cubicTan(first, 0)[1] });
    for (let j = 1; j <= k; j++) {
      let cur;
      if (j === k) { const t = cubicTan(last, 1); cur = unit({ x: last[6], y: last[7], tx: t[0], ty: t[1] }); }
      else cur = m.at(j / k);
      out.push([prev.x, prev.y, prev.x + prev.tx * h, prev.y + prev.ty * h, cur.x - cur.tx * h, cur.y - cur.ty * h, cur.x, cur.y]);
      prev = cur;
    }
  }
  return { closed: sub.closed, segs: out };
}

/** Segments split at their middle, longest first, until there are n. */
function grow(segs, n) {
  const out = segs.map((g) => g.slice());
  const len = out.map((g) => cubicLength(g, 8));
  while (out.length < n) {
    let k = 0;
    for (let i = 1; i < out.length; i++) if (len[i] > len[k] + 1e-12) k = i;
    const [l, r] = splitCubic(out[k], 0.5);
    out.splice(k, 1, l, r);
    len.splice(k, 1, len[k] / 2, len[k] / 2);
  }
  return out;
}

const centroid = (segs) => {
  let x = 0, y = 0, c = 0;
  for (const g of segs) for (let i = 0; i < 8; i += 2) { x += g[i]; y += g[i + 1]; c++; }
  return [x / c, y / c];
};

/**
 * The cyclic offset k of b's segments whose anchors lie nearest to a's, once the centroids coincide. For a
 * rotational blend (`rot`: the two origins) the offset is the one whose anchors lie nearest once b is also
 * turned by the best single angle about its origin, so a shape that is a turned copy of the other pairs as one.
 */
function bestShift(a, b, rot) {
  const n = a.length, ca = centroid(a), cb = centroid(b), dx = cb[0] - ca[0], dy = cb[1] - ca[1];
  let best = 0, cost = Infinity;
  for (let k = 0; k < n; k++) {
    let s = 0;
    if (rot) {
      let sc = 0, ss = 0, sq = 0;
      for (let j = 0; j < n; j++) {
        const p = a[j], q = b[(j + k) % n];
        const ax = p[0] - rot.oa[0], ay = p[1] - rot.oa[1], bx = q[0] - rot.ob[0], by = q[1] - rot.ob[1];
        sc += ax * bx + ay * by; ss += ax * by - ay * bx; sq += ax * ax + ay * ay + bx * bx + by * by;
      }
      s = sq - 2 * Math.hypot(sc, ss);      // sum |A - Rot(B)|^2 at the best turn
    } else {
      for (let j = 0; j < n && s < cost; j++) { const p = a[j], q = b[(j + k) % n]; s += (p[0] - (q[0] - dx)) ** 2 + (p[1] - (q[1] - dy)) ** 2; }
    }
    if (s < cost - 1e-12) { cost = s; best = k; }
  }
  return best;
}

/**
 * The anchors' turns (radians, each the shortest turn from one shape to the other, or null where an
 * anchor sits on the origin and has no angle) made consistent along the chain, so that neighbours
 * never turn opposite ways round and tear. Two rules, after the way a rotational blend is kept
 * from folding: neighbours that turn opposite ways by more than 126 degrees go the long way round,
 * the way the one before went; and neighbours that turn opposite ways and nearly cancel (under 54
 * degrees) are linked the same way. Small opposite turns are an ordinary deformation and are left.
 * A null comes back as 0 and does not break the chain.
 */
export function antiTear(turns) {
  const out = [];
  let prev = null;
  for (const t of turns) {
    if (t == null) { out.push(0); continue; }
    let d = t;
    if (prev != null && Math.sign(d) !== Math.sign(prev) && (Math.abs(d) > FAR || (Math.abs(d + prev) < CANCEL && Math.abs(d) > CANCEL))) d += TAU * Math.sign(prev);
    out.push(d);
    prev = d;
  }
  return out;
}

const NAMED = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };
/** "50% 50%", "left top", "0.5 0.5" or "25%": a point as shares of a box ([x, y]); `fallback` when it cannot be read. */
export function shares(text, fallback = [0.5, 0.5]) {
  const t = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (!t.length) return fallback;
  const one = (w) => (w in NAMED ? NAMED[w] : w.endsWith('%') ? parseFloat(w) / 100 : parseFloat(w));
  const x = one(t[0]), y = t.length > 1 ? one(t[1]) : x;
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : fallback;
}

/** An origin given as shares of a box. */
const originOf = (box, o) => [box.x + box.w * o[0], box.y + box.h * o[1]];

function polar(pairs, oa, ob) {
  return pairs.map((p) => {
    const n = p.a.length, m = p.closed ? n : n + 1;
    const anchorA = (j) => (j < n ? [p.a[j][0], p.a[j][1]] : [p.a[n - 1][6], p.a[n - 1][7]]);
    const anchorB = (j) => (j < n ? [p.b[j][0], p.b[j][1]] : [p.b[n - 1][6], p.b[n - 1][7]]);
    const rA = [], rB = [], tA = [], shortest = [];
    for (let j = 0; j < m; j++) {
      const A = anchorA(j), B = anchorB(j);
      const ra = Math.hypot(A[0] - oa[0], A[1] - oa[1]), rb = Math.hypot(B[0] - ob[0], B[1] - ob[1]);
      const ta = Math.atan2(A[1] - oa[1], A[0] - oa[0]), tb = Math.atan2(B[1] - ob[1], B[0] - ob[0]);
      rA.push(ra); rB.push(rb); tA.push(ta);
      shortest.push(ra < 1e-9 || rb < 1e-9 ? null : wrap(tb - ta));
    }
    const turn = antiTear(shortest);
    const plain = shortest.map((s) => s == null);
    // a handle turns with its anchor, plus whatever is left of its own turn
    const hs = [];
    for (let i = 0; i < n; i++) {
      const a = p.a[i], b = p.b[i];
      const mk = (va, vb, anchorTurn) => {
        const la = Math.hypot(va[0], va[1]), lb = Math.hypot(vb[0], vb[1]);
        if (la < 1e-9 || lb < 1e-9) return { plain: true, va, vb };
        const ta = Math.atan2(va[1], va[0]), tb = Math.atan2(vb[1], vb[0]);
        return { plain: false, la, lb, ta, dt: anchorTurn + wrap(tb - ta - anchorTurn) };
      };
      hs.push([
        mk([a[2] - a[0], a[3] - a[1]], [b[2] - b[0], b[3] - b[1]], turn[i]),
        mk([a[4] - a[6], a[5] - a[7]], [b[4] - b[6], b[5] - b[7]], turn[(i + 1) % m]),
      ]);
    }
    return { rA, rB, tA, turn, plain, hs, oa, ob, anchorsA: Array.from({ length: m }, (_, j) => anchorA(j)), anchorsB: Array.from({ length: m }, (_, j) => anchorB(j)) };
  });
}

/**
 * The plan for morphing `from` into `to` (path data or parsed paths).
 *   smoothing  redistribute anchors at equal arc length between corners, one anchor per this share of the
 *              shape's diagonal (0 keeps each shape's own anchors); 0.05 is about twenty a ring
 *   rotate     blend about an origin by radius and angle instead of by x and y
 *   origin     [x, y] shares of the first shape's box the rotation is about (default the centre)
 *   originTo   the same for the second shape's box (default as `origin`); the origin moves from one to the other
 * @returns {{ pairs: { closed: boolean, a: number[][], b: number[][] }[], info: { pieces, grown, shifts, rotate }, rot: object[]|null }}
 */
export function plan(from, to, { smoothing = 0, rotate = false, origin = [0.5, 0.5], originTo = null } = {}) {
  const A = pathOf(from), B = pathOf(to);
  const sa = A.subs.map(clean), sb = B.subs.map(clean);
  const matches = pairSubs(A, B);
  const kept = (subs) => subs.filter(Boolean);
  const pairs = [], shifts = [];
  let grown = 0;
  const boxA = bbox(A), boxB = bbox(B);
  const rotOrigins = rotate && boxA && boxB ? { oa: originOf(boxA, origin), ob: originOf(boxB, originTo ?? origin) } : null;
  for (const m of matches) {
    let a = m.a != null ? sa[m.a] : null, b = m.b != null ? sb[m.b] : null;
    if (!a) { const p = nearestAnchor(b, kept(sa)); a = point(p[0], p[1], b.closed); grown++; }
    if (!b) { const p = nearestAnchor(a, kept(sb)); b = point(p[0], p[1], a.closed); grown++; }
    const closed = a.closed && b.closed;
    let as = a.segs, bs = b.segs;
    const degA = as.length === 1 && cubicLength(as[0], 2) === 0, degB = bs.length === 1 && cubicLength(bs[0], 2) === 0;
    if (!degA && !degB) {
      if (a.closed && b.closed) { if (subArea({ segs: as }) * subArea({ segs: bs }) < 0) bs = reverseSegs(bs); }
      else {
        const d = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
        const as0 = [as[0][0], as[0][1]], as1 = [as.at(-1)[6], as.at(-1)[7]], bs0 = [bs[0][0], bs[0][1]], bs1 = [bs.at(-1)[6], bs.at(-1)[7]];
        if (d(as0, bs0) + d(as1, bs1) > d(as0, bs1) + d(as1, bs0)) bs = reverseSegs(bs);
      }
    }
    if (smoothing > 0) {
      const ba = bbox({ subs: [{ segs: as }] }), bb = bbox({ subs: [{ segs: bs }] });
      const step = smoothing * Math.max(Math.hypot(ba?.w ?? 0, ba?.h ?? 0), Math.hypot(bb?.w ?? 0, bb?.h ?? 0));
      if (!degA && step > 0) as = redistribute({ closed: a.closed, segs: as }, step).segs;
      if (!degB && step > 0) bs = redistribute({ closed: b.closed, segs: bs }, step).segs;
    }
    const n = Math.max(as.length, bs.length);
    as = grow(as, n); bs = grow(bs, n);
    let shift = 0;
    if (closed && !degA && !degB) { shift = bestShift(as, bs, rotOrigins); bs = bs.slice(shift).concat(bs.slice(0, shift)); }
    shifts.push(shift);
    pairs.push({ closed, a: as, b: bs });
  }
  const rot = rotOrigins ? polar(pairs, rotOrigins.oa, rotOrigins.ob) : null;
  return { pairs, info: { pieces: pairs.length, grown, shifts, rotate: !!rot }, rot };
}

/** The shape at q (0 to 1) as a path: exactly the first at 0 and the second at 1. */
export function sample(pl, q) {
  q = q < 0 ? 0 : q > 1 ? 1 : q;
  const subs = pl.pairs.map((p, idx) => {
    const closed = p.closed;
    if (q === 0) return { closed, segs: p.a.map((g) => g.slice()) };
    if (q === 1) return { closed, segs: p.b.map((g) => g.slice()) };
    if (!pl.rot) return { closed, segs: p.a.map((g, i) => g.map((v, k) => lerp(v, p.b[i][k], q))) };
    const r = pl.rot[idx], m = r.rA.length, o = [lerp(r.oa[0], r.ob[0], q), lerp(r.oa[1], r.ob[1], q)];
    const anchors = [];
    for (let j = 0; j < m; j++) {
      if (r.plain[j]) anchors.push([lerp(r.anchorsA[j][0], r.anchorsB[j][0], q), lerp(r.anchorsA[j][1], r.anchorsB[j][1], q)]);
      else { const rad = lerp(r.rA[j], r.rB[j], q), th = r.tA[j] + r.turn[j] * q; anchors.push([o[0] + rad * Math.cos(th), o[1] + rad * Math.sin(th)]); }
    }
    const vec = (h) => {
      if (h.plain) return [lerp(h.va[0], h.vb[0], q), lerp(h.va[1], h.vb[1], q)];
      const l = lerp(h.la, h.lb, q), th = h.ta + h.dt * q;
      return [l * Math.cos(th), l * Math.sin(th)];
    };
    return { closed, segs: p.a.map((_, i) => {
      const P0 = anchors[i], P3 = i + 1 < m ? anchors[i + 1] : anchors[0];
      const c1 = vec(r.hs[i][0]), c2 = vec(r.hs[i][1]);
      return [P0[0], P0[1], P0[0] + c1[0], P0[1] + c1[1], P3[0] + c2[0], P3[1] + c2[1], P3[0], P3[1]];
    }) };
  });
  return { subs };
}

/** The shape at q as path data. */
export function sampleD(pl, q, digits = 2) { return stringify(sample(pl, q), digits); }
