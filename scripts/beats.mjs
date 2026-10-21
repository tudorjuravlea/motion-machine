#!/usr/bin/env node
// `mm beats <track> [--bpm N] --out assets/beats.json` (SPEC §8, §9).
// Decodes the track to mono 48 kHz float PCM with ffmpeg, builds an onset envelope in Node, then
//   - with --bpm: least-squares fit of the grid's phase to the onsets (the tempo is the declared one);
//   - without: tempo by autocorrelation of the envelope in 50-200 BPM, refined by a line fit.
// The method is *provisional* (SPEC §9): an energy-onset estimate, good for clicks and percussive
// music, not a general beat tracker. Writes { bpm, beats[], downbeats[], hits[], strong[] }; strong[]
// ranks beats and onsets by how hard they land (brag's cue score), for locking the biggest moments.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { usageText } from './lib/cli.mjs';
import { inputOf } from './lib/ffmpeg.mjs';

export const SAMPLE_RATE = 48000;
const N = 512;                 // FFT frame: 10.7 ms
const HOP = 128;               // 2.7 ms envelope resolution
const HOP_S = HOP / SAMPLE_RATE;
const BPM_MIN = 50, BPM_MAX = 200;
// Spectral flux peaks when an attack sits about three quarters into the Hann frame (measured on the
// synthetic clicks); the onset time is the frame start plus that offset.
const ONSET_OFFSET_S = (0.75 * N) / SAMPLE_RATE - 0.0016;

/** Decodes any audio file ffmpeg reads to mono float32 PCM at 48 kHz. */
export function decodePcm(file, { sampleRate = SAMPLE_RATE } = {}) {
  return new Promise((ok, fail) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-nostdin', ...inputOf(file), '-vn', '-f', 'f32le', '-ac', '1', '-ar', String(sampleRate), '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let err = '';
    p.stdout.on('data', (c) => chunks.push(c));
    p.stderr.on('data', (c) => { err += c; });
    p.on('error', (e) => fail(Object.assign(new Error(`ffmpeg is required: ${e.message}`), { setup: true })));
    p.on('close', (code) => {
      if (code !== 0) return fail(Object.assign(new Error(`ffmpeg could not decode ${file}: ${err.trim().split('\n').pop()}`), { setup: true }));
      const buf = Buffer.concat(chunks);
      const copy = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 4));
      ok(new Float32Array(copy));
    });
  });
}

// In-place radix-2 FFT of length N (tables built once).
const COS = new Float64Array(N / 2), SIN = new Float64Array(N / 2), REV = new Uint16Array(N), HANN = new Float64Array(N);
for (let i = 0; i < N / 2; i++) { COS[i] = Math.cos((2 * Math.PI * i) / N); SIN[i] = -Math.sin((2 * Math.PI * i) / N); }
for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < Math.log2(N); b++) if (i & (1 << b)) r |= 1 << (Math.log2(N) - 1 - b); REV[i] = r; HANN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)); }
function fft(re, im) {
  for (let i = 0; i < N; i++) { const j = REV[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let start = 0; start < N; start += size) {
      for (let k = 0, w = 0; k < half; k++, w += step) {
        const a = start + k, b = a + half;
        const tr = re[b] * COS[w] - im[b] * SIN[w], ti = re[b] * SIN[w] + im[b] * COS[w];
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}

/** Onset novelty: log-compressed spectral flux (positive rise per bin), one value per 2.7 ms hop. */
export function onsetEnvelope(pcm) {
  const frames = Math.max(0, Math.floor((pcm.length - N) / HOP) + 1);
  const nov = new Float64Array(frames);
  const re = new Float64Array(N), im = new Float64Array(N);
  let prev = new Float64Array(N / 2), cur = new Float64Array(N / 2);
  for (let f = 0; f < frames; f++) {
    const a = f * HOP;
    for (let i = 0; i < N; i++) { re[i] = pcm[a + i] * HANN[i]; im[i] = 0; }
    fft(re, im);
    let flux = 0;
    for (let k = 1; k < N / 2; k++) {
      cur[k] = Math.log1p(1000 * Math.hypot(re[k], im[k]) / N);
      if (f > 0 && cur[k] > prev[k]) flux += cur[k] - prev[k];
    }
    nov[f] = flux;
    [prev, cur] = [cur, prev];
  }
  return nov;
}

/** Local maxima of the novelty, at least `minGapS` apart, above `rel` of the typical strong onset (90th percentile of the peaks). */
export function pickOnsets(nov, { minGapS = 0.08, rel = 0.35 } = {}) {
  const w = Math.ceil(minGapS / HOP_S);
  const cands = [];
  for (let i = 1; i < nov.length - 1; i++) {
    const v = nov[i];
    if (v <= 0) continue;
    let isMax = true;
    for (let k = Math.max(0, i - w); k <= Math.min(nov.length - 1, i + w); k++) {
      if (nov[k] > v || (nov[k] === v && k < i)) { isMax = false; break; }
    }
    if (isMax) cands.push({ i, v });
  }
  if (!cands.length) return [];
  const sorted = cands.map((c) => c.v).sort((a, b) => a - b);
  const ref = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  return cands.filter((c) => c.v >= rel * ref).map((c) => ({ t: Math.max(0, c.i * HOP_S + ONSET_OFFSET_S), strength: Math.min(1, c.v / ref), i: c.i }));
}

// Strong cues (brag, MIT, restated): every beat and onset scored 0.45 onset + 0.25 local contrast
// + 0.20 RMS + 0.10 bass, each normalised to its 98th percentile and clamped; cues closer than
// 0.18 s keep the stronger; scores under 0.45 are dropped; at most 64 are kept. Onset and contrast
// are normalised over the candidates, not over every hop as brag does, so a click track's accents
// still stand out instead of tying at 1.
const CUE_MIN = 0.45, CUE_GAP_S = 0.18, CUE_MAX = 64, BASS_HZ = 180, CONTRAST_S = 0.5;

const p98 = (vals) => {
  const s = Float64Array.from(vals).sort();
  const v = s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.98))] : 0;
  return v > 1e-12 ? v : (s.length ? s[s.length - 1] : 0);
};
const norm = (v, ref) => (ref > 1e-12 ? Math.min(1, Math.max(0, v / ref)) : 0);

