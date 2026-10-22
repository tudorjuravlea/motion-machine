#!/usr/bin/env node
// `skill-new --brand <name> [--motion <name>] --out <dir> [--license <spdx>] [--force]`
// (`mm skill new`, SPEC §13): scaffolds a thin per-brand skill from
// skill/templates/brand-skill. The folder is self-contained and holds no absolute path:
//   SKILL.md   frontmatter + "load the engine skill first" + the pinned style + bans the brand lifts
//   facts.md   the brand's empty facts table
//   style/     brand.json, motion.json and the composed style.json (`from` relative to the skill; font
//              `src` relative to the style file's own folder, so `../fonts/...`, which is how `mm new
//              --style <skill>/style/style.json` resolves them)
//   fonts/     only the font files the brand uses, with their licence files (SKILL.md lists each family's licence)
//   engine.json  the engine version and commit the skill was made with
//   ground/    the brand's ground mark, when it has one (`../ground/<file>` from the style file)
// `--brand` is a shipped name (paper) or the path to a brand half, such as one `mm brand capture` wrote.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ROOT, compose, resolveHalf } from './compose.mjs';
import { findFontSrc, isArgsError, usageText } from './lib/cli.mjs';

const TEMPLATE = join(ROOT, 'skill', 'templates', 'brand-skill');
const ENGINE_SKILL = 'skill/motion-machine/SKILL.md';
const fail = (message, exitCode = 2) => Object.assign(new Error(message), { exitCode });
const fill = (text, vars) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in vars)) throw fail(`template placeholder {{${k}}} has no value`, 1); return vars[k]; });
const UNKNOWN_LICENCE = 'licence not recognised: check before sharing this skill';
/** The licence a copied LICENSE.txt grants, by name; anything else, or no file, is the warning. */
function licenceOf(file) {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (/SIL OPEN FONT LICENSE/i.test(text)) return 'SIL OFL 1.1';
  if (/Apache License/i.test(text)) return 'Apache 2.0';
  return UNKNOWN_LICENCE;
}
/** The engine this skill is made with: package version and checkout commit (null outside a git checkout). */
function engineInfo() {
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  const commit = git.status === 0 && /^[0-9a-f]{40}$/.test(git.stdout.trim()) ? git.stdout.trim() : null;
  return { engine: 'motion-machine', version: JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version, commit };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** styles/fonts/<family>/<file> becomes fonts/<family>/<file>; anything else lands in fonts/. */
const inSkill = (src) => (/(^|\/)styles\/fonts\//.test(src) ? src.replace(/^.*styles\//, '') : `fonts/${basename(src)}`);
/** Where the skill's style files (in style/) point at a font that sits at <skill>/<inSkill>. */
const fromStyleFolder = (src) => `../${inSkill(src)}`;

export function skillNew({ brand, motion = 'calm', out, license = 'Apache-2.0', force = false }) {
  if (!out) throw fail(usageText('skill new'));
  const dest = resolve(out);
  if (existsSync(dest) && readdirSync(dest).length && !force) throw fail(`${out} is not empty; pass --force to write into it`);
  const brandPath = resolveHalf('brand', brand); const motionPath = resolveHalf('motion', motion);
  const b = JSON.parse(readFileSync(brandPath, 'utf8'));
  const m = JSON.parse(readFileSync(motionPath, 'utf8'));
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(b.name ?? '')) throw fail(`brand name is not a valid skill name part: ${b.name}`, 1);

  // fonts: copy what the brand uses (and each family's licence), then point the half at the copies
  const missing = [];
  const licences = new Map();   // family -> licence read from the LICENSE.txt copied beside its files
  for (const face of Object.values(b.type ?? {})) {
    for (const f of face.files ?? []) {
      const from = findFontSrc(f.src, brandPath);   // beside the half first (a captured half), then the repo
      if (!from) { missing.push(f.src); continue; }
      const to = join(dest, inSkill(f.src));
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      const lic = join(dirname(from), 'LICENSE.txt');
      if (existsSync(lic)) copyFileSync(lic, join(dirname(to), 'LICENSE.txt'));
      const got = licenceOf(lic);
      if (!licences.has(face.family) || got === UNKNOWN_LICENCE) licences.set(face.family, got);
      f.src = fromStyleFolder(f.src);
    }
  }
  if (missing.length) throw fail(`font file(s) listed in the brand half are missing (G-LOCAL): ${missing.join(', ')}`, 1);

  // the ground mark: copied to ground/<name>, and named from the style folder like a font
  const mark = b.ground?.mark;
  if (mark?.src) {
    const from = findFontSrc(mark.src, brandPath);
    if (!from) throw fail(`the ground mark listed in the brand half is missing (G-LOCAL): ${mark.src}`, 1);
    mkdirSync(join(dest, 'ground'), { recursive: true });
    copyFileSync(from, join(dest, 'ground', basename(from)));
    mark.src = `../ground/${basename(from)}`;
  }

  mkdirSync(join(dest, 'style'), { recursive: true });
  writeFileSync(join(dest, 'style', 'brand.json'), `${JSON.stringify(b, null, 2)}\n`);
  writeFileSync(join(dest, 'style', 'motion.json'), `${JSON.stringify(m, null, 2)}\n`);
  const style = compose({ brand: join(dest, 'style', 'brand.json'), motion: join(dest, 'style', 'motion.json'), name: `${b.name}-${m.name}`, from: { brand: 'style/brand.json', motion: 'style/motion.json' } });
  writeFileSync(join(dest, 'style', 'style.json'), `${JSON.stringify(style, null, 2)}\n`);

  const engine = engineInfo();
  writeFileSync(join(dest, 'engine.json'), `${JSON.stringify(engine, null, 2)}\n`);

  const inForce = b.bans.filter((x) => !b.allow.includes(x));
  const vars = {
    name: `${b.name}-motion`, title: `${cap(b.name)} motion`,
    description: `Make Motion Machine films and clicker decks in the ${b.name} look with ${m.name} motion. Use when the user asks for a motion piece, reel, explainer or clicker deck for ${b.name}. Loads the Motion Machine engine skill first.`,
    compatibility: 'Needs the Motion Machine engine skill, Node 22 or newer, Playwright Chromium and ffmpeg.',
    fonts_licences: [...licences].map(([family, lic]) => `- ${family}: ${lic}`).join('\n'),
    engine_made_with: `This skill was made with Motion Machine ${engine.version}${engine.commit ? ` (${engine.commit.slice(0, 7)})` : ''}; an engine without the patterns the skill uses fails \`mm check\` with G-PATTERN-REF. \`engine.json\` records it.`,
    license, version: '0.1.0', brand: b.name, motion: m.name, engine_skill: ENGINE_SKILL,
    style_path: 'style/style.json', brand_path: 'style/brand.json', motion_path: 'style/motion.json',
    bans_section: [
      `Bans in force (the brand half's \`bans\`; the engine's W-BAN and W-FADE-ONLY read them): ${inForce.length ? inForce.join(', ') : 'none'}.`, '',
      `Bans this brand lifts (\`allow\`): ${b.allow.length ? b.allow.join(', ') : 'none'}. A lifted ban is named in the handover, never assumed.`, '',
      'A banned font family is advice only; the fonts in `fonts/` are the ones the piece ships.',
    ].join('\n'),
  };
  vars.gate_section = m.gate
    ? [`This studio tunes the engine's warnings: \`${JSON.stringify(m.gate)}\` (the motion half's \`gate\`, carried into \`${vars.style_path}\`).`, '', 'The tuned rules report the threshold they used. Hard rules cannot be tuned.'].join('\n')
    : [`The gate runs at the engine's defaults. To tune this studio's warnings (the length band, the dead-air window, the quiet tail, reading speed and line floors, the looks W-BAN lifts), add a \`gate\` block in \`${vars.motion_path}\` and compose again; the engine's SPEC lists the keys.`, '', 'Hard rules cannot be tuned.'].join('\n');
  if (/["\\\n]/.test(vars.description + vars.compatibility)) throw fail('description/compatibility may not contain quotes, backslashes or newlines', 1);
  writeFileSync(join(dest, 'SKILL.md'), fill(readFileSync(join(TEMPLATE, 'SKILL.md'), 'utf8'), vars));
  writeFileSync(join(dest, 'facts.md'), fill(readFileSync(join(TEMPLATE, 'facts.md'), 'utf8'), vars));
  return { dir: dest, name: vars.name, style };
}

export function main(argv) {
  try {
    const a = parseArgs({ args: argv, options: { brand: { type: 'string' }, motion: { type: 'string' }, out: { type: 'string' }, license: { type: 'string' }, force: { type: 'boolean' } }, strict: true }).values;
    if (!a.brand) throw fail(usageText('skill new'));
    const r = skillNew(a);
    console.log(`wrote skill ${r.name} to ${a.out}`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('skill new')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
