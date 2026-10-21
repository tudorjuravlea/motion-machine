#!/usr/bin/env node
// `mm motion capture` (SPEC §13): measure the grammar of a reference film from
// its frames (cuts, cut kinds, shot lengths, arrival tempo, entrance durations, rests, the headline
// entrance family) and write a motion half (contracts/motion.schema.json) with capture-notes.md
// beside it. Grammar only, never content (H-REF): no text, colour or image of the reference is kept.
//
//   node scripts/capture-motion.mjs --from <video> --name <name> --out <path>/<name>.json [--fps N]
//
// Frames are greyscale, decoded at the source rate (at most 30 fps; --fps overrides) and 320 px wide;
// the analysis reads them at 160 px, the entrance signatures at 320 px.
//   1. Global pass at 10 fps (every n-th frame). D[k] = mean |F[k] − F[k−1]|; activity floor =
//      median(D) + 6·1.4826·MAD(D), at least 0.02 grey levels. Runs of active frames (one still
//      frame bridged) are the candidate events.
//   2. Each event is re-read at the source rate. Its active stretches are split again; a stretch is
//      a cut when it *replaces* the picture (at least half the 10×10 px cells that held content
//      before it have changed after it), else an arrival. Cuts closer than 0.4 s are one cut.
//   3. A cut's kind comes from its frame pairs at the source rate, tested in this order: wipe or iris
//      (each pair's change sits in a narrow strip or ring that travels across the picture); push or
//      whip-pan (consecutive pairs explained by one shift of the whole picture; a whip-pan blurs
//      along its axis or clears the picture within 0.1 s); hard (the first pair replaces the
//      picture and nothing after it is still the old picture); zoom (pairs explained by growth about
//      the centre); dip (the picture fades to a flat colour and comes back after a hold of 0.1 s or
//      less); fade (intermediate frames are blends of the frames either side, including a fade into
//      a shot that is still empty); otherwise unclassified.
//   4. The stretch after a cut's last transition frame, and every stretch that is not a cut, are
//      arrivals (a new one wherever a new region starts to change 0.15 s or more after the last
//      onset). An arrival is timed on its progress curve (distance to the settled frame on an 8 px
//      grid) under the enter easing of the energy preset; push, whip-pan, wipe and iris cuts are
//      timed the same way under the move easing.
//   5. Energy comes from measured quantities (median shot, arrivals per 10 s, share of hard cuts,
//      median cut length) scored against anchors calibrated on labelled films
//      (ENERGY_CALIBRATION, from calibrateEnergy). The headline entrance family is read from the
//      first arrival of each shot (growth, shrink, travel, blur), except in a film that opens
//      finished: when frame 0 already holds half the content its first arrival settles into (an
//      instant hook), the first shot has no headline entrance to read and is left out of the vote.
// Thresholds are provisional (SPEC §12): measured on the labelled films the tool ships with, no more.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseEasing } from '../runtime/kit/ease.js';
import { spring } from '../runtime/kit/springs.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const ANALYSIS_WIDTH = 160;
export const DETAIL_WIDTH = 320;       // entrance signatures are read at twice the analysis width
export const MAX_FPS = 30;             // source frames are read at most at this rate
export const GLOBAL_FPS = 10;          // the global pass that finds candidate events
const NOISE_K = 6, NOISE_MIN = 0.02;   // activity floor, grey levels
const CELL = 10;                       // difference-region map cell, px at analysis width
const CELL_CHANGED = 8;                // a cell changed when its mean |ΔF| exceeds this
const CONTENT_STD = 4, CONTENT_DELTA = 12; // a cell holds content: textured, or off the background
const REPLACE_MIN = 0.5;               // share of content cells an event must change to be a cut
const REFRACTORY_S = 0.4;
const SHIFT_GAIN = 0.4;                // a pair is shifted when the best shift removes 40 % of its error
const FLAT = 0.15;                     // a frame is flat when its spread is below 15 % of the shots'
const MASK_WIDTH = 0.35;               // a wipe's or iris's change sits in 35 % of the extent or less
const MASK_TRAVEL = 0.4;               // ... and its strip or ring travels 40 % of the extent or more
const ZOOM_GAIN = 0.5, ZOOM_MIN = 1.03; // a pair is zoomed when growth by ≥ 3 % halves its error
const WHIP_S = 0.1;                    // a shift that clears the picture this fast reads as a whip-pan
const WHIP_BLUR = 0.12;                // ... as does one whose frames are blurred along the axis
const DIP_HOLD_S = 0.1;                // a flat hold this short between fade-out and fade-in is a dip
const BLUR_GAIN = 0.15;                // an entrance frame is blurred when blurring the settled ink cuts the error by 15 %
const BLEND_MAX = 0.25;                // mean blend residual (share of the span change) for a fade
const ARRIVAL_MIN = 0.05;              // an arrival changes the picture by at least this, grey levels
const COARSE = 8;                      // box size (px at analysis width) for timing arrivals
const FINISHED_MIN = 0.5;              // a film opens finished when frame 0 holds half its first settled content

export const PRESET_OF = { calm: 'calm', medium: 'premium', high: 'kinetic' };
export const KIND_REF = {
  hard: 'transitions/hard-cut', fade: 'transitions/crossfade', dip: 'transitions/color-dip', push: 'transitions/push',
  'whip-pan': 'transitions/whip-pan', wipe: 'transitions/wipe', iris: 'transitions/iris', zoom: 'transitions/zoom-through',
};
const KIND_ROLE = { 'whip-pan': 'quick' }; // the duration role a cut kind's pattern takes (else standard)
export const NO_CUTS_GAP = 'Named gap: no cuts observed; transition preferences not captured';

// ---------------------------------------------------------------------------------------------
// Frames

function run(cmd, args) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [], err = [];
    p.on('error', (e) => fail(Object.assign(new Error(e.code === 'ENOENT' ? `${cmd} not found on PATH` : `${cmd}: ${e.message}`), { setup: true })));
    p.stdout.on('data', (c) => out.push(c));
    p.stderr.on('data', (c) => err.push(c));
    p.on('close', (code) => ok({ code, out: Buffer.concat(out), log: Buffer.concat(err).toString() }));
  });
}

/** The video stream's frame rate, read from ffmpeg's banner (null when it gives none). */
export async function sourceFps(video) {
  const { log } = await run('ffmpeg', ['-hide_banner', '-nostdin', '-i', video]);
  const m = /Stream #[^\n]*Video:[^\n]*?([\d.]+) fps/.exec(log) ?? /Stream #[^\n]*Video:[^\n]*?([\d.]+) tbr/.exec(log);
  return m ? Number(m[1]) : null;
}

/**
 * Area-average taps for resampling `n` pixels down to `m`: output pixel o covers source span
 * [o·n/m, (o+1)·n/m) and each source pixel weighs its overlap with it. Flat: taps[o] are
 * first[o] + 0..count[o]−1 with weights wt[o·k + 0..].
 */
function areaTaps(n, m) {
  const r = n / m, k = Math.ceil(r) + 1;
  const first = new Int32Array(m), count = new Int32Array(m), wt = new Float64Array(m * k);
  for (let o = 0; o < m; o++) {
    const a = o * r, b = (o + 1) * r, i0 = Math.floor(a), i1 = Math.min(n, Math.ceil(b));
    first[o] = i0; count[o] = i1 - i0;
    for (let i = i0; i < i1; i++) wt[o * k + i - i0] = (Math.min(b, i + 1) - Math.max(a, i)) / r;
  }
  return { first, count, wt, k };
}

/**
 * Decodes `video` to greyscale frames at `fps` (default: the source rate, at most 30), 320 px wide
 * (`detail`), and box-averages them to 160 px (`frames`, the analysis frames).
 *
 * ffmpeg only decodes and picks frames (fps, then extractplanes=y: the decoded luma plane, no
 * scaler). The downscale to 320 px (area average) and the limited-to-full range expansion are done
 * here in doubles with one rounding at the end, so the frames are the same bytes whatever the
 * ffmpeg version or CPU: swscale's x86 SIMD, NEON and C paths round differently (±1 grey level on
 * most pixels between ffmpeg 6.1 on x86-64 and 8.1 on arm64), enough to move a measured duration.
 */
