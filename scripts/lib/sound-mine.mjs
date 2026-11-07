// Mining a sound set (SPEC §9): cut a recording into its sounds, measure each with the sound system's one measurer
// (scripts/lib/audio-measure.mjs) and fit a sound profile to the set. Library only; Node. The verb is
// scripts/sound-mine.mjs (`mm sound mine`).
//
//   findInputs(path)                     the audio and video files under a file or a folder, sorted
//   splitSounds(channels, sr)            [{ from, to }] sample ranges, one per sound (onsets by scripts/beats.mjs)
//   analyseSound(channels, sr)           the record's numbers for one sound
//   contextOf(full, sr, sound)           the bed under a sound in its recording and the sound measured with it taken away
//   fitProfile(records, { name })        a sound profile (contracts/sound-profile.schema.json) summarising the set
//   balanceOf(records)                   the set's third-octave balance: { medianDb[28], spreadDb[28] } or null
//   modeOf(partials)                     'bar' | 'mallet' | 'string' | 'none' from a sound's partial ratios
import { readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { onsetEnvelope, pickOnsets } from '../beats.mjs';
import { familyOf } from '../../runtime/kit/synth.js';
import { bedOf, envelope, eventMeasure, measure, peaksOf, spectrum } from './audio-measure.mjs';
import { fitModes, modalPartials } from './modal-fit.mjs';
import { trimSample } from './sound-sample.mjs';

export const AUDIO_EXT = new Set(['.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.aif', '.aiff', '.mp4', '.mov', '.m4v', '.webm', '.mkv']);
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LADDER_T60 = { input: [0.005, 0.05], surface: [0.06, 0.3], outcome: [0.1, 0.5] };   // a family the set does not hold keeps the ladder's own band
const RUNG_OUT_DB = 20;        // a new onset starts a new sound when the one before has fallen this far under its peak
const PREROLL_S = 0.015;
const MODAL_RESIDUAL_DB = -10;     // the modes are kept in the record when they explain the sound to this residual or better
const MAX_SOUNDS = 2000;
const round = (x, p = 3) => (Number.isFinite(x) ? Math.round(x * 10 ** p) / 10 ** p : x);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/** The audio and video files under `path` (a file, or a folder searched all the way down), sorted by path. */
export function findInputs(path) {
  const root = resolve(path);
  const st = statSync(root);
  if (st.isFile()) return [root];
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (AUDIO_EXT.has(extname(e.name).toLowerCase())) out.push(p);
    }
  };
  walk(root);
  return out;
}

/**
 * The sounds of a recording as sample ranges. Onsets come from scripts/beats.mjs (spectral flux); an onset starts a new
 * sound only when the sound before has rung out (fallen 20 dB under its own peak) or the recording was silent there, so a
 * run of notes that overlap (a rising triad) is one sound and a run of separate taps is many. Each range is then
 * trimmed of the silence around it (trimSample).
 */
export function splitSounds(channels, sr) {
  const n = channels[0].length;
  const mono = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) mono[i] += c[i] / channels.length;
  const env = envelope(channels, sr, 0.005, 0.0025);
  const at = (t) => clamp(Math.round(t / env.hopS), 0, env.db.length - 1);
  let top = -Infinity;
  for (const d of env.db) if (d > top) top = d;
  if (!Number.isFinite(top)) return [];
  const upTo = (t0, t1) => { let m = -Infinity; for (let i = at(t0); i <= at(t1); i++) if (env.db[i] > m) m = env.db[i]; return m; };
  // an onset counts when the sound rises there: the 50 ms after it hold 6 dB more than the 40 ms before it (a noise floor's flux does not rise)
  const onsets = pickOnsets(onsetEnvelope(mono), { minGapS: 0.04, rel: 0.05 }).map((o) => o.t)
    .filter((t) => upTo(t, t + 0.05) > top - 50 && upTo(t, t + 0.05) >= upTo(Math.max(0, t - 0.04), Math.max(0, t - 0.01)) + 6);
  if (!onsets.length) onsets.push(Math.max(0, env.db.findIndex((d) => d > top - 50) * env.hopS));
  const starts = [onsets[0]];
  for (const t of onsets.slice(1)) {
    const peak = upTo(starts.at(-1), t - 0.02), before = upTo(t - 0.04, t - 0.02);
    if (before <= peak - RUNG_OUT_DB || before <= top - 55) starts.push(t);
  }
  const out = [];
  starts.forEach((t, i) => {
    const from = Math.max(0, Math.round((t - PREROLL_S) * sr)), to = i + 1 < starts.length ? Math.round((starts[i + 1] - PREROLL_S) * sr) : n;
    if (to - from < sr * 0.004) return;
    const piece = channels.map((c) => c.subarray(from, to));
    const trimmed = trimSample(piece, sr);
    if (trimmed[0].length >= sr * 0.004) out.push({ from, to, channels: trimmed });
  });
  return out.slice(0, MAX_SOUNDS);
}

