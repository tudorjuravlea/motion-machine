// The finished file is checked too (SPEC §8, `mm export` and `mm verify-export`): after the gate has
// judged the page and the frames have been drawn, the MP4 that ships is read back with ffprobe and
// ffmpeg, and the verdict is written to out/export-qa.json. A row per check, PASS, FAIL or SKIP (a check
// that could not run says so, never PASS):
//   QA-STREAM    a video stream exists
//   QA-DURATION  the frame count is the story's duration at the frame rate (a film), or the walkthrough's holds and presses (a deck)
//   QA-SIZE      the picture is the format's size (even sides)
//   QA-FPS       the frame rate is the one asked for, and constant
//   QA-AUDIO     a piece with sound has an audio stream that is not the placeholder, as long as the picture
//   QA-BLACK     no black frames (blackdetect), unless the brand's canvas is itself black
//   QA-FROZEN    no frozen span while the schedule moves: a rest or a gap between motions is still on purpose
//   QA-SILENCE   no silence longer than SILENCE_MAX_S inside a sounding piece
//   QA-LEVEL     the encoded file's true peak and loudness are the style's targets (the MP4 is measured, not the WAV)
//   QA-SEAM      every cut of a film: no black, duplicated or offset frame (./seams.mjs, with its evidence sheet)
//   QA-FRAMES    the frames the decoder finds are exactly round(duration x fps), and the number the container declares
//   QA-BITRATE   the video bitrate is sane for the picture's size: not starved, not runaway (BITRATE_BPP bits a pixel a frame)
//   QA-DECODE    frames decoded from the file are the frames the page draws cold, within DECODE_MAE_MAX (a film, --sub 1)
//   QA-ALPHA     (a transparent export, verifyAlphaFile) the alpha channel survives: a corner the page left clear is clear in the file, a pixel it drew solid is solid
// `mm export` writes a silent placeholder track and `mm sound` muxes the mix afterwards, so in the
// `export` phase the checks of the mix are SKIP and say which verb to run; `mm verify-export` is the `final` phase.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { measureLoudness, mixable } from '../sound.mjs';
import { TARGET_LUFS, TOLERANCE_LU, TRUE_PEAK_MAX } from '../check/_loudness.mjs';
import { patternsBaseOf } from './patterns-base.mjs';
import { VIEWPORTS } from './browser.mjs';
import { bin, probe } from './ffmpeg.mjs';
import { detectRate, exactFps, fractionOf, nameOfRate, sameRate } from './frame-rate.mjs';
import { rule } from './rule.mjs';
import { filmSeams } from './seams.mjs';
import { addImplicitPlays, forFormat, resolveStory, schedule as buildSchedule } from '../../runtime/kit/schedule.js';
import { parseColor } from '../check/_lib.mjs';

export const DURATION_TOL_S = 0.1;      // the audio may run this much longer or shorter than the picture
export const BLACK_MIN_S = 0.1;         // a black span of at least this is a fault
export const BLACK_PIC_TH = 0.98;       // blackdetect: the share of a frame's pixels that must be black
export const BLACK_PIX_TH = 0.03;       // blackdetect: a pixel is black at or under this luma (0..1 of the video range)
export const FREEZE_MIN_S = 0.5;        // a frozen span of at least this is looked at
export const FREEZE_NOISE_DB = -80;     // freezedetect: frames closer than this are the same
export const MOTION_CORE = [0.25, 0.75]; // the part of a motion that is surely moving: an ease starts and ends almost still
export const FREEZE_CORE_S = 0.2;       // a frozen span is a fault when this much of it lies inside such a core
export const SILENCE_MAX_S = 5;         // the longest silence inside a sounding piece
export const SILENCE_DB = -50;          // silencedetect: quieter than this is silence
export const MOTION_KINDS = ['arrive', 'depart', 'move', 'cut'];
// Provisional, from the encodes MM makes (x264 CRF 16, flat graphics): bits a pixel a frame. Under the floor a
// stream holds next to nothing (an encode that lost its picture); over the ceiling the encoder was not the one asked for.
export const BITRATE_BPP = { lo: 0.0005, hi: 0.5 };
export const DECODE_MAE_MAX = 3;        // a frame decoded from the file against the same frame drawn cold: the mean of |R, G, B differences|, 0..255
export const DECODE_BIG = 48;           // a channel off by more than this is a "big" miss ...
export const DECODE_BIG_SHARE = 0.01;   // ... and no more than this share of the samples may be
export const DECODE_FRAMES = 3;         // frames sampled: the first, the middle, the last
export const ALPHA_CLEAR_MAX = 8;       // alpha (0..255) of a corner the page left clear, as the file gives it back
export const ALPHA_SOLID_MIN = 247;     // alpha of a pixel the page drew solid

const r3 = (x) => Math.round(x * 1000) / 1000;
const even = (n) => n - (n % 2);

/** Runs ffmpeg with `args` and resolves { code, stderr } (stderr is where the filters report). */
function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin('ffmpeg'), ['-hide_banner', '-nostdin', '-nostats', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (c) => { stderr += c; });
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, stderr }));
  });
}

/** Black spans from blackdetect's log: [{ start, end }]. */
export function blackSpans(log) {
  return [...log.matchAll(/black_start:(-?[\d.]+)\s+black_end:(-?[\d.]+)/g)].map((m) => ({ start: Number(m[1]), end: Number(m[2]) }));
}

