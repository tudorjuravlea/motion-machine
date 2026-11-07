// The pure parts of what `mm sound` does to the mix (SPEC §9): arrays in, arrays out; no ffmpeg, no browser. Library only; Node.
//
//   stopDownCurve(n, sr, hitsS, { db, lengthS, downMs, upMs })  linear gain per sample: the bed dips `db` for `lengthS` before each
//                                                               hit and is back on it
//   duckCurve(n, sr, spans, { db, attackMs, releaseMs })       linear gain per sample: `db` (negative) inside the spans, one-pole
//                                                               attack and release
//   speechSpansFromWords(words) · speechSpansFromAudio(channels, sr)   [{ from, to }] seconds of speech: from a word list, or
//                                                               from the voice's own envelope in the speech band
//   chromaOf(mono, sr) · tonalCentre(chroma)                    the music's pitch-class profile, and its max over mean (a tonal
//                                                               centre from 1.6 up)
//   pitchOfCue(channels, sr) · fitShift(hz, chroma, maxSt) · shiftPitch(channels, st)   tonal fit of a cue to the music's key
//   aloneOverBedDb(x) · bedIsSilent(channels, sr, atS) · monoAsDual(channels)   the level model's traps
//
// Ducking depths and times, the stop-down shape, the chroma-based tonal centre and the traps of the level model restate
// what Earshot's mixer and tests do (MIT) and what the sound notes measured; the numbers are the provisional ones of SPEC §9.
import { fft, flatness, peaksOf, spectrum, ungatedLufs } from './audio-measure.mjs';

export const DUCK_PRESETS = Object.freeze({
  light:  Object.freeze({ db: -4,  attackMs: 8, releaseMs: 160 }),
  normal: Object.freeze({ db: -9,  attackMs: 6, releaseMs: 180 }),
  deep:   Object.freeze({ db: -14, attackMs: 4, releaseMs: 240 }),
});
export const STOP_DOWN = Object.freeze({ on: true, db: 9, lengthS: 0.4, downMs: 40, upMs: 60 });
export const NO_BED_LUFS = -60;
export const TONAL_CENTRE_MIN = 1.6;

const fromDb = (d) => 10 ** (d / 20);
const raised = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

export function stopDownCurve(n, sr, hitsS, { db = STOP_DOWN.db, lengthS = STOP_DOWN.lengthS, downMs = STOP_DOWN.downMs, upMs = STOP_DOWN.upMs } = {}) {
  const g = new Float32Array(n).fill(1), low = fromDb(-Math.abs(db));
  for (const h of hitsS) {
    const start = h - lengthS, end = h + upMs / 1000;
    for (let i = Math.max(0, Math.floor(start * sr)), e = Math.min(n, Math.ceil(end * sr)); i < e; i++) {
      const t = i / sr;
      const depth = t < h ? raised((t - start) / (downMs / 1000)) : 1 - raised((t - h) / (upMs / 1000));   // 0 = untouched, 1 = fully dipped
      const v = 1 - depth * (1 - low);
      if (v < g[i]) g[i] = v;
    }
  }
  return g;
}

export function duckCurve(n, sr, spans, { db, attackMs, releaseMs }) {
  const g = new Float32Array(n), low = fromDb(db);
  const a = 1 - Math.exp(-1 / ((attackMs / 1000) * sr)), r = 1 - Math.exp(-1 / ((releaseMs / 1000) * sr));
  let cur = 1, s = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    while (s < spans.length && spans[s].to <= t) s++;
    const tgt = s < spans.length && t >= spans[s].from ? low : 1;
    cur += (tgt - cur) * (tgt < cur ? a : r);
    g[i] = cur;
  }
  return g;
}

/** Words (sorted [{ start, end }]) to spans; words closer than `mergeS` are one span, so the duck holds between them. */
export function speechSpansFromWords(words, mergeS = 0.25) {
  const out = [];
  for (const w of [...words].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && w.start - last.to < mergeS) last.to = Math.max(last.to, w.end);
    else out.push({ from: w.start, to: w.end });
  }
  return out;
}

function biquad(x, type, f0, sr, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * f0) / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w);
  const a0 = 1 + al;
  const b = type === 'hp' ? [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0] : [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0];
  const a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}

/** A band-passed copy of a mono signal (two high-pass and two low-pass sections), Float64. */
export function bandpass(x, lo, hi, sr) {
  return biquad(biquad(biquad(biquad(x, 'hp', lo, sr), 'hp', lo, sr), 'lp', hi, sr), 'lp', hi, sr);
}

export const SPEECH_BAND_HZ =Object.freeze([250, 3800]);
const SPEECH_OVER_FLOOR_DB = 12, SPEECH_MIN_DB = -55, SPEECH_FRAME_S = 0.025, SPEECH_MIN_S = 0.1;

/** Speech in a voice recording: the 250-3800 Hz level per 25 ms, speech where it stands 12 dB over the recording's floor (its 10th percentile). */
export function speechSpansFromAudio(channels, sr) {
  const n = channels[0].length, mono = new Float64Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) mono[i] += c[i] / channels.length;
  const band = biquad(biquad(biquad(mono, 'hp', SPEECH_BAND_HZ[0], sr), 'hp', SPEECH_BAND_HZ[0], sr), 'lp', SPEECH_BAND_HZ[1], sr);
  const w = Math.round(SPEECH_FRAME_S * sr), frames = Math.floor(n / w);
  if (frames < 4) return [];
  const level = new Float64Array(frames);
  for (let f = 0; f < frames; f++) { let s = 0; for (let i = f * w; i < (f + 1) * w; i++) s += band[i] * band[i]; level[f] = 10 * Math.log10(s / w + 1e-20); }
  const floor = Float64Array.from(level).sort()[Math.floor(frames * 0.1)];
  const thr = Math.max(floor + SPEECH_OVER_FLOOR_DB, SPEECH_MIN_DB);
  const spans = [];
  for (let f = 0; f < frames; f++) {
    if (level[f] <= thr) continue;
    const from = (f * w) / sr, to = ((f + 1) * w) / sr, last = spans[spans.length - 1];
    if (last && from - last.to < 0.25) last.to = to; else spans.push({ from, to });
  }
  return spans.filter((s) => s.to - s.from >= SPEECH_MIN_S);
}