export async function extractFrames(video, { fps = null, width = ANALYSIS_WIDTH } = {}) {
  const src = fps ?? Math.min(MAX_FPS, (await sourceFps(video)) ?? GLOBAL_FPS);
  const W = width * 2;
  // 8-bit planar YUV keeps its luma exactly as decoded; anything else (RGB, 10-bit) becomes yuv420p first.
  const vf = `fps=${src},format=yuv420p|yuvj420p|yuv422p|yuvj422p|yuv444p|yuvj444p|yuv440p|yuvj440p|yuv411p|yuv410p|nv12|nv21|gray,extractplanes=y`;
  const detail = [];
  let log = '', geo = null, buf = null, fill = 0;
  const setup = () => {
    const m = /Output #0[\s\S]*?Video: rawvideo[^\n]*?(\d{2,5})x(\d{2,5})/.exec(log);
    if (!m) return;
    const W0 = Number(m[1]), H0 = Number(m[2]);
    const H = Math.round((W * H0) / (W0 * 2)) * 2; // the height scale=320:-2 gives
    const inFmt = /Stream #0[^\n]*Video:[^\n]*?, (\w+)\(/.exec(log)?.[1] ?? '';
    const full = /Video: rawvideo[^\n]*gray\(pc/.test(log) || inFmt.startsWith('yuvj');
    geo = { W0, H0, H, xs: areaTaps(W0, W), ys: areaTaps(H0, H), gain: full ? 1 : 255 / 219, lift: full ? 0 : 16,
      rows: new Float64Array(H0 * W), acc: new Float64Array(W) };
    buf = new Uint8Array(W0 * H0);
  };
  const toDetail = (f) => {
    const { W0, H0, H, xs, ys, gain, lift, rows, acc } = geo;
    for (let y = 0; y < H0; y++) {
      const s = y * W0, d = y * W;
      for (let x = 0; x < W; x++) {
        const i0 = s + xs.first[x], n = xs.count[x], o = x * xs.k;
        let v = 0;
        for (let t = 0; t < n; t++) v += f[i0 + t] * xs.wt[o + t];
        rows[d + x] = v;
      }
    }
    const g = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      acc.fill(0);
      const j0 = ys.first[y], n = ys.count[y], o = y * ys.k;
      for (let t = 0; t < n; t++) {
        const wt = ys.wt[o + t], r = (j0 + t) * W;
        for (let x = 0; x < W; x++) acc[x] += rows[r + x] * wt;
      }
      for (let x = 0; x < W; x++) g[y * W + x] = Math.min(255, Math.max(0, Math.round((acc[x] - lift) * gain)));
    }
    return g;
  };
  const take = (c) => {
    let at = 0;
    while (at < c.length) {
      const n = Math.min(buf.length - fill, c.length - at);
      buf.set(c.subarray(at, at + n), fill);
      fill += n; at += n;
      if (fill === buf.length) { detail.push(toDetail(buf)); fill = 0; }
    }
  };
  const early = [];
  const code = await new Promise((ok, fail) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-nostdin', '-i', video, '-an', '-vf', vf, '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    p.on('error', (e) => fail(Object.assign(new Error(e.code === 'ENOENT' ? 'ffmpeg not found on PATH' : `ffmpeg: ${e.message}`), { setup: true })));
    p.stderr.on('data', (c) => { log += c; if (!geo) { setup(); if (geo) early.splice(0).forEach(take); } });
    p.stdout.on('data', (c) => { if (geo) take(c); else early.push(c); }); // frame bytes can precede the banner line
    p.on('close', ok);
  });
  if (code !== 0) throw Object.assign(new Error(`ffmpeg could not read ${video}: ${log.trim().split('\n').pop()}`), { setup: true });
  if (!geo) { setup(); if (!geo) throw new Error(`ffmpeg gave no frame size for ${video}`); early.splice(0).forEach(take); }
  const H = geo.H, w = W >> 1, h = H >> 1;
  const frames = detail.map((f) => {
    const g = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = 2 * y * W + 2 * x;
      g[y * w + x] = (f[i] + f[i + 1] + f[i + W] + f[i + W + 1] + 2) >> 2;
    }
    return g;
  });
  return { frames, w, h, fps: src, detail: { frames: detail, w: W, h: H } };
}

// ---------------------------------------------------------------------------------------------
// Statistics

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function meanAbs(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

function frameMedian(f) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < f.length; i++) hist[clamp(Math.round(f[i]), 0, 255)]++;
  let acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc * 2 >= f.length) return v; }
  return 255;
}

function stdOf(f) {
  let s = 0, s2 = 0;
  for (let i = 0; i < f.length; i++) { s += f[i]; s2 += f[i] * f[i]; }
  const m = s / f.length;
  return Math.sqrt(Math.max(0, s2 / f.length - m * m));
}

/** Box-averages a frame by `b` px (float result, partial edge boxes dropped). */
function boxDown(f, w, h, b) {
  const W = Math.floor(w / b), H = Math.floor(h / b), out = new Float64Array(W * H);
  for (let y = 0; y < H * b; y++) for (let x = 0; x < W * b; x++) out[Math.floor(y / b) * W + Math.floor(x / b)] += f[y * w + x];
  for (let i = 0; i < out.length; i++) out[i] /= b * b;
  return out;
}

function activityFloor(D) {
  const body = Array.from(D.subarray(1));
  const med = median(body) ?? 0, dev = median(body.map((x) => Math.abs(x - med))) ?? 0;
  return Math.max(NOISE_MIN, med + NOISE_K * 1.4826 * dev);
}

// ---------------------------------------------------------------------------------------------
// The difference-region map: which cells hold content, which changed.

function cellGrid(w, h) { return { cx: Math.floor(w / CELL), cy: Math.floor(h / CELL) }; }

function contentCells(f, w, h) {
  const { cx, cy } = cellGrid(w, h), bg = frameMedian(f), out = new Uint8Array(cx * cy);
  for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let s = 0, s2 = 0;
    for (let y = j * CELL; y < (j + 1) * CELL; y++) for (let x = i * CELL; x < (i + 1) * CELL; x++) { const v = f[y * w + x]; s += v; s2 += v * v; }
    const n = CELL * CELL, mean = s / n, std = Math.sqrt(Math.max(0, s2 / n - mean * mean));
    out[j * cx + i] = std > CONTENT_STD || Math.abs(mean - bg) > CONTENT_DELTA ? 1 : 0;
  }
  return out;
}

function changedCells(a, b, w, h) {
  const { cx, cy } = cellGrid(w, h), out = new Uint8Array(cx * cy);
  for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let s = 0;
    for (let y = j * CELL; y < (j + 1) * CELL; y++) for (let x = i * CELL; x < (i + 1) * CELL; x++) s += Math.abs(a[y * w + x] - b[y * w + x]);
    out[j * cx + i] = s / (CELL * CELL) > CELL_CHANGED ? 1 : 0;
  }
  return out;
}

/** Share of the cells that held content in `a` which have changed in `b` (0 when `a` is empty). */
export function replacement(a, b, w, h) {
  const content = contentCells(a, w, h), changed = changedCells(a, b, w, h);
  let n = 0, c = 0;
  for (let i = 0; i < content.length; i++) if (content[i]) { n++; c += changed[i]; }
  return n < 3 ? 0 : c / n;
}

/** Share of the cells that hold content in `b` which already held content in `a` (0 when `b` is empty). */
export function heldBefore(a, b, w, h) {
  const before = contentCells(a, w, h), after = contentCells(b, w, h);
  let n = 0, c = 0;
  for (let i = 0; i < after.length; i++) if (after[i]) { n++; c += before[i]; }
  return n < 3 ? 0 : c / n;
}

/** Mean |b − a| over the cells that held content in `a` (0 when `a` is empty). */
function contentChange(a, b, w, h, content = contentCells(a, w, h)) {
  const { cx } = cellGrid(w, h);
  let s = 0, n = 0;
  for (let i = 0; i < content.length; i++) {
    if (!content[i]) continue;
    const ci = i % cx, cj = Math.floor(i / cx);
    for (let y = cj * CELL; y < (cj + 1) * CELL; y++) for (let x = ci * CELL; x < (ci + 1) * CELL; x++) { s += Math.abs(b[y * w + x] - a[y * w + x]); n++; }
  }
  return n ? s / n : 0;
}

// ---------------------------------------------------------------------------------------------
// Transition signatures, read at the source frame rate.

// Best displacement of `b` relative to `a` along one axis: b(x) ≈ a(x − d).
function shiftAlong(a, b, w, h, axis) {
  const max = Math.floor((axis === 'x' ? w : h) * 0.45);
  let best = { d: 0, err: Infinity }, e0 = Infinity;
  for (let d = -max; d <= max; d++) {
    let s = 0, n = 0;
    if (axis === 'x') {
      const x0 = Math.max(0, d), x1 = Math.min(w, w + d);
      for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) { s += Math.abs(b[y * w + x] - a[y * w + x - d]); n++; }
    } else {
      const y0 = Math.max(0, d), y1 = Math.min(h, h + d);
      for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) { s += Math.abs(b[y * w + x] - a[(y - d) * w + x]); n++; }
    }
    const err = s / n;
    if (d === 0) e0 = err;
    if (err < best.err - 1e-9) best = { d, err };
  }
  return { ...best, e0 };
}

/** Best whole-picture shift from `a` to `b` on either axis, with the share of error it removes. */
export function shiftOf(a, b, w, h) {
  const sx = shiftAlong(a, b, w, h, 'x'), sy = shiftAlong(a, b, w, h, 'y');
  const s = sx.err <= sy.err ? { axis: 'x', ...sx } : { axis: 'y', ...sy };
  const gain = s.e0 > 0 ? 1 - s.err / s.e0 : 0;
  const dir = s.axis === 'x' ? (s.d < 0 ? 'left' : 'right') : (s.d < 0 ? 'up' : 'down');
  return { ...s, gain, dir };
}

// How much better `b` is matched by `a` shifted by d and blurred along the axis (box of 5 px) than
// by `a` shifted alone: positive when `b` is a motion-blurred copy of `a`.
function blurGain(a, b, w, h, axis, d) {
  const R = 2;
  let e1 = 0, e2 = 0, n = 0;
  const at = (x, y) => a[y * w + x];
  for (let y = R; y < h - R; y++) for (let x = R; x < w - R; x++) {
    const sx = axis === 'x' ? x - d : x, sy = axis === 'y' ? y - d : y;
    if (sx < R || sy < R || sx >= w - R || sy >= h - R) continue;
    let s = 0;
    for (let k = -R; k <= R; k++) s += axis === 'x' ? at(sx + k, sy) : at(sx, sy + k);
    const v = b[y * w + x];
    e1 += Math.abs(v - at(sx, sy)); e2 += Math.abs(v - s / (2 * R + 1)); n++;
  }
  return n && e1 > 0 ? 1 - e2 / e1 : 0;
}

/**
 * Where a frame pair's change sits: the narrowest window holding 70 % of |ΔF| along columns, rows
 * and rings about the centre (width as a share of the extent) and the window's centre. A wipe
 * changes a strip and an iris a ring that travel; a push, fade or zoom changes it all.
 */
