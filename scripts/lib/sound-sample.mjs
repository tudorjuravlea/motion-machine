// Samples in the sound system (SPEC §9): a style (`sound.samples`) or a story (`audio.samples`) maps a cue to a
// sound file in the piece; `mm sound` places it like a synthesised cue, trimmed and gain-matched to the sound
// profile's level, and every file has a record beside it (assets/sounds/x.wav, assets/sounds/x.json:
// source, licence, author; contracts/sound-sample.schema.json) that W-SAMPLE-LICENSE reads. Library only; Node.
//
//   sampleMap(story, style, dir)          { cue: { rel, file, from } } the story's map over the style's
//   recordFile(file)                      the record that goes with a sample file
//   readRecord(file)                      { ok: true, record } | { ok: false, reason }
//   sampleProblems(entry)                 what is wrong with a mapped sample, as sentences ([] when nothing)
//   trimSample(channels, sr)              the sound without its leading and trailing silence, with a short fade at each end
//   matchSample(channels, sr, lufs)       the sound scaled so its loudest 100 ms (K-weighted) sits on `lufs`
//   loadSample(entry, profile)            decode, trim, match: { channels, sampleRate, durationS, gainDb, ... }
//   sampleModule(name, entry, loaded)     the sound pattern module of a sample, for loaders and the mixer
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { NATIVE_LUFS } from '../../runtime/kit/synth.js';
import { decodeStereo } from './audio-decode.mjs';
import { loudest100ms } from './audio-measure.mjs';
import { validators } from './validate.mjs';

export const SAMPLE_RATE = 48000;
export const TRIM_DB = -60;               // silence is whatever sits this far under the sound's own peak
const PREROLL_S = 0.002, TAIL_S = 0.01, FADE_IN_S = 0.0005, MAX_S = 5;

let v = null;
const explain = (fn) => (fn.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
const cueKey = (c) => String(c).replace(/^sound\//, '');

/** The cues a piece plays from files: the story's `audio.samples` over the style's `sound.samples`. `{ cue: { rel, file, from } }`. */
export function sampleMap(story, style, dir) {
  const out = {};
  for (const [from, map] of [['style', style?.sound?.samples], ['story', story?.audio?.samples]]) {
    for (const [cue, rel] of Object.entries(map ?? {})) out[cueKey(cue)] = { rel, file: resolve(dir, rel), from };
  }
  return out;
}

/** `assets/sounds/x.wav` goes with `assets/sounds/x.json`. */
export const recordFile = (file) => join(dirname(file), `${basename(file, extname(file))}.json`);

export function readRecord(file) {
  const rec = recordFile(file);
  if (!existsSync(rec)) return { ok: false, reason: `no record ${basename(rec)} beside it (source, licence, author)` };
  let json;
  try { json = JSON.parse(readFileSync(rec, 'utf8')); } catch (e) { return { ok: false, reason: `${basename(rec)} is not JSON: ${e.message}` }; }
  v ??= validators();
  if (!v.soundSample(json)) return { ok: false, reason: `${basename(rec)} is invalid: ${explain(v.soundSample)}` };
  return { ok: true, record: json };
}

export function sampleProblems(entry) {
  if (!existsSync(entry.file)) return [`the file ${entry.rel} does not exist`];
  const r = readRecord(entry.file);
  return r.ok ? [] : [r.reason];
}

/** Leading and trailing silence cut (under TRIM_DB of the peak), 2 ms kept before the first sound, 10 ms of fade after the last, at most MAX_S long. */
export function trimSample(channels, sr) {
  const n = channels[0].length;
  let peak = 0;
  for (const c of channels) for (let i = 0; i < n; i++) { const a = Math.abs(c[i]); if (a > peak) peak = a; }
  if (!(peak > 0)) return channels.map(() => new Float32Array(0));
  const gate = Math.max(peak * 10 ** (TRIM_DB / 20), 1e-6);
  let first = n, last = -1;
  for (let i = 0; i < n && first === n; i++) for (const c of channels) if (Math.abs(c[i]) > gate) { first = i; break; }
  for (let i = n - 1; i >= 0 && last < 0; i--) for (const c of channels) if (Math.abs(c[i]) > gate) { last = i; break; }
  const from = Math.max(0, first - Math.round(PREROLL_S * sr));
  const to = Math.min(n, last + 1 + Math.round(TAIL_S * sr), from + Math.round(MAX_S * sr));
  const fadeOut = Math.min(to - from, Math.round(TAIL_S * sr)), fadeIn = Math.round(FADE_IN_S * sr);
  return channels.map((c) => {
    const out = c.slice(from, to);
    for (let k = 0; k < fadeOut; k++) out[out.length - 1 - k] *= 0.5 - 0.5 * Math.cos((Math.PI * k) / fadeOut);
    if (Math.abs(out[0] ?? 0) > 0.02 * peak) for (let k = 0; k < fadeIn && k < out.length; k++) out[k] *= k / fadeIn;
    return out;
  });
}

/** The channels scaled so the loudest 100 ms sits on `lufs`: { channels, gainDb } (silence is left as it is, gain 0 dB). */
export function matchSample(channels, sr, lufs) {
  const have = loudest100ms(channels, sr);
  if (!Number.isFinite(have)) return { channels, gainDb: 0 };
  const gainDb = lufs - have, g = 10 ** (gainDb / 20);
  return { channels: channels.map((c) => c.map((x) => x * g)), gainDb };
}

/** A mapped sample as the mixer places it: trimmed, and matched to the profile's level (NATIVE_LUFS, the palette's matched level, with no profile). */
export async function loadSample(entry, profile = null) {
  const raw = await decodeStereo(entry.file, SAMPLE_RATE);
  const trimmed = trimSample(raw, SAMPLE_RATE);
  const target = profile ? profile.loudness.cueLufs100ms : NATIVE_LUFS;
  const { channels, gainDb } = matchSample(trimmed, SAMPLE_RATE, target);
  const rec = readRecord(entry.file);
  return {
    channels, sampleRate: SAMPLE_RATE, durationS: channels[0].length / SAMPLE_RATE, gainDb,
    sourceS: raw[0].length / SAMPLE_RATE, targetLufs: target, record: rec.ok ? rec.record : null,
  };
}

/** The sound pattern module of a mapped sample: a name, a length and a `gain` param; it renders nothing in a context (the mixer places the decoded samples). */
export function sampleModule(name, entry, loaded) {
  return {
    name, group: 'sound', sample: { rel: entry.rel, file: entry.file, record: loaded.record },
    params: { gain: { type: 'number', default: 1, meaning: 'a multiplier on the sample (1 is the profile\'s matched level)' } },
    durationS: loaded.durationS, channels: loaded.channels,
    render() {},
  };
}
