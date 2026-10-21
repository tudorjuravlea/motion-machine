// Pixel readings for the gate: a PNG decoder for the frames Playwright captures, CIE Lab
// distances, and the palette test "a palette colour or a blend of up to three palette colours".
// Not a rule: check.mjs loads only files named like a rule id.
import { inflateSync } from 'node:zlib';

/** Decodes an 8-bit, non-interlaced PNG (grey, grey+alpha, RGB, RGBA, palette) to { width, height, data: RGBA bytes }. */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0, plte = null, trns = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), kind = buf.toString('latin1', off + 4, off + 8), body = buf.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === 'PLTE') plte = body;
    else if (kind === 'tRNS') trns = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`unsupported PNG (bit depth ${depth}, interlace ${interlace})`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!ch) throw new Error(`unsupported PNG colour type ${type}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * ch, px = Buffer.alloc(stride * height), out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[dst + x - ch] : 0, b = y ? px[dst - stride + x] : 0, c = x >= ch && y ? px[dst - stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  for (let i = 0, j = 0; i < width * height; i++, j += ch) {
    const o = i * 4;
    if (type === 6) { out[o] = px[j]; out[o + 1] = px[j + 1]; out[o + 2] = px[j + 2]; out[o + 3] = px[j + 3]; }
    else if (type === 2) { out[o] = px[j]; out[o + 1] = px[j + 1]; out[o + 2] = px[j + 2]; out[o + 3] = 255; }
    else if (type === 0) { out[o] = out[o + 1] = out[o + 2] = px[j]; out[o + 3] = 255; }
    else if (type === 4) { out[o] = out[o + 1] = out[o + 2] = px[j]; out[o + 3] = px[j + 1]; }
    else { const k = px[j] * 3; out[o] = plte[k]; out[o + 1] = plte[k + 1]; out[o + 2] = plte[k + 2]; out[o + 3] = trns && px[j] < trns.length ? trns[px[j]] : 255; }
  }
  return { width, height, data: out };
}

const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const LIN = Float64Array.from({ length: 256 }, (_, i) => lin(i));
const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB 0..255 (may be fractional) to CIE Lab (D65). */
export function rgbToLab(r, g, b) {
  const R = Number.isInteger(r) ? LIN[r] : lin(r), G = Number.isInteger(g) ? LIN[g] : lin(g), B = Number.isInteger(b) ? LIN[b] : lin(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fx = fLab(x), fy = fLab(y), fz = fLab(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/** CIE76 ΔE between two Lab triples. */
export const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const STEPS = 24;
function segDist(p, a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / len)) : 0;
  return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1], p[2] - a[2] - t * d[2]);
}

// The point of segment ab nearest to p (all [r, g, b]).
function closestOnSegment(p, a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / len)) : 0;
  return [a[0] + t * d[0], a[1] + t * d[1], a[2] + t * d[2]];
}

// The point of triangle abc nearest to p (all [r, g, b]); Ericson, Real-Time Collision Detection, 5.1.5.
function closestOnTriangle(p, a, b, c) {
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const at = (o, u, s) => [o[0] + u[0] * s, o[1] + u[1] * s, o[2] + u[2] * s];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return at(b, sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  const denom = 1 / (va + vb + vc);
  return at(at(a, ab, vb * denom), ac, vc * denom);
}

// The multiply and the screen of two sRGB colours (per channel, 0..255).
const OFF_AXIS = 3;      // ΔE from the black-to-darkest-role (or lightest-role-to-white) line past which a darker or lighter blend is a colour of its own
const BLEND_MARGIN = 1;  // a blend is computed, not antialiased: it is held to ΔE 1 less than the roles are
const multiply = (a, b) => [a[0] * b[0] / 255, a[1] * b[1] / 255, a[2] * b[2] / 255];
const screen = (a, b) => [255 - (255 - a[0]) * (255 - b[0]) / 255, 255 - (255 - a[1]) * (255 - b[1]) / 255, 255 - (255 - a[2]) * (255 - b[2]) / 255];

/**
 * What a `mix-blend-mode: multiply` or `screen` of brand roles paints: a role (or a product already
 * made) against its multiply and its screen with each role, two levels deep (two overlapping discs over
 * the ground). Returns { segments, points }: the sRGB segment from a colour to its blend (partial
 * coverage and antialiasing walk it), and the blends that need no segment. A product darker than the
 * darkest role, or a screen lighter than the lightest, that lies on the line from black to the darkest
 * role (from the lightest role to white) is black or white, which no role owns: it is left out, so a
 * black vignette or a white wash still fails while a vignette toward the darkest role passes. One off
 * that line (ink under an accent disc) is a colour of its own and is kept as a point.
 */
function blendColours(rgbs) {
  const ls = rgbs.map((c) => rgbToLab(...c)[0]);
  const lo = Math.min(...ls) - 0.75, hi = Math.max(...ls) + 0.75;
  const seen = new Set(rgbs.map((c) => c.join(',')));
  const darkest = rgbs[ls.indexOf(Math.min(...ls))], lightest = rgbs[ls.indexOf(Math.max(...ls))];
  const offAxis = (q, from, to) => deltaE(rgbToLab(...q), rgbToLab(...closestOnSegment(q, from, to))) >= OFF_AXIS;
  const segments = [], points = [];
  let level = rgbs;
  for (let depth = 0; depth < 2; depth++) {
    const next = [];
    for (const p of level) for (const r of rgbs) for (const q of [multiply(p, r), screen(p, r)]) {
      const key = q.map(Math.round).join(',');
      if (seen.has(key)) continue;
      const l = rgbToLab(...q)[0];
      if (l >= lo && l <= hi) { seen.add(key); segments.push([p, q]); next.push(q); }
      else if (l < lo ? offAxis(q, [0, 0, 0], darkest) : offAxis(q, lightest, [255, 255, 255])) { seen.add(key); points.push(rgbToLab(...q)); }
    }
    level = next;
  }
  return { segments, points };
}

/**
 * The palette test of G-BRAND's pixel half: distance(rgb) is the ΔE from a colour to the nearest
 * palette colour, two-colour blend, three-colour blend or multiply or screen blend of roles.
 * Antialiasing and opacity blend in sRGB, so a two-colour blend is the sRGB segment between two roles
 * (walked in Lab as a polyline); a translucent role over a gradient between two others, or a glow over
 * a gradient, is a point of the triangle the three roles span in sRGB (`blend: 3`, the default;
 * `blend: 2` reads segments only, and neither multiply nor screen). `blendOf` (default: every colour)
 * names the colours multiply and screen blends are made of, so a style's ground colours need not
 * multiply the set. Results are cached per colour.
 */
export function paletteDistance(colors, { blend = 3, blendOf = colors } = {}) {
  const rgbs = [...new Set(colors.map((c) => c.slice(0, 3).join(',')))].map((k) => k.split(',').map(Number));
  const points = rgbs.map((c) => rgbToLab(...c));
  const lines = [];
  for (let i = 0; i < rgbs.length; i++) for (let j = i + 1; j < rgbs.length; j++) {
    const pts = [];
    for (let s = 0; s <= STEPS; s++) { const t = s / STEPS; pts.push(rgbToLab(...[0, 1, 2].map((k) => rgbs[i][k] + (rgbs[j][k] - rgbs[i][k]) * t))); }
    lines.push(pts);
  }
  const triangles = [];
  if (blend >= 3) for (let i = 0; i < rgbs.length; i++) for (let j = i + 1; j < rgbs.length; j++) for (let k = j + 1; k < rgbs.length; k++) triangles.push([rgbs[i], rgbs[j], rgbs[k]]);
  const { segments: blends, points: blendPoints } = blend >= 3 ? blendColours([...new Set(blendOf.map((c) => c.slice(0, 3).join(',')))].map((k) => k.split(',').map(Number))) : { segments: [], points: [] };
  const cache = new Map();
  const fn = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    let d = cache.get(key);
    if (d !== undefined) return d;
    const p = rgbToLab(r, g, b);
    d = Infinity;
    for (const q of points) d = Math.min(d, deltaE(p, q));
    for (const q of blendPoints) d = Math.min(d, deltaE(p, q) + BLEND_MARGIN);
    for (const pts of lines) for (let s = 0; s < STEPS && d > 0.5; s++) d = Math.min(d, segDist(p, pts[s], pts[s + 1]));
    for (const [ta, tb, tc] of triangles) {
      if (d <= 0.5) break;
      d = Math.min(d, deltaE(p, rgbToLab(...closestOnTriangle([r, g, b], ta, tb, tc))));
    }
    for (const [a, b2] of blends) {
      if (d <= 0.5 + BLEND_MARGIN) break;
      d = Math.min(d, deltaE(p, rgbToLab(...closestOnSegment([r, g, b], a, b2))) + BLEND_MARGIN);
    }
    cache.set(key, d);
    return d;
  };
  fn.rgbs = rgbs;   // the colours, for blendsOverGround
  return fn;
}

/**
 * the ΔE from `p` (rgb) to the ground pixel `under` (rgb) or any sRGB blend of it with one of
 * `rgbs`: what a palette element antialiased or faded over the brand ground can paint.
 */
export function overGround(p, under, rgbs) {
  const lp = rgbToLab(...p);
  let d = deltaE(lp, rgbToLab(...under));
  for (const c of rgbs) {
    let prev = rgbToLab(...under);
    for (let s = 1; s <= STEPS && d > 0.5; s++) {
      const t = s / STEPS, q = rgbToLab(...[0, 1, 2].map((k) => under[k] + (c[k] - under[k]) * t));
      d = Math.min(d, segDist(lp, prev, q));
      prev = q;
    }
  }
  return d;
}

/**
 * Counts pixels of `img` inside `rect` (default: the whole image) for which `test(r, g, b)` is true,
 * skipping any pixel inside one of `masks`. Returns { counted, total }.
 */
export function countPixels(img, test, { rect = null, masks = [], step = 1 } = {}) {
  const x0 = Math.max(0, Math.floor(rect?.x ?? 0)), y0 = Math.max(0, Math.floor(rect?.y ?? 0));
  const x1 = Math.min(img.width, Math.ceil(rect ? rect.x + rect.w : img.width)), y1 = Math.min(img.height, Math.ceil(rect ? rect.y + rect.h : img.height));
  const ms = masks.map((m) => [Math.floor(m.x), Math.floor(m.y), Math.ceil(m.x + m.w), Math.ceil(m.y + m.h)]);
  let counted = 0, total = 0;
  for (let y = y0; y < y1; y += step) {
    const rowMasks = ms.filter((m) => y >= m[1] && y < m[3]);
    for (let x = x0; x < x1; x += step) {
      if (rowMasks.length && rowMasks.some((m) => x >= m[0] && x < m[2])) continue;
      const o = (y * img.width + x) * 4;
      total++;
      if (test(img.data[o], img.data[o + 1], img.data[o + 2])) counted++;
    }
  }
  return { counted, total };
}

/**
 * G-BRAND's pixel reading. Every pixel of `rect` whose palette
 * distance exceeds `threshold` is off. A pixel inside one of `masks` (the content boxes of media) is
 * read from `behind` instead, the same frame shot with that media hidden, so a mask never hides what
 * is drawn around or behind the media; without `behind` a masked pixel is skipped. Off pixels form
 * 4-connected regions; a region whose bounding box is under 2 px tall or under 2 px wide (the
 * antialiasing row along an edge) is left out of the region test, but its pixels still count toward
 * the share, so stripes or a checkerboard of an unowned colour cannot hide as many thin regions.
 * Returns { total, off, thin, all, largest: { size, box }, colours } where `off` counts the pixels of
 * the regions that count, `thin` those of the regions left out, `all` every off pixel (`off + thin`,
 * the share's numerator), `largest` is the biggest region that counts, and `colours` the most
 * frequent off colours of all of them.
 */
// `ground`: the same frame shot with only the brand ground showing; a pixel off the palette
// passes when it is that ground or a blend of it with one palette colour.
export const MIN_REGION_SIDE = 2;
export function offPalette(img, dist, threshold, { rect = null, masks = [], behind = null, ground = null } = {}) {
  const x0 = Math.max(0, Math.floor(rect?.x ?? 0)), y0 = Math.max(0, Math.floor(rect?.y ?? 0));
  const x1 = Math.min(img.width, Math.ceil(rect ? rect.x + rect.w : img.width)), y1 = Math.min(img.height, Math.ceil(rect ? rect.y + rect.h : img.height));
  const W = Math.max(0, x1 - x0), H = Math.max(0, y1 - y0);
  const ms = masks.map((m) => [Math.floor(m.x), Math.floor(m.y), Math.ceil(m.x + m.w), Math.ceil(m.y + m.h)]);
  const flag = new Uint8Array(W * H);
  const rgbAt = new Map();   // pixel index in flag -> packed rgb, for the colours of the regions that count
  let total = 0, candidates = 0;
  for (let y = y0; y < y1; y++) {
    const rowMasks = ms.filter((m) => y >= m[1] && y < m[3]);
    for (let x = x0; x < x1; x++) {
      let src = img;
      if (rowMasks.length && rowMasks.some((m) => x >= m[0] && x < m[2])) { if (!behind) continue; src = behind; }
      const o = (y * img.width + x) * 4, r = src.data[o], g = src.data[o + 1], b = src.data[o + 2];
      total++;
      if (dist(r, g, b) <= threshold) continue;
      if (ground && dist.rgbs && overGround([r, g, b], [ground.data[o], ground.data[o + 1], ground.data[o + 2]], dist.rgbs) <= threshold) continue;
      candidates++;
      const i = (y - y0) * W + (x - x0);
      flag[i] = 1;
      rgbAt.set(i, (r << 16) | (g << 8) | b);
    }
  }
  let largest = { size: 0, box: null }, off = 0, thin = 0;
  const seen = new Map();
  if (candidates) {
    const queue = new Int32Array(candidates);
    let cursor = 0;
    for (let i = 0; i < flag.length; i++) {
      if (flag[i] !== 1) continue;
      const start = cursor;
      let head = cursor, bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1;
      queue[cursor++] = i; flag[i] = 2;
      while (head < cursor) {
        const p = queue[head++], px = p % W, py = (p - px) / W;
        if (px < bx0) bx0 = px; if (px > bx1) bx1 = px; if (py < by0) by0 = py; if (py > by1) by1 = py;
        if (px > 0 && flag[p - 1] === 1) { flag[p - 1] = 2; queue[cursor++] = p - 1; }
        if (px < W - 1 && flag[p + 1] === 1) { flag[p + 1] = 2; queue[cursor++] = p + 1; }
        if (py > 0 && flag[p - W] === 1) { flag[p - W] = 2; queue[cursor++] = p - W; }
        if (py < H - 1 && flag[p + W] === 1) { flag[p + W] = 2; queue[cursor++] = p + W; }
      }
      const size = cursor - start, w = bx1 - bx0 + 1, h = by1 - by0 + 1;
      for (let k = start; k < cursor; k++) { const c = rgbAt.get(queue[k]); seen.set(c, (seen.get(c) ?? 0) + 1); }
      if (w < MIN_REGION_SIDE || h < MIN_REGION_SIDE) { thin += size; continue; }
      off += size;
      if (size > largest.size) largest = { size, box: { x: x0 + bx0, y: y0 + by0, w, h } };
    }
  }
  const colours = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => `rgb(${c >> 16},${(c >> 8) & 255},${c & 255})`);
  return { total, off, thin, all: off + thin, largest, colours };
}
