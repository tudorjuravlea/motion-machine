// mm new --kind film|deck --style <preset|path> (--id <id> | --dir <folder>): scaffolds
// pieces/<id>/ (or <folder>, which must sit under the repo root so the kit can be served to it)
// from runtime/skeletons/<kind>/, copies the style in as style.json and its font files into
// assets/fonts/<family>/ with every `src` rewritten to a relative path, and a ground mark named by
// its repo path or relative to the style file into assets/ground/ the same way (SPEC §8).
// piece.js imports the kit by a path computed here from where the piece lives.
// With no --style, --preset or --brand it picks the shipped preset used least among the last eight sibling
// pieces (ties by name) and says why, and it does not scaffold a hook layout that more than half of them opened on.
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT } from './lib/browser.mjs';
import { compose, resolveHalf } from './compose.mjs';
import { UsageError, findMarkSrc, fontFiles, resolveFontSrc, resolveStyle, runMain } from './lib/cli.mjs';

/** The skeleton's kit import, as written in runtime/skeletons/<kind>/piece.js. */
const SKELETON_KIT_IMPORT = /(from\s*['"])\.\.\/\.\.\/runtime\/kit\/kit\.js(['"])/;
const SKELETON_NOTE = /The import path assumes the piece lives at pieces\/<id>\/ \(as `mm new` places it\)\./;

/** The import specifier for the kit from a piece in `dir`: relative, forward-slashed, always starting with ./ or ../ */
export function kitSpecifier(dir, root = ROOT) {
  const rel = relative(dir, join(root, 'runtime/kit/kit.js')).split(sep).join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * Reads a style and finds every file it names, writing nothing: { style, sources, markFrom }.
 * Throws when a font file is missing.
 */
export function planStyle(styleFile, root = ROOT) {
  const style = JSON.parse(readFileSync(styleFile, 'utf8'));
  const sources = fontFiles(style).map(({ family, file }) => ({ file, abs: resolveFontSrc(file.src, styleFile), family }));
  const mark = style.ground?.mark;
  return { style, sources, markFrom: mark?.src ? findMarkSrc(mark.src, styleFile, root) : null };
}

/**
 * Puts a planned style into a piece folder: its font files into assets/fonts/<family>/ with every `src` rewritten
 * to a relative path, each family's licence beside its files, a ground mark into assets/ground/ the same way, and
 * style.json. The piece's own assets/fonts and assets/ground are replaced, so running it again refreshes them.
 */
export function installStyle(dir, { style, sources, markFrom }) {
  rmSync(join(dir, 'assets/fonts'), { recursive: true, force: true });
  rmSync(join(dir, 'assets/ground'), { recursive: true, force: true });
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
  // A ground mark the style names by its repo path, or relative to the style file, travels with the piece, like its font files.
  if (markFrom) {
    const rel = `assets/ground/${basename(markFrom)}`;
    mkdirSync(join(dir, 'assets/ground'), { recursive: true });
    copyFileSync(markFrom, join(dir, rel));
    style.ground.mark.src = rel;
  }
  writeFileSync(join(dir, 'style.json'), JSON.stringify(style, null, 2) + '\n');
}

/** Layouts the scaffold may open on: each takes a single headline beat, and reads as a hook. The first is the skeleton's own. */
export const HOOK_LAYOUTS = ['layouts/title-stack', 'layouts/statement', 'layouts/quote'];
const RECENT = 8;

/** Story files of the pieces in `root`: the tracked ones when it is a repository, else every folder under pieces/. */
function storyFiles(root) {
  if (existsSync(join(root, '.git'))) {
    try { return execFileSync('git', ['ls-files', '-z', 'pieces'], { cwd: root, encoding: 'utf8' }).split('\0').filter((f) => /^pieces\/[^/]+\/story\.json$/.test(f)).map((f) => join(root, f)); } catch { /* fall through */ }
  }
  const dir = join(root, 'pieces');
  return existsSync(dir) ? readdirSync(dir).map((d) => join(dir, d, 'story.json')).filter((f) => existsSync(f)) : [];
}

/**
 * The most recent pieces of `kind` in `root` (the last `n` stories by file time, newest first; the catalogue's
 * pieces are not looks anyone chose): [{ id, preset, layout }], the preset being the piece's style name and the
 * layout its first scene's.
 */
export function recentPieces(root, kind, n = RECENT) {
  const out = [];
  for (const file of storyFiles(root)) {
    if (/^catalogue/.test(basename(join(file, '..')))) continue;
    try {
      const story = JSON.parse(readFileSync(file, 'utf8'));
      if (story.kind !== kind) continue;
      let preset = null;
      try { preset = JSON.parse(readFileSync(join(file, '..', 'style.json'), 'utf8')).name ?? null; } catch { /* a piece without a style */ }
      out.push({ id: story.id ?? basename(join(file, '..')), preset, layout: story.scenes?.[0]?.layout ?? null, mtime: statSync(file).mtimeMs });
    } catch { /* an unreadable story is not history */ }
  }
  return out.sort((a, b) => b.mtime - a.mtime || (a.id < b.id ? -1 : 1)).slice(0, n).map(({ mtime, ...p }) => p);
}

const tally = (items, keys) => Object.fromEntries(keys.map((k) => [k, items.filter((x) => x === k).length]));
const leastUsed = (counts) => Object.keys(counts).sort().reduce((best, k) => (best == null || counts[k] < counts[best] ? k : best), null);

/**
 * The look for a piece that names none, from the recent pieces: the preset used least (ties by name) and a hook
 * layout that is not one more than half of them opened on. { preset, hookLayout, why, hookWhy }; deterministic.
 */
export function chooseLook(recent, { presets, defaultLayout = HOOK_LAYOUTS[0], hooks = HOOK_LAYOUTS }) {
  const used = tally(recent.map((p) => p.preset), [...presets].sort());
  const preset = leastUsed(used);
  const why = `${preset} used ${used[preset]} of the last ${recent.length} piece${recent.length === 1 ? '' : 's'}${recent.length ? `; most used: ${Object.entries(used).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0].join(' ')}` : ''}`;
  const opened = tally(recent.map((p) => p.layout), [...new Set([...hooks, ...recent.map((p) => p.layout).filter(Boolean)])]);
  const crowded = (l) => opened[l] * 2 > recent.length;
  let hookLayout = defaultLayout, hookWhy = null;
  if (crowded(defaultLayout)) {
    const open = Object.fromEntries(hooks.filter((l) => !crowded(l)).map((l) => [l, opened[l]]));
    hookLayout = leastUsed(open) ?? defaultLayout;
    hookWhy = `${defaultLayout.split('/')[1]} opened ${opened[defaultLayout]} of the last ${recent.length}`;
  }
  return { preset, hookLayout, why, hookWhy };
}

const recordedPath = (abs, root) => { const rel = relative(root, abs); return rel.startsWith('..') || isAbsolute(rel) ? abs : rel.split(sep).join('/'); };

/** A brand half (and a motion half, calm by default) composed into a style file; returns its path. The caller removes `tmp`. */
function composeBrand(brand, motion, root) {
  const tmp = mkdtempSync(join(tmpdir(), 'mm-new-'));
  const out = join(tmp, 'style.json');
  const from = { brand: recordedPath(resolveHalf('brand', brand), root), motion: recordedPath(resolveHalf('motion', motion ?? 'calm'), root) };
  writeFileSync(out, `${JSON.stringify(compose({ brand, motion: motion ?? 'calm', from, out }), null, 2)}\n`);
  return { out, tmp };
}

export function newPiece({ kind, style: styleArg, id, dir: dirArg, root = ROOT, hookLayout = null, brand = null, motion = null }) {
  if (!['film', 'deck'].includes(kind)) throw new UsageError('--kind must be film or deck');
  if (!id && dirArg) id = basename(resolve(dirArg)).toLowerCase();
  if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new UsageError(dirArg ? `--id is required when the folder name is not lowercase letters, digits and hyphens: ${basename(resolve(dirArg))}` : '--id is required: lowercase letters, digits and hyphens');
  if (!styleArg && !brand) throw new UsageError('give a style: --style (or --preset) a preset name from styles/presets/ (editorial, blueprint, …) or a path to a style.json, or --brand with an optional --motion');
  if (styleArg && brand) throw new UsageError('--style and --brand name two looks; give one');
  const skeleton = join(root, 'runtime/skeletons', kind);
  if (!existsSync(skeleton)) throw new UsageError(`no skeleton at ${skeleton}`);
  const dir = dirArg ? (isAbsolute(dirArg) ? dirArg : resolve(process.cwd(), dirArg)) : join(root, 'pieces', id);
  if (dirArg) {
    const inside = relative(root, dir);
    if (inside.startsWith('..') || isAbsolute(inside) || inside === '') throw new UsageError(`--dir must be a new folder inside the repo (${root}): the kit and patterns are served from the repo root, so a piece outside it cannot open`);
  }
  if (existsSync(dir)) throw new UsageError(dirArg ? `${dirArg} already exists; pick another --dir` : `pieces/${id} already exists; pick another --id`);

  const composed = brand ? composeBrand(brand, motion, root) : null;
  let plan;
  try { plan = planStyle(composed ? composed.out : resolveStyle(styleArg), root); } finally { if (composed) rmSync(composed.tmp, { recursive: true, force: true }); }   // fails before anything is written
  cpSync(skeleton, dir, { recursive: true });
  installStyle(dir, plan);
  const pieceJs = join(dir, 'piece.js');
  const js = readFileSync(pieceJs, 'utf8');
  if (!SKELETON_KIT_IMPORT.test(js)) throw new UsageError(`${pieceJs} (from the skeleton) has no kit import to point at runtime/kit/kit.js`);
  writeFileSync(pieceJs, js.replace(SKELETON_KIT_IMPORT, `$1${kitSpecifier(dir, root)}$2`).replace(SKELETON_NOTE, 'The kit import below was written by `mm new` for where this piece lives; if the folder moves, fix it.'));
  const storyFile = join(dir, 'story.json');
  const story = JSON.parse(readFileSync(storyFile, 'utf8'));
  story.id = id;
  if (hookLayout) story.scenes[0].layout = hookLayout;
  writeFileSync(storyFile, JSON.stringify(story, null, 2) + '\n');
  return dir;
}

runMain(import.meta, async () => {
  const { values } = parseArgs({ options: { kind: { type: 'string' }, style: { type: 'string' }, preset: { type: 'string' }, brand: { type: 'string' }, motion: { type: 'string' }, id: { type: 'string' }, dir: { type: 'string' } } });
  const { preset, ...rest } = values;
  if (preset && rest.style) throw new UsageError('--style and --preset name the same thing; give one');
  if (preset) rest.style = preset;
  if (rest.motion && !rest.brand) throw new UsageError('--motion goes with --brand; a --style is already a brand and a motion');
  const recent = ['film', 'deck'].includes(rest.kind) ? recentPieces(ROOT, rest.kind) : [];
  const presets = readdirSync(join(ROOT, 'styles/presets')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  const look = chooseLook(recent, { presets });
  const auto = !rest.style && !rest.brand;
  if (auto) rest.style = look.preset;
  const dir = newPiece({ ...rest, hookLayout: look.hookWhy ? look.hookLayout : null });
  console.log(`created ${dir}`);
  console.log(`  look: ${auto ? `${look.preset} (chosen: ${look.why})` : `${rest.style ?? `brand ${rest.brand}`} (named)`}`);
  if (look.hookWhy) console.log(`  hook: ${look.hookLayout} (${look.hookWhy})`);
  console.log(`  next: node scripts/mm.mjs serve ${values.dir ?? values.id}`);
  return 0;
});
