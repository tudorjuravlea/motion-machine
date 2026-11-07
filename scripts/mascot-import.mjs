#!/usr/bin/env node
// `mm brand mascot <file.svg> --brand <path> [--as <name>] [--out <path>] [--json]`: imports a
// mascot drawn in any vector tool into a brand half (scripts/lib/mascot-map.mjs reads the layers;
// SPEC §3 has the contract). Without --as the drawing becomes the brand's main character; with
// --as it joins the brand's cast under that name. Before writing, the brand must validate and the
// rig must accept every view inside the box; otherwise nothing is written and it exits 1.
// It prints what it found, how each colour was mapped, what it guessed and what it skipped.
// Exit 0 written (warnings allowed), 1 a drawing it cannot use, 2 usage.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { validators } from './lib/validate.mjs';
import { importMascot } from './lib/mascot-map.mjs';
import { UsageError, runMain, usageText } from './lib/cli.mjs';
import { resolveMascot } from '../runtime/kit/rig.js';

const explain = (v) => (v.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

export async function main(argv = process.argv.slice(2)) {
  const { values: a, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: { brand: { type: 'string' }, as: { type: 'string' }, out: { type: 'string' }, json: { type: 'boolean' } } });
  if (!a.brand) throw new UsageError(`--brand is required\n${usageText('brand mascot')}`);
  const svgFile = positionals[0];
  if (!svgFile || !/\.svg$/i.test(svgFile)) throw new UsageError(`give the mascot drawing as an .svg file\n${usageText('brand mascot')}`);
  if (a.as !== undefined && !/^[a-z][a-z0-9-]{0,31}$/.test(a.as)) throw new UsageError(`--as takes a plain name (lower case letters, digits, hyphens), not "${a.as}"`);
  const src = resolve(svgFile), brandFile = resolve(a.brand), out = resolve(a.out ?? a.brand);
  if (!existsSync(src)) throw new UsageError(`drawing not found: ${svgFile}`);
  if (!existsSync(brandFile)) throw new UsageError(`brand half not found: ${a.brand}`);
  const brand = JSON.parse(readFileSync(brandFile, 'utf8'));
  if (a.as && !brand.mascot?.views?.front) throw new UsageError(`the brand has no main character yet: import one without --as first, then add ${a.as} to its cast`);

  let r;
  try { r = importMascot(readFileSync(src, 'utf8'), brand); } catch (e) {
    if (e.exitCode === 1) { console.error(`mm brand mascot: ${e.message}`); return 1; }
    throw e;
  }
  const next = structuredClone(brand);
  if (a.as) next.mascot.cast = { ...(next.mascot.cast ?? {}), [a.as]: r.mascot };
  else next.mascot = { ...r.mascot, ...(brand.mascot?.cast ? { cast: brand.mascot.cast } : {}) };
  const v = validators();
  if (!v.brand(next)) { console.error(`mm brand mascot: the imported mascot does not fit the brand schema: ${explain(v.brand)}`); return 1; }
  const issues = resolveMascot({ color: next.color, mascot: next.mascot }, a.as).issues;
  if (issues.length) { console.error(`mm brand mascot: the rig refuses the drawing: ${issues.join('; ')}`); return 1; }
  writeFileSync(out, `${JSON.stringify(next, null, 2)}\n`);

  if (a.json) { console.log(JSON.stringify({ out, as: a.as ?? null, ...r }, null, 2)); return 0; }
  const s = r.summary;
  console.log(`wrote ${a.out ?? a.brand}: ${a.as ? `cast member "${a.as}"` : 'the main character'} from ${svgFile}`);
  console.log(`  views ${s.views.join(', ')}; box ${r.mascot.box.join(' x ')} u${s.float ? `; float ${s.float} u` : ''}`);
  console.log(`  face: ${s.face}; limbs: ${s.limbs.length ? s.limbs.join(', ') : 'none'}; extra parts: ${s.extras.length ? s.extras.join(', ') : 'none'}`);
  for (const c of s.colors) console.log(`  colour ${c}`);
  for (const n of r.notes) console.log(`  note: ${n}`);
  for (const w of r.warnings) console.log(`  warning: ${w}`);
  return 0;
}

runMain(import.meta, main);
