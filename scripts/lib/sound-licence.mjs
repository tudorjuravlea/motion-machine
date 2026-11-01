// Which licences a found sound may carry (SPEC §9), and what W-SAMPLE-LICENSE says of an Openverse record. The rules
// are Earshot's, restated for Openverse's own licence codes: CC0, public domain and CC BY 2.0 to 4.0 are free to
// use, edit and publish in a film; NonCommercial, NoDerivatives, ShareAlike and Sampling+ are not (trimming and
// syncing to picture are edits, a film is commercial use, a share-alike film would have to be released under the
// same licence); an item with no licence field is refused, and so is any licence this does not recognise. A person
// can still use one of the first group by naming it in the story (`audio.acceptLicences`). A brand can narrow what is
// offered, once, in the style (`sound.licences`). Library only; Node.
//
//   classify(row)             { code, version, known, free, name, reason } of an Openverse row's license and license_version
//   recordClass(record)       the same, read back from a sample record's `licence` and `licenceVersion`
//   recordLicence(code, ver)  the `licence` string a record carries (CC0-1.0, CC-BY-4.0, public domain, ...)
//   offered(style, story)     { codes: Set, accepted: [codes the story names] } the licences this piece offers
//   verdict(row, offered)     { ok, accepted, reason, cls } may this item be used here
//   openverseProblems(entries, { story, style, dir })   what W-SAMPLE-LICENSE warns of in the Openverse records
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { readRecord } from './sound-sample.mjs';

export const DEFAULT_LICENCES = ['cc0', 'pdm', 'by'];
/** Every licence code Openverse's audio search knows. */
export const OPENVERSE_LICENCES = ['cc0', 'pdm', 'by', 'by-sa', 'by-nd', 'by-nc', 'by-nc-sa', 'by-nc-nd', 'sampling+', 'nc-sampling+'];
const FREE_BY = ['2.0', '2.5', '3.0', '4.0'];
const WHY = {
  'by-nc': 'NonCommercial: a film is commercial use',
  'by-nd': 'NoDerivatives: trimming a sound and syncing it to picture are derivatives',
  'by-sa': 'ShareAlike: the whole piece would have to be released under the same licence',
  'by-nc-sa': 'NonCommercial and ShareAlike: a film is commercial use, and would have to be released under the same licence',
  'by-nc-nd': 'NonCommercial and NoDerivatives: a film is commercial use, and trimming is a derivative',
  'sampling+': 'Sampling+ is a retired licence that restricts use',
  'nc-sampling+': 'NonCommercial Sampling+ is a retired licence that restricts use',
};

const clean = (v) => (v == null ? '' : String(v).trim());

/** "CC BY-NC 4.0": a licence code and version as a person reads them. */
function nameOf(code, version) {
  if (code === 'cc0') return `CC0 ${version ?? '1.0'}`;
  if (code === 'pdm') return `Public Domain Mark ${version ?? '1.0'}`;
  if (code === 'sampling+' || code === 'nc-sampling+') return `${code === 'sampling+' ? 'Sampling+' : 'NC-Sampling+'}${version ? ` ${version}` : ''}`;
  return `CC ${code.toUpperCase()}${version ? ` ${version}` : ''}`;
}

/** Openverse's `license` and `license_version` for an item: { code, version, known, free, name, reason }. */
export function classify(row) {
  const code = clean(row?.license).toLowerCase();
  const version = clean(row?.license_version) || null;
  if (!code) return { code: null, version, known: false, free: false, name: null, reason: 'no licence field: an item with no licence is refused' };
  if (!OPENVERSE_LICENCES.includes(code)) return { code: null, version, known: false, free: false, name: null, reason: `"${code.slice(0, 40)}" is not a licence this recognises` };
  const name = nameOf(code, version);
  if (code === 'cc0' || code === 'pdm') return { code, version, known: true, free: true, name, reason: null };
  if (code === 'by') {
    if (FREE_BY.includes(version ?? '')) return { code, version, known: true, free: true, name, reason: null };
    return { code, version, known: true, free: false, name, reason: `CC BY ${version ?? 'of no stated version'} is outside 2.0 to 4.0: confirm it on the item's page` };
  }
  return { code, version, known: true, free: false, name, reason: WHY[code] };
}

/** The `licence` string of a record for an Openverse code and version. */
export function recordLicence(code, version) {
  if (code === 'cc0') return 'CC0-1.0';
  if (code === 'pdm') return 'public domain';
  if (code === 'sampling+' || code === 'nc-sampling+') return `${code.toUpperCase()}-${version ?? '1.0'}`;
  return `CC-${code.toUpperCase()}${version ? `-${version}` : ''}`;
}

