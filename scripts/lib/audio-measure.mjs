// Measures a short sound from its samples, in Node, with no tool: what the sound system asks of a cue
// (SPEC §9). Library only. `channels` is an array of Float32Array (one per channel, equal length) and
// `sr` the sample rate. Loudness follows ITU-R BS.1770 (the K-weighting filter, the -0.691 offset, equal
// weight to left and right); the loudest 100 ms is the match level of a palette's cues, because a cue
// is shorter than the 400 ms window of momentary loudness.
//
//   kWeighted(channels, sr)            the channels through the K-weighting filter
//   loudest100ms(channels, sr)         LUFS of the loudest 100 ms (a 10 ms hop)
//   ungatedLufs(channels, sr)          LUFS of the whole sound, ungated
//   samplePeakDb(channels)             highest absolute sample, dBFS
//   envelope(channels, sr, winS, hopS) mono RMS envelope, dB
//   attackS(env) · t60S(env)           10 to 90 % rise time; seconds to fall 60 dB, from the slope between -5 and -25 dB
//   spectrum(channels, sr)             { f[], p[], binHz } power spectrum of the mono mix, cut to where the sound is
//   centroidHz(sp) · rolloffHz(sp, share=0.85) · peaksOf(sp, { max, floorDb, minHz }) · flatness(sp)
//   balanceDb(channels, sr)            left minus right, K-weighted energy, dB
//   sideMidDb(channels)                energy of (L-R)/2 against (L+R)/2, dB
//   THIRD_OCTAVE_HZ · thirdOctaveProfile(channels, sr)   the 28 third-octave centres (31.5 Hz to 16 kHz) and the sound's power in each, dB under the total, floored at -60
//   bandgram(channels, sr, { hopS })   { db: [frame][28], hopS }  third-octave band power in 10 ms cells, dB
//   bedOf(channels, sr, onsetSample)   the bed under an event: the quietest 150 ms of the 0.6 s before it (15 ms away), or null
//   eventMeasure(event, sr, bed)       the event with the bed taken away: bands, masked bands, exposure over the bed, decay shape, stutter
//   measure(channels, sr)              all of the above in one record

const db10 = (x) => (x > 0 ? 10 * Math.log10(x) : -Infinity);
const db20 = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

function biquad(x, b, a) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** The K-weighting filter (a high shelf, then a high pass), designed for `sr`. */
export function kWeighted(channels, sr) {
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / sr), Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416;
  const a0 = 1 + K / Q + K * K;
  const b1 = [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0];
  const a1 = [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
  const f1 = 38.13547087602444, Q2 = 0.5003270373238773;
  const K2 = Math.tan((Math.PI * f1) / sr);
  const c0 = 1 + K2 / Q2 + K2 * K2;
  const b2 = [1, -2, 1];
  const a2 = [1, (2 * (K2 * K2 - 1)) / c0, (1 - K2 / Q2 + K2 * K2) / c0];
  return channels.map((c) => biquad(biquad(c, b1, a1), b2, a2));
}

/** LUFS of the loudest 100 ms (hop 10 ms; a sound shorter than 100 ms is padded with silence). */
export function loudest100ms(channels, sr) {
  const w = kWeighted(channels, sr);
  const win = Math.round(sr * 0.1), hop = Math.round(sr * 0.01), n = Math.max(win, w[0].length);
  // running sums of squares per channel, so each window is two lookups
  const cum = w.map((c) => { const s = new Float64Array(n + 1); for (let i = 0; i < n; i++) s[i + 1] = s[i] + (i < c.length ? c[i] * c[i] : 0); return s; });
  let best = 0;
  for (let s = 0; s + win <= n; s += hop) {
    let ms = 0;
    for (const s2 of cum) ms += (s2[s + win] - s2[s]) / win;
    if (ms > best) best = ms;
  }
  return -0.691 + db10(best);
}

/** LUFS of the whole sound, ungated (a cue is too short for the gates to mean anything). */
export function ungatedLufs(channels, sr) {
  const w = kWeighted(channels, sr);
  let ms = 0;
  for (const c of w) { let s = 0; for (let i = 0; i < c.length; i++) s += c[i] * c[i]; ms += s / c.length; }
  return -0.691 + db10(ms);
}

export function samplePeakDb(channels) {
  let p = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; }
  return db20(p);
}

