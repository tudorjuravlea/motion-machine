#!/usr/bin/env node
// mm media grade <picture> --name <n> --cube <grade.cube> [--piece <dir>]
// A still the brand brings (a photo, a product shot, a generated picture) graded with the brand's .cube
// (scripts/lib/cube.mjs) into <piece>/assets/<n>.png, a story's `asset` like any other, with a record
// <n>.grade.json beside it (the source and the grade, each with its sha1, and how far the grade moves
// colour). Transparency is kept. A licence record beside the source (<source>.licence.json) is copied to
// <n>.licence.json, since a grade changes no licence. A moving picture is footage: grade it with
// `mm media prep --cube`. The same picture and grade write the same bytes on one machine.
// Exit 0 written, 1 ffmpeg failed, 2 usage.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isArgsError, usageText } from './lib/cli.mjs';
import { probe, runFfmpeg } from './lib/ffmpeg.mjs';
import { loadCube, withGrade } from './lib/cube.mjs';

const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode });

export async function grade({ file, name, cube, piece = '.' }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(name))) throw fail('--name must be lowercase letters, digits and hyphens', 2);
  if (!existsSync(file)) throw fail(`no such file: ${file}`, 2);
  const g = loadCube(cube);
  let info;
  try { info = probe(file); } catch (e) { throw fail(`ffmpeg could not read ${basename(file)}: ${e.message.split('\n').pop()}`, 1); }
  const v = info.streams?.find((s) => s.codec_type === 'video');
  if (!v) throw fail(`ffmpeg could not read ${basename(file)} as a picture`, 1);
  if (Number(v.nb_read_frames) > 1) throw fail(`${basename(file)} is a moving picture: grade footage with mm media prep --cube`, 2);
  const dir = join(resolve(piece), 'assets');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${name}.png`);
  const alpha = /a/.test(String(v.pix_fmt));   // rgba, ya8, yuva…, pal8: a picture that may hold transparency keeps it
  try {
    await withGrade(g.path, (steps) => runFfmpeg(['-i', file, '-vf', steps, '-frames:v', '1', '-update', '1', '-map_metadata', '-1', out]), { alpha });
  } catch (e) { rmSync(out, { force: true }); throw fail(`ffmpeg could not grade ${basename(file)}: ${String(e.message).trim().split('\n').slice(-2).join(' ')}`, 1); }
  const record = { kind: 'graded still', w: v.width, h: v.height, source: { file: basename(file), sha1: createHash('sha1').update(readFileSync(file)).digest('hex') }, grade: g.record };
  writeFileSync(join(dir, `${name}.grade.json`), `${JSON.stringify(record, null, 2)}\n`);
  const licence = `${file.replace(/\.[^./\\]+$/, '')}.licence.json`;
  const copied = existsSync(licence);
  if (copied) copyFileSync(licence, join(dir, `${name}.licence.json`));
  return { out, record, licence: copied };
}

export async function main(argv) {
  try {
    const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      name: { type: 'string' }, cube: { type: 'string' }, piece: { type: 'string' } } });
    if (p.length !== 1 || !v.name || !v.cube) throw fail(usageText('media grade'), 2);
    const { out, record, licence } = await grade({ file: p[0], name: v.name, cube: v.cube, piece: v.piece });
    const s = record.grade.strength;
    console.log(`wrote ${out} (${record.w}x${record.h}), graded with ${record.grade.file} (moves colour by ${s.max} at most, ${s.mean} on average), and ${basename(out, '.png')}.grade.json${licence ? ', with the source\'s licence record' : '; no licence record beside the source: write assets/' + basename(out, '.png') + '.licence.json'}`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('media grade')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
