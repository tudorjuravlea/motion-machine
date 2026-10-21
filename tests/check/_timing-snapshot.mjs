// Shared by tests/check/timing*.test.mjs: the schedule-only path of `mm check` without a page. Builds
// each format's ctx the way scripts/check.mjs runCheck does before it opens a browser (contract
// check, forFormat, resolveStory, addImplicitPlays, loadPatterns, schedule), runs the rule files the
// gate runs, and returns their verdicts with the repo root stripped from every string.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { trackedPieces } from './_tracked.mjs';
import { loadPatterns, loadRules, patternsBaseOf } from '../../scripts/check.mjs';
import { floorsFor } from '../../scripts/check/_lib.mjs';
import { resolveStory, forFormat, schedule as buildSchedule, addImplicitPlays } from '../../runtime/kit/schedule.js';

export const SNAPSHOT_FILE = join(ROOT, 'tests', 'check', 'fixtures', 'timing-snapshot.json');

/** The rules the snapshot records (the live gate's TIMING_IDS, fixed before any rule moved). */
export const SNAPSHOT_IDS = ['W-DEAD', 'W-LENGTH', 'W-QUIET', 'W-READ', 'W-PACE', 'W-HOLD', 'W-CUE', 'W-FADE-ONLY', 'W-ASK'];

/**
 * Every tracked film, loop and deck in pieces/ (relative to the repo), plus fixtures for the
 * branches no shipped piece reaches: two loops (one with autoReturn), a variant with its own beats,
 * and one negative per timing rule (its WARN or FAIL branch).
 */
export const FIXTURE_DIRS = [
  'fixtures/negatives/G-LOOP/ok', 'fixtures/negatives/G-LOOP/auto', 'fixtures/negatives/_base/variants',
  ...SNAPSHOT_IDS.map((id) => (id === 'W-QUIET' ? 'fixtures/negatives/W-QUIET/film' : `fixtures/negatives/${id}`)),
];

export function pieceDirs() {
  return [...trackedPieces(), ...FIXTURE_DIRS];
}


const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** Per format: the ctx fields check.mjs hands a 'piece'-scope rule when no page is open. `story` overrides story.json. */
export async function prepare(rel, { story } = {}) {
  const dir = join(ROOT, rel);
  const written = story ?? readJson(join(dir, 'story.json'));
  const style = readJson(join(dir, 'style.json'));
  const metaOf = (asset) => { try { return JSON.parse(readFileSync(join(dir, asset, 'media.json'), 'utf8')); } catch { return null; } };
  const patternsBase = patternsBaseOf(dir);
  const out = {};
  for (const f of written.formats) {
    const raw = forFormat(written, f);
    const s = resolveStory(raw, style);
    addImplicitPlays(s, metaOf);
    const patterns = await loadPatterns(s, patternsBase);
    const schedule = buildSchedule(s, style, { patterns });
    out[f] = {
      dir, root: ROOT, story: s, rawStory: raw, style, kind: written.kind, format: f, formats: written.formats, floors: floorsFor(written.kind, f),
      schedule, patterns, patternsBase, page: null, mm: null, meta: null, errors: [], requests: [], server: null, browser: null, sub: null, mountError: null, cache: {},
    };
  }
  return out;
}

/** Replaces the repo root in every string (evidence may carry a file path). */
export const stripRoot = (value) => JSON.parse(JSON.stringify(value).split(ROOT + '/').join('').split(ROOT).join('.'));

/** { [piece]: { [format]: [{ id, status, evidence }] } } from the gate's own rule files. */
export async function snapshotFromRules(ids = SNAPSHOT_IDS) {
  const rules = (await loadRules()).filter((r) => ids.includes(r.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const out = {};
  for (const rel of pieceDirs()) {
    out[rel] = {};
    for (const [f, ctx] of Object.entries(await prepare(rel))) {
      const rows = [];
      for (const r of rules) for (const row of [await r.run(ctx)].flat().filter(Boolean)) rows.push(row);
      out[rel][f] = stripRoot(rows);
    }
  }
  return out;
}
