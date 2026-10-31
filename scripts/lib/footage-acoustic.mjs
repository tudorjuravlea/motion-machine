// What the sound of a talking-head clip is doing, stretch by stretch, so `mm footage review` can tell a
// pause from a place the transcript missed a voice. A transcriber writes words and nothing else: a
// stretch with no word in it may be silence, a room's noise (a keyboard, a fan, a chair), or a voice that
// went untranscribed (a laugh, a name it could not read). Only the first two are dead air.
//
// Every 10 ms hop of the clip is one of three things: SILENCE (under a gate), NOISE (over it, but with a
// flat spectrum: no pitch), SPEECH (over it, with a spectrum that peaks at a voice's harmonics).
//   gate      the clip's speech level (the level 5 % of its frames reach) minus GATE_BELOW_SPEECH_DB,
//             clamped between GATE_MIN_DB and GATE_MAX_DB, so a loud take does not call its own room
//             speech and a quiet one is not gated into silence
//   flatness  geometric mean over arithmetic mean of the power spectrum between BAND_HZ, after a
//             first-difference pre-emphasis (which levels the tilt of a rumble): near 1 for noise, far
//             under it for a voiced sound; a frame under FLAT_SPEECH is speech
// A stop or a breath no longer than BRIDGE_S between two speech frames is part of the speech; a run of
// speech frames shorter than MIN_VOICED_S is a click, not a voice. A clip is classed `speech` when at
// least MIN_SPEECH_S of it is speech, else `noise` when any of it is over the gate, else `silent`
// (`no-audio` is the caller's: the file has no sound stream).
//
// Dead air is the part of a stretch between two words that is neither: at least MIN_DEAD_AIR_S of
// non-speech, with DEAD_AIR_PAD_S left at either end (`deadAirIn`).

export const HOP_S = 0.01;
/** 512 samples: 32 ms at the 16 kHz the analysis runs at, two or three periods of a low voice. */
export const FFT_N = 512;
export const ANALYSIS_RATE = 16000;
export const GATE_BELOW_SPEECH_DB = 20;
export const GATE_MIN_DB = -40;
export const GATE_MAX_DB = -22;
export const SPEECH_QUANTILE = 0.95;
export const BAND_HZ = Object.freeze([100, 4000]);
export const FLAT_SPEECH = 0.12;
export const PRE_EMPHASIS = 0.5;
export const BRIDGE_S = 0.12;
export const MIN_VOICED_S = 0.06;
export const MIN_SPEECH_S = 0.5;
/** Non-speech this long or longer, between two words, is dead air. */
export const MIN_DEAD_AIR_S = 0.5;
export const DEAD_AIR_PAD_S = 0.15;
/** A dead-air part holds silence or noise "in earnest" from this many seconds of it (a word's edge leaves a hop or two of noise). */
export const NAMED_S = 0.1;

const r3 = (x) => Math.round(x * 1000) / 1000;
const SILENCE = 0, NOISE = 1, SPEECH = 2;
const NAMES = ['silence', 'noise', 'speech'];

/** The gate (dBFS) for a clip whose speech level is `speechDb`. */
export const gateFor = (speechDb) => Math.min(GATE_MAX_DB, Math.max(GATE_MIN_DB, speechDb - GATE_BELOW_SPEECH_DB));

const HANN = Float64Array.from({ length: FFT_N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_N - 1)));
const BITREV = (() => {
  const bits = Math.log2(FFT_N), out = new Uint16Array(FFT_N);
  for (let i = 0; i < FFT_N; i++) { let r = 0; for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b); out[i] = r; }
  return out;
})();
const COS = Float64Array.from({ length: FFT_N / 2 }, (_, k) => Math.cos((2 * Math.PI * k) / FFT_N));
const SIN = Float64Array.from({ length: FFT_N / 2 }, (_, k) => -Math.sin((2 * Math.PI * k) / FFT_N));

