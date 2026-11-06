// What the file check reads from a finished file's picture, over every frame (scripts/lib/export-qa.mjs): small grey
// frames give each frame's mean luma and its change from the frame before.
import { spawnSync } from 'node:child_process';
import { bin } from './ffmpeg.mjs';

export const FLASH_STEP = 12;        // of 255: the least step in mean luma that is a flash
export const STILL_PAIR = 0.05;      // of 255: a frame pair changing less than this stands still
export const SLIDESHOW_PAIR = 0.35;  // of 255: a frame pair changing less than this counts toward a slideshow

const W = 320, H = 180;

/** Every frame of `file` as { mean, pair }: each frame's mean luma, and the mean absolute change from the frame before (0..255). */
export function lumaSweep(file) {
  const r = spawnSync(bin('ffmpeg'), ['-v', 'error', '-nostdin', '-i', file, '-map', '0:v:0', '-vf', `scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 2 ** 31 - 1 });
  if (r.status !== 0) throw new Error(`ffmpeg could not read the picture of ${file}: ${String(r.stderr).trim().split('\n').pop()}`);
  const size = W * H, count = Math.floor(r.stdout.length / size), mean = new Array(count), pair = new Array(count).fill(0), b = r.stdout;
  for (let k = 0; k < count; k++) {
    const o = k * size;
    let s = 0, d = 0;
    for (let i = 0; i < size; i++) { s += b[o + i]; if (k) d += Math.abs(b[o + i] - b[o - size + i]); }
    mean[k] = s / size;
    pair[k] = d / size;
  }
  return { mean, pair };
}

/**
 * Frames that step away and straight back: { single: [frame], double: [first frame] }, one frame out or two.
 * The frames either side must match, within a quarter of the smaller step: that return tells a flash from a pan, and a hard cut steps once.
 */
export function flashes(mean) {
  const single = [], double = [];
  const steps = (a, b, before, after) => Math.abs(a) >= FLASH_STEP && Math.abs(b) >= FLASH_STEP && Math.sign(a) === Math.sign(b) && Math.abs(before - after) <= Math.min(Math.abs(a), Math.abs(b)) / 4;
  for (let k = 1; k + 1 < mean.length; k++) {
    if (steps(mean[k] - mean[k - 1], mean[k] - mean[k + 1], mean[k - 1], mean[k + 1])) single.push(k);
    if (k + 2 < mean.length && Math.abs(mean[k] - mean[k + 1]) < FLASH_STEP / 6 && steps(mean[k] - mean[k - 1], mean[k + 1] - mean[k + 2], mean[k - 1], mean[k + 2])) double.push(k);
  }
  return { single, double };
}

/** The most flashes inside any one second. */
export function flashRate(frames, fps) {
  let most = 0;
  for (const k of frames) most = Math.max(most, frames.filter((x) => x >= k && x < k + fps).length);
  return most;
}

/** Spans where nothing changes, longest first, as { start, seconds }; a span reaching the end is the ending, and left out. */
export function stillSpans(pair, fps) {
  const out = [];
  let from = -1;
  for (let k = 1; k < pair.length; k++) {
    const still = pair[k] < STILL_PAIR;
    if (still && from < 0) from = k - 1;
    if (!still && from >= 0) { out.push({ start: from / fps, seconds: (k - 1 - from) / fps }); from = -1; }
  }
  return out.sort((a, b) => b.seconds - a.seconds);
}

/** The share of frame pairs that barely change. */
export function slideshowShare(pair) {
  const n = pair.length - 1;
  if (n < 1) return 0;
  let low = 0;
  for (let k = 1; k <= n; k++) if (pair[k] < SLIDESHOW_PAIR) low++;
  return low / n;
}
