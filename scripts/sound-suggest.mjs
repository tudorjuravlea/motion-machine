#!/usr/bin/env node
// `mm sound suggest [piece] [--budget 5] [--apply]` (SPEC §9).
//
//   the film's schedule ──► every moment that could take a sound (entrances, type-ons, counters' ends, cuts,
//   presses on a screen, exits, settles) ──► a cue, a weight and a frame for each ──► a choice under a budget,
//   each role's minimum gap, two at once at most and a hook in the first 2 s ──► out/sound-suggest.json and a table.
//
// Nothing is written to the story until `--apply`, which writes the chosen cues as beat `cue` fields through the
// story-edit service (one receipt in out/studio/journal.jsonl, `mm timeline <piece> undo` takes it back). It never
// overwrites a cue a beat already has, writes only cues that exist under patterns/sound/, and lists the rest as
// "needs cue". A row of out/sound-suggest.json marked `"approved": false` is left out (the file is honoured when it
// was made from the story as it is now). Films only: a deck's cues sit on presses.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { UsageError, resolvePiece, runMain, usageText } from './lib/cli.mjs';
import { loadPatterns } from './check.mjs';
import { patternsBaseOf } from './lib/patterns-base.mjs';
import { addImplicitPlays, forFormat, resolveStory, schedule as buildSchedule } from '../runtime/kit/schedule.js';
import { cueEvents } from './lib/cues.mjs';
import { loadCueModules, resolvePatternsBase } from './sound.mjs';
import { editStory, readStory, readStyle } from './lib/story-edit.mjs';
import { budgetFor, editsOf, proposalOf, settingsOf, tableOf } from './lib/sound-suggest.mjs';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const metaOf = (dir) => (asset) => { try { return readJson(join(dir, asset, 'media.json')); } catch { return null; } };

/** The proposal for the piece in `dir`: { proposal, story, version, base, mods }. */
export async function suggest(dir, { budget = null } = {}) {
  const { story, version } = readStory(dir);
  if (story.kind === 'deck') throw new UsageError('a deck\'s cues sit on presses, not on a clock: `mm sound suggest` proposes for films');
  const style = readStyle(dir);
  const resolved = resolveStory(forFormat(story, null), style);
  addImplicitPlays(resolved, metaOf(dir));
  const patterns = await loadPatterns(resolved, patternsBaseOf(dir));
  const schedule = buildSchedule(resolved, style, { patterns });
  const cfg = settingsOf(style);
  const existing = cueEvents(schedule).filter((c) => c.name !== 'bed').map((c) => ({ t: c.t, name: c.name }));
  const base = resolvePatternsBase(dir);
  const mods = await loadCueModules([...Object.values(cfg.cues), ...existing.map((c) => c.name)], base);
  const cueMeta = (name) => mods[name] ?? {};
  const b = budgetFor({ flag: budget, style });
  const proposal = proposalOf({ schedule, story: resolved, style, existing, budgetPer10s: b.perTen, exists: (c) => Boolean(mods[c]), cueMeta });
  proposal.storyVersion = version;
  if (b.note) proposal.note = b.note;
  return { proposal, version, base, style };
}

/** Rows the person marked `approved: false` in a proposal file made from the story as it is now. */
function leftOut(file, version) {
  if (!existsSync(file)) return new Set();
  try {
    const j = readJson(file);
    if (j.storyVersion !== version) return new Set();
    return new Set((j.chosen ?? []).filter((r) => r.approved === false).map((r) => r.id));
  } catch { return new Set(); }
}

export async function main(argv) {
  const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: { budget: { type: 'string' }, apply: { type: 'boolean' } } });
  if (p.length > 1) throw new UsageError(`sound suggest takes one piece\n${usageText('sound suggest')}`);
  let budget = null;
  if (v.budget != null) {
    budget = Number(v.budget);
    if (!(budget > 0 && budget <= 30)) throw new UsageError(`--budget is a number of cues per 10 s above 0 and at most 30, not "${v.budget}"`);
  }
  const dir = resolvePiece(p[0]);
  const file = join(dir, 'out', 'sound-suggest.json');
  const { proposal, version } = await suggest(dir, { budget });
  const skip = leftOut(file, version);
  for (const r of proposal.chosen) if (skip.has(r.id)) r.approved = false;
  mkdirSync(join(dir, 'out'), { recursive: true });
  writeFileSync(file, `${JSON.stringify(proposal, null, 2)}\n`);
  console.log(tableOf(proposal));
  if (proposal.note) console.log(`note: ${proposal.note}`);
  const needs = [...new Set(proposal.chosen.filter((r) => r.apply === 'needs cue').map((r) => r.cue))];
  if (needs.length) console.log(`needs cue: ${needs.join(', ')} (no folder under patterns/sound/ yet: not written)`);
  const loose = proposal.chosen.filter((r) => r.apply === 'needs beat');
  if (loose.length) console.log(`needs beat: ${loose.length} row${loose.length > 1 ? 's' : ''} no beat of the story would sound at (a beat's cue plays as the beat arrives): add a beat at ${loose.map((r) => r.t.toFixed(2)).join(', ')} s to carry them`);
  console.log(`proposal: ${relative(process.cwd(), file) || file}`);
  if (!v.apply) {
    const n = editsOf(proposal.chosen).length;
    console.log(n ? `${n} cue${n > 1 ? 's' : ''} would be written: run again with --apply` : 'nothing to write');
    return 0;
  }
  const edits = editsOf(proposal.chosen);
  if (!edits.length) { console.log('applied: nothing to write'); return 0; }
  const res = await editStory(dir, { edits, version, who: 'cli', label: `sound suggest: ${edits.length} cue${edits.length > 1 ? 's' : ''}` });
  console.log(`applied: ${edits.length} cue${edits.length > 1 ? 's' : ''} written to story.json${res.receipt ? ` (receipt ${res.receipt.id}; \`mm timeline ${relative(process.cwd(), dir) || '.'} undo\` takes it back)` : ''}`);
  return 0;
}

runMain(import.meta, () => main(process.argv.slice(2)));
