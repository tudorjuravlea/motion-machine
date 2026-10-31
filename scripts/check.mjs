#!/usr/bin/env node
// mm check (SPEC §7): opens the piece once per format in render mode, runs every rule file in
// scripts/check/, writes out/check.json and exits 0 (all G- pass), 1 (any G- fails) or 2 (setup
// or usage). A rule that cannot apply reports SKIP with a reason (AXIOM 8); an id with no rule
// file yet is reported as SKIP, never as PASS. The report names the story version, the head of the
// story's edit journal (the last edit it saw: `mm export` refuses a report older than the last edit) and the formats
// it checked, and `complete: false` on exit 2; it is written whole once the run ends, so a run
// interrupted (SIGINT, SIGTERM, SIGHUP: exit 130, 143, 129) writes none and the previous report
// stays. --progress prints a line per format and rule on stderr.
//
// Rule files: scripts/check/<RULE-ID>.mjs, `export default async function (ctx) → rule | rule[]`,
// optional `export const scope = 'piece' | 'format'` ('piece' runs once and may find ctx.page
// null; 'format' runs per format and only when the page opened). ctx:
//   { dir, root, story (resolved), rawStory, style, kind, format, formats, floors, schedule, patterns, patternsBase,
//     page, mm, meta: { duration, presses, scenes, fonts, warnings, format }, errors, requests,
//     server, browser, sub, mountError, cache, sample(instant) }
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, SLOW_FRAME_MS, launchBrowser, openPiece, serveRoot } from './lib/browser.mjs';
import { UsageError, usageText } from './lib/cli.mjs';
import { patternsBaseOf } from './lib/patterns-base.mjs';
import { rule, writeReport } from './lib/report.mjs';
import { versionOf } from './lib/story-version.mjs';
import { journalHead } from './lib/story-edit.mjs';
import { resolveStory, forFormat, schedule as buildSchedule, addImplicitPlays } from '../runtime/kit/schedule.js';
import { contractError, floorsFor, refsOf, sample, isWithin } from './check/_lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const RULES_DIR = join(HERE, 'check');

/** SPEC §7 ids in report order: the rules that fail the gate (G-), then the ones that advise (W-). */
export const IDS = ['G-TIME', 'G-DETERMINISM', 'G-LOCAL', 'G-BRAND', 'G-PLACEHOLDER', 'G-LEGIBLE', 'G-REST', 'G-EDGE', 'G-OVERLAP',
  'G-LOOP', 'G-END', 'G-PATTERN-REF', 'G-FACT-REF', 'G-PEAK',
  'W-HOOK', 'W-DEAD', 'W-QUIET', 'W-LENGTH', 'W-SCENE-END', 'W-LOUDNESS', 'W-LITERAL', 'W-PATTERN-CARD', 'W-PROVENANCE',
  'W-FADE-ONLY', 'W-READ', 'W-CUE', 'W-DUR-LITERAL', 'W-BAN', 'W-SUB', 'W-CONTRAST', 'W-PACE', 'W-HOLD', 'W-EMPTY', 'W-ENTRANCE',
  'W-STAGGER', 'W-AMBIENT', 'W-CAPTION', 'W-OVERSHOOT', 'W-MIX', 'W-ASK', 'W-FACE', 'W-GEN-BRAND',
  'W-ANCHOR', 'W-POP', 'W-DEADSTOP', 'W-FOCUS', 'W-TOKENS', 'W-SEAM', 'W-LOOP', 'W-SAMEBOX', 'W-ASSET-LICENSE', 'W-PALETTE', 'W-SAMPLE-LICENSE'];

export { patternsBaseOf };
export class SetupError extends Error {}

const readText = (file) => {
  if (!existsSync(file)) throw new SetupError(`missing ${file}`);
  return readFileSync(file, 'utf8');
};
const parseJson = (file, text) => { try { return JSON.parse(text); } catch (e) { throw new SetupError(`${file}: ${e.message}`); } };
const readJson = (file) => parseJson(file, readText(file));

