#!/usr/bin/env node
// `mm sound fetch <openverse id> --piece <dir> --name <name> [--cue <cue>] [--yes]`   (SPEC §9)
//
//   id ──► GET /v1/audio/{id}/ ──► the licence judged on THIS answer (never a search row) ──► the plan:
//          URL, size, licence, where it lands ──► exit 3 until --yes ──► the file (https only, held, sniffed, hashed)
//   ──► <piece>/assets/sounds/<name>.<ext> and <name>.json (contracts/sound-sample.schema.json, plus the Openverse
//       fields: openverseId, licence and version, licenceUrl, creator, creatorUrl, landingUrl, Openverse's own
//       attribution line, retrieved, sha1) ──► with --cue: story.json `audio.samples` through the story-edit service.
//
// The licence rules are Earshot's, restated (scripts/lib/sound-licence.mjs): CC0, public domain, CC BY 2.0 to 4.0;
// anything else is refused unless the story names it in `audio.acceptLicences`; an item with no licence field is
// refused; the style's `sound.licences` can narrow what is offered. Nothing is written for a refused item, a failed
// download, or a file that is not the sound it says it is. A name already taken is never overwritten. The words in the
// plan came from outside, so they are printed fenced. Exit 0 done, 1 refused or failed, 2 usage, 3 a plan waits for --yes.
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { UsageError, isArgsError, usageText } from './lib/cli.mjs';
import { fenceLine } from './lib/fence.mjs';
import { resilientFetch } from './lib/http.mjs';
import { findKey, scrub } from './lib/gen/keys.mjs';
import { OpenverseError, detailUrl, downloadBytes, filetypeOf, getJson, publicHost, readPiece, recordFrom, sniff } from './lib/openverse.mjs';
import { offered, verdict } from './lib/sound-licence.mjs';
import { editStory, readStory } from './lib/story-edit.mjs';

