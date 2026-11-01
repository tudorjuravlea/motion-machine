// Can a cue be heard (SPEC §7 W-AUDIBLE, §9)? The third-octave margin of a cue against the music and the voice that sound
// with it, read over its loudest 60 ms and its first 20 ms in the bands within 30 dB of its peak; whether it is silent; whether it sits
// on speech; whether its 2-6 kHz level is harsh against the music. Pure: arrays in, a record out. Library only; Node.
//
//   auditCue({ cue, music, voice, sr, startS, onsetS, endS, G, spans, ducked, musicHarshDb })
//   musicHarshDb(channels, sr)    the music's loudest 5 ms in 2-6 kHz, dB (null when it has none)
//   verdictOf(readDb)             clear, ok, barely or masked
//
// `cue`, `music` and `voice` are equal-length stereo arrays of the region the cue sounds in, which begins at film second `startS`;
// `G` is the master's gain over this pre-master mix, so levels are judged as the file ships. Restated from Earshot's QA (MIT):
// the margin per third-octave band, the 60 ms and 20 ms windows, silence under -70 dBFS, the 2-6 kHz harshness against the music.
import { fft } from './audio-measure.mjs';
import { bandpass } from './sound-mix.mjs';

export const AUDIBLE = Object.freeze({ clearDb: 6, okDb: 3, silentDb: -70, harshOverDb: 6, bandWindowDb: 30, capDb: 60 });

const FC = Array.from({ length: 22 }, (_, k) => 10 ** ((k + 20) / 10));     // 100 Hz .. 12.6 kHz
const LO = FC.map((f) => f * 2 ** (-1 / 6)), HI = FC.map((f) => f * 2 ** (1 / 6));
const db10 = (x) => 10 * Math.log10(Math.max(x, 1e-20));
const r1 = (x) => Math.round(x * 10) / 10;

export const verdictOf = (read) => (read >= AUDIBLE.clearDb ? 'clear' : read >= AUDIBLE.okDb ? 'ok' : read >= 0 ? 'barely' : 'masked');

/** Power in each third-octave band of `len` samples from `from`, summed over the channels (a Tukey window, 25 % taper). */
function bands(chs, from, len, sr) {
  let n = 4096;
  while (n < len) n <<= 1;
  const out = new Float64Array(FC.length).fill(1e-30);
  const re = new Float64Array(n), im = new Float64Array(n), taper = Math.max(1, Math.floor(len * 0.125));
  for (const c of chs) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < len; i++) {
      const j = from + i;
      const w = i < taper ? 0.5 - 0.5 * Math.cos((Math.PI * i) / taper) : i >= len - taper ? 0.5 - 0.5 * Math.cos((Math.PI * (len - 1 - i)) / taper) : 1;
      re[i] = j >= 0 && j < c.length ? c[j] * w : 0;
    }
    fft(re, im);
    for (let b = 0; b < FC.length; b++) {
      const k0 = Math.ceil((LO[b] * n) / sr), k1 = Math.floor((HI[b] * n) / sr);
      for (let k = k0; k <= k1 && k < n / 2; k++) out[b] += re[k] * re[k] + im[k] * im[k];
    }
  }
  return out;
}

/** The best band's margin, dB, of the cue over what sounds with it (bands within 30 dB of the cue's strongest). */
function margin(E, B) {
  const top = Math.max(...E), floor = top * 10 ** (-AUDIBLE.bandWindowDb / 10);
  let best = -99;
  for (let b = 0; b < E.length; b++) if (E[b] >= floor) best = Math.max(best, Math.min(AUDIBLE.capDb, Math.max(-AUDIBLE.capDb, db10(E[b] / B[b]))));
  return best;
}

const mixOf = (a, b) => (b ? a.map((c, i) => Float32Array.from(c, (v, j) => v + b[i][j])) : a);

/** The loudest 5 ms of a signal in 2-6 kHz, dB; the mean-square of a 5 ms window. */
function loudestPresence(mono, sr, i0, i1) {
  const band = bandpass(mono, 2000, 6000, sr), w = Math.round(0.005 * sr);
  let s = 0, top = 0;
  for (let i = i0; i < i1; i++) {
    s += band[i] * band[i];
    if (i - w >= i0) s -= band[i - w] * band[i - w];
    if (i - i0 >= w - 1 && s / w > top) top = s / w;
  }
  return top;
}

const monoOf = (chs) => { const m = new Float64Array(chs[0].length); for (const c of chs) for (let i = 0; i < m.length; i++) m[i] += c[i] / chs.length; return m; };

/** The music's loudest 5 ms in 2-6 kHz, dB; null when it has none (a silent bed, a solo render). */
export function musicHarshDb(channels, sr) {
  const top = loudestPresence(monoOf(channels), sr, 0, channels[0].length);
  return top > 1e-10 ? db10(top) : null;
}

export function auditCue({ cue, music, voice = null, sr, startS, onsetS, endS, G = 0, spans = [], ducked = false, musicHarshDb: harshRef = null }) {
  const n = cue[0].length, att = Math.round((onsetS - startS) * sr), long = endS - onsetS > 0.4;
  let peak = 0;
  for (const c of cue) for (let i = 0; i < n; i++) { const a = Math.abs(c[i]); if (a > peak) peak = a; }
  const peakDb = 20 * Math.log10(Math.max(peak, 1e-12)) + G;
  const silent = peakDb < AUDIBLE.silentDb;
  const over = spans.some((s) => onsetS < s.to && Math.min(endS, onsetS + 0.3) > s.from);
  const row = { peakDb: r1(peakDb), silent, overSpeech: over, ducked, readDb: null, vsMusicDb: null, vsVoiceDb: null, first20Db: null, harshOverDb: null, verdict: silent ? 'silent' : 'not judged' };

  if (harshRef != null && !silent) {
    const i0 = Math.max(0, att - Math.round(0.01 * sr)), i1 = long ? n : Math.min(n, att + Math.round(0.08 * sr));
    row.harshOverDb = r1(db10(loudestPresence(monoOf(cue), sr, i0, i1)) - harshRef);
  }

  const other = mixOf(music, voice);
  let any = false;
  for (const c of other) for (let i = 0; i < n && !any; i += 7) any = c[i] !== 0;
  if (silent || !any) return row;

  const w60 = Math.round(0.06 * sr), w20 = Math.round(0.02 * sr), step = 48;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { let s = 0; for (const c of cue) s += c[i] * c[i]; cum[i + 1] = cum[i] + s; }
  const loudest = (w, a, b) => {
    let best = Math.max(0, a), v = -1;
    for (let s = Math.max(0, a); s <= Math.min(n - w, b); s += step) { const e = cum[s + w] - cum[s]; if (e > v) { v = e; best = s; } }
    return best;
  };
  const s60 = loudest(w60, att - 240, long ? n - w60 : att + Math.round(0.3 * sr));
  const s20 = long ? s60 : loudest(w20, att - 144, att + Math.round(0.08 * sr));
  const E60 = bands(cue, s60, w60, sr);
  const m60 = margin(E60, bands(other, s60, w60, sr));
  const m20 = margin(bands(cue, s20, w20, sr), bands(other, s20, w20, sr));
  row.readDb = r1(Math.max(m60, m20));
  row.first20Db = r1(m20);
  row.vsMusicDb = r1(margin(E60, bands(music, s60, w60, sr)));
  if (voice) row.vsVoiceDb = r1(margin(E60, bands(voice, s60, w60, sr)));
  row.verdict = verdictOf(row.readDb);
  return row;
}
