#!/usr/bin/env node
// `mm sound find <words> [--license cc0,pdm,by] [--length shortest,short] [--category sound_effect] [--page-size 20]
//   [--page N] [--extension wav,ogg] [--piece <dir>] [--json]`   (SPEC §9)
//
//   words ──► GET api.openverse.org/v1/audio/ (q, license, category, length, extension, filter_dead, mature=false)
//         ──► every row checked again against the licences the piece offers ──► a table:
//             id, title, creator, licence and version, length, file type, source, the landing page.
//
// A search is not a download: it needs no --yes and writes nothing. The licences offered are the style's
// `sound.licences` (default cc0, pdm, by) plus whatever the story names in `audio.acceptLicences`; with no --piece
// that is the default. NonCommercial, NoDerivatives, ShareAlike and Sampling+ are never offered unless the story names
// them. An optional OPENVERSE_TOKEN (environment, or the keys.env file `mm gen` reads) adds a bearer header to raise
// the rate limits; it is never printed. Titles and creators came from outside, so the table sits in a marked block as
// material. Exit 0 (also for no result), 1 Openverse failed, 2 usage.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { UsageError, isArgsError, usageText } from './lib/cli.mjs';
import { fence } from './lib/fence.mjs';
import { resilientFetch } from './lib/http.mjs';
import { findKey, scrub } from './lib/gen/keys.mjs';
import { CATEGORIES, LENGTHS, getJson, readPiece, searchUrl, tableOf } from './lib/openverse.mjs';
import { OPENVERSE_LICENCES, classify, offered, verdict } from './lib/sound-licence.mjs';

const OPTIONS = {
  license: { type: 'string' }, length: { type: 'string' }, category: { type: 'string' }, extension: { type: 'string' },
  'page-size': { type: 'string' }, page: { type: 'string' }, piece: { type: 'string' }, json: { type: 'boolean' },
};
const list = (v) => (v == null ? null : v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
const whole = (v, flag, min, max) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new UsageError(`${flag} takes a whole number from ${min} to ${max}, not ${v}`);
  return n;
};
const oneOf = (values, allowed, flag) => {
  const bad = values.find((x) => !allowed.includes(x));
  if (bad !== undefined) throw new UsageError(`${flag}: "${bad}" is not one of ${allowed.join(', ')}`);
  return values;
};

export async function main(argv, io = {}) {
  const env = io.env ?? process.env, secrets = new Set();
  const out = (s) => (io.out ?? console.log)(scrub(s, secrets));
  const err = (s) => (io.err ?? console.error)(scrub(s, secrets));
  try {
    const { values: v, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: OPTIONS });
    const q = positionals.join(' ').trim();
    if (!q) throw new UsageError('it needs the words to search for');
    if (q.length > 200) throw new UsageError('the words are at most 200 characters');
    const { style, story } = v.piece ? readPiece(resolve(io.cwd ?? process.cwd(), v.piece)) : { style: {}, story: {} };
    const off = offered(style, story);
    let licences = [...off.codes];
    if (v.license !== undefined) {
      licences = list(v.license);
      if (!licences.length) throw new UsageError('--license takes licence codes, like cc0,pdm,by');
      oneOf(licences, OPENVERSE_LICENCES, '--license');
      const barred = licences.filter((c) => !off.codes.has(c));
      if (barred.length) throw new UsageError(`--license ${barred.join(', ')}: not offered unless the story names ${barred.length > 1 ? 'them' : 'it'} in audio.acceptLicences (give --piece <dir> of a piece whose story does)`);
    }
    const length = v.length !== undefined ? oneOf(list(v.length), LENGTHS, '--length') : undefined;
    const category = oneOf(list(v.category ?? 'sound_effect'), CATEGORIES, '--category');
    const extension = v.extension !== undefined ? list(v.extension) : undefined;
    const pageSize = whole(v['page-size'], '--page-size', 1, 500) ?? 20;
    const page = whole(v.page, '--page', 1, 10000) ?? 1;

    const key = findKey('openverse', { env, home: io.home });
    if (key) secrets.add(key.value);
    const json = await getJson(searchUrl({ q, licences, category, length, extension, pageSize, page }), { fetch: resilientFetch(io.fetch ?? globalThis.fetch, { sleep: io.sleep }), token: key?.value ?? null });
    const rows = Array.isArray(json.results) ? json.results : [];
    const kept = rows.filter((r) => verdict(r, off).ok && licences.includes(classify(r).code));
    if (kept.length < rows.length) err(`${rows.length - kept.length} result${rows.length - kept.length === 1 ? '' : 's'} left out: a licence this piece does not offer, or none (the search is filtered again here)`);
    if (v.json) { out(JSON.stringify(kept, null, 2)); return 0; }
    if (!kept.length) { out(`no results for "${q}" under ${licences.join(', ')}`); return 0; }
    out(fence(tableOf(kept), 'openverse'));
    out(`${kept.length} of ${json.result_count ?? kept.length} results (page ${page}). Fetch one: mm sound fetch <id> --piece <dir> --name <name> [--cue <cue>]; it re-checks the licence, plans the download and waits for --yes.`);
    return 0;
  } catch (e) {
    if (isArgsError(e)) err(`${e.message}\n${usageText('sound find')}`);
    else if (e instanceof UsageError) err(`mm sound find: ${e.message}\n${usageText('sound find')}`);
    else err(process.env.MM_DEBUG === '1' ? String(e.stack ?? e) : `mm sound find: ${e.message}`);
    return isArgsError(e) ? 2 : e.exitCode ?? 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