/** The mono mix's RMS in dB over windows of `winS`, every `hopS`: { db: Float64Array, hopS }. */
export function envelope(channels, sr, winS = 0.005, hopS = 0.0025) {
  const n = channels[0].length, win = Math.max(1, Math.round(sr * winS)), hop = Math.max(1, Math.round(sr * hopS));
  const mono = new Float64Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) mono[i] += c[i] / channels.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + mono[i] * mono[i];
  const out = [];
  for (let s = 0; s + win <= n; s += hop) out.push(db10((cum[s + win] - cum[s]) / win));
  return { db: Float64Array.from(out), hopS: hop / sr };
}

/**
 * The rise of the first note, 10 to 90 % of its peak amplitude, in seconds: from the first frame within
 * 20 dB of the loudest point, following the envelope up until it falls 3 dB, to that note's own peak. Null for silence. Takes a fine envelope (envelope(…, 0.002, 0.0005)).
 */
export function attackS(env) {
  const top = Math.max(...env.db);
  if (!Number.isFinite(top)) return null;
  const i0 = env.db.findIndex((d) => d >= top - 20);
  let ip = i0;
  for (let i = i0; i < env.db.length; i++) {
    if (env.db[i] > env.db[ip]) ip = i;
    else if (env.db[i] < env.db[ip] - 3) break;      // a real fall: the first note's peak is behind us
  }
  const peak = env.db[ip];
  const lo = env.db.findIndex((d) => d >= peak - 20), hi = env.db.findIndex((d) => d >= peak - 0.915);
  return lo < 0 || hi < 0 ? null : Math.max(0, (hi - lo) * env.hopS);
}

/** Seconds for the sound to fall 60 dB after its loudest point: the slope between -5 and -25 dB, extended. Null when it never falls 25 dB. */
export function t60S(env) {
  let pi = 0;
  env.db.forEach((d, i) => { if (d > env.db[pi]) pi = i; });
  const peak = env.db[pi];
  const pts = [];
  for (let i = pi; i < env.db.length; i++) {
    const d = env.db[i] - peak;
    if (d < -25) break;
    if (d <= -5) pts.push([i * env.hopS, d]);
  }
  if (pts.length < 3 || env.db.slice(pi).every((d) => d - peak > -25)) return null;
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const slope = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  return slope < 0 ? -60 / slope : null;
}

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/**
 * Power spectrum of the mono mix, zero-padded to a power of two (at least 2^15): { f, p, binHz }. The sound is
 * cut to where it is within 70 dB of its peak and only its last quarter is tapered (a half Hann), so the
 * attack keeps its weight and a decaying note's peak is its amplitude times its decay time.
 */
export function spectrum(channels, sr) {
  const full = channels[0].length;
  const mono = new Float64Array(full);
  for (const c of channels) for (let i = 0; i < full; i++) mono[i] += c[i] / channels.length;
  let top = 0;
  for (let i = 0; i < full; i++) top = Math.max(top, Math.abs(mono[i]));
  const gate = top * 10 ** (-70 / 20);
  let from = 0, to = full - 1;
  while (from < to && Math.abs(mono[from]) < gate) from++;
  while (to > from && Math.abs(mono[to]) < gate) to--;
  const len = to - from + 1, taper = Math.max(1, Math.floor(len / 4));
  let n = 1 << 15;
  while (n < len) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < len; i++) re[i] = mono[from + i] * (i < len - taper ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (i - (len - taper))) / taper));
  fft(re, im);
  const half = n / 2, f = new Float64Array(half), p = new Float64Array(half);
  for (let k = 0; k < half; k++) { f[k] = (k * sr) / n; p[k] = re[k] * re[k] + im[k] * im[k]; }
  return { f, p, binHz: sr / n };
}

export function centroidHz(sp) {
  let a = 0, b = 0;
  for (let k = 1; k < sp.f.length; k++) { a += sp.f[k] * sp.p[k]; b += sp.p[k]; }
  return b > 0 ? a / b : 0;
}

export function rolloffHz(sp, share = 0.85) {
  let total = 0;
  for (let k = 1; k < sp.p.length; k++) total += sp.p[k];
  let acc = 0;
  for (let k = 1; k < sp.p.length; k++) { acc += sp.p[k]; if (acc >= share * total) return sp.f[k]; }
  return sp.f[sp.f.length - 1];
}

