// The maths of `mm media layers`: one still picture taken apart into a plate (the picture with its
// parts removed) and parts (each a transparent cut-out with its box, stacking order and depth), with
// no learned model. Masks come from the user (grey PNGs or RGBA cut-outs), from a colour key against a
// flat background, or from polygons. The plate's holes are filled by a push-pull pyramid (each level
// averages the known pixels of the one below; filling runs back down, every level filling only what
// it lacks) plus seeded grain matched to the picture. A part's soft edge is unmixed: its colour is
// solved so that alpha · part + (1 − alpha) · what lies under it equals the source pixel, so the stack
// recomposes the source. The recompose check measures each stacked pixel's colour distance (CIE76 ΔE)
// from the source pixel.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng, deltaE, rgbToLab } from '../check/_pixels.mjs';

// A stacked pixel is off when it lies further than ΔE 10 from the source: two flat patches side by side
// read as different from about ΔE 2 to 3, so 10 is a change anyone sees, while the rounding of an
// unmixed soft edge stays far under it. The stack passes with at most one pixel in a thousand off (a
// one-pixel seam around a part a third of the picture across, at most).
export const OFF_DE = 10;
export const OFF_LIMIT = 0.001;
// A part pixel with alpha under 4 of 255 changes the picture by at most 4 levels, well inside the
// recompose tolerance, while its unmixed colour (divided by that alpha) is mostly noise: it is dropped.
const MIN_ALPHA = 4;
// The colour key finds its pieces on the picture averaged over 5 x 5 pixels: averaging 25 pixels cuts
// per-pixel noise (JPEG grain, sensor noise) five-fold, so a backdrop that is flat to the eye keys as
// flat and its specks neither split off as parts nor survive as holes.
const KEY_RADIUS = 2;
/** The smallest keyed part kept, in pixels: a thousandth of the picture (at least 16); a smaller piece is too small to read as a layer when it moves. */
export const minArea = (w, h) => Math.max(16, Math.round(0.001 * w * h));

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** A seeded 32-bit generator (mulberry32): floats in [0, 1). */
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Coverage of a polygon ([[x, y], …] in pixels, even-odd fill) on a w × h grid, 4 × 4 samples a
 * pixel: a Uint8Array of alpha 0..255.
 */
export function rasterPolygon(points, w, h, ss = 4) {
  const count = new Uint16Array(w * h), n = points.length;
  for (let y = 0; y < h; y++) for (let j = 0; j < ss; j++) {
    const sy = y + (j + 0.5) / ss, xs = [];
    for (let i = 0; i < n; i++) {
      const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % n];
      if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) xs.push(x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] * ss - 0.5)), to = Math.min(w * ss, Math.ceil(xs[k + 1] * ss - 0.5));
      for (let s = from; s < to; s++) count[y * w + Math.floor(s / ss)]++;
    }
  }
  const out = new Uint8Array(w * h), full = ss * ss;
  for (let i = 0; i < w * h; i++) out[i] = Math.round((count[i] * 255) / full);
  return out;
}

/** A mask picture's alpha: its alpha channel when it has one in use (an RGBA cut-out), else its grey level. */
export function maskAlpha(img) {
  const n = img.width * img.height, out = new Uint8Array(n);
  let cut = false;
  for (let i = 0; i < n; i++) if (img.data[i * 4 + 3] < 255) { cut = true; break; }
  for (let i = 0; i < n; i++) out[i] = cut ? img.data[i * 4 + 3] : Math.round(luma(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]));
  return out;
}