/** Frozen spans from freezedetect's log: [{ start, end }]; a span still frozen when the stream ends runs to `endOfStream`. */
export function frozenSpans(log, endOfStream) {
  const out = [];
  let open = null;
  for (const m of log.matchAll(/freeze_(start|end):\s*(-?[\d.]+)/g)) {
    if (m[1] === 'start') open = Number(m[2]);
    else if (open != null) { out.push({ start: open, end: Number(m[2]) }); open = null; }
  }
  if (open != null) out.push({ start: open, end: endOfStream });
  return out;
}

/** Silent spans from silencedetect's log: [{ start, end }]; a silence still running at the end runs to `endOfStream`. */
export function silentSpans(log, endOfStream) {
  const out = [];
  let open = null;
  for (const m of log.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
    if (m[1] === 'start') open = Number(m[2]);
    else if (open != null) { out.push({ start: open, end: Number(m[2]) }); open = null; }
  }
  if (open != null) out.push({ start: open, end: endOfStream });
  return out;
}

/** The cores of the intervals a schedule moves in (its arrivals, departures, moves and cuts that take time), merged: where the picture must be changing. */
export function motionCores(sched) {
  const raw = (sched?.events ?? []).filter((e) => MOTION_KINDS.includes(e.kind) && e.d > 0).map((e) => [e.t + MOTION_CORE[0] * e.d, e.t + MOTION_CORE[1] * e.d]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of raw) {
    if (out.length && a <= out.at(-1)[1]) out.at(-1)[1] = Math.max(out.at(-1)[1], b); else out.push([a, b]);
  }
  return out;
}

/** The part of [start, end] inside the intervals, in seconds. */
export const overlapOf = (start, end, intervals) => intervals.reduce((s, [a, b]) => s + Math.max(0, Math.min(end, b) - Math.max(start, a)), 0);

/**
 * Frozen spans that are a fault: long enough to look at, with FREEZE_CORE_S of them inside a motion's core, and
 * at least a frame and a half of it at `fps` (a motion that falls between two frames cannot be seen to stand still).
 * A rest, a gap between motions and an ease's still ends are on purpose.
 */
export function frozenFaults(spans, sched, fps = 30, drawn = null) {
  const cores = motionCores(sched);
  const need = Math.max(FREEZE_CORE_S, 1.5 / fps);
  // with the frames the page drew (the export's hashes), a freeze is a fault only where the page itself
  // drew changing frames: a pattern that holds still mid-entrance (a traced outline waiting for its fill)
  // is the picture on purpose, and the file kept it
  const pageMoved = (s) => !drawn || new Set(drawn.slice(Math.ceil(s.start * fps), Math.floor(s.end * fps) + 1)).size > 1;
  return spans.filter((s) => s.end - s.start >= FREEZE_MIN_S)
    .map((s) => ({ ...s, inMotion: overlapOf(s.start, s.end, cores) }))
    .filter((s) => s.inMotion >= need && pageMoved(s));
}

/** A share of pixels whose luma moves by more than PAGE_STEP between two of the page's own frames: below it the page stood still. */
export const PAGE_STEP = 8, PAGE_SHARE = 0.0005;

/** The share of pixels whose luma differs by more than PAGE_STEP (0..255) between two decoded PNGs of one size. */
export function visibleChange(a, b) {
  const n = Math.min(a.data.length, b.data.length) / 4;
  let moved = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 4, ya = 0.2126 * a.data[k] + 0.7152 * a.data[k + 1] + 0.0722 * a.data[k + 2], yb = 0.2126 * b.data[k] + 0.7152 * b.data[k + 1] + 0.0722 * b.data[k + 2];
    if (Math.abs(ya - yb) > PAGE_STEP) moved++;
  }
  return n ? moved / n : 0;
}

/** One frame of an MP4 at t, decoded to RGBA at its own size, as { width, height, data }. */
function fileFrame(file, t, width, height) {
  const r = spawnSync(bin('ffmpeg'), ['-v', 'error', '-ss', String(Math.max(0, t)), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 30 });
  return r.status === 0 && r.stdout.length >= width * height * 4 ? { width, height, data: r.stdout } : null;
}

/**
 * The candidate spans in which the page's own frames (start, middle, end) visibly change while the file's
 * frames at the same instants do not: motion the encode lost. A span where the page stood still, or where the
 * file shows the same change, is the picture as drawn.
 */
async function pageMovedSpans(spans, { dir, format, browser, file, width, height }) {
  const { openPiece, framePng } = await import('./browser.mjs');
  const { decodePng } = await import('../check/_pixels.mjs');
  const opened = await openPiece(dir, { format, browser });
  try {
    const out = [];
    for (const s of spans) {
      const ts = [s.start + 0.02, (s.start + s.end) / 2, s.end - 0.02];
      const page = [], got = [];
      for (const t of ts) { page.push(decodePng(await framePng(opened.page, t))); got.push(fileFrame(file, t, width, height)); }
      let lost = 0;
      for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) {
        const drew = visibleChange(page[a], page[b]);
        const kept = got[a] && got[b] ? visibleChange(got[a], got[b]) : 0;
        if (drew > PAGE_SHARE && kept < drew / 4) lost = Math.max(lost, drew);
      }
      if (lost) out.push({ ...s, pageChange: lost });
    }
    return out;
  } finally { await opened.close(); }
}

/** The frames the export drew for `format` (short hashes, one a frame), from out/export-frames.json; null when absent. */
export function drawnFrames(dir, format) {
  if (!dir || !format) return null;
  try { const j = JSON.parse(readFileSync(join(dir, 'out', 'export-frames.json'), 'utf8')); return Array.isArray(j.formats?.[format]) ? j.formats[format] : null; } catch { return null; }
}

