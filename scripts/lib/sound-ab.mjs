// The blind A/B of `mm sound-listen --ab <a> <b>` (SPEC §9), library. Two sounds (an audio file, or the name of a cue
// under patterns/sound/) are made fair to compare, then written beside a page that plays them in random order and
// keeps what the listener says.
//
//   1. trimmed the same way: each clip starts 4 ms (a raised-cosine fade-in) before its first 1 ms frame at a common
//      onset level and ends where its decay last stands at a common end level, with a matched fade-out over the last
//      6 dB of the decay, so neither carries a floor or a tail the other lacks;
//   2. matched in level: the second sound to the first on the K-weighted loudest 100 ms (a pair of sounds under 1 s) or
//      400 ms (one of 1 s or more), then both by one common gain to -15 / -16 LUFS, lowered together if a true peak
//      (4x oversampled) would pass -1 dBTP;
//   3. checked as played (24-bit): the pair is refused, with the reason, when the loudest moments differ by more than
//      0.5 LU, a clip has more than 5 ms of pre-roll, a sound sits less than 6 dB above its own floor (a steady tone
//      has no decay to trim at), the true peak passes -1 dBTP, or the trimmed edges differ by more than 10 dB with
//      the louder above -20 dB;
//   4. the sides are randomised with A holding the first sound on exactly half of the trials (seeded).
//
// The trim, the matching and the limits restate Earshot's blind-test builder (MIT, Copyright (c) 2026 Leon Lin;
// eval/forge/blind_v2.py), rewritten for stereo Float32Arrays at 48 kHz; the floor of a sound is measured from the
// sound itself (a recording's source file is not at hand). The page and the storage are our own.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { ROOT } from './browser.mjs';
import { kWeighted } from './audio-measure.mjs';
import { decodeStereo } from './audio-decode.mjs';
import { loadProfile, loadRecipe } from './sound-profile.mjs';
import { renderRecipe } from '../../runtime/kit/synth.js';

export const SR = 48000;
export const TP_MAX = -1;
export const TARGET_LUFS = { short: -15, long: -16 };
export const WINDOW_S = { short: 0.1, long: 0.4 };
export const LONG_S = 1;                         // a pair with a sound this long is matched on 400 ms
export const LIMITS = { loudLu: 0.5, prerollMs: 5, floorMarginDb: 6, edgeDiffDb: 10, edgeLoudDb: -20 };
export const VERDICT_TAGS = ['ok', 'loud', 'masked', 'harsh', 'extra', 'missing'];

const ON_DB = -50, END_DB = -50, REACH_MARGIN = 3, FLOOR_MARGIN = 10, LEVEL_CAP = -6, FADE_IN_S = 0.004, FADE_DB = 6, FADE_MIN_S = 0.005, FADE_GUARD_S = 0.01;
const ENV = { short: [0.0025, 3], long: [0.005, 6] };            // envelope hop (s), smoothing (frames)
const FLOOR_WIN_S = { short: 0.01, long: 0.05 };
const SILENT = 1e-6;                                             // under -120 dBFS the sound is silent
const r1 = (x) => Math.round(x * 10) / 10;
const r3 = (x) => Math.round(x * 1000) / 1000;
const db10 = (x) => 10 * Math.log10(x + 1e-20);

/** A pair that cannot be compared fairly: nothing is written. `reasons` say why. */
export class AbRefused extends Error {
  constructor(reasons) { super(`the pair is refused: ${reasons.join('; ')}`); this.name = 'AbRefused'; this.reasons = reasons; this.exitCode = 1; }
}

// ---- trials -------------------------------------------------------------------------------------------------

