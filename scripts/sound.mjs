#!/usr/bin/env node
// `mm sound [piece] [--formats a,b] [--patterns dir]` (SPEC §9).
//
//   schedule cue events ──► snap to the beat grid (drift recorded) ──► render each distinct cue once
//   through an OfflineAudioContext in a Playwright page ──► place at sample accuracy into a cue stem
//   (and tile the bed into a bed stem) ──► ffmpeg: track + bed + cues, amix normalize=0, 48 kHz,
//   two-pass loudnorm, padded or trimmed to the picture ──► out/mix.wav, out/cues.json, muxed MP4s.
//
// Level staging (provisional, one place): the bed sits 6 dB under a supplied track (by loudness);
// without a track the bed is staged under the cues; every cue peak lands 6-8 dB above the bed
// (target 7); with a track and no bed the loudest cue peaks 4 dB under the track's peak.
// The loudnorm ceiling is -1.5 dBTP, leaving room for the AAC encode under the gate's -1 dBTP; a
// sparse, peaky cue mix that linear loudnorm cannot bring to the target goes through a second stage
// (limiter, then linear gain; see mixdown), checked on a trial AAC encode, and the stage is recorded
// in out/cues.json.
// It holds the piece's export lock (scripts/lib/export-lock.mjs) for its run, since it rewrites the
// MP4s: beside another `mm export` or `mm sound` it exits 2 at once.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs as parseFlags } from 'node:util';
import { ROOT } from './lib/browser.mjs';
import { isArgsError, resolvePiece, usageText, UsageError } from './lib/cli.mjs';
import { ExportBusy, holdForExport } from './lib/story-edit.mjs';
import { patternsBaseOf } from './lib/patterns-base.mjs';
import { inputOf } from './lib/ffmpeg.mjs';
import { decodePcm } from './beats.mjs';
import { schedule as buildSchedule } from '../runtime/kit/schedule.js';
import { DRIFT_S, beatsOf, cueEvents, cueName, nearest } from './lib/cues.mjs';

export { DRIFT_S, beatsOf, cueEvents, cueName, nearest };

export { ROOT };
export const SR = 48000;
export const COOLDOWN_S = 0.045;
export const BED_BAND_DB = [6, 8];
const BED_TARGET_DB = 7;
const BED_UNDER_TRACK_DB = 6;
const CUE_UNDER_TRACK_PEAK_DB = 4;
const LOUDNORM_TP = -1.5;
const TOLERANCE_LU = 1;           // W-LOUDNESS's band (target ± 1 LU) and G-PEAK's ceiling (true peak ≤ -1 dBTP), on the shipped file
const TRUE_PEAK_MAX = -1;
const STAGE2_UNDER_LU = 0.5;      // stage 2 runs when stage 1 lands more than this under the target
const STAGE2_TRIES = 4;
const STAGE2_MAX_GAIN_DB = 40;
const TAIL_S = 0.5;

// --------------------------------------------------------------------------------------------
// process helpers

export function run(cmd, args, { cwd } = {}) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', (c) => { stdout += c; });
    p.stderr.on('data', (c) => { stderr += c; });
    p.on('error', (e) => fail(Object.assign(new Error(`${cmd} is required but could not be run: ${e.message}`), { setup: true })));
    p.on('close', (code) => ok({ code, stdout, stderr }));
  });
}

