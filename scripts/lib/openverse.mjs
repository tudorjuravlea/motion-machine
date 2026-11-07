// The Openverse side of `mm sound find` and `mm sound fetch` (SPEC §9): the audio search and detail endpoints
// of api.openverse.org/v1 (public, read-only; a token only raises the rate limits), the record a fetched sound
// carries, and the table a search prints. A fetch function is always handed in, so a test answers from fixtures
// and nothing here reaches the network on its own. Library only; Node.
//
//   searchUrl(query)              the /v1/audio/ URL for a search
//   detailUrl(id)                 the /v1/audio/{id}/ URL
//   getJson(url, { fetch, token })  one GET with the bearer header, the answer as JSON; OpenverseError otherwise
//   downloadBytes(url, { fetch })   the file at an https URL, at most MAX_BYTES, with its sha1
//   sniff(bytes)                  wav | mp3 | ogg | flac | m4a by the first bytes, or null
//   recordFrom(detail, { sha1, retrieved })   the record that goes beside the file (contracts/sound-sample.schema.json)
//   tableOf(rows)                 the search table as text
//   readPiece(dir)                { style, story } of a piece folder, either {} when its file is not there
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { UsageError } from './cli.mjs';
import { describeFailure } from './http.mjs';
import { classify, recordLicence } from './sound-licence.mjs';

export const API = 'https://api.openverse.org/v1/';
export const API_HOST = 'api.openverse.org';
export const LENGTHS = ['shortest', 'short', 'medium', 'long'];
export const CATEGORIES = ['sound_effect', 'music', 'audiobook', 'podcast', 'news', 'pronunciation'];
/** The sound files a story can map to a cue (contracts/story.schema.json), by filetype. */
export const FILETYPES = ['wav', 'mp3', 'm4a', 'flac', 'ogg'];
/** The most bytes a sound file may have: a sound effect is small, and a download is read into memory to be hashed. */
export const MAX_BYTES = 64 * 1024 * 1024;

/** A request to Openverse failed or its answer was not understood: printed without a stack, exit 1. */
export class OpenverseError extends Error {
  constructor(message) { super(message); this.name = 'OpenverseError'; this.exitCode = 1; }
}

/** The /v1/audio/ URL for a search: { q, licences, category, length, extension, pageSize, page }. */
export function searchUrl({ q, licences, category, length, extension, pageSize = 20, page = 1 }) {
  const u = new URL('audio/', API);
  const set = (k, v) => { if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) u.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v)); };
  set('q', q);
  set('license', licences);
  set('category', category);
  set('length', length);
  set('extension', extension);
  set('filter_dead', 'true');
  set('mature', 'false');
  set('page_size', pageSize);
  set('page', page);
  return u.href;
}

export const detailUrl = (id) => new URL(`audio/${id}/`, API).href;

/** One GET to Openverse: the answer as JSON. A token, when there is one, goes only to this host. */
export async function getJson(url, { fetch, token = null }) {
  if (new URL(url).hostname !== API_HOST) throw new OpenverseError(`refusing to call ${new URL(url).hostname}: Openverse's API is ${API_HOST}`);
  let res;
  try {
    res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  } catch (e) { throw new OpenverseError(`could not reach Openverse (${e.cause?.code ?? e.message})`); }
  let text = '', json = null;
  try { text = await res.text(); json = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) {
    const f = describeFailure({ provider: 'Openverse', status: res.status, body: text, keyName: 'OPENVERSE_TOKEN' });
    throw Object.assign(new OpenverseError(f.message), { code: f.code, kind: f.kind });
  }
  if (!json || typeof json !== 'object') throw new OpenverseError('Openverse answered with something that is not JSON');
  return json;
}

/** The kind of sound a file's first bytes say it is, or null (an HTML page, a text file, anything else). */
export function sniff(head) {
  const b = Buffer.from(head);
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE') return 'wav';
  if (b.length >= 4 && b.toString('latin1', 0, 4) === 'OggS') return 'ogg';
  if (b.length >= 4 && b.toString('latin1', 0, 4) === 'fLaC') return 'flac';
  if (b.length >= 8 && b.toString('latin1', 4, 8) === 'ftyp') return 'm4a';
  if (b.length >= 3 && b.toString('latin1', 0, 3) === 'ID3') return 'mp3';
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3';
  return null;
}

/** Whether a host name is on the public internet: not localhost, a local name, or a private, loopback or link-local address. */
export function publicHost(host) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || /\.(localhost|local|internal|lan|home)$/.test(h)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
  }
  if (h.includes(':')) return !(h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:'));
  return true;
}

