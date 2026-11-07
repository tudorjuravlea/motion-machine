// Where a screen recording is doing something: small grey frames at 4 fps, diffed on a grid, grouped into
// windows; each active, localized window becomes a segment { t0, t1, u, v, zoom } (seconds; u, v 0..1 of the
// recording; zoom a camera distance, smaller is closer). toRegions turns segments into the hand-drawn
// regions of screen/zoom-to. segmentActivity and toRegions are pure; analyzeActivity runs ffmpeg.
// Ported from showcase (MIT, same author; see NOTICE): its activity analysis; the ffmpeg calls go through
// scripts/lib/ffmpeg.mjs here.
import { spawn } from 'node:child_process';
import { MissingToolError } from './cli.mjs';
import { bin, probe } from './ffmpeg.mjs';

// The grid is 8 x 16 cells, the long side along the video's long side (gridDimsFor).
export const GRID_ROWS = 8;
export const GRID_COLS = 16;
export const DEFAULT_FPS = 4;
export const DEFAULT_WIDTH = 64;
export const DEFAULT_WINDOW_SEC = 1.5;
// A window survives only if it clears both bars: an absolute one (mean abs-diff per cell per frame, 0..255:
// a real recording sits at ~7-12, a static stretch at ~0.05-0.1) and a share of the clip's peak window energy.
export const DEFAULT_MIN_INTENSITY = 1;
export const DEFAULT_MIN_ENERGY_FRACTION = 0.18;
// Only cells at this share of the window's hottest cell steer the centroid, weighted by energy^power:
// averaging every cell puts the centroid at dead centre for anything full-screen (scrolling).
export const DEFAULT_CELL_KEEP_FRACTION = 0.8;
export const DEFAULT_CENTROID_WEIGHT_POWER = 2;
// If more than this share of cells stay hot the motion is not localized (a crossfade, a flash): no segment.
export const DEFAULT_UNIFORM_CELL_FRACTION = 0.5;
export const DEFAULT_ZOOM_MIN = 0.3;
export const DEFAULT_ZOOM_MAX = 0.7;
// The spread (std-dev radius of the kept cells) seen on real recordings: ~0.15 tight burst .. ~0.38 diffuse.
export const DEFAULT_SPREAD_MIN = 0.08;
export const DEFAULT_SPREAD_MAX = 0.4;
export const DEFAULT_MERGE_UV_DISTANCE = 0.12;
export const DEFAULT_MERGE_ZOOM_DELTA = 0.15;
// Merge only genuinely adjacent windows: gaps under half a window.
export const DEFAULT_GAP_TOLERANCE_FRACTION = 0.5;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (n) => Math.round(n * 100) / 100;

/** { rows, cols } of the diff grid for a source: the long side along the long side. */
export function gridDimsFor(srcWidth, srcHeight) {
  return srcHeight > srcWidth ? { rows: GRID_COLS, cols: GRID_ROWS } : { rows: GRID_ROWS, cols: GRID_COLS };
}

// Centroid and spread of one window's grid energy, summed over its frames. `intensity` (mean per cell per
// frame) and `energy` (total) drive the survival bars; `keptFraction` tells localized action from uniform motion.
function windowStats(grids, { cellKeepFraction, centroidWeightPower }) {
  const rows = grids[0].length;
  const cols = grids[0][0].length;
  const cells = rows * cols;
  const totals = Array.from({ length: rows }, () => new Array(cols).fill(0));
  let energy = 0;
  let peak = 0;
  for (const grid of grids) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const e = grid[r][c];
        if (e <= 0) continue;
        totals[r][c] += e;
        energy += e;
      }
    }
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) peak = Math.max(peak, totals[r][c]);
  if (energy <= 0 || peak <= 0) return { energy: 0, intensity: 0, u: 0.5, v: 0.5, spread: 0, keptFraction: 0 };

  const floor = peak * cellKeepFraction;
  const kept = [];
  let weight = 0;
  let sumU = 0;
  let sumV = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (totals[r][c] < floor) continue;
      const w = totals[r][c] ** centroidWeightPower;
      const u = (c + 0.5) / cols;
      const v = (r + 0.5) / rows;
      kept.push({ w, u, v });
      weight += w;
      sumU += w * u;
      sumV += w * v;
    }
  }

  const u = sumU / weight;
  const v = sumV / weight;
  let varU = 0;
  let varV = 0;
  for (const cell of kept) {
    varU += cell.w * (cell.u - u) ** 2;
    varV += cell.w * (cell.v - v) ** 2;
  }
  return { energy, intensity: energy / (grids.length * cells), u, v, spread: Math.sqrt(varU / weight + varV / weight), keptFraction: kept.length / cells };
}

