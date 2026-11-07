// The artifacts of a synthesised or sampled cue, measured straight from its samples with no model (SPEC §7, W-SOUND-ARTIFACT).
// Library only; pure. The detectors are restated from a MIT-licensed sound forge's polish and audit modules (see NOTICE), in this
// repository's idiom (JavaScript, any sample rate); the stacked-attack test also takes a clean-hit definition (5 ms frames) from ideas
// published elsewhere. Each detector returns plain data; `findArtifacts` folds them into findings, one per kind.
//
//   findArtifacts(channels, sr, { cue })   [{ kind, message, measured }]  kinds: click, dc, clipping, truncated, ring, rerise, stacked, glide
//   clicks(m, sr) · dcOffset(m) · clipRuns(channels) · tailEnd(m, sr) · combRing(m, sr) · tailBump(m, sr)
//   attacks(m, sr) · flam(m, sr) · risingGlide(m, sr)
//
//   click      an isolated discontinuity inside the sound: 1 ms frames of the second difference (a jump stands far above smooth content)
//              more than 18 dB over both neighbourhoods, the neighbourhoods within 8 dB of each other, 60 % or more of the frame's energy
//              in 2 samples; or a first or last sample more than -40 dB under the peak (the file clicks when played)
//   dc         the mean is within 40 dB of the peak
//   clipping   a flat run of 2 or more samples at the peak, or a sample over full scale
//   truncated  the sound ends within 40 dB of its peak, unless it ends on its loudest moment (a riser stops on its hit by design)
//   ring       a metallic comb in the tail: the cepstral peak of the tail's log spectrum at 2 to 40 ms, 15 robust deviations over the rest;
//              not judged for a tail whose power lies within 2 kHz (5th to 95th percentile), nor when the delay is the sound's own pitch
//   rerise     after the sound has fallen 20 dB, its 10 ms level climbs 6 dB above its running minimum and stays 18 dB or more under the
//              peak: a ghost event in the tail (a second note reaches the peak's own level and is not one)
//   stacked    (a hit) two attacks: 25 ms levels with two peaks within 6 dB of the loudest and 10 dB between them, or 5 ms frames with a
//              second onset (a rise of 8 dB over the two frames before, within 30 dB of the peak) 40 ms or more after the first; or more
//              than 100 ms of build before the hit
//   glide      a tonal sound whose pitch climbs more than 4 semitones over at least 50 ms: the rising synth whip
import { fft } from './audio-measure.mjs';
import { CUE_ROLE } from './sound-roles.mjs';

const GLIDE_ST = 4, GLIDE_MIN_S = 0.05, RING_Z = 15, BUMP_DB = 6, BUMP_FROM_DB = -20, BUMP_TO_DB = -18, PRE_SWELL_MS = 100, TRUNCATED_DB = -40, DC_DB = -40, EDGE_DB = -40;
const db10 = (x) => 10 * Math.log10(x);
const median = (a) => { const s = Float64Array.from(a).sort(); return s.length ? (s.length % 2 ? s[s.length >> 1] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2])) : 0; };
const round = (x, p = 1) => Math.round(x * 10 ** p) / 10 ** p;

const monoOf = (channels) => {
  const n = channels[0].length, m = new Float64Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) m[i] += c[i] / channels.length;
  return m;
};
/** dB mean power of consecutive frames of `n` samples. */
function frameDb(m, n) {
  const k = Math.floor(m.length / n), out = new Float64Array(k);
  for (let f = 0; f < k; f++) { let s = 0; for (let i = f * n; i < (f + 1) * n; i++) s += m[i] * m[i]; out[f] = db10(s / n + 1e-24); }
  return out;
}
const peakOf = (m) => { let p = 0; for (const v of m) { const a = Math.abs(v); if (a > p) p = a; } return p; };
const argmax = (a) => { let b = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[b]) b = i; return b; };

