// G-PATTERN-REF (SPEC §4): every layout, cut, move, fx, exit and emphasis the story names resolves
// to a pattern folder in the piece's patterns base holding the file the kit loads, and every cue a beat
// names to a folder patterns/sound/<cue>/ holding pattern.js or recipe.json; a pattern the
// kit could not load at mount fails too, and so does a particle emitter the style's brand has not allowed
// (no `particles` block). Screen actions: every mark a screen action names is
// carried by the screen it acts on (schedule.js screenIssues, read from media.json on disk). The
// screen warnings the kit and the schedule raise (`screen: …`: a play rate the kit replaces, a deck
// step past its scene, a screen slot with no [data-screen], a laptop menu cut to 5, a ui story on a device the format cannot hold) make it WARN,
// and so does a beat param that is a likely typo of one its patterns or the kit read. A missing pattern, cue or
// param names the nearest known one (scripts/lib/suggest.mjs) in its `fix`.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { rule } from '../lib/report.mjs';
import { screenIssues, uiScreenIssues } from '../../runtime/kit/schedule.js';
import { ROOT, cueRefsOf, refsOf, resolvesPattern } from './_lib.mjs';
import { resolvePatternsBase } from '../sound.mjs';
import { cueFiles } from '../lib/sound-profile.mjs';
import { particlesOf } from '../../runtime/kit/emit.js';
import { didYouMean } from '../lib/suggest.mjs';

// every pattern a story could name: group/name folders under the piece's patterns base and the library's
function knownPatterns(...bases) {
  const out = new Set();
  for (const base of bases) {
    if (!existsSync(base)) continue;
    for (const g of readdirSync(base, { withFileTypes: true })) if (g.isDirectory() && g.name !== 'sound') {
      for (const p of readdirSync(join(base, g.name), { withFileTypes: true })) if (p.isDirectory()) out.add(`${g.name}/${p.name}`);
    }
  }
  return [...out].sort();
}
const cuesIn = (base) => { try { return readdirSync(join(base, 'sound'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return []; } };
const meant = (guess) => (guess ? `Did you mean ${guess}? ` : '');
// the kit's own beat params, read whatever the pattern (kit README, Param routing)
const KIT_PARAMS = ['instant', 'dur', 'spring', 'each', 'sep', 'stagger', 'exit', 'emphasis', 'cue', 'frame', 'move'];

/** Beat params that are a likely typo of a param the beat's patterns or the kit read: each with its suggestion. */
export function misspeltParams(story, patterns) {
  const out = [];
  for (const sc of story.scenes) for (const b of sc.beats) {
    const known = [...KIT_PARAMS, ...[b.fx, b.emphasis, b.exit].flatMap((r) => Object.keys(patterns?.[r]?.params ?? {}))];
    for (const key of Object.keys(b.params ?? {})) {
      if (known.includes(key)) continue;
      const guess = didYouMean(key, known, {});
      if (guess) out.push({ where: `${sc.id}.${b.slot}.params.${key}`, key, guess });
    }
  }
  return out;
}

const mediaOf = (dir) => (asset) => { try { return JSON.parse(readFileSync(join(dir, asset, 'media.json'), 'utf8')); } catch { return null; } };

export default async function (ctx) {
  const missing = refsOf(ctx.story).filter((r) => !resolvesPattern(ctx.patternsBase, r.ref));
  const kit = (ctx.meta?.warnings ?? []).filter((w) => /^pattern .* did not load/.test(w));
  if (missing.length) {
    const guess = didYouMean(missing[0].ref, knownPatterns(ctx.patternsBase, join(ROOT, 'patterns')));
    return rule('G-PATTERN-REF', 'FAIL', { selector: missing[0].where, measured: missing[0].ref, reason: `no pattern ${missing[0].ref} under ${relative(ROOT, ctx.patternsBase)}`, fix: `${meant(guess)}Name a pattern that exists (mm pattern list).`, ...(guess ? { suggest: guess } : {}), missing });
  }
  const soundBase = resolvePatternsBase(ctx.dir, ctx.patternsBase);
  const noCue = cueRefsOf(ctx.story).filter((c) => { const f = cueFiles(soundBase, c.cue); return !f.js && !f.recipe; });
  if (noCue.length) return rule('G-PATTERN-REF', 'FAIL', { selector: noCue[0].where, measured: `sound/${noCue[0].cue}`, fix: `${meant(didYouMean(noCue[0].cue, cuesIn(soundBase)))}Name a cue that patterns/sound/ holds.`, reason: `no cue ${noCue[0].cue}: patterns/sound/${noCue[0].cue}/ holds neither pattern.js nor recipe.json under ${relative(ROOT, join(soundBase, 'sound'))}`, missing: noCue });
  if (kit.length) return rule('G-PATTERN-REF', 'FAIL', { reason: kit[0], all: kit });
  // the particle emitter is opt-in: a story that names one needs the brand's `particles` block
  const emitters = refsOf(ctx.story).filter((r) => ctx.patterns?.[r.ref]?.emitter);
  if (emitters.length && !particlesOf(ctx.style)) return rule('G-PATTERN-REF', 'FAIL', { selector: emitters[0].where, measured: emitters[0].ref, reason: `${emitters[0].ref} is a particle emitter, which a brand allows with a particles block (roles, max, area) in its style; this style has none, so it would draw nothing`, missing: emitters });
  const { fail, warn } = screenIssues(ctx.story, mediaOf(ctx.dir), ctx.style, ctx.patterns);
  if (fail.length) return rule('G-PATTERN-REF', 'FAIL', { reason: fail[0].replace(/^screen: /, ''), all: fail });
  const screen = [...new Set([...warn, ...uiScreenIssues(ctx.story, ctx.format), ...(ctx.schedule?.warnings ?? []), ...(ctx.meta?.warnings ?? [])].filter((w) => w.startsWith('screen: ')))];
  if (screen.length) return rule('G-PATTERN-REF', 'WARN', { reason: screen[0].replace(/^screen: /, ''), all: screen });
  const typos = misspeltParams(ctx.story, ctx.patterns);
  if (typos.length) return rule('G-PATTERN-REF', 'WARN', { selector: typos[0].where, measured: typos[0].key, reason: `params.${typos[0].key} is read by no pattern of the beat and not by the kit, so it does nothing`, fix: `Did you mean ${typos[0].guess}? Rename the param.`, suggest: typos[0].guess, all: typos.map((t) => `${t.where} (did you mean ${t.guess}?)`) });
  return rule('G-PATTERN-REF', 'PASS', { refs: new Set(refsOf(ctx.story).map((r) => r.ref)).size, base: relative(ROOT, ctx.patternsBase) });
}
