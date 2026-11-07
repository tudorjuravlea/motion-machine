// Shared by the `mm gen` providers: the failure that exits 1, hashes, streamed downloads to a
// .partial file, polling, and finding a result URL in whatever shape a provider returns.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, renameSync, rmSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

/** A provider said no, or its answer was not understood: printed without a stack, exit 1. */
export class ProviderError extends Error {
  constructor(message) { super(message); this.name = 'ProviderError'; this.exitCode = 1; }
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const sha256File = (file) => new Promise((ok, no) => {
  const h = createHash('sha256');
  createReadStream(file).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', no);
});
/** { path, size, sha256 } of a local file that will leave the machine. */
export async function describeFile(path) {
  return { path, size: statSync(path).size, sha256: await sha256File(path) };
}

export const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits for `step()` to return a value other than undefined, every `everyMs`, for at most `timeoutMs`. */
export async function poll(step, { everyMs, timeoutMs, sleep = sleepMs, what = 'the job' }) {
  const start = Date.now();
  for (;;) {
    const v = await step();
    if (v !== undefined) return v;
    if (Date.now() - start > timeoutMs) throw new ProviderError(`${what} did not finish in ${Math.round(timeoutMs / 60000)} minutes`);
    await sleep(everyMs);
  }
}

/** Streams an https URL to `file + '.partial'`; returns the partial's path (the caller renames it). */
export async function download(url, file, fetchFn) {
  if (!/^https:\/\//i.test(url)) throw new ProviderError(`a result is only fetched over https, not ${String(url).split('/')[0]}`);
  const res = await fetchFn(url);
  if (!res.ok || !res.body) throw new ProviderError(`downloading the result failed (HTTP ${res.status})`);
  const partial = `${file}.partial`;
  try { await pipeline(Readable.fromWeb(res.body), createWriteStream(partial)); } catch (e) { rmSync(partial, { force: true }); throw e; }
  return partial;
}

export const promote = (partial, file) => renameSync(partial, file);

const EXT = { image: /\.(png|jpe?g|webp|gif)(\?|$)/i, video: /\.(mp4|mov|webm)(\?|$)/i, audio: /\.(mp3|wav|m4a|ogg|flac)(\?|$)/i };

/** Every https URL inside a value (a JSON string is parsed first), in order. */
export function urlsIn(value) {
  if (typeof value === 'string') {
    if (/^\s*[[{]/.test(value)) { try { return urlsIn(JSON.parse(value)); } catch { /* not JSON */ } }
    return /^https:\/\/\S+$/.test(value.trim()) ? [value.trim()] : [];
  }
  if (Array.isArray(value)) return value.flatMap(urlsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(urlsIn);
  return [];
}

/** The result URL among those a provider returned: the first whose extension fits the kind of media, else the first. null when none. */
export function pickUrl(value, mediaKind) {
  const urls = urlsIn(value);
  return urls.find((u) => EXT[mediaKind]?.test(u)) ?? urls[0] ?? null;
}

/** The first value found under a key of this name, anywhere in a value (null when none). */
export function findKeyed(value, names) {
  if (Array.isArray(value)) { for (const v of value) { const f = findKeyed(v, names); if (f != null) return f; } return null; }
  if (value && typeof value === 'object') {
    for (const n of names) if (value[n] != null && typeof value[n] !== 'object') return value[n];
    for (const v of Object.values(value)) { const f = findKeyed(v, names); if (f != null) return f; }
  }
  return null;
}

/** The kind of audio in the first bytes of a file: "wav" for RIFF/WAVE, else "mp3". */
export const audioExt = (head) => (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WAVE' ? 'wav' : 'mp3');
export const isPng = (head) => head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
export const isMp4 = (head) => head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp';

/** `fetchFn` that refuses any host not in `hosts`: the API calls of a provider go only to its documented hosts. */
export function guarded(fetchFn, hosts) {
  return (url, init) => {
    const host = new URL(url).hostname;
    if (!hosts.includes(host)) throw new ProviderError(`refusing to call ${host}: not one of this provider's documented hosts (${hosts.join(', ')})`);
    return fetchFn(url, init);
  };
}

/** The message in a provider's error body, short. */
export function errorText(body, fallback) {
  const m = body?.msg ?? body?.message ?? body?.detail?.message ?? body?.detail ?? body?.error?.message ?? body?.error;
  const s = typeof m === 'string' ? m : m ? JSON.stringify(m) : fallback;
  return String(s).slice(0, 300);
}
