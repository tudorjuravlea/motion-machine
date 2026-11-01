// The asset licence ledger (SPEC §8): every asset a piece uses that MM did not draw (a still, a recording, a
// captured page, imported or generated media, a sample) may carry a record beside it, assets/<name>.licence.json:
// { source, licence, licenceUrl, author, credit, providerPage, retrieved } (+ provider and model for generated
// work). `mm gen` and `mm capture site` write it, W-ASSET-LICENSE reads it, `mm credits` lists what it asks us to
// say. Never a transient CDN link as the only source: the provider page and the date go in the record.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { recordClass } from './sound-licence.mjs';

/** Where each `mm gen` provider is found (a record names the page, never a temporary result link). */
export const PROVIDER_PAGES = { kie: 'https://kie.ai', elevenlabs: 'https://elevenlabs.io', higgsfield: 'https://higgsfield.ai' };
/** The licence of a captured page: someone else's work, a person decides. Outside the allowlist on purpose. */
export const CAPTURED_LICENCE = 'third-party, ask';

const FIELDS = ['source', 'licence', 'licenceUrl', 'author', 'credit', 'providerPage', 'retrieved', 'provider', 'model'];
// own, generated, public domain, CC0 and attribution-only Creative Commons (CC-BY-<version>); share-alike,
// non-commercial and no-derivatives variants are outside it (a person accepts them in the story's licences.accepted)
const ALLOWED = [/^own( recording)?$/, /^generated$/, /^public[ -]domain$/, /^cc0(-1\.0)?$/, /^cc-by-\d(\.\d)?$/];
const ATTRIBUTION = /^cc-by-\d(\.\d)?$/i;
const MEDIA = /\.(png|jpe?g|webp|gif|avif|svg|mp4|mov|webm|mp3|wav|m4a|ogg|flac|aac|opus)$/i;
const SOUND = /\.(wav|mp3|m4a|flac|ogg)$/i;

/** True for a licence on the allowlist (case does not matter). */
export const allowedLicence = (licence) => typeof licence === 'string' && ALLOWED.some((re) => re.test(licence.trim().toLowerCase()));

const today = () => new Date().toISOString().slice(0, 10);

/** The record for work a provider made: the provider's page, never the result link. */
export function generatedRecord({ provider, model = null, retrieved = today() }) {
  const page = PROVIDER_PAGES[provider] ?? null;
  return { source: page, licence: 'generated', licenceUrl: null, author: null, credit: null, providerPage: page, retrieved, provider: provider ?? null, model };
}

/** The record for a captured page: its address without query or fragment, licence "third-party, ask". */
export function capturedRecord({ url, retrieved = today() }) {
  let source = String(url);
  try { const u = new URL(source); u.search = ''; u.hash = ''; u.username = ''; u.password = ''; source = u.href; } catch { /* a repository path or a file name: kept as given */ }
  return { source, licence: CAPTURED_LICENCE, licenceUrl: null, author: null, credit: null, providerPage: source, retrieved };
}