function rng(seed) {                                             // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Which side holds the first sound on each trial: A on exactly half (one more or less of A when the count is odd, by the seed). */
export function abArrangement(trials, seed = 1) {
  if (!Number.isInteger(trials) || trials < 1) throw new RangeError('trials is a whole number above 0');
  const r = rng(seed);
  const nA = Math.floor(trials / 2) + (trials % 2 && r() < 0.5 ? 1 : 0);
  const sides = [...Array(nA).fill('A'), ...Array(trials - nA).fill('B')];
  for (let i = sides.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [sides[i], sides[j]] = [sides[j], sides[i]]; }
  return sides;
}

/** The chance of at least `k` right out of `n` by guessing at 0.5 (one-sided binomial). 15 of 20 is 0.021. */
export function pValue(k, n) {
  if (n <= 0 || k <= 0) return 1;
  let c = 1, sum = 0;                                            // C(n, i) built up from i = 0
  for (let i = 0; i <= n; i++) { if (i >= k) sum += c; c = (c * (n - i)) / (i + 1); }
  return sum / 2 ** n;
}

// ---- measuring ----------------------------------------------------------------------------------------------

/** LUFS (K-weighted, channel-summed mean square) of the loudest `winS` window at every sample position; a sound shorter than the window counts over the whole window. */
export function loudestWindow(channels, sr, winS) {
  const pad = Math.round(0.05 * sr), n = channels[0].length + 2 * pad;
  const padded = channels.map((c) => { const o = new Float32Array(n); o.set(c, pad); return o; });
  const w = Math.max(1, Math.round(winS * sr)), len = Math.max(n, w);
  const cum = new Float64Array(len + 1);
  const k = kWeighted(padded, sr);
  for (let i = 0; i < len; i++) { let p = 0; if (i < n) for (const c of k) p += c[i] * c[i]; cum[i + 1] = cum[i] + p; }
  let best = 0;
  for (let s = 0; s + w <= len; s++) { const m = (cum[s + w] - cum[s]) / w; if (m > best) best = m; }
  return -0.691 + db10(best);
}

const TP_L = 12;                                                 // half-length of the interpolation filter, in samples
/** True peak in dBTP: the highest of the samples and of three points between each pair, by a Hann-windowed sinc (4x oversampling). */
export function truePeakDb(channels) {
  let peak = 0;
  const phases = [1, 2, 3].map((p) => {
    const f = p / 4, h = new Float64Array(2 * TP_L);
    for (let k = -TP_L + 1; k <= TP_L; k++) { const u = k - f, s = u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u); h[k + TP_L - 1] = s * 0.5 * (1 + Math.cos((Math.PI * u) / TP_L)); }
    return h;
  });
  for (const c of channels) {
    const n = c.length;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(c[i]);
      if (a > peak) peak = a;
    }
    for (let i = 0; i < n; i++) {
      for (const h of phases) {
        let y = 0;
        for (let k = -TP_L + 1; k <= TP_L; k++) { const j = i + k; if (j >= 0 && j < n) y += c[j] * h[k + TP_L - 1]; }
        if (Math.abs(y) > peak) peak = Math.abs(y);
      }
    }
  }
  return 20 * Math.log10(peak + 1e-12);
}

/** Channel-summed mean power per `n`-sample frame (the last partial frame zero-padded), optionally smoothed by a centred moving average. */
function powerFrames(ch, n, smooth = 1) {
  const len = ch[0].length, k = Math.ceil(len / n), p = new Float64Array(k);
  for (const c of ch) for (let i = 0; i < len; i++) p[(i / n) | 0] += c[i] * c[i];
  for (let j = 0; j < k; j++) p[j] /= n;
  if (smooth <= 1 || k <= 1) return p;
  const off = Math.floor((smooth - 1) / 2), out = new Float64Array(k);
  for (let j = 0; j < k; j++) { let s = 0; for (let i = j + off - (smooth - 1); i <= j + off; i++) if (i >= 0 && i < k) s += p[i]; out[j] = s / smooth; }
  return out;
}
const maxOf = (a) => a.reduce((m, v) => (v > m ? v : m), -Infinity);
const toDb = (p) => Float64Array.from(p, db10);