/** The background colour of a flat-background picture: the median of its outermost ring of pixels, per channel. */
export function autoKey(img) {
  const { width: w, height: h, data } = img, ring = [[], [], []];
  const take = (x, y) => { const i = (y * w + x) * 4; for (let c = 0; c < 3; c++) ring[c].push(data[i + c]); };
  for (let x = 0; x < w; x++) { take(x, 0); take(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { take(0, y); take(w - 1, y); }
  return ring.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
}

/** The picture averaged over (2r + 1)² pixels (separable box, clamped at the borders): RGB floats per pixel. */
function boxAverage(img, r) {
  const { width: w, height: h, data } = img, n = w * h, row = new Float64Array(n * 3), avg = new Float64Array(n * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += data[(y * w + clamp(x + k, 0, w - 1)) * 4 + c];
    row[(y * w + x) * 3 + c] = s / (2 * r + 1);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += row[(clamp(y + k, 0, h - 1) * w + x) * 3 + c];
    avg[(y * w + x) * 3 + c] = s / (2 * r + 1);
  }
  return avg;
}
const KEY_SOFT = [0.06, 0.2];   // the key's alpha rises from 0 to 1 over this RGB distance (share of 255)
const keyDist = (rgb, i, key) => Math.hypot(rgb[i] - key[0], rgb[i + 1] - key[1], rgb[i + 2] - key[2]) / 255;

/** Alpha from the colour distance to the background (RGB distance over 255, eased over KEY_SOFT); radius > 0 measures it on the averaged picture. */
export function keyAlpha(img, key, { radius = 0 } = {}) {
  const n = img.width * img.height, out = new Uint8Array(n);
  const rgb = radius > 0 ? boxAverage(img, radius) : null;
  for (let i = 0; i < n; i++) {
    const d = rgb ? keyDist(rgb, i * 3, key) : keyDist(img.data, i * 4, key);
    out[i] = Math.round(255 * smooth(KEY_SOFT[0], KEY_SOFT[1], d));
  }
  return out;
}

/**
 * The share of the picture's outermost ring that, averaged like the key, lies past the key's soft
 * start: near 0 on a flat backdrop, large on a gradient, a vignette or a textured wall.
 */
export function ringOffKey(img, key) {
  const { width: w, height: h } = img, rgb = boxAverage(img, KEY_RADIUS);
  let off = 0, all = 0;
  const look = (x, y) => { all++; if (keyDist(rgb, (y * w + x) * 3, key) >= KEY_SOFT[0]) off++; };
  for (let x = 0; x < w; x++) { look(x, 0); look(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { look(0, y); look(w - 1, y); }
  return off / all;
}

/**
 * A colour key's parts: pieces are found on the averaged picture (so noise specks neither split off
 * nor survive), pieces under `min` pixels are dropped, and each kept piece takes its alpha from the
 * picture itself wherever the averaged piece reaches (which covers the piece's own edge, since the
 * averaging spreads it by KEY_RADIUS), so its edge is as sharp as the picture's and a speck of
 * backdrop noise beside it stays backdrop.
 */
export function keyParts(img, key, { min = minArea(img.width, img.height) } = {}) {
  const sharp = keyAlpha(img, key);
  return components(keyAlpha(img, key, { radius: KEY_RADIUS }), img.width, img.height, { min })
    .map((piece) => piece.map((v, i) => (v ? sharp[i] : 0)));
}

/**
 * Splits an alpha map into its 8-connected pieces (pixels with alpha ≥ MIN_ALPHA), dropping pieces
 * under `min` pixels, in reading order: rows of pieces that overlap vertically, top to bottom, each
 * row left to right. Returns full-size alpha maps.
 */
export function components(alpha, w, h, { min = minArea(w, h) } = {}) {
  const label = new Int32Array(w * h).fill(-1), found = [];
  for (let start = 0; start < w * h; start++) {
    if (alpha[start] < MIN_ALPHA || label[start] >= 0) continue;
    const id = found.length, stack = [start], px = [];
    label[start] = id;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      px.push(i);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h) {
          const j = ny * w + nx;
          if (label[j] < 0 && alpha[j] >= MIN_ALPHA) { label[j] = id; stack.push(j); }
        }
      }
    }
    found.push({ px, x0, y0, x1, y1 });
  }
  const kept = found.filter((c) => c.px.length >= min).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  if (kept.some((c) => c.x0 === 0 && c.y0 === 0 && c.x1 === w - 1 && c.y1 === h - 1)) {
    throw Object.assign(new Error('the background is not flat enough for --key: one keyed piece reaches all four edges of the picture (give masks with --mask or polygons with --poly)'), { exitCode: 2 });
  }
  const rows = [];
  for (const c of kept) {
    const row = rows.at(-1);
    if (row && c.y0 <= row.y1) { row.items.push(c); row.y1 = Math.max(row.y1, c.y1); } else rows.push({ y1: c.y1, items: [c] });
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.x0 - b.x0)).map((c) => {
    const a = new Uint8Array(w * h);
    for (const i of c.px) a[i] = alpha[i];
    return a;
  });
}

