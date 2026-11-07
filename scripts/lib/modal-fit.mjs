// The modal fit (SPEC §9): a tonal sound -> its modes, the frequency, the decay and the amplitude of each damped sinusoid, which
// is the shape of a tone layer's partials. Library only; pure; plain JavaScript. The method is analysis by synthesis restated
// from a MIT-licensed sound forge (see NOTICE): damped-sinusoid candidates by ESPRIT on complex-demodulated, decimated
// sub-bands (the model order by MDL on the singular values), amplitudes and phases by least squares on the whole sound (the Gram
// matrix of damped exponentials in closed form), weak modes and clusters of near-duplicates that cancel pruned, a second pass on
// the residual. The linear algebra is scripts/lib/linalg.mjs.
//
//   fitModes(channels, sr, opts)   { ok, modes: [{ f, tauS, t60S, amp, phase, db }], residualDb, fromS, toS }  modes by frequency; db under the strongest
//   modalPartials(fit)             { f0Hz, partials: [[ratio, dB]], t60S: [..] }  the tone layer's shape: the fundamental first, a decay for each partial
//
// A tone layer's partial n decays in t60 x ratio^-0.75; the fit measures each mode's own decay (`t60S`, the time to fall 60 dB,
// 6.9078 x the amplitude time constant), so a clone can start from what a real sound does instead of the law.
import { fft } from './audio-measure.mjs';
import { cmat, complexEigvals, complexSolve, hermitianEig, realSolve } from './linalg.mjs';

const MODE_BANDS = [20, 60, 120, 200, 320, 500, 750, 1100, 1600, 2300, 3300, 4700, 6600, 9300, 13000, 21500];
const LN1000 = Math.log(1000);
const MAX_ANALYSIS_S = 1.0;
const BAND_GATE_DB = -50;            // a band holding less than this under the strongest is not searched
const RESIDUAL_GATE_DB = -40;        // ... nor in the second pass, on the residual
const PRUNE_DB = -50;                // a mode whose energy is this far under the sound's is dropped
const FUNDAMENTAL_DB = -24;          // the fundamental is the lowest mode within this of the strongest
const db10 = (x) => (x > 0 ? 10 * Math.log10(x) : -Infinity);

// ---------------------------------------------------------------------------------------------------------------------
// ESPRIT

/** The model order by the minimum description length on the singular values (capped by `kmax` and by the dynamic range). */
function orderOf(sv, M, kmax, dynDb) {
  const lam = Array.from(sv, (v) => v * v + 1e-300), p = lam.length;
  let strong = 0;
  for (const v of sv) if (v > sv[0] * 10 ** (-dynDb / 20)) strong++;
  const kcap = Math.min(kmax, p - 2, strong);
  if (kcap <= 0) return 0;
  let best = Infinity, kb = 0;
  for (let k = 0; k <= kcap; k++) {
    let logSum = 0, sum = 0;
    for (let i = k; i < p; i++) { logSum += Math.log(lam[i]); sum += lam[i]; }
    const g = logSum / (p - k), a = sum / (p - k);
    const mdl = -M * (p - k) * (g - Math.log(a)) + 0.5 * k * (2 * p - k) * Math.log(M);
    if (mdl < best) { best = mdl; kb = k; }
  }
  return kb;
}

