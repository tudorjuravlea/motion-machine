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

/** The format in a film's file name `<id>-<format>.mp4`, or null. */
export const formatOfFile = (file) => /-(\d+x\d+)\.mp4$/.exec(basename(file))?.[1] ?? null;

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
  const ALL = ['QA-DURATION', 'QA-SIZE', 'QA-FPS', 'QA-AUDIO', 'QA-BLACK', 'QA-FROZEN', 'QA-SILENCE', 'QA-LEVEL', 'QA-SEAM'];

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

  // QA-DURATION
  if (sched) {
    const want = walkthrough ? walkthroughFrames(sched, { fps: fps ?? rate, holdS: o.walkHoldS ?? 2 }) : Math.round(sched.duration * (fps ?? rate));
    const ok = frames === want;
    add('QA-DURATION', ok ? 'PASS' : 'FAIL', { measured: frames, expected: want, seconds: r3(frames / rate), ...(ok ? {} : { reason: `${frames} frames, the story makes ${want} (${r3(want / (fps ?? rate))} s at ${fps ?? rate} fps)` }) });
  } else rest('QA-DURATION', why);

  // QA-SIZE
  if (format && VIEWPORTS[format]) {
    const want = { width: even(VIEWPORTS[format].width), height: even(VIEWPORTS[format].height) };
    const ok = video.width === want.width && video.height === want.height;
    add('QA-SIZE', ok ? 'PASS' : 'FAIL', { measured: `${video.width}x${video.height}`, expected: `${want.width}x${want.height}`, format, ...(ok ? {} : { reason: `${video.width}x${video.height}, ${format} is ${want.width}x${want.height}` }) });
  } else rest('QA-SIZE', `the format of ${basename(file)} is not known`);

  // QA-FPS
  const [an, ad] = String(video.avg_frame_rate).split('/').map(Number);
  const constant = Math.abs((ad ? an / ad : an) - rate) < 0.01;
  if (fps != null) {
    const ok = Math.abs(rate - fps) < 0.01 && constant;
    add('QA-FPS', ok ? 'PASS' : 'FAIL', { measured: r3(rate), expected: fps, ...(ok ? {} : { reason: `${r3(rate)} fps${constant ? '' : ' (not constant)'}, asked for ${fps}` }) });
  } else add('QA-FPS', constant ? 'PASS' : 'FAIL', { measured: r3(rate), note: 'the rate asked for is not known; checked for being constant', ...(constant ? {} : { reason: `average ${r3(ad ? an / ad : an)} fps against ${r3(rate)}: not constant` }) });

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
    results.push({ ...(await verifyFile(f, { ...o, dir: resolve(dir), sheetBase })), phase: o.phase ?? 'final' });
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