/** Seconds from the first 1 ms frame within 40 dB of the loudest to the end of the last 5 ms frame within 50 dB: how long the sound is audible. */
export function extentS(ch, sr = SR) {
  const a = toDb(powerFrames(ch, Math.round(sr / 1000))), b = toDb(powerFrames(ch, Math.round(sr * 0.005)));
  const ta = maxOf(a), tb = maxOf(b);
  const first = a.findIndex((v) => v >= ta - 40), last = b.findLastIndex((v) => v >= tb - 50);
  return Math.max(0, ((last + 1) * Math.round(sr * 0.005) - first * Math.round(sr / 1000)) / sr);
}

/** The facts a trim needs, levels in dB re the loudest envelope frame. */
function analyse(ch, cls, sr) {
  const [hop, sm] = ENV[cls], n = Math.round(hop * sr);
  const p = powerFrames(ch, n, sm), top = db10(maxOf(p));
  const e = toDb(p).map((v) => v - top);
  const e1 = toDb(powerFrames(ch, Math.round(sr / 1000))).map((v) => v - top);
  const ip = e.indexOf(maxOf(e));
  const guard = Math.ceil(((FADE_GUARD_S + 0.005) * sr) / n);
  const stop = Math.max(ip + 1, e.length - guard), last = Math.ceil((0.015 * sr) / n);
  const reach = Math.min(...e.slice(Math.max(ip, stop - last), stop));
  const w = powerFrames(ch, Math.round(FLOOR_WIN_S[cls] * sr)).filter((v) => v > 2e-10);
  const sorted = [...w].sort((x, y) => x - y);
  const floor = sorted.length ? db10(sorted[Math.floor(0.05 * (sorted.length - 1))]) - top : null;
  return { e, e1, n, top, ip, stop, reach, floor, peakLate: ip * n >= 0.85 * ch[0].length };
}

const raised = (n) => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / Math.max(1, n)));

/** One clip: the fade-in up to the onset, to where the envelope last stands at `lEnd`, the fade-out over the last 6 dB of the decay. */
function cut(ch, info, lOn, lEnd, keepEnd, sr) {
  const { e, e1, n } = info, k1 = Math.round(sr / 1000), len = ch[0].length;
  const hit = e1.findIndex((v) => v >= lOn);
  const on = hit >= 0 ? hit * k1 : 0, fi = Math.round(FADE_IN_S * sr), start = on - fi;
  let j = -1;
  for (let i = 0; i < info.stop; i++) if (e[i] >= lEnd) j = i;
  if (j < 0) j = info.ip;
  let end = Math.min(len, (j + 1) * n), hi = -1;
  for (let i = 0; i <= j; i++) if (e[i] >= lEnd + FADE_DB) hi = i;
  let f0 = hi >= 0 ? (hi + 1) * n : (info.ip + 1) * n;
  f0 = Math.max(on, Math.min(f0, end - Math.round(FADE_MIN_S * sr)));
  const kept = keepEnd && e[info.stop - 1] >= lEnd;
  if (kept) { end = len; j = e.length - 1; f0 = end - Math.round(0.002 * sr); }
  const s0 = Math.max(0, start), lead = start < 0 ? -start : 0;
  const out = ch.map((c) => { const y = new Float64Array(lead + end - s0); for (let i = s0; i < end; i++) y[lead + i - s0] = c[i]; return y; });
  const ramp = raised(fi), nf = Math.min(end - f0, out[0].length), down = raised(nf);
  for (const y of out) {
    for (let i = 0; i < fi && i < y.length; i++) y[i] *= ramp[i];
    for (let i = 0; i < nf; i++) y[y.length - nf + i] *= down[nf - 1 - i];
  }
  const pre = e1.slice(Math.floor(s0 / k1), Math.floor(Math.max(0, start + fi / 2) / k1));
  const m = Math.ceil((0.005 * sr) / n);
  const after = j + 1 < e.length ? maxOf(e.slice(j + 1, j + 1 + m)) : e.at(-1);
  return { out, facts: { onsetS: on / sr, startS: start / sr, cutInDb: pre.length ? maxOf(pre) : -200, cutOutDb: after, fadeOutMs: (nf / sr) * 1000 } };
}

