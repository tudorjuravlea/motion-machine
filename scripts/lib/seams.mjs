// Seam evidence (SPEC §8, `mm export` and `mm footage cut`): the frames just before and after every edit
// boundary, as a row of tiles in one sheet (scripts/lib/sheet.mjs), and a check that no seam has a black,
// duplicated or offset frame. The sheet is for a person to look at; the check is for the exit code.
//
//   a film's boundary is a scene's cut: the frames of the finished MP4 around its start. A hard cut must
//   change the picture between the last frame of the outgoing scene and the first of the next (a
//   duplicated frame changes nothing; an offset puts the change a frame or more away); a cut that
//   plays a transition must not hold one frame still inside it.
//   a recording's boundary is a join of its edit (edit.json): the source frames either side. Here the
//   check reads the edit itself (a clip must continue where the output left off, and take its source
//   from after the clip before it, never from inside it) and the frames (neither side black, the two
//   not the same picture).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodePng } from '../check/_pixels.mjs';
import { bin } from './ffmpeg.mjs';
import { encodePng } from './layers-png.mjs';
import { composeSheet } from './sheet.mjs';

export const SEAM_BEFORE = 3;          // frames shown and read before a cut
export const SEAM_AFTER = 3;           // frames shown after it (a transition reads on to its end)
export const SEAM_MAX_FRAMES = 40;     // the most frames read around one cut
export const TILE_WIDTH = 240;         // px a frame is scaled to for reading and for the sheet
export const SEAMS_PER_SHEET = 8;      // rows in one sheet file
export const BLACK_LUMA = 0.02;        // mean luma (0..1) at or under which a frame is black
export const DUP_DIFF = 0.0001;        // mean absolute difference (0..1) under which two frames are the same picture
export const LIVELY_STEP = 10;         // inside a transition, a step under DUP_DIFF between two steps of this many times DUP_DIFF is a repeated frame
export const OFFSET_RATIO = 0.5;       // a hard cut's own step under this share of a livelier step before it is an offset

/** Runs ffmpeg and resolves with { code, stderr }. */
function ff(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin('ffmpeg'), ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (c) => { stderr += c; });
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, stderr }));
  });
}

/**
 * PNG tiles (TILE_WIDTH wide) of the frames of `video` whose indices are in `indices`, as Map index → Buffer.
 * An index past the last frame has no tile.
 */