/** In-place radix-2 FFT of FFT_N points. */
function fft(re, im) {
  for (let i = 0; i < FFT_N; i++) { const j = BITREV[i]; if (j > i) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let size = 2; size <= FFT_N; size <<= 1) {
    const half = size >> 1, step = FFT_N / size;
    for (let s = 0; s < FFT_N; s += size) {
      for (let k = 0; k < half; k++) {
        const a = s + k, b = a + half, c = COS[k * step], d = SIN[k * step];
        const tr = re[b] * c - im[b] * d, ti = re[b] * d + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}

/**
 * The spectral flatness of FFT_N samples at ANALYSIS_RATE: geometric over arithmetic mean of the power
 * between BAND_HZ after pre-emphasis and a Hann window; 0 when the frame holds nothing.
 */
export function spectralFlatness(frame, rate = ANALYSIS_RATE) {
  const re = new Float64Array(FFT_N), im = new Float64Array(FFT_N);
  for (let i = 0; i < FFT_N; i++) re[i] = (frame[i] - (i ? PRE_EMPHASIS * frame[i - 1] : 0)) * HANN[i];
  fft(re, im);
  const lo = Math.max(1, Math.round((BAND_HZ[0] * FFT_N) / rate)), hi = Math.min(FFT_N / 2 - 1, Math.round((BAND_HZ[1] * FFT_N) / rate));
  let sum = 0, logs = 0;
  for (let k = lo; k <= hi; k++) { const p = re[k] * re[k] + im[k] * im[k] + 1e-24; sum += p; logs += Math.log(p); }
  const n = hi - lo + 1;
  return sum > 1e-18 ? Math.exp(logs / n) / (sum / n) : 0;
}

/** Runs of equal labels as [{ from, to, label }] (hop indices, `to` exclusive). */
function runsOf(labels) {
  const out = [];
  for (let i = 0; i < labels.length;) { let j = i; while (j < labels.length && labels[j] === labels[i]) j++; out.push({ from: i, to: j, label: labels[i] }); i = j; }
  return out;
}

/**
 * The stretches of a clip: { class, speechDb, gateDb, duration, speechS, noiseS, silenceS, stretches: [{ a, b, kind }] },
 * `stretches` tiling [0, duration] in seconds of the sound (a transcriber's clock). `samples` are mono
 * floats at `rate`; they are read at that rate (the CLI decodes at ANALYSIS_RATE).
 */
export function analyse(samples, rate = ANALYSIS_RATE) {
  const duration = samples.length / rate;
  const hop = Math.round(HOP_S * rate), frames = samples.length >= FFT_N ? Math.floor((samples.length - FFT_N) / hop) + 1 : 0;
  const empty = (cls) => ({ class: cls, speechDb: null, gateDb: null, duration: r3(duration), speechS: 0, noiseS: 0, silenceS: r3(duration), stretches: duration > 0 ? [{ a: 0, b: duration, kind: 'silence' }] : [] });
  if (!frames) return empty('silent');
  const db = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = f * hop, end = i + FFT_N; i < end; i++) e += samples[i] * samples[i];
    db[f] = 10 * Math.log10(e / FFT_N + 1e-12);
  }
  const sorted = Float64Array.from(db).sort();
  const speechDb = sorted[Math.min(frames - 1, Math.floor(SPEECH_QUANTILE * frames))];
  const gateDb = gateFor(speechDb);
  const labels = new Uint8Array(frames);
  for (let f = 0; f < frames; f++) {
    if (db[f] < gateDb) continue;
    labels[f] = spectralFlatness(samples.subarray(f * hop, f * hop + FFT_N), rate) < FLAT_SPEECH ? SPEECH : NOISE;
  }
  // a short run of anything between two speech runs is part of the speech; a short run of speech alone is a click
  const bridge = Math.round(BRIDGE_S / HOP_S), voiced = Math.round(MIN_VOICED_S / HOP_S);
  let runs = runsOf(labels);
  runs.forEach((r, i) => { if (r.label !== SPEECH && i > 0 && i < runs.length - 1 && runs[i - 1].label === SPEECH && runs[i + 1].label === SPEECH && r.to - r.from <= bridge) labels.fill(SPEECH, r.from, r.to); });
  runs = runsOf(labels);
  runs.forEach((r) => { if (r.label === SPEECH && r.to - r.from < voiced) labels.fill(NOISE, r.from, r.to); });
  const stretches = runsOf(labels).map((r) => ({ a: r.from * HOP_S, b: r.to * HOP_S, label: r.label }));
  // the frames sit on a 10 ms grid starting half a window in: stretch the ends to the clip's, the joins to the middle of a hop
  const centre = FFT_N / 2 / rate;
  stretches.forEach((s, i) => { s.a = i === 0 ? 0 : s.a + centre - HOP_S / 2; s.b = i === stretches.length - 1 ? duration : s.b + centre - HOP_S / 2; });
  const total = [0, 0, 0];
  for (const s of stretches) total[s.label] += s.b - s.a;
  const cls = total[SPEECH] >= MIN_SPEECH_S ? 'speech' : total[NOISE] + total[SPEECH] > 0 ? 'noise' : 'silent';
  return {
    class: cls, speechDb: r3(speechDb), gateDb: r3(gateDb), duration: r3(duration),
    speechS: r3(total[SPEECH]), noiseS: r3(total[NOISE]), silenceS: r3(total[SILENCE]),
    stretches: stretches.map((s) => ({ a: r3(s.a), b: r3(s.b), kind: NAMES[s.label] })),
  };
}

/**
 * The parts of [from, to] that are not speech, joined where silence and noise touch:
 * [{ a, b, sound: 'silence' | 'noise' | 'silence and noise' }].
 */
export function nonSpeechIn(stretches, from, to) {
  const out = [];
  for (const s of stretches) {
    if (s.kind === 'speech' || s.b <= from + 1e-9 || s.a >= to - 1e-9) continue;
    const a = Math.max(s.a, from), b = Math.min(s.b, to), last = out.at(-1);
    if (last && Math.abs(last.b - a) < 1e-9) { last.b = b; last[s.kind] += b - a; } else out.push({ a, b, silence: 0, noise: 0, [s.kind]: b - a });
  }
  // a part is named by what it holds in earnest: the 10 ms of noise at a word's edge is not noise
  return out.map((p) => {
    const both = p.silence >= NAMED_S && p.noise >= NAMED_S;
    return { a: p.a, b: p.b, sound: both ? 'silence and noise' : p.noise > p.silence ? 'noise' : 'silence' };
  });
}

/** The dead air in the run { a, b } (a stretch with no word): the non-speech parts of at least `minS` seconds. */
export function deadAirIn(sound, run, { minS = MIN_DEAD_AIR_S } = {}) {
  return nonSpeechIn(sound.stretches ?? [], run.a, run.b).filter((p) => r3(p.b - p.a) >= minS);
}
