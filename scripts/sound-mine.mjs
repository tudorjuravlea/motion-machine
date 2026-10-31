#!/usr/bin/env node
// `mm sound mine <folder-of-audio | video | file> --out <dir> [--name <profile>] [--licence <terms> | --own] [--source <text>] [--author <name>]` (SPEC §9).
//
//   every audio or video file ──► decoded to stereo 48 kHz ──► split into its sounds by onset (scripts/beats.mjs) ──►
//   each sound measured (scripts/lib/audio-measure.mjs: duration, peak, loudest-100 ms and integrated K-weighted
//   loudness, attack, T60, centroid, roll-off, flatness, side/mid, partials as ratios, pitch if tonal) ──►
//   <out>/records/<id>.json   one record per sound, with its source, licence and author
//   <out>/sounds/<id>.wav     the sound, cut out
//   <out>/<name>.profile.json the fitted sound profile (contracts/sound-profile.schema.json), carrying every source
//   <out>/mine.html           a listen page: a player for each sound, the measurements beside it
//
// The licence rule: a sound that is not your own recording needs its terms written down. `--licence` is required unless
// `--own` says every file is your own recording; a file with a record beside it (x.wav, x.json: source, licence,
// author) keeps its own. The records and the profile keep source, licence and author, and a clone made from the
// profile carries them in its card. Nothing is copied from the sources but numbers and the cut-out sounds in --out.
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { UsageError, runMain, usageText } from './lib/cli.mjs';
import { assertTools } from './lib/ffmpeg.mjs';
import { decodeStereo } from './lib/audio-decode.mjs';
import { analyseSound, findInputs, fitProfile, profileName, splitSounds } from './lib/sound-mine.mjs';
import { readRecord } from './lib/sound-sample.mjs';
import { validators } from './lib/validate.mjs';
import { CSS, esc, wavOf } from './sound-listen.mjs';

const SR = 48000;
const round = (x, p = 1) => (Number.isFinite(x) ? Math.round(x * 10 ** p) / 10 ** p : x);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sound';

/** The provenance of one input file: its own record when it has a valid one, else the command's. Null when no licence is known. */
function provenanceOf(file, { licence, source, author, own }) {
  const rec = readRecord(file);
  if (rec.ok) return { source: rec.record.source, licence: rec.record.licence, author: rec.record.author };
  if (own) return { source: source ?? 'own recording', licence: 'own recording', author: author ?? 'own recording' };
  if (!licence) return null;
  return { source: source ?? basename(file), licence, author: author ?? 'unknown' };
}

/**
 * Mines `input` into `out`. Returns { out, name, records, profile, page, files }. Throws UsageError for a missing licence or an empty input.
 * `log` receives a line per file.
 */
