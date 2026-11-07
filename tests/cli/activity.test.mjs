// The activity analyser: where a screen recording is doing something. segmentActivity on synthetic diff
// grids, toRegions (segments to screen/zoom-to hand-drawn regions), and one pass over a clip made here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeActivity, gridDimsFor, segmentActivity, toRegions, GRID_ROWS, GRID_COLS } from '../../scripts/lib/activity.mjs';
import { toolVersion } from '../../scripts/lib/ffmpeg.mjs';

const empty = () => Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(0));
const hotCell = (row, col, energy = 200) => { const g = empty(); g[row][col] = energy; return g; };
const repeat = (grid, n) => Array.from({ length: n }, () => grid);
const OPTS = { fps: 4, windowSec: 2 };   // 8 frames to a window

test('a hot spot in the top-left gives one segment there', () => {
  const s = segmentActivity(repeat(hotCell(0, 1), 8), OPTS);
  assert.equal(s.length, 1);
  assert.ok(s[0].u < 0.2 && s[0].v < 0.2, `${s[0].u},${s[0].v}`);
  assert.equal(s[0].t0, 0);
  assert.ok(Math.abs(s[0].t1 - 2) < 1e-9);
  assert.ok(s[0].zoom >= 0.3 && s[0].zoom <= 0.7);
});

test('a static clip and an empty one give no segments', () => {
  assert.deepEqual(segmentActivity(repeat(empty(), 20), OPTS), []);
  assert.deepEqual(segmentActivity([]), []);
});

test('uniform full-screen motion gives no segments', () => {
  const g = empty().map((row) => row.map(() => 100));
  assert.deepEqual(segmentActivity(repeat(g, 8), OPTS), []);
});

test('two bursts with a static gap between them give two segments, in order', () => {
  const grids = [...repeat(hotCell(0, 0), 8), ...repeat(empty(), 8), ...repeat(hotCell(7, 15), 8)];
  const s = segmentActivity(grids, OPTS);
  assert.equal(s.length, 2);
  assert.ok(s[0].u < 0.2 && s[0].v < 0.2);
  assert.ok(s[1].u > 0.8 && s[1].v > 0.8);
  assert.ok(s[0].t1 <= s[1].t0);
});

test('adjacent windows of the same spot merge into one segment', () => {
  const s = segmentActivity(repeat(hotCell(4, 8), 16), OPTS);
  assert.equal(s.length, 1);
  assert.ok(Math.abs(s[0].t1 - 4) < 1e-9);
});

test('gridDimsFor puts the long axis in rows for portrait and the transpose for landscape', () => {
  assert.deepEqual(gridDimsFor(360, 780), { rows: GRID_COLS, cols: GRID_ROWS });
  assert.deepEqual(gridDimsFor(1920, 1080), { rows: GRID_ROWS, cols: GRID_COLS });
});

test('toRegions maps each segment to { at, hold, x, y, depth }', () => {
  const r = toRegions([
    { t0: 1, t1: 4, u: 0.2, v: 0.3, zoom: 0.3 },
    { t0: 6.004, t1: 9, u: 0.8, v: 0.7, zoom: 0.7 },
  ], { duration: 10 });
  assert.deepEqual(r[0], { at: 1, hold: 2.4, x: 0.2, y: 0.3, depth: 2.2 });
  assert.deepEqual(r[1], { at: 6, hold: 2.4, x: 0.8, y: 0.7, depth: 1.25 });
  const mid = toRegions([{ t0: 0, t1: 3, u: 0.5, v: 0.5, zoom: 0.5 }])[0];
  assert.ok(Math.abs(mid.depth - 1.725) < 0.01, `${mid.depth}`);
});

test('toRegions holds depth within 1.25 to 2.2 whatever the zoom', () => {
  for (const zoom of [0, 0.1, 0.3, 0.45, 0.7, 1, 5]) {
    const [r] = toRegions([{ t0: 0, t1: 3, u: 0.5, v: 0.5, zoom }]);
    assert.ok(typeof r.depth === 'number' && r.depth >= 1.25 && r.depth <= 2.2, `zoom ${zoom} gives ${r.depth}`);
  }
});

test('toRegions drops segments shorter than minHold, and honours a different minHold', () => {
  const seg = [{ t0: 1, t1: 1.2, u: 0.5, v: 0.5, zoom: 0.4 }, { t0: 3, t1: 3.5, u: 0.5, v: 0.5, zoom: 0.4 }];
  assert.deepEqual(toRegions(seg).map((r) => r.at), [3]);
  assert.equal(toRegions(seg, { minHold: 0.1 }).length, 2);
  assert.equal(toRegions(seg, { minHold: 1 }).length, 0);
});

test('toRegions clamps to the duration, sorts, and keeps regions from overlapping', () => {
  const r = toRegions([
    { t0: 5, t1: 12, u: 0.5, v: 0.5, zoom: 0.4 },
    { t0: 0, t1: 3, u: 0.1, v: 0.1, zoom: 0.4 },
    { t0: 2, t1: 5, u: 0.9, v: 0.9, zoom: 0.4 },   // starts before the first has landed and let go: dropped
    { t0: 11, t1: 12, u: 0.5, v: 0.5, zoom: 0.4 },  // clamped to 1 s at most, and inside the previous: dropped
  ], { duration: 10 });
  assert.deepEqual(r.map((x) => x.at), [0, 5]);
  assert.equal(r[1].hold, 4.4);   // 10 - 5 - 0.6
  for (let i = 1; i < r.length; i++) assert.ok(r[i].at >= r[i - 1].at + r[i - 1].hold + 0.6 - 1e-9);
  assert.deepEqual(toRegions([{ t0: 11, t1: 12, u: 0.5, v: 0.5, zoom: 0.4 }], { duration: 10 }), []);
});

test('analyzeActivity finds the box that moves in the top-left of a clip', { skip: !toolVersion('ffmpeg').ok && 'ffmpeg not installed' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-activity-'));
  try {
    const file = join(dir, 'box.mp4');
    // black 360x780, 5 s; a white box that appears at 1 s, jiggles in the top-left quarter, and is gone at 3 s
    const made = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=black:s=360x780:r=30:d=5',
      '-f', 'lavfi', '-i', 'color=c=white:s=80x80:r=30:d=5',
      '-filter_complex', "[0:v][1:v]overlay=x='60+40*sin(t*9)':y='80+40*sin(t*7)':enable='between(t,1,3)',format=yuv420p",
      '-c:v', 'libx264', '-preset', 'ultrafast', file]);
    assert.equal(made.status, 0, String(made.stderr));
    const s = await analyzeActivity(file, { windowSec: 1, mergeUvDistance: 0.3 });
    assert.equal(s.length, 1, JSON.stringify(s));
    assert.ok(s[0].u < 0.5 && s[0].v < 0.5, `${s[0].u},${s[0].v}`);
    assert.ok(Math.abs(s[0].t0 - 1) <= 0.6, `t0 ${s[0].t0}`);
    assert.ok(Math.abs(s[0].t1 - 3) <= 0.6, `t1 ${s[0].t1}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