export function changeProfile(a, b, w, h) {
  const BINS = 32, cols = new Float64Array(BINS), rows = new Float64Array(BINS), rings = new Float64Array(BINS);
  const cx = (w - 1) / 2, cy = (h - 1) / 2, rmax = Math.hypot(cx, cy);
  let total = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = Math.abs(a[y * w + x] - b[y * w + x]);
    if (v < 4) continue;
    total += v;
    cols[Math.min(BINS - 1, Math.floor((x / w) * BINS))] += v;
    rows[Math.min(BINS - 1, Math.floor((y / h) * BINS))] += v;
    rings[Math.min(BINS - 1, Math.floor((Math.hypot(x - cx, y - cy) / rmax) * BINS))] += v;
  }
  const narrow = (hist) => {
    let best = { width: 1, centre: 0.5 };
    if (total <= 0) return best;
    for (let i = 0; i < BINS; i++) {
      let s = 0;
      for (let j = i; j < BINS; j++) {
        s += hist[j];
        if (s >= 0.7 * total) { const width = (j - i + 1) / BINS; if (width < best.width) best = { width, centre: (i + j + 1) / 2 / BINS }; break; }
      }
    }
    return best;
  };
  return { total: total / (w * h), x: narrow(cols), y: narrow(rows), r: narrow(rings) };
}

/** Samples `f` scaled by `s` about the centre (bilinear); pixels that fall outside keep `fill`. */
function scaled(f, w, h, s, fill) {
  const out = new Float64Array(w * h), cx = (w - 1) / 2, cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = cx + (x - cx) / s, sy = cy + (y - cy) / s;
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) { out[y * w + x] = fill; continue; }
    const fx = sx - x0, fy = sy - y0, i = y0 * w + x0;
    out[y * w + x] = (f[i] * (1 - fx) + f[i + 1] * fx) * (1 - fy) + (f[i + w] * (1 - fx) + f[i + w + 1] * fx) * fy;
  }
  return out;
}

/** Best growth of the picture about its centre from `a` to `b` (s in 1.01..1.3) and its gain. */
export function zoomOf(a, b, w, h) {
  const bg = frameMedian(a), e0 = meanAbs(a, b);
  let best = { s: 1, err: e0 };
  for (let s = 1.01; s <= 1.3 + 1e-9; s += 0.01) {
    const err = meanAbs(scaled(a, w, h, s, bg), b);
    if (err < best.err) best = { s, err };
  }
  return { s: round(best.s, 2), gain: e0 > 0 ? 1 - best.err / e0 : 0 };
}

// Mean blend residual of frames a..b−1 against the line from P to Q, as a share of |Q − P|.
function blendResidual(frames, a, b, P, Q) {
  const span = meanAbs(P, Q);
  if (!(span > 0)) return Infinity;
  let res = 0, n = 0;
  for (let k = a; k < b; k++) {
    const F = frames[k];
    let num = 0, den = 0;
    for (let i = 0; i < F.length; i++) { const q = Q[i] - P[i]; num += (F[i] - P[i]) * q; den += q * q; }
    const alpha = den > 0 ? num / den : 0;
    let r = 0;
    for (let i = 0; i < F.length; i++) r += Math.abs(F[i] - (P[i] + alpha * (Q[i] - P[i])));
    res += r / F.length / span; n++;
  }
  return n ? res / n : 0;
}

/**
 * Classifies the transition that starts with source pair `s0` (frame s0 − 1 is the last still
 * frame) and may run to `s1`. Returns the cut (kind, direction, onset, last transition pair `e`,
 * confidence, evidence, and progress samples for timing where the kind gives them).
 */
function classifyCut(F, w, h, fps, D, floor, s0, s1, limit = s1) {
  const P = F[s0 - 1], Q = F[s1];
  const spread = Math.max(stdOf(P), stdOf(Q));
  const flatMemo = new Map();
  const spreadOf = (k) => { if (!flatMemo.has(k)) flatMemo.set(k, stdOf(F[k])); return flatMemo.get(k); };
  const flat = (k) => spreadOf(k) <= Math.max(1.5, FLAT * spread);
  // A nearly flat frame (beside the picture before the cut) matches any large shift or growth of a
  // picture; those tests skip it.
  const thin = (k) => spreadOf(k) <= Math.max(1.5, 2 * FLAT * stdOf(P));
  const maxLen = Math.min(s1, s0 + Math.round(1.2 * fps));
  const pairs = [];
  for (let k = s0; k <= maxLen; k++) pairs.push(k);
  const active = pairs.filter((k) => D[k] > floor);
  const tStill = (s0 - 1) / fps;
  const base = { t: round(tStill, 6) };

  // 1. Wipe or iris: each pair's change sits in a narrow strip or ring that travels.
  const prof = new Map();
  const profOf = (k) => { if (!prof.has(k)) prof.set(k, changeProfile(F[k - 1], F[k], w, h)); return prof.get(k); };
  let mask = null;
  for (const axis of ['x', 'y', 'r']) {
    const seq = [];
    for (const k of active) {
      const p = profOf(k)[axis];
      if (p.width > MASK_WIDTH) { if (seq.length) break; else continue; }
      seq.push({ k, c: p.centre });
    }
    if (seq.length < 3) continue;
    const diffs = seq.slice(1).map((s, i) => s.c - seq[i].c);
    const up = diffs.filter((x) => x >= -0.02).length / diffs.length, down = diffs.filter((x) => x <= 0.02).length / diffs.length;
    const travel = seq.at(-1).c - seq[0].c;
    const ok = (axis === 'r' ? travel >= MASK_TRAVEL && up >= 0.8 : Math.abs(travel) >= MASK_TRAVEL && (travel > 0 ? up : down) >= 0.8);
    if (ok && (!mask || Math.abs(travel) > Math.abs(mask.travel))) mask = { axis, seq, travel };
  }
  if (mask) {
    const { axis, seq, travel } = mask;
    const kind = axis === 'r' ? 'iris' : 'wipe';
    const direction = axis === 'x' ? (travel > 0 ? 'right' : 'left') : axis === 'y' ? (travel > 0 ? 'down' : 'up') : null;
    const c0 = seq[0].c, c1 = seq.at(-1).c;
    const samples = [[tStill, 0], ...seq.map((s) => [s.k / fps, clamp((s.c - c0) / (c1 - c0), 0, 1)])];
    return { ...base, end: round(seq.at(-1).k / fps, 6), e: seq.at(-1).k, kind, direction, samples, confidence: round(clamp(Math.abs(travel), 0, 1)),
      evidence: `${seq.length} frame pairs change a ${axis === 'r' ? 'ring' : 'strip'} that travels ${Math.round(Math.abs(travel) * 100)} % of the ${axis === 'x' ? 'width' : axis === 'y' ? 'height' : 'radius'}` };
  }

  // 2. Push or whip-pan: consecutive pairs explained by one shift of the whole picture.
  const sh = new Map();
  const shOf = (k) => { if (!sh.has(k)) sh.set(k, shiftOf(F[k - 1], F[k], w, h)); return sh.get(k); };
  const shifted = (k) => !thin(k) && !thin(k - 1) && D[k] > floor && (() => { const s = shOf(k); return s.d !== 0 && s.gain >= SHIFT_GAIN; })();
  const runK = [];
  let misses = 0, blank = 0, cleared = null;
  for (const k of pairs) {
    if (shifted(k)) { runK.push(k); misses = 0; blank = 0; continue; }
    if (!runK.length) { if (k - s0 < 1) continue; break; }  // one faint leading pair is allowed
    // The picture may pass through a nearly flat frame between the two shots (both off screen).
    if ((thin(k) || thin(k - 1)) && ++blank <= 2) { if (cleared == null && thin(k)) cleared = k; continue; }
    if (!thin(k) && D[k] > floor && ++misses <= 1) continue; // and one weak pair inside
    break;
  }
  if (runK.length) {
    const votes = {};
    for (const k of runK) { const d = shOf(k).dir; votes[d] = (votes[d] ?? 0) + 1; }
    const [dir, nDir] = Object.entries(votes).sort((x, y) => y[1] - x[1])[0];
    const last = runK.at(-1);
    if (cleared != null && cleared < last) cleared = null; // shifts resumed: it was a passage, not the end
    const consistent = nDir / runK.length >= 0.8;
    if (consistent && (runK.length >= 2 || cleared)) {
      const e = cleared ?? last;
      const span = (e - (s0 - 1)) / fps;
      const axis = shOf(runK[0]).axis;
      const blur = Math.max(...runK.map((k) => blurGain(F[k - 1], F[k], w, h, axis, shOf(k).d)));
      const whip = blur >= WHIP_BLUR || (cleared != null && span <= WHIP_S + 1e-9);
      // A push or whip-pan carries the picture its whole width (or height): the shift so far over
      // that extent is the transition's progress, even when the tail goes unseen.
      const extent = axis === 'x' ? w : h;
      let acc = 0;
      const samples = [[tStill, 0], ...runK.map((k) => { acc += Math.abs(shOf(k).d); return [k / fps, clamp(acc / extent, 0, 1)]; })];
      const gain = runK.reduce((s, k) => s + shOf(k).gain, 0) / runK.length;
      return { ...base, end: round(e / fps, 6), e, kind: whip ? 'whip-pan' : 'push', direction: dir, samples,
        confidence: round(clamp(gain * (nDir / runK.length), 0, 1)),
        evidence: `${runK.length} frame pair${runK.length > 1 ? 's' : ''} shifted ${dir}, mean error cut by ${Math.round(gain * 100)} %` +
          (whip ? (blur >= WHIP_BLUR ? `, blurred along the axis (${Math.round(blur * 100)} %)` : `, the picture cleared in ${round(span)} s`) : '') };
    }
  }

  // 3. Hard: the first pair replaces the picture, and what follows is not more of the old one.
  // A picture that goes flat in one pair was cut (a fade to flat takes two pairs or more).
  const rep0 = replacement(P, F[s0], w, h);
  const single = s0 === s1 || !(D[s0 + 1] > floor);
  if (rep0 >= REPLACE_MIN && (single || thin(s0) || shOf(s0).gain < 0.5)) {
    const content = contentCells(P, w, h);
    const c0 = contentChange(P, F[s0], w, h, content);
    const later = Math.max(...[1, 2].filter((j) => s0 + j <= s1).map((j) => contentChange(P, F[s0 + j], w, h, content)), 0);
    if (single || thin(s0) || c0 >= 0.6 * later) {
      return { ...base, t: round(s0 / fps, 6), end: round(s0 / fps, 6), e: s0, kind: 'hard', samples: null, confidence: round(clamp(rep0, 0, 1)),
        evidence: `one frame pair replaces ${Math.round(rep0 * 100)} % of the picture` };
    }
  }

  // 4. Zoom: pairs explained by growth of the picture about its centre.
  const zm = new Map();
  const zOf = (k) => { if (!zm.has(k)) zm.set(k, zoomOf(F[k - 1], F[k], w, h)); return zm.get(k); };
  const early = active.slice(0, 8).filter((k) => !thin(k) && !thin(k - 1));
  const zoomed = early.filter((k) => { const z = zOf(k); return z.gain >= ZOOM_GAIN && z.s >= ZOOM_MIN; });
  if (zoomed.length >= 2) {
    const tail = active.filter((k) => k <= s0 + Math.round(0.8 * fps) && !thin(k) && !thin(k - 1) && zOf(k).gain >= 0.25 && zOf(k).s >= 1.02);
    const e = Math.max(zoomed.at(-1), ...tail);
    return { ...base, end: round(e / fps, 6), e, kind: 'zoom', samples: null, confidence: round(clamp(median(zoomed.map((k) => zOf(k).gain)), 0, 1)),
      evidence: `${zoomed.length} frame pairs grow the picture about its centre (by ${Math.round((median(zoomed.map((k) => zOf(k).s)) - 1) * 100)} % a frame)` };
  }

  // 5. Dip: the picture fades to a flat colour and back.
  const firstFlat = pairs.find((k) => k > s0 && k - s0 <= Math.round(0.6 * fps) && flat(k));
  let pEnd = firstFlat;
  if (firstFlat != null) while (pEnd + 1 <= limit && flat(pEnd + 1)) pEnd++;
  // It is a dip when the picture comes back after a hold of 0.1 s or less (a color-dip holds a fifth
  // of its length); a picture that stays flat longer was faded into a shot that is still empty, and
  // what comes next is that shot's first arrival (a fade, below).
  if (firstFlat != null && !flat(s0) && pEnd + 1 <= limit && D[pEnd + 1] > floor && (pEnd - firstFlat + 1) / fps <= DIP_HOLD_S + 1e-9) {
    const cap = pEnd + Math.max(3, 2 * (firstFlat - s0 + 1));
    let e = pEnd + 1;
    while (e + 1 <= Math.min(limit, cap) && D[e + 1] > floor) e++;
    return { ...base, end: round(e / fps, 6), e, kind: 'dip', samples: null, flatAt: round((firstFlat - (s0 - 1)) / fps, 3), confidence: round(clamp(1 - stdOf(F[firstFlat]) / Math.max(1, spread), 0, 1)),
      evidence: `the picture fades to a flat colour in ${round((firstFlat - s0 + 1) / fps)} s, holds ${round((pEnd - firstFlat + 1) / fps)} s and comes back` };
  }

  // 6. Fade: intermediate frames are blends of the frames either side.
  const e = firstFlat != null && !flat(s0) ? firstFlat : active.length ? active.at(-1) : s0;
  const residual = blendResidual(F, s0, e, P, F[e]);
  if (residual <= BLEND_MAX) {
    return { ...base, end: round(e / fps, 6), e, kind: 'fade', samples: null, confidence: round(clamp(1 - residual / BLEND_MAX, 0, 1)),
      evidence: `${e - s0} intermediate frames are blends of the shots either side (residual ${Math.round(residual * 100)} % of the change)` };
  }
  return { ...base, end: round(e / fps, 6), e, kind: 'unclassified', samples: null, confidence: 0,
    evidence: `the picture was replaced over ${round((e - s0 + 1) / fps)} s, but no shift, strip, ring, growth, flat colour or blend explains it (blend residual ${Math.round(residual * 100)} %)` };
}