export async function mineSounds({ input, out, name, licence = null, source = null, author = null, own = false, log = () => {} }) {
  const root = resolve(input);
  const files = findInputs(root);
  if (!files.length) throw new UsageError(`no audio or video file under ${input}`, 1);
  const prov = new Map(files.map((f) => [f, provenanceOf(f, { licence, source, author, own })]));
  const bare = files.filter((f) => !prov.get(f));
  if (bare.length) {
    throw new UsageError(`${bare.length} file${bare.length === 1 ? ' has' : 's have'} no licence (${bare.slice(0, 3).map((f) => relative(process.cwd(), f)).join(', ')}${bare.length > 3 ? ', …' : ''}): pass --licence "<terms>", or --own for your own recording, or put a record (x.json: source, licence, author) beside each file`, 2);
  }
  out = resolve(out);
  const base = name ?? profileName(basename(out));
  mkdirSync(join(out, 'sounds'), { recursive: true });
  mkdirSync(join(out, 'records'), { recursive: true });
  const dirRoot = root === files[0] ? dirname(root) : root;
  const records = [];
  const used = new Set();
  for (const file of files) {
    const rel = relative(dirRoot, file);
    const stem = slug(rel.slice(0, rel.length - extname(rel).length));
    const [L, R] = await decodeStereo(file, SR);
    const sounds = splitSounds([L, R], SR);
    log(`${rel}: ${sounds.length} sound${sounds.length === 1 ? '' : 's'}`);
    sounds.forEach((s, i) => {
      let id = sounds.length === 1 ? stem : `${stem}-${String(i + 1).padStart(2, '0')}`;
      for (let k = 2; used.has(id); k++) id = `${stem}-${k}`;
      used.add(id);
      const a = analyseSound(s.channels, SR);
      const p = prov.get(file);
      const record = { id, file: rel.split('\\').join('/'), startS: round(s.from / SR, 3), endS: round(s.to / SR, 3), wav: `sounds/${id}.wav`, ...p, ...a };
      writeFileSync(join(out, record.wav), wavOf(s.channels, SR));
      writeFileSync(join(out, 'records', `${id}.json`), `${JSON.stringify(record, null, 2)}\n`);
      records.push(record);
    });
  }
  if (!records.length) throw new UsageError(`no sound found in ${input}`, 1);
  const profile = fitProfile(records, { name: base });
  const v = validators();
  if (!v.soundProfile(profile)) throw new Error(`the fitted profile does not validate: ${(v.soundProfile.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);
  writeFileSync(join(out, `${base}.profile.json`), `${JSON.stringify(profile, null, 2)}\n`);
  const page = join(out, 'mine.html');
  writeFileSync(page, minePage(records, profile));
  return { out, name: base, records, profile, page, files };
}

function minePage(records, p) {
  const num = (r) => `<div class="nums">length <b>${round(r.lengthS, 2)}</b> s (${r.family}) · attack <b>${r.attackS == null ? 'n/a' : round(r.attackS * 1000)}</b> ms · T60 <b>${r.t60S == null ? 'n/a' : round(r.t60S, 2)}</b> s<br>
loudest 100 ms <b>${r.lufs100ms}</b> LUFS · whole ${r.lufsIntegrated} LUFS · peak <b>${r.peakDbfs}</b> dBFS<br>
centroid <b>${Math.round(r.centroidHz)}</b> Hz · roll-off ${Math.round(r.rolloffHz)} Hz · flatness ${r.flatness} · side/mid ${r.sideMidDb == null ? 'mono' : `${r.sideMidDb} dB`}<br>
${r.tonal ? `tonal: pitch <b>${r.pitchHz} Hz</b> (${(r.pitchClasses ?? []).join(' ') || '–'}) · material ${r.mode} · partials ${r.partials.length ? r.partials.map((q) => `${q[0]}:${q[1]} dB`).join(' ') : 'none'}` : 'noise or knock: no pitch'}${r.room ? `<br>room tail: ${r.room.sizeS} s at ${r.room.send} dB` : ''}</div>`;
  const rows = records.map((r) => `<tr><td class="name"><b>${esc(r.id)}</b><span>${esc(r.file)} ${r.startS}-${r.endS} s</span><br><span>${esc(r.licence)}${r.author ? `, ${esc(r.author)}` : ''}</span></td><td><audio controls preload="none" src="${esc(r.wav)}"></audio>${num(r)}</td></tr>`);
  const fit = `<div class="nums">register: centre up to <b>${p.register.maxCentreHz}</b> Hz, floor <b>${p.register.minHz}</b> Hz, ${p.register.tones} tones · key ${p.key.length ? p.key.join(' ') : 'no constraint'} · material <b>${p.modes}</b><br>
attack ${p.envelope.attackS.map((x) => round(x * 1000, 2)).join('-')} ms · T60 input ${p.envelope.t60.input.join('-')} s, surface ${p.envelope.t60.surface.join('-')} s, outcome ${p.envelope.t60.outcome.join('-')} s<br>
level <b>${p.loudness.cueLufs100ms}</b> LUFS ± ${p.loudness.tolDb} dB, peak under ${p.loudness.peakDbfs} dBFS · room ${p.room.send} dB, ${p.room.sizeS} s, ${p.room.lowpassHz} Hz · side/mid ${p.stereo.sideMidDb} dB</div>`;
  const sources = (p.sources ?? []).map((s) => `<li>${esc(s.source)}: ${esc(s.licence)}${s.author ? `, ${esc(s.author)}` : ''}</li>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mined sounds: ${esc(p.name)}</title><style>${CSS}</style></head>
<body><main>
<h1>Mined sounds: ${esc(p.name)}</h1>
<p class="lead">${records.length} sound${records.length === 1 ? '' : 's'} cut out of the recordings, each measured by the sound system's own measurer. The profile below is what the set has in common; <code>mm sound clone --profile ${esc(p.name)}.profile.json</code> makes a new cue in that style.</p>
<h2>The fitted profile</h2>${fit}<h2>Sources</h2><ul>${sources}</ul>
<h2>The sounds</h2><table><thead><tr><th>Sound</th><th>Listen, and what was measured</th></tr></thead><tbody>${rows.join('\n')}</tbody></table>
</main></body></html>
`;
}

runMain(import.meta, async () => {
  let a;
  try {
    a = parseArgs({ allowPositionals: true, strict: true, options: { out: { type: 'string' }, name: { type: 'string' }, licence: { type: 'string' }, own: { type: 'boolean', default: false }, source: { type: 'string' }, author: { type: 'string' } } });
  } catch (e) { throw new UsageError(`${e.message}\n${usageText('sound mine')}`, 2); }
  const { values, positionals } = a;
  if (positionals.length !== 1 || !values.out) throw new UsageError(usageText('sound mine'), 2);
  if (values.name && profileName(values.name) !== values.name) throw new UsageError(`--name ${values.name}: a profile name is lowercase letters, digits and hyphens, starting with a letter (2 to 41 characters)`, 2);
  assertTools();
  const res = await mineSounds({ input: positionals[0], out: values.out, name: values.name, licence: values.licence, source: values.source, author: values.author, own: values.own, log: () => {} });
  console.log(`sound mine: ${res.records.length} sound${res.records.length === 1 ? '' : 's'} from ${res.files.length} file${res.files.length === 1 ? '' : 's'} -> ${relative(process.cwd(), res.page) || res.page} and ${res.name}.profile.json`);
  return 0;
});
