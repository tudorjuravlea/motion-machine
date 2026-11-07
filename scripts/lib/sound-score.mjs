// How near one sound is to another, measured from the samples with no model (SPEC §9). Library only; pure. This is the score
// `mm sound clone` minimises, restated from a MIT-licensed sound forge's fit-quality module (see NOTICE) and its tonal-balance and
// search modules, in this repository's idiom; the character distance takes its eight features from ideas published elsewhere.
//
//   prepareTarget(channels, sr)        what is computed once about the sound to match: its aligned, levelled samples and their spectra
//   scoreAgainst(target, channels)     { total, mel, melByRes, envCorr, onsetErr, toneDb, excess, missing }  lower is nearer, 0 identical
//   envelopeStats(channels, sr)        { attackMs, t10Ms, t20Ms, t40Ms, centroidMs, crestDb, endDb } of the 2 ms level
//   soundDistance(a, b, sr)            { total, toneDb, envelope, character }  RMS third-octave difference + 4 per e-fold of envelope timing: how far two variants sit apart
//   soundFeatures(channels, sr) · featureDistance(fa, fb)   the same, with the features of each sound measured once
//   characterDistance(a, b, sr)        RMS difference of eight log-scaled features: a near-duplicate check (0 the same, about 1.4 a knock against a note)
//
// The score: mel + 0.3 x tone dB + 8 x (1 - envelope correlation) + 1 x onset error (octaves, capped at 2) + 1.5 x excess dB + 1 x missing dB.
//   mel        64 mel bands 30 Hz to 20 kHz, FFT 256 / 1024 / 4096 (hop a quarter, Hann), the mean |dB difference| over the cells within 60 dB of the
//              louder sound's top (floored 80 dB down), averaged over the three sizes
//   envCorr    the correlation of the 5 ms dB envelopes over their active span
//   onsetErr   |log2| of the ratio of the two onsets' sharpness (17 dB over the time the first onset takes to rise from 20 dB to 3 dB under its local peak)
//   toneDb     the RMS difference of the 28-band third-octave balances
//   excess     energy the candidate has where the target is quiet: the mean dB above the target beyond 6 dB over third-octave x 10 ms cells, 100 dB deep
//   missing    the same the other way
// Both sounds are the mono mix, cut at the target's onset (5 ms before it, so a timing error still counts) and each levelled to its own loudest 50 ms.
import { THIRD_OCTAVE_HZ, bandgram, fft, measure, thirdOctaveProfile } from './audio-measure.mjs';

const FRAMES = [256, 1024, 4096];
const N_MEL = 64;
const db10 = (x) => 10 * Math.log10(x);
const dbOf = (p) => db10(Math.max(p, 1e-20));

const monoOf = (channels) => {
  const n = channels[0].length, m = new Float64Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) m[i] += c[i] / channels.length;
  return m;
};

/** The loudest `win` seconds of the mean power, dB. */
function peakRmsDb(x, sr, win = 0.05) {
  const k = Math.max(1, Math.floor(win * sr)), n = x.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + x[i] * x[i];
  if (n < k) return dbOf(cum[n] / Math.max(1, n));
  let best = 0;
  for (let s = 0; s + k <= n; s++) best = Math.max(best, (cum[s + k] - cum[s]) / k);
  return dbOf(best);
}

/** The first 1 ms frame within 30 dB of the loudest (sample index). */
function onsetIndex(m, sr) {
  const hop = Math.round(sr / 1000), nb = Math.floor(m.length / hop);
  if (nb < 2) return 0;
  const e = frameDbs(m, hop, nb);
  let top = -Infinity;
  for (const v of e) top = Math.max(top, v);
  return e.findIndex((v) => v > top - 30) * hop;
}

function frameDbs(m, k, nb = Math.max(1, Math.floor(m.length / k))) {
  const out = new Float64Array(nb);
  for (let f = 0; f < nb; f++) { let s = 0; for (let i = f * k; i < Math.min(m.length, (f + 1) * k); i++) s += m[i] * m[i]; out[f] = dbOf(s / k + 1e-20); }
  return out;
}