/** The luma (0..1) of a CSS colour, or null. */
export function lumaOfColor(css) {
  const c = parseColor(css);
  return c ? (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 : null;
}

/** Whether the style's canvas is black enough that a black frame cannot be told from the stage. */
export const canvasIsBlack = (style) => { const y = lumaOfColor(style?.color?.canvas); return y != null && y <= BLACK_PIX_TH + 0.01; };

/** The format in a film's file name `<id>-<format>.mp4` (or .webm, .mov for a transparent export), or null. */
export const formatOfFile = (file) => /-(\d+x\d+)\.(?:mp4|webm|mov)$/.exec(basename(file))?.[1] ?? null;

/** The bitrate (bits a second) a picture of this size at this rate may have: { lo, hi }. */
export function bitrateBand({ width, height, fps }) {
  const pixelsPerSecond = width * height * fps;
  return { lo: Math.round(pixelsPerSecond * BITRATE_BPP.lo), hi: Math.round(pixelsPerSecond * BITRATE_BPP.hi) };
}

/** { side: 'low' | 'high' | null } for a bitrate against its band. */
export const bitrateVerdict = (bps, band) => ({ side: bps < band.lo ? 'low' : bps > band.hi ? 'high' : null });

/** The presentation times (seconds) of every video packet of a file, in decode order as ffprobe lists them (a window cut in decode order would leave B-frames out near its end; detectRate sorts and takes the first 256). */
export function packetTimes(file) {
  const r = spawnSync(bin('ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', file], { encoding: 'utf8', maxBuffer: 4 << 20 });
  return r.status === 0 ? r.stdout.split('\n').filter((l) => l.trim() !== '').map(Number).filter(Number.isFinite) : [];
}

/** Frame `k` of a file (by count, not by time) decoded to RGBA at its own size, as { width, height, data }; `decoder` names the decoder for a stream the native one drops the alpha of. */
export function frameAt(file, k, width, height, { decoder } = {}) {
  const r = spawnSync(bin('ffmpeg'), ['-v', 'error', ...(decoder ? ['-c:v', decoder] : []), '-i', file, '-vf', `select=eq(n\\,${k})`, '-fps_mode', 'passthrough', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 30 });
  return r.status === 0 && r.stdout.length >= width * height * 4 ? { width, height, data: r.stdout } : null;
}

/** { mae, big } of two RGBA frames of one size: the mean absolute difference over R, G and B (0..255), and the share of samples off by more than DECODE_BIG. */
export function frameDifference(a, b) {
  const n = Math.min(a.data.length, b.data.length) / 4;
  let sum = 0, big = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 4;
    for (let c = 0; c < 3; c++) { const d = Math.abs(a.data[k + c] - b.data[k + c]); sum += d; if (d > DECODE_BIG) big++; }
  }
  return n ? { mae: sum / (n * 3), big: big / (n * 3) } : { mae: 0, big: 0 };
}

/** The `sub` an export was made with, from out/export.json (null when the piece has no manifest). */
export function exportedSub(dir) {
  try { const j = JSON.parse(readFileSync(join(dir, 'out', 'export.json'), 'utf8')); return Number.isInteger(j.sub) ? j.sub : null; } catch { return null; }
}

/** Whether a frame the page drew cold matches the same frame decoded from the file: one row of QA-DECODE's evidence per sampled frame. */
async function decodeProof(file, { dir, format, browser, fps, frames, width, height }) {
  const { openPiece, framePng } = await import('./browser.mjs');
  const { decodePng } = await import('../check/_pixels.mjs');
  const at = [...new Set([0, Math.floor((frames - 1) / 2), frames - 1])].slice(0, DECODE_FRAMES);
  const opened = await openPiece(dir, { format, ...(browser ? { browser } : {}) });
  try {
    const out = [];
    for (const k of at) {
      const cold = decodePng(await framePng(opened.page, k / fps));
      const got = frameAt(file, k, width, height);
      if (!got || cold.width !== width || cold.height !== height) { out.push({ frame: k, t: r3(k / fps), mae: null, big: null }); continue; }
      const d = frameDifference(cold, got);
      out.push({ frame: k, t: r3(k / fps), mae: r3(d.mae), big: r3(d.big) });
    }
    return out;
  } finally { await opened.close(); }
}

/** Frames of a deck's walkthrough: its first rest held, then each press plays its transition and holds its rest. */
export function walkthroughFrames(sched, { fps, holdS }) {
  const hold = Math.round(holdS * fps);
  let frames = hold;
  for (let n = 1; n <= sched.presses; n++) frames += Math.max(1, Math.round((sched.pressLengths?.[n] ?? 0) * fps)) - 1 + hold;
  return frames;
}

/** The schedule of a piece as the gate builds it, for `format`. */
export async function scheduleFor(dir, story, style, format) {
  const { loadPatterns } = await import('../check.mjs');
  const metaOf = (asset) => { try { return JSON.parse(readFileSync(join(dir, asset, 'media.json'), 'utf8')); } catch { return null; } };
  const s = resolveStory(forFormat(story, format), style);
  addImplicitPlays(s, metaOf);
  return buildSchedule(s, style, { patterns: await loadPatterns(s, patternsBaseOf(dir)) });
}