// The ratios a struck material puts above its fundamental: whole numbers (a string), 2.76 and 5.4 (a bar), 3.99 (a mallet).
const PARTIAL_RATIOS = [2, 3, 4, 5, 6, 7, 8, 2.76, 5.4, 3.99];

/** Peaks by strength, each kept only when no stronger one is within 8 % of its frequency (a note's own side lobes are not notes); by frequency. */
function independentPeaks(peaks) {
  const kept = [];
  for (const p of [...peaks].sort((a, b) => b.db - a.db)) if (kept.every((k) => Math.abs(k.f / p.f - 1) > 0.08)) kept.push(p);
  return kept.sort((a, b) => a.f - b.f);
}

/**
 * The pitch classes of every note in a sound (for the key), read frame by frame: 120 ms under a Hann window every 60 ms, frames
 * within 30 dB of the loudest; in each, the strong independent peaks that are not a partial of a lower one. A short window and a
 * Hann taper keep a note's side lobes from reading as notes.
 */
function noteClasses(channels, sr) {
  const n = channels[0].length, len = Math.round(0.12 * sr), hop = Math.round(0.06 * sr);
  const frames = [];
  for (let s = 0; s === 0 || s + len / 2 < n; s += hop) {
    const part = channels.map((c) => c.slice(s, Math.min(n, s + len)));
    let e = 0;
    for (const c of part) for (let i = 0; i < c.length; i++) { c[i] *= 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / c.length); e += c[i] * c[i]; }
    frames.push({ part, e });
  }
  const top = Math.max(...frames.map((f) => f.e));
  const classes = new Set();
  for (const f of frames.filter((x) => x.e >= top * 1e-3)) {
    const all = independentPeaks(peaksOf(spectrum(f.part, sr), { max: 30, floorDb: -25, minHz: 30, apartHz: 2 }));
    for (const p of all) {
      if (all.some((q) => q.f < p.f && PARTIAL_RATIOS.some((r) => Math.abs(p.f / q.f / r - 1) <= 0.03))) continue;
      classes.add(NOTE_NAMES[(((Math.round(69 + 12 * Math.log2(p.f / 440))) % 12) + 12) % 12]);
    }
  }
  return [...classes];
}

/** 'bar', 'mallet', 'string' or 'none' from the partials' ratios to the fundamental (those a sound has within 40 dB). */
export function modeOf(ratios) {
  const near = (r, x, tol) => Math.abs(r / x - 1) <= tol;
  const rs = ratios.filter((r) => r >= 1.5);
  if (!rs.length) return 'none';
  if (rs.some((r) => near(r, 2.76, 0.05) || near(r, 5.4, 0.05))) return 'bar';
  const whole = rs.filter((r) => near(r, Math.round(r), 0.03));
  if (rs.some((r) => near(r, 3.99, 0.03)) && !rs.some((r) => near(r, 2, 0.03) || near(r, 3, 0.03))) return 'mallet';
  if (whole.length >= 2 && whole.length >= rs.length / 2) return 'string';
  return 'none';
}