/**
 * Fills the pixels where `hole` is 1 from their surroundings (push-pull pyramid, bilinear on the
 * way down), then adds seeded grain as strong as the picture's own pixel-to-pixel noise (`grain`
 * scales it; 0 for none). Every other pixel is returned unchanged. Returns RGBA bytes.
 */
export function pushPull(img, hole, { grain = 1, seed = 1 } = {}) {
  const { width: W, height: H, data } = img;
  const levels = [];
  let w = W, h = H, c = new Float64Array(W * H * 3), wt = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const k = hole[i] ? 0 : 1;
    wt[i] = k;
    for (let ch = 0; ch < 3; ch++) c[i * 3 + ch] = data[i * 4 + ch] * k;
  }
  levels.push({ w, h, c, wt });
  while (w > 1 || h > 1) {
    const nw = Math.ceil(w / 2), nh = Math.ceil(h / 2), nc = new Float64Array(nw * nh * 3), nwt = new Float64Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let sw = 0; const s = [0, 0, 0];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const sx = 2 * x + dx, sy = 2 * y + dy;
        if (sx >= w || sy >= h) continue;
        const j = sy * w + sx;
        sw += wt[j];
        for (let ch = 0; ch < 3; ch++) s[ch] += c[j * 3 + ch];
      }
      const o = y * nw + x, cw = Math.min(1, sw);
      nwt[o] = cw;
      for (let ch = 0; ch < 3; ch++) nc[o * 3 + ch] = sw > 0 ? (s[ch] * cw) / sw : 0;
    }
    w = nw; h = nh; c = nc; wt = nwt;
    levels.push({ w, h, c, wt });
  }
  const top = levels.at(-1);
  let fin = new Float64Array(3);
  for (let ch = 0; ch < 3; ch++) fin[ch] = top.wt[0] > 0 ? top.c[ch] / top.wt[0] : 0;
  let fw = 1, fh = 1;
  for (let k = levels.length - 2; k >= 0; k--) {
    const L = levels[k], out = new Float64Array(L.w * L.h * 3);
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const o = y * L.w + x;
      const u = clamp((x + 0.5) / 2 - 0.5, 0, fw - 1), v = clamp((y + 0.5) / 2 - 0.5, 0, fh - 1);
      const x0 = Math.floor(u), y0 = Math.floor(v), x1 = Math.min(fw - 1, x0 + 1), y1 = Math.min(fh - 1, y0 + 1), ax = u - x0, ay = v - y0;
      for (let ch = 0; ch < 3; ch++) {
        const up = (fin[(y0 * fw + x0) * 3 + ch] * (1 - ax) + fin[(y0 * fw + x1) * 3 + ch] * ax) * (1 - ay)
          + (fin[(y1 * fw + x0) * 3 + ch] * (1 - ax) + fin[(y1 * fw + x1) * 3 + ch] * ax) * ay;
        out[o * 3 + ch] = L.c[o * 3 + ch] + (1 - L.wt[o]) * up;
      }
    }
    fin = out; fw = L.w; fh = L.h;
  }
  // grain: half the median step between neighbouring known pixels, at most 6 levels
  const steps = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x + 1 < W; x += 2) {
    const i = y * W + x;
    if (!hole[i] && !hole[i + 1]) steps.push(Math.abs(luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) - luma(data[i * 4 + 4], data[i * 4 + 5], data[i * 4 + 6])));
  }
  steps.sort((a, b) => a - b);
  const amp = grain > 0 && steps.length ? Math.min(6, 0.5 * steps[steps.length >> 1]) * grain : 0;
  const rnd = seededRandom(seed);
  const res = Buffer.from(data);
  for (let i = 0; i < W * H; i++) {
    if (!hole[i]) continue;
    const g = amp ? (rnd() - 0.5) * 2 * amp : 0;
    for (let ch = 0; ch < 3; ch++) res[i * 4 + ch] = Math.round(clamp(fin[i * 3 + ch] + g, 0, 255));
    res[i * 4 + 3] = 255;
  }
  return res;
}