/** Writes a record (fields in a fixed order, unknown ones last), whole or not at all. */
export function writeLicence(dir, relPath, record) {
  const known = Object.fromEntries(FIELDS.filter((k) => record[k] !== undefined).map((k) => [k, record[k]]));
  const extra = Object.fromEntries(Object.entries(record).filter(([k]) => !FIELDS.includes(k)));
  const file = join(dir, relPath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.partial`, `${JSON.stringify({ ...known, ...extra }, null, 2)}\n`);
  renameSync(`${file}.partial`, file);
}

/** Every string in a value that names a file or folder under assets/. */
function assetStrings(value, out = new Set()) {
  if (typeof value === 'string') { if (/^assets\/[^\s]+$/.test(value)) out.add(value); } else if (Array.isArray(value)) value.forEach((v) => assetStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => assetStrings(v, out));
  return out;
}

/** The assets a story uses that are media (a picture, clip or sound, or a frame-sequence folder), sorted; data files (words, beats) are not. */
export const assetsIn = (story) => [...assetStrings(story)].filter((r) => r.endsWith('/') || MEDIA.test(r)).sort();

/**
 * The places a reference's record may be, in order: beside the file (`assets/<name>.licence.json`), then for a
 * file in a folder the folder's (`assets/<folder>.licence.json`); a prepared folder `assets/<name>/` may also be
 * the record of what `mm gen` made (`assets/gen/<name>.licence.json`).
 */
export function recordPaths(ref) {
  const parts = ref.replace(/\/$/, '').split('/').slice(1);   // under assets/
  const stem = (s) => s.replace(/\.[^.]+$/, '');
  if (ref.endsWith('/')) return [`assets/${parts[0]}.licence.json`, `assets/gen/${parts[0]}.licence.json`];
  const own = posix.join('assets', ...parts.slice(0, -1), `${stem(parts.at(-1))}.licence.json`);
  if (parts.length > 1 && parts[0] !== 'gen') return [own, `assets/${parts[0]}.licence.json`];
  return [own];
}

/** { path, record } | { path, error } for the first record that exists among a reference's places; null when there is none. */
function lookup(dir, ref) {
  // a sound file a style or story maps to a cue has the sample record beside it (assets/sounds/x.json, contracts/sound-sample.schema.json)
  const paths = [...recordPaths(ref), ...(SOUND.test(ref) ? [ref.replace(/\.[^.]+$/, '.json')] : [])];
  for (const path of paths) {
    const file = join(dir, path);
    if (!existsSync(file)) continue;
    try {
      const record = JSON.parse(readFileSync(file, 'utf8'));
      if (!record || typeof record !== 'object' || Array.isArray(record)) return { path, error: 'is not a JSON object' };
      return { path, record };
    } catch (e) { return { path, error: `is not valid JSON (${e.message})` }; }
  }
  return null;
}

const exists = (dir, ref) => existsSync(join(dir, ref));
const norm = (s) => String(s).trim().replace(/\/$/, '').toLowerCase();

/** A sound record whose licence the story names in `audio.acceptLicences` (an Openverse code, like by-sa). */
const namedBySound = (story, record) => (story?.audio?.acceptLicences ?? []).includes(recordClass(record).code);

/**
 * [{ asset, problem, detail }] for every used asset that is on disk and has no record ('missing'), a record
 * that cannot be read ('unreadable') or a licence outside the allowlist ('licence') that the story does not
 * accept: `story.licences.accepted` lists assets (by their reference) or licences (by name).
 */
export function auditAssets({ dir, story }) {
  const accepted = new Set((story?.licences?.accepted ?? []).map(norm));
  const found = [];
  for (const asset of assetsIn(story)) {
    if (!exists(dir, asset) || accepted.has(norm(asset))) continue;
    const got = lookup(dir, asset);
    if (!got) found.push({ asset, problem: 'missing', detail: `no record: write ${recordPaths(asset)[0]}` });
    else if (got.error) found.push({ asset, problem: 'unreadable', detail: `${got.path} ${got.error}` });
    else if (!allowedLicence(got.record.licence) && !accepted.has(norm(got.record.licence ?? '')) && !namedBySound(story, got.record)) {
      found.push({ asset, problem: 'licence', detail: `${got.path} says ${got.record.licence ? `"${got.record.licence}"` : 'no licence'}, outside own, generated, CC0, CC-BY and public domain` });
    }
  }
  return found;
}

/**
 * [{ asset, text, record }] for the used assets whose record asks for a credit (CC-BY, a `credit` line, or a sound
 * found on Openverse, whose record keeps Openverse's own `attribution` line), once each. `style` adds the sounds it maps.
 */
export function creditsFor({ dir, story, style = null }) {
  const out = [];
  const styled = Object.values(style?.sound?.samples ?? {}).filter((r) => typeof r === 'string' && /^assets\/[^\s]+$/.test(r));
  for (const asset of [...new Set([...assetsIn(story), ...styled])].sort()) {
    if (!exists(dir, asset)) continue;
    const got = lookup(dir, asset);
    const r = got?.record;
    if (!r) continue;
    const said = [r.credit, r.attribution].find((t) => typeof t === 'string' && t.trim());
    const needed = ATTRIBUTION.test(String(r.licence ?? '').trim()) || (typeof r.credit === 'string' && r.credit.trim()) || r.source === 'openverse';
    if (!needed) continue;
    const text = said?.trim() || [r.author, r.licence, r.source].filter(Boolean).join(', ');
    if (!out.some((o) => o.text === text)) out.push({ asset, text, record: got.path });
  }
  return out;
}