/** Spectral flatness (geometric over arithmetic mean of the power, 0 to 1): 1 is noise, near 0 is a tone. */
export function flatness(sp, lo = 40, hi = 16000) {
  let ls = 0, s = 0, n = 0;
  for (let k = 1; k < sp.f.length; k++) if (sp.f[k] >= lo && sp.f[k] <= hi) { const v = sp.p[k] + 1e-30; ls += Math.log(v); s += v; n++; }
  return n ? Math.exp(ls / n) / (s / n) : 0;
}

/** Local maxima of the spectrum within `floorDb` of the strongest, at least `minHz` apart: [{ f, db }] by frequency. */
export function peaksOf(sp, { max = 8, floorDb = -40, minHz = 40, apartHz = 20 } = {}) {
  let top = 0;
  for (let k = 0; k < sp.p.length; k++) if (sp.f[k] >= minHz && sp.p[k] > top) top = sp.p[k];
  const cands = [];
  for (let k = 2; k < sp.p.length - 2; k++) {
    if (sp.f[k] < minHz || !(sp.p[k] > sp.p[k - 1] && sp.p[k] >= sp.p[k + 1])) continue;
    const d = db10(sp.p[k] / top);
    if (d < floorDb) continue;
    // parabolic interpolation of the peak's frequency
    const a = Math.log(sp.p[k - 1] + 1e-30), b = Math.log(sp.p[k] + 1e-30), c = Math.log(sp.p[k + 1] + 1e-30);
    const off = 0.5 * (a - c) / (a - 2 * b + c);
    cands.push({ f: sp.f[k] + (Number.isFinite(off) ? off : 0) * sp.binHz, db: d });
  }
  cands.sort((x, y) => y.db - x.db);
  const kept = [];
  for (const c of cands) if (kept.length < max && kept.every((k) => Math.abs(k.f - c.f) >= apartHz)) kept.push(c);
  return kept.sort((x, y) => x.f - y.f);
}

/** Left minus right, K-weighted energy over the whole sound, dB (0 for a mono sound). */
export function balanceDb(channels, sr) {
  if (channels.length < 2) return 0;
  const w = kWeighted(channels.slice(0, 2), sr);
  const e = w.map((c) => { let s = 0; for (let i = 0; i < c.length; i++) s += c[i] * c[i]; return s; });
  return e[0] > 0 && e[1] > 0 ? db10(e[0] / e[1]) : 0;
}

/** The side signal's energy against the mid's, dB (-Infinity for mono). */
export function sideMidDb(channels) {
  if (channels.length < 2) return -Infinity;
  let m = 0, s = 0;
  for (let i = 0; i < channels[0].length; i++) { const a = channels[0][i], b = channels[1][i]; m += ((a + b) / 2) ** 2; s += ((a - b) / 2) ** 2; }
  return m > 0 ? db10(s / m) : -Infinity;
}

// ---------------------------------------------------------------------------------------------------------------
// Third-octave measures and the bed-subtracted measurement of an event on music (SPEC §9). The band edges are
// c / 2^(1/6) to c * 2^(1/6) around the 28 centres 1000 * 2^(k/3), k = -15..12.

export const THIRD_OCTAVE_HZ = Array.from({ length: 28 }, (_, i) => 1000 * 2 ** ((i - 15) / 3));
const EDGE = 2 ** (1 / 6);
const PROFILE_FLOOR_DB = -60;

/** The power of a spectrum in each third-octave band, summed over the bins: Float64Array(28). */
function bandSums(f, p) {
  const out = new Float64Array(28);
  for (let b = 0; b < 28; b++) {
    const lo = THIRD_OCTAVE_HZ[b] / EDGE, hi = THIRD_OCTAVE_HZ[b] * EDGE;
    for (let k = 1; k < f.length; k++) if (f[k] >= lo && f[k] < hi) out[b] += p[k];
  }
  return out;
}

/** Band powers as dB under the total of the bands, floored at -60: the level of the sound never decides. */
function toProfile(sums) {
  let total = 0;
  for (const v of sums) total += v;
  return Float64Array.from(sums, (v) => Math.max(PROFILE_FLOOR_DB, db10((v + 1e-20) / (total + 28e-20))));
}

const profileOfSpectrum = (sp) => toProfile(bandSums(sp.f, sp.p));

/** The sound's power in the 28 third-octave bands, dB under the total power (the same spectrum as `spectrum`). */
export function thirdOctaveProfile(channels, sr) { return profileOfSpectrum(spectrum(channels, sr)); }

