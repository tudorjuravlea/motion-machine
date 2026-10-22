// glyphs.js: where ornament may root on a letter's own ink. A glyph arrives as a binary mask (one
// cell per letter, drawn at EM pixels per em with its origin, the left edge on the baseline, at
// (ox, oy)); the module turns it into a signed distance field, a thinned and pruned skeleton whose
// one-neighbour pixels are the stroke ends, outline points with outward normals, and a seeded set
// of anchors. Pure functions of their inputs, with no DOM: Node tests run them on drawn masks, a
// pattern runs them on letters it rasterises off screen. Anchors are in em from the glyph origin,
// so a reflow at another size or format gives the same anchors for the same letter and seed.
import { random } from './random.js';

export const EM = 64;          // analysis pixels per em
export const INSET = 0.02;     // em: an anchor sits this far inside the ink, so a stem visibly sprouts
const SHARE = { terminal: 3, up: 2, down: 1 };   // how much each kind of anchor weighs in the draw
const r4 = (x) => Math.round(x * 1e4) / 1e4;

/** A binary mask from RGBA pixels: 1 where alpha reaches the threshold. */
export function maskOf(rgba, w, h, threshold = 128) {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = rgba[i * 4 + 3] >= threshold ? 1 : 0;
  return m;
}

// Chamfer 3-4 distance from every pixel to the nearest pixel where seed(i) holds, in pixels.
function chamfer(w, h, seed) {
  const INF = 1e9, d = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = seed(i) ? 0 : INF;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? INF : d[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x - 1, y - 1) + 4, at(x, y - 1) + 3, at(x + 1, y - 1) + 4);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x + 1, y + 1) + 4, at(x, y + 1) + 3, at(x - 1, y + 1) + 4);
  }
  for (let i = 0; i < w * h; i++) d[i] /= 3;
  return d;
}

/**
 * Signed distance to the ink edge at each pixel centre, in pixels: negative inside the ink,
 * positive outside; the edge lies half a pixel from an edge pixel's centre. Outside the cell is
 * background.
 */
export function distanceField(mask, w, h) {
  const out = chamfer(w, h, (i) => mask[i]);
  const inn = chamfer(w, h, (i) => !mask[i]);
  const sdf = new Float32Array(w * h);
  let any = false, bg = false;
  for (let i = 0; i < w * h; i++) { if (mask[i]) any = true; else bg = true; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (mask[i]) {
      // the cell's border counts as background, so ink that touches it ends there
      const border = Math.min(x + 1, y + 1, w - x, h - y);
      sdf[i] = -(Math.min(bg ? inn[i] : Infinity, border) - 0.5);
    } else sdf[i] = any ? out[i] - 0.5 : 1e6;
  }
  return sdf;
}

// The eight neighbours, clockwise from north: P2 … P9 in the thinning literature.
const RING = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
function ring(img, w, h, x, y) {
  return RING.map(([dx, dy]) => { const X = x + dx, Y = y + dy; return X < 0 || Y < 0 || X >= w || Y >= h ? 0 : img[Y * w + X]; });
}
const crossings = (n) => { let a = 0; for (let k = 0; k < 8; k++) if (!n[k] && n[(k + 1) % 8]) a++; return a; };
const count = (n) => n.reduce((s, v) => s + v, 0);

/** Zhang–Suen thinning: a one-pixel-wide skeleton of the mask (1 on the skeleton). */
export function skeleton(mask, w, h) {
  const img = Uint8Array.from(mask);
  for (let x = 0; x < w; x++) { img[x] = 0; img[(h - 1) * w + x] = 0; }
  for (let y = 0; y < h; y++) { img[y * w] = 0; img[y * w + w - 1] = 0; }
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      const del = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (!img[y * w + x]) continue;
        const n = ring(img, w, h, x, y), b = count(n);
        if (b < 2 || b > 6 || crossings(n) !== 1) continue;
        const [p2, , p4, , p6, , p8] = n;
        if (step === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
        del.push(y * w + x);
      }
      for (const i of del) img[i] = 0;
      if (del.length) changed = true;
    }
  }
  return img;
}

// One step along the skeleton from `here`, not back to a visited pixel: 4-neighbours first.
function nextOf(img, w, h, x, y, seen) {
  for (const k of [0, 2, 4, 6, 1, 3, 5, 7]) {
    const X = x + RING[k][0], Y = y + RING[k][1];
    if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
    const i = Y * w + X;
    if (img[i] && !seen.has(i)) return [X, Y];
  }
  return null;
}
const isEnd = (img, w, h, x, y) => { const n = ring(img, w, h, x, y); return crossings(n) === 1 && count(n) <= 2; };
const isJunction = (img, w, h, x, y) => { const n = ring(img, w, h, x, y); return crossings(n) >= 3 || count(n) >= 4; };

