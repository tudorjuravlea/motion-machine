#!/usr/bin/env node
// node scripts/footage-eval.mjs [--dir evals/footage-cuts] [--words-only] [--json] [--min-recall 0] [--min-precision 0]
// The score of `mm footage review` against gold fixtures (evals/footage-cuts/). A fixture is a words file
// (<name>.words.json, the format `footage review` reads) and its gold (<name>.gold.json): the clip's length,
// the sound to synthesise (evals/footage-cuts/synth.mjs), and three lists of spans in seconds of the sound:
//   mustCut      what a good proposal removes (the false start, the stumble, the dead air)
//   optionalCut  what it may remove without being wrong
//   mustKeep     what no cut may touch: a cut into one is a HARD failure, whatever else it scores
// Recall is the share of mustCut spans the proposed cuts cover (at least FOUND_SHARE of the span); precision
// the share of proposed cuts that lie (at least JUSTIFIED_SHARE of each) in a mustCut or optionalCut span.
// With nothing to cut recall is 1; with nothing proposed precision is 1. --words-only proposes from the words
// alone (no sound), the way review runs without --audio. Exit 0, 1 when any cut touches a mustKeep span or the
// pooled recall or precision is under --min-recall / --min-precision, 2 usage. tests/kit/footage-eval.test.mjs
// pins the score: a rule change that loses quality fails it.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isArgsError } from './lib/cli.mjs';
import { analyse } from './lib/footage-acoustic.mjs';
import { mergeSpans, review } from './lib/footage-review.mjs';
import { checkTranscript } from './lib/footage-words.mjs';
import { RATE, synthesize } from '../evals/footage-cuts/synth.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES = join(ROOT, 'evals', 'footage-cuts');

/** A mustCut span is found when the proposed cuts cover at least this share of it. */
export const FOUND_SHARE = 0.5;
/** A proposed cut is justified when at least this share of it lies inside mustCut and optionalCut spans. */
export const JUSTIFIED_SHARE = 0.5;
/** A cut that reaches into a mustKeep span by more than this many seconds is a hard failure. */
export const KEEP_TOLERANCE_S = 0.02;

const r3 = (x) => Math.round(x * 1000) / 1000;
const overlap = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
const covered = (span, others) => mergeSpans(others.map((o) => ({ s: o.start, e: o.end }))).reduce((n, o) => n + overlap(span, { start: o.s, end: o.e }), 0);

/** { mustCut, found, recall, cuts, justified, precision, violations, missed, unjustified } for proposed `cuts` against a gold. */
export function score(cuts, gold) {
  const mustCut = gold.mustCut ?? [], optional = gold.optionalCut ?? [], keep = gold.mustKeep ?? [];
  const missed = mustCut.filter((m) => covered(m, cuts) < FOUND_SHARE * (m.end - m.start) - 1e-9);
  const allowed = [...mustCut, ...optional];
  const unjustified = cuts.filter((c) => covered(c, allowed) < JUSTIFIED_SHARE * (c.end - c.start) - 1e-9);
  const violations = cuts.flatMap((c) => keep.filter((k) => overlap(c, k) > KEEP_TOLERANCE_S)
    .map((k) => ({ cut: c.id, kind: c.kind, start: c.start, end: c.end, keep: k.note ?? `${k.start}-${k.end}`, overlapS: r3(overlap(c, k)) })));
  const found = mustCut.length - missed.length, justified = cuts.length - unjustified.length;
  return {
    mustCut: mustCut.length, found, recall: mustCut.length ? r3(found / mustCut.length) : 1,
    cuts: cuts.length, justified, precision: cuts.length ? r3(justified / cuts.length) : 1,
    violations, missed: missed.map((m) => m.note ?? `${m.start}-${m.end}`), unjustified: unjustified.map((c) => `${c.id} ${c.kind} ${c.start}-${c.end}`),
  };
}