const quantise24 = (ch) => ch.map((c) => Float64Array.from(c, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 8388607) / 8388607));
const f32 = (ch) => ch.map((c) => Float32Array.from(c));

/** Whether a pair, measured as played, may be compared; `reasons` say what fails. */
export function judgePair(f) {
  const reasons = [];
  if (Math.abs(f.loudDiffLu) > LIMITS.loudLu + 1e-9) reasons.push(`the loudest moments differ by ${Math.abs(f.loudDiffLu).toFixed(2)} LU, at most ${LIMITS.loudLu} LU`);
  if (f.truePeakDbtp > TP_MAX + 0.05) reasons.push(`true peak ${f.truePeakDbtp.toFixed(2)} dBTP is over ${TP_MAX} dBTP`);
  if (f.prerollMs > LIMITS.prerollMs + 1e-9) reasons.push(`pre-roll ${f.prerollMs.toFixed(1)} ms, at most ${LIMITS.prerollMs} ms`);
  if (f.floorMarginDb < LIMITS.floorMarginDb) reasons.push(`a sound sits only ${f.floorMarginDb.toFixed(1)} dB above its own floor (floor margin), at least ${LIMITS.floorMarginDb} dB: it has no decay to trim at, so its ends would give it away`);
  if (f.trimEdgeDiffDb > LIMITS.edgeDiffDb && f.trimEdgeLoudDb > LIMITS.edgeLoudDb) reasons.push(`the trimmed edges differ by ${f.trimEdgeDiffDb.toFixed(1)} dB with the louder at ${f.trimEdgeLoudDb.toFixed(1)} dB: one is cut into its sound`);
  return { ok: reasons.length === 0, reasons };
}

/**
 * Trims and matches two sounds. Returns { clips: [stereo, stereo] (24-bit exact), cls, window, gains, facts } and
 * the verdict of judgePair on the facts; a silent sound is refused before anything is measured.
 */
export function preparePair(sa, sb) {
  const sr = SR;
  for (const [i, s] of [sa, sb].entries()) if (!s.channels[0].length || maxOf(s.channels.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0))) < SILENT) return { ok: false, reasons: [`${s.label} (sound ${i + 1}) is silent`] };
  const x = [sa, sb].map((s) => s.channels.map((c) => Float64Array.from(c)));
  const cls = Math.max(extentS(x[0], sr), extentS(x[1], sr)) >= LONG_S ? 'long' : 'short';
  const info = x.map((c) => analyse(c, cls, sr));
  const floors = info.filter((i) => i.floor != null).map((i) => i.floor);
  const lEnd = Math.min(LEVEL_CAP, Math.max(END_DB, ...info.map((i) => i.reach + REACH_MARGIN), ...floors.map((f) => f + FLOOR_MARGIN)));
  const lOn = Math.min(LEVEL_CAP, Math.max(ON_DB, ...floors.map((f) => f + FLOOR_MARGIN)));
  const keep = info[0].peakLate && info[1].peakLate;
  const cuts = x.map((c, i) => cut(c, info[i], lOn, lEnd, keep, sr));
  const win = WINDOW_S[cls];
  const L = cuts.map((c) => loudestWindow(f32(c.out), sr, win));
  const tp = cuts.map((c) => truePeakDb(f32(c.out)));
  const g = L[0] - L[1], gc = TARGET_LUFS[cls] - L[0];
  const over = Math.max(0, Math.max(tp[0], tp[1] + g) + gc - TP_MAX);
  const gains = [gc - over, g + gc - over];
  const clips = cuts.map((c, i) => quantise24(c.out.map((y) => Float64Array.from(y, (v) => v * 10 ** (gains[i] / 20)))));
  const played = clips.map((c) => f32(c));
  const Lp = played.map((c) => loudestWindow(c, sr, win)), tpp = played.map((c) => truePeakDb(c));
  const preN = Math.round(FADE_IN_S * sr);
  const prerollMs = Math.max(...cuts.map((c) => (c.facts.onsetS - c.facts.startS) * 1000));
  const marginDb = floors.length ? Math.min(lEnd, lOn) - Math.max(...floors) : 99;
  const edges = [['cutInDb'], ['cutOutDb']].map(([k]) => ({ diff: Math.abs(cuts[0].facts[k] - cuts[1].facts[k]), loud: Math.max(cuts[0].facts[k], cuts[1].facts[k]) }));
  const edge = edges.filter((e) => e.loud > LIMITS.edgeLoudDb).sort((a, b) => b.diff - a.diff)[0] ?? edges.sort((a, b) => b.diff - a.diff)[0];
  const facts = {
    loudDiffLu: r3(Lp[0] - Lp[1]), loudestLufs: [r3(Lp[0]), r3(Lp[1])], truePeakDbtp: r3(Math.max(...tpp)), prerollMs: r1(prerollMs),
    floorMarginDb: r1(marginDb), trimEdgeDiffDb: r1(edge.diff), trimEdgeLoudDb: r1(edge.loud), lengthS: played.map((c) => r3(c[0].length / sr)),
    onsetLevelDb: r1(lOn), endLevelDb: r1(lEnd), prerollLevelDbfs: played.map((c) => r1(db10(c[0].slice(0, preN).reduce((s, v) => s + v * v, 0) / preN))),
  };
  return { ...judgePair(facts), clips: played, cls, window: `${Math.round(win * 1000)} ms`, gains: { s1Db: r3(gains[0]), s2Db: r3(gains[1]), peakLoweredDb: r3(over) }, facts };
}