const monoOf = (channels) => {
  const n = channels[0].length, m = new Float64Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) m[i] += c[i] / channels.length;
  return m;
};

/** Mean-square power per third-octave band of a short stretch of mono samples, under a Hann window: Float64Array(28). */
function bandPowers(x, sr) {
  const len = x.length;
  let n = 4096;
  while (n < len) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  let wsum = 0;
  for (let i = 0; i < len; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / len); re[i] = x[i] * w; wsum += w * w; }
  fft(re, im);
  const out = new Float64Array(28);
  for (let b = 0; b < 28; b++) {
    const lo = Math.ceil(((THIRD_OCTAVE_HZ[b] / EDGE) * n) / sr), hi = Math.ceil(((THIRD_OCTAVE_HZ[b] * EDGE) * n) / sr);
    let s = 0;
    for (let k = Math.max(1, lo); k < Math.min(hi, n / 2); k++) s += re[k] * re[k] + im[k] * im[k];
    out[b] = (2 * s) / (n * wsum);
  }
  return out;
}

/**
 * Third-octave band power over time: { db: Float64Array(28)[frames], hopS }. Frames are `hopS` (10 ms) apart, a Hann window of
 * `nfft` samples centred on each. At 1024 points the three lowest bands hold under one bin each, so they are measured as one
 * band (22 to 112 Hz) and the two lowest repeat it.
 */
export function bandgram(channels, sr, { hopS = 0.01, nfft = 1024 } = {}) {
  const x = monoOf(channels), hop = Math.max(1, Math.round(sr * hopS)), T = Math.max(1, Math.ceil(x.length / hop));
  const win = Float64Array.from({ length: nfft }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 1)) / (nfft + 2)));
  const binHz = sr / nfft, half = nfft / 2;
  const bandOfBin = new Int16Array(half + 1).fill(-1);
  for (let k = 1; k <= half; k++) {
    const f = k * binHz;
    if (f >= 22 && f < 112) bandOfBin[k] = 2;
    else for (let b = 3; b < 28; b++) if (f >= THIRD_OCTAVE_HZ[b] / EDGE && f < THIRD_OCTAVE_HZ[b] * EDGE) { bandOfBin[k] = b; break; }
  }
  const db = [];
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  for (let t = 0; t < T; t++) {
    const start = t * hop - half;
    for (let i = 0; i < nfft; i++) { const j = start + i; re[i] = j >= 0 && j < x.length ? x[j] * win[i] : 0; im[i] = 0; }
    fft(re, im);
    const sums = new Float64Array(28);
    for (let k = 1; k <= half; k++) if (bandOfBin[k] >= 0) sums[bandOfBin[k]] += re[k] * re[k] + im[k] * im[k];
    const row = Float64Array.from(sums, (v) => db10(v + 1e-20));
    row[0] = row[1] = row[2];
    db.push(row);
  }
  return { db, hopS: hop / sr };
}

/**
 * The bed under an event that starts at sample `onset`: the quietest `quietS` (150 ms) stretch inside the `windowS` (0.6 s)
 * that ends `gapS` (15 ms) before it, found at a 10 ms hop. { fromS, toS, db (mean power, dB), bands (mean-square power in each
 * third octave) }, or null when there are not 150 ms before the event to look in.
 */
export function bedOf(channels, sr, onset, { windowS = 0.6, quietS = 0.15, gapS = 0.015 } = {}) {
  const m = monoOf(channels), end = onset - Math.round(gapS * sr), start = Math.max(0, end - Math.round(windowS * sr)), win = Math.round(quietS * sr);
  if (end - start < win) return null;
  const hop = Math.round(sr * 0.01), cum = new Float64Array(m.length + 1);
  for (let i = 0; i < m.length; i++) cum[i + 1] = cum[i] + m[i] * m[i];
  let best = -1, bestP = Infinity;
  for (let s = start; s + win <= end; s += hop) { const p = (cum[s + win] - cum[s]) / win; if (p < bestP) { bestP = p; best = s; } }
  return { fromS: best / sr, toS: (best + win) / sr, db: db10(bestP), bands: bandPowers(m.subarray(best, best + win), sr) };
}

const DECAY_SPAN_DB = 40;        // a decay is read from the peak down to this far, or to 6 dB over the bed
const SHAPE_TOL_DB = 2.5;
const STUTTER_HZ = [4, 60];