export async function ffmpeg(args) {
  const r = await run('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args]);
  if (r.code !== 0) throw new Error(`ffmpeg failed (${args.slice(0, 6).join(' ')} …): ${r.stderr.trim().split('\n').slice(-3).join(' | ')}`);
  return r;
}

export async function probe(file) {
  const r = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', ...(/\.wav$/i.test(file) ? ['-f', 'wav'] : []), file]);
  if (r.code !== 0) throw new Error(`ffprobe cannot read ${file}: ${r.stderr.trim()}`);
  return JSON.parse(r.stdout);
}

/** Seconds of the first stream of `kind` ('video' | 'audio'), else null. */
export async function streamSeconds(file, kind) {
  const info = await probe(file);
  const s = info.streams.find((x) => x.codec_type === kind);
  if (!s) return null;
  const d = Number(s.duration ?? info.format?.duration);
  return Number.isFinite(d) ? d : null;
}

export async function hasAudio(file) {
  return (await probe(file)).streams.some((s) => s.codec_type === 'audio' && s.tags?.handler_name !== 'silent');   // export's placeholder track is not sound
}

/** Integrated loudness (LUFS), loudness range and true peak (dBTP) by ffmpeg's ebur128; null without audio. */
export async function measureLoudness(file) {
  if (!(await hasAudio(file))) return null;
  const r = await run('ffmpeg', ['-hide_banner', '-nostdin', '-nostats', ...inputOf(file), '-vn', '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-']);
  const text = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const num = (re) => { const m = text.match(re); return m ? Number(m[1]) : null; };
  const lufs = num(/I:\s+(-?[\d.]+|-inf)\s+LUFS/) ?? (/I:\s+-inf/.test(text) ? -Infinity : null);
  const truePeak = num(/Peak:\s+(-?[\d.]+)\s+dBFS/);
  if (lufs == null) throw new Error(`ebur128 gave no summary for ${file}`);
  return { lufs, lra: num(/LRA:\s+(-?[\d.]+)\s+LU/), truePeak: truePeak ?? -Infinity };
}

// --------------------------------------------------------------------------------------------
// shared with the gates

/** The beat grid a story declares (`audio.beats`, relative to the piece); `missing` is that path as written. */
export function loadGrid(dir, story) {
  const rel = story?.audio?.beats;
  if (!rel) return { beats: null, declared: false };
  const file = resolve(dir, rel);
  if (!existsSync(file)) return { beats: null, declared: true, missing: rel };   // as written: the evidence a browser gives too
  return { beats: beatsOf(JSON.parse(readFileSync(file, 'utf8'))), declared: true, file };
}

/** Where the sound patterns live: explicit, else the piece's own base, then `<dir>/patterns`, `<dir>/../patterns`, then the repo's. */
export function resolvePatternsBase(dir, explicit) {
  const cands = [explicit ?? patternsBaseOf(dir), join(dir, 'patterns'), join(dir, '..', 'patterns'), join(ROOT, 'patterns')].filter(Boolean).map((p) => resolve(p));
  return cands.find((p) => existsSync(join(p, 'sound'))) ?? (explicit ? resolve(explicit) : join(ROOT, 'patterns'));
}

/** Imports sound pattern modules in Node (they are deterministic and DOM-free): name → module | null. */
export async function loadCueModules(names, patternsBase) {
  const out = {};
  for (const n of new Set(names)) {
    const file = join(patternsBase, 'sound', n, 'pattern.js');
    try { out[n] = existsSync(file) ? (await import(pathToFileURL(file).href)).default ?? null : null; } catch { out[n] = null; }
  }
  return out;
}

// --------------------------------------------------------------------------------------------
// WAV and buffers

function floatWav(chans, sr = SR) {
  const n = chans[0].length, ch = chans.length;
  const buf = Buffer.alloc(44 + n * ch * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * ch * 4, 28); buf.writeUInt16LE(ch * 4, 32); buf.writeUInt16LE(32, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * ch * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) buf.writeFloatLE(chans[c][i], 44 + (i * ch + c) * 4);
  return buf;
}

const peakOf = (chans) => { let p = 0; for (const c of chans) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; } return p; };
const toDb = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const fromDb = (d) => 10 ** (d / 20);
const round = (x, p = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** p) / 10 ** p : x);

function addInto(stem, src, at, gain) {
  const start = Math.round(at * SR);
  for (let c = 0; c < stem.length; c++) {
    const s = src[Math.min(c, src.length - 1)], d = stem[c];
    for (let i = 0, j = start; i < s.length && j < d.length; i++, j++) if (j >= 0) d[j] += s[i] * gain;
  }
}

// --------------------------------------------------------------------------------------------
// the plan: cues from the schedule, snapped to the grid

/**
 * @param {{t:number,name:string,selector?:string,scene?:string}[]} cues  schedule cue events
 * @param {number[]|null} beats  the grid, or null
 * @returns cues with { at, snappedFrom, driftMs } — `at` is where the sound plays
 */