// ---- inputs and outputs -------------------------------------------------------------------------------------

const AUDIO_EXT = new Set(['.wav', '.mp3', '.m4a', '.flac', '.ogg', '.aac', '.mp4', '.mov']);

/** A sound by spec: an audio file, or the name of a cue under patterns/sound/ (a recipe, or a code cue drawn in the page). */
export async function loadSound(spec, { profile = 'soft-ui', patterns = join(ROOT, 'patterns'), renderer = null } = {}) {   // renderer: () => Promise<openRenderer()>, opened only for a code cue
  const asFile = resolve(spec);
  if (existsSync(asFile) && !/^[a-z][a-z0-9-]*$/.test(spec)) return { label: basename(spec, extname(spec)), channels: await decodeStereo(asFile, SR) };
  if (AUDIO_EXT.has(extname(spec).toLowerCase()) || spec.includes('/') || spec.includes('\\')) throw Object.assign(new Error(`no such sound file: ${spec}`), { exitCode: 2 });
  const dir = join(patterns, 'sound', spec);
  if (existsSync(join(dir, 'recipe.json'))) {
    const { channels } = renderRecipe(loadRecipe(join(dir, 'recipe.json')), { sampleRate: SR, emphasis: 'normal', profile: loadProfile(profile) });
    return { label: spec, channels };
  }
  if (existsSync(join(dir, 'pattern.js')) && renderer) {
    const r = await (await renderer()).renderChannels([{ cue: spec, at: 0.05, feel: 'soft-ui', opts: {} }], { seconds: 2.2, sampleRate: SR });
    return { label: spec, channels: r.channels };
  }
  if (existsSync(asFile)) return { label: spec, channels: await decodeStereo(asFile, SR) };
  throw Object.assign(new Error(`no sound file or cue named "${spec}" (cues are the folders of patterns/sound/)`), { exitCode: 2 });
}