// ---- clicks ------------------------------------------------------------------------------------------------------------
export function clicks(m, sr) {
  const peak = peakOf(m) + 1e-12;
  const edgeDb = 20 * Math.log10(Math.max(Math.abs(m[0]), Math.abs(m[m.length - 1])) / peak + 1e-12);
  const fr = Math.round(sr / 1000), d2 = new Float64Array(Math.max(0, m.length - 2));
  for (let i = 0; i < d2.length; i++) d2[i] = m[i + 2] - 2 * m[i + 1] + m[i];
  const e = frameDb(d2, fr), lvl = frameDb(m, fr), k = Math.min(e.length, lvl.length), times = [];
  if (k >= 24) {
    let ip = 0, top = -Infinity;
    for (let i = 0; i < k; i++) if (lvl[i] > top) { top = lvl[i]; ip = i; }
    const at = (i) => e[Math.min(k - 1, Math.max(0, i))];
    const hit = new Array(k).fill(false);
    for (let i = 0; i < k; i++) {
      const pre = median(Array.from({ length: 8 }, (_, j) => at(i - 10 + j))), post = median(Array.from({ length: 8 }, (_, j) => at(i + 3 + j)));
      if (!(e[i] - Math.max(pre, post) > 18 && Math.abs(post - pre) < 8 && lvl[i] > top - 70 && Math.abs(i - ip) > 3)) continue;
      const sq = Array.from({ length: fr }, (_, j) => d2[i * fr + j] ** 2).sort((a, b) => a - b);
      let all = 0;
      for (const v of sq) all += v;
      if ((sq[fr - 1] + sq[fr - 2]) / (all + 1e-30) > 0.6) hit[i] = true;
    }
    for (let i = 0; i < k;) {
      if (!hit[i]) { i++; continue; }
      let j = i;
      while (j + 1 < k && hit[j + 1]) j++;
      times.push(round(((i + j + 1) / 2) / 1000, 3));
      i = j + 1;
    }
  }
  return { clicks: times.length, times: times.slice(0, 8), edgeDb: round(edgeDb) };
}

// ---- level artifacts ---------------------------------------------------------------------------------------------------
export function dcOffset(m) {
  let s = 0;
  for (const v of m) s += v;
  return { dcDb: round(20 * Math.log10(Math.abs(s / m.length) / (peakOf(m) + 1e-12) + 1e-12)) };
}

export function clipRuns(channels) {
  let runs = 0, overs = 0;
  for (const c of channels) {
    const pk = peakOf(c);
    if (pk <= 0) continue;
    let run = 0;
    for (let i = 0; i < c.length; i++) {
      if (Math.abs(c[i]) > 1) overs++;
      const flat = i > 0 && Math.abs(c[i]) >= 0.99 * pk && Math.abs(c[i] - c[i - 1]) < 1e-6 * pk; // level with the one before it, at the peak (relative: a quiet deep sine's round top is not flat)
      if (flat) run++;
      else { if (run >= 2) runs++; run = 0; }                                                       // two such in a row: three equal samples
    }
    if (run >= 2) runs++;
  }
  return { clipRuns: runs, overs };
}

/**
 * The level (dB under the peak) at which a tail was cut, or null: 5 ms frames; the sound is still decaying faster than 20 dB/s when the
 * file stops above -50 dB, or a final fade falls much faster than the decay before it. Null when the sound reaches -55 dB, and
 * `endsOnPeak` when it ends on its loudest moment (a riser stops on its hit by design).
 */
export function tailEnd(m, sr) {
  const e = frameDb(m, Math.round(sr * 0.005)), k = e.length;
  if (k < 12) return { cutDb: null, endsOnPeak: false };
  const ip = argmax(e), top = e[ip];
  for (let i = 0; i < k; i++) e[i] -= top;
  const end = 0.5 * (e[k - 1] + e[k - 2]), pk = argmax(Float64Array.from(m, Math.abs));
  const endsOnPeak = pk >= 0.97 * m.length || ip >= k - 3;
  if (k - ip < 12 || end < -55) return { cutDb: null, endDb: round(end), endsOnPeak };
  const from = Math.max(ip, k - 38), before = Array.from(e.subarray(from, k - 8));
  let slope = 0;
  if (before.length >= 4) {                                           // dB per second, a least-squares line
    const mx = (before.length - 1) / 2, my = before.reduce((s, v) => s + v, 0) / before.length;
    let sxy = 0, sxx = 0;
    before.forEach((v, i) => { sxy += (i - mx) * (v - my); sxx += (i - mx) ** 2; });
    slope = sxx > 0 ? sxy / sxx / 0.005 : 0;
  }
  const fadeFrom = (e[k - 10] + e[k - 9] + e[k - 8]) / 3, expect = Math.max(3, -slope * 0.04);
  let cut = null;
  if (fadeFrom - end > 3 * expect + 6 && fadeFrom > -50) cut = fadeFrom;
  else if (slope < -20 && end > -50) cut = end;
  return { cutDb: cut == null ? null : round(cut), endDb: round(end), endsOnPeak };
}