// Walk from an end along the skeleton until a junction, another end or `limit` pixels.
function walk(img, w, h, x, y, limit = Infinity) {
  const path = [[x, y]], seen = new Set([y * w + x]);
  let len = 0, cur = [x, y], stop = 'end';
  for (;;) {
    const nx = nextOf(img, w, h, cur[0], cur[1], seen);
    if (!nx) { stop = 'end'; break; }
    len += Math.hypot(nx[0] - cur[0], nx[1] - cur[1]);
    cur = nx; seen.add(nx[1] * w + nx[0]);
    if (isJunction(img, w, h, nx[0], nx[1])) { stop = 'junction'; break; }
    path.push(nx);
    if (len >= limit) { stop = 'limit'; break; }
  }
  return { path, len, stop, at: cur };
}

/**
 * Removes spurs: a branch from an end to a junction that is shorter than the stroke's half-width
 * there (plus a pixel and a half) is noise of the thinning, a corner of the stroke, not a stroke end.
 */
function prune(skel, w, h, sdf) {
  const img = Uint8Array.from(skel);
  for (let round = 0; round < 4; round++) {
    const drop = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!img[y * w + x] || !isEnd(img, w, h, x, y)) continue;
      const r = walk(img, w, h, x, y);
      if (r.stop !== 'junction') continue;
      const half = Math.abs(sdf[r.at[1] * w + r.at[0]]);
      if (r.len < half * 1.5 + 1.5) drop.push(...r.path);
    }
    if (!drop.length) break;
    for (const [x, y] of drop) img[y * w + x] = 0;
  }
  return img;
}

/** The stroke ends of a skeleton: [{ x, y, dx, dy }] in pixels, (dx, dy) the outward direction. */
export function terminals(skel, w, h, reach = 6) {
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!skel[y * w + x] || !isEnd(skel, w, h, x, y)) continue;
    const r = walk(skel, w, h, x, y, reach);
    const [bx, by] = r.path.at(-1);
    const len = Math.hypot(x - bx, y - by);
    if (!len) continue;   // an isolated pixel: a dot too small to have a direction
    out.push({ x: x + 0.5, y: y + 0.5, dx: (x - bx) / len, dy: (y - by) / len });
  }
  return out;
}

// The distance field sampled bilinearly at continuous pixel coordinates (pixel centres at +0.5).
function sample(a, X, Y) {
  const fx = X - 0.5, fy = Y - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const v = (x, y) => (x < 0 || y < 0 || x >= a.w || y >= a.h ? Math.max(a.w, a.h) : a.sdf[y * a.w + x]);
  return (v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx) * (1 - ty) + (v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx) * ty;
}

/** The signed distance to the ink edge at a point in em from the glyph origin, in em. */
export function sdfAt(a, x, y) { return sample(a, a.ox + x * EM, a.oy + y * EM) / EM; }

function gradient(a, X, Y) {
  const e = 1.5;
  const gx = sample(a, X + e, Y) - sample(a, X - e, Y), gy = sample(a, X, Y + e) - sample(a, X, Y - e);
  const l = Math.hypot(gx, gy);
  return l ? [gx / l, gy / l] : [0, -1];
}

/**
 * Everything the anchors need from one glyph cell `{ mask, w, h, ox, oy }`: the distance field, the
 * pruned skeleton, its stroke ends, the outline points with outward normals, the ink area in em²
 * and the ink's bounding box in pixels.
 */
export function analyse({ mask, w, h, ox, oy }) {
  const sdf = distanceField(mask, w, h);
  const a = { w, h, ox, oy, sdf, area: 0, box: null, skel: null, terminals: [], outline: [] };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
    const edge = [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X < 0 || Y < 0 || X >= w || Y >= h || !mask[Y * w + X]; });
    if (edge) { const [nx, ny] = gradient(a, x + 0.5, y + 0.5); a.outline.push({ x: x + 0.5, y: y + 0.5, nx, ny }); }
  }
  a.area = n / (EM * EM);
  if (!n) return a;
  a.box = { x0, y0, x1, y1 };
  a.skel = prune(skeleton(mask, w, h), w, h, sdf);
  a.terminals = terminals(a.skel, w, h, Math.max(4, Math.round(EM * 0.08)));
  return a;
}