// ---- the log-mel -------------------------------------------------------------------------------------------------------
const FB = new Map();
function melBank(nfft, sr) {
  const key = `${nfft}|${sr}`;
  if (FB.has(key)) return FB.get(key);
  const mel = (f) => 2595 * Math.log10(1 + f / 700), imel = (v) => 700 * (10 ** (v / 2595) - 1);
  const lo = mel(30), hi = mel(Math.min(20000, sr / 2)), pts = Array.from({ length: N_MEL + 2 }, (_, i) => imel(lo + ((hi - lo) * i) / (N_MEL + 1)));
  const half = nfft / 2 + 1, rows = [];
  for (let i = 0; i < N_MEL; i++) {
    const [a, c, b] = [pts[i], pts[i + 1], pts[i + 2]], w = new Float64Array(half);
    let sum = 0;
    for (let k = 0; k < half; k++) { const f = (k * sr) / nfft; w[k] = Math.max(0, Math.min((f - a) / (c - a), (b - f) / (b - c))); sum += w[k]; }
    if (sum === 0) { let best = 0; for (let k = 1; k < half; k++) if (Math.abs((k * sr) / nfft - c) < Math.abs((best * sr) / nfft - c)) best = k; w[best] = 1; }
    let first = half, last = -1;
    for (let k = 0; k < half; k++) if (w[k] > 0) { first = Math.min(first, k); last = Math.max(last, k); }
    rows.push({ w, first, last });
  }
  FB.set(key, rows);
  return rows;
}

/** Log-mel power (dB) of `m` zero-padded to `frames` frames of hop nfft / 4: [frame][64], a Hann window, centred. */
function melSpec(m, nfft, sr, frames) {
  const hop = nfft / 4, bank = melBank(nfft, sr), half = nfft / 2;
  const win = Float64Array.from({ length: nfft }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 1)) / (nfft + 1)));
  const re = new Float64Array(nfft), im = new Float64Array(nfft), P = new Float64Array(half + 1), out = [];
  for (let t = 0; t < frames; t++) {
    const start = t * hop - half;
    for (let i = 0; i < nfft; i++) { const j = start + i; re[i] = j >= 0 && j < m.length ? m[j] * win[i] : 0; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k <= half; k++) P[k] = re[k] * re[k] + im[k] * im[k];
    const row = new Float64Array(N_MEL);
    for (let b = 0; b < N_MEL; b++) { let s = 1e-20; const { w, first, last } = bank[b]; for (let k = first; k <= last; k++) s += w[k] * P[k]; row[b] = dbOf(s); }
    out.push(row);
  }
  return out;
}

// ---- the onset ---------------------------------------------------------------------------------------------------------
/** The onset sharpness (dB/ms) of the first onset on 0.125 ms frames: the rise from 20 dB to 3 dB under its local peak. */
function onsetSharpness(m, sr) {
  const k = Math.max(1, Math.floor(sr * 0.000125)), fm = (k / sr) * 1000, e = frameDbs(m, k);
  if (e.length < 4) return 1;
  let top = -Infinity;
  for (const v of e) top = Math.max(top, v);
  const on = e.findIndex((v) => v > top - 20), reach = Math.floor(10 / fm);
  let p = on;
  for (let i = on; i <= Math.min(e.length - 1, on + reach); i++) if (e[i] > e[p]) p = i;
  let j = p;
  while (j > 0 && e[j] > e[p] - 20) j--;
  const cross = (level) => {
    let kk = j;
    for (let i = j; i <= p; i++) if (e[i] >= level) { kk = i; break; }
    if (kk === j || e[kk] === e[kk - 1]) return kk;
    return kk - 1 + (level - e[kk - 1]) / (e[kk] - e[kk - 1]);
  };
  return 17 / Math.max((cross(e[p] - 3) - cross(e[p] - 20)) * fm, 0.02);
}

// ---- alignment ---------------------------------------------------------------------------------------------------------
/** The target trimmed at its own onset (5 ms before it) and levelled to its loudest 50 ms; the trim is the candidate's too. */
function levelled(x, from, sr) {
  const y = x.subarray(Math.min(from, x.length));
  const g = 10 ** (-peakRmsDb(y, sr) / 20);
  return Float64Array.from(y, (v) => v * g);
}
const padTo = (x, n) => { if (x.length >= n) return x; const y = new Float64Array(n); y.set(x); return y; };
const MIN_PAD_S = 2.5;

/** What is computed once about the sound to match; `scoreAgainst` spends it on each candidate. */
export function prepareTarget(channels, sr) {
  const mono = monoOf(channels), from = Math.max(0, onsetIndex(mono, sr) - Math.round(0.005 * sr));
  return { sr, mono, from, A: levelled(mono, from, sr), profile: thirdOctaveProfile(channels, sr), sharp: onsetSharpness(mono, sr), cache: null };
}