/** The poles of the damped exponentials in the complex sequence (sr, si): { re, im } arrays, ESPRIT with the order from the MDL. */
function esprit(sr_, si_, kmax = 8, dynDb = 60) {
  const N = sr_.length;
  if (N < 12) return { re: [], im: [] };
  const L = Math.max(4, Math.floor(N / 3)), M = N - L + 1;
  const C = cmat(L);                                   // C = H H^H for the Hankel matrix H[a][j] = s[a + j]
  for (let a = 0; a < L; a++) for (let b = 0; b <= a; b++) {
    let re = 0, im = 0;
    for (let j = 0; j < M; j++) { const xr = sr_[a + j], xi = si_[a + j], yr = sr_[b + j], yi = si_[b + j]; re += xr * yr + xi * yi; im += xi * yr - xr * yi; }
    C.re[a * L + b] = re; C.im[a * L + b] = im; C.re[b * L + a] = re; C.im[b * L + a] = -im;
  }
  const { values, vectors } = hermitianEig(C);
  const sv = Float64Array.from(values, (v) => Math.sqrt(Math.max(v, 0)));
  const k = orderOf(sv, M, kmax, dynDb);
  if (k === 0) return { re: [], im: [] };
  // Us = the first k eigenvectors; Phi solves Us[:-1] Phi = Us[1:] in the least squares sense
  const U1 = cmat(L - 1, k), U2 = cmat(L - 1, k);
  for (let i = 0; i < L - 1; i++) for (let j = 0; j < k; j++) {
    U1.re[i * k + j] = vectors.re[i * L + j]; U1.im[i * k + j] = vectors.im[i * L + j];
    U2.re[i * k + j] = vectors.re[(i + 1) * L + j]; U2.im[i * k + j] = vectors.im[(i + 1) * L + j];
  }
  const A = cmat(k), B = cmat(k);
  for (let p = 0; p < k; p++) for (let q = 0; q < k; q++) {
    let ar = 0, ai = 0, br = 0, bi = 0;
    for (let i = 0; i < L - 1; i++) {
      const xr = U1.re[i * k + p], xi = -U1.im[i * k + p];       // conj(U1[i][p])
      ar += xr * U1.re[i * k + q] - xi * U1.im[i * k + q]; ai += xr * U1.im[i * k + q] + xi * U1.re[i * k + q];
      br += xr * U2.re[i * k + q] - xi * U2.im[i * k + q]; bi += xr * U2.im[i * k + q] + xi * U2.re[i * k + q];
    }
    A.re[p * k + q] = ar; A.im[p * k + q] = ai; B.re[p * k + q] = br; B.im[p * k + q] = bi;
  }
  let phi;
  try { phi = complexSolve(A, B); } catch { return { re: [], im: [] }; }
  const z = complexEigvals(phi);
  return { re: Array.from(z.re), im: Array.from(z.im) };
}

/** Inverse FFT of (re, im) in place, by the conjugate trick. */
function ifft(re, im) {
  for (let i = 0; i < im.length; i++) im[i] = -im[i];
  fft(re, im);
  const n = re.length;
  for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; }
}

/**
 * Candidate (frequency, time constant) pairs in each band from a real segment that starts just after the peak. The segment's
 * spectrum is cut to the band (soft edges), moved to zero frequency and decimated by taking those bins into a short inverse FFT;
 * ESPRIT runs on two windows of the result. Bands that hold under BAND_GATE_DB of the strongest are not searched.
 */