/** A 24-bit stereo WAV. */
export function wav24(channels, sr = SR) {
  const n = channels[0].length, ch = channels.length, buf = Buffer.alloc(44 + n * ch * 3);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 3, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * ch * 3, 28); buf.writeUInt16LE(ch * 3, 32); buf.writeUInt16LE(24, 34); buf.write('data', 36); buf.writeUInt32LE(n * ch * 3, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { buf.writeIntLE(Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 8388607), o, 3); o += 3; }
  return buf;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Builds the pair into `out`: s1.wav, s2.wav, ab.html and ab-facts.json. Throws AbRefused (and writes nothing) for a pair
 * that cannot be compared fairly. Returns { ok: true, out, page, labels, window, gains, facts, trials, id }.
 */
export async function buildAb({ a, b, out, trials = 20, seed = 1, profile = 'soft-ui', renderer = null }) {
  const sides = abArrangement(trials, seed);
  const [sa, sb] = [await loadSound(a, { profile, renderer }), await loadSound(b, { profile, renderer })];
  const pair = preparePair(sa, sb);
  if (!pair.ok) throw new AbRefused(pair.reasons);
  out = resolve(out);
  mkdirSync(out, { recursive: true });
  const bytes = pair.clips.map((c) => wav24(c));
  bytes.forEach((w, i) => writeFileSync(join(out, `s${i + 1}.wav`), w));
  const id = createHash('sha1').update(bytes[0]).update(bytes[1]).update(`${seed}:${trials}`).digest('hex').slice(0, 10);
  const data = { id, labels: { a: sa.label, b: sb.label }, files: ['s1.wav', 's2.wav'], sound1At: sides, tags: VERDICT_TAGS, matched: pair.window };
  writeFileSync(join(out, 'ab.html'), pageOf(data));
  writeFileSync(join(out, 'ab-facts.json'), `${JSON.stringify({ labels: data.labels, seed, trials, window: pair.window, gains: pair.gains, facts: pair.facts }, null, 2)}\n`);
  return { ok: true, out, page: join(out, 'ab.html'), labels: data.labels, window: pair.window, gains: pair.gains, facts: pair.facts, trials, id, reasons: [] };
}

const CSS = `:root{color-scheme:light dark;--bg:#fafaf8;--ink:#1b1b1a;--mu:#666;--ln:#d9d9d4;--ok:#1d6f42;--sf:#fff;--ac:#1b1b1a;--ai:#fafaf8}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--ink:#ecece8;--mu:#999;--ln:#33332f;--ok:#58b583;--sf:#1e1e1c;--ac:#ecece8;--ai:#161615}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px 64px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}
p.lead{color:var(--mu);margin:0 0 16px;max-width:62ch}section{background:var(--sf);border:1px solid var(--ln);border-radius:8px;padding:14px 16px;margin:0 0 16px}
.row{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}button{font:inherit;padding:8px 14px;border:1px solid var(--ln);border-radius:6px;background:var(--sf);color:var(--ink);cursor:pointer}
button:hover{border-color:var(--ink)}button[aria-pressed="true"]{background:var(--ac);color:var(--ai);border-color:var(--ac)}button:disabled{opacity:.45;cursor:default}
.mu{color:var(--mu);font-size:13px}#results b{font-weight:600}`;

