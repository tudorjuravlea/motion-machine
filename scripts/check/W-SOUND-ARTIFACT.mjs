// W-SOUND-ARTIFACT (SPEC §7, §9; provisional): every cue the piece plays is checked, as the mix will play it, for the defects a
// synthesised or sampled cue shows: a click (a jump inside the waveform, or a start or end off zero), a DC offset, clipping, a
// truncated tail, a metallic comb ring in the tail, a tail that rises again, stacked attacks (of a hit) and a rising glide (the
// synth whip). One warning per finding, naming the cue, the defect and its measure. A cue is the sound as W-PALETTE draws it: a
// recipe voiced by the style's profile (none needed) at the beat's emphasis, gain and seed; a sample as `mm sound` places it; a
// code cue as the library draws it in the style's palette. A deck, no cues, or palette "none": SKIP. A code cue that does not
// live in the repository's patterns/sound/ cannot be drawn here and is named as not measured, which makes a clean result SKIP
// with `partial: true`, never PASS. The detectors are scripts/lib/sound-artifacts.mjs.
import { join, resolve } from 'node:path';
import { rule } from '../lib/report.mjs';
import { paramsOf } from '../../runtime/kit/params.js';
import { renderRecipe } from '../../runtime/kit/synth.js';
import { cueEvents, loadCueModules, resolvePatternsBase } from '../sound.mjs';
import { loadProfile } from '../lib/sound-profile.mjs';
import { sampleMap } from '../lib/sound-sample.mjs';
import { findArtifacts } from '../lib/sound-artifacts.mjs';
import { ROOT } from './_lib.mjs';

const SR = 48000;
const AT = 0.05;

export default async function (ctx) {
  if (ctx.schedule?.kind === 'deck') return rule('W-SOUND-ARTIFACT', 'SKIP', { reason: 'deck cues sit on presses, not on a clock' });
  if (ctx.style?.sound?.palette === 'none') return rule('W-SOUND-ARTIFACT', 'SKIP', { reason: 'style.sound.palette is "none": cues are not rendered' });
  const events = cueEvents(ctx.schedule).filter((c) => c.name !== 'bed');
  if (!events.length) return rule('W-SOUND-ARTIFACT', 'SKIP', { reason: 'the schedule has no cues' });
  let profile = null;
  const ref = ctx.style?.sound?.profile;
  if (ref) { try { profile = loadProfile(ref, ctx.dir); } catch { profile = null; } }      // an unreadable profile is W-PALETTE's to name; a cue is judged without one

  const base = resolvePatternsBase(ctx.dir, ctx.patternsBase);
  const samples = sampleMap(ctx.story, ctx.style, ctx.dir);
  const mods = await loadCueModules(events.map((c) => c.name), base, profile, { samples });
  const palette = ctx.style?.sound?.palette ?? 'soft-ui';

  // one reading per distinct cue and params; the first beat that plays it is where a finding is reported
  const reads = new Map();
  for (const c of events) {
    const mod = mods[c.name];
    if (!mod) { reads.set(`${c.name}|`, { c, unresolved: true }); continue; }
    const opts = paramsOf(mod, c.params, ctx.style);
    const key = `${c.name}|${JSON.stringify(opts)}`;
    if (!reads.has(key)) reads.set(key, { c, mod, opts });
  }

  const unmeasured = [], rows = [], findings = [];
  let renderer = null;
  try {
    for (const r of reads.values()) {
      const { c, mod, opts } = r;
      if (r.unresolved) { unmeasured.push(`${c.name}: no sound pattern or sample`); continue; }
      let channels = null;
      if (mod.sample) channels = mod.channels.map((ch) => ch.map((x) => x * Number(opts.gain ?? 1)));
      else if (mod.recipe) channels = renderRecipe(mod.recipe, { sampleRate: SR, emphasis: opts.emphasis, gain: Number(opts.gain ?? 1), seed: Number(opts.seed) >>> 0, profile }).channels;
      else if (resolve(base) === join(ROOT, 'patterns')) {
        renderer ??= await (await import('../lib/cue-render.mjs')).openRenderer();
        channels = (await renderer.renderChannels([{ cue: c.name, at: AT, feel: palette, opts }], { seconds: 2.5, sampleRate: SR })).channels;
      }
      if (!channels) { unmeasured.push(`${c.name}: a code cue outside the library's patterns/sound/ cannot be drawn here`); continue; }
      const found = findArtifacts(channels, SR, { cue: c.name });
      rows.push({ cue: c.name, at: c.t, kind: mod.sample ? 'sample' : mod.recipe ? 'recipe' : 'code', found: found.map((f) => f.kind) });
      for (const f of found) findings.push({ cue: c.name, kind: f.kind, instant: c.t, selector: c.selector, measured: f.measured, message: `${c.name}: ${f.message}` });
    }
  } finally { await renderer?.close(); }

  const evidence = { cues: rows.length, ...(unmeasured.length ? { unmeasured } : {}) };
  if (findings.length) return rule('W-SOUND-ARTIFACT', 'WARN', { ...evidence, instant: findings[0].instant, selector: findings[0].selector, measured: findings.length, reason: findings.map((f) => f.message).join('; '), findings, readings: rows });
  if (!rows.length) return rule('W-SOUND-ARTIFACT', 'SKIP', { ...evidence, partial: true, reason: `no cue could be measured: ${unmeasured.join('; ')}` });
  if (unmeasured.length) return rule('W-SOUND-ARTIFACT', 'SKIP', { ...evidence, partial: true, reason: `partial: ${rows.length} cue(s) are clean; not measured: ${unmeasured.join('; ')}`, readings: rows });
  return rule('W-SOUND-ARTIFACT', 'PASS', { ...evidence, measured: rows.length, readings: rows });
}