function bandCandidates(seg, sr, { kmax, nmax, gateDb, topEnergy }) {
  const Ns = seg.length;
  let N = 1;
  while (N < 2 * Ns) N <<= 1;
  const xr = new Float64Array(N), xi = new Float64Array(N);
  xr.set(seg);
  fft(xr, xi);
  const bins = (hz) => (hz * N) / sr;
  const out = [];
  const energies = [];
  for (let b = 0; b + 1 < MODE_BANDS.length; b++) {
    let e = 0;
    for (let k = Math.max(1, Math.ceil(bins(MODE_BANDS[b]))); k < Math.min(N / 2, Math.ceil(bins(MODE_BANDS[b + 1]))); k++) e += xr[k] * xr[k] + xi[k] * xi[k];
    energies.push(e);
  }
  const top = topEnergy ?? Math.max(...energies);
  for (let b = 0; b + 1 < MODE_BANDS.length; b++) {
    const lo = MODE_BANDS[b], hi = MODE_BANDS[b + 1];
    if (hi > sr * 0.49 || !(energies[b] > top * 10 ** (gateDb / 10))) continue;
    const B = hi - lo, tw = Math.max(0.15 * B, 8);
    const a0 = lo - 2 * tw, a1 = lo - tw, b1 = hi + tw, b0 = hi + 2 * tw, span = B + 4 * tw;
    let D = Math.max(1, Math.min(Math.floor(sr / (1.15 * span)), Math.floor(Ns / 48)));
    D = 2 ** Math.floor(Math.log2(D));
    const m = N / D;
    if (Ns / D < 16 || m < 16) continue;
    const fc = 0.5 * (lo + hi), kc = Math.round(bins(fc));
    const zr = new Float64Array(m), zi = new Float64Array(m);
    for (let kk = -m / 2; kk < m / 2; kk++) {
      const k = kc + kk;
      if (k < 1 || k >= N / 2) continue;
      const f = (k * sr) / N;
      let w = 0;
      if (f > a0 && f < a1) w = 0.5 - 0.5 * Math.cos((Math.PI * (f - a0)) / tw);
      else if (f >= a1 && f <= b1) w = 1;
      else if (f > b1 && f < b0) w = 0.5 + 0.5 * Math.cos((Math.PI * (f - b1)) / tw);
      if (w > 0) { const idx = (kk + m) % m; zr[idx] = xr[k] * w; zi[idx] = xi[k] * w; }
    }
    ifft(zr, zi);
    const n = Math.floor(Ns / D), fs = sr / D, f0 = (kc * sr) / N;
    const windows = [[0, Math.min(nmax, n)]];
    const o2 = Math.floor((nmax * 3) / 4);
    if (n > o2 + nmax / 2) {
      let e0 = 0, e1 = 0;
      for (let i = 0; i < Math.min(nmax, n); i++) e0 += zr[i] * zr[i] + zi[i] * zi[i];
      for (let i = o2; i < Math.min(o2 + nmax, n); i++) e1 += zr[i] * zr[i] + zi[i] * zi[i];
      if (e1 > 1e-4 * e0) windows.push([o2, Math.min(o2 + nmax, n)]);
    }
    for (const [s0, s1] of windows) {
      const poles = esprit(zr.subarray(s0, s1), zi.subarray(s0, s1), kmax);
      for (let q = 0; q < poles.re.length; q++) {
        const r = Math.hypot(poles.re[q], poles.im[q]);
        if (!(r < 0.99999 && r > 1e-6)) continue;
        const f = f0 + (Math.atan2(poles.im[q], poles.re[q]) * fs) / (2 * Math.PI), tau = -1 / (Math.log(r) * fs);
        if (f >= lo && f < hi && tau >= 3e-4 && Math.PI * f * tau >= 2 && tau < 30) out.push([f, tau]);
      }
    }
  }
  return { out, top };
}

/** Drops candidates that repeat an existing mode or an earlier candidate (the same frequency within a quarter of its bandwidth, a similar decay). */
function dedupe(cands, existing = []) {
  const keep = [...existing], fresh = [];
  for (const [fk, tk] of cands) {
    const dup = keep.some(([fe, te]) => Math.abs(fk - fe) < Math.max(0.3, 0.0015 * fk, 0.25 / (Math.PI * Math.sqrt(tk * te))) && Math.abs(Math.log(tk / te)) < 1.2);
    if (!dup) { keep.push([fk, tk]); fresh.push([fk, tk]); }
  }
  return fresh;
}

// ---------------------------------------------------------------------------------------------------------------------
// least squares: the signal is the sum over modes of alpha Re(z^n) + beta Im(z^n); c = alpha - i beta

const poleOf = (f, tau, sr) => { const r = Math.exp(-1 / (tau * sr)), th = (2 * Math.PI * f) / sr; return [r * Math.cos(th), r * Math.sin(th)]; };
/** sum_{n < L} w^n for a complex w. */
function geo(wr, wi, L) {
  const dr = 1 - wr, di = -wi;
  if (Math.hypot(dr, di) < 1e-12) return [L, 0];
  const lr = Math.log(Math.hypot(wr, wi)), th = Math.atan2(wi, wr), e = Math.exp(L * lr);
  const pr = e * Math.cos(L * th), pi = e * Math.sin(L * th);
  const nr = 1 - pr, ni = -pi, d = dr * dr + di * di;
  return [(nr * dr + ni * di) / d, (ni * dr - nr * di) / d];
}
const cmulp = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];

