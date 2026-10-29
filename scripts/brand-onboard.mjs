// Bringing a brand into its folder (SPEC §8):
//   mm brand onboard <folder> --from <source>… [--color role=#hex]…   merge captures by trust, run the role rules
//   mm brand set <folder> <role>=#hex…                                 retype roles and run the rules again
//   mm brand font <folder> <file> --family <name> --role display|text|mono|both [--weight N] [--license <file>]
//   mm brand logo <folder> <file.svg>                                  keep a cleaned logo and its one-colour variant
// One script; the subcommand is its first argument. Every command works out everything first and writes only
// when nothing is wrong, so a refusal leaves the folder as it was. The result of the rules lives in
// sources/onboard.json (the review sheet reads it), brand.json (the engine reads it) and notes.md (people read it).
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { bundledFamilies, mapFaces, mapSource, parseHex } from './capture-brand.mjs';
import { GROUP_USAGE, UsageError, runMain, slug, usageText } from './lib/cli.mjs';
import { deltaE } from './lib/brand-roles.mjs';
import {
  FACE_ROLES, TRUST, appendNotes, baselineState, brandFolder, brandWith, bundledLicence, checked, colourMap, licenceOf, mergeFaces, mergeRoles,
  onboardFile, parseRoleValue, placeBundledFace, readJson, readState, reviewLines, reviewState, rolesInput, writeJson,
} from './lib/brand-onboard.mjs';
import { monoSvg, sanitiseSvg } from './lib/svg-logo.mjs';
import { nearestPaint } from './lib/mascot-map.mjs';
import { isSafeFamily } from './lib/style-values.mjs';
import { initBrand, brandSource } from './brand-init.mjs';

const isEmptyOrNew = (dir) => !existsSync(dir) || (statSync(dir).isDirectory() && readdirSync(dir).length === 0);
const changeLines = (changes) => changes.map(([role, from, to]) => `- ${role}: ${from ?? 'unset'} → ${to} (typed by hand)`);
const sameHex = (a, b) => String(a).toUpperCase() === String(b).toUpperCase();

/** The font entry of onboard.json for a face already in brand.json. */
function fontEntry(dir, role, face) {
  const files = face.files.map((f) => f.src);
  const licenceFile = files[0] && join(dir, files[0], '..', 'LICENSE.txt');
  return {
    role, family: face.family, source: bundledFamilies().has(face.family) ? 'stand-in' : 'brand',
    licence: licenceFile && existsSync(licenceFile) ? licenceOf(readFileSync(licenceFile, 'utf8')) : 'unknown', files,
  };
}

// ---------------------------------------------------------------- onboard

/** Merges the sources, applies the role rules and writes the folder. Returns { dir, state }. */
export async function onboardBrand({ folder, from = [], color = [], cwd = process.cwd() }) {
  if (!from.length) throw new UsageError('name at least one source with --from');
  const hand = {};
  for (const c of color) {
    const [role, hex] = parseRoleValue(c);
    hand[role] = hex;
  }
  const dir = resolve(cwd, folder);
  const fresh = isEmptyOrNew(dir);
  if (!fresh && !existsSync(join(dir, 'brand.json'))) throw new UsageError(`${dir} is not empty and holds no brand.json; name a new folder, an empty one, or a brand folder`);

  const sources = [];
  for (const f of from) {
    const m = await mapSource(f);
    const kind = m.kind === 'figma' ? 'tokens' : m.kind;
    sources.push({ kind, from: f, trust: TRUST[kind], mapped: m.mapped, tokens: m.tokens });
  }
  const base = readJson(fresh ? brandSource('paper') : join(dir, 'brand.json'), 'brand.json');
  const prev = fresh ? null : readState(dir);

  const { input, candidates } = mergeRoles(sources, hand);
  if (hand.surfaceInk) input.surfaceInk = { hex: hand.surfaceInk, confidence: 'set', source: 'hand', evidence: 'typed with --color' };
  const kept = Object.fromEntries((prev?.fonts ?? []).filter((f) => f.source === 'brand').map((f) => [f.role, f]));
  const merged = mergeFaces(sources);
  const { type: standIn, typeLines } = mapFaces({ ...merged, roles: {} });
  for (const role of Object.keys(kept)) delete standIn[role];
  const typeNotes = typeLines.filter((l) => !Object.keys(kept).some((role) => l.startsWith(`- **type.${role}**`)));

  const entries = (placed = {}) => FACE_ROLES.map((role) => kept[role] ?? {
    role, family: standIn[role].family, source: 'stand-in', licence: bundledLicence(standIn[role]), files: (placed[role] ?? standIn[role]).files.map((f) => f.src),
  });
  const make = (brand, placed) => {
    const { state } = reviewState({
      dir, brandName: brand.name, input, candidates, fonts: entries(placed), logo: prev?.logo ?? null,
      sources: sources.map(({ kind, from: f, trust }) => ({ kind, from: f, trust })),
    });
    return { state, brand: brandWith(brand, state, placed ?? standIn) };
  };
  make(base);   // the whole result is checked before anything is written

  let brand = base;
  if (fresh) ({ brand } = initBrand({ folder: dir, from: 'paper' }));
  const placed = Object.fromEntries(Object.entries(standIn).map(([role, face]) => [role, placeBundledFace(dir, face)]));
  const result = make(brand, placed);
  writeJson(join(dir, 'brand.json'), result.brand);
  writeJson(onboardFile(dir), result.state);
  appendNotes(dir, 'Onboarded', [
    'Sources:', ...result.state.sources.map((s) => `- ${s.kind} (trust ${s.trust}): ${s.from}`), '',
    ...(Object.keys(hand).length ? [`Typed with --color: ${Object.entries(hand).map(([r, h]) => `${r}=${h}`).join(', ')}`, ''] : []),
    ...reviewLines(result.state), '',
    'Type (a bundled family stands in until a brand font is added with `mm brand font`):', ...typeNotes,
  ]);
  return { dir, state: result.state };
}