function cacheFor(t, n) {
  const need = Math.max(n, Math.round(MIN_PAD_S * t.sr));
  if (t.cache && t.cache.n >= n) return t.cache;
  const Ap = padTo(t.A, need), c = { n: need, mel: {} };
  for (const nf of FRAMES) c.mel[nf] = melSpec(Ap, nf, t.sr, Math.ceil(need / (nf / 4)));
  c.band = bandgram([Ap], t.sr).db;
  t.cache = c;
  return c;
}

const envDb = (x, sr) => frameDbs(x, Math.max(1, Math.floor(sr * 0.005)));

/** The score of `channels` against a prepared target: lower is nearer, 0 is identical. */
export function scoreAgainst(t, channels) {
  const sr = t.sr, mono = monoOf(channels), B0 = levelled(mono, t.from, sr), n = Math.max(t.A.length, B0.length), B = padTo(B0, n), A = padTo(t.A, n);
  const c = cacheFor(t, n);
  // mel: three resolutions
  const melByRes = FRAMES.map((nf) => {
    const frames = Math.ceil(n / (nf / 4)), MA = c.mel[nf], MB = melSpec(B, nf, sr, frames);
    let top = -Infinity;
    for (let f = 0; f < frames; f++) for (let b = 0; b < N_MEL; b++) top = Math.max(top, MA[f][b], MB[f][b]);
    let sum = 0, cnt = 0;
    for (let f = 0; f < frames; f++) for (let b = 0; b < N_MEL; b++) {
      const a = Math.max(MA[f][b], top - 80), d = Math.max(MB[f][b], top - 80);
      if (Math.max(a, d) > top - 60) { sum += Math.abs(a - d); cnt++; }
    }
    return cnt ? sum / cnt : 0;
  });
  const mel = melByRes.reduce((s, v) => s + v, 0) / melByRes.length;
  // the envelope
  const ea = envDb(A, sr), eb = envDb(B, sr), eTop = Math.max(...ea, ...eb);
  const xs = [], ys = [];
  for (let i = 0; i < ea.length; i++) { const a = Math.max(ea[i], eTop - 60), b = Math.max(eb[i], eTop - 60); if (Math.max(a, b) > eTop - 60) { xs.push(a); ys.push(b); } }
  let envCorr = 0;
  if (xs.length > 3) {
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    envCorr = sxx > 1e-18 && syy > 1e-18 ? sxy / Math.sqrt(sxx * syy) : 0;
  }
  // the onset, and the tonal balance
  const onsetErr = Math.abs(Math.log2(onsetSharpness(mono, sr) / t.sharp));
  const pb = thirdOctaveProfile(channels, sr);
  let tone = 0;
  for (let i = 0; i < 28; i++) tone += (t.profile[i] - pb[i]) ** 2;
  const toneDb = Math.sqrt(tone / 28);
  // excess and missing: third-octave x 10 ms cells
  const EA = c.band, EB = bandgram([B], sr).db, T = Math.min(EB.length, EA.length);
  let bTop = -Infinity;
  for (let f = 0; f < T; f++) for (let b = 0; b < 28; b++) bTop = Math.max(bTop, EA[f][b], EB[f][b]);
  let ex = 0, mi = 0, act = 0;
  for (let f = 0; f < T; f++) for (let b = 0; b < 28; b++) {
    const a = Math.max(EA[f][b], bTop - 100), d = Math.max(EB[f][b], bTop - 100);
    if (Math.max(a, d) > bTop - 90) { act++; ex += Math.max(0, d - a - 6); mi += Math.max(0, a - d - 6); }
  }
  const excess = act ? ex / act : 0, missing = act ? mi / act : 0;
  const total = mel + 0.3 * toneDb + 8 * (1 - envCorr) + Math.min(onsetErr, 2) + 1.5 * excess + missing;
  return { total, mel, melByRes, envCorr, onsetErr, toneDb, excess, missing };
}