function zoomFromSpread(spread, { zoomMin, zoomMax, spreadMin, spreadMax }) {
  return zoomMin + clamp((spread - spreadMin) / (spreadMax - spreadMin), 0, 1) * (zoomMax - zoomMin);
}

/**
 * Per-frame-pair diff grids (diffGrids[i]: rows x cols of mean abs-diff, 0..255, between sampled frames i and
 * i+1 at `fps`) to segments [{ t0, t1, u, v, zoom }]. Options: fps, windowSec, minIntensity, minEnergyFraction,
 * cellKeepFraction, centroidWeightPower, uniformCellFraction, zoomMin, zoomMax, spreadMin, spreadMax,
 * mergeUvDistance, mergeZoomDelta, gapToleranceFraction (defaults above).
 */
export function segmentActivity(diffGrids, opts = {}) {
  const {
    fps = DEFAULT_FPS,
    windowSec = DEFAULT_WINDOW_SEC,
    minIntensity = DEFAULT_MIN_INTENSITY,
    minEnergyFraction = DEFAULT_MIN_ENERGY_FRACTION,
    cellKeepFraction = DEFAULT_CELL_KEEP_FRACTION,
    centroidWeightPower = DEFAULT_CENTROID_WEIGHT_POWER,
    uniformCellFraction = DEFAULT_UNIFORM_CELL_FRACTION,
    zoomMin = DEFAULT_ZOOM_MIN,
    zoomMax = DEFAULT_ZOOM_MAX,
    spreadMin = DEFAULT_SPREAD_MIN,
    spreadMax = DEFAULT_SPREAD_MAX,
    mergeUvDistance = DEFAULT_MERGE_UV_DISTANCE,
    mergeZoomDelta = DEFAULT_MERGE_ZOOM_DELTA,
    gapToleranceFraction = DEFAULT_GAP_TOLERANCE_FRACTION,
  } = opts;
  const zoomOpts = { zoomMin, zoomMax, spreadMin, spreadMax };
  if (!diffGrids.length) return [];

  const framesPerWindow = Math.max(1, Math.round(windowSec * fps));
  const windows = [];
  for (let start = 0; start < diffGrids.length; start += framesPerWindow) {
    const stats = windowStats(diffGrids.slice(start, start + framesPerWindow), { cellKeepFraction, centroidWeightPower });
    windows.push({ t0: start / fps, t1: Math.min(diffGrids.length, start + framesPerWindow) / fps, ...stats });
  }

  const maxEnergy = Math.max(...windows.map((w) => w.energy));
  if (maxEnergy <= 0) return [];
  const active = windows.filter((w) => w.energy >= maxEnergy * minEnergyFraction && w.intensity >= minIntensity && w.keptFraction <= uniformCellFraction);
  if (!active.length) return [];

  const gapTolerance = (framesPerWindow / fps) * gapToleranceFraction;
  const merged = [];
  for (const win of active) {
    const last = merged[merged.length - 1];
    const zoom = zoomFromSpread(win.spread, zoomOpts);
    if (last && win.t0 - last.t1 <= gapTolerance && Math.hypot(last.u - win.u, last.v - win.v) <= mergeUvDistance && Math.abs(zoom - last.zoom) <= mergeZoomDelta) {
      const total = last.energy + win.energy;
      last.u = (last.u * last.energy + win.u * win.energy) / total;
      last.v = (last.v * last.energy + win.v * win.energy) / total;
      last.zoom = (last.zoom * last.energy + zoom * win.energy) / total;
      last.energy = total;
      last.t1 = win.t1;
    } else {
      merged.push({ t0: win.t0, t1: win.t1, u: win.u, v: win.v, zoom, energy: win.energy });
    }
  }
  return merged.map(({ t0, t1, u, v, zoom }) => ({ t0, t1, u, v, zoom }));
}

// The camera needs about this long to land on a region (screen/zoom-to, runtime/kit/camera.js).
const LAND = 0.6;