/** RMS of each analysis frame (the N samples from hop f), from a prefix sum of squares. */
function frameRms(pcm, frames) {
  const sq = new Float64Array(pcm.length + 1);
  for (let i = 0; i < pcm.length; i++) sq[i + 1] = sq[i] + pcm[i] * pcm[i];
  const out = new Float64Array(frames);
  for (let f = 0; f < frames; f++) out[f] = Math.sqrt((sq[f * HOP + N] - sq[f * HOP]) / N);
  return out;
}

/** The signal below BASS_HZ: an RBJ low-pass biquad, Q 0.707. */
function lowPass(pcm, sampleRate) {
  const w = (2 * Math.PI * BASS_HZ) / sampleRate, alpha = Math.sin(w) / (2 * Math.SQRT1_2), c = Math.cos(w);
  const a0 = 1 + alpha, b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, a1 = (-2 * c) / a0, a2 = (1 - alpha) / a0;
  const y = new Float32Array(pcm.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < pcm.length; i++) {
    const x = pcm[i], v = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** Ranks the grid's beats and the picked onsets by how hard they land; returns [{ t, intensity, kind }] in time order. */
export function strongCues(pcm, nov, beats, onsets, { sampleRate = SAMPLE_RATE } = {}) {
  const frames = nov.length;
  if (!frames) return [];
  const rms = frameRms(pcm, frames), bass = frameRms(lowPass(pcm, sampleRate), frames);
  const reach = Math.round(0.011 / HOP_S);           // a grid beat takes the strongest hop within 11 ms
  const frameOf = (t) => Math.min(frames - 1, Math.max(0, Math.round((t - ONSET_OFFSET_S) / HOP_S)));
  const peakNear = (f) => { let b = f; for (let k = Math.max(0, f - reach); k <= Math.min(frames - 1, f + reach); k++) if (nov[k] > nov[b]) b = k; return b; };
  const cands = [
    ...beats.map((t) => ({ t, f: peakNear(frameOf(t)), kind: 'beat' })),
    ...onsets.map((o) => ({ t: o.t, f: o.i, kind: 'onset' })),
  ];
  const r = Math.round(CONTRAST_S / HOP_S);
  for (const c of cands) {
    const win = Array.from(nov.subarray(Math.max(0, c.f - r), Math.min(frames, c.f + r + 1))).sort((a, b) => a - b);
    c.contrast = Math.max(0, nov[c.f] - win[Math.floor(win.length / 2)]);
  }
  const refOnset = p98(cands.map((c) => nov[c.f])), refContrast = p98(cands.map((c) => c.contrast));
  const refRms = p98(rms), refBass = p98(bass);
  for (const c of cands) {
    c.intensity = 0.45 * norm(nov[c.f], refOnset) + 0.25 * norm(c.contrast, refContrast) + 0.20 * norm(rms[c.f], refRms) + 0.10 * norm(bass[c.f], refBass);
  }
  const kept = [];
  for (const c of [...cands].sort((a, b) => b.intensity - a.intensity || a.t - b.t)) {
    if (c.intensity < CUE_MIN || kept.length >= CUE_MAX) break;
    if (kept.every((k) => Math.abs(k.t - c.t) >= CUE_GAP_S)) kept.push(c);
  }
  return kept.sort((a, b) => a.t - b.t).map((c) => ({ t: round3(c.t), intensity: round3(c.intensity), kind: c.kind }));
}

/** Tempo in BPM by autocorrelation of the (smoothed) novelty, 50-200 BPM, with a mild 120 BPM prior. */
export function estimateTempo(nov) {
  const sigma = 0.012 / HOP_S;                      // 12 ms smoothing so jittered onsets still correlate
  const r = Math.ceil(sigma * 3);
  const kernel = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-0.5 * ((i - r) / sigma) ** 2));
  const sm = new Float64Array(nov.length);
  for (let i = 0; i < nov.length; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) { const j = i + k; if (j >= 0 && j < nov.length) s += nov[j] * kernel[k + r]; }
    sm[i] = s;
  }
  const lagMin = Math.floor(60 / BPM_MAX / HOP_S), lagMax = Math.ceil(60 / BPM_MIN / HOP_S);
  const acf = new Float64Array(lagMax * 2 + 2);
  for (let lag = lagMin; lag < acf.length; lag++) {
    let s = 0;
    for (let i = lag; i < sm.length; i++) s += sm[i] * sm[i - lag];
    acf[lag] = s;
  }
  let best = -1, bestScore = -Infinity;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const prior = Math.exp(-0.5 * Math.log2((lag * HOP_S) / 0.5) ** 2);
    const score = (acf[lag] + 0.5 * (acf[lag * 2] ?? 0)) * prior;
    if (score > bestScore) { bestScore = score; best = lag; }
  }
  if (best < 0 || bestScore <= 0) return null;
  const y0 = acf[best - 1], y1 = acf[best], y2 = acf[best + 1];
  const den = y0 - 2 * y1 + y2;
  const shift = den !== 0 ? (0.5 * (y0 - y2)) / den : 0;
  return 60 / ((best + shift) * HOP_S);
}