/** The page: no network, its trials in a JSON block, its verdicts in localStorage. */
export function pageOf(data) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blind A/B</title><style>${CSS}</style></head>
<body><main>
<h1>Blind A/B</h1>
<p class="lead">Two sounds, matched on their loudest ${esc(data.matched)} and trimmed the same way. First hear them named. Then, on each trial, play A and B and pick the one that is <b>sound 1</b>. Add what bothers you if something does. Verdicts stay in this browser; export them when you are done.</p>
<section id="train"><h2>Hear them named</h2>
<div class="row"><button type="button" data-train="0">Sound 1: ${esc(data.labels.a)}</button><button type="button" data-train="1">Sound 2: ${esc(data.labels.b)}</button></div></section>
<section id="trial"><h2 id="count"></h2>
<div class="row"><button type="button" data-play="A">Play A</button><button type="button" data-play="B">Play B</button></div>
<p class="mu">Which one is sound 1 (${esc(data.labels.a)})?</p>
<div class="row"><button type="button" data-pick="A" aria-pressed="false">A is sound 1</button><button type="button" data-pick="B" aria-pressed="false">B is sound 1</button></div>
<p class="mu">What bothers you, if anything?</p>
<div class="row" id="tags">${data.tags.map((t) => `<button type="button" data-tag="${t}" aria-pressed="false">${t}</button>`).join('')}</div>
<div class="row"><button type="button" data-next disabled>Next</button></div></section>
<section id="done" hidden><h2>All trials answered</h2><p class="mu">The score is below. Export the verdicts to keep them.</p></section>
<section><h2>Results</h2><div id="results"></div><div class="row"><button type="button" id="export">Export verdicts.json</button></div></section>
</main>
<script type="application/json" id="ab-data">${JSON.stringify(data)}</script>
<script>
(function () {
  var D = JSON.parse(document.getElementById('ab-data').textContent), KEY = 'mm-ab:' + D.id, N = D.sound1At.length;
  var verdicts = [], pick = null, tag = null;
  try { var v = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(v)) verdicts = v; } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(verdicts)); } catch (e) {} }
  var audios = D.files.map(function (f) { var a = new Audio(f); a.preload = 'auto'; return a; });
  function play(i) { audios.forEach(function (a) { a.pause(); a.currentTime = 0; }); audios[i].play().catch(function () {}); }
  function pv(k, n) { if (n <= 0 || k <= 0) return 1; var c = 1, s = 0; for (var i = 0; i <= n; i++) { if (i >= k) s += c; c = c * (n - i) / (i + 1); } return s / Math.pow(2, n); }
  var $ = function (s) { return document.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function render() {
    var i = verdicts.length, done = i >= N;
    $('#trial').hidden = done; $('#done').hidden = !done;
    $('#count').textContent = 'Trial ' + Math.min(i + 1, N) + ' of ' + N;
    $$('[data-pick]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.pick === pick)); });
    $$('[data-tag]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tag === tag)); });
    $('[data-next]').disabled = !pick;
    var right = verdicts.filter(function (x) { return x.right; }).length, n = verdicts.length, el = $('#results');
    if (!n) { el.textContent = 'No verdicts yet.'; return; }
    var counts = {}; verdicts.forEach(function (x) { if (x.tag) counts[x.tag] = (counts[x.tag] || 0) + 1; });
    var tags = Object.keys(counts).map(function (t) { return t + ' ' + counts[t]; }).join(', ');
    el.innerHTML = '<p><b>' + right + ' of ' + n + '</b> right' + (n < N ? ' so far' : '') + ', p = ' + pv(right, n).toFixed(3) + '</p>' +
      '<p class="mu">p is the chance of doing at least this well by guessing. Below 0.05, you can tell the two apart; 20 trials with 15 right is p = 0.021.</p>' + (tags ? '<p class="mu">' + tags + '</p>' : '');
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.dataset.train != null) play(Number(t.dataset.train));
    else if (t.dataset.play) play(D.sound1At[verdicts.length] === t.dataset.play ? 0 : 1);
    else if (t.dataset.pick) { pick = t.dataset.pick; render(); }
    else if (t.dataset.tag) { tag = tag === t.dataset.tag ? null : t.dataset.tag; render(); }
    else if (t.hasAttribute('data-next') && pick) {
      var i = verdicts.length, s1 = D.sound1At[i];
      verdicts.push({ trial: i + 1, pick: pick, tag: tag, sound1At: s1, right: pick === s1 });
      pick = null; tag = null; save(); render();
    } else if (t.id === 'export') {
      var right = verdicts.filter(function (x) { return x.right; }).length;
      var body = JSON.stringify({ pair: D.labels, trials: N, score: { right: right, n: verdicts.length, p: pv(right, verdicts.length) }, verdicts: verdicts }, null, 2);
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' })); a.download = 'verdicts.json';
      document.body.appendChild(a); a.click(); a.remove();
    }
  });
  render();
})();
</script>
</body></html>
`;
}
