// mm new --kind film|deck --style <preset|path> (--id <id> | --dir <folder>): scaffolds
// pieces/<id>/ (or <folder>, which must sit under the repo root so the kit can be served to it)
// from runtime/skeletons/<kind>/, copies the style in as style.json and its font files into
// assets/fonts/<family>/ with every `src` rewritten to a relative path, and a ground mark named by
// its repo path into assets/ground/ the same way (SPEC §8).
// piece.js imports the kit by a path computed here from where the piece lives.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT } from './lib/browser.mjs';
import { UsageError, fontFiles, resolveFontSrc, resolveStyle, runMain } from './lib/cli.mjs';

/** The skeleton's kit import, as written in runtime/skeletons/<kind>/piece.js. */
const SKELETON_KIT_IMPORT = /(from\s*['"])\.\.\/\.\.\/runtime\/kit\/kit\.js(['"])/;
const SKELETON_NOTE = /The import path assumes the piece lives at pieces\/<id>\/ \(as `mm new` places it\)\./;

/** The import specifier for the kit from a piece in `dir`: relative, forward-slashed, always starting with ./ or ../ */
export function kitSpecifier(dir, root = ROOT) {
  const rel = relative(dir, join(root, 'runtime/kit/kit.js')).split(sep).join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

export function newPiece({ kind, style: styleArg, id, dir: dirArg, root = ROOT }) {
  if (!['film', 'deck'].includes(kind)) throw new UsageError('--kind must be film or deck');
  if (!id && dirArg) id = basename(resolve(dirArg)).toLowerCase();
  if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new UsageError(dirArg ? `--id is required when the folder name is not lowercase letters, digits and hyphens: ${basename(resolve(dirArg))}` : '--id is required: lowercase letters, digits and hyphens');
  if (!styleArg) throw new UsageError('--style is required: a preset name from styles/presets/ (editorial, blueprint, …) or a path to a style.json');
  const skeleton = join(root, 'runtime/skeletons', kind);
  if (!existsSync(skeleton)) throw new UsageError(`no skeleton at ${skeleton}`);
  const dir = dirArg ? (isAbsolute(dirArg) ? dirArg : resolve(process.cwd(), dirArg)) : join(root, 'pieces', id);
  if (dirArg) {
    const inside = relative(root, dir);
    if (inside.startsWith('..') || isAbsolute(inside) || inside === '') throw new UsageError(`--dir must be a new folder inside the repo (${root}): the kit and patterns are served from the repo root, so a piece outside it cannot open`);
  }
  if (existsSync(dir)) throw new UsageError(dirArg ? `${dirArg} already exists; pick another --dir` : `pieces/${id} already exists; pick another --id`);

  const styleFile = resolveStyle(styleArg);
  const style = JSON.parse(readFileSync(styleFile, 'utf8'));
  const sources = fontFiles(style).map(({ family, file }) => ({ file, abs: resolveFontSrc(file.src, styleFile), family }));   // fails before anything is written

  cpSync(skeleton, dir, { recursive: true });
  for (const entry of sources) {
    const { file, abs, family } = entry;
    const rel = `assets/fonts/${family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${basename(abs)}`;
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    copyFileSync(abs, join(dir, rel));
    file.src = rel;
    entry.rel = rel;   // each role records its own copy; two roles may share one file (linen uses Manrope for display and text)
  }
  // Each family's licence travels with its files.
  for (const { abs, rel } of sources) {
    const lic = join(abs, '..', 'LICENSE.txt');
    const target = join(dir, rel, '..', 'LICENSE.txt');
    if (existsSync(lic) && !existsSync(target)) { mkdirSync(join(target, '..'), { recursive: true }); copyFileSync(lic, target); }
  }
  // A ground mark the style names by its repo path travels with the piece, like its font files.
  const mark = style.ground?.mark;
  if (mark?.src?.startsWith('styles/') && existsSync(join(root, mark.src))) {
    const rel = `assets/ground/${basename(mark.src)}`;
    mkdirSync(join(dir, 'assets/ground'), { recursive: true });
    copyFileSync(join(root, mark.src), join(dir, rel));
    mark.src = rel;
  }
  writeFileSync(join(dir, 'style.json'), JSON.stringify(style, null, 2) + '\n');
  const pieceJs = join(dir, 'piece.js');
  const js = readFileSync(pieceJs, 'utf8');
  if (!SKELETON_KIT_IMPORT.test(js)) throw new UsageError(`${pieceJs} (from the skeleton) has no kit import to point at runtime/kit/kit.js`);
  writeFileSync(pieceJs, js.replace(SKELETON_KIT_IMPORT, `$1${kitSpecifier(dir, root)}$2`).replace(SKELETON_NOTE, 'The kit import below was written by `mm new` for where this piece lives; if the folder moves, fix it.'));
  const storyFile = join(dir, 'story.json');
  const story = JSON.parse(readFileSync(storyFile, 'utf8'));
  story.id = id;
  writeFileSync(storyFile, JSON.stringify(story, null, 2) + '\n');
  return dir;
}

runMain(import.meta, async () => {
  const { values } = parseArgs({ options: { kind: { type: 'string' }, style: { type: 'string' }, id: { type: 'string' }, dir: { type: 'string' } } });
  const dir = newPiece(values);
  console.log(`created ${dir}\n  next: node scripts/mm.mjs serve ${values.dir ?? values.id}`);
  return 0;
});