/**
 * The largest re-rise of the 10 ms level above its running minimum after the peak (frames above -45 dB): the rise in dB, the level
 * the minimum was at and the level it climbed to, all under the peak.
 */
export function tailBump(m, sr) {
  const e = frameDb(m, Math.round(sr * 0.01));
  if (e.length < 4) return { bumpDb: 0, fromDb: 0, toDb: 0 };
  const p = Float64Array.from(e, (v) => 10 ** (v / 10)), q = new Float64Array(p.length);
  for (let i = 0; i < p.length; i++) q[i] = db10(((p[Math.max(0, i - 1)] + p[i] + p[Math.min(p.length - 1, i + 1)]) / 3) + 1e-24);
  const ip = argmax(q);
  let run = Infinity, bump = { bumpDb: 0, fromDb: 0, toDb: 0 };
  for (let i = ip + 2; i < q.length; i++) {
    const d = q[i] - q[ip];
    if (!(d < run)) continue;
    run = d;                                                         // a new low: how far does the level climb from here, within 200 ms, before a lower one?
    if (run > BUMP_FROM_DB) continue;
    let top = run;
    for (let j = i + 1; j < Math.min(q.length, i + 21) && q[j] - q[ip] >= run; j++) top = Math.max(top, q[j] - q[ip]);
    // a tail's re-rise starts from a level the sound has fallen to and stays well under the peak (a second note climbs to the peak's own level)
    if (top - run > bump.bumpDb && top <= BUMP_TO_DB && top > -45) bump = { bumpDb: round(top - run), fromDb: round(run), toDb: round(top) };
  }
  return bump;
}

// ---- comb ring ----------------------------------------------------------------------------------------------------------
const hann = (n) => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, n - 1)));
/** A centred moving average of `w` samples with the edge values repeated. */
function smooth(a, w) {
  const n = a.length, h = w >> 1, out = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = i - h; j < i - h + w; j++) s += a[Math.min(n - 1, Math.max(0, j))]; out[i] = s / w; }
  return out;
}
/** The log power spectrum (dB, 1e-30 floor) of a Hann-windowed segment zero-padded to N. */
function logSpectrum(seg, N) {
  const re = new Float64Array(N), im = new Float64Array(N), w = hann(seg.length);
  for (let i = 0; i < seg.length; i++) re[i] = seg[i] * w[i];
  fft(re, im);
  return Float64Array.from({ length: N / 2 + 1 }, (_, k) => db10(re[k] * re[k] + im[k] * im[k] + 1e-30));
}
/** The robust z and quefrency (ms) of the largest cepstral peak at 2-40 ms of a segment's log spectrum (300 Hz to 12 kHz, 2 kHz trend removed); with `span` also the bandwidth (Hz) within 40 dB of the loudest. Null when the segment is too short. */
function cepstrumPeak(seg, sr, span = false) {
  const N = seg.length <= 8192 ? 8192 : 16384, L = logSpectrum(seg, N), df = sr / N;
  const lo = Math.ceil(300 / df), hi = Math.floor(12000 / df), sel = L.subarray(lo, hi + 1);
  let top = -Infinity;
  for (const v of sel) top = Math.max(top, v);
  const clipped = Float64Array.from(sel, (v) => Math.max(v, top - 60)), trend = smooth(clipped, Math.max(3, Math.floor(2000 / df)));
  const win = hann(clipped.length);
  let Np = 1;
  while (Np < clipped.length) Np <<= 1;
  const re = new Float64Array(Np), im = new Float64Array(Np);
  for (let i = 0; i < clipped.length; i++) re[i] = (clipped[i] - trend[i]) * win[i];
  fft(re, im);
  const c = [], q = [];
  for (let k = 0; k < Np / 2; k++) { const t = k / (Np * df); if (t >= 0.002 && t <= 0.04) { c.push(Math.hypot(re[k], im[k])); q.push(t); } }
  if (c.length < 8) return null;
  const med = median(c), mad = median(c.map((v) => Math.abs(v - med))) * 1.4826 + 1e-12, j = argmax(c);
  const out = { z: (c[j] - med) / mad, ms: q[j] * 1000 };
  if (span) {                                           // how wide the tail is: the 5th to the 95th percentile of its power between 300 Hz and 12 kHz
    const pw = Float64Array.from(sel, (v) => 10 ** (v / 10));
    let total = 0;
    for (const v of pw) total += v;
    let acc = 0, lo = 0, hi = pw.length - 1;
    for (let i = 0; i < pw.length; i++) { acc += pw[i]; if (acc < 0.05 * total) lo = i; if (acc <= 0.95 * total) hi = i; }
    out.bw = (hi - lo) * df;
  }
  return out;
}
/** Median |second difference| (dB) of the levels at the multiples of 1 / delay: an oscillator's partials are smooth, a comb fed with noise scatters. Infinity with fewer than 8 teeth. */
function teethRoughness(seg, sr, ms) {
  const N = 16384, L = logSpectrum(seg, N), df = sr / N, f0 = 1000 / ms;
  let top = -Infinity;
  for (const v of L) top = Math.max(top, v);
  const lv = [];
  for (let k = Math.max(1, Math.ceil(300 / f0)); k <= Math.floor(12000 / f0); k++) {
    const c = Math.floor((k * f0) / df);
    let v = -Infinity;
    for (let j = Math.max(0, c - 2); j <= Math.min(L.length - 1, c + 2); j++) v = Math.max(v, L[j]);
    if (v > top - 50) lv.push(v);
  }
  if (lv.length < 8) return Infinity;
  return median(lv.slice(2).map((v, i) => Math.abs(v - 2 * lv[i + 1] + lv[i])));
}