export function planCues(cues, beats) {
  const plan = cues.map((c) => {
    const grid = beats && c.name !== 'bed' ? nearest(beats, c.t) : null;
    const drift = grid == null ? 0 : grid - c.t;
    return { ...c, requestedAt: c.t, at: grid ?? c.t, snappedFrom: grid != null && Math.abs(drift) > 1e-6 ? c.t : null, driftMs: grid != null ? Math.round(drift * 1000) : null };
  });
  // Snapping must not merge two retriggers of one cue under the cooldown: the later keeps its own instant.
  const last = new Map();
  for (const c of plan) {
    const prev = last.get(c.name);
    if (prev != null && c.at - prev < COOLDOWN_S && c.snappedFrom != null) { c.at = c.requestedAt; c.snappedFrom = null; c.driftMs = 0; }
    last.set(c.name, c.at);
  }
  return plan;
}

// --------------------------------------------------------------------------------------------
// rendering in the page

async function renderInPage(page, serverUrl, patternsRel, items) {
  const urls = items.map((it) => ({ ...it, url: `${serverUrl}/${patternsRel}/sound/${it.name}/pattern.js` }));
  const res = await page.evaluate(async ({ items, sr, tail }) => {
    const b64 = (f32) => {
      const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    };
    const out = [];
    for (const it of items) {
      const mod = (await import(it.url)).default;
      if (!mod || typeof mod.render !== 'function') throw new Error(`sound pattern ${it.name} has no render(ctx, at, feel)`);
      const durationS = Number(mod.durationS ?? 1);
      const ctx = new OfflineAudioContext(2, Math.ceil((durationS + tail) * sr), sr);
      mod.render(ctx, 0, it.feel);
      const buf = await ctx.startRendering();
      out.push({ name: it.name, durationS, channels: [b64(buf.getChannelData(0)), b64(buf.getChannelData(Math.min(1, buf.numberOfChannels - 1)))] });
    }
    return out;
  }, { items: urls, sr: SR, tail: TAIL_S });
  return Object.fromEntries(res.map((r) => [r.name, {
    durationS: r.durationS,
    channels: r.channels.map((s) => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }),
  }]));
}

// --------------------------------------------------------------------------------------------
// the mix

const fit = (D) => `apad=whole_dur=${D},atrim=0:${D},asetpts=N/SR/TB`;
const AAC = ['-c:a', 'aac', '-b:a', '192k', '-ar', String(SR)];

/** Two-pass loudnorm of `chain` (a filter graph ending in one unlabelled output) into `out`; linear when the measured peak allows it. */
async function loudnormTwoPass(args, chain, { target, tp, D, out }) {
  const ln = `I=${target}:TP=${tp}:LRA=20`;
  const p1 = await run('ffmpeg', ['-hide_banner', '-nostdin', '-nostats', ...args, '-filter_complex', `${chain},loudnorm=${ln}:print_format=json[o]`, '-map', '[o]', '-f', 'null', '-']);
  const m = p1.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (p1.code !== 0 || !m) throw new Error(`loudnorm pass 1 failed: ${p1.stderr.trim().split('\n').slice(-3).join(' | ')}`);
  const j = JSON.parse(m[0]);
  const silent = !Number.isFinite(Number(j.input_i));
  const second = silent ? `${chain}[o]`
    : `${chain},loudnorm=${ln}:measured_I=${j.input_i}:measured_LRA=${j.input_lra}:measured_TP=${j.input_tp}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=${SR},${fit(D)}[o]`;
  await ffmpeg([...args, '-filter_complex', second, '-map', '[o]', '-ar', String(SR), '-c:a', 'pcm_s24le', out]);
  // ffmpeg's loudnorm stays linear only when the measured peak plus the gain fits under TP; otherwise it falls back to its dynamic mode.
  const linear = !silent && Number(j.input_tp) + (target - Number(j.input_i)) <= tp;
  return { silent, linear, inputLufs: Number(j.input_i), inputTruePeak: Number(j.input_tp) };
}

/** Loudness of `wav` as it will ship: encoded with the mux's AAC settings, measured by ebur128. */
async function measureShipped(wav) {
  const tmp = join(dirname(wav), `.${basename(wav)}.shipped.m4a`);
  await ffmpeg([...inputOf(wav), ...AAC, tmp]);
  try { return await measureLoudness(tmp); } finally { rmSync(tmp, { force: true }); }
}