// Moves a point along (dx, dy) in quarter pixels to where the field reads -INSET em.
function inset(a, X, Y, dx, dy, outward) {
  const goal = -INSET * EM, max = EM;
  let x = X, y = Y;
  if (outward) {   // from inside the stroke toward its end: stop at the last point still INSET deep
    for (let k = 0; k < max * 4 && sample(a, x + dx * 0.25, y + dy * 0.25) <= goal; k++) { x += dx * 0.25; y += dy * 0.25; }
  } else {         // from the edge inward
    for (let k = 0; k < max * 4 && sample(a, x, y) > goal; k++) { x -= dx * 0.25; y -= dy * 0.25; }
  }
  return [x, y];
}

const toEm = (a, x, y, nx, ny, kind, weight) => {
  const l = Math.hypot(nx, ny) || 1;
  return { x: r4((x - a.ox) / EM), y: r4((y - a.oy) / EM), nx: nx / l, ny: ny / l, kind, weight };
};

/** Every candidate anchor of an analysed glyph, before the draw, in em. */
export function candidates(a) {
  if (!a.box) return [];
  const list = [];
  for (const t of a.terminals) {
    const [x, y] = inset(a, t.x, t.y, t.dx, t.dy, true);
    list.push(toEm(a, x, y, t.dx, t.dy, 'terminal'));
  }
  const mid = (a.box.y0 + a.box.y1) / 2, foot = a.oy - 0.08 * EM;
  for (const o of a.outline) {
    const kind = o.ny < -0.5 && o.y < mid ? 'up' : o.ny > 0.5 && o.y >= foot ? 'down' : null;
    if (!kind) continue;
    const [x, y] = inset(a, o.x, o.y, o.nx, o.ny, false);
    list.push(toEm(a, x, y, o.nx, o.ny, kind));
  }
  const per = {};
  for (const c of list) per[c.kind] = (per[c.kind] ?? 0) + 1;
  for (const c of list) c.weight = SHARE[c.kind] / per[c.kind];
  return list;
}

/**
 * The anchors of one glyph: a seeded, weighted draw from its candidates with a minimum spacing of
 * 0.25 em / density. The count follows the ink area (a wide "m" gets more than an "i"), one to five.
 * When the glyph has a stroke end, the first anchor is one. The stream is seeded by the seed, the
 * glyph's index in its text and its character, never by where the glyph sits on the page.
 */
export function anchors(a, { seed = 0, density = 1, index = 0, char = '' } = {}) {
  const pool = candidates(a);
  if (!pool.length) return [];
  const rnd = random(`glyph|${seed}|${index}|${char}`);
  const n = Math.min(5, Math.max(1, Math.round(a.area * 12 * density)));
  const gap = 0.25 / Math.max(0.2, density);
  const picked = [];
  const far = (c) => picked.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= gap);
  let left = pool.slice();
  const ends = left.filter((c) => c.kind === 'terminal');
  if (ends.length) picked.push(ends[Math.floor(rnd() * ends.length)]);
  left = left.filter((c) => !picked.includes(c) && far(c));
  while (picked.length < n && left.length) {
    const total = left.reduce((s, c) => s + c.weight, 0);
    let r = rnd() * total, i = 0;
    while (i < left.length - 1 && r >= left[i].weight) { r -= left[i].weight; i++; }
    picked.push(left[i]);
    left = left.filter((c, k) => k !== i && far(c));
  }
  return picked.map((c) => ({ ...c }));
}

/**
 * A bridge between two neighbouring letters of a word: the nearest facing outline points (the
 * first glyph's right-facing edge, the second's left-facing one), a seeded pick among the closest
 * few. `advance` is how far the second glyph's origin sits right of the first's, in em. Ends are in
 * each glyph's own em; null when no pair lies within 0.8 em.
 */
export function bridge(a, b, advance, { seed = 0, index = 0 } = {}) {
  if (!a.box || !b.box) return null;
  const side = (g, sign) => g.outline.filter((o) => Math.floor(o.y) % 2 === 0 && o.nx * sign > 0.3).map((o) => {
    const [x, y] = inset(g, o.x, o.y, o.nx, o.ny, false);
    return toEm(g, x, y, o.nx, o.ny, 'bridge', 1);
  });
  const L = side(a, 1), R = side(b, -1);
  const pairs = [];
  for (const p of L) for (const q of R) {
    const d = Math.hypot(q.x + advance - p.x, q.y - p.y);
    if (q.x + advance > p.x && d <= 0.8) pairs.push({ from: p, to: q, length: d });
  }
  if (!pairs.length) return null;
  pairs.sort((u, v) => u.length - v.length || u.from.y - v.from.y || u.to.y - v.to.y);
  const top = pairs.slice(0, 6);
  const pick = top[Math.floor(random(`bridge|${seed}|${index}`)() * top.length)];
  return { from: { ...pick.from }, to: { ...pick.to }, length: r4(pick.length) };
}