/** Pattern modules the schedule reads ({ dur, spring }), imported in Node from the piece's base. */
export async function loadPatterns(story, base) {
  const out = {};
  for (const { ref } of refsOf(story)) {
    if (out[ref] !== undefined || ref.startsWith('layouts/') || ref.startsWith('sound/')) continue;
    const file = join(base, ref, 'pattern.js');
    out[ref] = null;
    if (!existsSync(file)) continue;
    try { out[ref] = (await import(pathToFileURL(file).href)).default ?? null; } catch { out[ref] = null; }
  }
  return Object.fromEntries(Object.entries(out).filter(([, m]) => m));
}

export async function loadRules(dir = RULES_DIR) {
  const files = readdirSync(dir).filter((f) => /^[GW]-[A-Z0-9-]+\.mjs$/.test(f)).sort();
  const mods = [];
  for (const f of files) {
    const m = await import(pathToFileURL(join(dir, f)).href);
    if (typeof m.default !== 'function') continue;
    mods.push({ file: f, id: f.replace(/\.mjs$/, ''), scope: m.scope === 'format' ? 'format' : 'piece', run: m.default });
  }
  return mods;
}

// A browser whose pages record every request and its outcome (G-LOCAL reads them).
function recording(browser, log) {
  return {
    newPage: async (opts) => {
      const page = await browser.newPage(opts);
      page.setDefaultTimeout(SLOW_FRAME_MS);
      page.on('request', (r) => log.push({ url: r.url(), status: null, failed: null, entry: r }));
      page.on('response', (res) => { const e = log.find((x) => x.entry === res.request()); if (e) e.status = res.status(); });
      page.on('requestfailed', (r) => { const e = log.find((x) => x.entry === r); if (e) e.failed = r.failure()?.errorText ?? 'failed'; });
      return page;
    },
    close: async () => {},
  };
}

const RANK = { FAIL: 3, WARN: 2, PASS: 1, SKIP: 0 };

/** The warning rule each key of a style's `gate` block tunes. */
export const TUNED_BY = { length: 'W-LENGTH', deadS: 'W-DEAD', quietS: 'W-QUIET', read: 'W-READ', liftBans: 'W-BAN', anchor: 'W-ANCHOR', tokens: 'W-TOKENS', seamPct: 'W-SEAM', sameBox: 'W-SAMEBOX' };

/**
 * Runs the gate over one piece. Returns { rules, code, crashed, schedule, version, journal, formats, tuned } (`tuned`: the warning rules the style's gate block tunes). Pass
 * `browser` and `server` to share them across pieces (tests); `formats` to restrict; `sub` for W-SUB;
 * `progress(line)` to hear each format and rule as it starts.
 */