/** The share of the spectrum's power within 4 % of its six strongest independent peaks: near 1 for notes, low for noise and sweeps. */
function peakShare(sp, total) {
  const kept = independentPeaks(peaksOf(sp, { max: 40, floorDb: -30, minHz: 30, apartHz: 2 })).sort((a, b) => b.db - a.db).slice(0, 6);
  let inPeaks = 0;
  for (const p of kept) for (let k = 1; k < sp.p.length; k++) if (Math.abs(sp.f[k] / p.f - 1) <= 0.04) inPeaks += sp.p[k];
  return total > 0 ? inPeaks / total : 0;
}

/** The record's numbers for one sound, rounded. `tonal`: spectral flatness under 0.002 and at least 45 % of the power in its strongest peaks; its notes' pitch classes are kept only from a sound that is 80 % peaks. */
export function analyseSound(channels, sr) {
  const m = measure(channels, sr);
  const sp = spectrum(channels, sr);
  const lengthS = Math.min(m.durationS, m.audibleS * 1.5);            // the time to fall 60 dB, extrapolated from the time to fall 40
  let total = 0;
  for (let k = 1; k < sp.p.length; k++) total += sp.p[k];
  const share = peakShare(sp, total);
  const tonal = m.flatness < 0.002 && share >= 0.45;
  let acc = 0, lowHz = 0;
  for (let k = 1; k < sp.p.length; k++) { acc += sp.p[k]; if (acc >= 0.02 * total) { lowHz = sp.f[k]; break; } }
  let pitchHz = null, partials = [], mode = 'none', pitchClasses = [], modal = null;
  if (tonal) {
    // the first note, from the first 80 ms under a Hann window (a later note of a phrase barely enters it, and the window keeps a
    // note's own side lobes under the strong peaks): lowest strong peak, partials as ratios to it
    const head = channels.map((c) => {
      const part = c.slice(0, Math.min(c.length, Math.round(0.08 * sr)));
      for (let i = 0; i < part.length; i++) part[i] *= 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / part.length);
      return part;
    });
    const peaks = independentPeaks(peaksOf(spectrum(head, sr), { max: 40, floorDb: -50, minHz: 30, apartHz: 2 }));
    const f0 = peaks.filter((p) => p.db >= -24)[0];
    if (f0) {
      pitchHz = f0.f;
      partials = peaks.filter((p) => p.f / f0.f >= 1.5).slice(0, 8).map((p) => [round(p.f / f0.f, 3), round(p.db - f0.db, 1)]);
      mode = modeOf(partials.map((p) => p[0]));
    }
    if (share >= 0.8) pitchClasses = noteClasses(channels, sr);
    // the modal fit: each mode's own frequency and decay, in a tone layer's shape. It sharpens the pitch the peak pick found
    const fit = fitModes(channels, sr), shape = modalPartials(fit);
    if (shape && fit.residualDb <= MODAL_RESIDUAL_DB) {
      modal = { ...shape, residualDb: round(fit.residualDb, 1) };
      if (pitchHz && Math.abs(shape.f0Hz / pitchHz - 1) <= 0.03) pitchHz = shape.f0Hz;
    }
  }
  return {
    durationS: round(m.durationS), lengthS: round(lengthS), family: familyOf(lengthS), peakDbfs: round(m.peakDbfs, 1),
    lufs100ms: round(m.lufs100ms, 1), lufsIntegrated: round(m.lufsIntegrated, 1),
    attackS: m.attackS == null ? null : round(m.attackS, 4), t60S: m.t60S == null ? null : round(m.t60S),
    centroidHz: round(m.centroidHz, 0), rolloffHz: round(m.rolloffHz, 0), lowHz: round(lowHz, 0), flatness: round(m.flatness, 6),
    sideMidDb: Number.isFinite(m.sideMidDb) ? round(m.sideMidDb, 1) : null,
    tonal, tonality: round(share, 2), pitchHz: pitchHz == null ? null : round(pitchHz, 2), pitchClasses,
    partials, mode, modal, room: roomOf(channels, sr),
  };
}