/** { z, ms, src }: the comb's robust z and delay, or z null when it is not judged (src 'narrow' or 'pitch'); z null and no src when the tail is too short. */
export function combRing(m, sr) {
  const fr = Math.round(sr / 100), e = frameDb(m, fr);
  const ip = argmax(e), s = ip + 3;
  let end = e.length;
  for (let i = s; i < e.length; i++) if (e[i] < e[ip] - 50) { end = i; break; }
  if (end - s < 6) return { z: null, ms: null };
  const seg = m.subarray(s * fr, end * fr).subarray(0, 16384), got = cepstrumPeak(seg, sr, true);
  if (!got) return { z: null, ms: null };
  if (got.z < 8) return { z: round(got.z), ms: round(got.ms, 2) };
  if (got.bw < 2000) return { z: null, ms: round(got.ms, 2), raw: round(got.z), src: 'narrow' };
  let pitch = teethRoughness(seg, sr, got.ms) <= 2;
  if (!pitch) {
    const body = m.subarray(Math.max(0, (ip - 2) * fr), (ip + 6) * fr);
    const bp = body.length >= 4 * fr ? cepstrumPeak(body, sr) : null;
    if (bp && bp.z >= 100) { const r = got.ms / bp.ms; pitch = [1, 2, 3, 0.5, 1 / 3].some((k) => Math.abs(r / k - 1) < (k === 1 ? 0.3 : 0.1)); }
  }
  return pitch ? { z: null, ms: round(got.ms, 2), raw: round(got.z), src: 'pitch' } : { z: round(got.z), ms: round(got.ms, 2) };
}

// ---- attacks ------------------------------------------------------------------------------------------------------------
/** Separate attacks in a 25 ms level every 5 ms (peaks within 6 dB of the loudest, 10 dB of dip between them, in the first 0.5 s) and the build before the hit (first frame within 30 dB of the peak to the first within 6 dB). */
export function attacks(m, sr) {
  const w = Math.round(sr * 0.025), h = Math.round(sr * 0.005);
  if (m.length < w + 2 * h) return { count: 1, times: [0], preSwellMs: 0 };
  const cum = new Float64Array(m.length + 1);
  for (let i = 0; i < m.length; i++) cum[i + 1] = cum[i] + m[i] * m[i];
  const e = [];
  for (let s = 0; s + w <= m.length; s += h) e.push(db10((cum[s + w] - cum[s]) / w + 1e-24));
  const top = Math.max(...e), k = e.length;
  for (let i = 0; i < k; i++) e[i] -= top;
  const i30 = e.findIndex((v) => v >= -30), i6 = e.findIndex((v) => v >= -6);
  const ev = [];
  for (let i = 0; i < k; i++) {
    if (!(e[i] >= -6 && e[i] >= e[Math.max(0, i - 1)] && e[i] >= e[Math.min(k - 1, i + 1)])) continue;
    if (ev.length && (i - ev[0]) * h / sr > 0.5) break;
    if (ev.length) {
      const last = ev.at(-1);
      let mn = Infinity;
      for (let j = last; j <= i; j++) mn = Math.min(mn, e[j]);
      if (mn > Math.min(e[last], e[i]) - 10) { if (e[i] > e[last]) ev[ev.length - 1] = i; continue; }
    }
    ev.push(i);
  }
  return { count: ev.length, times: ev.map((i) => round((i * h + w / 2) / sr, 3)), preSwellMs: round(((i6 - i30) * 1000 * h) / sr) };
}