/** The QA-FPS verdict for a video stream: { status, evidence }. The rate is the fraction the stream declares and the rate its packet times keep; 29.97 is 30000/1001, never 30. */
function fpsCheck(file, video, fps) {
  const frac = fractionOf(video.r_frame_rate);
  const [num, den] = String(video.r_frame_rate).split('/').map(Number);
  const rate = den ? num / den : num;
  const exact = frac?.value ?? rate;
  const detected = detectRate(packetTimes(file));
  const [an, ad] = String(video.avg_frame_rate).split('/').map(Number);
  const constant = detected ? detected.constant && Math.abs(detected.fps - exact) / exact < 1e-3 : Math.abs((ad ? an / ad : an) - rate) < 0.01;
  const rateName = nameOfRate(exact) ?? (detected?.snapped?.name ?? null);
  const evidence = { measured: r3(exact), rate: frac ? `${frac.num}/${frac.den}` : null, name: rateName, constant };
  if (fps != null) {
    const wantRate = exactFps(fps);
    const ok = sameRate(exact, wantRate.value) && constant;
    return { status: ok ? 'PASS' : 'FAIL', evidence: { ...evidence, expected: fps, expectedName: wantRate.name, ...(ok ? {} : { reason: `${rateName ?? r3(exact)} fps${frac ? ` (${frac.num}/${frac.den})` : ''}${constant ? '' : ' (not constant)'}, asked for ${wantRate.name}` }) } };
  }
  return { status: constant ? 'PASS' : 'FAIL', evidence: { ...evidence, note: 'the rate asked for is not known; checked for being constant', ...(constant ? {} : { reason: `average ${r3(ad ? an / ad : an)} fps against ${r3(rate)}: not constant` }) } };
}

/**
 * Checks one MP4. Returns { file, format, ok, checks: [rule rows] }.
 * @param {string} file
 * @param {object} o
 * @param {'export'|'final'} [o.phase='final']  `export`: the mix is not muxed yet, so its checks are SKIP
 * @param {string} [o.dir]  the piece folder; without it only what the file alone can say is checked
 * @param {number} [o.fps]  the frame rate that was asked for (else the file's own is only checked for being constant)
 * @param {number} [o.walkHoldS]  a deck's walkthrough hold
 * @param {object} [o.browser]  a Playwright browser for the seam sheet
 * @param {string} [o.sheetBase]  where the seam sheet goes, without extension
 */