// ---------------------------------------------------------------------------------------------
// Entrance signatures: growth, shrink, travel and blur of a shot's first arrival.

export const FAMILIES = {
  'slam|punch': ['entrances/slam', 'entrances/punch'], 'rise|fade': ['entrances/rise', 'entrances/fade'],
  'blur-fade': ['entrances/blur-fade'], pop: ['entrances/pop'],
};

/**
 * Reads an arrival's signature on detail frames. Inside the box around its ink (what differs from
 * the frame before it, B), each frame part-way through (progress 0.02 to 0.7) is matched against the
 * settled ink (S − B) transformed: as it is (a fade), blurred, moved up or down, or scaled about the
 * ink's centre or left edge, each with its best opacity. The transform that explains the frame best
 * is that frame's read; the arrival's signature is the reads' majority with its median parameter.
 */
export function entranceSignature(detail, k0, k1, samples) {
  const { frames, w, h } = detail;
  const B = frames[k0], S = frames[k1];
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(S[y * w + x] - B[y * w + x]) > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 - x0 < 8 || y1 - y0 < 4) return null;
  const padX = Math.round((x1 - x0) * 0.3) + 6, padY = Math.round((y1 - y0) * 0.6) + 6;
  const R = { x0: Math.max(0, x0 - padX), x1: Math.min(w - 1, x1 + padX), y0: Math.max(0, y0 - padY), y1: Math.min(h - 1, y1 + padY) };
  const RW = R.x1 - R.x0 + 1, RH = R.y1 - R.y0 + 1;
  const diff = (F) => { const o = new Float64Array(RW * RH); for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) { const i = (y + R.y0) * w + x + R.x0; o[y * RW + x] = F[i] - B[i]; } return o; };
  const Y = diff(S);
  const at = (img, x, y) => (x < 0 || y < 0 || x > RW - 1 || y > RH - 1 ? 0 : img[y * RW + x]);
  const bil = (img, x, y) => {
    const xa = Math.floor(x), ya = Math.floor(y), fx = x - xa, fy = y - ya;
    return (at(img, xa, ya) * (1 - fx) + at(img, xa + 1, ya) * fx) * (1 - fy) + (at(img, xa, ya + 1) * (1 - fx) + at(img, xa + 1, ya + 1) * fx) * fy;
  };
  const map = (fn) => { const o = new Float64Array(RW * RH); for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) o[y * RW + x] = fn(x, y); return o; };
  const blur = (img, r) => map((x, y) => { let s = 0, n = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { s += at(img, x + dx, y + dy); n++; } return s / n; });
  const inkX0 = x0 - R.x0, inkX1 = x1 - R.x0, cyI = (y0 + y1) / 2 - R.y0;
  // Geometry is matched on low-passed ink, where a few per cent of growth degrades the match
  // gradually instead of missing every stroke; blur is then tested at full detail.
  const LOW = 3;
  const Ylow = blur(Y, LOW);
  const scaledOf = (img, sc, px) => map((x, y) => bil(img, px + (x - px) / sc, cyI + (y - cyI) / sc));
  const geoms = [{ model: 'fade', p: 0, T: (img) => img }];
  for (const d of [-12, -8, -6, -4, -3, -2, 2, 3, 4, 6, 8, 12]) geoms.push({ model: 'shift', p: d, T: (img) => map((x, y) => at(img, x, y - d)) });
  for (const sc of [0.9, 0.94, 0.97, 1.04, 1.08, 1.15, 1.25, 1.4]) {
    for (const px of [(inkX0 + inkX1) / 2, inkX0]) geoms.push({ model: 'scale', p: sc, T: (img) => scaledOf(img, sc, px) });
  }
  for (const g of geoms) g.low = g.T(Ylow);
  const fit = (X, img) => {
    let num = 0, den = 0, xs = 0;
    for (let i = 0; i < X.length; i++) { num += X[i] * img[i]; den += img[i] * img[i]; xs += Math.abs(X[i]); }
    const alpha = den > 0 ? num / den : 0;
    let r = 0; for (let i = 0; i < X.length; i++) r += Math.abs(X[i] - alpha * img[i]);
    return xs > 0 ? r / xs : 1;
  };
  const mids = samples.filter(([, p, k]) => p >= 0.02 && p <= 0.7 && k > k0 && k < k1).map(([, , k]) => k);
  const reads = [];
  for (const k of mids) {
    const X = diff(frames[k]);
    let xs = 0; for (const v of X) xs += Math.abs(v);
    if (xs < RW * RH * 0.5) continue;
    const Xlow = blur(X, LOW);
    let best = null, fadeRes = null;
    for (const g of geoms) {
      const res = fit(Xlow, g.low);
      if (g.model === 'fade') fadeRes = res;
      if (!best || res < best.res) best = { ...g, res };
    }
    // A move or growth must explain clearly more than a plain fade to count.
    if (best.model !== 'fade' && best.res > 0.85 * fadeRes) best = { ...geoms[0], res: fadeRes };
    const sharpRes = fit(X, Y);
    const blurGain = round(1 - Math.min(fit(X, blur(Y, 1)), fit(X, blur(Y, 2))) / sharpRes, 2);
    if (best.model === 'fade' && blurGain >= BLUR_GAIN) { reads.push({ model: 'blur', p: blurGain, k }); continue; }
    reads.push({ model: best.model, p: best.p, b: blurGain, k });
  }
  if (!reads.length) return null;
  return { frames: reads.length, reads };
}

// The family one read points to: landing from above or shrinking onto its place (slam, punch; a
// drop reads here too), rising from below or fading in place (rise, fade), blurring into focus
// (blur-fade), growing onto its place (pop).
const readFamily = (r) => (r.model === 'blur' ? 'blur-fade'
  : r.model === 'scale' ? (r.p > 1 ? 'slam|punch' : 'pop')
    : r.model === 'shift' ? (r.p < 0 ? 'slam|punch' : 'rise|fade') : 'rise|fade');

/** The entrance family a signature points to (its reads' majority), or null when none holds half. */
export function familyOf(sig) {
  if (!sig || sig.frames < 2) return null;
  const tally = new Map();
  for (const r of sig.reads) { const f = readFamily(r); tally.set(f, (tally.get(f) ?? 0) + 1); }
  const [fam, n] = [...tally.entries()].sort((x, y) => y[1] - x[1])[0];
  return n / sig.frames >= 0.5 ? fam : null;
}