const wrap = (x, T) => x - T * Math.round(x / T);

/** Strength-weighted circular mean of onset phases on a grid of period T → phase in [0, T). */
function circularPhase(onsets, T) {
  let c = 0, s = 0;
  for (const o of onsets) { const a = (2 * Math.PI * o.t) / T; c += o.strength * Math.cos(a); s += o.strength * Math.sin(a); }
  const ph = (Math.atan2(s, c) / (2 * Math.PI)) * T;
  return ph < 0 ? ph + T : ph;
}

/**
 * Fits t = phase + k·T to the onsets. With `declared` the period is fixed and only the phase is
 * solved (least squares over the onsets that sit within 25 % of a beat of the grid); otherwise the
 * period is solved as well (weighted line fit).
 */
export function fitGrid(onsets, T0, { declared = false } = {}) {
  let T = T0;
  let phase = circularPhase(onsets, T);
  let kept = [];
  for (let iter = 0; iter < 4; iter++) {
    kept = onsets.filter((o) => Math.abs(wrap(o.t - phase, T)) < 0.25 * T);
    if (kept.length < 2) break;
    const k = kept.map((o) => Math.round((o.t - phase) / T));
    const w = kept.map((o) => o.strength);
    const W = w.reduce((a, b) => a + b, 0);
    if (declared) {
      phase += kept.reduce((a, o, i) => a + w[i] * (o.t - (phase + k[i] * T)), 0) / W;
    } else {
      const km = kept.reduce((a, _, i) => a + w[i] * k[i], 0) / W;
      const tm = kept.reduce((a, o, i) => a + w[i] * o.t, 0) / W;
      const sxx = kept.reduce((a, _, i) => a + w[i] * (k[i] - km) ** 2, 0);
      if (sxx > 0) {
        T = kept.reduce((a, o, i) => a + w[i] * (k[i] - km) * (o.t - tm), 0) / sxx;
        phase = tm - km * T;
      } else phase += kept.reduce((a, o, i) => a + w[i] * (o.t - (phase + k[i] * T)), 0) / W;
    }
  }
  return { T, phase, kept };
}