// A room shows as a knee in the decay: the last 20 dB of a short sound fall more slowly than its first. The early slope is
// -5 to -25 dB under the peak, the late one -25 to -45; the tail counts when the late T60 is at least 1.4 times the early
// one and under 1.5 s (a flatter fall is a noise floor, not a room). send is where the late line meets the peak.
function roomOf(channels, sr) {
  const env = envelope(channels, sr, 0.005, 0.0025);
  let pi = 0;
  env.db.forEach((d, i) => { if (d > env.db[pi]) pi = i; });
  const fit = (lo, hi) => {
    const pts = [];
    for (let i = pi; i < env.db.length; i++) { const d = env.db[i] - env.db[pi]; if (d < hi) break; if (d <= lo) pts.push([i * env.hopS, d]); }
    if (pts.length < 4) return null;
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const den = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
    const slope = den > 0 ? pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / den : 0;
    return slope < 0 ? { t60: -60 / slope, at: my - slope * (mx - pi * env.hopS) } : null;
  };
  const early = fit(-5, -25), late = fit(-25, -45);
  if (!early || !late || late.t60 < 1.4 * early.t60 || late.t60 > 1.5) return null;
  return { sizeS: round(clamp(late.t60, 0.05, 1)), send: round(clamp(late.at, -40, -10), 1) };
}

/** A profile name from free text: lowercase, hyphens, 2 to 41 characters starting with a letter. */
export const profileName = (s) => {
  const n = String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '').slice(0, 41).replace(/-+$/, '');
  return /^[a-z][a-z0-9-]{1,40}$/.test(n) ? n : 'mined';
};

/** The profile that summarises a mined set: see the contract. `records` are analyseSound's numbers plus `source`, `licence`, `author`. */
export function fitProfile(all, { name = 'mined', description = null } = {}) {
  if (!all.length) throw new Error('no sound to fit a profile to');
  // an event the music hides (exposed: false) says little about the sound itself: the set is fitted from those that stand clear
  // of the bed, or from all of them when none does
  const clear = all.filter((r) => r.exposed !== false), records = clear.length ? clear : all;
  const tonal = records.filter((r) => r.tonal && r.pitchHz);
  const struck = records.map((r) => r.attackS).filter((a) => a != null && a <= 0.01);
  const attackS = struck.length ? [clamp(round(0.8 * Math.min(...struck), 4), 0.0005, 0.01), clamp(round(1.25 * Math.max(...struck, 0.0008), 4), 0.001, 0.01)] : [0.001, 0.003];
  const t60 = {};
  for (const fam of ['input', 'surface', 'outcome']) {
    // the global T60 slope of a phrase of notes runs long; the extrapolated ring (lengthS) bounds it
    const v = records.filter((r) => r.family === fam).map((r) => Math.min(r.t60S ?? r.lengthS, r.lengthS));
    t60[fam] = v.length ? [clamp(round(0.8 * Math.min(...v), 3), 0.003, 3), clamp(round(1.25 * Math.max(...v), 3), 0.004, 3)] : LADDER_T60[fam];
  }
  const modes = tonal.map((r) => r.mode);
  const count = (m) => modes.filter((x) => x === m).length;
  const mode = ['bar', 'mallet', 'string'].map((m) => [m, count(m)]).sort((a, b) => b[1] - a[1])[0];
  const classes = [...new Set(tonal.flatMap((r) => r.pitchClasses))];
  const med = median(records.map((r) => r.lufs100ms));
  const crest = Math.max(...records.map((r) => r.peakDbfs - r.lufs100ms));
  const rooms = records.map((r) => r.room).filter(Boolean);
  const wide = records.map((r) => r.sideMidDb).filter((x) => x != null);
  const harmonicEnough = tonal.length && tonal.every((r) => r.partials.every((p) => p[1] < -24));
  const sources = [...new Map(all.map((r) => [`${r.source}|${r.licence}|${r.author ?? ''}`, { source: r.source, licence: r.licence, ...(r.author ? { author: r.author } : {}) }])).values()];
  return {
    name,
    description: description ?? `Fitted from ${records.length} mined sound${records.length === 1 ? '' : 's'}: ${tonal.length} tonal, ${records.length - tonal.length} noise or knock; centre of sound up to ${Math.round(Math.max(...records.map((r) => r.centroidHz)))} Hz.`.slice(0, 300),
    register: {
      maxCentreHz: clamp(Math.ceil((Math.max(...records.map((r) => r.centroidHz)) * 1.05) / 50) * 50, 200, 16000),
      minHz: clamp(Math.floor(Math.min(...records.map((r) => r.lowHz)) / 0.75), 20, 400),
      tones: !tonal.length || harmonicEnough ? 'sine' : tonal.every((r) => r.partials.every((p) => Math.abs(p[0] - Math.round(p[0])) < 0.05 && Math.round(p[0]) % 2 === 1)) ? 'triangle' : 'mixed',
    },
    key: classes.length >= 12 ? [] : classes.sort((a, b) => NOTE_NAMES.indexOf(a) - NOTE_NAMES.indexOf(b)),
    envelope: { attackS, t60 },
    modes: mode && mode[1] > 0 ? mode[0] : 'none',
    // the raw levels of a mined set are the recordings' own, so they set the target (the median) and not the tolerance: cues are matched within 1.5 dB
    loudness: { cueLufs100ms: round(clamp(med, -60, -6), 1), tolDb: 1.5, peakDbfs: round(clamp(med + crest + 0.5, -60, 0), 1) },
    room: rooms.length >= Math.ceil(records.length / 3)
      ? { send: round(median(rooms.map((r) => r.send)), 1), predelayS: 0.008, sizeS: round(median(rooms.map((r) => r.sizeS))), lowpassHz: clamp(Math.round(median(records.map((r) => r.rolloffHz)) / 100) * 100, 1500, 12000) }
      : { send: -40, predelayS: 0.008, sizeS: 0.12, lowpassHz: clamp(Math.round(median(records.map((r) => r.rolloffHz)) / 100) * 100, 1500, 12000) },
    stereo: { sideMidDb: wide.length ? round(clamp(median(wide), -60, 0), 1) : -60 },
    ...(balanceOf(records) ? { balance: balanceOf(records) } : {}),
    sources,
  };
}

