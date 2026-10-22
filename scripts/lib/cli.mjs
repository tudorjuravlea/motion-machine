// Small shared pieces of the verb scripts: piece resolution, usage errors, exit codes (SPEC §7:
// 0 pass, 1 a gate failed, 2 setup or usage).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT } from './browser.mjs';

/** Setup or usage problem: printed without a stack, exit code 2. */
export class UsageError extends Error {
  constructor(message, code = 2) { super(message); this.name = 'UsageError'; this.exitCode = code; }
}

/** A required tool is absent; the message names it. */
export class MissingToolError extends UsageError {
  constructor(tool, hint = '') { super(`${tool} not found on PATH${hint ? `: ${hint}` : ''}`); this.tool = tool; }
}

/**
 * One usage line (plus what the verb does) per command, as typed after `mm`. `mm <cmd> --help`
 * prints exactly this and exits 0; a usage mistake (unknown flag, missing value) prints it after
 * the message and exits 2, never a stack.
 */
export const USAGE = {
  doctor: ['mm doctor', 'verify Node, Chromium, ffmpeg and ffprobe; never installs anything'],
  new: ['mm new --kind film|deck --style <preset|path> (--id <id> | --dir <folder>)', 'scaffold a piece in pieces/<id>/ or in --dir <folder> (under the repo root; the story id is the folder name unless --id is given); piece.js gets the right path to the kit'],
  serve: ['mm serve [piece] [--port N] [--format 16x9|9x16|1x1|4x5] [--t S] [--press N]', 'local preview with a play clock'],
  stills: ['mm stills [piece] [--format F]', 'rests, mid-entrances, strips, out/contact.png, out/phone.png'],
  check: ['mm check <piece> [--format F] [--sub N] [--quiet] [--json] [--progress]', 'the gate; writes out/check.json; --quiet prints only a failing verdict, as one line'],
  export: ['mm export [piece] [--fps 30] [--sub 1] [--formats a,b] [--force] [--prove] [--gif] [--gif-width 540] [--workers N]', 'films: MP4 per format, drawn by N pages in parallel (default half the cores, 1 to 4; at most 16); decks: standalone deck, handout.pdf, walkthrough.mp4 (--sub above 1 blends instants and is warned about)'],
  studio: ['mm studio <piece> [--port N] [--open]', 'the studio: the piece as a timeline on 127.0.0.1; drags and the inspector write story.json as the smallest change, journalled in out/studio/; Export renders the MP4s; --open opens the page in the default browser'],
  timeline: ['mm timeline <piece> [--format F] [--json] [--plan] [--who NAME] [move|trim|out|set|apply|undo|check|selection …]', 'the timeline for agents: no verb prints it; move <ref> <time>, move <scene> before|after <scene>, trim <scene> <time>, out <ref> <time|none>, set <ref> k=v, apply <edits.json>, undo [receipt|last], check, selection; refusals exit 2 with a hint'],
  review: ['mm review [piece] [--no-stills]', 'out/review.html from direction-log.md'],
  beats: ['mm beats <track.wav> [--bpm N] [--out assets/beats.json]', 'detect the beat grid of a track'],
  sound: ['mm sound [piece] [--formats 16x9,9x16] [--patterns dir]', 'render the piece\'s sound mix and cue list'],
  'release-check': ['mm release-check [--root <dir>] [--only R-BRAND,R-SECRET,...] [--json]', 'the pre-publication sweep: brand words, secrets, absolute paths, e-mail addresses, URLs, licences, pattern lint, golden checks; exit 0 clean, 1 findings, 2 setup'],
  'pattern list': ['mm pattern list', 'the complete patterns, as pattern-lint judges them'],
  'pattern lint': ['mm pattern lint [<group>/<name> | <name>] [--json]', 'lint every pattern, or the one named'],
  'pattern stills': ['mm pattern stills <group>/<name> [--style preset|path|all] [--format F] [--patterns dir]', 'photograph a pattern\'s demo in a style (--patterns: a patterns folder other than the repo\'s)'],
  'brand capture': ['mm brand capture --from <url|index.html|figma-export.json|DESIGN.md|folder of stills> [--name <name>] [--color role=#hex]… --out <path>.json', 'capture a brand half; --name defaults to the --out basename; a typed --color always wins'],
  'brand mascot': ['mm brand mascot <file.svg> --brand <path> [--as <name>] [--out <path>] [--json]', 'import a mascot drawn in any vector tool into a brand half, by its layer names (body, face, eye-left, eye-right, mouth, arm-*, leg-*, shadow; any other name an extra part), normalised into the mascot box with colours mapped to palette roles; --as adds it to the brand\'s cast under that name; --out writes elsewhere than --brand'],
  'motion capture': ['mm motion capture --from <video> --out <path>.json [--name <name>] [--fps 10]', 'capture a motion half from a reference video; --name defaults to the --out basename'],
  'style compose': ['mm style compose --brand <name|path> --motion <name|path> --out <path> [--name <style-name>]', 'merge a brand half and a motion half into a style'],
  'style export-designmd': ['mm style export-designmd --style <style.json> --out DESIGN.md', 'write a style as a DESIGN.md'],
  'skill new': ['mm skill new --brand <name|path-to-brand.json> [--motion <name|path>] --out <dir> [--license <spdx>] [--force]', 'scaffold a thin per-brand skill; --brand takes a shipped name or the path to a captured brand half'],
  'media frame': ['mm media frame <png> --name <n> [--piece <dir>] [--key]', 'a device frame image you own (transparent screen, or a flat screen colour with --key) to <piece>/assets/frames/<n>.png, its screen hole measured into <n>.json'],
  'media prep': ['mm media prep <file> --name <n> [--piece <dir>] [--fps 30] [--fit phone|laptop|<W>x<H>] [--trim <a>-<b>] [--quality 90]', 'a screen recording to a frame sequence in <piece>/assets/<n>/ (frames plus media.json), seekable frame by frame'],
  'media layers': ['mm media layers <picture> --name <n> [--piece <dir>] [--mask <name>=<png>]… [--poly <json>]… [--key <#rrggbb|auto>] [--min-area <px>] [--plate <png>] [--depth <png>] [--depths <d,d,…>]', 'one still picture to a layer pack in <piece>/assets/<n>/: a plate with its holes filled, parts cropped to their boxes with stacking order and depth, media.json (kind: layers) and a recompose check; masks, polygons or a colour key, offline; a colour key drops pieces under --min-area pixels (a thousandth of the picture by default) and refuses a backdrop that is not flat; byte-identical on one machine'],
  'footage cut': ['mm footage cut <video> --name <n> [--piece <dir>] [--words <words.json>] [--fillers] [--max-pause 0.5]', 'a talking-head recording, already prepared with mm media prep --name <n>, to an edit in <piece>/assets/<n>/: cuts in measured quiet (edit.json) and the cut voice at the piece\'s loudness (voice.wav); --words maps a supplied word list ([{text,start,end}] or WhisperX output) onto the edit; --fillers (with --words) also cuts the stretches between words longer than --max-pause, whatever sound they hold; a take with no pause gives one clip and a note; byte-identical on one machine (another machine\'s decoder may differ by a few samples in voice.wav)'],
  'footage matte': ['mm footage matte --name <n> [--piece <dir>] [--masks <dir>] [--quality accurate|balanced] [--feather 3]', 'a person matte for a footage asset already prepared with mm media prep --name <n>: one grey mask per frame (white = person) in <piece>/assets/<n>/matte/, recorded in media.json; by default the macOS Vision framework segments the frames on the device (macOS 12+ with swiftc; the helper is compiled into <piece>/out/ on first use); elsewhere supply masks from any tool with --masks <dir> (the frames\' names, .png or .jpg); every mask then takes a 3-frame temporal median and a --feather px soft edge; the same input on one machine writes the same bytes'],
  'capture site': ['mm capture site --url <url> --name <n> [--piece <dir>] [--device phone|laptop|browser] [--mark "<Label>=<selector>"]… [--hide <selector>]… [--wait <selector>] [--quality 90] [--max-height 24000]', 'capture a web page once, at a device viewport, as tall tiles plus media.json (marks for scroll, tap and callout targets)'],
};
/** The groups: `mm <group>` names its subcommands. */
export const GROUP_USAGE = { pattern: ['list', 'lint', 'stills'], brand: ['capture', 'mascot'], motion: ['capture'], style: ['compose', 'export-designmd'], skill: ['new'], media: ['prep', 'frame', 'layers'], footage: ['cut', 'matte'], capture: ['site'] };

