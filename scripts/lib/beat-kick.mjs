// What `mm beats` adds to a grid once it is fitted (SPEC §9): the grid is moved onto the measured attacks, and it is
// checked against the track's kicks. Library only; Node.
//
//   fluxSnap(pcm, beats, T, sr)    { shiftS, ratio }: the shift of the whole grid that puts its beats on the attacks, found
//                                  on a short-window (23 ms) log spectral flux at 1.3 ms resolution, folded over the beats and
//                                  searched within ± min(100 ms, 0.3 beat). The analysis' own onset envelope lags real attacks
//                                  by 20-50 ms on music, and a cue snapped to a lagging grid sounds late.
//   kickCheck(pcm, beats, sr)      { kicks, beats, onKick, share, usable, medianOffsetMs }: kicks are the rises of the 31-125 Hz
//                                  band; a beat lands on a kick when one sits within 40 ms; a grid is `usable` when at least
//                                  half its beats do.
//
// Restated from Earshot's arrange step (MIT): the flux search folded at the beat period, and the search window.
import { fft } from './audio-measure.mjs';

export const KICK_BAND_HZ = Object.freeze([31, 125]);
export const KICK_MIN_SHARE = 0.5;
export const KICK_WINDOW_S = 0.04;
const KICK_BAND_SHARE_DB = 20;      // the band holds at least 1 % of the frame's power: a click's splatter is not a kick

const N = 1024, HOP = 64;
// A frame that starts at s sees an attack at s + FLUX_LAG_S at its flux peak (calibrated on synthetic clicks; tests/sound/kick.test.mjs).
const FLUX_LAG_S = 0.0195;

function flux(pcm, sr) {
  const frames = Math.max(0, Math.floor((pcm.length - N) / HOP) + 1);
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const re = new Float64Array(N), im = new Float64Array(N);
  const out = new Float64Array(frames);
  let prev = new Float64Array(N / 2), cur = new Float64Array(N / 2);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) { re[i] = pcm[f * HOP + i] * win[i]; im[i] = 0; }
    fft(re, im);
    let d = 0;
    for (let k = 1; k < N / 2; k++) {
      cur[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      if (f > 0 && cur[k] > prev[k]) d += cur[k] - prev[k];
    }
    out[f] = d;
    [prev, cur] = [cur, prev];
  }
  return out;
}

export function fluxSnap(pcm, beats, T, sr) {
  const fl = flux(pcm, sr);
  if (fl.length < 8 || beats.length < 2) return { shiftS: 0, ratio: 1 };
  const hopS = HOP / sr, search = Math.min(0.1, 0.3 * T);
  const at = (t) => { const f = Math.round((t - FLUX_LAG_S) / hopS); return f >= 0 && f < fl.length ? fl[f] : null; };
  const scores = [];
  for (let o = -search; o <= search + 1e-9; o += 0.001) {
    let s = 0, n = 0;
    for (const b of beats) { const v = at(b + o); if (v != null) { s += v; n++; } }
    scores.push({ o, v: n ? s / n : 0 });
  }
  const best = scores.reduce((a, b) => (b.v > a.v ? b : a));
  const sorted = scores.map((s) => s.v).sort((a, b) => a - b);
  return { shiftS: best.o, ratio: best.v / (sorted[sorted.length >> 1] + 1e-9) };
}

const KN = 2048, KHOP = 960;
// The rise of the kick band is seen in the frame that holds the kick's first quarter; the kick began this long after the frame's start.
const KICK_LAG_S = 0.03;

/** Kick times (s) of a track: the rises of the 31-125 Hz band that stand above the 93rd percentile and 6 dB. */
export function kicksOf(pcm, sr) {
  const frames = Math.max(0, Math.floor((pcm.length - KN) / KHOP) + 1);
  if (frames < 3) return [];
  const win = Float64Array.from({ length: KN }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (KN - 1)));
  const binHz = sr / KN, lo = Math.ceil(KICK_BAND_HZ[0] / binHz), hi = Math.floor(KICK_BAND_HZ[1] / binHz);
  const re = new Float64Array(KN), im = new Float64Array(KN);
  const e = new Float64Array(frames), share = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < KN; i++) { re[i] = pcm[f * KHOP + i] * win[i]; im[i] = 0; }
    fft(re, im);
    let s = 0, all = 0;
    for (let k = 1; k < KN / 2; k++) { const p = re[k] * re[k] + im[k] * im[k]; all += p; if (k >= lo && k <= hi) s += p; }
    e[f] = 10 * Math.log10(s + 1e-9);
    share[f] = 10 * Math.log10((s + 1e-9) / (all + 1e-9));
  }
  const top = Math.max(...e);
  const rise = Float64Array.from(e, (v, f) => (f ? Math.max(0, v - e[f - 1]) : 0));
  const sorted = Float64Array.from(rise).sort();
  const gate = Math.max(6, sorted[Math.floor(sorted.length * 0.93)]);
  const kicks = [];
  for (let f = 1; f < frames - 1; f++) {
    if (rise[f] < gate || rise[f] < rise[f - 1] || rise[f] < rise[f + 1] || e[f] < top - 40 || share[f] < -KICK_BAND_SHARE_DB) continue;
    const t = (f * KHOP) / sr + KICK_LAG_S;
    if (!kicks.length || t - kicks[kicks.length - 1] >= 0.1) kicks.push(t);
  }
  return kicks;
}

export function kickCheck(pcm, beats, sr) {
  const kicks = kicksOf(pcm, sr);
  let on = 0;
  const offs = [];
  for (const b of beats) {
    let best = null;
    for (const k of kicks) if (best == null || Math.abs(k - b) < Math.abs(best - b)) best = k;
    if (best == null) continue;
    offs.push((best - b) * 1000);
    if (Math.abs(best - b) <= KICK_WINDOW_S) on++;
  }
  offs.sort((a, b) => a - b);
  const share = beats.length ? on / beats.length : 0;
  return {
    kicks: kicks.length, beats: beats.length, onKick: on, share: Math.round(share * 1000) / 1000,
    windowMs: KICK_WINDOW_S * 1000, medianOffsetMs: offs.length ? Math.round(offs[offs.length >> 1]) : null,
    usable: kicks.length > 0 && share >= KICK_MIN_SHARE,
  };
}
