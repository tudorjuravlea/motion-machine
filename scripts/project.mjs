// `mm project new|make|path`: a film or deck in a folder of the user's own, rendered by the engine.
//   new  <folder> --brand <brand-folder> --kind film|deck [--motion <name|path>] [--formats a,b]
//   make <folder> [--to <dir>] [--check-only]
//   path <folder>
// `make` composes the brand folder with the motion half, refreshes a hidden work piece inside the engine (the
// gate and the renderer need the engine's kit beside the piece), checks and exports it, and copies the results
// back into the project's out/. Deleting the work folder loses nothing: the next make rebuilds it.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT } from './lib/browser.mjs';
import { UsageError, runMain, usageText } from './lib/cli.mjs';
import { projectId, readProject } from './lib/project.mjs';
import { validators } from './lib/validate.mjs';
import { composeToFile, resolveHalf } from './compose.mjs';
import { installStyle, newPiece, planStyle } from './new.mjs';

const MM = join(ROOT, 'scripts', 'mm.mjs');
const readJson = (file, what = file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new UsageError(`${what}: ${e.message}`); } };
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const replacePath = (from, to) => { rmSync(to, { recursive: true, force: true }); mkdirSync(dirname(to), { recursive: true }); cpSync(from, to, { recursive: true }); };
const isEmptyOrNew = (dir) => !existsSync(dir) || (statSync(dir).isDirectory() && readdirSync(dir).length === 0);

/** A motion given as a shipped name stays a name; a path becomes absolute, so the project finds it from anywhere. */
function motionRef(ref, cwd) {
  const found = resolveHalf('motion', ref);   // throws a usage error naming where it looked
  return found === join(ROOT, 'styles', 'motion', `${ref}.json`) ? ref : resolve(cwd, found);
}

const SOURCES_STUB = `# Sources

Drop briefs, notes and fact sheets in this folder, or point to files elsewhere. For every line in
\`story.json\`, say where it came from.

| line in the story | from file | where in it |
|---|---|---|
|  |  |  |
`;

/** Makes a project folder; returns { dir, project }. */
export function newProject({ folder, brand, kind, motion = 'calm', formats, cwd = process.cwd() }) {
  if (!['film', 'deck'].includes(kind)) throw new UsageError('--kind must be film or deck');
  if (!brand) throw new UsageError('--brand is required: the brand folder made by mm brand init');
  const brandArg = resolve(cwd, brand);
  if (!existsSync(join(brandArg, 'brand.json'))) throw new UsageError(`${brandArg} holds no brand.json; make a brand folder with: mm brand init <folder>`);
  const brandDir = realpathSync(brandArg);
  const dir = /[\\/]/.test(folder) ? resolve(cwd, folder) : join(brandDir, 'projects', folder);
  if (!isEmptyOrNew(dir)) throw new UsageError(`${dir} is not empty; name a new folder, or an empty one`);
  const id = projectId(dir);
  const motionValue = motionRef(motion, cwd);

  const story = readJson(join(ROOT, 'runtime', 'skeletons', kind, 'story.json'));
  story.id = id;
  const list = formats ? formats.split(',').map((f) => f.trim()).filter(Boolean) : story.formats;
  story.formats = kind === 'deck' ? list.slice(0, 1) : list;
  const v = validators();
  if (!v.story(story)) throw new UsageError(`the project would not validate: ${(v.story.errors ?? []).filter((e) => e.instancePath === '/id' || e.instancePath.startsWith('/formats')).map((e) => `${e.instancePath} ${e.message}`).join('; ') || 'see contracts/story.schema.json'} (the id comes from the folder name: ${basename(dir)})`);

  for (const d of ['assets', 'inputs', 'out']) mkdirSync(join(dir, d), { recursive: true });
  writeJson(join(dir, 'story.json'), story);
  writeFileSync(join(dir, 'inputs', 'sources.md'), SOURCES_STUB);
  const project = { id, kind, brand: brandDir, motion: motionValue, formats: story.formats, created: new Date().toISOString() };
  writeJson(join(dir, 'project.json'), project);
  return { dir, project };
}