export async function verifyFile(file, o = {}) {
  const { phase = 'final', dir = null } = o;
  const rows = [];
  const add = (id, status, evidence) => rows.push(rule(id, status, evidence));
  const skipRest = (reason, ids) => { for (const id of ids) add(id, 'SKIP', { reason }); };
  const ALL = ['QA-DURATION', 'QA-FRAMES', 'QA-SIZE', 'QA-FPS', 'QA-BITRATE', 'QA-AUDIO', 'QA-BLACK', 'QA-FROZEN', 'QA-SILENCE', 'QA-LEVEL', 'QA-DECODE', 'QA-SEAM'];

  let info;
  try { info = probe(file); } catch (e) { add('QA-STREAM', 'FAIL', { reason: `the file cannot be read: ${e.message.split('\n')[0]}` }); skipRest('the file cannot be read', ALL); return finish(file, null, rows); }
  const video = info.streams.find((s) => s.codec_type === 'video');
  if (!video) { add('QA-STREAM', 'FAIL', { reason: 'no video stream' }); skipRest('no video stream', ALL); return finish(file, null, rows); }
  const frames = Number(video.nb_read_frames ?? video.nb_frames);
  const [num, den] = String(video.r_frame_rate).split('/').map(Number);
  const rate = den ? num / den : num;
  add('QA-STREAM', frames > 0 ? 'PASS' : 'FAIL', { codec: video.codec_name, pixFmt: video.pix_fmt, frames, ...(frames > 0 ? {} : { reason: 'the video stream holds no frames' }) });

  // what the piece says the file should be
  let story = null, style = null, format = formatOfFile(file), sched = null, walkthrough = false, why = null;
  if (dir) {
    try {
      story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
      style = JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8'));
      walkthrough = story.kind === 'deck' && basename(file) === 'walkthrough.mp4';
      format = walkthrough ? story.formats[0] : format;
      if (!format || !VIEWPORTS[format] || (!walkthrough && story.kind === 'deck')) why = `${basename(file)} is not an MP4 this piece's story ships`;
      else if (!walkthrough && !story.formats.includes(format)) why = `the story does not ship ${format}`;
      else sched = await scheduleFor(dir, story, style, format);
    } catch (e) { why = `the piece could not be read: ${e.message.split('\n')[0]}`; }
  } else why = 'no piece given (--piece): the story is not known';
  const fps = o.fps ?? null;
  const rest = (id, reason) => add(id, 'SKIP', { reason });

  // QA-DURATION and QA-FRAMES
  const want = sched ? (walkthrough ? walkthroughFrames(sched, { fps: fps ?? rate, holdS: o.walkHoldS ?? 2 }) : Math.round(sched.duration * (fps ?? rate))) : null;
  if (sched) {
    const ok = frames === want;
    add('QA-DURATION', ok ? 'PASS' : 'FAIL', { measured: frames, expected: want, seconds: r3(frames / rate), ...(ok ? {} : { reason: `${frames} frames, the story makes ${want} (${r3(want / (fps ?? rate))} s at ${fps ?? rate} fps)` }) });
  } else rest('QA-DURATION', why);
  {
    // the decoder's count, not the container's: every frame is decoded and counted, then set beside what the tables declare and what the story makes
    const declared = Number.isFinite(Number(video.nb_frames)) ? Number(video.nb_frames) : null;
    const decoded = Number(video.nb_read_frames ?? NaN);
    if (!Number.isFinite(decoded)) rest('QA-FRAMES', 'the decoder did not report a frame count');
    else if (want == null && declared == null) rest('QA-FRAMES', `${why ?? 'the file declares no frame count'}: nothing to count against`);
    else {
      const bad = (want != null && decoded !== want) ? `decoded ${decoded} frames; round(duration x fps) is ${want}` : (declared != null && decoded !== declared) ? `the container declares ${declared} frames but ${decoded} decode` : null;
      add('QA-FRAMES', bad ? 'FAIL' : 'PASS', { decoded, declared, expected: want, ...(bad ? { reason: bad } : {}) });
    }
  }

  // QA-SIZE
  if (format && VIEWPORTS[format]) {
    const want = { width: even(VIEWPORTS[format].width), height: even(VIEWPORTS[format].height) };
    const ok = video.width === want.width && video.height === want.height;
    add('QA-SIZE', ok ? 'PASS' : 'FAIL', { measured: `${video.width}x${video.height}`, expected: `${want.width}x${want.height}`, format, ...(ok ? {} : { reason: `${video.width}x${video.height}, ${format} is ${want.width}x${want.height}` }) });
  } else rest('QA-SIZE', `the format of ${basename(file)} is not known`);

  // QA-FPS: the rate is read as the fraction the stream declares and, from its packet times, as the rate it keeps; 29.97 is 30000/1001
  { const f = fpsCheck(file, video, fps); add('QA-FPS', f.status, f.evidence); }

  // QA-BITRATE: the video stream's bits a second against what a picture of this size at this rate may take
  {
    const dur = Number(video.duration ?? info.format?.duration);
    const bps = Number(video.bit_rate) > 0 ? Number(video.bit_rate) : (Number(info.format?.size) > 0 && dur > 0 ? Math.round((Number(info.format.size) * 8) / dur) : NaN);
    if (!Number.isFinite(bps)) rest('QA-BITRATE', 'the file does not say its video bitrate');
    else {
      const band = bitrateBand({ width: video.width, height: video.height, fps: rate });
      const { side } = bitrateVerdict(bps, band);
      const kbps = (x) => `${Math.round(x / 1000)} kbit/s`;
      add('QA-BITRATE', side ? 'FAIL' : 'PASS', { measured: Math.round(bps), threshold: `${kbps(band.lo)} to ${kbps(band.hi)} (${BITRATE_BPP.lo} to ${BITRATE_BPP.hi} bits a pixel a frame)`, bitsPerPixel: Math.round((bps / (video.width * video.height * rate)) * 1e5) / 1e5,
        ...(side ? { reason: `${kbps(bps)} is ${side === 'low' ? 'below' : 'above'} ${kbps(side === 'low' ? band.lo : band.hi)}, the ${side === 'low' ? 'least' : 'most'} a ${video.width}x${video.height} picture at ${r3(rate)} fps should take` } : {}) });
    }
  }

  // QA-AUDIO and the checks that need its sound
  const real = info.streams.find((s) => s.codec_type === 'audio' && s.tags?.handler_name !== 'silent');
  const sounding = story ? story.kind !== 'deck' && mixable(story, style) : null;
  const videoS = Number(video.duration ?? info.format?.duration);
  const muxed = 'mm export writes a silent placeholder track; `mm sound` muxes the mix: run `mm verify-export` after it';
  if (phase === 'export' && sounding) {
    for (const id of ['QA-AUDIO', 'QA-SILENCE', 'QA-LEVEL']) rest(id, muxed);
  } else {
    if (sounding === false) add('QA-AUDIO', 'PASS', { reason: 'the piece has no sound', placeholderOnly: !real });
    else if (sounding === null) add('QA-AUDIO', real ? 'PASS' : 'SKIP', real ? { codec: real.codec_name } : { reason: `${why}: cannot tell whether it should sound` });
    else if (!real) add('QA-AUDIO', 'FAIL', { reason: 'the piece has sound but the MP4 has none (only the placeholder track): run `mm sound`' });
    else {
      const aS = Number(real.duration ?? info.format?.duration), off = Math.abs(aS - videoS);
      add('QA-AUDIO', off <= DURATION_TOL_S ? 'PASS' : 'FAIL', { codec: real.codec_name, audioS: r3(aS), videoS: r3(videoS), ...(off <= DURATION_TOL_S ? {} : { reason: `the sound runs ${r3(aS)} s against a picture of ${r3(videoS)} s` }) });
    }
    if (!real) { rest('QA-SILENCE', 'no sound in the file'); rest('QA-LEVEL', 'no sound in the file'); }
    else {
      const sil = await ffmpeg(['-i', file, '-vn', '-af', `silencedetect=n=${SILENCE_DB}dB:d=${SILENCE_MAX_S}`, '-f', 'null', '-']);
      const spans = silentSpans(sil.stderr, Number(real.duration ?? info.format?.duration)).map((s) => ({ start: r3(s.start), end: r3(s.end) }));
      add('QA-SILENCE', spans.length ? 'FAIL' : 'PASS', { threshold: `no silence over ${SILENCE_MAX_S} s under ${SILENCE_DB} dB`, spans, ...(spans.length ? { reason: `silent from ${spans[0].start} to ${spans[0].end} s (${r3(spans[0].end - spans[0].start)} s)${spans.length > 1 ? ` and ${spans.length - 1} more` : ''}` } : {}) });
      const target = style?.sound?.loudnessLufs ?? TARGET_LUFS;
      const m = await measureLoudness(file);
      const lufs = m ? r3(m.lufs) : null, peak = m ? r3(m.truePeak) : null;
      const bad = m && (!(m.truePeak <= TRUE_PEAK_MAX) || !(Math.abs(m.lufs - target) <= TOLERANCE_LU));
      add('QA-LEVEL', !m ? 'SKIP' : bad ? 'FAIL' : 'PASS', m ? { lufs, truePeak: peak, threshold: `${target} LUFS ±${TOLERANCE_LU}, true peak ≤ ${TRUE_PEAK_MAX} dBTP`, ...(bad ? { reason: `${lufs} LUFS and ${peak} dBTP against ${target} LUFS ±${TOLERANCE_LU} and ${TRUE_PEAK_MAX} dBTP` } : {}) } : { reason: 'no sound to measure' });
    }
  }

  // QA-BLACK and QA-FROZEN, from one pass over the picture
  const det = await ffmpeg(['-i', file, '-an', '-vf', `blackdetect=d=${BLACK_MIN_S}:pic_th=${BLACK_PIC_TH}:pix_th=${BLACK_PIX_TH},freezedetect=n=${FREEZE_NOISE_DB}dB:d=${FREEZE_MIN_S}`, '-f', 'null', '-']);
  const blackOk = style ? canvasIsBlack(style) : false;
  const blacks = blackSpans(det.stderr).map((s) => ({ start: r3(s.start), end: r3(s.end) }));
  if (det.code !== 0) { rest('QA-BLACK', 'ffmpeg could not run its detectors'); rest('QA-FROZEN', 'ffmpeg could not run its detectors'); } else {
    if (blackOk) add('QA-BLACK', 'SKIP', { reason: 'the style\'s canvas is itself black: a black frame cannot be told from the stage', spans: blacks });
    else add('QA-BLACK', blacks.length ? 'FAIL' : 'PASS', { threshold: `no black span of ${BLACK_MIN_S} s or more`, spans: blacks, ...(blacks.length ? { reason: `black from ${blacks[0].start} to ${blacks[0].end} s${blacks.length > 1 ? ` and ${blacks.length - 1} more` : ''}` } : {}) });
    const frozen = frozenSpans(det.stderr, videoS).map((s) => ({ start: r3(s.start), end: r3(s.end) }));
    if (walkthrough) add('QA-FROZEN', 'SKIP', { reason: 'a walkthrough holds every rest on purpose', spans: frozen });
    else if (!sched) add('QA-FROZEN', 'SKIP', { reason: `${why}: a rest cannot be told from a freeze`, spans: frozen });
    else {
      let cand = frozenFaults(frozen, sched, fps ?? rate, o.drawn ?? drawnFrames(dir, format));
      // the page drew different frames there: whether it moved visibly is asked of the page itself, so a
      // change the encode could not show (antialiasing settling by a level) is not taken for lost motion
      if (cand.length && o.browser && dir && format) cand = await pageMovedSpans(cand, { dir, format, browser: o.browser, file, width: video.width, height: video.height });
      const faults = cand.map((s) => ({ start: r3(s.start), end: r3(s.end), inMotion: r3(s.inMotion) }));
      add('QA-FROZEN', faults.length ? 'FAIL' : 'PASS', { threshold: `no frozen span of ${FREEZE_MIN_S} s or more with ${FREEZE_CORE_S} s of it in the middle of a motion`, spans: frozen, faults, ...(faults.length ? { reason: `frozen from ${faults[0].start} to ${faults[0].end} s while the story moves (${faults[0].inMotion} s of it where an arrival, exit, move or cut is mid-motion)` } : {}) });
    }
  }

  // QA-DECODE: frames decoded from the file are the frames the page draws cold
  {
    const sub = o.sub ?? (dir ? exportedSub(dir) : null);
    if (!sched || !dir) rest('QA-DECODE', why ?? 'no piece given: there is nothing to draw cold');
    else if (walkthrough) rest('QA-DECODE', 'a walkthrough holds rests and plays transitions between presses: its frames are not instants of a clock');
    else if (sub == null) rest('QA-DECODE', 'out/export.json is missing, so how the file was made (--sub) is not known');
    else if (sub > 1) rest('QA-DECODE', `exported with --sub ${sub}: each frame blends ${sub} instants, so one cold frame is not its match`);
    else {
      try {
        const got = await decodeProof(file, { dir, format, browser: o.browser, fps: fps ?? rate, frames, width: video.width, height: video.height });
        const missing = got.find((g) => g.mae == null);
        const off = got.find((g) => g.mae != null && (g.mae > DECODE_MAE_MAX || g.big > DECODE_BIG_SHARE));
        const threshold = `mean difference at most ${DECODE_MAE_MAX} of 255, and at most ${DECODE_BIG_SHARE * 100}% of samples off by more than ${DECODE_BIG}`;
        if (missing) add('QA-DECODE', 'FAIL', { frames: got, threshold, reason: `frame ${missing.frame} could not be decoded from the file at ${video.width}x${video.height}` });
        else add('QA-DECODE', off ? 'FAIL' : 'PASS', { frames: got, threshold, ...(off ? { reason: `frame ${off.frame} decoded from the file differs from the frame drawn cold at ${off.t} s (mean difference ${off.mae} of 255, ${r3(off.big * 100)}% of samples far off)` } : {}) });
      } catch (e) { rest('QA-DECODE', `the page could not be opened to draw the frames cold: ${e.message.split('\n')[0]}`); }
    }
  }

  // QA-SEAM
  if (!sched || walkthrough) rest('QA-SEAM', walkthrough ? 'a deck cuts on presses, not on a clock' : why);
  else if (sched.scenes.length < 2) rest('QA-SEAM', 'one scene: no cut');
  else if (!o.sheetBase) rest('QA-SEAM', 'no place to write the evidence sheet was given');
  else {
    try {
      const seams = sched.scenes.slice(1).map((s) => ({ t: s.start, scene: s.id, d: s.cut?.d ?? 0 }));
      const r = await filmSeams(file, seams, { fps: fps ?? rate, frames, blackOk, browser: o.browser, sheetBase: o.sheetBase, events: sched.events });
      add('QA-SEAM', r.issues.length ? 'FAIL' : 'PASS', { seams: r.seams.length, sheets: r.sheets.map((f) => (dir ? relative(dir, f) : f)), issues: r.issues, rows: r.seams,
        ...(r.issues.length ? { reason: `${r.issues[0].scene}: ${r.issues[0].reason}${r.issues.length > 1 ? ` (and ${r.issues.length - 1} more)` : ''}` } : {}) });
    } catch (e) { add('QA-SEAM', 'SKIP', { reason: `the seams could not be read: ${e.message.split('\n')[0]}` }); }
  }
  return finish(file, format, rows);
}