// ---------------------------------------------------------------------------------------------
// Analysis

/**
 * Cuts, shots and arrival bursts of a film given as greyscale frames at its source rate.
 * @param {{frames: Uint8Array[], w: number, h: number, fps: number, detail?: object}} film
 */
export function analyse(film, { globalFps = GLOBAL_FPS } = {}) {
  const { frames: F, w, h, fps } = film;
  const N = F.length, duration = round(N / fps, 6);
  const step = Math.max(1, Math.round(fps / globalFps));
  const gfps = fps / step;

  // Source-rate differences (used around events) and the global pass on every step-th frame.
  const Ds = new Float64Array(N);
  for (let k = 1; k < N; k++) Ds[k] = meanAbs(F[k - 1], F[k]);
  const floorS = activityFloor(Ds);
  const G = Math.floor((N - 1) / step) + 1;
  const Dg = new Float64Array(G);
  for (let g = 1; g < G; g++) Dg[g] = meanAbs(F[(g - 1) * step], F[g * step]);
  const floor = activityFloor(Dg);

  const runs = [];
  for (let g = 1; g < G; g++) {
    if (Dg[g] <= floor) continue;
    const last = runs.at(-1);
    if (last && g - last[1] <= 2) last[1] = g; else runs.push([g, g]);
  }

  const cuts = [], arrivals = [];
  const coarse = new Map();
  const coarseOf = (k) => { if (!coarse.has(k)) coarse.set(k, boxDown(F[k], w, h, COARSE)); return coarse.get(k); };

  // Active stretches of source pairs in (lo, hi], one still pair bridged.
  const stretches = (lo, hi) => {
    const out = [];
    for (let k = lo + 1; k <= hi; k++) {
      if (Ds[k] <= floorS) continue;
      const last = out.at(-1);
      if (last && k - last[1] <= 2) last[1] = k; else out.push([k, k]);
    }
    return out;
  };

  // Mean |a − b| over the pixels (or coarse boxes) a mask selects.
  const maskedAbs = (a, b, m) => { let s = 0, n = 0; for (let i = 0; i < a.length; i++) if (m[i]) { s += Math.abs(a[i] - b[i]); n++; } return n ? s / n : 0; };
  const { cx: ncx } = cellGrid(w, h);
  const cellMaskToPixels = (cells) => {
    const m = new Uint8Array(w * h);
    for (let i = 0; i < cells.length; i++) if (cells[i]) { const ci = i % ncx, cj = Math.floor(i / ncx); for (let y = cj * CELL; y < (cj + 1) * CELL; y++) for (let x = ci * CELL; x < (ci + 1) * CELL; x++) m[y * w + x] = 1; }
    return m;
  };
  const coarseMask = (m) => { const W = Math.floor(w / COARSE), H = Math.floor(h / COARSE), out = new Uint8Array(W * H); for (let y = 0; y < H * COARSE; y++) for (let x = 0; x < W * COARSE; x++) if (m[y * w + x]) out[Math.floor(y / COARSE) * W + Math.floor(x / COARSE)] = 1; return out; };
  const lowChanged = (a, b) => {
    const { cx, cy } = cellGrid(w, h), out = new Uint8Array(cx * cy);
    for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
      let s = 0;
      for (let y = j * CELL; y < (j + 1) * CELL; y++) for (let x = i * CELL; x < (i + 1) * CELL; x++) s += Math.abs(a[y * w + x] - b[y * w + x]);
      out[j * cx + i] = s / (CELL * CELL) > 2 ? 1 : 0;
    }
    return out;
  };

  // One arrival from pair a to pair b, its progress read on `region` (a cell mask) when given.
  const arrival = (a, b, region = null) => {
    const P = F[a - 1], Q = F[b], span = meanAbs(P, Q);
    if (span < ARRIVAL_MIN) return;
    // Progress = 1 − distance to the settled frame, read on a coarse grid where a small
    // displacement is a change of brightness rather than text failing to overlap its final place.
    const lo = Math.max(0, a - 1), hi = Math.min(N - 1, b + 1), samples = [];
    const pm = region ? cellMaskToPixels(region) : null, cm = pm ? coarseMask(pm) : null;
    const dist = (x, y, fine) => (pm ? maskedAbs(x, y, fine ? pm : cm) : meanAbs(x, y));
    // A change too small to survive the grid is read at full analysis resolution instead.
    const fine = !(dist(coarseOf(a - 1), coarseOf(b), false) >= 0.01);
    const grid = fine ? (k) => F[k] : coarseOf;
    const cQ = grid(b), cSpan = dist(grid(a - 1), cQ, fine);
    if (!(cSpan > 0)) return;
    for (let k = lo; k <= hi; k++) samples.push([round(k / fps, 6), clamp(1 - dist(grid(k), cQ, fine) / cSpan, 0, 1), k]);
    arrivals.push({ t: round((a - 1) / fps, 6), end: round(b / fps, 6), burst: round((b - a + 1) / fps, 3),
      span: round(span, 3), samples, stillT: round((a - 1) / fps, 6), frameS: 1 / fps, k0: a - 1, k1: b });
  };

  // An active stretch that is not a cut: one arrival, or several when a new region starts to change
  // at least 0.15 s after the last onset (its changed cells mostly outside the recently changed ones).
  const arrivalsIn = (a, b) => {
    const minGap = Math.max(2, Math.round(0.15 * fps));
    const onsets = [a], recent = [], sets = [];
    for (let k = a; k <= b; k++) {
      const ch = lowChanged(F[k - 1], F[k]);
      if (k - onsets.at(-1) >= minGap) {
        let fresh = 0, tot = 0;
        for (let i = 0; i < ch.length; i++) if (ch[i]) { tot++; if (!recent.some((r) => r[i])) fresh++; }
        if (fresh >= 3 && fresh >= 0.5 * tot) onsets.push(k);
      }
      sets.push(ch); recent.push(ch); if (recent.length > 3) recent.shift();
    }
    if (onsets.length === 1) return arrival(a, b);
    onsets.forEach((o, i) => {
      const next = onsets[i + 1] ?? b + 1;
      const region = new Uint8Array(sets[0].length);
      for (let k = o; k < next; k++) { const s = sets[k - a]; for (let j = 0; j < s.length; j++) if (s[j]) region[j] = 1; }
      arrival(o, b, region);
    });
  };

  for (const [ga, gb] of runs) {
    const lo = (ga - 1) * step, hi = Math.min(N - 1, gb * step + step - 1);
    let cursor = lo, last = null;
    for (;;) {
      const [st] = stretches(cursor, hi);
      if (!st) break;
      const [a, b] = st;
      // What moves after a cut's last transition frame (within the refractory window) arrives in
      // the new shot. An arrival that runs on straight out of a gradual transition began under it,
      // so only its tail is seen.
      const afterCut = last && (a - last.e) / fps < REFRACTORY_S;
      if (afterCut || replacement(F[a - 1], F[b], w, h) < REPLACE_MIN) {
        const n = arrivals.length;
        arrivalsIn(a, b);
        if (afterCut && last.kind !== 'hard' && a <= last.e + 2 && arrivals[n]) arrivals[n].underCut = true;
        cursor = b;
        continue;
      }
      last = classifyCut(F, w, h, fps, Ds, floorS, a, b, hi);
      cuts.push({ ...last, replaced: round(replacement(F[a - 1], F[b], w, h)) });
      cursor = last.e;
    }
  }

  // Refractory window: a cut within 0.4 s of the previous one is part of it.
  cuts.sort((x, y) => x.t - y.t);
  const merged = [];
  for (const c of cuts) {
    const prev = merged.at(-1);
    if (prev && c.t - prev.t < REFRACTORY_S) { prev.end = Math.max(prev.end, c.end); prev.e = Math.max(prev.e, c.e); } else merged.push(c);
  }
  // Arrivals inside a cut's span belong to the cut.
  const inCut = (x) => merged.some((c) => x.t >= c.t - 1e-9 && x.t < c.end - 1e-9);
  const arr = arrivals.filter((x) => !inCut(x)).sort((x, y) => x.t - y.t);

  const bounds = [0, ...merged.map((c) => c.t), duration];
  const shots = bounds.slice(0, -1).map((s, i) => ({
    start: round(s, 3), end: round(bounds[i + 1], 3), length: round(bounds[i + 1] - s, 3), cut: i === 0 ? null : merged[i - 1],
  }));

  // The headline entrance: the first arrival of each shot that starts within 1.5 s of the shot,
  // unless it began under the transition into the shot. A film whose frame 0 already holds half the
  // content its first arrival settles into opened finished (an instant hook, measured against the
  // empty canvas a film starts from): what arrives in its first shot is added to a finished
  // picture, so that shot has no headline entrance to read.
  const detail = film.detail ?? { frames: F, w, h };
  for (const s of shots) {
    const first = arr.find((a) => a.t >= s.start - 1e-9 && a.t < Math.min(s.end, s.start + 1.5 + (s.cut ? s.cut.end - s.cut.t : 0)));
    if (!first || first.underCut) continue;
    if (!s.cut) {
      const held = heldBefore(F[0], F[first.k1], w, h);
      if (held >= FINISHED_MIN) { s.openedFinished = round(held); first.inFinishedShot = true; continue; }
    }
    first.headline = true;
    first.signature = entranceSignature(detail, first.k0, first.k1, first.samples);
    first.family = familyOf(first.signature);
  }
  return { fps, globalFps: gfps, frames: N, duration, floor: round(floor, 4), cuts: merged, shots, arrivals: arr };
}

// ---------------------------------------------------------------------------------------------
// Energy: measured quantities scored against anchors calibrated on labelled films.

// The median arrival burst is not a feature: on the golden films it parted the energies by noise
// (2 ms between medium and high) and failed leave-one-out on tempo-b-calm.
export const ENERGY_FEATURES = ['shotMedianS', 'arrivalsPer10s', 'hardShare', 'cutBurstS'];
// Timed cuts are measured for energy under one fixed ease-in-out, so the feature does not depend on
// the preset that energy will choose.
const REFERENCE_MOVE = 'cubic-bezier(0.65, 0, 0.35, 1)';

