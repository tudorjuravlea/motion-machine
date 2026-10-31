// G-PATTERN-REF (SPEC §4): every layout, cut, move, fx, exit and emphasis the story names resolves
// to a pattern folder in the piece's patterns base holding the file the kit loads, and every cue a beat
// names to a folder patterns/sound/<cue>/ holding pattern.js or recipe.json; a pattern the
// kit could not load at mount fails too. Screen actions: every mark a screen action names is
// carried by the screen it acts on (schedule.js screenIssues, read from media.json on disk). The
// screen warnings the kit and the schedule raise (`screen: …`: a play rate the kit replaces, a deck
// step past its scene, a screen slot with no [data-screen], a laptop menu cut to 5) make it WARN.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { rule } from '../lib/report.mjs';
import { screenIssues } from '../../runtime/kit/schedule.js';
import { ROOT, cueRefsOf, refsOf, resolvesPattern } from './_lib.mjs';
import { resolvePatternsBase } from '../sound.mjs';
import { cueFiles } from '../lib/sound-profile.mjs';

const mediaOf = (dir) => (asset) => { try { return JSON.parse(readFileSync(join(dir, asset, 'media.json'), 'utf8')); } catch { return null; } };

export default async function (ctx) {
  const missing = refsOf(ctx.story).filter((r) => !resolvesPattern(ctx.patternsBase, r.ref));
  const kit = (ctx.meta?.warnings ?? []).filter((w) => /^pattern .* did not load/.test(w));
  if (missing.length) return rule('G-PATTERN-REF', 'FAIL', { selector: missing[0].where, measured: missing[0].ref, reason: `no pattern ${missing[0].ref} under ${relative(ROOT, ctx.patternsBase)}`, missing });
  const soundBase = resolvePatternsBase(ctx.dir, ctx.patternsBase);
  const noCue = cueRefsOf(ctx.story).filter((c) => { const f = cueFiles(soundBase, c.cue); return !f.js && !f.recipe; });
  if (noCue.length) return rule('G-PATTERN-REF', 'FAIL', { selector: noCue[0].where, measured: `sound/${noCue[0].cue}`, reason: `no cue ${noCue[0].cue}: patterns/sound/${noCue[0].cue}/ holds neither pattern.js nor recipe.json under ${relative(ROOT, join(soundBase, 'sound'))}`, missing: noCue });
  if (kit.length) return rule('G-PATTERN-REF', 'FAIL', { reason: kit[0], all: kit });
  const { fail, warn } = screenIssues(ctx.story, mediaOf(ctx.dir), ctx.style, ctx.patterns);
  if (fail.length) return rule('G-PATTERN-REF', 'FAIL', { reason: fail[0].replace(/^screen: /, ''), all: fail });
  const screen = [...new Set([...warn, ...(ctx.schedule?.warnings ?? []), ...(ctx.meta?.warnings ?? [])].filter((w) => w.startsWith('screen: ')))];
  if (screen.length) return rule('G-PATTERN-REF', 'WARN', { reason: screen[0].replace(/^screen: /, ''), all: screen });
  return rule('G-PATTERN-REF', 'PASS', { refs: new Set(refsOf(ctx.story).map((r) => r.ref)).size, base: relative(ROOT, ctx.patternsBase) });
}