export async function runCheck(dir, { formats, format, sub = null, browser, server, rulesDir = RULES_DIR, only = null, progress = null } = {}) {
  dir = resolve(dir);
  if (!isWithin(dir, ROOT)) throw new SetupError(`piece must live under the repo root: ${dir}`);
  const journal = journalHead(dir);   // the last edit this check will have seen (verify after edit)
  const storyText = readText(join(dir, 'story.json'));
  let story = parseJson(join(dir, 'story.json'), storyText);
  const style = readJson(join(dir, 'style.json'));
  for (const [name, value] of [['story', story], ['style', style]]) {
    const err = contractError(name, value);
    if (err) throw new SetupError(`${name}.json does not match contracts/${name}.schema.json: ${err}`);
  }
  // `fx: "style:<role>"` and a scene's `position` resolve through the style first, so every
  // rule reads concrete pattern refs and cuts (ctx.story is the resolved story; ctx.rawStory as written).
  const written = story;
  const fmts = formats ?? (format ? [format] : written.formats);
  for (const f of fmts) if (!floorsFor(written.kind, f)) throw new SetupError(`unknown format ${f}`);
  // each format reads its own scenes (a scene's variants); a story with none reads the same
  // story in every format. the kit adds screen/play to a recording with no play, and so does this.
  const metaOf = (asset) => { try { return JSON.parse(readFileSync(join(dir, asset, 'media.json'), 'utf8')); } catch { return null; } };
  const hasVariants = written.scenes.some((sc) => sc.variants && Object.keys(sc.variants).length);
  const patternsBase = patternsBaseOf(dir);
  const per = {};
  for (const f of fmts) {
    const raw = forFormat(written, f);
    let s;
    try { s = resolveStory(raw, style); } catch (e) { throw new SetupError(`story: ${e.message}`); }
    addImplicitPlays(s, metaOf);
    const pats = await loadPatterns(s, patternsBase);
    let sch;
    try { sch = buildSchedule(s, style, { patterns: pats }); } catch (e) { throw new SetupError(`schedule${hasVariants ? ` (${f})` : ''}: ${e.message}`); }
    per[f] = { rawStory: raw, story: s, patterns: pats, schedule: sch };
  }
  ({ story } = per[fmts[0]]);
  let rules = await loadRules(rulesDir);
  if (only) rules = rules.filter((r) => only.includes(r.id));

  const ownBrowser = !browser, ownServer = !server;
  // without Playwright's signal handlers: a stop signal ends the run at once, with no report (main)
  const rows = [];
  let crashed = false, mountFailed = null;
  try {
    browser ??= await launchBrowser({ handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
    server ??= await serveRoot(ROOT);
    for (let i = 0; i < fmts.length; i++) {
      const fmt = fmts[i];
      const requests = [];
      let piece = null, mountError = null;
      try { piece = await openPiece(dir, { format: fmt, browser: recording(browser, requests), server, trap: true }); } catch (e) { mountError = String(e.message ?? e).split('\n')[0].replace(/^piece did not open: /, ''); mountFailed = mountError; }
      let meta = null;
      if (piece) {
        meta = await piece.page.evaluate(() => ({ duration: window.mm.duration ?? null, presses: window.mm.presses ?? null, scenes: window.mm.scenes,
          fonts: window.mm.fonts ?? [], warnings: window.mm.warnings ?? [], format: window.mm.format }));
        const { schedule } = per[fmt];
        const mine = story.kind === 'deck' ? schedule.presses : schedule.duration;
        const theirs = story.kind === 'deck' ? meta.presses : meta.duration;
        if (Math.abs(mine - theirs) > 1e-6) { await piece.close(); throw new SetupError(`the gate's schedule (${mine}) disagrees with the kit's (${theirs}); patterns base ${relative(ROOT, patternsBase)}`); }
      }
      const ctx = {
        dir, root: ROOT, story: per[fmt].story, rawStory: per[fmt].rawStory, style, kind: story.kind, format: fmt, formats: fmts, floors: floorsFor(story.kind, fmt),
        schedule: per[fmt].schedule, patterns: per[fmt].patterns, patternsBase, page: piece?.page ?? null, mm: piece?.mm ?? null, meta, errors: piece?.errors ?? [],
        requests, server, browser, sub, mountError, cache: {},
      };
      ctx.sample = (t) => sample(ctx, t);
      for (const r of rules) {
        if (r.scope === 'piece' && i > 0 && !hasVariants) continue;   // with variants, each format's scenes are checked
        progress?.(`${fmt} (${i + 1}/${fmts.length}): ${r.id}`);
        if (r.scope === 'format' && !piece) { rows.push({ ...rule(r.id, 'SKIP', { reason: `piece did not open: ${mountError}` }), format: fmt }); continue; }
        try {
          const out = await r.run(ctx);
          for (const row of [out].flat().filter(Boolean)) rows.push({ ...row, format: r.scope === 'format' ? fmt : null });
        } catch (e) {
          crashed = true;
          rows.push({ id: r.id, status: r.id.startsWith('G-') ? 'FAIL' : 'WARN', evidence: { reason: `rule crashed: ${e.message}`, crash: true }, format: fmt });
        }
      }
      if (piece) await piece.close();
    }
  } finally {
    if (ownBrowser) await browser?.close();
    if (ownServer) await server?.close();
  }

  // One row per id: the worst status across formats wins, with its evidence.
  const byId = new Map();
  for (const r of rows) {
    const cur = byId.get(r.id);
    if (!cur || RANK[r.status] > RANK[cur.status]) byId.set(r.id, r);
  }
  const ids = only ?? IDS;
  const out = [];
  for (const id of [...ids, ...[...byId.keys()].filter((k) => !ids.includes(k)).sort()]) {
    const r = byId.get(id);
    if (!r) { if (!only) out.push(rule(id, 'SKIP', { reason: `no rule file scripts/check/${id}.mjs yet` })); continue; }
    const evidence = { ...r.evidence };
    if (r.format && fmts.length > 1) evidence.format ??= r.format;
    out.push({ id: r.id, status: r.status, evidence });
  }
  const anyFail = out.some((r) => r.status === 'FAIL' && r.id.startsWith('G-'));
  const code = crashed ? 2 : anyFail ? 1 : mountFailed ? 2 : 0;
  return { rules: out, code, crashed, mountError: mountFailed, schedule: per[fmts[0]].schedule, version: versionOf(storyText), formats: fmts, journal, tuned: Object.keys(style.gate ?? {}).map((k) => TUNED_BY[k]).filter(Boolean) };
}

function usage(msg) {
  if (msg) console.error(`mm check: ${msg}`);
  console.error(usageText('check'));
  return 2;
}

const SIGNAL_EXIT = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };

export async function main(argv = process.argv.slice(2)) {
  const opts = { quiet: false, json: false, progress: false };
  let dir = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format') opts.format = argv[++i];
    else if (a === '--sub') opts.sub = Number(argv[++i]);
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--progress') opts.progress = true;
    else if (a.startsWith('--')) return usage(`unknown flag ${a}`);
    else if (!dir) dir = a;
    else return usage(`unexpected argument ${a}`);
  }
  if (!dir) return usage('name a piece folder');
  if (opts.sub != null && !(opts.sub >= 1)) return usage('--sub takes a positive integer');
  // interrupted, the gate writes no report: a partial one would read as a pass. The browser,
  // launched without Playwright's signal handlers, is killed by Playwright's exit handler.
  for (const sig of Object.keys(SIGNAL_EXIT)) process.on(sig, () => process.exit(SIGNAL_EXIT[sig]));
  let result;
  try {
    result = await runCheck(dir, { format: opts.format, sub: opts.sub ?? null, progress: opts.progress ? (line) => process.stderr.write(`mm check: ${line}\n`) : null });
  } catch (e) {
    if (e instanceof SetupError || e instanceof UsageError) { console.error(`mm check: ${e.message}`); return 2; }
    throw e;
  }
  const code = writeReport(resolve(dir), result.rules, { quiet: opts.quiet || opts.json, version: result.version, formats: result.formats, journal: result.journal, complete: result.code !== 2, tuned: result.tuned });
  if (opts.json) console.log(JSON.stringify({ rules: result.rules }, null, 2));
  else if (opts.quiet && code === 1) {   // quiet drops the per-rule lines, not the verdict
    const failed = result.rules.filter((r) => r.status === 'FAIL').map((r) => r.id);
    console.error(`mm check: ${failed.length} rule${failed.length === 1 ? '' : 's'} failed: ${failed.join(', ')}. Report: ${join(resolve(dir), 'out', 'check.json')}`);
  }
  if (result.mountError) console.error(`mm check: piece did not open: ${result.mountError}`);
  if (result.crashed) console.error('mm check: a rule crashed (see evidence.crash); exit 2');
  return result.code === 2 ? 2 : code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (e) => { console.error(e); process.exitCode = 2; });
}