/**
 * Segments to the `regions` of screen/zoom-to in auto mode: [{ at, hold, x, y, depth }] (seconds into the
 * recording; x, y 0..1 of it; depth a magnification, 2.2 (the camera's `close` step) at zoom 0.3 down to
 * 1.25 at 0.7). Segments shorter than `minHold` are dropped, times are held to [0, duration] when given, and a region that would start before
 * the previous one has landed and let go is dropped.
 */
export function toRegions(segments, { duration, minHold = 0.3 } = {}) {
  const top = Number.isFinite(duration) ? duration : Infinity;
  const out = [];
  let free = -Infinity;
  for (const s of [...segments].sort((a, b) => a.t0 - b.t0)) {
    const t0 = clamp(s.t0, 0, top);
    const t1 = clamp(s.t1, 0, top);
    if (t1 - t0 < minHold) continue;
    const at = round2(t0);
    if (at < free - 1e-9) continue;
    const hold = round2(Math.max(0, t1 - t0 - LAND));
    const depth = round2(clamp(2.2 + ((s.zoom - 0.3) * (1.25 - 2.2)) / (0.7 - 0.3), 1.25, 2.2));
    out.push({ at, hold, x: round2(clamp(s.u, 0, 1)), y: round2(clamp(s.v, 0, 1)), depth });
    free = at + hold + LAND;
  }
  return out;
}

// Mean abs-diff per cell between two grey frames of width x height.
function diffToGrid(prev, curr, width, height, rows, cols) {
  const sums = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const counts = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let y = 0; y < height; y++) {
    const row = Math.min(rows - 1, Math.floor((y / height) * rows));
    for (let x = 0; x < width; x++) {
      const col = Math.min(cols - 1, Math.floor((x / width) * cols));
      const i = y * width + x;
      sums[row][col] += Math.abs(curr[i] - prev[i]);
      counts[row][col] += 1;
    }
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) sums[r][c] = counts[r][c] ? sums[r][c] / counts[r][c] : 0;
  return sums;
}

// Raw grey frames at fps x width x height on stdout; runFfmpeg ignores stdout, so spawn the same binary.
function rawFrames(file, fps, width, height) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin('ffmpeg'), ['-v', 'error', '-i', file, '-vf', `fps=${fps},scale=${width}:${height}:flags=area,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let stderr = '';
    proc.stdout.on('data', (c) => chunks.push(c));
    proc.stderr.on('data', (c) => { stderr += c; });
    proc.on('error', (e) => reject(e.code === 'ENOENT' ? new MissingToolError('ffmpeg') : e));
    proc.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg exited with code ${code}\n${stderr.trim()}`))));
  });
}

// Display size of the first video stream: ffmpeg turns a rotated clip upright, so a quarter turn swaps the sides.
function displaySize(file) {
  const v = probe(file).streams.find((s) => s.codec_type === 'video');
  if (!v?.width || !v?.height) throw new Error(`could not read the video size of ${file}`);
  const turn = Math.abs(Number(v.side_data_list?.find((d) => d.rotation != null)?.rotation ?? v.tags?.rotate ?? 0)) % 180;
  return turn === 90 ? { width: v.height, height: v.width } : { width: v.width, height: v.height };
}

/** One diff grid per consecutive pair of frames sampled at `fps`, `width` px wide; srcWidth and srcHeight skip the probe. */
export async function extractDiffGrids(file, opts = {}) {
  const { fps = DEFAULT_FPS, width = DEFAULT_WIDTH } = opts;
  const src = opts.srcWidth && opts.srcHeight ? { width: opts.srcWidth, height: opts.srcHeight } : displaySize(file);
  const dims = gridDimsFor(src.width, src.height);
  const rows = opts.rows ?? dims.rows;
  const cols = opts.cols ?? dims.cols;
  const height = Math.max(2, Math.round((width * (src.height / src.width)) / 2) * 2);
  const buf = await rawFrames(file, fps, width, height);
  const size = width * height;
  const grids = [];
  for (let i = 0; i < Math.floor(buf.length / size) - 1; i++) {
    grids.push(diffToGrid(buf.subarray(i * size, (i + 1) * size), buf.subarray((i + 1) * size, (i + 2) * size), width, height, rows, cols));
  }
  return grids;
}

/** Segments [{ t0, t1, u, v, zoom }] of a recording; `opts` go to extractDiffGrids and segmentActivity. */
export async function analyzeActivity(file, opts = {}) {
  return segmentActivity(await extractDiffGrids(file, opts), opts);
}