function summary(dir, state, verb) {
  const roles = Object.entries(state.roles).map(([r, x]) => `${r} ${x.hex} (${x.confidence})`).join(', ');
  const fixes = Object.entries(state.roles).filter(([, x]) => x.fixed).map(([r, x]) => `${r} ${x.fixed.from} → ${x.fixed.to}`);
  return [
    `${verb} ${dir}`, `  roles: ${roles}`, `  fixes: ${fixes.join('; ') || 'none'}`,
    `  warnings: ${state.warnings.map((w) => w.id).join(', ') || 'none'}`,
    `  questions: ${state.ask.length ? `${state.ask.length} (${state.ask.map((a) => a.id).join(', ')}); the commands are in notes.md and onboard.json` : 'none'}`,
  ];
}

// ---------------------------------------------------------------- set

/** Sets roles by hand, runs the rules again over every role and rewrites brand.json, onboard.json and notes.md. */
export function setRoles({ folder, values, cwd = process.cwd() }) {
  if (!values.length) throw new UsageError('name at least one role=#hex');
  const dir = brandFolder(folder, cwd);
  const changes = values.map(parseRoleValue);
  const prev = readState(dir) ?? baselineState(dir);
  const input = rolesInput(prev);
  const before = Object.fromEntries(changes.map(([role]) => [role, prev.roles[role]?.hex]));
  for (const [role, hex] of changes) input[role] = { hex, confidence: 'set', source: 'hand', evidence: 'typed with mm brand set' };
  const kept = {};
  for (const a of prev.ask) kept[a.role] = [...(kept[a.role] ?? []), ...a.options.filter((o) => o.label !== 'keep it').map((o) => ({ hex: o.value, source: 'earlier', note: o.label.replace(/^#\w+ \(|\)$/g, '') }))];
  const { state } = reviewState({ dir, brandName: prev.brand, sources: prev.sources, input, candidates: kept, fonts: prev.fonts, logo: prev.logo });
  const brand = brandWith(readJson(join(dir, 'brand.json'), 'brand.json'), state);
  writeJson(join(dir, 'brand.json'), brand);
  writeJson(onboardFile(dir), state);
  appendNotes(dir, 'Changed', [...changeLines(changes.map(([role, hex]) => [role, before[role], hex])), '', ...reviewLines(state)]);
  return { dir, state, changes };
}

// ---------------------------------------------------------------- font

const MAGIC = {
  '.woff2': [Buffer.from('wOF2')], '.woff': [Buffer.from('wOFF')],
  '.ttf': [Buffer.from([0, 1, 0, 0]), Buffer.from('true'), Buffer.from('OTTO')], '.otf': [Buffer.from('OTTO'), Buffer.from([0, 1, 0, 0]), Buffer.from('true')],
};

function head(file, n) {
  const fd = openSync(file, 'r');
  try { const buf = Buffer.alloc(n); const read = readSync(fd, buf, 0, n, 0); return buf.subarray(0, read); } finally { closeSync(fd); }
}

/** Takes a font file into fonts/<family>/ with its licence and makes it the face of a role (or of display and text). */
export function addFont({ folder, file, family, role, weight = 400, license, cwd = process.cwd() }) {
  const dir = brandFolder(folder, cwd);
  if (!family) throw new UsageError('--family "<Name>" is required');
  if (!isSafeFamily(family) || !slug(family)) throw new UsageError(`--family ${JSON.stringify(family)} is not allowed: a font family is 1 to 64 letters, digits, spaces, dots, apostrophes, underscores or hyphens`);
  const roles = role === 'both' ? ['display', 'text'] : FACE_ROLES.includes(role) ? [role] : null;
  if (!roles) throw new UsageError('--role must be display, text, mono or both');
  const w = /^\d{3}$/.test(String(weight)) ? Number(weight) : NaN;
  if (!(w >= 100 && w <= 900)) throw new UsageError(`--weight must be a number from 100 to 900, not "${weight}"`);
  const src = resolve(cwd, file);
  if (!existsSync(src) || !statSync(src).isFile()) throw new UsageError(`font file not found: ${file}`);
  const ext = extname(src).toLowerCase();
  if (!MAGIC[ext]) throw new UsageError(`${basename(src)}: a font file is .woff2, .woff, .ttf or .otf`);
  const first = head(src, 4);
  if (!MAGIC[ext].some((m) => first.equals(m))) throw new UsageError(`${basename(src)} is not a ${ext.slice(1)} font file: its first bytes are wrong`);
  const licenceSrc = license ? resolve(cwd, license) : null;
  if (licenceSrc && (!existsSync(licenceSrc) || !statSync(licenceSrc).isFile())) throw new UsageError(`licence file not found: ${license}`);

  const rel = `fonts/${slug(family)}`;
  const licenceTarget = join(dir, rel, 'LICENSE.txt');
  const licenceText = licenceSrc ? readFileSync(licenceSrc, 'utf8') : existsSync(licenceTarget) ? readFileSync(licenceTarget, 'utf8') : null;
  const licence = licenceText === null ? 'private-use' : licenceOf(licenceText);
  const fileRel = `${rel}/${basename(src)}`;

  const brand = readJson(join(dir, 'brand.json'), 'brand.json');
  for (const r of roles) {
    const old = brand.type[r];
    const entry = { src: fileRel, weight: w, unicodeRange: 'U+0000-FFFF' };
    const files = old?.family === family ? [...old.files.filter((f) => f.src !== fileRel), entry] : [entry];
    brand.type[r] = { ...old, family, weight: old?.family === family ? old.weight : w, files };
  }
  checked(brand);
  const state = readState(dir) ?? baselineState(dir);
  const fonts = FACE_ROLES.map((r) => state.fonts.find((f) => f.role === r) ?? fontEntry(dir, r, readJson(join(dir, 'brand.json')).type[r]));
  for (const r of roles) fonts[FACE_ROLES.indexOf(r)] = { role: r, family, source: 'brand', licence, files: brand.type[r].files.map((f) => f.src) };

  mkdirSync(join(dir, rel), { recursive: true });
  copyFileSync(src, join(dir, fileRel));
  if (licenceSrc) copyFileSync(licenceSrc, licenceTarget);
  writeJson(join(dir, 'brand.json'), brand);
  writeJson(onboardFile(dir), { ...state, fonts });
  appendNotes(dir, 'Font added', [
    `- ${roles.join(' and ')}: ${family}, weight ${w}, ${fileRel}`, `- licence: ${licence}${licence === 'private-use' ? ' (no licence granting more was found: use it for this brand only, and do not pass the file on)' : ''}`,
  ]);
  return { dir, licence, roles };
}

// ---------------------------------------------------------------- logo

/** Keeps a cleaned copy of an SVG logo as logo/logo.svg, a one-colour copy as logo/logo-mono.svg, and records which role each colour is closest to. */
export function addLogo({ folder, file, cwd = process.cwd() }) {
  const dir = brandFolder(folder, cwd);
  const src = resolve(cwd, file);
  if (!existsSync(src) || !statSync(src).isFile()) throw new UsageError(`logo file not found: ${file}`);
  if (extname(src).toLowerCase() !== '.svg') throw new UsageError(`${basename(src)} is not an SVG file`);
  const { svg, colors } = sanitiseSvg(readFileSync(src, 'utf8'));
  const state = readState(dir) ?? baselineState(dir);
  const palette = colourMap(state.roles);
  const fills = {}; const far = [];
  for (const hex of colors) {
    const near = nearestPaint(parseHex(hex), palette);
    const nearest = Object.keys(palette).filter((r) => r !== 'surfaceInk').map((r) => [r, deltaE(hex, palette[r])]).sort((a, b) => a[1] - b[1])[0];
    fills[hex] = typeof near.part === 'string' ? near.part : nearest[0];
    if (nearest[1] > 12) far.push(`- ${hex} is ΔE ${nearest[1].toFixed(1)} from the nearest role (${nearest[0]}); it is kept as drawn in logo.svg and has no role to follow in a re-coloured brand`);
  }
  mkdirSync(join(dir, 'logo'), { recursive: true });
  writeFileSync(join(dir, 'logo', 'logo.svg'), svg);
  writeFileSync(join(dir, 'logo', 'logo-mono.svg'), monoSvg(svg));
  writeJson(onboardFile(dir), { ...state, logo: { file: 'logo/logo.svg', mono: 'logo/logo-mono.svg', fills } });
  appendNotes(dir, 'Logo added', [
    `- cleaned: no script, no foreign content, no handlers, nothing that reaches outside the file; a viewBox in place of a fixed size`,
    `- colours to roles: ${Object.entries(fills).map(([h, r]) => `${h} → ${r}`).join(', ') || 'none (the logo paints with the page colour)'}`, ...far,
  ]);
  return { dir, fills };
}

// ---------------------------------------------------------------- command line

const OPTIONS = {
  onboard: { from: { type: 'string', multiple: true }, color: { type: 'string', multiple: true } },
  set: {},
  font: { family: { type: 'string' }, role: { type: 'string' }, weight: { type: 'string' }, license: { type: 'string' } },
  logo: {},
};

export async function main(argv) {
  const [sub, ...rest] = argv;
  if (!OPTIONS[sub]) throw new UsageError(`expected ${GROUP_USAGE.brand.filter((s) => OPTIONS[s]).join(' | ')}\n${usageText('brand')}`);
  let parsed;
  try { parsed = parseArgs({ args: rest, options: OPTIONS[sub], allowPositionals: true }); } catch (e) { throw new UsageError(`${e.message}\n${usageText(`brand ${sub}`)}`); }
  const { values, positionals } = parsed;
  const need = { onboard: 1, set: 2, font: 2, logo: 2 }[sub];
  if (sub === 'set' ? positionals.length < 2 : positionals.length !== need) throw new UsageError(`${{ onboard: 'name the brand folder', set: 'name the brand folder and at least one role=#hex', font: 'name the brand folder and the font file', logo: 'name the brand folder and the SVG file' }[sub]}\n${usageText(`brand ${sub}`)}`);

  if (sub === 'onboard') {
    const { dir, state } = await onboardBrand({ folder: positionals[0], ...values });
    console.log([...summary(dir, state, 'onboarded'), `  next: mm brand sheet "${dir}"`].join('\n'));
  } else if (sub === 'set') {
    const { dir, state, changes } = setRoles({ folder: positionals[0], values: positionals.slice(1) });
    console.log([...summary(dir, state, `set ${changes.map(([r, h]) => `${r}=${h}`).join(' ')} in`),
      ...(existsSync(join(dir, 'sheets', 'review.html')) && GROUP_USAGE.brand.includes('sheet') ? [`  the review sheet is out of date: run \`mm brand sheet "${dir}"\` to refresh it`] : [])].join('\n'));
  } else if (sub === 'font') {
    const { dir, licence, roles } = addFont({ folder: positionals[0], file: positionals[1], ...values });
    console.log(`added ${values.family} as the ${roles.join(' and ')} face of ${dir} (licence: ${licence})`);
  } else {
    const { dir, fills } = addLogo({ folder: positionals[0], file: positionals[1] });
    console.log(`added the logo to ${dir}: ${Object.entries(fills).map(([h, r]) => `${h} → ${r}`).join(', ') || 'no fixed colours'}`);
  }
  return 0;
}

runMain(import.meta, () => main(process.argv.slice(2)));
