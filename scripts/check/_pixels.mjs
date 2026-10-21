// Pixel readings for the gate: a PNG decoder for the frames Playwright captures, CIE Lab
// distances, and the palette test "a palette colour or a two-colour blend of palette colours".
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

/**
 * The palette test of G-LITERAL's pixel half: distance(rgb) is the ΔE from a colour to the nearest
 * palette colour or two-colour blend (antialiasing and opacity blend in sRGB, so each blend is the
 * sRGB segment between two roles, walked in Lab as a polyline). Results are cached per colour.
 */
export function paletteDistance(colors) {
  const rgbs = [...new Set(colors.map((c) => c.slice(0, 3).join(',')))].map((k) => k.split(',').map(Number));
  const points = rgbs.map((c) => rgbToLab(...c));
  const lines = [];
  for (let i = 0; i < rgbs.length; i++) for (let j = i + 1; j < rgbs.length; j++) {
    const pts = [];
    for (let s = 0; s <= STEPS; s++) { const t = s / STEPS; pts.push(rgbToLab(...[0, 1, 2].map((k) => rgbs[i][k] + (rgbs[j][k] - rgbs[i][k]) * t))); }
    lines.push(pts);
  }
  const cache = new Map();
  const fn = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    let d = cache.get(key);
    if (d !== undefined) return d;
    const p = rgbToLab(r, g, b);
    d = Infinity;
    for (const q of points) d = Math.min(d, deltaE(p, q));
    for (const pts of lines) for (let s = 0; s < STEPS && d > 0.5; s++) d = Math.min(d, segDist(p, pts[s], pts[s + 1]));
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
 * G-LITERAL's pixel reading. Every pixel of `rect` whose palette
 * distance exceeds `threshold` is off. A pixel inside one of `masks` (the content boxes of media) is
 * read from `behind` instead, the same frame shot with that media hidden, so a mask never hides what
 * is drawn around or behind the media; without `behind` a masked pixel is skipped. Returns
 * { total, off, largest: { size, box }, colours } where `largest` is the biggest 4-connected region
 * of off pixels and `colours` the most frequent off colours.
 */
// `ground`: the same frame shot with only the brand ground showing; a pixel off the palette
// passes when it is that ground or a blend of it with one palette colour.
export function offPalette(img, dist, threshold, { rect = null, masks = [], behind = null, ground = null } = {}) {
  const x0 = Math.max(0, Math.floor(rect?.x ?? 0)), y0 = Math.max(0, Math.floor(rect?.y ?? 0));
  const x1 = Math.min(img.width, Math.ceil(rect ? rect.x + rect.w : img.width)), y1 = Math.min(img.height, Math.ceil(rect ? rect.y + rect.h : img.height));
  const W = Math.max(0, x1 - x0), H = Math.max(0, y1 - y0);
  const ms = masks.map((m) => [Math.floor(m.x), Math.floor(m.y), Math.ceil(m.x + m.w), Math.ceil(m.y + m.h)]);
  const flag = new Uint8Array(W * H);
  const seen = new Map();
  let total = 0, off = 0;
  for (let y = y0; y < y1; y++) {
    const rowMasks = ms.filter((m) => y >= m[1] && y < m[3]);
    for (let x = x0; x < x1; x++) {
      let src = img;
      if (rowMasks.length && rowMasks.some((m) => x >= m[0] && x < m[2])) { if (!behind) continue; src = behind; }
      const o = (y * img.width + x) * 4, r = src.data[o], g = src.data[o + 1], b = src.data[o + 2];
      total++;
      if (dist(r, g, b) <= threshold) continue;
      if (ground && dist.rgbs && overGround([r, g, b], [ground.data[o], ground.data[o + 1], ground.data[o + 2]], dist.rgbs) <= threshold) continue;
      off++;
      flag[(y - y0) * W + (x - x0)] = 1;
      const k = `${r},${g},${b}`; seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  }
  let largest = { size: 0, box: null };
  if (off) {
    const queue = new Int32Array(off);
    for (let i = 0; i < flag.length; i++) {
      if (flag[i] !== 1) continue;
      let head = 0, tail = 0, bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1;
      queue[tail++] = i; flag[i] = 2;
      while (head < tail) {
        const p = queue[head++], px = p % W, py = (p - px) / W;
        if (px < bx0) bx0 = px; if (px > bx1) bx1 = px; if (py < by0) by0 = py; if (py > by1) by1 = py;
        if (px > 0 && flag[p - 1] === 1) { flag[p - 1] = 2; queue[tail++] = p - 1; }
        if (px < W - 1 && flag[p + 1] === 1) { flag[p + 1] = 2; queue[tail++] = p + 1; }
        if (py > 0 && flag[p - W] === 1) { flag[p - W] = 2; queue[tail++] = p - W; }
        if (py < H - 1 && flag[p + W] === 1) { flag[p + W] = 2; queue[tail++] = p + W; }
      }
      if (tail > largest.size) largest = { size: tail, box: { x: x0 + bx0, y: y0 + by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 } };
    }
  }
  const colours = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => `rgb(${k})`);
  return { total, off, largest, colours };
}