const CHROMA_N = 8192;
const midiOf = (hz) => 69 + 12 * Math.log2(hz / 440);

/** Pitch-class profile (12 values summing to 1, C first) of a mono signal: the power of 80-3000 Hz, each bin to its nearest semitone. */
export function chromaOf(mono, sr) {
  const chroma = new Float64Array(12);
  const hop = CHROMA_N / 2, total = Math.max(0, Math.floor((mono.length - CHROMA_N) / hop) + 1);
  if (!total) return Array.from(chroma);
  const win = Float64Array.from({ length: CHROMA_N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (CHROMA_N - 1)));
  const re = new Float64Array(CHROMA_N), im = new Float64Array(CHROMA_N);
  const stride = Math.max(1, Math.floor(total / 120));
  const lo = Math.ceil((80 * CHROMA_N) / sr), hi = Math.floor((3000 * CHROMA_N) / sr);
  for (let f = 0; f < total; f += stride) {
    for (let i = 0; i < CHROMA_N; i++) { re[i] = mono[f * hop + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = lo; k <= hi; k++) chroma[(((Math.round(midiOf((k * sr) / CHROMA_N)) % 12) + 12) % 12)] += re[k] * re[k] + im[k] * im[k];
  }
  const sum = chroma.reduce((a, b) => a + b, 0);
  return Array.from(chroma, (v) => (sum > 0 ? v / sum : 0));
}

/** Max over mean of the profile: 1 for a flat one, 12 for one pitch class; a tonal centre from TONAL_CENTRE_MIN. 0 for silence. */
export function tonalCentre(chroma) {
  const sum = chroma.reduce((a, b) => a + b, 0);
  return sum > 0 ? Math.max(...chroma) / (sum / chroma.length) : 0;
}

/** Whether a cue is a tone (spectral flatness under 0.002, SPEC §9 mining) and its strongest partial in 80-3000 Hz. */
export function pitchOfCue(channels, sr) {
  const sp = spectrum(channels, sr), flat = flatness(sp);
  const top = peaksOf(sp, { max: 1, floorDb: -1, minHz: 80 })[0];
  const hz = top?.f ?? null;
  return { tonal: flat < 0.002 && hz != null && hz <= 3000, hz, flatness: flat };
}

/**
 * The shift in semitones (within ±maxSt) that puts a cue of pitch `hz` on the pitch class the music rests on most in reach, or null when
 * nothing in reach is a note of the music (a class holding at least half the strongest one's share).
 */
export function fitShift(hz, chroma, maxSt = 2) {
  const midi = midiOf(hz), top = Math.max(...chroma);
  let best = null;
  for (let m = Math.ceil(midi - maxSt - 1e-9); m <= Math.floor(midi + maxSt + 1e-9); m++) {
    const cls = ((m % 12) + 12) % 12, v = chroma[cls];
    if (v < 0.5 * top || !(top > 0)) continue;
    if (!best || v > best.v + 1e-12 || (Math.abs(v - best.v) <= 1e-12 && Math.abs(m - midi) < Math.abs(best.m - midi))) best = { m, cls, v };
  }
  if (!best) return null;
  return { semitones: best.m - midi, pitchClass: best.cls, fromHz: hz, toHz: 440 * 2 ** ((best.m - 69) / 12) };
}

/** The channels resampled so every pitch moves by `st` semitones (the sound gets shorter as it goes up); cubic interpolation. */
export function shiftPitch(channels, st) {
  if (Math.abs(st) < 1e-6) return channels;
  const r = 2 ** (st / 12);
  return channels.map((x) => {
    const n = Math.floor((x.length - 1) / r), y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * r, k = Math.floor(p), f = p - k;
      const a = x[Math.max(0, k - 1)], b = x[k], c = x[Math.min(x.length - 1, k + 1)], d = x[Math.min(x.length - 1, k + 2)];
      y[i] = b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
    }
    return y;
  });
}

/** How far a cue alone sits over the bed when cue and bed together are `x` dB over the bed: 10 log10(10^(x/10) - 1). `x` runs 0.5 to 30. */
export function aloneOverBedDb(x) {
  if (!(x >= 0.5 && x <= 30)) throw new Error(`cue over bed ${x} dB is outside 0.5 to 30 (cue and bed together, over the bed)`);
  return 10 * Math.log10(10 ** (x / 10) - 1);
}

/** A bed under -60 LUFS in the second before `atS` is no bed (it would read as -240 and set a cue 220 dB down): fall back to the profile's fixed level. */
export function bedIsSilent(channels, sr, atS) {
  const to = Math.min(channels[0].length, Math.round(atS * sr)), from = Math.max(0, to - sr);
  if (to - from < Math.round(0.1 * sr)) return true;
  const lufs = ungatedLufs(channels.map((c) => c.subarray(from, to)), sr);
  return !Number.isFinite(lufs) || lufs < NO_BED_LUFS;
}

/** A mono sound as two equal channels, so it is measured and mixed at its own level: a lone channel reads 3 dB under dual mono. */
export const monoAsDual = (channels) => (channels.length === 1 ? [channels[0], channels[0]] : channels);