/** The measured quantities energy is read from (null where the film gives none). */
export function energyFeatures(analysis) {
  const { shots, cuts, arrivals, duration } = analysis;
  const gradual = cuts.filter((c) => c.kind !== 'hard');
  const timed = cuts.filter((c) => c.samples && c.samples.length >= 2);
  return {
    shotMedianS: shots.length > 1 ? round(median(shots.map((s) => s.length)), 3) : null,
    arrivalsPer10s: round((arrivals.length * 10) / duration, 3),
    hardShare: cuts.length ? round(cuts.filter((c) => c.kind === 'hard').length / cuts.length, 3) : null,
    cutBurstS: timed.length ? round(median(timed.map((c) => fitArrival({ samples: c.samples, stillT: c.t, frameS: 1 / analysis.fps }, REFERENCE_MOVE).d)), 3) : null,
    gradualCuts: gradual.length,
  };
}

const ENERGIES = ['calm', 'medium', 'high'];

/**
 * Bands from labelled films. For each feature: the median of each energy's films (calm, medium,
 * high) and the spread within the energies (median absolute deviation, averaged, at least 5 % of
 * the calm-to-high distance). Between two neighbouring energies the band edge is the midpoint of
 * their medians, and the feature's weight there is the distance between the medians over the
 * spread, or 0 when that is below 1. A feature whose medians are out of order, or that some energy
 * never shows, weighs 0: it does not tell energies apart on these films.
 * @param {{energy: string, features: object}[]} labelled
 */
export function calibrateEnergy(labelled) {
  const anchors = {}, spreads = {}, weights = {};
  for (const f of ENERGY_FEATURES) {
    const by = ENERGIES.map((e) => labelled.filter((l) => l.energy === e && l.features[f] != null).map((l) => l.features[f]));
    if (by.some((xs) => !xs.length)) { weights[f] = [0, 0]; continue; }
    const m = by.map(median);
    const rising = m[2] >= m[0];
    const ordered = rising ? m[0] <= m[1] && m[1] <= m[2] : m[0] >= m[1] && m[1] >= m[2];
    const gap = Math.abs(m[2] - m[0]);
    const within = by.map((xs, i) => median(xs.map((x) => Math.abs(x - m[i])))).reduce((a, b) => a + b, 0) / 3;
    anchors[f] = m.map((x) => round(x, 3));
    spreads[f] = round(Math.max(within, 0.05 * gap, 1e-3), 3);
    // An edge the feature crosses by less than its own spread is noise there: weight 0.
    weights[f] = [0, 1].map((i) => { const w = ordered && gap > 0 ? Math.abs(m[i + 1] - m[i]) / spreads[f] : 0; return w >= 1 ? round(w, 2) : 0; });
  }
  return { anchors, spreads, weights };
}

// The calibration shipped with the tool: calibrateEnergy over the eight labelled films
// (the two golden films, final cut, and tempo-a/tempo-b under calm, premium and kinetic):
// calibrateEnergy over their energyFeatures. tests/capture/motion-labelled.test.mjs checks that it
// matches that calibration and that every film keeps its energy when it is left out of it.
export const ENERGY_CALIBRATION = {
  anchors: { shotMedianS: [3.75, 4, 3.75], arrivalsPer10s: [6.522, 6.018, 6.957], hardShare: [0, 0, 0.5], cutBurstS: [0.465, 0.418, 0.261] },
  spreads: { shotMedianS: 0.367, arrivalsPer10s: 0.451, hardShare: 0.025, cutBurstS: 0.01 },
  weights: { shotMedianS: [0, 0], arrivalsPer10s: [0, 0], hardShare: [0, 20], cutBurstS: [4.7, 15.7] },
};

/**
 * Energy from measured features and a calibration. At each band edge (calm|medium, medium|high)
 * every feature votes from −1 to 1 by where it lies between the two energies' medians, weighted as
 * calibrated; the film is past an edge when the weighted votes there are positive. Returns the
 * energy, each edge's weighted vote and each feature's votes (null when absent).
 */
export function energyFrom(features, calibration = ENERGY_CALIBRATION) {
  const votes = {}, edges = [0, 0], wsum = [0, 0];
  for (const f of ENERGY_FEATURES) {
    const x = features[f], m = calibration.anchors[f], wts = calibration.weights[f] ?? [0, 0];
    if (x == null || !m) { votes[f] = null; continue; }
    votes[f] = [0, 1].map((i) => {
      const lo = m[i], hi = m[i + 1];
      if (hi === lo) return 0;
      const v = clamp((x - (lo + hi) / 2) / (Math.abs(hi - lo) / 2), -1, 1) * Math.sign(hi - lo);
      edges[i] += wts[i] * v; wsum[i] += wts[i];
      return round(v);
    });
  }
  // Past the medium|high edge is high; below it, calm or medium by the calm|medium edge, and
  // medium when no measured feature weighs there (the two cannot be told apart on this film).
  const measured = wsum.map((x) => x > 0);
  const level = measured[1] && edges[1] > 0 ? 2 : !measured[0] ? 1 : edges[0] > 0 ? 1 : 0;
  return { energy: ENERGIES[level], edges: edges.map((e, i) => round(wsum[i] ? e / wsum[i] : 0)), votes, measured };
}

/** Energy from whatever measured features are given (the others absent). */
export function energyOf(features) { return energyFrom(features).energy; }

// ---------------------------------------------------------------------------------------------
// Derivation

// Fits onset t0 and duration d of p(t) = E((t − t0)/d) to progress samples. When at least three
// samples fall between 10 % and 90 % progress, only those are fitted and the onset is free (from a
// frame before the last still frame to the first of them): the start of a spring or of an entrance
// that jumps in opacity, and the codec-eaten tail, follow no easing. Otherwise the onset is searched
// within the frame interval before the first changed frame and pulled gently towards the last
// still frame, which the samples of a short change cannot place on their own.
export function fitArrival(arr, easing, springParams = null) {
  const ds = [];
  for (let i = 0; i <= 400; i++) ds.push(0.04 * (4 / 0.04) ** (i / 400));
  const mid = arr.samples.filter(([, p]) => p >= 0.1 && p <= 0.9);
  let t0s, samples, prior;
  if (mid.length >= 3) {
    t0s = [];
    for (let t = arr.stillT - arr.frameS; t <= mid[0][0] + 1e-9; t += arr.frameS / 10) t0s.push(t);
    samples = mid; prior = 0;
  } else {
    t0s = [];
    for (let i = 0; i < 20; i++) t0s.push(arr.stillT + (i / 20) * arr.frameS);
    // A codec drops the last few per cent of a faint ease-out, so samples past 95 % are left out
    // whenever at least two samples inside the motion remain to fit.
    const inside = arr.samples.filter(([, p]) => p > 0 && p <= 0.95);
    samples = inside.length >= 2 ? arr.samples.filter(([, p]) => p <= 0.95) : arr.samples;
    prior = 2e-3;
  }
  const fitWith = (E) => {
    let best = { cost: Infinity, t0: arr.stillT, d: arr.frameS };
    for (const t0 of t0s) for (const d of ds) {
      let c = 0;
      for (const [tk, pk] of samples) { const e = E((tk - t0) / d) - pk; c += e * e; }
      c += prior * ((t0 - arr.stillT) / arr.frameS) ** 2;
      if (c < best.cost) best = { cost: c, t0, d };
    }
    return best;
  };
  let best = { ...fitWith(parseEasing(easing)), shape: 'ease' };
  // A spring-timed entrance (its duration is the spring's settle, not a role) has a slow start the
  // ease-out cannot follow; with enough samples the preset's text spring is tried too, and wins
  // only when it fits clearly better.
  if (springParams && mid.length >= 3) {
    const T = spring.settle(springParams);
    const S = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : spring(x * T, springParams));
    const sb = fitWith(S);
    if (sb.cost < 0.6 * best.cost) best = { ...sb, shape: 'spring' };
  }
  return { t0: round(best.t0, 3), d: round(best.d, 3), shape: best.shape };
}

// Names timed changes as duration roles. Each role of the preset owns a basin, from the geometric
// mean with the role below to the geometric mean with the role above (quick from 1/1.6 of itself,
// slow up to 1.6×); a role's value is the median of the arrivals in its basin together with the
// cuts whose pattern takes that role (a push, wipe or iris takes standard, a whip-pan quick: the
// kit's own grammar). A change outside every basin is left unnamed (a spring's long settle, two
// overlapping arrivals read as one).
function durationRoles(arrivalDs, cutDs, preset) {
  const roles = ['quick', 'standard', 'slow'];
  const pre = roles.map((r) => preset.motion.durations[r] / 1000);
  const edges = [pre[0] / 1.6, Math.sqrt(pre[0] * pre[1]), Math.sqrt(pre[1] * pre[2]), pre[2] * 1.6];
  const basin = (d) => roles.findIndex((_, i) => d >= edges[i] && d < edges[i + 1]);
  const pools = roles.map(() => []), unnamed = [];
  for (const d of arrivalDs) { const i = basin(d); if (i >= 0) pools[i].push(d); else unnamed.push(Math.round(d * 1000)); }
  for (const { d, role } of cutDs) pools[roles.indexOf(role)].push(d);
  const observed = {};
  pools.forEach((xs, i) => { if (xs.length) observed[roles[i]] = { ms: Math.round(median(xs) * 1000), n: xs.length }; });
  return { observed, unnamed };
}

function band(onsets, duration) {
  if (duration <= 10) { const r = (onsets.length * 10) / duration; return { lo: r, hi: r, rate: r }; }
  let lo = Infinity, hi = -Infinity;
  for (let s = 0; s + 10 <= duration + 1e-9; s += 1) {
    const n = onsets.filter((x) => x >= s && x < s + 10).length;
    lo = Math.min(lo, n); hi = Math.max(hi, n);
  }
  return { lo, hi, rate: (onsets.length * 10) / duration };
}