/**
 * The alpha channel of a transparent export, read back: for the sampled frame that has the most solid pixels, a corner
 * the page left clear must be clear in the file, and a pixel the page drew solid (all nine around it) must be solid.
 */
async function alphaProof(file, { dir, format, browser, fps, frames, width, height, decoder }) {
  const { openPiece, framePng } = await import('./browser.mjs');
  const { decodePng } = await import('../check/_pixels.mjs');
  const at = [...new Set([0, Math.floor((frames - 1) / 2), frames - 1])];
  const opened = await openPiece(dir, { format, alpha: true, ...(browser ? { browser } : {}) });
  try {
    let best = null;
    for (const k of at) {
      const cold = decodePng(await framePng(opened.page, k / fps, { alpha: true }));
      let solid = 0;
      for (let i = 3; i < cold.data.length; i += 4) if (cold.data[i] === 255) solid++;
      if (!best || solid > best.solid) best = { k, cold, solid };
    }
    const { k, cold } = best;
    const a = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];
    const corners = [[2, 2], [cold.width - 3, 2], [2, cold.height - 3], [cold.width - 3, cold.height - 3]].filter(([x, y]) => a(cold, x, y) === 0);
    // the solid pixel nearest the middle whose neighbours are solid too (an antialiased edge is neither)
    let solid = null, bestD = Infinity;
    const cx = cold.width / 2, cy = cold.height / 2;
    for (let y = 1; y < cold.height - 1; y++) for (let x = 1; x < cold.width - 1; x++) {
      if (a(cold, x, y) !== 255) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d >= bestD) continue;
      let all = true;
      for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1; dx++) if (a(cold, x + dx, y + dy) !== 255) { all = false; break; }
      if (all) { solid = [x, y]; bestD = d; }
    }
    const got = frameAt(file, k, width, height, { decoder });
    return { frame: k, t: r3(k / fps), got: !!got, corners, solid, file: got ? { corner: corners.map(([x, y]) => a(got, x, y)), solid: solid ? a(got, solid[0], solid[1]) : null } : null };
  } finally { await opened.close(); }
}