const round3 = (x) => Math.round(x * 1000) / 1000;

/** The whole analysis on decoded PCM. */
export function analyse(pcm, { bpm = null, sampleRate = SAMPLE_RATE } = {}) {
  const durationS = pcm.length / sampleRate;
  const nov = onsetEnvelope(pcm);
  const onsets = pickOnsets(nov);
  if (onsets.length < 3) throw new Error('beats: fewer than three onsets found; the track has no clear pulse (or is silent)');
  const declared = bpm != null;
  const tempo0 = declared ? bpm : estimateTempo(nov);
  if (!tempo0) throw new Error('beats: could not estimate a tempo');
  if (tempo0 < BPM_MIN || tempo0 > BPM_MAX) throw new Error(`beats: bpm ${tempo0} outside ${BPM_MIN}-${BPM_MAX}`);
  const { T, phase, kept } = fitGrid(onsets, 60 / tempo0, { declared });

  // The grid starts at the beat nearest the first onset and runs to the end of the track.
  const first = (kept[0] ?? onsets[0]).t;
  let t0 = phase + Math.round((first - phase) / T) * T;
  while (t0 < 0) t0 += T;
  const beats = [];
  for (let k = 0, t = t0; t < durationS; k++, t = t0 + k * T) beats.push(round3(t));

  // The downbeat is the beat of each four whose onsets carry the most energy; ties keep the first.
  const energy = [0, 0, 0, 0];
  for (const o of kept) { const k = Math.round((o.t - t0) / T); if (k >= 0) energy[((k % 4) + 4) % 4] += o.strength; }
  let bar = 0;
  for (let p = 1; p < 4; p++) if (energy[p] > energy[bar] * 1.15) bar = p;
  const downbeats = beats.filter((_, i) => i % 4 === bar);

  return {
    bpm: declared ? bpm : Math.round((60 / T) * 100) / 100,
    beats, downbeats,
    hits: onsets.map((o) => ({ t: round3(o.t), strength: Math.round(o.strength * 1000) / 1000 })),
    strong: strongCues(pcm, nov, beats, onsets, { sampleRate }),
    offsetS: round3(downbeats[0] ?? beats[0] ?? 0),
    method: declared ? 'declared-bpm phase fit (least squares)' : 'autocorrelation tempo, line-fit refinement (provisional)',
    durationS: round3(durationS),
  };
}

export async function detectBeats(file, opts = {}) {
  return analyse(await decodePcm(file), opts);
}

function parseArgs(argv) {
  const a = { _: [], bpm: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--bpm') a.bpm = Number(argv[++i]);
    else if (v.startsWith('--bpm=')) a.bpm = Number(v.slice(6));
    else if (v === '--out') a.out = argv[++i];
    else if (v.startsWith('--out=')) a.out = v.slice(6);
    else if (v.startsWith('--')) throw Object.assign(new Error(`unknown flag ${v}`), { usage: true });
    else a._.push(v);
  }
  return a;
}

/** CLI entry: returns the exit code (0 done, 2 setup or usage). */
export async function main(argv) {
  let a;
  try { a = parseArgs(argv); } catch (e) { console.error(`beats: ${e.message}\n${usageText('beats')}`); return 2; }
  if (a._.length !== 1 || (a.bpm != null && !(a.bpm >= BPM_MIN && a.bpm <= BPM_MAX))) {
    console.error(`${usageText('beats')}\n  (--bpm takes ${BPM_MIN} to ${BPM_MAX})`);
    return 2;
  }
  try {
    const res = await detectBeats(resolve(a._[0]), { bpm: a.bpm });
    const out = resolve(a.out ?? 'assets/beats.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(res, null, 2) + '\n');
    console.log(`beats: ${res.bpm} BPM${a.bpm != null ? ' (declared)' : ' (estimated)'}, ${res.beats.length} beats, ${res.downbeats.length} downbeats, first downbeat ${res.offsetS.toFixed(3)} s -> ${out}`);
    return 0;
  } catch (e) {
    console.error(`beats: ${e.message}`);
    return e.setup ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main(process.argv.slice(2)));
