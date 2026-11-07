// `mm brand init <folder> [--from <shipped-brand-name|path-to-brand.json>] [--name <name>]`: makes a brand's
// own folder at any path. The folder holds the brand half (brand.json), the fonts it names with their licences,
// its ground mark, empty places for the logo and the sources, a notes file, a facts table and the projects made
// for it. The engine reads the folder by path; nothing of the brand lives in the repository.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { validators } from './lib/validate.mjs';
import { ROOT } from './lib/browser.mjs';
import { PRIVATE_DIR, UsageError, findFontSrc, findMarkSrc, fontFiles, runMain, slug } from './lib/cli.mjs';

const FACTS_TEMPLATE = join(ROOT, 'skill', 'templates', 'brand-skill', 'facts.md');
const familyDir = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** A shipped brand name, a captured half in the private brands folder, or a path to a brand half → its file. */
export function brandSource(ref, cwd = process.cwd()) {
  if (/[\\/]|\.json$/.test(ref)) {
    const file = resolve(cwd, ref);
    if (!existsSync(file) || !statSync(file).isFile()) throw new UsageError(`brand half not found: ${ref}`);
    return file;
  }
  const cands = [join(ROOT, 'styles', 'brands', `${ref}.json`), join(ROOT, PRIVATE_DIR, 'brands', `${ref}.json`)];
  const file = cands.find((c) => existsSync(c));
  if (!file) throw new UsageError(`brand half not found: ${ref} (looked in styles/brands/ and the private brands folder; a half elsewhere is passed as its .json path)`);
  return file;
}

const notesText = (name) => `# ${name}

This folder is the brand's own. The engine reads it by path; none of it goes into the engine's repository.

- \`brand.json\`: the brand half (colour roles, type, scale, ground, bans, allow). Edit it here.
- \`fonts/\`: the font files it names, each family with its licence.
- \`ground/\`: the ground mark, when the brand has one.
- \`logo/\`, \`sources/\`: the logo and what the brand was read from.
- \`facts.md\`: every number and claim a piece may show, with its source.
- \`projects/\`: films and decks made for this brand, one folder each.

Make a project and render it:

\`\`\`
mm project new <name> --brand <this folder> --kind film|deck
mm project make <this folder>/projects/<name>
\`\`\`

A change to \`brand.json\` reaches the next render. \`mm style compose --brand <this folder>/brand.json --motion <name> --out <style.json>\` composes a style by hand.
`;

/** Makes the brand folder; returns { dir, brand }. Writes nothing when anything is wrong. */
export function initBrand({ folder, from = 'paper', name, cwd = process.cwd() }) {
  const dir = resolve(cwd, folder);
  if (existsSync(dir) && (!statSync(dir).isDirectory() || readdirSync(dir).length)) throw new UsageError(`${dir} is not empty; name a new folder, or an empty one`);
  const halfFile = brandSource(from, cwd);
  const brand = JSON.parse(readFileSync(halfFile, 'utf8'));
  brand.fictional = false;
  brand.name = name ?? slug(basename(dir));

  // everything the half names is found first, so a missing file stops the command before a folder exists
  const fonts = new Map();   // destination (relative to the folder) -> source file
  for (const { family, file } of fontFiles(brand)) {
    const abs = findFontSrc(file.src, halfFile);
    if (!abs) throw new UsageError(`font file missing: ${file.src} (named by ${halfFile})`);
    const rel = `fonts/${familyDir(family)}/${basename(abs)}`;
    fonts.set(rel, abs);
    file.src = rel;
  }
  let mark = null;
  if (brand.ground?.mark?.src) {
    const abs = findMarkSrc(brand.ground.mark.src, halfFile);
    if (!abs) throw new UsageError(`the ground mark is missing: ${brand.ground.mark.src} (named by ${halfFile})`);
    mark = { rel: `ground/${basename(abs)}`, abs };
    brand.ground.mark.src = mark.rel;
  }
  const v = validators();
  if (!v.brand(brand)) throw new UsageError(`the brand would be invalid: ${(v.brand.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);

  const unlicensed = new Set();
  for (const [rel, abs] of fonts) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    copyFileSync(abs, join(dir, rel));
    const licence = join(dirname(abs), 'LICENSE.txt');
    const target = join(dir, dirname(rel), 'LICENSE.txt');
    if (existsSync(licence)) { if (!existsSync(target)) copyFileSync(licence, target); } else unlicensed.add(dirname(rel));
  }
  if (mark) { mkdirSync(join(dir, 'ground'), { recursive: true }); copyFileSync(mark.abs, join(dir, mark.rel)); }
  for (const d of ['logo', 'sources', 'projects']) mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, 'brand.json'), `${JSON.stringify(brand, null, 2)}\n`);
  writeFileSync(join(dir, 'logo', 'README.md'), 'Put the brand\'s logo here as an SVG (logo.svg).\n');
  writeFileSync(join(dir, 'sources', 'README.md'), 'Put what this brand was read from here: the site URLs, DESIGN.md, a Figma export or stills.\n');
  writeFileSync(join(dir, 'notes.md'), notesText(brand.name));
  writeFileSync(join(dir, 'facts.md'), readFileSync(FACTS_TEMPLATE, 'utf8').replace('{{title}}', brand.name));
  return { dir, brand, unlicensed: [...unlicensed] };
}

runMain(import.meta, async () => {
  const { values, positionals } = parseArgs({ options: { from: { type: 'string' }, name: { type: 'string' } }, allowPositionals: true });
  if (positionals.length !== 1) throw new UsageError('name the brand folder: mm brand init <folder> [--from <shipped-brand-name|path-to-brand.json>] [--name <name>]');
  const { dir, brand, unlicensed } = initBrand({ folder: positionals[0], ...values });
  for (const d of unlicensed) console.error(`mm: no LICENSE.txt was found beside the fonts of ${d}/; add the licence there before anyone else gets this folder`);
  console.log(`created ${dir} (brand ${brand.name})\n  next: mm project new <name> --brand ${dir} --kind film|deck`);
  return 0;
});