/**
 * Checks one transparent export (<id>-<format>.webm or .mov): the stream, the decoded frame count, the size, the rate, and
 * the alpha channel itself (QA-ALPHA). Returns { file, format, ok, checks }, as verifyFile does.
 */
export async function verifyAlphaFile(file, o = {}) {
  const { dir = null } = o;
  const rows = [];
  const add = (id, status, evidence) => rows.push(rule(id, status, evidence));
  const rest = (id, reason) => add(id, 'SKIP', { reason });
  let info;
  try { info = probe(file); } catch (e) { add('QA-STREAM', 'FAIL', { reason: `the file cannot be read: ${e.message.split('\n')[0]}` }); for (const id of ['QA-FRAMES', 'QA-SIZE', 'QA-FPS', 'QA-ALPHA']) rest(id, 'the file cannot be read'); return finish(file, null, rows); }
  const video = info.streams.find((s) => s.codec_type === 'video');
  if (!video) { add('QA-STREAM', 'FAIL', { reason: 'no video stream' }); for (const id of ['QA-FRAMES', 'QA-SIZE', 'QA-FPS', 'QA-ALPHA']) rest(id, 'no video stream'); return finish(file, null, rows); }
  const frames = Number(video.nb_read_frames ?? video.nb_frames);
  const rate = fractionOf(video.r_frame_rate)?.value ?? NaN;
  add('QA-STREAM', frames > 0 ? 'PASS' : 'FAIL', { codec: video.codec_name, profile: video.profile ?? null, pixFmt: video.pix_fmt, frames, ...(frames > 0 ? {} : { reason: 'the video stream holds no frames' }) });
  const format = formatOfFile(file);
  let sched = null, why = null;
  if (dir && format && VIEWPORTS[format]) {
    try {
      const story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8')), style = JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8'));
      if (!story.formats.includes(format) || story.kind === 'deck') why = `the story does not ship ${format} as a film`; else sched = await scheduleFor(dir, story, style, format);
    } catch (e) { why = `the piece could not be read: ${e.message.split('\n')[0]}`; }
  } else why = dir ? `the format of ${basename(file)} is not known` : 'no piece given (--piece): the story is not known';
  const fps = o.fps ?? null;
  if (sched) {
    const want = Math.round(sched.duration * (fps ?? rate));
    const declared = Number.isFinite(Number(video.nb_frames)) ? Number(video.nb_frames) : null;
    const bad = frames !== want ? `decoded ${frames} frames; round(duration x fps) is ${want}` : declared != null && declared !== frames ? `the container declares ${declared} frames but ${frames} decode` : null;
    add('QA-FRAMES', bad ? 'FAIL' : 'PASS', { decoded: frames, declared, expected: want, ...(bad ? { reason: bad } : {}) });
  } else rest('QA-FRAMES', why);
  if (format && VIEWPORTS[format]) {
    const want = { width: even(VIEWPORTS[format].width), height: even(VIEWPORTS[format].height) };
    const ok = video.width === want.width && video.height === want.height;
    add('QA-SIZE', ok ? 'PASS' : 'FAIL', { measured: `${video.width}x${video.height}`, expected: `${want.width}x${want.height}`, format, ...(ok ? {} : { reason: `${video.width}x${video.height}, ${format} is ${want.width}x${want.height}` }) });
  } else rest('QA-SIZE', `the format of ${basename(file)} is not known`);
  { const f = fpsCheck(file, video, fps); add('QA-FPS', f.status, f.evidence); }
  if (!sched || !dir) rest('QA-ALPHA', why);
  else {
    try {
      const decoder = video.codec_name === 'vp9' ? 'libvpx-vp9' : undefined;   // the native VP9 decoder drops the alpha plane
      const p = await alphaProof(file, { dir, format, browser: o.browser, fps: fps ?? rate, frames, width: video.width, height: video.height, decoder });
      const threshold = `a corner the page left clear reads at most ${ALPHA_CLEAR_MAX} of 255 in the file, a pixel it drew solid at least ${ALPHA_SOLID_MIN}`;
      if (!p.got) add('QA-ALPHA', 'FAIL', { frame: p.frame, threshold, reason: `frame ${p.frame} could not be decoded from the file${decoder ? ` with ${decoder}` : ''}` });
      else if (!p.corners.length) add('QA-ALPHA', 'FAIL', { frame: p.frame, threshold, reason: 'the page drew every corner opaque: --alpha asked for a transparent canvas and the piece paints over it (a layout or ground that fills the frame)' });
      else {
        const cornerBad = p.file.corner.find((v) => v > ALPHA_CLEAR_MAX);
        const solidBad = p.solid && p.file.solid < ALPHA_SOLID_MIN;
        const reason = cornerBad !== undefined ? `a corner the page left clear reads alpha ${cornerBad} in the file: the transparency was lost` : solidBad ? `a pixel the page drew solid reads alpha ${p.file.solid} in the file` : null;
        if (reason) add('QA-ALPHA', 'FAIL', { frame: p.frame, threshold, corner: { page: 0, file: Math.max(...p.file.corner) }, solid: p.solid ? { at: p.solid, page: 255, file: p.file.solid } : null, reason });
        else if (!p.solid) add('QA-ALPHA', 'SKIP', { frame: p.frame, threshold, reason: 'the page drew nothing solid in the sampled frames, so only the clear corner was read back', corner: { page: 0, file: Math.max(...p.file.corner) } });
        else add('QA-ALPHA', 'PASS', { frame: p.frame, t: p.t, threshold, corner: { page: 0, file: Math.max(...p.file.corner) }, solid: { at: p.solid, page: 255, file: p.file.solid } });
      }
    } catch (e) { rest('QA-ALPHA', `the page could not be opened to draw the frame cold: ${e.message.split('\n')[0]}`); }
  }
  return finish(file, format, rows);
}