/** Runs one mm verb on the work piece; `capture` returns its standard output instead of showing it. */
function mmRun(args, { capture = false } = {}) {
  const r = spawnSync(process.execPath, [MM, ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'], maxBuffer: 64 << 20 });
  return { code: r.error ? 2 : (r.status ?? 2), stdout: r.stdout ?? '' };
}

/** What the gate says that a person must read: every FAIL and WARN line, then the verdict. */
function checkSummary(stdout) {
  const lines = stdout.split('\n');
  const verdict = lines.findIndex((l) => /^(All rules passed|\d+ rules? failed)/.test(l));
  return [...lines.filter((l) => /^(FAIL|WARN)\b/.test(l)), ...(verdict < 0 ? [] : lines.slice(verdict).filter(Boolean))].join('\n');
}

/** Mirrors the project's assets/ into the work piece, keeping the engine's own assets/fonts and assets/ground. */
function mirrorAssets(projectAssets, workAssets, log) {
  const owned = new Set(['fonts', 'ground']);
  mkdirSync(workAssets, { recursive: true });
  for (const name of readdirSync(workAssets)) if (!owned.has(name)) rmSync(join(workAssets, name), { recursive: true, force: true });
  if (!existsSync(projectAssets)) return;
  for (const name of readdirSync(projectAssets)) {
    if (owned.has(name)) { log(`mm project make: assets/${name} in the project is not used (the engine puts the brand's own there); rename it`); continue; }
    cpSync(join(projectAssets, name), join(workAssets, name), { recursive: true });
  }
}

/** Builds and renders the project; returns the exit code. */
export function makeProject(folderArg, { to, checkOnly = false } = {}, log = console.log) {
  const { folder, project, id, work } = readProject(folderArg);
  const brandDir = project.brand;
  if (typeof brandDir !== 'string' || !isAbsolute(brandDir) || !existsSync(join(brandDir, 'brand.json'))) throw new UsageError(`the brand folder of this project is gone or has no brand.json: ${brandDir} (project.json names it; fix "brand" there)`);
  const story = readJson(join(folder, 'story.json'), join(folder, 'story.json'));
  if (story.kind !== project.kind) throw new UsageError(`story.json is a ${story.kind} but project.json says ${project.kind}`);

  // compose on every make, so an edit to the brand folder always reaches the next render. The composed style is
  // written beside the work piece's own place (so relative paths agree), installed into the piece, then removed;
  // `from` names the halves by name only, because a path would travel inside every standalone deck.
  const staging = `${work}.compose`;
  const motion = project.motion ?? 'calm';
  try {
    composeToFile({ brand: join(brandDir, 'brand.json'), motion, out: join(staging, 'style.json'), from: { brand: 'brand.json', motion: isAbsolute(motion) ? basename(motion) : motion } });
    if (!existsSync(join(work, 'piece.js'))) {
      rmSync(work, { recursive: true, force: true });
      mkdirSync(dirname(work), { recursive: true });
      newPiece({ kind: project.kind, style: join(staging, 'style.json'), id, dir: work });
    } else installStyle(work, planStyle(join(staging, 'style.json')));
  } finally { rmSync(staging, { recursive: true, force: true }); }
  writeJson(join(work, 'story.json'), { ...story, id });
  mirrorAssets(join(folder, 'assets'), join(work, 'assets'), log);

  const out = join(folder, 'out');
  mkdirSync(out, { recursive: true });
  const report = join(work, 'out', 'check.json');
  const gate = mmRun(['check', work], { capture: true });
  const summary = checkSummary(gate.stdout);
  if (summary) log(summary);
  if (existsSync(report)) replacePath(report, join(out, 'check.json'));
  if (gate.code !== 0) {
    console.error(`mm project make: the check ${gate.code === 1 ? 'failed' : 'could not run'} (exit ${gate.code}); the report is ${report}`);
    return gate.code;
  }
  if (checkOnly) { log(`mm project make: checked only; the report is ${join(out, 'check.json')}`); return 0; }

  const exported = mmRun(['export', work]);
  if (exported.code !== 0) {
    console.error(`mm project make: the export failed (exit ${exported.code}); see ${join(work, 'out', 'export.json')}`);
    return exported.code;
  }

  // the deliverables go back into the project, replacing older ones: [from, name in out/, name in --to (null: not copied there), required]
  const wout = join(work, 'out');
  const jobs = [];
  if (project.kind === 'deck') {
    jobs.push([join(wout, 'deck'), 'slides', `${id}-slides`, true], [join(wout, 'handout.pdf'), 'handout.pdf', `${id}-handout.pdf`, true], [join(wout, 'walkthrough.mp4'), 'walkthrough.mp4', `${id}-walkthrough.mp4`, true]);
  } else {
    for (const f of story.formats) jobs.push([join(wout, `${id}-${f}.mp4`), `${id}-${f}.mp4`, `${id}-${f}.mp4`, true]);
    jobs.push([join(wout, 'poster.png'), 'poster.png', null, false]);
    for (const g of existsSync(wout) ? readdirSync(wout).filter((n) => n.endsWith('.gif')) : []) jobs.push([join(wout, g), g, g, false]);
  }
  const absent = jobs.filter(([from, , , required]) => required && !existsSync(from)).map(([from]) => from);
  if (absent.length) {
    console.error(`mm project make: the export did not produce: ${absent.join(', ')}; see ${join(wout, 'export.json')}`);
    return 1;
  }
  const dest = to ? resolve(to) : null;
  const copied = [];
  for (const [from, name, toName] of jobs) {
    if (!existsSync(from)) continue;
    replacePath(from, join(out, name));
    copied.push(name);
    if (dest && toName) replacePath(from, join(dest, toName));
  }
  log(`mm project make: ${project.kind === 'deck' ? `slides ${join(out, 'slides', 'index.html')}, handout ${join(out, 'handout.pdf')}, walkthrough ${join(out, 'walkthrough.mp4')}` : `${out}: ${copied.join(', ')}`}`);
  if (dest) log(`mm project make: also copied to ${dest}`);
  return 0;
}

const OPTIONS = {
  new: { brand: { type: 'string' }, kind: { type: 'string' }, motion: { type: 'string' }, formats: { type: 'string' } },
  make: { to: { type: 'string' }, 'check-only': { type: 'boolean' } },
  path: {},
};

export async function main(argv) {
  const [sub, ...rest] = argv;
  if (!OPTIONS[sub]) throw new UsageError(`expected new | make | path\n${usageText('project')}`);
  let parsed;
  try { parsed = parseArgs({ args: rest, options: OPTIONS[sub], allowPositionals: true }); } catch (e) { throw new UsageError(`${e.message}\n${usageText(`project ${sub}`)}`); }
  const { values, positionals } = parsed;
  if (positionals.length !== 1) throw new UsageError(`name the project folder\n${usageText(`project ${sub}`)}`);
  const [folder] = positionals;
  if (sub === 'new') {
    const { dir } = newProject({ folder, ...values });
    console.log(`created ${dir}\n  next: mm project make ${dir}`);
    return 0;
  }
  if (sub === 'path') { console.log(readProject(folder).work); return 0; }
  return makeProject(folder, { to: values.to, checkOnly: values['check-only'] });
}

runMain(import.meta, () => main(process.argv.slice(2)));