/** The usage text for a command key (`new`, `pattern lint`) or a group (`pattern`). */
export function usageText(key) {
  if (USAGE[key]) return `usage: ${USAGE[key][0]}\n  ${USAGE[key][1]}`;
  if (GROUP_USAGE[key]) return GROUP_USAGE[key].map((s) => `usage: ${USAGE[`${key} ${s}`][0]}\n  ${USAGE[`${key} ${s}`][1]}`).join('\n');
  return `usage: mm ${key}`;
}

/** A `--port` value as a number (0 picks a free port); anything but whole digits within 0 to 65535 is a usage error. */
export function portOf(value) {
  if (value === undefined) return 0;
  const n = /^\d{1,5}$/.test(value) ? Number(value) : NaN;
  if (!(n <= 65535)) throw new UsageError(`--port takes a port number (0 to 65535, digits only), not "${value}"`);
  return n;
}

/** A parseArgs mistake (unknown option, missing value): a usage problem, not a crash. */
export const isArgsError = (e) => typeof e?.code === 'string' && e.code.startsWith('ERR_PARSE_ARGS');

/** `mm <verb> [piece]`: a directory, an id under pieces/, or the current directory when it holds a story. */
export function resolvePiece(arg) {
  const cands = arg
    ? [...new Set([isAbsolute(arg) ? arg : resolve(process.cwd(), arg), ...(arg.startsWith('pieces/') ? [] : [join(ROOT, 'pieces', arg)]), join(ROOT, arg)])]
    : [process.cwd()];
  for (const c of cands) if (existsSync(join(c, 'story.json')) && statSync(c).isDirectory()) { assertKitReachable(c); return c; }
  throw new UsageError(arg ? `no piece at "${arg}" (looked for story.json in ${cands.join(', ')})` : 'no piece given and the current directory holds no story.json');
}

