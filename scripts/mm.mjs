#!/usr/bin/env node
// The verb router (SPEC §8): `node scripts/mm.mjs <verb> [args]`, or `npm run mm -- <verb> [args]`
// (after `npm link`, plain `mm <verb>`).
// Each verb is a script in this folder run as its own process; the exit code passes through
// (0 pass, 1 a gate failed, 2 setup or usage). `--help` (or `-h`) on any verb or subverb prints
// that verb's usage and exits 0; a verb whose script is not built yet says so and exits 2.
// `plan(argv)` decides what to do without doing it, so the routing is testable.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUP_USAGE, USAGE, usageText } from './lib/cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

const VERBS = {
  doctor: 'doctor.mjs', new: 'new.mjs', serve: 'serve.mjs', stills: 'stills.mjs', export: 'export.mjs', review: 'review.mjs',
  check: 'check.mjs', beats: 'beats.mjs', sound: 'sound.mjs', 'release-check': 'release-check.mjs',
  studio: 'studio.mjs', timeline: 'timeline.mjs',
};
const GROUPS = {
  pattern: { lint: 'pattern-lint.mjs', stills: 'pattern-stills.mjs' },   // `list` is built in
  brand: { capture: 'capture-brand.mjs', mascot: 'mascot-import.mjs' },
  motion: { capture: 'capture-motion.mjs' },
  style: { compose: 'compose.mjs', 'export-designmd': 'export-designmd.mjs' },
  skill: { new: 'skill-new.mjs' },
  media: { prep: 'media-prep.mjs', frame: 'media-frame.mjs', layers: 'media-layers.mjs' },
  footage: { cut: 'footage-cut.mjs', matte: 'footage-matte.mjs' },
  capture: { site: 'capture-site.mjs' },
};

const HELP = `mm: Motion Machine  (mm <verb> --help for a verb's flags; mm --version)

${Object.keys(USAGE).map((k) => `  ${USAGE[k][0].replace(/^mm /, '')}`).join('\n')}
`;

/** `rise` → `entrances/rise` when the bare name is unique. */
function qualify(name, args) {
  if (!name || name.startsWith('-') || name.includes('/')) return args;
  const hits = readdirSync(join(ROOT, 'patterns'), { withFileTypes: true }).filter((g) => g.isDirectory() && existsSync(join(ROOT, 'patterns', g.name, name)));
  return hits.length === 1 ? [`${hits[0].name}/${name}`, ...args.slice(1)] : args;
}

/** `motion capture` without --name: the --out basename (the brand capture does the same). */
function withDefaultName(args) {
  if (args.some((a) => a === '--name' || a.startsWith('--name='))) return args;
  const i = args.findIndex((a) => a === '--out' || a.startsWith('--out='));
  if (i < 0) return args;
  const out = args[i].startsWith('--out=') ? args[i].slice(6) : args[i + 1];
  if (!out || out.startsWith('--')) return args;
  return [...args, '--name', basename(out).replace(/\.json$/, '')];
}

/** Commands whose script is another lane's: it owns its flags and rejects unknown ones itself (exit 2, no stack). */
const SELF_VALIDATING = new Set(['check', 'pattern lint', 'motion capture']);

/** The first `--flag` in `args` that the command's usage line does not list (null when all are known). */
function unknownFlag(key, args) {
  if (SELF_VALIDATING.has(key)) return null;
  const known = new Set(USAGE[key][0].match(/--[a-z][a-z-]*/g));
  for (const a of args) {
    if (a === '--') return null;
    if (a.startsWith('--') && !known.has(a.split('=')[0])) return a;
  }
  return null;
}

const badFlag = (key, flag) => ({ error: `mm ${key}: unknown option ${flag}\n${usageText(key)}`, code: 2 });

/**
 * What `mm <argv>` should do: { help, code } to print and exit; { list } for `pattern list`;
 * { script, args, label } to delegate; { error, code } for a usage mistake.
 */
export function plan(argv) {
  const [verb, ...rest] = argv;
  if (!verb) return { help: HELP, code: 2, toStderr: true };
  if (verb === 'help' || verb === '--help' || verb === '-h') return { help: HELP, code: 0 };
  if (verb === '--version' || verb === '-v') return { help: JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version, code: 0 };
  const wantsHelp = rest.some((a) => a === '--help' || a === '-h');
  if (GROUPS[verb] || verb === 'pattern') {
    const [sub, ...args] = rest;
    const subs = GROUP_USAGE[verb];
    if (!sub || sub === '--help' || sub === '-h') return { help: usageText(verb), code: sub ? 0 : 2, toStderr: !sub };
    if (!subs.includes(sub)) return { error: `mm ${verb}: expected ${subs.join(' | ')}\n${usageText(verb)}`, code: 2 };
    if (wantsHelp) return { help: usageText(`${verb} ${sub}`), code: 0 };
    const bad = unknownFlag(`${verb} ${sub}`, args);
    if (bad) return badFlag(`${verb} ${sub}`, bad);
    if (verb === 'pattern' && sub === 'list') return { list: true };
    const script = GROUPS[verb][sub];
    let out = args;
    if (verb === 'pattern') out = qualify(args[0], args);
    if (verb === 'motion' && sub === 'capture') out = withDefaultName(args);
    return { script, args: out, label: `${verb} ${sub}` };
  }
  if (VERBS[verb]) {
    if (wantsHelp) return { help: usageText(verb), code: 0 };
    const bad = unknownFlag(verb, rest);
    if (bad) return badFlag(verb, bad);
    return { script: VERBS[verb], args: rest, label: verb };
  }
  return { error: `mm: unknown verb "${verb}"\n\n${HELP}`, code: 2 };
}

function delegate(script, args, label) {
  const file = join(HERE, script);
  if (!existsSync(file)) {
    console.error(`mm ${label}: not built yet (scripts/${script}).`);
    return 2;
  }
  // asynchronous, so a stop signal sent to mm reaches the verb too (a verb such as `mm studio` runs until stopped)
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file, ...args], { stdio: 'inherit' });
    const pass = (sig) => child.kill(sig);
    const sigs = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    for (const s of sigs) process.on(s, pass);
    const done = (code) => { for (const s of sigs) process.off(s, pass); resolve(code); };
    child.on('error', (e) => { console.error(`mm ${label}: ${e.message}`); done(2); });
    child.on('exit', (code, signal) => done(code ?? (signal === 'SIGINT' ? 130 : signal ? 143 : 2)));
  });
}

/** `pattern list` is pattern-lint's own judgement of completeness (AXIOM 4), not a second check. */
async function patternList() {
  let listComplete;
  try { ({ listComplete } = await import('./pattern-lint.mjs')); } catch (e) { console.error(`mm pattern list: cannot load scripts/pattern-lint.mjs: ${e.message}`); return 2; }
  if (typeof listComplete !== 'function') { console.error('mm pattern list: scripts/pattern-lint.mjs does not export listComplete'); return 2; }
  const all = listComplete();
  console.log(all.length ? all.join('\n') : '(no complete patterns yet)');
  return 0;
}

async function main(argv) {
  const p = plan(argv);
  if (p.help) { (p.toStderr ? console.error : console.log)(p.help); return p.code; }
  if (p.error) { console.error(p.error); return p.code; }
  if (p.list) return patternList();
  return delegate(p.script, p.args, p.label);
}

const isEntry = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) process.exitCode = await main(process.argv.slice(2));
