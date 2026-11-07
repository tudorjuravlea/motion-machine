// hairline: the drawing maths of the thin-line style, after Hairline (lucasmarkes/hairline, MIT).
// A solid is the hull of two rounded rings, its lid and its base, so no vertical corner is drawn;
// its only inner line is the crease, the run of an inset ring on the lid that faces the viewer.
// Pure: rings live in a solid's own plane (u, v) and stand along h; the caller's P(u, v, h) gives a
// screen point and faces(sample, h) says whether a sample's side faces the viewer, so the same
// drawing follows any camera (an isometric plate, or a perspective camera that turns the device).

/** A rounded rectangle, sampled: n steps round each corner, each sample with its outward normal. */
export function rrect(u0, v0, u1, v1, r, n = 6) {
  r = Math.max(0, Math.min(r, (u1 - u0) / 2, (v1 - v0) / 2));
  const out = [];
  for (const [cu, cv, a0] of [[u1 - r, v1 - r, 0], [u0 + r, v1 - r, 90], [u0 + r, v0 + r, 180], [u1 - r, v0 + r, 270]])
    for (let k = 0; k <= n; k++) {
      const a = ((a0 + (90 * k) / n) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
      out.push({ u: cu + r * ca, v: cv + r * sa, nu: ca, nv: sa });
    }
  return out;
}

/** A circle of radius R about (cu, cv), sampled the same way. */
export function circ(R, n = 48, cu = 0, cv = 0) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    out.push({ u: cu + R * ca, v: cv + R * sa, nu: ca, nv: sa });
  }
  return out;
}

/** Convex hull (monotone chain) of screen points. */
export function hull(input) {
  const pts = input.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const x = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length > 1 && x(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length > 1 && x(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

/** The one cyclic run of samples that pass keep, in ring order. */
export function run(ring, keep) {
  const n = ring.length;
  let s = -1;
  for (let i = 0; i < n; i++) if (keep(ring[i]) && !keep(ring[(i + n - 1) % n])) { s = i; break; }
  if (s < 0) return keep(ring[0]) ? ring.slice() : [];
  const out = [];
  for (let k = 0; k < n && keep(ring[(s + k) % n]); k++) out.push(ring[(s + k) % n]);
  return out;
}

/** A solid standing from h0 to h1: { sil, crease } as screen points (sil closed, crease open). */
export function solid(P, faces, ring, inner, h0, h1) {
  const at = (r, h) => r.map((q) => P(q.u, q.v, h));
  return {
    sil: hull(at(ring, h1).concat(at(ring, h0))),
    crease: inner ? at(run(inner, (q) => faces(q, h1)), h1) : [],
  };
}

/** Indices of the leftmost, rightmost and lowest (largest y) points: where a dashed drop falls from. */
export function extremes(pts) {
  let a = 0, b = 0, c = 0;
  pts.forEach((p, k) => { if (p[0] < pts[a][0]) a = k; if (p[0] > pts[b][0]) b = k; if (p[1] > pts[c][1]) c = k; });
  return [a, b, c];
}

/** The length of a polyline, closed back to its start or not. */
export function length(pts, closed) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (closed && pts.length > 1) s += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return s;
}

/** The first share s (0..1) of a polyline by length: how far a line has been drawn on. */
export function partial(pts, closed, s) {
  const all = closed && pts.length > 1 ? pts.concat([pts[0]]) : pts;
  if (s >= 1) return all.slice();
  if (!(s > 0) || all.length < 2) return [];
  let left = s * length(all, false);
  const out = [all[0]];
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1], b = all[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d >= left) { const k = d ? left / d : 0; out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); return out; }
    left -= d;
    out.push(b);
  }
  return out;
}