/** A flam: on 5 ms frames an onset is a rise of 8 dB over the two frames before it, within 30 dB of the peak; a second one 40 ms or more after the first and inside 0.5 s is a double hit. */
export function flam(m, sr) {
  const e = frameDb(m, Math.round(sr * 0.005)), k = e.length;
  if (k < 6) return { onsets: [] };
  const top = Math.max(...e), onsets = [];
  for (let i = 2; i < k; i++) {
    if (e[i] >= top - 30 && e[i] - Math.max(e[i - 1], e[i - 2]) >= 8 && (!onsets.length || (i - onsets.at(-1)) * 0.005 >= 0.04)) onsets.push(i);
  }
  const first = onsets[0] ?? 0;
  return { onsets: onsets.filter((i) => (i - first) * 0.005 <= 0.5).map((i) => round(i * 0.005, 3)) };
}

// ---- the rising glide ---------------------------------------------------------------------------------------------------
/** { riseSt, fromS, toS }: the largest climb of the strongest partial of a tonal sound (it holds half of the 80 Hz to 10 kHz energy within 3 semitones), in 21 ms frames every 5 ms, split where the track jumps more than 3 semitones. */
export function risingGlide(m, sr) {
  const nfft = 1024, hop = Math.round(sr * 0.005), pad = 8192;
  const x = m.length < nfft ? Float64Array.from({ length: nfft }, (_, i) => m[i] ?? 0) : m;
  const frames = 1 + Math.floor((x.length - nfft) / hop), w = hann(nfft), df = sr / pad;
  const a = Math.ceil(80 / df), b = Math.floor(10000 / df);
  const tot = new Float64Array(frames).fill(1e-30), fp = new Float64Array(frames), tonal = new Array(frames).fill(false), spec = [];
  const re = new Float64Array(pad), im = new Float64Array(pad);
  const timeE = Float64Array.from({ length: frames }, (_, t) => { let s = 0; for (let i = 0; i < nfft; i++) s += x[t * hop + i] ** 2; return s; });
  const timeTop = Math.max(...timeE);
  for (let t = 0; t < frames; t++) {
    if (timeE[t] < timeTop * 10 ** -3.6) { spec.push(null); fp[t] = 440; continue; }         // a frame 36 dB under the loudest is never within 30 dB: no FFT for it
    re.fill(0); im.fill(0);
    for (let i = 0; i < nfft; i++) re[i] = x[t * hop + i] * w[i];
    fft(re, im);
    const P = new Float64Array(b - a);
    let s = 0, best = 0;
    for (let k = a; k < b; k++) { P[k - a] = re[k] * re[k] + im[k] * im[k]; s += P[k - a]; if (P[k - a] > P[best]) best = k - a; }
    tot[t] = s + 1e-30; fp[t] = (a + best) * df; spec.push(P);
  }
  const topDb = db10(Math.max(...tot));
  for (let t = 0; t < frames; t++) {
    if (!spec[t] || db10(tot[t]) <= topDb - 30) continue;
    const half = Math.max(fp[t] * (2 ** (3 / 12) - 1), (2 * sr) / nfft), lo = Math.max(0, Math.floor((fp[t] - half) / df) - a), hi = Math.min(b - a - 1, Math.ceil((fp[t] + half) / df) - a);
    let s = 0;
    for (let k = lo; k <= hi; k++) s += spec[t][k];
    tonal[t] = s / tot[t] >= 0.5;
  }
  const st = Float64Array.from(fp, (f) => 12 * Math.log2(f / 440)), time = (t) => (t * hop + nfft / 2) / sr;
  let best = { riseSt: 0, fromS: null, toS: null };
  const close = (seg) => {
    if (seg.length < 6) return;
    const v = seg.map((_, q) => median(seg.slice(Math.max(0, q - 2), q + 3).map((t) => st[t])));
    let mn = Infinity, mnAt = 0;
    v.forEach((val, q) => {
      if (val < mn) { mn = val; mnAt = q; }
      if (val - mn > best.riseSt) best = { riseSt: val - mn, fromS: time(seg[mnAt]), toS: time(seg[q]) };
    });
  };
  let seg = [];
  for (let t = 0; t < frames; t++) {
    if (!tonal[t]) continue;
    if (seg.length && (t - seg.at(-1) > 2 || Math.abs(st[t] - st[seg.at(-1)]) > 3)) { close(seg); seg = []; }
    seg.push(t);
  }
  close(seg);
  return { riseSt: round(best.riseSt), fromS: best.fromS == null ? null : round(best.fromS, 3), toS: best.toS == null ? null : round(best.toS, 3) };
}