/**
 * The first relative import of the piece's entry module that points at a file which is not there,
 * as { from, spec, url } (url = the path the browser would request, repo-relative), or null.
 * A piece moved out of pieces/<id>/ keeps its old `../../runtime/kit/kit.js` and silently fails to
 * open; this names the import instead.
 */
export function brokenImport(dir) {
  const html = join(dir, 'index.html');
  if (!existsSync(html)) return null;
  const text = readFileSync(html, 'utf8');
  const tag = /<script\b([^>]*\btype=["']module["'][^>]*)>([\s\S]*?)<\/script>/i.exec(text);
  if (!tag) return null;
  const src = /\bsrc=["']([^"']+)["']/.exec(tag[1]);
  const entry = src ? resolve(dir, src[1]) : html;
  if (!existsSync(entry)) return null;
  const code = src ? readFileSync(entry, 'utf8') : tag[2];
  const re = /\bimport\s*(?:[^'"()]*?\bfrom\s*)?["'](\.{1,2}\/[^"']+)["']|\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
  for (const m of code.matchAll(re)) {
    const spec = m[1] ?? m[2];
    const abs = resolve(dirname(entry), spec);
    if (!existsSync(abs)) return { from: entry, spec, url: relative(ROOT, abs).split(sep).join('/') };
  }
  return null;
}

/** Throws a one-line UsageError naming the import that failed. */
export function assertKitReachable(dir) {
  const b = brokenImport(dir);
  if (b) throw new UsageError(`piece failed to load: ${relative(ROOT, b.from) || b.from} imports "${b.spec}", which resolves to ${b.url} and is not there (moved piece? \`mm new --dir <folder>\` writes the right path)`);
}

/** Runs `main()` when `meta` is the entry script; maps errors to exit codes. */
export function runMain(meta, main) {
  if (!process.argv[1] || meta.url !== pathToFileURL(process.argv[1]).href) return;
  main().then((code) => { process.exitCode = typeof code === 'number' ? code : 0; }, (e) => {
    if (e instanceof UsageError) console.error(`mm: ${e.message}`);
    else if (isArgsError(e)) {
      const key = SCRIPT_COMMAND[basename(fileURLToPath(meta.url), '.mjs')];
      console.error(`mm: ${e.message}${key ? `\n${usageText(key)}` : ''}`);
    } else console.error(process.env.MM_DEBUG === '1' ? (e?.stack ?? e) : `mm: ${e?.message ?? e}`);
    process.exitCode = e?.exitCode ?? 2;
  });
}

/** Script basename -> the command key whose usage a usage mistake prints. */
const SCRIPT_COMMAND = { doctor: 'doctor', new: 'new', serve: 'serve', stills: 'stills', export: 'export', review: 'review', 'pattern-stills': 'pattern stills', 'mascot-import': 'brand mascot', check: 'check', 'release-check': 'release-check' };

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Resolves a preset name (`editorial`), or a repo-relative or absolute path, to a style file. */
export function resolveStyle(arg) {
  const cands = isAbsolute(arg) ? [arg] : [resolve(process.cwd(), arg), join(ROOT, arg), join(ROOT, 'styles/presets', arg.endsWith('.json') ? arg : `${arg}.json`)];
  const file = cands.find((c) => existsSync(c) && statSync(c).isFile());
  if (!file) throw new UsageError(`style not found: ${arg}`);
  return file;
}

/** Every font file entry of a style: [{ family, file }] (file objects are live references). */
export function fontFiles(style) {
  return Object.values(style.type ?? {}).flatMap((face) => (face.files ?? []).map((file) => ({ family: face.family, file })));
}

/** Candidate absolute paths of a font `src`: relative to the style file's own folder first, then to the repo root (the shipped presets write `styles/fonts/...`). */
export const fontSrcCandidates = (src, styleFile) => [resolve(dirname(styleFile), src), resolve(ROOT, src)];

/** Absolute path of a font `src` as written in a style file, or null. */
export const findFontSrc = (src, styleFile) => fontSrcCandidates(src, styleFile).find((c) => existsSync(c)) ?? null;

/** Absolute path of a font `src`; throws naming where it looked. */
export function resolveFontSrc(src, styleFile) {
  const hit = findFontSrc(src, styleFile);
  if (!hit) throw new UsageError(`font file missing: ${src} (looked in ${fontSrcCandidates(src, styleFile).join(', ')})`);
  return hit;
}

/** A copy of a style with every font `src`, and a ground mark named by its repo path (`styles/…`), rewritten to a
 *  path relative to `pieceDir`, so a page scaffolded anywhere in the repo still finds them. */
export function relativiseFonts(style, styleFile, pieceDir) {
  const out = structuredClone(style);
  for (const { file } of fontFiles(out)) file.src = relative(pieceDir, resolveFontSrc(file.src, styleFile)).split(sep).join('/');
  const mark = out.ground?.mark;
  if (mark?.src?.startsWith('styles/') && existsSync(join(ROOT, mark.src))) mark.src = relative(pieceDir, join(ROOT, mark.src)).split(sep).join('/');
  return out;
}