function gram(poles, L) {
  const K = poles.length, G = new Float64Array(4 * K * K), W = 2 * K;
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) {
    const S1 = geo(...cmulp(poles[i], poles[j]), L), S2 = geo(...cmulp(poles[i], [poles[j][0], -poles[j][1]]), L);
    G[i * W + j] = 0.5 * (S1[0] + S2[0]);                          // <u_i, u_j>
    G[i * W + K + j] = 0.5 * (S1[1] - S2[1]);                      // <u_i, v_j>
    G[(K + i) * W + j] = 0.5 * (S1[1] + S2[1]);                    // <v_i, u_j>
    G[(K + i) * W + K + j] = 0.5 * (S2[0] - S1[0]);                // <v_i, v_j>
  }
  return G;
}

function project(m, poles) {
  const K = poles.length, b = new Float64Array(2 * K);
  for (let k = 0; k < K; k++) {
    const [zr, zi] = poles[k];
    let pr = 1, pi = 0, su = 0, sv = 0;
    for (let n = 0; n < m.length; n++) {
      su += m[n] * pr; sv += m[n] * pi;
      const t = pr * zr - pi * zi; pi = pr * zi + pi * zr; pr = t;
      if (pr * pr + pi * pi < 1e-30 && n > 8) break;
    }
    b[k] = su; b[K + k] = sv;
  }
  return b;
}

/** The complex amplitudes c_k (signal = sum Re(c_k z_k^n)) by ridge-regularised least squares; the ridge grows while near-duplicates cancel. */
function lsModes(m, freqs, taus, sr) {
  const K = freqs.length;
  if (!K) return [];
  const poles = freqs.map((f, i) => poleOf(f, taus[i], sr)), W = 2 * K;
  const G = gram(poles, m.length), b = project(m, poles);
  const dg = Array.from({ length: W }, (_, i) => Math.max(G[i * W + i], 1e-30));
  let x = null, lam = 1e-5;
  for (let t = 0; t < 5; t++) {
    const Gr = Float64Array.from(G);
    for (let i = 0; i < W; i++) Gr[i * W + i] += lam * dg[i];
    try { x = realSolve(Gr, b, W); } catch { lam *= 10; continue; }
    let tot = 0, parts = 0;
    for (let i = 0; i < W; i++) for (let j = 0; j < W; j++) tot += x[i] * G[i * W + j] * x[j];
    for (let k = 0; k < K; k++) for (const [p, q] of [[k, k], [k, K + k], [K + k, k], [K + k, K + k]]) parts += x[p] * G[p * W + q] * x[q];
    if (!(tot > 0 && parts > 2 * tot)) break;                      // near-duplicates of one mode cancelling: the amplitudes are huge and opposite
    lam *= 10;
  }
  return Array.from({ length: K }, (_, k) => ({ re: x[k], im: -x[K + k] }));
}

const energyOf = (c, tau, sr) => 0.5 * (c.re * c.re + c.im * c.im) / (1 - Math.exp(-2 / (tau * sr)));

/** Indices to drop: in each cluster of modes whose bandwidths overlap, when their separate energies add up to more than twice the energy of their sum (they cancel), all but the one that alone explains most of the signal. */
function cancelling(m, freqs, taus, cs, sr, ratio = 2) {
  const order = freqs.map((_, i) => i).sort((a, b) => freqs[a] - freqs[b]), drop = [];
  const clusters = [];
  let cur = [];
  for (const i of order) {
    if (cur.length) {
      const j = cur.at(-1), bw = 0.5 * (1 / (Math.PI * taus[i]) + 1 / (Math.PI * taus[j]));
      if (freqs[i] - freqs[j] < Math.max(2, bw)) { cur.push(i); continue; }
      clusters.push(cur);
      cur = [];
    }
    cur.push(i);
  }
  if (cur.length) clusters.push(cur);
  for (const cl of clusters) {
    if (cl.length < 2) continue;
    const poles = cl.map((i) => poleOf(freqs[i], taus[i], sr)), G = gram(poles, m.length), K = cl.length, W = 2 * K;
    const x = [...cl.map((i) => cs[i].re), ...cl.map((i) => -cs[i].im)];
    let tot = 0, separate = 0;
    for (let a = 0; a < W; a++) for (let b = 0; b < W; b++) tot += x[a] * G[a * W + b] * x[b];
    for (const i of cl) separate += energyOf(cs[i], taus[i], sr);
    if (separate > ratio * Math.max(tot, 1e-30)) {
      const bproj = project(m, poles);
      let bestK = 0, bestE = -Infinity;
      for (let k = 0; k < K; k++) {
        const ix = [k, K + k], g = [[G[ix[0] * W + ix[0]], G[ix[0] * W + ix[1]]], [G[ix[1] * W + ix[0]], G[ix[1] * W + ix[1]]]];
        g[0][0] += 1e-12 * Math.max(g[0][0], 1e-30); g[1][1] += 1e-12 * Math.max(g[0][0], 1e-30);
        const s = realSolve(Float64Array.of(g[0][0], g[0][1], g[1][0], g[1][1]), Float64Array.of(bproj[ix[0]], bproj[ix[1]]), 2);
        const e = s[0] * bproj[ix[0]] + s[1] * bproj[ix[1]];
        if (e > bestE) { bestE = e; bestK = k; }
      }
      cl.forEach((i, k) => { if (k !== bestK) drop.push(i); });
    }
  }
  return drop;
}

