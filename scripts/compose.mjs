#!/usr/bin/env node
// `compose --brand <name|path> --motion <name|path> --out <path> [--name <style-name>]`
// (`mm style compose`, SPEC §3): merges a brand half and a motion half into the composed
// style the kit reads, records `from`, validates, and refuses to write an invalid file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validators } from './lib/validate.mjs';
import { ROOT } from './lib/browser.mjs';
import { isArgsError, usageText } from './lib/cli.mjs';
import { unsafeStyleValues } from './lib/style-values.mjs';

export { ROOT };
const explain = (v) => (v.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode });

/**
 * A half given as a bare name (`paper`) lives in styles/<kind>/ (a shipped one) or, failing that,
 * is `./<name>.json` in the current folder; anything with a slash or .json is a path (a captured half).
 */
export function resolveHalf(kind, ref) {
  const dir = kind === 'brand' ? 'brands' : 'motion';
  const isPath = /[\\/]|\.json$/.test(ref);
  const cands = isPath ? [resolve(ref)] : [join(ROOT, 'styles', dir, `${ref}.json`), resolve(`${ref}.json`)];
  const abs = cands.find((c) => existsSync(c));
  if (!abs) throw fail(`${kind} half not found: ${ref} (looked in ${cands.join(', ')}; a captured half is passed as its .json path)`, 2);
  return abs;
}

const slashed = (p) => p.split(sep).join('/');

/**
 * What `from` records for a half: its repo-relative path when it lives in the repo, else its path relative to the
 * composed file (`out`), so the style and its halves can move together. A half outside the repo needs an `out`.
 */
function recordedPath(abs, kind, out) {
  const rel = relative(ROOT, abs);
  if (!(rel.startsWith('..') || isAbsolute(rel))) return slashed(rel);
  if (!out) throw fail(`the ${kind} half is outside the repo, so \`from\` can only record it relative to the composed file; give compose an --out: ${abs}`, 2);
  return slashed(relative(dirname(resolve(out)), abs));
}

/** Rewrites each font and ground mark `src` that resolves beside the half to a path relative to the composed file; any other `src` (a repo path) stays as written. */
function rebaseSrcs(b, halfFile, out) {
  const base = dirname(resolve(out));
  const rebase = (holder) => {
    const abs = typeof holder.src === 'string' ? resolve(dirname(halfFile), holder.src) : null;
    if (abs && existsSync(abs)) holder.src = slashed(relative(base, abs));
  };
  for (const face of Object.values(b.type)) for (const file of face.files ?? []) rebase(file);
  if (b.ground?.mark) rebase(b.ground.mark);
  if (b.imagery?.references) b.imagery.references = b.imagery.references.map((src) => { const h = { src }; rebase(h); return h.src; });
}

/**
 * Composes two halves. `from` overrides the recorded paths (skill-new records paths inside the
 * skill folder); by default they are the repo-relative paths of the files read. `out` is where
 * the style will be written: it makes a half outside the repo recordable (relative to `out`) and
 * rebases the half's own font and mark paths to it.
 */
export function compose({ brand, motion, name, from, out }) {
  const brandFile = resolveHalf('brand', brand);
  const motionFile = resolveHalf('motion', motion);
  const b = JSON.parse(readFileSync(brandFile, 'utf8'));
  const m = JSON.parse(readFileSync(motionFile, 'utf8'));
  const v = validators();
  if (!v.brand(b)) throw fail(`brand half ${brand} is invalid: ${explain(v.brand)}`, 1);
  const unsafe = unsafeStyleValues(b);
  if (unsafe.length) throw fail(`brand half ${brand} has values that cannot go into a style: ${unsafe.join('; ')}`, 1);
  if (!v.motion(m)) throw fail(`motion half ${motion} is invalid: ${explain(v.motion)}`, 1);
  const recorded = from ?? { brand: recordedPath(brandFile, 'brand', out), motion: recordedPath(motionFile, 'motion', out) };
  if (out) rebaseSrcs(b, brandFile, out);
  const style = {
    name: name ?? `${b.name}-${m.name}`,
    version: b.version,
    fictional: b.fictional,
    from: recorded,
    color: b.color, type: b.type, scale: b.scale, space: b.space, radius: b.radius, composition: b.composition, ...(b.devices ? { devices: b.devices } : {}), ...(b.ground ? { ground: b.ground } : {}), ...(b.finish ? { finish: b.finish } : {}), ...(b.surface ? { surface: b.surface } : {}), ...(b.mascot ? { mascot: b.mascot } : {}), ...(b.patterns ? { patterns: b.patterns } : {}), ...(b.imagery ? { imagery: b.imagery } : {}), ...(b.voice ? { voice: b.voice } : {}), ...(b.music ? { music: b.music } : {}), ...(b.ask?.length ? { ask: b.ask } : {}), bans: b.bans, allow: b.allow,
    motion: m.motion, sound: b.sound?.profile || b.sound?.licences ? { ...m.sound, ...(b.sound.profile ? { profile: b.sound.profile } : {}), ...(b.sound.licences ? { licences: b.sound.licences } : {}) } : m.sound, transitions: m.transitions, entrances: m.entrances, pacing: m.pacing, ...(m.gate ? { gate: m.gate } : {}),
  };
  if (!v.style(style)) throw fail(`the composition of ${brand} x ${motion} is invalid: ${explain(v.style)}`, 1);
  return style;
}

export function composeToFile({ brand, motion, out, name, from }) {
  const style = compose({ brand, motion, name, out, from });
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), `${JSON.stringify(style, null, 2)}\n`);
  return style;
}

export function main(argv) {
  try {
    const a = parseArgs({ args: argv, options: { brand: { type: 'string' }, motion: { type: 'string' }, out: { type: 'string' }, name: { type: 'string' } }, strict: true }).values;
    if (!a.brand || !a.motion || !a.out) throw fail(usageText('style compose'), 2);
    const style = composeToFile(a);
    console.log(`wrote ${a.out} (${style.name}: ${style.from.brand} x ${style.from.motion})`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('style compose')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
