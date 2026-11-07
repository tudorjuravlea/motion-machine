#!/usr/bin/env node
// mm footage audit <dir> [--source <video>] [--edit <video>] [--style <style.json>]
// <dir> holds cuts.approved.json (the director's file) or, when there is none, cuts.proposed.json. Writes
// <dir>/audit.html: kept time (canvas) and cut time (accent) on one timeline over the source, the source
// and the edit side by side, a click on a cut playing the removed span with a second of context either
// side, and the 20 largest removals with their reasons. Self-contained and local: no CDN, the videos are
// linked by relative path (never copied), every string from the cuts file is escaped. --style takes a
// style.json for the page's colours (the palette roles); without one the page is neutral.
// Exit 0 written, 2 usage.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isArgsError, usageText } from './lib/cli.mjs';
import { probe } from './lib/ffmpeg.mjs';
import { auditModel, auditPage } from './lib/footage-audit-page.mjs';

const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode });
const readJson = (file, what) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw fail(`${what}: cannot read ${file}: ${e.message}`, 2); } };
/** A path from the page's folder to a media file, as a URL path. */
const href = (dir, file) => relative(dir, resolve(file)).split(sep).map(encodeURIComponent).join('/');

export function audit({ dir, source = null, edit = null, style = null }) {
  const folder = resolve(dir);
  const approved = join(folder, 'cuts.approved.json'), proposed = join(folder, 'cuts.proposed.json');
  const file = existsSync(approved) ? approved : existsSync(proposed) ? proposed : null;
  if (!file) throw fail(`no cuts.approved.json or cuts.proposed.json in ${dir}: run mm footage review first`, 2);
  for (const [flag, p] of [['--source', source], ['--edit', edit]]) if (p && !existsSync(p)) throw fail(`${flag}: no such file: ${p}`, 2);
  const doc = readJson(file, 'cuts');
  if (!Array.isArray(doc) && !Array.isArray(doc?.cuts)) throw fail(`${file} is no cuts file: it needs a "cuts" list`, 2);
  let duration = null;
  if (source) { try { duration = Number(probe(source).format?.duration) || null; } catch { duration = null; } }
  const model = auditModel(doc, { duration, approvedFile: file === approved });
  const colors = style ? readJson(style, '--style').color ?? {} : {};
  const html = auditPage(model, { source: source ? href(folder, source) : null, edit: edit ? href(folder, edit) : null, colors });
  const out = join(folder, 'audit.html');
  writeFileSync(out, html);
  return { out, model, from: file };
}

export async function main(argv) {
  try {
    const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      source: { type: 'string' }, edit: { type: 'string' }, style: { type: 'string' } } });
    if (p.length !== 1) throw fail(usageText('footage audit'), 2);
    const { out, model, from } = audit({ dir: p[0], source: v.source ?? null, edit: v.edit ?? null, style: v.style ?? null });
    const n = model.cuts.filter((c) => c.state !== 'declined').length;
    console.log(`${n} cuts removing ${model.removed} s of ${model.duration} s (${model.edit} s kept), from ${from.endsWith('approved.json') ? 'cuts.approved.json' : 'cuts.proposed.json'}`);
    console.log(`wrote ${out}`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('footage audit')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