const OPTIONS = { piece: { type: 'string' }, name: { type: 'string' }, cue: { type: 'string' }, yes: { type: 'boolean' } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const CUE = /^[a-z][a-z0-9-]{0,30}$/;
const refuse = (message) => new OpenverseError(`refused: ${message}`);

export async function main(argv, io = {}) {
  const env = io.env ?? process.env, secrets = new Set(), cwd = io.cwd ?? process.cwd();
  const out = (s) => (io.out ?? console.log)(scrub(s, secrets));
  const err = (s) => (io.err ?? console.error)(scrub(s, secrets));
  const doFetch = resilientFetch(io.fetch ?? globalThis.fetch, { sleep: io.sleep });
  try {
    const { values: v, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: OPTIONS });
    if (positionals.length !== 1) throw new UsageError('mm sound fetch takes one Openverse id');
    const id = positionals[0].toLowerCase();
    if (!UUID.test(id)) throw new UsageError(`${positionals[0]} is not an Openverse id (a UUID, the first column of mm sound find)`);
    if (!v.piece) throw new UsageError('mm sound fetch needs --piece <dir>');
    if (!v.name) throw new UsageError('mm sound fetch needs --name <name>');
    if (!NAME.test(v.name)) throw new UsageError('--name is lowercase letters, digits and hyphens');
    if (v.cue !== undefined && !CUE.test(v.cue)) throw new UsageError('--cue is a cue name: lower-case letters, digits and hyphens, starting with a letter');
    const pieceDir = resolve(cwd, v.piece);
    const { style, story } = readPiece(pieceDir);
    const soundsDir = join(pieceDir, 'assets', 'sounds');
    const taken = ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'json'].map((x) => join(soundsDir, `${v.name}.${x}`)).find((f) => existsSync(f));
    if (taken) throw new UsageError(`assets/sounds/${v.name}.${taken.split('.').pop()} is already there: choose another --name (a sound is never overwritten)`);

    const key = findKey('openverse', { env, home: io.home });
    if (key) secrets.add(key.value);
    const detail = await getJson(detailUrl(id), { fetch: doFetch, token: key?.value ?? null });
    if (String(detail.id).toLowerCase() !== id) throw new OpenverseError(`Openverse answered for another item (${String(detail.id).slice(0, 40)}), not ${id}`);

    const off = offered(style, story);
    const ruling = verdict(detail, off);
    if (!ruling.ok) throw refuse(`${ruling.reason}. Nothing was downloaded or written`);
    const type = filetypeOf(detail);
    if (!type) throw refuse(`the file type ${JSON.stringify(String(detail.filetype ?? 'unknown').slice(0, 20))} cannot be mapped to a cue: a story takes wav, mp3, m4a, flac or ogg`);
    let url;
    try { url = new URL(String(detail.url)); } catch { throw refuse('the item has no file address'); }
    if (url.protocol !== 'https:') throw refuse(`the file is only fetched over https, and this address is ${url.protocol.replace(':', '')}`);

    if (!publicHost(url.hostname)) throw refuse(`the file is at ${url.hostname}, which is not a public address`);

    const target = `assets/sounds/${v.name}.${type}`;
    const size = Number.isFinite(Number(detail.filesize)) && detail.filesize != null ? `${detail.filesize} bytes` : 'unknown (the server did not say)';
    if (!v.yes) {
      out([
        'sound fetch plan (nothing is downloaded or written until --yes):',
        `  item     ${id}`,
        `  title    ${fenceLine(detail.title, 'title')}`,
        `  creator  ${fenceLine(detail.creator ?? '', 'creator')}`,
        `  licence  ${ruling.cls.name}${ruling.accepted ? ' (accepted by the story\'s audio.acceptLicences)' : ''}`,
        `  from     ${url.href}`,
        `  size     ${size}`,
        `  lands    ${target} and the record assets/sounds/${v.name}.json`,
        ...(v.cue ? [`  maps     cue ${v.cue} in story.json audio.samples`] : []),
        'Show this plan to the person; with their yes, run the same command again with --yes.',
      ].join('\n'));
      return 3;
    }

    const { bytes, sha1 } = await downloadBytes(url.href, { fetch: doFetch });
    const kind = sniff(bytes.subarray(0, 16));
    if (kind !== type) throw refuse(`the download is not a ${type} sound (its first bytes are ${kind ? `a ${kind} file's` : 'not those of a sound file'}); nothing was kept`);
    const retrieved = (io.now ? io.now() : new Date()).toISOString().slice(0, 10);
    const record = recordFrom(detail, { sha1, retrieved });
    mkdirSync(soundsDir, { recursive: true });
    const file = join(soundsDir, `${v.name}.${type}`), rec = join(soundsDir, `${v.name}.json`);
    try {
      writeFileSync(`${file}.partial`, bytes);
      renameSync(`${file}.partial`, file);
      writeFileSync(`${rec}.partial`, `${JSON.stringify(record, null, 2)}\n`);
      renameSync(`${rec}.partial`, rec);
    } catch (e) {
      for (const f of [`${file}.partial`, `${rec}.partial`, file, rec]) rmSync(f, { force: true });
      throw new OpenverseError(`could not write the sound (${e.code ?? e.message})`);
    }
    out(`wrote ${target} (${bytes.length} bytes) and assets/sounds/${v.name}.json: ${ruling.cls.name}, ${record.author}. Its credit is Openverse's line in the record; mm credits <piece> lists it.`);

    if (v.cue) {
      try {
        await editStory(pieceDir, { edits: [{ op: 'audio.sample', cue: v.cue, value: target }], version: readStory(pieceDir).version, who: 'cli', label: `map ${v.cue} to ${v.name}` });
        out(`mapped cue ${v.cue} to ${target} in story.json audio.samples (an undoable story edit)`);
      } catch (e) {
        throw new OpenverseError(`the sound is kept, but story.json was not changed (${e.message}). Map it by hand in audio.samples: "${v.cue}": "${target}"`);
      }
    }
    return 0;
  } catch (e) {
    if (isArgsError(e)) err(`${e.message}\n${usageText('sound fetch')}`);
    else if (e instanceof UsageError) err(`mm sound fetch: ${e.message}\n${usageText('sound fetch')}`);
    else err(process.env.MM_DEBUG === '1' ? String(e.stack ?? e) : `mm sound fetch: ${e.message}`);
    return isArgsError(e) ? 2 : e.exitCode ?? 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