const within = (m, s, target) => m.lufs >= target - STAGE2_UNDER_LU && Math.abs(s.lufs - target) <= TOLERANCE_LU && s.truePeak <= TRUE_PEAK_MAX;

/**
 * Stage 1: two-pass linear loudnorm with the ceiling at -1.5 dBTP. A sparse, peaky cue mix cannot
 * reach the target that way (its peak-to-loudness ratio is wider than target-to-ceiling), and the
 * AAC encode can lift true peak by up to a dB on hard transients. Stage 2, when the mix lands more
 * than 0.5 LU under the target or the trial AAC encode peaks over -1 dBTP: pre-gain, a true-peak
 * limiter (alimiter, 4× oversampled) at the ceiling, then a measured linear gain down to the target;
 * if the trial encode still peaks over -1 dBTP the ceiling is lowered by the overshoot and stage 2
 * runs again. Every attempt is measured and returned.
 */
async function mixdown({ inputs, D, target, out }) {
  const args = inputs.flatMap((f) => inputOf(f));
  const prep = inputs.map((_, i) => `[${i}:a]aformat=sample_fmts=fltp:sample_rates=${SR}:channel_layouts=stereo[a${i}]`);
  const mixer = inputs.length > 1
    ? `${inputs.map((_, i) => `[a${i}]`).join('')}amix=inputs=${inputs.length}:normalize=0:dropout_transition=0:duration=longest[m]`
    : '[a0]anull[m]';
  const base = `${prep.join(';')};${mixer};[m]${fit(D)}`;
  const s1 = await loudnormTwoPass(args, base, { target, tp: LOUDNORM_TP, D, out });
  if (s1.silent) return { stage: 'silent', linear: false, attempts: [] };
  const record = (stage, extra, m, s) => ({ stage, ...extra, lufs: round(m.lufs), truePeak: round(m.truePeak), shippedLufs: round(s.lufs), shippedTruePeak: round(s.truePeak) });
  let m = await measureLoudness(out), s = await measureShipped(out);
  const attempts = [record('loudnorm', { linear: s1.linear, ceiling: LOUDNORM_TP, inputLufs: round(s1.inputLufs), inputTruePeak: round(s1.inputTruePeak) }, m, s)];
  if (within(m, s, target)) return { stage: 'loudnorm', linear: s1.linear, attempts };

  const pre = join(dirname(out), `.${basename(out)}.limited.wav`);
  let ceiling = LOUDNORM_TP;
  try {
    for (let k = 0; k < STAGE2_TRIES; k++) {
      // Pre-gain until the limited mix sits at least 0.2 LU over the target, so the final gain is a cut (it can only lower peaks).
      let gain = target - s1.inputLufs + 1, lim = null;
      for (let g = 0; g < 6; g++) {
        await ffmpeg([...args, '-filter_complex', `${base},volume=${gain.toFixed(2)}dB,aresample=${SR * 4},alimiter=limit=${fromDb(ceiling).toFixed(5)}:attack=5:release=80:level=false,aresample=${SR},${fit(D)}[o]`,
          '-map', '[o]', '-ar', String(SR), '-c:a', 'pcm_f32le', pre]);
        lim = await measureLoudness(pre);
        if (lim.lufs >= target + 0.2 || gain >= STAGE2_MAX_GAIN_DB) break;
        gain = Math.min(STAGE2_MAX_GAIN_DB, gain + 2 * (target + 0.5 - lim.lufs));
      }
      const cut = Math.min(0, target - lim.lufs);
      await ffmpeg([...inputOf(pre), '-af', `volume=${cut.toFixed(3)}dB,${fit(D)}`, '-ar', String(SR), '-c:a', 'pcm_s24le', out]);
      m = await measureLoudness(out); s = await measureShipped(out);
      attempts.push(record('limiter', { ceiling: round(ceiling), preGainDb: round(gain), finalGainDb: round(cut, 3) }, m, s));
      if (within(m, s, target)) break;
      if (s.truePeak > TRUE_PEAK_MAX) ceiling -= s.truePeak - TRUE_PEAK_MAX + 0.2;
    }
  } finally { rmSync(pre, { force: true }); }
  return { stage: 'limiter', linear: true, attempts };
}