// The 8-connected blobs of a mask: [{ px: [indices], area, x0, y0, x1, y1 }], box ends exclusive.
function blobs(mask, w, h) {
  const label = new Int32Array(w * h).fill(-1), out = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    const b = { px: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, stack = [s];
    label[s] = out.length;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      b.px.push(i);
      b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x + 1); b.y1 = Math.max(b.y1, y + 1);
      for (const [dx, dy] of RING) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X;
        if (mask[j] && label[j] < 0) { label[j] = out.length; stack.push(j); }
      }
    }
    b.area = b.px.length;
    out.push(b);
  }
  return { out, label };
}

// The marks that are a dot on their own.
const DOTS = new Set(['.', '•', '·', '∙', '●', '⋅']);

/**
 * The round mark of a glyph cell `{ mask, w, h, ox, oy, alpha? }` drawn at `em` pixels per em: on an
 * "i" or a "j" the tittle, the separate blob lying wholly above the top of the largest one (the
 * stem); on a full stop or a round bullet its one blob. Centre, radius and semi-axes come from the
 * coverage `alpha` (0 to 255 per pixel, the mask when absent) over the blob and the pixels around
 * it, so an antialiased edge counts by its share and the measure holds to a fraction of a pixel.
 * Returns `{ x, y, r, rx, ry, round }` in em from the glyph origin: `r` the radius of the disc of the
 * blob's area, `rx` and `ry` the semi-axes of its upright ellipse (equal on a round dot, apart on an
 * oval one); `round` is false when the blob is no disc or upright ellipse (a square or slanted
 * tittle). null when the character has no such mark.
 */
export function dotOf({ mask, w, h, ox, oy, alpha }, { char = '', em = EM } = {}) {
  const { out, label } = blobs(mask, w, h);
  if (!out.length) return null;
  let dot = null;
  if (char === 'i' || char === 'j') {
    if (out.length < 2) return null;
    const main = out.reduce((a, b) => (b.area > a.area ? b : a));
    const above = out.filter((b) => b !== main && b.y1 <= main.y0 + 1);
    if (!above.length) return null;
    dot = above.reduce((a, b) => (b.area > a.area ? b : a));
  } else if (DOTS.has(char)) {
    dot = out.reduce((a, b) => (b.area > a.area ? b : a));
  } else return null;
  // the blob's pixels and the ring around it that belongs to no other blob, weighted by coverage
  const id = label[dot.px[0]], seen = new Set(dot.px), cov = (i) => (alpha ? alpha[i] / 255 : mask[i]);
  let A = 0, sx = 0, sy = 0;
  const add = (i) => { const a = cov(i), x = i % w, y = (i - x) / w; A += a; sx += a * (x + 0.5); sy += a * (y + 0.5); };
  for (const i of dot.px) {
    add(i);
    const x = i % w, y = (i - x) / w;
    for (const [dx, dy] of RING) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const j = Y * w + X;
      if (seen.has(j) || (label[j] >= 0 && label[j] !== id)) continue;
      seen.add(j);
      if (!mask[j]) add(j);
    }
  }
  if (!A) return null;
  const cx = sx / A, cy = sy / A, r = Math.sqrt(A / Math.PI);
  // the second moments give the blob's ellipse (a uniform ellipse has a variance of a quarter of its
  // semi-axis squared; a twelfth of a pixel is the sampling's own share)
  let xx = 0, yy = 0, xy = 0;
  for (const i of seen) { const a = cov(i), x = i % w + 0.5 - cx, y = (i - (i % w)) / w + 0.5 - cy; xx += a * x * x; yy += a * y * y; xy += a * x * y; }
  xx = Math.max(1e-6, xx / A - 1 / 12); yy = Math.max(1e-6, yy / A - 1 / 12); xy /= A;
  const rx = 2 * Math.sqrt(xx), ry = 2 * Math.sqrt(yy);
  // round: every pixel of the blob lies inside its axis-aligned ellipse (to within a pixel), and the
  // ellipse is near enough a circle or upright that an unturned ellipse matches it
  const reach = Math.max(...dot.px.map((i) => { const x = i % w + 0.5 - cx, y = (i - (i % w)) / w + 0.5 - cy; return Math.hypot(x / rx, y / ry); }));
  const tilt = Math.abs(xy) / Math.sqrt(xx * yy);
  const round = reach <= 1 + 0.75 / Math.min(rx, ry) && (Math.max(rx, ry) / Math.min(rx, ry) <= 1.05 || tilt <= 0.15);
  return { x: r4((cx - ox) / em), y: r4((cy - oy) / em), r: r4(r / em), rx: r4(rx / em), ry: r4(ry / em), round };
}