const readPreset = (energy) => JSON.parse(readFileSync(join(ROOT, 'styles/motion', `${PRESET_OF[energy]}.json`), 'utf8'));
const kindLabel = (c) => (c.direction ? `${c.kind} (${c.direction})` : c.kind);

/** Builds the motion half and the notes' facts from an analysis. */
export function deriveMotion(analysis, { name, source, calibration = ENERGY_CALIBRATION }) {
  const { shots, cuts, arrivals, duration } = analysis;
  const defaulted = [], gaps = [], derived = [];
  const features = energyFeatures(analysis);
  const en = energyFrom(features, calibration);
  const energy = en.energy;
  const presetName = PRESET_OF[energy];
  const preset = readPreset(energy);
  const fmt = (f, unit) => (features[f] == null ? 'not measured' : `${features[f]}${unit}`);
  const parts = [
    `median shot ${fmt('shotMedianS', ' s')}`, `${fmt('arrivalsPer10s', '')} arrivals per 10 s`,
    `hard-cut share ${fmt('hardShare', '')}`, `median timed cut ${fmt('cutBurstS', ' s')} (push, whip-pan, wipe, iris under a reference ease-in-out)`,
  ].map((p, i) => { const f = ENERGY_FEATURES[i]; const w = calibration.weights[f] ?? [0, 0]; const v = en.votes[f]; return `${p} (votes ${v ? v.join(' / ') : '-'}, weights ${w.join(' / ')})`; });
  if (en.measured[0] || en.measured[1]) derived.push(`pacing.energy: **${energy}**: weighted votes ${en.edges[0]} at the calm|medium edge and ${en.edges[1]} at the medium|high edge (positive = past the edge) from ${parts.join('; ')}. Bands are calibrated on labelled films; a weight of 0 means the feature did not part those energies there`);
  else defaulted.push(`pacing.energy: medium (no calibrated feature could be measured on this film)`);
  if (energy !== 'high' && !en.measured[0]) defaulted.push('pacing.energy: calm and medium could not be told apart (no measured feature weighs at that edge on this film: it needs a push, whip-pan, wipe or iris to time); medium kept');

  // Arrivals: durations under the preset's enter easing; push, whip-pan, wipe and iris cuts under
  // its move easing (the role their pattern takes).
  const fitted = arrivals.map((a) => ({ ...a, ...fitArrival(a, preset.motion.easings.enter, preset.motion.spring.type) }));
  const b = band(fitted.map((a) => a.t0), duration);
  let lo = Math.floor(b.lo), hi = Math.ceil(b.hi);
  if (hi <= lo) { lo = Math.max(0, lo - 1); hi += 1; }
  const arrivalsPer10s = [clamp(lo, 0, 20), clamp(hi, 0, 20)];
  derived.push(`pacing.arrivalsPer10s: [${arrivalsPer10s}] from ${fitted.length} arrivals over ${round(duration, 1)} s (${duration > 10 ? 'min and max over 10 s windows' : 'one window, scaled to 10 s'})`);
  const timedCuts = cuts.filter((c) => c.samples && c.samples.length >= 2).map((c) => ({ ...c, ...fitArrival({ samples: c.samples, stillT: c.t, frameS: 1 / analysis.fps }, preset.motion.easings.move) }));

  // Duration roles: arrivals and timed cuts grouped; a group's role named by closeness to the preset.
  const durations = { ...preset.motion.durations };
  // An arrival shorter than three source frames is not timed well enough to name a role.
  const timedArrivals = fitted.filter((a) => a.burst >= 3 / analysis.fps - 1e-9);
  const { observed, unnamed } = durationRoles(timedArrivals.map((a) => a.d), timedCuts.map((c) => ({ d: c.d, role: KIND_ROLE[c.kind] ?? 'standard' })), preset);
  const obsRoles = Object.keys(observed);
  if (unnamed.length) derived.push(`arrivals not named as a role (outside every ${presetName} role's basin): ${unnamed.join(', ')} ms`);
  if (obsRoles.length) {
    const scale = Math.exp(obsRoles.reduce((s, r) => s + Math.log(observed[r].ms / preset.motion.durations[r]), 0) / obsRoles.length);
    for (const r of ['quick', 'standard', 'slow']) {
      if (observed[r]) { durations[r] = observed[r].ms; derived.push(`motion.durations.${r}: ${observed[r].ms} ms, median of ${observed[r].n} timed change${observed[r].n > 1 ? 's' : ''} in its basin (arrivals, and cuts whose pattern takes ${r})`); }
      else { durations[r] = Math.round(preset.motion.durations[r] * scale); defaulted.push(`motion.durations.${r}: no change of that length observed; the ${presetName} value scaled by the observed ratio ${round(scale)} (${durations[r]} ms)`); }
    }
  } else {
    defaulted.push(`motion.durations.quick/standard/slow: no arrivals observed; the ${presetName} values`);
  }
  if (timedCuts.length) derived.push(`cut timing (move easing): ${timedCuts.map((c) => `${kindLabel(c)} at ${c.t} s, ${Math.round(c.d * 1000)} ms (its pattern takes ${KIND_ROLE[c.kind] ?? 'standard'})`).join('; ')}`);
  // Rests: from the settle of the last arrival in a shot to the shot's end.
  const rests = [];
  for (const s of shots) {
    const inShot = fitted.filter((a) => a.t0 >= s.start - 1e-9 && a.t0 < s.end);
    if (!inShot.length) continue;
    const settle = Math.max(...inShot.map((a) => a.t0 + a.d), s.cut ? s.cut.end : s.start);
    if (s.end > settle) rests.push(s.end - settle);
  }
  let holdMinS = preset.pacing.holdMinS;
  if (rests.length) {
    durations.hold = Math.round(median(rests) * 1000);
    holdMinS = round(clamp(Math.min(...rests), 0.3, 4), 1);
    derived.push(`motion.durations.hold: ${durations.hold} ms, median of ${rests.length} rests (settle of a shot's last arrival to its end: ${rests.map((r) => round(r)).join(', ')} s). The film's rests are set by its story; the style's hold is a floor they stay above`);
    derived.push(`pacing.holdMinS: ${holdMinS} s, the shortest rest (SPEC §3: the floor W-HOLD reads is a rest, so the shortest shot, ${round(Math.min(...shots.map((s) => s.length)))} s, is reported but not used)`);
  } else {
    defaulted.push(`motion.durations.hold and pacing.holdMinS: no rest measured; the ${presetName} values`);
  }
  const lim = { quick: [60, 600], standard: [150, 1200], slow: [300, 3000], hold: [500, 6000] };
  for (const r of Object.keys(lim)) durations[r] = clamp(Math.round(durations[r]), ...lim[r]);
  if (!(durations.quick < durations.standard && durations.standard < durations.slow)) {
    defaulted.push(`motion.durations: measured roles were out of order (${durations.quick}/${durations.standard}/${durations.slow} ms); the ${presetName} values kept`);
    Object.assign(durations, { quick: preset.motion.durations.quick, standard: preset.motion.durations.standard, slow: preset.motion.durations.slow });
  }

  // Transitions by narrative position.
  const transitions = { ...preset.transitions };
  const kinds = cuts.filter((c) => KIND_REF[c.kind]);
  if (!cuts.length) {
    gaps.push(NO_CUTS_GAP);
    defaulted.push(`transitions: all positions are the ${presetName} defaults (no cuts observed)`);
  } else if (!kinds.length) {
    gaps.push('Named gap: cuts observed but none classified; transition preferences not captured');
    defaulted.push(`transitions: all positions are the ${presetName} defaults (no cut kind classified)`);
  } else {
    transitions.opening = KIND_REF[kinds[0].kind];
    derived.push(`transitions.opening: ${transitions.opening} (first cut, ${kinds[0].t} s)`);
    transitions.outro = KIND_REF[kinds.at(-1).kind];
    derived.push(`transitions.outro: ${transitions.outro} (last cut, ${kinds.at(-1).t} s)`);
    const count = new Map();
    for (const c of kinds) count.set(c.kind, (count.get(c.kind) ?? 0) + 1);
    const ranked = [...count.entries()].sort((x, y) => y[1] - x[1]); // stable: ties keep first appearance
    transitions.topic = KIND_REF[ranked[0][0]];
    derived.push(`transitions.topic: ${transitions.topic} (most common kind, ${ranked[0][1]} of ${kinds.length})`);
    if (ranked[1]) { transitions.related = KIND_REF[ranked[1][0]]; derived.push(`transitions.related: ${transitions.related} (second most common kind, ${ranked[1][1]} of ${kinds.length})`); }
    else defaulted.push(`transitions.related: only one cut kind observed; the ${presetName} default (${transitions.related})`);
    const late = shots.filter((s) => s.cut && s.start >= (2 * duration) / 3 - 1e-9 && KIND_REF[s.cut.kind]);
    if (late.length) {
      const longest = late.reduce((m, s) => (s.length > m.length ? s : m));
      transitions.climax = KIND_REF[longest.cut.kind];
      derived.push(`transitions.climax: ${transitions.climax} (the cut at ${longest.start} s opens the longest shot in the last third, ${longest.length} s)`);
    } else defaulted.push(`transitions.climax: no classified cut in the last third; the ${presetName} default (${transitions.climax})`);
    const unc = cuts.length - kinds.length;
    if (unc) defaulted.push(`${unc} cut${unc > 1 ? 's' : ''} left unclassified and not used for preferences`);
    if (kinds.some((c) => c.kind === 'dip')) derived.push('a dip is a fade through a flat colour: a color-dip, or a crossfade between two shots that both carry text under the owns-exit policy, which the kit draws through the canvas (patterns/transitions/crossfade); the two differ by a tenth of the transition and are reported as one kind');
  }
  defaulted.push(`transitions.policy: ${transitions.policy} (whether a cut owns the exit is not measurable from frames)`);

  // The headline entrance family, from the first arrival of each shot.
  const entrances = structuredClone(preset.entrances);
  const reads = arrivals.filter((a) => a.headline);
  const fams = reads.map((a) => a.family).filter(Boolean);
  const tally = new Map();
  for (const f of fams) tally.set(f, (tally.get(f) ?? 0) + 1);
  const [topFam, topN] = [...tally.entries()].sort((x, y) => y[1] - x[1])[0] ?? [null, 0];
  const finished = shots[0]?.openedFinished;
  const finText = finished != null ? `; shot 1 left out: the film opens finished (frame 0 already holds ${Math.round(finished * 100)} % of the content its first arrival settles into, as an instant hook does), so it has no headline entrance to read` : '';
  const sigText = reads.map((a) => `${round(a.t)} s: ${a.family ?? 'not distinguishable'}${a.signature ? ` (${a.signature.reads.map((r) => (r.model === 'fade' ? 'fade' : `${r.model} ${r.p}`)).join(', ')})` : ''}`).join('; ');
  if (topFam && topN / reads.length >= 0.75) {
    const members = FAMILIES[topFam];
    entrances.headline = members.includes(preset.entrances.headline) ? preset.entrances.headline : members[0];
    derived.push(`entrances.headline: ${entrances.headline}, family ${topFam} (${topN} of ${reads.length} shot openings: ${sigText}${finText}). Inside a family the members are not distinguishable at this resolution; the ${presetName} member is used when it is one, else the first`);
  } else {
    defaulted.push(`entrances.headline: not distinguishable (${reads.length ? `no family holds three quarters of the ${reads.length} shot openings read: ${sigText}` : 'no shot opens with an arrival'}${finText}); the ${presetName} default (${entrances.headline})`);
  }
  defaulted.push(`entrances.body, figure, plate: ${presetName} (only the headline family is read from frames)`);

  defaulted.push(`motion.easings: ${presetName} (curves are not measurable from frames; the enter and move curves were assumed to fit the durations)`);
  defaulted.push(`motion.spring: ${presetName} (spring constants are not measurable from frames)`);
  defaulted.push(`motion.travel, overshootMax, exitRatio, stagger: ${presetName} (not measured)`);
  defaulted.push(`sound: ${presetName} (frames only; the audio track is not read)`);

  const motion = {
    name, version: 1, source,
    motion: { ...structuredClone(preset.motion), durations },
    sound: structuredClone(preset.sound),
    transitions,
    entrances,
    pacing: { holdMinS, arrivalsPer10s, energy },
  };
  return { motion, facts: { energy, presetName, features, energyScore: en, derived, defaulted, gaps, arrivals: fitted, timedCuts, rests } };
}