function finish(file, format, rows) {
  return { file, format, ok: rows.every((r) => r.status !== 'FAIL'), checks: rows };
}

/** One line per file and one per failed check, for the terminal. */
export function verdictLines(report, { cwd = process.cwd() } = {}) {
  const out = [];
  for (const f of report.files) {
    const tally = (s) => f.checks.filter((c) => c.status === s).length;
    out.push(`${f.ok ? 'ok  ' : 'FAIL'} ${relative(cwd, f.file) || f.file}: ${tally('PASS')} pass, ${tally('FAIL')} fail, ${tally('SKIP')} skipped`);
    for (const c of f.checks) if (c.status === 'FAIL') out.push(`     ${c.id}: ${c.evidence.reason ?? 'failed'}`);
    for (const c of f.checks) if (c.status === 'SKIP' && c.id !== 'QA-SEAM') out.push(`     ${c.id} skipped: ${c.evidence.reason}`);
  }
  return out;
}

/**
 * Checks each MP4 of a piece and writes <dir>/out/export-qa.json.
 * @param {string} dir  the piece folder
 * @param {string[]} files  MP4 paths
 * @param {object} o  phase, fps, walkHoldS, browser (see verifyFile); `merge`: keep the earlier report's rows for other files (one MP4 checked on its own)
 * @returns {Promise<{ok: boolean, file: string, report: object}>}  `ok` and `report` are about the files checked now
 */
export async function verifyExport(dir, files, o = {}) {
  const outDir = join(resolve(dir), 'out');
  const file = join(outDir, 'export-qa.json');
  const results = [];
  for (const f of files) {
    const sheetBase = join(outDir, `export-qa-seams-${formatOfFile(f) ?? basename(f).replace(/\.mp4$/i, '')}`);
    const check = /\.(webm|mov)$/i.test(f) ? verifyAlphaFile : verifyFile;
    results.push({ ...(await check(f, { ...o, dir: resolve(dir), sheetBase })), phase: o.phase ?? 'final' });
  }
  let kept = [];
  if (o.merge && existsSync(file)) {
    try { kept = (JSON.parse(readFileSync(file, 'utf8')).files ?? []).filter((x) => !files.some((f) => resolve(f) === resolve(x.file)) && existsSync(x.file)); } catch { kept = []; }
  }
  const all = [...kept, ...results];
  const report = { version: 1, piece: resolve(dir), ok: all.every((r) => r.ok), files: all };
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return { ok: results.every((r) => r.ok), file, report: { ...report, files: results } };
}

/** The piece an MP4 in `<piece>/out/` belongs to, or null. */
export function pieceOf(mp4) {
  const dir = dirname(resolve(mp4));
  return basename(dir) === 'out' && existsSync(join(dirname(dir), 'story.json')) ? dirname(dir) : null;
}