async function mux(video, wav, D) {
  const tmp = join(dirname(video), `.${basename(video)}.mux.mp4`);
  await ffmpeg(['-i', video, ...inputOf(wav), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', ...AAC,
    '-filter:a', `apad=whole_dur=${D},atrim=0:${D}`, '-movflags', '+faststart', tmp]);
  renameSync(tmp, video);
}

const mp4sIn = (out, formats) => (existsSync(out) ? readdirSync(out) : [])
  .filter((f) => f.endsWith('.mp4') && !f.startsWith('.') && !/loop_check|walkthrough/.test(f) && (!formats || formats.some((x) => f.includes(x))))
  .sort().map((f) => join(out, f));

// --------------------------------------------------------------------------------------------
// the verb

/** Whether `mm sound` mixes anything for this story and style: a film with a track, or with cues and a palette. */
export const mixable = (story, style) => story?.kind !== 'deck'
  && (Boolean(story?.audio?.track) || ((style?.sound?.palette ?? 'none') !== 'none' && (story?.scenes ?? []).some((sc) => (sc.beats ?? []).some((b) => b.cue))));

/**
 * @returns {Promise<{code:number, mix?:string, cues?:object[], loudness?:object, muxed?:string[], notes:string[]}>}
 */
export async function buildSound(pieceDir, { formats = null, patterns = null, log = () => {} } = {}) {
  const dir = resolve(pieceDir);
  const notes = [];
  const story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  const style = JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8'));
  const unknown = (formats ?? []).filter((f) => !story.formats.includes(f));
  if (unknown.length) throw Object.assign(new Error(`this story ships ${story.formats.join(', ')}, not ${unknown.join(', ')}`), { setup: true });
  if (story.kind === 'deck') return { code: 0, notes: ['decks are not mixed: a deck has no picture clock to mix against (cues play in `mm serve`)'] };
  const out = join(dir, 'out');
  const palette = style.sound?.palette ?? 'none';
  const target = style.sound?.loudnessLufs ?? -14;
  const trackRel = story.audio?.track ?? null;
  const track = trackRel ? resolve(dir, trackRel) : null;
  if (track && !existsSync(track)) throw new Error(`audio.track ${trackRel} does not exist`);
  const storyHasCues = story.scenes.some((sc) => sc.beats.some((b) => b.cue));
  const wantCues = storyHasCues && palette !== 'none';
  if (storyHasCues && palette === 'none') notes.push('style.sound.palette is "none": the story names cues but they are not rendered');
  if (!mixable(story, style)) return { code: 0, notes: [...notes, 'nothing to mix: no track and no cues (silent piece)'] };

  const videos = mp4sIn(out, formats);
  const patternsBase = resolvePatternsBase(dir, patterns);
  let sched = null, cuePlanList = [], buffers = {};

  if (wantCues) {
    const rel = relative(ROOT, patternsBase).split(sep).join('/');
    if (rel.startsWith('..')) throw new Error(`patterns base must live under the repo root: ${patternsBase}`);
    const { openPiece } = await import('./lib/browser.mjs');
    const piece = await openPiece(dir, { format: formats?.[0] && story.formats.includes(formats[0]) ? formats[0] : undefined });
    try {
      sched = await piece.page.evaluate(() => {
        const s = window.mm.schedule;
        return JSON.parse(JSON.stringify({ duration: s.duration, kind: s.kind, scenes: s.scenes, events: s.events.filter((e) => e.kind === 'cue' || e.kind === 'arrive' || e.kind === 'cut') }));
      });
      const raw = cueEvents(sched);
      const grid = loadGrid(dir, story);
      if (grid.missing) notes.push(`audio.beats names ${grid.missing} which does not exist: cues are not snapped`);
      cuePlanList = planCues(raw, grid.beats);
      const names = [...new Set(cuePlanList.map((c) => c.name))];
      const mods = await loadCueModules(names, patternsBase);
      const missing = names.filter((n) => !mods[n]);
      if (missing.length) throw new Error(`sound pattern(s) not found under ${join(patternsBase, 'sound')}: ${missing.join(', ')}`);
      buffers = await renderInPage(piece.page, piece.server.url, rel, names.map((name) => ({ name, feel: palette })));
    } finally {
      await piece.close();
    }
  }

  const schedDuration = sched?.duration ?? buildSchedule(story, style).duration;
  const D = videos.length ? Math.round((await streamSeconds(videos[0], 'video')) * 1000) / 1000 : schedDuration;
  if (videos.length && Math.abs(D - schedDuration) > 0.1) notes.push(`picture is ${D} s but the schedule says ${schedDuration} s: mixed to the picture`);
  const total = Math.ceil(D * SR);
  const stems = join(out, 'stems');
  mkdirSync(stems, { recursive: true });

  // Natural levels per distinct cue.
  const nat = Object.fromEntries(Object.entries(buffers).map(([n, b]) => [n, { ...b, peakDb: toDb(peakOf(b.channels)) }]));
  const plain = cuePlanList.filter((c) => c.name !== 'bed' && c.at < D);
  const beds = cuePlanList.filter((c) => c.name === 'bed' && c.at < D);
  for (const c of cuePlanList) if (c.at >= D) notes.push(`${c.name} at ${round(c.at)} s is past the picture end and is dropped`);

  // Bed stem at unity first, so its loudness can be matched to the track.
  const bedStem = [new Float32Array(total), new Float32Array(total)];
  const bedRegions = beds.map((c, i) => {
    const loop = nat.bed, len = Math.max(1, Math.round(loop.durationS * SR));
    const sc = sched.scenes.find((s) => s.id === c.scene);
    const until = Math.min(D, i + 1 < beds.length ? beds[i + 1].at : sc?.end ?? D);
    const startS = Math.round(c.at * SR), endS = Math.min(total, Math.round(until * SR));
    for (let p = startS; p < endS; p += len) addInto(bedStem, loop.channels.map((ch) => ch.subarray(0, len)), p / SR, 1);
    const fade = Math.min(Math.round(0.05 * SR), (endS - startS) >> 1);       // no clicks at the region edges
    for (const ch of bedStem) for (let k = 0; k < fade; k++) { ch[startS + k] *= k / fade; ch[endS - 1 - k] *= k / fade; }
    return { c, until };
  });
  const bedNatPeak = toDb(peakOf(bedStem));

  let trackInfo = null;
  if (track) {
    const lu = await measureLoudness(track);
    const pcm = await decodePcm(track);
    let p = 0; for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > p) p = a; }
    trackInfo = { lufs: lu.lufs, peakDb: toDb(p) };
  }

  let bedGain = 0, bedLufs = null;
  const medianNat = (() => { const a = plain.map((c) => nat[c.name].peakDb).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; })();
  if (beds.length) {
    if (trackInfo) {
      writeFileSync(join(stems, 'bed.wav'), floatWav(bedStem));
      bedLufs = (await measureLoudness(join(stems, 'bed.wav'))).lufs;
      bedGain = Number.isFinite(bedLufs) ? trackInfo.lufs - BED_UNDER_TRACK_DB - bedLufs : 0;
    } else if (medianNat != null) bedGain = medianNat - BED_TARGET_DB - bedNatPeak;
    for (const ch of bedStem) for (let i = 0; i < ch.length; i++) ch[i] *= fromDb(bedGain);
  }
  const bedPeak = beds.length ? bedNatPeak + bedGain : null;

  // Cue gains.
  const cueGainDb = {};
  const names = [...new Set(plain.map((c) => c.name))];
  for (const n of names) {
    const p = nat[n].peakDb;
    if (bedPeak != null) cueGainDb[n] = Math.min(Math.max(p, bedPeak + BED_BAND_DB[0] + 0.25), bedPeak + BED_BAND_DB[1] - 0.25) - p;
    else if (trackInfo) cueGainDb[n] = trackInfo.peakDb - CUE_UNDER_TRACK_PEAK_DB - Math.max(...names.map((x) => nat[x].peakDb));
    else cueGainDb[n] = 0;
  }
  const cueStem = [new Float32Array(total), new Float32Array(total)];
  for (const c of plain) addInto(cueStem, nat[c.name].channels, c.at, fromDb(cueGainDb[c.name]));

  const inputs = [];
  if (track) inputs.push(track);
  if (beds.length) { writeFileSync(join(stems, 'bed.wav'), floatWav(bedStem)); inputs.push(join(stems, 'bed.wav')); }
  if (plain.length) { writeFileSync(join(stems, 'cues.wav'), floatWav(cueStem)); inputs.push(join(stems, 'cues.wav')); }

  mkdirSync(out, { recursive: true });
  const mixPath = join(out, 'mix.wav');
  const mixInfo = await mixdown({ inputs, D, target, out: mixPath });
  const loudness = await measureLoudness(mixPath);
  const last = mixInfo.attempts.at(-1);
  if (mixInfo.stage === 'silent') notes.push(`the mix is silent: ${round(loudness.lufs, 1)} LUFS (W-LOUDNESS will warn)`);
  else if (Math.abs(last.shippedLufs - target) > TOLERANCE_LU || last.shippedTruePeak > TRUE_PEAK_MAX) {
    notes.push(`mix encodes to ${round(last.shippedLufs, 1)} LUFS / ${round(last.shippedTruePeak, 1)} dBTP against ${target} LUFS / ${TRUE_PEAK_MAX} dBTP after ${mixInfo.attempts.length} attempt(s), last stage ${mixInfo.stage} (W-LOUDNESS will warn)`);
  }
  const loudnessRecord = { target, stage: mixInfo.stage, lufs: round(loudness.lufs), truePeak: round(loudness.truePeak), attempts: mixInfo.attempts };

  const cuesJson = [
    ...beds.map((c) => ({ name: 'bed', at: round(c.at, 3), until: round(bedRegions.find((r) => r.c === c).until, 3), feel: palette, peakDb: round(bedPeak), snappedFrom: null, driftMs: null })),
    ...plain.map((c) => ({ name: c.name, at: round(c.at, 3), feel: palette, peakDb: round(nat[c.name].peakDb + cueGainDb[c.name]), snappedFrom: c.snappedFrom == null ? null : round(c.snappedFrom, 3), driftMs: c.driftMs })),
  ].sort((a, b) => a.at - b.at);
  writeFileSync(join(out, 'cues.json'), JSON.stringify({ loudness: loudnessRecord, cues: cuesJson }, null, 2) + '\n');

  const muxed = [];
  for (const v of videos) { await mux(v, mixPath, Math.round((await streamSeconds(v, 'video')) * 1000) / 1000); muxed.push(v); }
  if (!videos.length) notes.push('no MP4 in out/: wrote out/mix.wav and out/cues.json only (run `mm export` first to mux)');
  log(`sound: ${plain.length} cue${plain.length === 1 ? '' : 's'}${beds.length ? ' + bed' : ''}${track ? ' + track' : ''} -> ${relative(process.cwd(), mixPath)} ${round(loudness.lufs, 1)} LUFS, ${round(loudness.truePeak, 1)} dBTP (${mixInfo.stage}); muxed ${muxed.length} MP4`);
  return { code: 0, mix: mixPath, cues: cuesJson, loudness, stage: mixInfo.stage, muxed, notes, picture: D, trackInfo };
}