/** The file at an https URL, held in memory (at most MAX_BYTES) with its sha1: { bytes, sha1 }. No credential is sent. */
export async function downloadBytes(url, { fetch, maxBytes = MAX_BYTES }) {
  if (!/^https:\/\//i.test(url)) throw new OpenverseError(`a sound is only fetched over https, not ${String(url).split('/')[0]}`);
  if (!publicHost(new URL(url).hostname)) throw new OpenverseError(`refusing to fetch from ${new URL(url).hostname}: not a public address`);
  let res;
  try { res = await fetch(url, { method: 'GET', redirect: 'follow' }); } catch (e) { throw new OpenverseError(`could not download the sound (${e.cause?.code ?? e.message})`); }
  if (res.url && !/^https:\/\//i.test(res.url)) throw new OpenverseError('the download was redirected away from https');
  if (res.url && !publicHost(new URL(res.url).hostname)) throw new OpenverseError('the download was redirected to an address that is not public');
  if (!res.ok) {
    const f = describeFailure({ provider: 'Openverse', status: res.status, keyName: 'OPENVERSE_TOKEN' });
    throw Object.assign(new OpenverseError(`downloading the sound failed (HTTP ${res.status})`), { code: f.code, kind: f.kind });
  }
  const announced = Number(res.headers.get('content-length'));
  if (announced > maxBytes) throw new OpenverseError(`the sound is too large (${Math.round(announced / 1048576)} MB, at most ${Math.round(maxBytes / 1048576)} MB)`);
  const chunks = [];
  let size = 0;
  if (!res.body) throw new OpenverseError('downloading the sound gave no data');
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > maxBytes) throw new OpenverseError(`the sound is too large (more than ${Math.round(maxBytes / 1048576)} MB)`);
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  return { bytes, sha1: createHash('sha1').update(bytes).digest('hex') };
}

/** The file type of an item: its `filetype`, else the extension of its URL; one of FILETYPES, or null. */
export function filetypeOf(detail) {
  const raw = String(detail.filetype ?? '').toLowerCase().trim() || (/\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(String(detail.url ?? ''))?.[1] ?? '').toLowerCase();
  const t = raw === 'oga' ? 'ogg' : raw;
  return FILETYPES.includes(t) ? t : null;
}

/**
 * The record that goes beside a fetched sound (contracts/sound-sample.schema.json): source, licence and author lead
 * (what W-SAMPLE-LICENSE reads), then where it came from and what it was, as the item's detail stated it.
 */
export function recordFrom(detail, { sha1, retrieved }) {
  const cls = classify(detail);
  const rec = {
    source: 'openverse',
    licence: recordLicence(cls.code, cls.version),
    author: detail.creator || 'unknown',
    openverseId: detail.id,
    title: detail.title ?? null,
    licenceVersion: cls.version,
    licenceUrl: detail.license_url ?? null,
    creator: detail.creator ?? null,
    creatorUrl: detail.creator_url ?? null,
    landingUrl: detail.foreign_landing_url ?? null,
    attribution: detail.attribution ?? null,
    provider: detail.source ?? detail.provider ?? null,
    retrieved,
    sha1,
  };
  return Object.fromEntries(Object.entries(rec).filter(([, v]) => v !== null && v !== undefined));
}

const clip = (s, n) => (String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n));
const seconds = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)} s` : '?');

/** The search table: one line per row, columns padded; every cell cut short and on one line. */
export function tableOf(rows) {
  const head = ['id', 'title', 'creator', 'licence', 'length', 'type', 'source', 'page'];
  const body = rows.map((r) => {
    const c = classify(r);
    return [r.id, clip(r.title, 48), clip(r.creator, 28), c.name ?? '?', seconds(r.duration), clip(r.filetype, 6) || '?', clip(r.source ?? r.provider, 20), clip(r.foreign_landing_url, 160)];
  });
  const width = head.map((h, i) => Math.max(h.length, ...body.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(width[i])).join('  ').trimEnd();
  return [line(head), ...body.map(line)].join('\n');
}

/** The style and the story of a piece folder, read as written ({} for a file that is not there); a usage error for a folder that is not one or a file that is not JSON. */
export function readPiece(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new UsageError(`no such piece folder: ${dir}`);
  const read = (name) => {
    const file = join(dir, name);
    if (!existsSync(file)) return {};
    try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new UsageError(`${name}: ${e.message}`); }
  };
  return { style: read('style.json'), story: read('story.json') };
}
