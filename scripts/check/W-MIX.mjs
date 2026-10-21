// W-MIX (SPEC §7, §9): more than two cues sounding at once; a cue retriggered within 45 ms; cue
// peaks outside 6-8 dB above the bed; cues per 10 s outside the style's band; a cue with no visible
// event. Structure comes from the schedule and the sound patterns' durations; peaks come from
// out/cues.json when `mm sound` has run. A sub-check that could not run (no out/cues.json, or a cue
// pattern whose duration had to be guessed) makes a clean result SKIP with `partial: true`, never
// PASS; any finding still WARNs.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rule } from '../lib/report.mjs';
import { BED_BAND_DB, COOLDOWN_S, cueEvents, loadCueModules, resolvePatternsBase } from '../sound.mjs';

const FALLBACK_S = 0.15;
const VISIBLE = new Set(['arrive', 'cut', 'depart', 'move']);
const VISIBLE_WINDOW_S = 0.04;

export default async function (ctx) {
  if (ctx.schedule?.kind === 'deck') return rule('W-MIX', 'SKIP', { reason: 'deck cues sit on presses, not on a clock' });
  const all = cueEvents(ctx.schedule);
  if (!all.length) return rule('W-MIX', 'SKIP', { reason: 'the schedule has no cues' });
  const palette = ctx.style?.sound?.palette;
  if (palette === 'none') return rule('W-MIX', 'SKIP', { reason: 'style.sound.palette is "none": cues are not rendered' });

  const reasons = [];
  const push = (kind, message, c, extra = {}) => reasons.push({ kind, message, instant: c?.t, selector: c?.selector, ...extra });
  const base = resolvePatternsBase(ctx.dir, ctx.patternsBase);
  const mods = await loadCueModules(all.map((c) => c.name), base);
  const dur = (c) => Number(mods[c.name]?.durationS ?? FALLBACK_S);
  const unresolved = [...new Set(all.filter((c) => !mods[c.name]).map((c) => c.name))];
  const cues = all.filter((c) => c.name !== 'bed');

  // 1. no more than two cues sounding at once
  let reported = false;
  for (const c of cues) {
    const live = cues.filter((o) => o.t <= c.t + 1e-9 && o.t + dur(o) > c.t + 1e-9);
    if (live.length > 2 && !reported) { push('overlap', `${live.length} cues sound at ${c.t.toFixed(3)} s (${live.map((o) => o.name).join(', ')}); at most two`, c, { count: live.length }); reported = true; }
  }

  // 2. a cue retriggers no sooner than 45 ms after itself
  const lastOf = new Map();
  for (const c of cues) {
    const prev = lastOf.get(c.name);
    if (prev != null && c.t - prev.t < COOLDOWN_S - 1e-9) push('cooldown', `${c.name} retriggered ${Math.round((c.t - prev.t) * 1000)} ms after itself (cooldown ${COOLDOWN_S * 1000} ms)`, c, { gapMs: Math.round((c.t - prev.t) * 1000) });
    lastOf.set(c.name, c);
  }

  // 3. a cue marks a visible event
  const visible = (ctx.schedule?.events ?? []).filter((e) => VISIBLE.has(e.kind) && typeof e.t === 'number');
  for (const c of all) {
    if (!visible.some((e) => Math.abs(e.t - c.t) <= VISIBLE_WINDOW_S + 1e-9)) push('no-visible-event', `${c.name} at ${c.t.toFixed(3)} s has no arrive, cut, depart or move event within ${VISIBLE_WINDOW_S * 1000} ms`, c);
  }

  // 4. cues per 10 s inside the style's band (the bed is not a cue)
  const band = ctx.style?.sound?.cuesPer10s;
  const total = ctx.schedule?.duration ?? (cues.at(-1)?.t ?? 0);
  if (band && total > 0) {
    const rate = (cues.length / total) * 10;
    if (rate < band[0] - 1e-9 || rate > band[1] + 1e-9) push('rate', `${rate.toFixed(1)} cues per 10 s, the style's band is ${band[0]}-${band[1]}`, null, { measured: rate });
    else if (total > 10) {
      for (const c of cues) {
        const n = cues.filter((o) => o.t >= c.t && o.t < c.t + 10).length;
        if (n > band[1]) { push('rate', `${n} cues in the 10 s from ${c.t.toFixed(1)} s, the band tops out at ${band[1]}`, c, { measured: n }); break; }
      }
    }
  }

  // 5. cue peaks 6-8 dB above the bed (needs the rendered peaks)
  let peaks = 'not measured (no out/cues.json: run `mm sound`)';
  const cuesFile = join(ctx.dir, 'out', 'cues.json');
  if (existsSync(cuesFile)) {
    const j = JSON.parse(readFileSync(cuesFile, 'utf8'));
    const list = Array.isArray(j) ? j : j.cues ?? [];
    const bed = list.find((c) => c.name === 'bed');
    if (!bed) peaks = 'no bed in the mix: nothing to compare against';
    else {
      peaks = 'checked against the bed';
      for (const c of list.filter((x) => x.name !== 'bed')) {
        const d = c.peakDb - bed.peakDb;
        if (d < BED_BAND_DB[0] - 0.05 || d > BED_BAND_DB[1] + 0.05) push('peak', `${c.name} at ${c.at} s peaks ${d.toFixed(1)} dB over the bed, the band is ${BED_BAND_DB[0]}-${BED_BAND_DB[1]} dB`, { t: c.at, selector: c.name }, { measured: d });
      }
    }
  }

  const evidence = { peaks, ...(unresolved.length ? { unresolvedPatterns: unresolved } : {}) };
  const missing = [];
  if (peaks !== 'checked against the bed') missing.push(`peaks ${peaks}`);
  if (unresolved.length) missing.push(`overlap judged with a ${FALLBACK_S} s stand-in for ${unresolved.join(', ')} (no pattern module)`);
  if (!reasons.length && missing.length) return rule('W-MIX', 'SKIP', { ...evidence, partial: true, measured: cues.length, reason: `partial: structure passed; not measured: ${missing.join('; ')}` });
  if (!reasons.length) return rule('W-MIX', 'PASS', { ...evidence, measured: cues.length });
  if (missing.length) evidence.partial = true;
  const first = reasons[0];
  return rule('W-MIX', 'WARN', { instant: first.instant, selector: first.selector, reason: reasons.map((r) => r.message).join('; '), kinds: [...new Set(reasons.map((r) => r.kind))], reasons, ...evidence });
}