/**
 * Stacks plate + parts ([{ x, y, w, h, data }] in z order) and compares with the source. `error`: each
 * pixel's ΔE from the source (0 where no channel differs by more than 2 levels, which is under ΔE 10).
 */
export function stackAndCompare(source, plate, parts) {
  const { width: W, height: H } = source, out = Float64Array.from(plate);
  for (const p of parts) for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const i = (y * p.w + x) * 4, o = ((p.y + y) * W + p.x + x) * 4, a = p.data[i + 3] / 255;
    if (a) for (let c = 0; c < 3; c++) out[o + c] = p.data[i + c] * a + out[o + c] * (1 - a);
  }
  const error = new Float32Array(W * H), s = source.data;
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    const q = [Math.round(out[i * 4]), Math.round(out[i * 4 + 1]), Math.round(out[i * 4 + 2])];
    if (Math.max(Math.abs(q[0] - s[i * 4]), Math.abs(q[1] - s[i * 4 + 1]), Math.abs(q[2] - s[i * 4 + 2])) <= 2) continue;
    error[i] = deltaE(rgbToLab(...q), rgbToLab(s[i * 4], s[i * 4 + 1], s[i * 4 + 2]));
    if (error[i] > OFF_DE) n++;
  }
  const offShare = Math.round((n / (W * H)) * 1e6) / 1e6;
  return { unit: 'ΔE76', threshold: OFF_DE, limit: OFF_LIMIT, offPixels: n, offShare, ok: n / (W * H) <= OFF_LIMIT, error };
}