/**
 * Runs `review` on a fixture ({ name, words, duration, sound?, ... }) and scores it. `hear: false` proposes
 * from the words alone, as `mm footage review` does without --audio.
 */
export function evaluate(fixture, { hear = true } = {}) {
  const words = checkTranscript(fixture.words).words;
  const sound = hear ? analyse(synthesize(fixture), RATE) : null;
  const proposal = review(words, { sound, ...(fixture.maxPause ? { maxPause: fixture.maxPause } : {}) });
  return { name: fixture.name, ...score(proposal.cuts, fixture) };
}

/** The fixtures of a folder: [{ name, words, ...gold }], by name. Throws when a words file has no gold or the folder none. */
export function loadFixtures(dir) {
  const names = readdirSync(dir).filter((f) => f.endsWith('.gold.json')).map((f) => f.slice(0, -'.gold.json'.length)).sort();
  if (!names.length) throw new Error(`no *.gold.json fixture in ${dir}`);
  return names.map((name) => {
    const words = join(dir, `${name}.words.json`);
    if (!existsSync(words)) throw new Error(`${name}: ${name}.gold.json has no ${name}.words.json beside it`);
    return { name, ...JSON.parse(readFileSync(join(dir, `${name}.gold.json`), 'utf8')), words: JSON.parse(readFileSync(words, 'utf8')) };
  });
}

/** The scores of a folder: { fixtures: [...], recall, precision, violations } with recall and precision pooled over every span and cut. */
export function evaluateDir(dir, options) {
  const fixtures = loadFixtures(dir).map((f) => evaluate(f, options));
  const sum = (k) => fixtures.reduce((n, f) => n + f[k], 0);
  const ratio = (a, b) => (b ? r3(a / b) : 1);
  return { fixtures, recall: ratio(sum('found'), sum('mustCut')), precision: ratio(sum('justified'), sum('cuts')), violations: fixtures.reduce((n, f) => n + f.violations.length, 0) };
}

const USAGE = 'usage: node scripts/footage-eval.mjs [--dir evals/footage-cuts] [--words-only] [--json] [--min-recall 0] [--min-precision 0]';
const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode });

export async function main(argv) {
  try {
    const { values: v } = parseArgs({ args: argv, allowPositionals: false, strict: true, options: {
      dir: { type: 'string' }, 'words-only': { type: 'boolean' }, json: { type: 'boolean' }, 'min-recall': { type: 'string' }, 'min-precision': { type: 'string' } } });
    const minRecall = Number(v['min-recall'] ?? 0), minPrecision = Number(v['min-precision'] ?? 0);
    if (!(minRecall >= 0 && minRecall <= 1) || !(minPrecision >= 0 && minPrecision <= 1)) throw fail('--min-recall and --min-precision are shares from 0 to 1', 2);
    const dir = v.dir ? resolve(v.dir) : FIXTURES;
    if (!existsSync(dir)) throw fail(`no such folder: ${dir}`, 2);
    let result;
    try { result = evaluateDir(dir, { hear: !v['words-only'] }); } catch (e) { throw fail(e.message, 2); }
    if (v.json) console.log(JSON.stringify(result, null, 2));
    else {
      for (const f of result.fixtures) {
        console.log(`${f.name}: recall ${f.found}/${f.mustCut}, precision ${f.justified}/${f.cuts}${f.violations.length ? `, ${f.violations.length} HARD FAILURES` : ''}`);
        for (const m of f.missed) console.log(`  missed: ${m}`);
        for (const u of f.unjustified) console.log(`  not asked for: ${u}`);
        for (const x of f.violations) console.log(`  HARD: ${x.cut} (${x.kind}, ${x.start}-${x.end} s) cuts into "${x.keep}" by ${x.overlapS} s`);
      }
      console.log(`total: recall ${result.recall}, precision ${result.precision}, ${result.violations} hard failures`);
    }
    return result.violations || result.recall < minRecall || result.precision < minPrecision ? 1 : 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${USAGE}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