/** The set's third-octave balance: per band the median of the events' bed-subtracted profiles (a band the music masks in an event does not count for it) and the spread (median absolute deviation, at least 1.5 dB; 6 dB from a single event). Null when no record carries one. */
export function balanceOf(records) {
  const rows = records.filter((r) => Array.isArray(r.balance) && r.balance.length === 28);
  if (!rows.length) return null;
  const medianDb = [], spreadDb = [];
  for (let b = 0; b < 28; b++) {
    const v = rows.filter((r) => !(r.masked ?? []).includes(b)).map((r) => r.balance[b]);
    if (!v.length) { medianDb.push(-60); spreadDb.push(6); continue; }
    const m = median(v);
    medianDb.push(round(m, 1));
    spreadDb.push(v.length < 2 ? 6 : round(Math.max(1.5, 1.4826 * median(v.map((x) => Math.abs(x - m)))), 1));
  }
  return { medianDb, spreadDb };
}

/**
 * What the recording around a sound says about it: the bed under it (the quietest 150 ms of the 0.6 s before it), how far the
 * sound stands over it, its third-octave balance with the bed taken away and the bands the music masks, its decay shape and any
 * stutter. `full` is the whole decoded recording, `sound` one entry of splitSounds. No bed to measure (the sound starts the
 * recording) is exposed. The family is read only from a sound that stands 12 dB over the bed.
 */
export function contextOf(full, sr, sound) {
  const onset = sound.from + Math.round(PREROLL_S * sr);
  const bed = bedOf(full, sr, onset), ev = eventMeasure(sound.channels, sr, bed);
  // with a bed the ring is read from the event's power with the bed taken away (the bed would hold it "audible" to the end)
  const lengthS = ev.ringS == null ? null : round(Math.min(sound.channels[0].length / sr, ev.ringS * 1.5));
  return {
    ...(lengthS == null ? {} : { lengthS, ringFamily: familyOf(lengthS) }),
    exposed: ev.exposed, exposedDb: ev.exposedDb,
    bed: bed ? { db: round(bed.db, 1), fromS: round(bed.fromS, 3), toS: round(bed.toS, 3) } : null,
    balance: Array.from(ev.balance, (v) => round(v, 1)), masked: ev.masked.flatMap((m, b) => (m ? [b] : [])),
    decay: ev.decay?.shape ?? null, stutterHz: ev.stutterHz,
  };
}