// ---- envelope statistics, and the distances between variants -------------------------------------------------------------
/** The 2 ms level of the mono mix: the attack (the -30 dB onset to the peak), the times from the peak to fall 10, 20 and 40 dB (or to the end), the centroid in time from the onset, the crest and the level of the last quarter, dB under the peak. */
export function envelopeStats(channels, sr) {
  const m = monoOf(channels), n = Math.max(1, Math.floor(sr * 0.002)), k = Math.floor(m.length / n);
  if (k < 2) return { attackMs: 0, t10Ms: 0, t20Ms: 0, t40Ms: 0, centroidMs: 0, crestDb: 0, endDb: -90 };
  const pw = Float64Array.from({ length: k }, (_, f) => { let s = 0; for (let i = f * n; i < (f + 1) * n; i++) s += m[i] * m[i]; return s / n; });
  const e = pw.map((v) => db10(v + 1e-18));
  let ip = 0;
  for (let i = 0; i < k; i++) if (e[i] > e[ip]) ip = i;
  const pk = e[ip], on = e.findIndex((v) => v > pk - 30), out = { attackMs: (ip - on) * 2 + 1 };
  for (const db of [10, 20, 40]) { let at = k - ip; for (let i = ip; i < k; i++) if (e[i] < pk - db) { at = i - ip; break; } out[`t${db}Ms`] = at * 2; }
  let ws = 0, wsum = 0;
  for (let i = on; i < k; i++) { ws += (i - on) * pw[i]; wsum += pw[i]; }
  out.centroidMs = (ws / (wsum + 1e-18)) * 2 + 1;
  let peak = 0, act = 0, actN = 0;
  for (let i = on * n; i < k * n; i++) { peak = Math.max(peak, Math.abs(m[i])); if (e[Math.floor(i / n)] > pk - 40) { act += m[i] * m[i]; actN++; } }
  out.crestDb = actN ? 20 * Math.log10(peak / (Math.sqrt(act / actN) + 1e-12) + 1e-12) : 0;
  let tail = 0, tn = 0;
  for (let i = Math.floor(0.75 * k); i < k; i++) { tail += pw[i]; tn++; }
  out.endDb = Math.max(-90, db10(tail / tn + 1e-18) - pk);
  return out;
}
const ENV_KEYS = ['attackMs', 't10Ms', 't20Ms', 't40Ms', 'centroidMs'];
const envVec = (e) => [...ENV_KEYS.map((k) => Math.log(Math.max(e[k], 0.5))), e.crestDb / 6, e.endDb / 6];

/** The distance between two sounds in dB-like units: the RMS third-octave difference plus 4 per e-fold of difference in the envelope's timing (the times in logs, the crest and the end level in 6 dB units). */
export function soundDistance(a, b, sr) { return featureDistance(soundFeatures(a, sr), soundFeatures(b, sr)); }

/** What `soundDistance` and `characterDistance` read from one sound, measured once: { profile, env, character }. */
export function soundFeatures(channels, sr) { return { profile: thirdOctaveProfile(channels, sr), env: envVec(envelopeStats(channels, sr)), character: characterOf(channels, sr) }; }

/** `soundDistance` between two sounds' features, with `character` (the character distance) beside it. */
export function featureDistance(fa, fb) {
  let t = 0;
  for (let i = 0; i < 28; i++) t += (fa.profile[i] - fb.profile[i]) ** 2;
  let e = 0;
  for (let i = 0; i < fa.env.length; i++) e += (fa.env[i] - fb.env[i]) ** 2;
  const toneDb = Math.sqrt(t / 28), envelope = 4 * Math.sqrt(e / fa.env.length);
  return { total: toneDb + envelope, toneDb, envelope, character: Math.sqrt(fa.character.reduce((s, v, i) => s + (v - fb.character[i]) ** 2, 0) / fa.character.length) };
}

/** Eight features, each on a scale where a doubling is under one unit: log1p of the centre of sound, the roll-off, the attack (ms), the T60 (ms) and the length (ms); the share of the power under 300 Hz; the flatness in logs; the crest in 20 dB units. */
function characterOf(channels, sr) {
  const m = measure(channels, sr), sp = m.bandsDb;
  let low = 0, all = 0;
  for (let i = 0; i < 28; i++) { const p = 10 ** (sp[i] / 10); all += p; if (THIRD_OCTAVE_HZ[i] < 300) low += p; }
  const e = envelopeStats(channels, sr);
  return [Math.log1p(m.centroidHz), Math.log1p(m.rolloffHz), Math.log1p((m.attackS ?? 0.002) * 1000), Math.log1p((m.t60S ?? m.audibleS * 1.5) * 1000), Math.log1p(m.audibleS * 1000), low / all, Math.log10(m.flatness + 1e-6) / 3 + 2, e.crestDb / 20];
}

/** The RMS difference of eight log-scaled features of two sounds: 0 for the same sound, about 0.1 to 0.2 for two notes of one material, about 1.4 for a knock against a note; a model-free near-duplicate check. */
export function characterDistance(a, b, sr) { return featureDistance(soundFeatures(a, sr), soundFeatures(b, sr)).character; }