/** convex (holds, then falls away), exponential (a straight line in dB), concave (falls fast, then lingers); by the mid-point's deviation from the chord, +-2.5 dB. */
function decayOf(event, sr, bed) {
  const env = envelope(event, sr, 0.005, 0.0025);
  const bedP = bed ? 10 ** (bed.db / 10) : 0;
  const p = Float64Array.from(env.db, (d) => Math.max(10 ** (d / 10) - bedP, 1e-12));
  let ip = 0;
  for (let i = 0; i < p.length; i++) if (p[i] > p[ip]) ip = i;
  const d = Float64Array.from(p, (v) => db10(v / p[ip]));
  const stop = bed ? Math.max(-DECAY_SPAN_DB, bed.db + 6 - db10(p[ip] + bedP)) : -DECAY_SPAN_DB;
  let ie = d.length - 1;
  for (let i = ip; i < d.length; i++) if (d[i] < stop) { ie = i; break; }
  if (ie - ip < 8 || d[ie] > -10) return null;
  const mid = (ip + ie) >> 1, dev = d[mid] - d[ie] / 2;
  return { shape: dev > SHAPE_TOL_DB ? 'convex' : dev < -SHAPE_TOL_DB ? 'concave' : 'exponential', deviationDb: Math.round(dev * 10) / 10, spanDb: Math.round(-d[ie] * 10) / 10 };
}

/** Seconds from the start of the event to where it has fallen 40 dB under its peak, the bed's power taken away (for 8 frames of 2.5 ms running), or null without a bed: the ring a bed does not lengthen. */
function ringOf(event, sr, bed) {
  if (!bed) return null;
  const env = envelope(event, sr, 0.005, 0.0025), bedP = 10 ** (bed.db / 10);
  const p = Float64Array.from(env.db, (d) => 10 ** (d / 10) - bedP);
  let ip = 0;
  for (let i = 0; i < p.length; i++) if (p[i] > p[ip]) ip = i;
  const floor = Math.max(p[ip] * 1e-4, bedP * 0.25);
  let run = 0;
  for (let i = ip; i < p.length; i++) {
    run = p[i] < floor ? run + 1 : 0;
    if (run >= 8) return (i - 7) * env.hopS;
  }
  return env.db.length * env.hopS;
}

/** The rate (Hz) of a 4 to 60 Hz amplitude modulation of the event's level, or null: the dB envelope with its trend removed, its strongest line in that range against the rest. */
function stutterOf(event, sr) {
  const env = envelope(event, sr, 0.002, 0.001), fs = 1 / env.hopS;
  let ip = 0;
  env.db.forEach((d, i) => { if (d > env.db[ip]) ip = i; });
  let ie = ip;
  for (let i = ip; i < Math.min(env.db.length, ip + Math.round(fs)); i++) if (env.db[i] >= env.db[ip] - 30) ie = i;      // the last frame still within 30 dB, in the first second
  const len = ie - ip;
  if (len < 0.15 * fs) return null;
  const y = Float64Array.from({ length: len }, (_, i) => Math.max(env.db[ip + i], env.db[ip] - 40));
  const mx = (len - 1) / 2;
  let my = 0;
  for (const v of y) my += v / len;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < len; i++) { sxy += (i - mx) * (y[i] - my); sxx += (i - mx) ** 2; }
  const slope = sxx > 0 ? sxy / sxx : 0;
  let n = 1024;
  while (n < len * 4) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < len; i++) re[i] = (y[i] - my - slope * (i - mx)) * (0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / len));
  fft(re, im);
  const amp = (k) => (2 * Math.hypot(re[k], im[k])) / (len / 2);
  const lo = Math.ceil((STUTTER_HZ[0] * n) / fs), hi = Math.floor((STUTTER_HZ[1] * n) / fs);
  let best = lo;
  for (let k = lo; k <= hi; k++) if (amp(k) > amp(best)) best = k;
  const ref = [];
  for (let k = Math.ceil((2 * n) / fs); k <= Math.floor((100 * n) / fs); k++) ref.push(amp(k));
  ref.sort((a, b) => a - b);
  const med = ref[ref.length >> 1] || 1e-9;
  return amp(best) >= 1.5 && amp(best) >= 8 * med ? Math.round(((best * fs) / n) * 10) / 10 : null;
}