export async function tilesOf(video, indices) {
  const sorted = [...new Set(indices)].filter((n) => n >= 0).sort((a, b) => a - b);
  const out = new Map();
  if (!sorted.length) return out;
  const dir = mkdtempSync(join(tmpdir(), 'mm-seams-'));
  try {
    const pick = sorted.map((n) => `eq(n\\,${n})`).join('+');
    const r = await ff(['-i', video, '-an', '-vf', `select='${pick}',scale=${TILE_WIDTH}:-2:flags=area`, '-fps_mode', 'passthrough', '-f', 'image2', join(dir, 't%05d.png')]);
    if (r.code !== 0) throw new Error(`ffmpeg could not read frames of ${video}: ${r.stderr.trim().split('\n').pop()}`);
    const files = readdirSync(dir).filter((f) => /^t\d{5}\.png$/.test(f)).sort();
    files.forEach((f, i) => { if (i < sorted.length) out.set(sorted[i], readFileSync(join(dir, f))); });
    return out;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** One image file (a JPEG or PNG) as a TILE_WIDTH-wide PNG. */
export async function tileOfFile(file) {
  const dir = mkdtempSync(join(tmpdir(), 'mm-seams-'));
  try {
    const r = await ff(['-i', file, '-vf', `scale=${TILE_WIDTH}:-2:flags=area`, '-frames:v', '1', join(dir, 't.png')]);
    if (r.code !== 0) throw new Error(`ffmpeg could not read ${file}: ${r.stderr.trim().split('\n').pop()}`);
    return readFileSync(join(dir, 't.png'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** { luma: mean 0..1, px: Float32Array of luma } of a PNG tile. */
export function lumaOf(png) {
  const { width, height, data } = decodePng(png);
  const px = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0; i < px.length; i++) {
    const y = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
    px[i] = y; sum += y;
  }
  return { luma: sum / px.length, px };
}

/** Mean absolute difference (0..1) of two luma planes of one size. */
export function diffOf(a, b) {
  if (a.length !== b.length) return 1;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

const r4 = (x) => Math.round(x * 1e4) / 1e4;

/**
 * Reads one film seam from its frames.
 * @param {{n: number, luma: number, px: Float32Array}[]} frames  consecutive frames, in order
 * @param {{first: number, hard: boolean, blackOk?: boolean, calmBefore?: boolean}} o  `first`: index of the cut's first frame; `hard`: the cut plays no transition; `blackOk`: the brand's own canvas is black; `calmBefore`: the schedule moves nothing in the frames before the cut (else a hard cut is not read for a duplicate or an offset); `transitionFrames`: how long the cut's transition plays, in frames
 * @returns {{issues: {kind: 'black'|'duplicate'|'offset'|'repeat', frame: number, reason: string}[], steps: {from: number, to: number, diff: number}[]}}
 */
export function judgeFilmSeam(frames, { first, hard, blackOk = false, calmBefore = true, transitionFrames = 0 }) {
  const issues = [];
  const steps = frames.slice(1).map((f, i) => ({ from: frames[i].n, to: f.n, diff: r4(diffOf(frames[i].px, f.px)) }));
  if (!blackOk) for (const f of frames) if (f.luma <= BLACK_LUMA) issues.push({ kind: 'black', frame: f.n, reason: `frame ${f.n} is black (mean luma ${r4(f.luma)})` });
  const at = steps.find((s) => s.to === first);
  if (hard && at && calmBefore) {
    // a hard cut changes the picture at its own frame; a frame that repeats the one before it is a duplicate,
    // and a change that comes before the cut means the frames are early by that many. Both are read only while the
    // schedule is still before the cut: an exit that empties the stage lets the next scene start on the same picture.
    const early = steps.filter((s) => s.to < first).reduce((m, s) => (s.diff > m.diff ? s : m), { diff: 0 });
    const earlier = early.diff >= DUP_DIFF && at.diff < early.diff * OFFSET_RATIO;
    if (earlier) {
      const by = first - early.to;
      issues.push({ kind: 'offset', frame: early.to, reason: `the picture changes at frame ${early.to}, ${by} frame${by === 1 ? '' : 's'} before the cut at frame ${first}` });
    } else if (at.diff < DUP_DIFF) issues.push({ kind: 'duplicate', frame: first, reason: `frame ${first} repeats frame ${first - 1}: the cut changes nothing at its own frame` });
  } else if (!hard) {
    // a transition plays for `transitionFrames` frames from the cut; a step inside it that stands still between two lively ones is a repeat
    for (let k = 1; k < steps.length - 1; k++) {
      const s = steps[k];
      if (s.to <= first || s.to >= first + transitionFrames - 1) continue;
      if (s.diff < DUP_DIFF && steps[k - 1].diff >= LIVELY_STEP * DUP_DIFF && steps[k + 1].diff >= LIVELY_STEP * DUP_DIFF) issues.push({ kind: 'repeat', frame: s.to, reason: `frame ${s.to} repeats frame ${s.from} inside the transition` });
    }
  }
  return { issues, steps };
}

/**
 * Reads the seams of a finished film MP4 and draws their evidence.
 * @param {string} video
 * @param {{t: number, scene: string, d: number}[]} seams  each cut: its time, the scene it opens, the length of its transition
 * @param {{fps: number, frames: number, blackOk?: boolean, browser?: object, sheetBase?: string}} o  `sheetBase`: path of the sheet without extension (a suffix is added for a second file)
 * @returns {Promise<{seams: object[], sheets: string[], issues: object[]}>}
 */
export async function filmSeams(video, seams, { fps, frames, blackOk = false, browser, sheetBase, events = [] }) {
  const windows = seams.map((s) => {
    const first = Math.min(frames - 1, Math.round(s.t * fps));
    const after = Math.max(SEAM_AFTER, s.d > 0 ? Math.ceil(s.d * fps) + 2 : 0);
    const from = Math.max(0, first - SEAM_BEFORE), to = Math.min(frames - 1, first + Math.min(after, SEAM_MAX_FRAMES - SEAM_BEFORE - 1));
    return { ...s, first, from, to, indices: Array.from({ length: to - from + 1 }, (_, k) => from + k) };
  });
  const tiles = await tilesOf(video, windows.flatMap((w) => w.indices));
  const rows = [], issues = [];
  for (const w of windows) {
    const got = w.indices.filter((n) => tiles.has(n)).map((n) => ({ n, png: tiles.get(n), ...lumaOf(tiles.get(n)) }));
    // nothing planned moves in the frames before the cut: no arrival, exit, move or earlier cut overlaps them
    const lo = (w.first - SEAM_BEFORE) / fps, hi = w.first / fps;
    const calmBefore = !events.some((e) => ['arrive', 'depart', 'move', 'cut'].includes(e.kind) && e.d > 0 && e.t < hi - 1e-9 && e.t + e.d > lo + 1e-9);
    const verdict = got.length > 1 ? judgeFilmSeam(got, { first: w.first, hard: !(w.d > 0), blackOk, calmBefore, transitionFrames: w.d > 0 ? Math.ceil(w.d * fps) : 0 }) : { issues: [{ kind: 'offset', frame: w.first, reason: `no frames could be read around frame ${w.first}` }], steps: [] };
    rows.push({ scene: w.scene, t: w.t, frame: w.first, hard: !(w.d > 0), frames: got.map((g) => g.n), steps: verdict.steps, issues: verdict.issues, shown: got });
    for (const i of verdict.issues) issues.push({ scene: w.scene, t: w.t, ...i });
  }
  const sheets = await drawSheets(rows.map((r) => ({
    label: `${r.scene.slice(0, 8)}${r.issues.length ? ' !' : ''}`,
    tiles: r.shown.filter((g) => g.n >= r.frame - SEAM_BEFORE && g.n <= r.frame + SEAM_AFTER - 1).map((g) => ({ png: g.png, label: `${g.n - r.frame >= 0 ? '+' : ''}${g.n - r.frame} ${(g.n / fps).toFixed(2)}s` })),
  })), { browser, sheetBase });
  return { seams: rows.map(({ shown, ...r }) => r), sheets, issues };
}

/** One sheet file per SEAMS_PER_SHEET rows: a row is one seam, its tiles left to right. Returns the written PNG paths. */
export async function drawSheets(rows, { browser, sheetBase }) {
  const out = [];
  for (let i = 0; i < rows.length; i += SEAMS_PER_SHEET) {
    const part = rows.slice(i, i + SEAMS_PER_SHEET);
    const cols = Math.max(...part.map((r) => r.tiles.length));
    // a row with fewer frames than the widest is filled with transparent tiles, so every row has `cols` tiles
    const tiles = part.flatMap((r) => {
      const { width, height } = decodePng(r.tiles[0].png);
      const blank = encodePng({ width, height, data: Buffer.alloc(width * height * 4) });
      return Array.from({ length: cols }, (_, k) => (r.tiles[k] ? { png: r.tiles[k].png, label: k === 0 ? `${r.label} ${r.tiles[k].label}` : r.tiles[k].label } : { png: blank, label: '' }));
    });
    const sheet = await composeSheet(tiles, { columns: cols, tileWidth: TILE_WIDTH, browser });
    const file = `${sheetBase}${rows.length > SEAMS_PER_SHEET ? `-${out.length + 1}` : ''}.png`;
    writeFileSync(file, sheet.png);
    out.push(file);
  }
  return out;
}

/**
 * Reads the joins of a recording's edit (assets/<name>/edit.json: picture clips { start, from, length } in frames)
 * against its frame sequence (assets/<name>/f%05d.jpg, numbered from 1).
 * @returns {Promise<{seams: object[], sheets: string[], issues: object[]}>}
 */
export async function footageSeams(editDir, edit, { browser, sheetBase, frameFile = (n) => join(editDir, `f${String(n + 1).padStart(5, '0')}.jpg`) } = {}) {
  const clips = edit.picture ?? [];
  const rows = [], issues = [];
  for (let k = 1; k < clips.length; k++) {
    const a = clips[k - 1], b = clips[k];
    const problems = [];
    if (b.start !== a.start + a.length) problems.push({ kind: 'offset', reason: `clip ${k + 1} starts at output frame ${b.start}, not ${a.start + a.length} where clip ${k} ends: ${b.start > a.start + a.length ? 'a gap' : 'an overlap'}` });
    if (b.from < a.from + a.length) problems.push({ kind: 'duplicate', reason: `clip ${k + 1} takes its picture from source frame ${b.from}, inside clip ${k} (which ends at ${a.from + a.length - 1}): frames shown twice` });
    const before = Array.from({ length: SEAM_BEFORE }, (_, i) => a.from + a.length - SEAM_BEFORE + i).filter((n) => n >= a.from);
    const after = Array.from({ length: SEAM_AFTER }, (_, i) => b.from + i).filter((n) => n < b.from + b.length);
    const shown = [];
    for (const n of [...before, ...after]) {
      const png = await tileOfFile(frameFile(n));
      shown.push({ n, png, ...lumaOf(png), side: before.includes(n) ? 'before' : 'after' });
    }
    for (const f of shown) if (f.luma <= BLACK_LUMA) problems.push({ kind: 'black', reason: `source frame ${f.n} is black (mean luma ${r4(f.luma)})` });
    const last = shown.filter((f) => f.side === 'before').at(-1), next = shown.find((f) => f.side === 'after');
    if (last && next && diffOf(last.px, next.px) < DUP_DIFF) problems.push({ kind: 'duplicate', reason: `source frames ${last.n} and ${next.n} are the same picture across the join` });
    const at = Math.round((b.start / edit.fps) * 1000) / 1000;
    rows.push({ clip: k + 1, at, frame: b.start, from: [a.from + a.length - 1, b.from], issues: problems, shown });
    for (const p of problems) issues.push({ clip: k + 1, at, ...p });
  }
  const sheets = rows.length ? await drawSheets(rows.map((r) => ({
    label: `join ${r.clip - 1}-${r.clip}${r.issues.length ? ' !' : ''}`,
    tiles: r.shown.map((g) => ({ png: g.png, label: `src ${g.n}` })),
  })), { browser, sheetBase }) : [];
  return { seams: rows.map(({ shown, ...r }) => r), sheets, issues };
}