// ---------------------------------------------------------------------------------------------
// Notes

export function renderNotes({ name, video, analysis, facts }) {
  const L = [];
  L.push(`# Motion capture notes: ${name}`, '');
  L.push(`Measured from \`${basename(video)}\`: ${analysis.frames} frames at ${round(analysis.fps)} fps (${analysis.duration} s), greyscale at ${ANALYSIS_WIDTH} px wide (entrance signatures at ${DETAIL_WIDTH} px); candidate events found at ${round(analysis.globalFps)} fps and read again at ${round(analysis.fps)} fps.`);
  L.push('Grammar only, never content (H-REF): no text, colour or image of the reference is kept. Capture is best effort; the director approves the composed style before use (SPEC §13).', '');
  L.push('## Shot list', '');
  L.push('| # | start (s) | end (s) | length (s) | cut in | transition (s) | confidence | evidence |');
  L.push('|---|---|---|---|---|---|---|---|');
  analysis.shots.forEach((s, i) => {
    const c = s.cut;
    L.push(`| ${i + 1} | ${s.start.toFixed(2)} | ${s.end.toFixed(2)} | ${s.length.toFixed(2)} | ${c ? kindLabel(c) : 'film start'} | ${c ? round(c.end - c.t).toFixed(2) : '-'} | ${c ? c.confidence.toFixed(2) : '-'} | ${c ? c.evidence : '-'} |`);
  });
  L.push('', 'A gradual cut starts at the last frame before the picture begins to change; a hard cut at its first new frame. The transition column is the visible change; the eased tails of a cut are timed under "cut timing" below.', '');
  L.push('## Arrivals', '');
  if (!facts.arrivals.length) L.push('- none observed');
  for (const a of facts.arrivals) L.push(`- onset ${a.t0.toFixed(2)} s, about ${Math.round(a.d * 1000)} ms (visible burst ${a.burst} s, picture change ${a.span} grey levels)${a.headline ? `, opens its shot: ${a.family ?? 'family not distinguishable'}` : ''}${a.inFinishedShot ? ', added to a film that opens finished: no headline entrance read' : ''}`);
  L.push('');
  L.push('## Derived', '');
  for (const d of facts.derived) L.push(`- ${d}`);
  L.push('');
  L.push(`## Defaulted (from styles/motion/${facts.presetName}.json, the ${facts.energy} preset)`, '');
  for (const d of facts.defaulted) L.push(`- ${d}`);
  L.push('');
  if (facts.gaps.length) {
    L.push('## Named gaps', '');
    for (const g of facts.gaps) L.push(`- ${g}`);
    L.push('');
  }
  L.push('## Limits', '');
  L.push(`- Cuts are read at ${round(analysis.fps)} fps: a transition shorter than two source frames (${round(2 / analysis.fps)} s) reads as a hard cut, and a push that clears the picture within ${WHIP_S} s reads as a whip-pan.`);
  L.push(`- A fade to a flat colour that comes back within ${DIP_HOLD_S} s is a dip; one that stays flat longer is a fade into a shot that is still empty. A crossfade between two shots that both carry text (owns-exit) is drawn through the canvas like a color-dip, so the two can trade names.`);
  L.push('- Arrivals that start within 0.15 s of each other, or in the region that is already moving, count as one; an arrival during a transition belongs to the cut, and one that runs on out of a gradual transition shows only its tail (its entrance is not read).');
  L.push('- A camera move that shifts the whole picture reads as a push. Fine grain or noise raises the activity floor and can hide small arrivals.');
  L.push('- Entrance families: slam or punch (lands from above or shrinks onto its place; a drop reads here too), rise or fade (rises from below or fades in place), blur-fade, pop (grows onto its place). Members of one family are not told apart, nor are body, figure and plate entrances; a family must hold three quarters of the shot openings read. A film that opens finished (frame 0 already holds half the content its first arrival settles into, as an instant hook does) has no headline entrance in its first shot, which is left out.');
  L.push('- A spring-driven arrival (a plate dropped on a spring and stopped at its first crossing) can land in a duration role\'s basin and pull that derived role, although the kit times it by its spring, not by the role.');
  L.push('- Durations assume the preset\'s enter and move curves (a spring-shaped arrival is tried against its text spring); a duration role takes the arrivals in its basin and the cuts whose pattern takes it. The hold the style sets is a floor; the rests measured are the story\'s.');
  L.push('- Thresholds are provisional (SPEC §12): activity floor median + 6·MAD, a cut replaces half the content cells, 0.4 s refractory window; energy anchors are calibrated on eight labelled films.');
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------------------------------------
// Entry points

function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  return ajv.compile(JSON.parse(readFileSync(join(ROOT, 'contracts/motion.schema.json'), 'utf8')));
}

export const notesPathFor = (out) => out.replace(/\.json$/i, '') + '.capture-notes.md';

/** Captures a motion half from `from` and writes `out` and its capture notes. */
export async function captureMotion({ from, name, out, fps = null }) {
  if (!from || !existsSync(from)) throw Object.assign(new Error(`reference film not found: ${from}`), { setup: true });
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(name ?? '')) throw Object.assign(new Error(`--name must match ^[a-z][a-z0-9-]{1,40}$ (got ${name})`), { setup: true });
  const film = await extractFrames(from, { fps });
  if (film.frames.length < 3) throw Object.assign(new Error(`${from}: fewer than three frames decoded`), { setup: true });
  const analysis = analyse(film);
  const source = `motion capture of ${basename(from)} (${analysis.frames} frames at ${round(film.fps)} fps)`;
  const { motion, facts } = deriveMotion(analysis, { name, source });
  const validate = validator();
  if (!validate(motion)) throw new Error(`captured motion half does not validate: ${JSON.stringify(validate.errors)}`);
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, JSON.stringify(motion, null, 2) + '\n');
  const notesPath = notesPathFor(out);
  writeFileSync(notesPath, renderNotes({ name, video: from, analysis, facts }));
  return { motion, analysis, facts, notesPath };
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw Object.assign(new Error(`unexpected argument ${a}`), { setup: true });
    const v = argv[i + 1];
    if (v == null || v.startsWith('--')) throw Object.assign(new Error(`${a} needs a value`), { setup: true });
    o[a.slice(2)] = v; i++;
  }
  return o;
}

const USAGE = 'usage: capture-motion --from <video> --name <name> --out <path>/<name>.json [--fps N (default: the source rate, at most 30)]';

async function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
    if (!o.from || !o.name || !o.out) throw Object.assign(new Error(USAGE), { setup: true });
    const fps = o.fps ? Number(o.fps) : null;
    if (fps != null && !(fps > 0 && fps <= 60)) throw Object.assign(new Error('--fps must be a number in (0, 60]'), { setup: true });
    const r = await captureMotion({ from: o.from, name: o.name, out: o.out, fps });
    const c = r.analysis.cuts;
    console.log(`captured ${o.name}: ${r.motion.pacing.energy}, ${c.length} cut${c.length === 1 ? '' : 's'} (${c.map(kindLabel).join(', ') || 'none'}), ${r.facts.arrivals.length} arrivals`);
    console.log(`wrote ${o.out}`);
    console.log(`wrote ${r.notesPath}`);
    for (const g of r.facts.gaps) console.log(g);
    return 0;
  } catch (e) {
    console.error(`capture-motion: ${e.message}`);
    return e.setup ? 2 : 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