/** The start and length (samples) of the loudest 100 ms of a mono signal (a 10 ms hop; the whole of a shorter sound). */
function loudestWindow(m, sr) {
  const win = Math.min(m.length, Math.round(0.1 * sr)), hop = Math.round(sr * 0.01);
  const cum = new Float64Array(m.length + 1);
  for (let i = 0; i < m.length; i++) cum[i + 1] = cum[i] + m[i] * m[i];
  let best = 0, bestP = -1;
  for (let s = 0; s + win <= m.length; s += hop) { const p = cum[s + win] - cum[s]; if (p > bestP) { bestP = p; best = s; } }
  return { best, win };
}

/** The third-octave profile of the sound's loudest 100 ms, dB under the total: what a mined event's `balance` is without a bed. */
export function loudestBalance(channels, sr) {
  const m = monoOf(channels), { best, win } = loudestWindow(m, sr);
  return toProfile(bandPowers(m.subarray(best, best + win), sr));
}

/**
 * An event measured with its bed taken away. `event` is the event's own channels (cut out of the recording), `bed` from `bedOf`
 * (null when the recording gives none). Over the event's loudest 100 ms: `addedDb` per third-octave band (event plus bed over
 * bed), `masked` where the event adds under 1 dB (the music hides it), `balance` the event's profile with the bed subtracted
 * (-60 in a masked band), `exposedDb` how far the loudest 100 ms stands over the bed (null without one) and `exposed` (at least
 * 12 dB over it, or no bed): below that, what is read from the event (its family) is a guess. Also the `decay` shape and the
 * `stutterHz` (4 to 60 Hz amplitude modulation), and `ringS`, the time until the event has fallen 40 dB with the bed's power taken
 * away (null without a bed), which is the ring a bed does not lengthen.
 */
export function eventMeasure(event, sr, bed) {
  const m = monoOf(event), { best, win } = loudestWindow(m, sr);
  const on = bandPowers(m.subarray(best, best + win), sr);
  const addedDb = new Array(28).fill(null), masked = new Array(28).fill(false), sub = new Float64Array(28);
  for (let b = 0; b < 28; b++) {
    if (!bed) { sub[b] = on[b]; continue; }
    addedDb[b] = Math.round(db10((on[b] + 1e-20) / (bed.bands[b] + 1e-20)) * 10) / 10;
    masked[b] = addedDb[b] < 1;
    sub[b] = masked[b] ? 0 : Math.max(on[b] - bed.bands[b], 0);
  }
  let total = 0;
  for (const v of sub) total += v;
  const balance = total > 0 ? toProfile(sub) : new Float64Array(28).fill(PROFILE_FLOOR_DB);
  if (bed) for (let b = 0; b < 28; b++) if (masked[b]) balance[b] = PROFILE_FLOOR_DB;
  let power = 0;
  for (const v of on) power += v;
  const exposedDb = bed ? Math.round((db10(power + 1e-20) - bed.db) * 10) / 10 : null;
  return { exposedDb, exposed: exposedDb === null || exposedDb >= 12, addedDb, masked, balance, ringS: ringOf(event, sr, bed), decay: decayOf(event, sr, bed), stutterHz: stutterOf(event, sr) };
}

/** Everything a palette asks of a cue, in one record. */
export function measure(channels, sr) {
  const env = envelope(channels, sr);
  const fine = envelope(channels, sr, 0.002, 0.0005);
  const sp = spectrum(channels, sr);
  const lastLoud = (() => { const peak = Math.max(...env.db); let i = env.db.length - 1; while (i > 0 && env.db[i] < peak - 40) i--; return (i + 1) * env.hopS; })();
  return {
    durationS: channels[0].length / sr,
    audibleS: lastLoud,                       // until the sound is last within 40 dB of its peak
    peakDbfs: samplePeakDb(channels),
    lufs100ms: loudest100ms(channels, sr),
    lufsIntegrated: ungatedLufs(channels, sr),
    attackS: attackS(fine),
    t60S: t60S(env),
    centroidHz: centroidHz(sp),
    rolloffHz: rolloffHz(sp),
    flatness: flatness(sp),
    balanceDb: balanceDb(channels, sr),
    sideMidDb: sideMidDb(channels),
    peaks: peaksOf(sp),
    bandsDb: Array.from(profileOfSpectrum(sp)),
  };
}