/** A record's licence read back into the same classification (what `recordLicence` wrote, or the words a person typed). */
export function recordClass(record) {
  const text = clean(record?.licence).toLowerCase().replace(/[\s_]+/g, '-');
  let code = null, tail = null;
  if (/^cc0/.test(text)) code = 'cc0';
  else if (/^(public-domain|pdm)/.test(text)) code = 'pdm';
  else {
    const m = /^(nc-sampling\+|sampling\+|(?:cc-)?by(?:-(?:nc|nd|sa))*)(?:-(\d(?:\.\d)?))?$/.exec(text);
    if (m) { code = m[1].replace(/^cc-/, ''); tail = m[2] ?? null; }
  }
  if (!code) return { code: null, version: null, known: false, free: false, name: null, reason: text ? `"${text.slice(0, 40)}" is not a licence this recognises` : 'no licence field: a record with no licence is refused' };
  return classify({ license: code, license_version: clean(record?.licenceVersion) || tail || (code === 'cc0' || code === 'pdm' ? '1.0' : null) });
}

/** The licences a piece offers: the style's `sound.licences` (default cc0, pdm, by), plus those the story names to accept. */
export function offered(style, story) {
  const accepted = [...(story?.audio?.acceptLicences ?? [])];
  const base = style?.sound?.licences ?? DEFAULT_LICENCES;
  return { codes: new Set([...base, ...accepted]), accepted, base };
}

/** May this item (an Openverse row or detail) be used here: { ok, accepted, reason, cls }. */
export function verdict(row, off) {
  const cls = classify(row);
  if (!cls.known) return { ok: false, accepted: false, reason: cls.reason, cls };
  if (cls.free) {
    if (off.codes.has(cls.code)) return { ok: true, accepted: false, reason: null, cls };
    return { ok: false, accepted: false, reason: `${cls.name} is outside the licences this piece offers (the style's sound.licences: ${off.base.join(', ')}); the story can add it in audio.acceptLicences`, cls };
  }
  if (off.accepted.includes(cls.code)) return { ok: true, accepted: true, reason: null, cls };
  return { ok: false, accepted: false, reason: `${cls.reason}; the story can accept ${cls.code} in audio.acceptLicences`, cls };
}

const sha1File = (file) => createHash('sha1').update(readFileSync(file)).digest('hex');

/** The sound records (JSON with an `openverseId`) in a folder: [{ file, record }]. */
function soundRecords(folder) {
  if (!existsSync(folder)) return [];
  const out = [];
  for (const name of readdirSync(folder).filter((n) => n.endsWith('.json')).sort()) {
    try {
      const record = JSON.parse(readFileSync(join(folder, name), 'utf8'));
      if (record && typeof record.openverseId === 'string') out.push({ file: join(folder, name), record });
    } catch { /* not a record */ }
  }
  return out;
}

/**
 * What is wrong with the Openverse records of the mapped samples: [{ cue, file, problem }]. `entries` is
 * sampleMap's [cue, { rel, file }] pairs. A record outside the licences the piece offers; a file whose sha1 is
 * no longer the one recorded; one recording (openverseId) under two licences across the records of the folders
 * the samples sit in, mapped or not.
 */
export function openverseProblems(entries, { story, style, dir }) {
  const off = offered(style, story);
  const found = [];
  const folders = new Set();
  for (const [cue, e] of entries) {
    folders.add(dirname(e.file));
    const r = readRecord(e.file);
    if (!r.ok || r.record.source !== 'openverse') continue;
    const cls = recordClass(r.record);
    const v = cls.known ? verdict({ license: cls.code, license_version: cls.version }, off) : { ok: false, reason: cls.reason };
    if (!v.ok) found.push({ cue, file: e.rel, problem: `the record's licence ${r.record.licence} is outside what this piece offers: ${v.reason}` });
    if (existsSync(e.file) && typeof r.record.sha1 === 'string' && sha1File(e.file) !== r.record.sha1) {
      found.push({ cue, file: e.rel, problem: 'the file is not the bytes the record hashed (sha1 differs): it was changed or replaced after it was fetched' });
    }
  }
  const byId = new Map();
  for (const folder of folders) {
    for (const { file, record } of soundRecords(folder)) {
      const c = recordClass(record);
      const key = c.known ? `${c.code}-${c.version ?? ''}` : `?${clean(record.licence)}`;
      if (!byId.has(record.openverseId)) byId.set(record.openverseId, new Map());
      const licences = byId.get(record.openverseId);
      if (!licences.has(key)) licences.set(key, []);
      licences.get(key).push(relative(dir, file));
    }
  }
  for (const [id, licences] of byId) {
    if (licences.size < 2) continue;
    const files = [...licences.values()].flat();
    found.push({ cue: null, file: files[0], problem: `recording ${id} carries two licences across records (${[...licences.entries()].map(([k, f]) => `${f.join(' ')}: ${k.replace(/^\?/, '')}`).join('; ')}): one recording has one licence` });
  }
  return found;
}
