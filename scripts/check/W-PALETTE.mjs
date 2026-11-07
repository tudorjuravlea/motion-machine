// W-PALETTE (SPEC §7, §9): when the style sets a sound profile (`sound.profile`), every cue the piece plays is
// measured against it: register (the centre of its sound and the floor), the attack of a struck note, the
// length band of its family, the loudest 100 ms against the profile's level and tolerance, and the peak. A cue
// is the sound as the mix will play it: a recipe voiced by the profile at the beat's emphasis, gain and seed; a
// sample as `mm sound` places it (trimmed, matched to the profile); a code cue as the library draws it in the
// style's palette. One warning per miss, naming the cue, the measure and the band. No profile, no cues, or no
// palette: SKIP. A code cue that does not live in the repository's patterns/sound/ cannot be drawn here and is
// named as not measured, which makes a clean result SKIP with `partial: true`, never PASS.
import { join, resolve } from 'node:path';
import { rule } from '../lib/report.mjs';
import { paramsOf } from '../../runtime/kit/params.js';
import { cueDurationS, recipeOpts, renderRecipe } from '../../runtime/kit/synth.js';
import { cueEvents, loadCueModules, resolvePatternsBase } from '../sound.mjs';
import { loadProfile } from '../lib/sound-profile.mjs';
import { sampleMap } from '../lib/sound-sample.mjs';
import { judgeCue, misses } from '../lib/sound-palette.mjs';
import { ROOT } from './_lib.mjs';

const SR = 48000;
const AT = 0.05;

export default async function (ctx) {
  if (ctx.schedule?.kind === 'deck') return rule('W-PALETTE', 'SKIP', { reason: 'deck cues sit on presses, not on a clock' });
  const ref = ctx.style?.sound?.profile;
  if (!ref) return rule('W-PALETTE', 'SKIP', { reason: 'style.sound.profile is not set: there is no sound look to measure the cues against' });
  if (ctx.style?.sound?.palette === 'none') return rule('W-PALETTE', 'SKIP', { reason: 'style.sound.palette is "none": cues are not rendered' });
  const events = cueEvents(ctx.schedule).filter((c) => c.name !== 'bed');
  if (!events.length) return rule('W-PALETTE', 'SKIP', { reason: 'the schedule has no cues' });
  let profile;
  try { profile = loadProfile(ref, ctx.dir); } catch (e) { return rule('W-PALETTE', 'SKIP', { reason: `the sound profile cannot be read (mm sound names it): ${e.message}` }); }

  const base = resolvePatternsBase(ctx.dir, ctx.patternsBase);
  const samples = sampleMap(ctx.story, ctx.style, ctx.dir);
  const mods = await loadCueModules(events.map((c) => c.name), base, profile, { samples });
  const palette = ctx.style?.sound?.palette ?? 'soft-ui';

  // one reading per distinct cue and params; the first beat that plays it is where a miss is reported
  const reads = new Map();
  for (const c of events) {
    const mod = mods[c.name];
    if (!mod) { reads.set(`${c.name}|`, { c, unresolved: true }); continue; }
    const opts = paramsOf(mod, c.params, ctx.style);
    const key = `${c.name}|${JSON.stringify(opts)}`;
    if (!reads.has(key)) reads.set(key, { c, mod, opts });
  }

  const unmeasured = [], rows = [], reasons = [];
  let renderer = null;
  try {
    for (const r of reads.values()) {
      const { c, mod, opts } = r;
      if (r.unresolved) { unmeasured.push(`${c.name}: no sound pattern or sample`); continue; }
      let channels = null;
      if (mod.sample) channels = mod.channels.map((ch) => ch.map((x) => x * Number(opts.gain ?? 1)));
      else if (mod.recipe) channels = renderRecipe(mod.recipe, { sampleRate: SR, emphasis: opts.emphasis, gain: Number(opts.gain ?? 1), seed: Number(opts.seed) >>> 0, profile, ...recipeOpts(opts) }).channels;
      else if (resolve(base) === join(ROOT, 'patterns')) {
        // a code cue: drawn by the library's own page, in the style's palette
        renderer ??= await (await import('../lib/cue-render.mjs')).openRenderer();
        channels = (await renderer.renderChannels([{ cue: c.name, at: AT, feel: palette, opts }], { seconds: 2.5, sampleRate: SR })).channels;
      }
      if (!channels) { unmeasured.push(`${c.name}: a code cue outside the library's patterns/sound/ cannot be drawn here`); continue; }
      const j = judgeCue(channels, SR, profile, { durationS: mod.recipe ? cueDurationS(mod.recipe, profile, recipeOpts(opts)) : mod.durationS, emphasis: opts.emphasis ?? 'normal' });
      rows.push({ cue: c.name, at: c.t, family: j.family, kind: mod.sample ? 'sample' : mod.recipe ? 'recipe' : 'code', checks: j.checks.map(({ check, ok, measured, band }) => ({ check, ok, measured, band })) });
      for (const m of misses(j)) reasons.push({ cue: c.name, check: m.check, instant: c.t, selector: c.selector, measured: m.measured, band: m.band, message: `${c.name}: ${m.message}` });
    }
  } finally { await renderer?.close(); }

  const evidence = { profile: profile.name, cues: rows.length, ...(unmeasured.length ? { unmeasured } : {}) };
  if (reasons.length) return rule('W-PALETTE', 'WARN', { ...evidence, instant: reasons[0].instant, selector: reasons[0].selector, measured: reasons.length, reason: reasons.map((r) => r.message).join('; '), misses: reasons, readings: rows });
  if (!rows.length) return rule('W-PALETTE', 'SKIP', { ...evidence, partial: true, reason: `no cue could be measured: ${unmeasured.join('; ')}` });
  if (unmeasured.length) return rule('W-PALETTE', 'SKIP', { ...evidence, partial: true, reason: `partial: ${rows.length} cue(s) are inside the profile; not measured: ${unmeasured.join('; ')}`, readings: rows });
  return rule('W-PALETTE', 'PASS', { ...evidence, measured: rows.length, readings: rows });
}