// ---- the findings -------------------------------------------------------------------------------------------------------

/** The role name of a cue (sound-roles CUE_ROLE); a cue not listed plays as a `tone`. */
export const roleNameOf = (cue) => CUE_ROLE[String(cue ?? '').replace(/^sound\//, '')] ?? 'tone';

/**
 * Every artifact of a cue's samples, one finding per kind: { kind, message, measured }. `cue` names the cue so its role is known:
 * only a hit is judged for stacked attacks (a chord or a rising pair has several by design).
 */
export function findArtifacts(channels, sr, { cue = null, role = null } = {}) {
  const m = monoOf(channels), out = [];
  if (!(peakOf(m) > 1e-6)) return out;
  const add = (kind, message, measured) => out.push({ kind, message, measured });
  const c = clicks(m, sr);
  if (c.clicks) add('click', `${c.clicks} click${c.clicks === 1 ? '' : 's'} at ${c.times.slice(0, 3).map((t) => `${t.toFixed(3)} s`).join(', ')} (a jump in the waveform)`, { clicks: c.clicks, times: c.times });
  else if (c.edgeDb > EDGE_DB) add('click', `starts or ends off zero (${c.edgeDb} dB under its peak): it clicks when played`, { edgeDb: c.edgeDb });
  const dc = dcOffset(m);
  if (dc.dcDb > DC_DB) add('dc', `a DC offset ${dc.dcDb} dB under its peak`, dc);
  const cl = clipRuns(channels);
  if (cl.clipRuns || cl.overs) add('clipping', `clipped: ${cl.clipRuns} flat top${cl.clipRuns === 1 ? '' : 's'}, ${cl.overs} sample${cl.overs === 1 ? '' : 's'} over full scale`, cl);
  const te = tailEnd(m, sr);
  if (te.cutDb != null && te.cutDb > TRUNCATED_DB && !te.endsOnPeak) add('truncated', `the tail is cut off ${te.cutDb} dB under the peak: fade it out or let it ring longer`, { cutDb: te.cutDb });
  const ring = combRing(m, sr);
  if (ring.z != null && ring.z > RING_Z) add('ring', `a metallic comb ring in the tail every ${ring.ms} ms (z ${Math.round(ring.z)})`, { z: ring.z, ms: ring.ms });
  const tb = tailBump(m, sr);
  if (tb.bumpDb > BUMP_DB) add('rerise', `the tail rises again by ${tb.bumpDb} dB after falling to ${tb.fromDb} dB under the peak: a second event in it`, tb);
  const roleName = role ?? roleNameOf(cue);
  if (roleName === 'hit') {
    const a = attacks(m, sr), f = flam(m, sr);
    if (a.count >= 2 || f.onsets.length >= 2) add('stacked', `${Math.max(a.count, f.onsets.length)} separate attacks (${(a.count >= 2 ? a.times : f.onsets).slice(0, 3).map((t) => `${t.toFixed(2)} s`).join(', ')}): layers stacked where one clean hit reads better`, { attacks: a.times, onsets: f.onsets });
    else if (a.preSwellMs > PRE_SWELL_MS) add('stacked', `${a.preSwellMs} ms of build before the hit (a lead-in stacked onto it)`, { preSwellMs: a.preSwellMs });
  }
  const g = roleName === 'riser' ? { riseSt: 0 } : risingGlide(m, sr);                // a riser climbs by design
  if (g.riseSt > GLIDE_ST && g.toS - g.fromS >= GLIDE_MIN_S) add('glide', `pitch climbs ${Math.round(g.riseSt)} semitones over ${Math.round((g.toS - g.fromS) * 1000)} ms (${g.fromS.toFixed(2)}-${g.toS.toFixed(2)} s): a rising synth whip reads as cheap`, g);
  return out;
}