/** The recompose error as a grey RGBA picture: black where the stack matches, brighter with the error, white where it is off. */
export function errorMap(error, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = error[i] > OFF_DE ? 255 : Math.round((error[i] / OFF_DE) * 200);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * Takes the picture apart. `parts`: [{ name, alpha (full-size Uint8Array), depth? }] bottom-up.
 * `plate`: an RGBA picture the user supplies, or null to fill the holes. `depthMap`: a grey picture
 * (near = white) or null. `depths`: constants in part order, or null. `grow`: widen the hole by a
 * pixel around the parts (for masks and polygons drawn by hand, which can stop a pixel short of the
 * object; a colour key's alpha already reaches as far as the object's colour does).
 * Returns { plate, plateDepth, plateDepthMap (the map with the holes filled, or null), parts: [{ name, x, y, w, h, z, depth, data }], depthFrom, fill, recompose, warnings }.
 */
export function buildLayers({ img, parts, plate = null, depthMap = null, depths = null, grain = 1, grow = true }) {
  const { width: W, height: H, data: src } = img, n = W * H;
  // the hole: every pixel a part touches (grown by one pixel when asked), filled on the plate
  const touched = new Uint8Array(n), hole = new Uint8Array(n);
  for (const p of parts) for (let i = 0; i < n; i++) { if (p.alpha[i] < MIN_ALPHA) p.alpha[i] = 0; else touched[i] = 1; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!touched[y * W + x]) continue;
    if (!grow) { hole[y * W + x] = 1; continue; }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) hole[ny * W + nx] = 1; }
  }
  // with every pixel under a part nothing behind them is known: the plate is the picture itself,
  // softened (filled from one pixel in 16 x 16), so a moving part uncovers a blur of the scene, not black
  const warnings = [];
  let fill = plate ? 'supplied' : 'push-pull', plateData;
  if (plate) plateData = Buffer.from(plate.data);
  else if (hole.every((v) => v)) {
    fill = 'soft-copy';
    warnings.push('every pixel is under a part, so nothing behind the parts is known: the plate is a softened copy of the picture');
    const sparse = new Uint8Array(n).fill(1);
    for (let y = 8; y < H; y += 16) for (let x = 8; x < W; x += 16) sparse[y * W + x] = 0;
    if (W < 16 || H < 16) sparse[(H >> 1) * W + (W >> 1)] = 0;
    plateData = pushPull(img, sparse, { grain: 0 });
  } else plateData = pushPull(img, hole, { grain });
  const under = Float64Array.from(plateData);
  // bare: nothing stacked over the plate yet. Where a part's solved colour would leave 0..255 (a faint
  // edge pixel over a noisy backdrop the fill cannot know), the rest of the source goes to a filled
  // plate instead, so the stack still gives the source back.
  const bare = new Uint8Array(n).fill(1);
  const out = parts.map((p, z) => {
    const a = p.alpha, full = Buffer.alloc(n * 4);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0; i < n; i++) {
      if (!a[i]) continue;
      const al = a[i] / 255, x = i % W, y = (i - x) / W;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let c = 0; c < 3; c++) {
        const want = (src[i * 4 + c] - (1 - al) * under[i * 4 + c]) / al, fg = Math.round(clamp(want, 0, 255));
        if (fg !== Math.round(want) && bare[i] && !plate && al < 1) {
          plateData[i * 4 + c] = Math.round(clamp((src[i * 4 + c] - al * fg) / (1 - al), 0, 255));
          under[i * 4 + c] = plateData[i * 4 + c];
        }
        full[i * 4 + c] = fg;
        under[i * 4 + c] = fg * al + under[i * 4 + c] * (1 - al);
      }
      full[i * 4 + 3] = a[i];
      bare[i] = 0;
    }
    if (x1 < 0) throw Object.assign(new Error(`part "${p.name}" is empty: its mask covers no pixel of the picture`), { exitCode: 2 });
    const w = x1 - x0 + 1, h = y1 - y0 + 1, crop = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) full.copy(crop, y * w * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4);
    return { name: p.name, x: x0, y: y0, w, h, z, data: crop, alpha: a, depth: p.depth };
  });
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  let depthFrom = 'order', plateDepth = 0, plateDepthMap = null;
  if (depthMap) {
    depthFrom = 'map';
    plateDepthMap = pushPull(depthMap, hole, { grain: 0 });   // the plate's own depth: the parts' holes filled from around them
    for (const p of out) {
      let s = 0, sw = 0;
      for (let i = 0; i < n; i++) if (p.alpha[i]) { s += (p.alpha[i] / 255) * (depthMap.data[i * 4] / 255); sw += p.alpha[i] / 255; }
      p.depth = r4(s / sw);
    }
    let s = 0, k = 0;
    for (let i = 0; i < n; i++) if (!hole[i]) { s += depthMap.data[i * 4] / 255; k++; }
    plateDepth = k ? r4(s / k) : 0;
  } else if (depths) {
    depthFrom = 'list';
    out.forEach((p, i) => { p.depth = depths[i]; });
  } else if (out.every((p) => typeof p.depth === 'number')) {
    depthFrom = 'parts';
  } else {
    out.forEach((p, i) => { p.depth = r4((i + 1) / (out.length + 1)); });
  }
  const recompose = stackAndCompare(img, plateData, out);
  for (const p of out) delete p.alpha;
  return { plate: plateData, plateDepth, plateDepthMap, parts: out, depthFrom, fill, recompose, warnings };
}

/** Every file a `kind: layers` media.json names (what must travel with the piece). */
export function layerFiles(meta) {
  return [meta.source?.file, meta.plate?.file, meta.depth?.file, ...(meta.parts ?? []).map((p) => p.file)].filter(Boolean);
}

/** Re-runs the recompose check on a written pack folder: { unit, threshold, limit, offPixels, offShare, ok }. */
export function recompose(dir) {
  const meta = JSON.parse(readFileSync(join(dir, 'media.json'), 'utf8'));
  const read = (f) => decodePng(readFileSync(join(dir, f)));
  const parts = [...meta.parts].sort((a, b) => a.z - b.z).map((p) => ({ ...p, data: read(p.file).data }));
  const { error, ...result } = stackAndCompare(read(meta.source.file), read(meta.plate.file).data, parts);
  return result;
}
