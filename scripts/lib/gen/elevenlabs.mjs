// ElevenLabs for `mm gen` (SPEC §8): voice (text-to-speech with timestamps, the per-character
// alignment turned into per-word times), transcribe (Scribe), sfx (sound generation), music, credit.
// Host: api.elevenlabs.io. Request shapes follow https://elevenlabs.io/docs/api-reference.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { UsageError } from '../cli.mjs';
import { runFfmpeg } from '../ffmpeg.mjs';
import { ProviderError, errorText, guarded } from './common.mjs';

export const name = 'elevenlabs';
export const hosts = ['api.elevenlabs.io'];
export const KINDS = ['voice', 'transcribe', 'sfx', 'music'];
export const MODELS = { voice: 'eleven_multilingual_v2', transcribe: 'scribe_v2', sfx: 'eleven_text_to_sound_v2', music: 'music_v1' };
const BASE = 'https://api.elevenlabs.io';
const FORMAT = 'mp3_44100_128';
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Per-character alignment → [{ text, start, end }]: a word runs from its first character's start to its last character's end. */
export function wordsFromAlignment(alignment) {
  const chars = alignment?.characters, s = alignment?.character_start_times_seconds, e = alignment?.character_end_times_seconds;
  if (!Array.isArray(chars) || !chars.length) return [];
  const r = (x) => Math.round(x * 1000) / 1000;
  const words = [];
  let cur = null;
  chars.forEach((c, i) => {
    if (/\s/.test(c)) { if (cur) words.push(cur); cur = null; return; }
    if (!cur) cur = { text: '', start: r(s[i]), end: r(e[i]) };
    cur.text += c;
    cur.end = r(e[i]);
  });
  if (cur) words.push(cur);
  return words;
}

/** Scribe's response → [{ text, start, end }]: words with times; spacing and audio events are dropped. */
export function wordsFromScribe(body) {
  return (body?.words ?? []).filter((w) => w.type === 'word' && typeof w.start === 'number' && typeof w.end === 'number' && w.text?.trim())
    .map((w) => ({ text: w.text.trim(), start: w.start, end: w.end }));
}

const withAvoid = (prompt, negative) => (negative ? `${prompt} Avoid: ${negative}.` : prompt);

/** What would be sent, with no network: { model, prompt, negative, parameters, uploads }. */
export function prepare(req) {
  const model = req.model ?? MODELS[req.kind];
  if (req.kind === 'voice') {
    if (!req.text) throw new UsageError('mm gen voice needs --text "…" or --script <file>');
    const v = req.voice;
    const settings = Object.fromEntries(Object.entries({ stability: v.stability, similarity_boost: v.similarity, style: v.style, speed: v.speed }).filter(([, x]) => x != null));
    const lang = v.language && model !== 'eleven_multilingual_v2' ? { language_code: v.language } : {};
    return { model, prompt: req.text, negative: '', uploads: [], parameters: { voice_id: v.id, output_format: FORMAT, ...lang, ...(Object.keys(settings).length ? { voice_settings: settings } : {}) } };
  }
  if (req.kind === 'transcribe') {
    const file = req.audio ?? req.video;
    if (!file) throw new UsageError('mm gen transcribe needs --audio <file> or --video <file>');
    return { model, prompt: '', negative: '', uploads: [file], parameters: { timestamps_granularity: 'word', ...(req.language ? { language_code: req.language } : {}), ...(req.video && !req.audio ? { sends: 'the audio track of the video only' } : {}) } };
  }
  if (req.kind === 'sfx') {
    const d = req.duration != null ? clamp(req.duration, 0.5, 30) : null;
    return { model, prompt: req.prompt, negative: '', uploads: [], parameters: { output_format: FORMAT, ...(d != null ? { duration_seconds: d } : {}) } };
  }
  if (req.kind === 'music') {
    const ms = req.duration != null ? clamp(Math.round(req.duration * 1000), 3000, 600000) : null;
    return { model, prompt: withAvoid(req.prompt, req.negative), negative: '', uploads: [], parameters: { output_format: FORMAT, force_instrumental: req.instrumental, ...(ms != null ? { music_length_ms: ms } : {}) } };
  }
  throw new UsageError(`elevenlabs cannot make ${req.kind}`);
}