function parseArgs(argv) {
  const { values, positionals } = parseFlags({ args: argv, allowPositionals: true, options: { formats: { type: 'string' }, patterns: { type: 'string' } } });
  if (positionals.length > 1) throw new UsageError('at most one piece');
  return { _: positionals, formats: values.formats?.split(',').filter(Boolean) ?? null, patterns: values.patterns ?? null };
}

/** CLI entry: returns the exit code (0 done, 1 failed, 2 setup or usage). */
export async function main(argv) {
  let a, dir;
  try { a = parseArgs(argv); dir = resolvePiece(a._[0]); } catch (e) {
    if (!(e instanceof UsageError) && !isArgsError(e)) throw e;
    console.error(`${isArgsError(e) ? 'sound' : 'mm'}: ${e.message}${isArgsError(e) ? `\n${usageText('sound')}` : ''}`);
    return 2;
  }
  let held;
  try { held = holdForExport(dir, { by: 'mm sound' }); } catch (e) { console.error(`sound: ${e instanceof ExportBusy ? 'refused: ' : ''}${e.reason ?? e.message}`); return 2; }
  try {
    const res = await buildSound(dir, { formats: a.formats, patterns: a.patterns, log: console.log });
    for (const n of res.notes) console.log(`sound: ${n}`);
    return res.code;
  } catch (e) {
    console.error(`sound: ${e.message}`);
    return e.setup ? 2 : 1;
  } finally { held.release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main(process.argv.slice(2)));
