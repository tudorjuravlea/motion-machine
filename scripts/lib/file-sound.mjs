// What the file check reads from a finished file's sound (scripts/lib/export-qa.mjs): the sound set against the
// mix it was made from, the mono fold, the last moments, the share of the length that is quiet, the phone-speaker gap.
// Pure maths on samples, plus two ffmpeg readers.
import { spawnSync } from 'node:child_process';
import { bin } from './ffmpeg.mjs';

export const SYNC_RATE = 12000;     // samples a second the sound is compared at
export const SYNC_MAX_S = 1;        // the widest shift looked for
const ENVELOPE_S = 0.002;           // the coarse pass reads energy in windows this long
const WINDOW_S = 0.05;              // a window of the deficit and of the quiet share
const DEFICIT_FLOOR_DB = -45;       // a mix window quieter than this holds no sound to lose
const SILENT_DB = -120;

const db = (power) => (power > 0 ? 10 * Math.log10(power) : SILENT_DB);
const powerOf = (x, from, to) => { let e = 0; for (let i = from; i < to; i++) e += x[i] * x[i]; return e / Math.max(1, to - from); };

/** The two channels of `file`'s first audio stream at `rate`: { L, R, n }; `wav` names the format of a file MM wrote. */
export function decodePcm(file, rate = SYNC_RATE) {
  const r = spawnSync(bin('ffmpeg'), ['-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-vn', '-ac', '2', '-ar', String(rate), '-f', 'f32le', '-'], { maxBuffer: 2 ** 31 - 1 });
  if (r.status !== 0) throw new Error(`ffmpeg could not read the sound of ${file}: ${String(r.stderr).trim().split('\n').pop()}`);
  const whole = new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length - (r.stdout.length % 4)));
  const n = whole.length / 2, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = whole[2 * i]; R[i] = whole[2 * i + 1]; }
  return { L, R, n };
}

/** The sum of a[i] × b[i + lag] over the samples both hold, every `step`th sample. */
function product(a, b, lag, step = 1) {
  const n = Math.min(a.length, b.length), from = Math.max(0, -lag), to = Math.min(n, n - lag);
  let s = 0;
  for (let i = from; i < to; i += step) s += a[i] * b[i + lag];
  return s;
}

/** The energy of `x` in consecutive windows of `w` samples. */
function envelope(x, w) {
  const out = new Float32Array(Math.floor(x.length / w));
  for (let k = 0; k < out.length; k++) { let e = 0; for (let i = k * w; i < (k + 1) * w; i++) e += x[i] * x[i]; out[k] = e; }
  return out;
}

/** How many samples `b` runs late against `a` (negative: early): energy first, over the widest shift, then sample by sample around it. */
export function alignLag(a, b, rate = SYNC_RATE, maxS = SYNC_MAX_S) {
  const w = Math.max(1, Math.round(ENVELOPE_S * rate)), ea = envelope(a, w), eb = envelope(b, w), span = Math.round(maxS * rate / w);
  let coarse = 0, best = -Infinity;
  for (let l = -span; l <= span; l++) { const s = product(ea, eb, l); if (s > best) { best = s; coarse = l; } }
  let fine = coarse * w;
  best = -Infinity;
  for (let l = coarse * w - 2 * w; l <= coarse * w + 2 * w; l++) { const s = product(a, b, l); if (s > best) { best = s; fine = l; } }
  return fine;
}

/**
 * The sound `got` against the mix `want`, both one channel at `rate`:
 * { lagMs, r, deficitDb, at }: how late it runs, how alike the two are once aligned (1 the same, near 0 another sound),
 * and the most any window where the mix has sound falls short, with where.
 */
export function syncReading(want, got, rate = SYNC_RATE) {
  const lag = alignLag(want, got, rate);
  const n = Math.min(want.length, got.length);
  const ea = powerOf(want, 0, n), eb = powerOf(got, 0, n);
  const r = ea > 0 && eb > 0 ? product(want, got, lag) / (n * Math.sqrt(ea * eb)) : 0;
  const w = Math.round(WINDOW_S * rate);
  let deficitDb = 0, at = 0;
  for (let i = Math.max(0, -lag); i + w <= n && i + lag + w <= got.length; i += w) {
    const have = db(powerOf(want, i, i + w));
    if (have < DEFICIT_FLOOR_DB) continue;
    const short = have - db(powerOf(got, i + lag, i + lag + w));
    if (short > deficitDb) { deficitDb = short; at = i / rate; }
  }
  return { lagMs: Math.round((lag / rate) * 1e5) / 100, r: Math.round(r * 1e4) / 1e4, deficitDb: Math.round(deficitDb * 10) / 10, at: Math.round(at * 100) / 100 };
}

/** What folding the two channels to one loses, in dB: 0 for one sound in both, very large for opposite channels. */
export function monoLossDb(L, R) {
  const n = Math.min(L.length, R.length);
  let both = 0, sum = 0;
  for (let i = 0; i < n; i++) { both += (L[i] * L[i] + R[i] * R[i]) / 2; const m = (L[i] + R[i]) / 2; sum += m * m; }
  if (!both) return 0;
  return Math.round((db(both / n) - db(sum / n)) * 10) / 10;
}

/** The peak of the last `ms` of the sound, in dBFS. */
export function tailDb(L, R, rate, ms = 50) {
  const n = Math.min(L.length, R.length);
  let p = 0;
  for (let i = Math.max(0, n - Math.round((ms / 1000) * rate)); i < n; i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i]));
  return p > 0 ? 20 * Math.log10(p) : SILENT_DB;
}

/** The share of the length, in 50 ms windows, under `underDb`. Integrated loudness gates quiet out, so it cannot say this. */
export function quietShare(L, R, rate, underDb = -50) {
  const n = Math.min(L.length, R.length), w = Math.round(WINDOW_S * rate);
  let quiet = 0, all = 0;
  for (let i = 0; i + w <= n; i += w) { all++; if (db((powerOf(L, i, i + w) + powerOf(R, i, i + w)) / 2) < underDb) quiet++; }
  return all ? quiet / all : 0;
}

/** Integrated loudness of `file` with `af` before the meter, or null. */
function loudnessThrough(file, af) {
  const r = spawnSync(bin('ffmpeg'), ['-hide_banner', '-nostdin', '-nostats', '-i', file, '-vn', '-af', `${af}ebur128=framelog=quiet`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 2 ** 28 });
  const text = String(r.stderr), m = /I:\s+(-?[\d.]+)\s+LUFS/.exec(text.slice(text.lastIndexOf('Summary:')));
  return m ? Number(m[1]) : null;
}

/** How much quieter the film is on a phone speaker, which plays little under 300 Hz, in LU; null when it cannot be read. */
export function phoneGapLu(file) {
  const whole = loudnessThrough(file, ''), high = loudnessThrough(file, 'highpass=f=300:poles=2,highpass=f=300:poles=2,');
  return whole == null || high == null ? null : Math.round((whole - high) * 10) / 10;
}