async function call(fetchFn, key, path, init) {
  const res = await fetchFn(`${BASE}${path}`, { ...init, headers: { 'xi-api-key': key, ...(init.headers ?? {}) } });
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    throw new ProviderError(`elevenlabs: HTTP ${res.status}: ${errorText(body, res.statusText || 'request failed')}`);
  }
  return res;
}
const post = (fetchFn, key, path, body) => call(fetchFn, key, path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Runs the request: { outputs: [{ bytes, ext }], words?, job, cost, sent }. */
export async function run(req, prep, ctx) {
  const f = guarded(ctx.fetch, hosts);
  const key = ctx.key;
  const p = prep.parameters;
  if (req.kind === 'voice') {
    const body = { text: req.text, model_id: prep.model, ...(p.language_code ? { language_code: p.language_code } : {}), ...(p.voice_settings ? { voice_settings: p.voice_settings } : {}) };
    const res = await post(f, key, `/v1/text-to-speech/${encodeURIComponent(p.voice_id)}/with-timestamps?output_format=${p.output_format}`, body);
    const j = await res.json();
    if (!j.audio_base64) throw new ProviderError('elevenlabs: the answer held no audio');
    return { outputs: [{ bytes: Buffer.from(j.audio_base64, 'base64'), ext: 'mp3' }], words: wordsFromAlignment(j.alignment), job: res.headers.get('request-id'), cost: null };
  }
  if (req.kind === 'transcribe') {
    let file = req.audio, tmp = null;
    try {
      if (!file) {
        tmp = mkdtempSync(join(tmpdir(), 'mm-gen-'));
        file = join(tmp, 'audio.mp3');
        await runFfmpeg(['-i', req.video, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', file]);
      }
      const form = new FormData();
      form.set('model_id', prep.model);
      form.set('timestamps_granularity', 'word');
      if (p.language_code) form.set('language_code', p.language_code);
      form.set('file', new Blob([readFileSync(file)]), basename(file));
      const res = await call(f, key, '/v1/speech-to-text', { method: 'POST', body: form });
      const j = await res.json();
      return { outputs: [], words: wordsFromScribe(j), language: j.language_code ?? null, job: j.transcription_id ?? null, cost: null };
    } finally { if (tmp) rmSync(tmp, { recursive: true, force: true }); }
  }
  if (req.kind === 'sfx') {
    const res = await post(f, key, `/v1/sound-generation?output_format=${p.output_format}`, { text: prep.prompt, model_id: prep.model, ...(p.duration_seconds != null ? { duration_seconds: p.duration_seconds } : {}) });
    return { outputs: [{ bytes: Buffer.from(await res.arrayBuffer()), ext: 'mp3' }], job: res.headers.get('request-id'), cost: null };
  }
  const res = await post(f, key, `/v1/music?output_format=${p.output_format}`, { prompt: prep.prompt, model_id: prep.model, force_instrumental: p.force_instrumental, ...(p.music_length_ms != null ? { music_length_ms: p.music_length_ms } : {}) });
  return { outputs: [{ bytes: Buffer.from(await res.arrayBuffer()), ext: 'mp3' }], job: res.headers.get('request-id'), cost: null };
}

/** The balance, one line. */
export async function credit(ctx) {
  const res = await call(guarded(ctx.fetch, hosts), ctx.key, '/v1/user/subscription', { method: 'GET' });
  const j = await res.json();
  return `${j.character_count} of ${j.character_limit} characters used${j.tier ? ` (${j.tier})` : ''}`;
}