/** The sum of the modes (c_k z_k^n) over `n` samples. */
function synth(n, freqs, taus, cs, sr) {
  const y = new Float64Array(n);
  freqs.forEach((f, k) => {
    const [zr, zi] = poleOf(f, taus[k], sr);
    let pr = cs[k].re, pi = cs[k].im;                  // c z^n
    for (let i = 0; i < n; i++) {
      y[i] += pr;
      const t = pr * zr - pi * zi; pi = pr * zi + pi * zr; pr = t;
      if (pr * pr + pi * pi < 1e-36) break;
    }
  });
  return y;
}

// ---------------------------------------------------------------------------------------------------------------------

/**
 * The modes of a tonal sound. The analysis starts 0.5 ms after the loudest 1 ms of the sound (the attack ramp is not a decay),
 * ends where the sound falls 80 dB under its peak, rises again by 6 dB (a second note) or after a second, and is the mono mix.
 * `opts`: kmax (modes per band and window, 8), nmax (decimated samples per window, 128), maxModes (24), passes (2), skipS (0.0005).
 */
export function fitModes(channels, sr, { kmax = 8, nmax = 128, maxModes = 24, passes = 2, skipS = 0.0005 } = {}) {
  const n = channels[0].length, x = new Float64Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) x[i] += c[i] / channels.length;
  const win = Math.max(1, Math.round(sr * 0.001)), nf = Math.floor(n / win);
  if (nf < 8) return { ok: false, modes: [], residualDb: 0, fromS: 0, toS: 0 };
  const env = Float64Array.from({ length: nf }, (_, f) => { let s = 0; for (let i = f * win; i < (f + 1) * win; i++) s += x[i] * x[i]; return db10(s / win + 1e-30); });
  let ip = 0;
  for (let i = 0; i < nf; i++) if (env[i] > env[ip]) ip = i;
  // the end: an 8 ms window every 2 ms (a low note's period is longer than 1 ms, so a 1 ms envelope ripples) from the peak on
  const w8 = Math.round(sr * 0.008), h2 = Math.round(sr * 0.002), cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + x[i] * x[i];
  const lvl = (s) => db10((cum[Math.min(n, s + w8)] - cum[s]) / w8 + 1e-30);
  const top = lvl(Math.min(ip * win, n - w8)), last = Math.min(n - w8, ip * win + Math.round(MAX_ANALYSIS_S * sr));
  let end = last + w8, runMin = Infinity;
  for (let s = ip * win + h2; s <= last; s += h2) {
    const l = lvl(s);
    runMin = Math.min(runMin, l);
    if (l < top - 80) { end = s + w8; break; }
    if (l > runMin + 6 && l > top - 40) { end = s - h2; break; }                   // a second note
  }
  const from = ip * win + Math.round(skipS * sr), to = Math.min(n, end);
  if (to - from < 400) return { ok: false, modes: [], residualDb: 0, fromS: from / sr, toS: to / sr };
  const seg = x.subarray(from, to);
  let segE = 0;
  for (const v of seg) segE += v * v;

  let freqs = [], taus = [], cs = [];
  const refit = (extraF, extraT, target) => {
    const f = [...freqs, ...extraF], t = [...taus, ...extraT];
    let c = lsModes(target, f, t, sr);
    const E = f.map((_, i) => energyOf(c[i], t[i], sr)), top = Math.max(...E, 0);       // weak modes: under PRUNE_DB of the strongest mode's energy
    const live = f.map((_, i) => i).filter((i) => E[i] >= top * 10 ** (PRUNE_DB / 10)).sort((a, b) => E[b] - E[a]).slice(0, maxModes);
    freqs = live.map((i) => f[i]); taus = live.map((i) => t[i]);
    c = lsModes(target, freqs, taus, sr);
    for (let round = 0; round < 3; round++) {
      const drop = cancelling(target, freqs, taus, c, sr);
      if (!drop.length) break;
      freqs = freqs.filter((_, i) => !drop.includes(i)); taus = taus.filter((_, i) => !drop.includes(i));
      c = lsModes(target, freqs, taus, sr);
    }
    cs = c;
  };
  let topEnergy = null;
  for (let p = 0; p < passes; p++) {
    let work = seg;
    if (p > 0) {
      const y = synth(seg.length, freqs, taus, cs, sr);
      work = Float64Array.from(seg, (v, i) => v - y[i]);
    }
    const found = bandCandidates(work, sr, { kmax, nmax, gateDb: p === 0 ? BAND_GATE_DB : RESIDUAL_GATE_DB, topEnergy });
    if (p === 0) topEnergy = found.top;                   // the strongest band of the whole sound anchors the gate of the later passes
    const cands = found.out;
    const fresh = dedupe(cands, freqs.map((f, i) => [f, taus[i]]));
    if (!fresh.length && p > 0) break;
    if (!fresh.length && !freqs.length) break;
    refit(fresh.map((q) => q[0]), fresh.map((q) => q[1]), seg);
    if (!freqs.length) break;
  }
  if (!freqs.length) return { ok: false, modes: [], residualDb: 0, fromS: from / sr, toS: to / sr };
  const fit = synth(seg.length, freqs, taus, cs, sr);
  let resE = 0;
  for (let i = 0; i < seg.length; i++) resE += (seg[i] - fit[i]) ** 2;
  const skip = Math.round(skipS * sr) / sr;
  const rows = freqs.map((f, k) => ({ f, tauS: taus[k], amp: Math.hypot(cs[k].re, cs[k].im) * Math.exp(skip / taus[k]), phase: Math.atan2(cs[k].im, cs[k].re) - 2 * Math.PI * f * skip }));
  const loud = Math.max(...rows.map((r) => r.amp));
  const modes = rows.map((r) => ({ f: r.f, tauS: r.tauS, t60S: (r.tauS * LN1000), amp: r.amp, phase: r.phase, db: 20 * Math.log10(r.amp / loud) })).sort((a, b) => a.f - b.f);
  return { ok: true, modes, residualDb: db10(resE / segE + 1e-30), fromS: from / sr, toS: to / sr };
}

/**
 * The fit in a tone layer's shape: the fundamental (the lowest mode within 24 dB of the strongest) first at ratio 1 and 0 dB, the
 * other modes above it as [ratio, dB under the fundamental], and each partial's own T60. Modes below the fundamental are left out.
 */
export function modalPartials(fit) {
  if (!fit?.ok || !fit.modes.length) return null;
  const f0 = fit.modes.find((m) => m.db >= FUNDAMENTAL_DB);
  if (!f0) return null;
  const up = fit.modes.filter((m) => m.f >= f0.f);
  const r3 = (x) => Math.round(x * 1000) / 1000;
  return { f0Hz: Math.round(f0.f * 100) / 100, partials: up.map((m) => [m === f0 ? 1 : r3(m.f / f0.f), Math.round((m.db - f0.db) * 10) / 10]), t60S: up.map((m) => r3(m.t60S)) };
}
