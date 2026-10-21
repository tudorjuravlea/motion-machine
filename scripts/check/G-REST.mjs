// G-REST (SPEC §7, AXIOM 9): nothing is mid-entrance at a rest. Deck: at every rest 0..presses no
// element reports progress strictly between 0 and 1. Film: likewise at each scene's last instant
// and at each settle rest, for that scene's elements. Reads the kit's report().
import { rule } from '../lib/report.mjs';
import { round } from './_lib.mjs';

export const scope = 'format';
const LAST = 1e-3;   // the last instant of a scene: its end minus a millisecond
const TOL = 1e-6;   // progress is u/d in floating point: 0.9999999 at a settle instant is done

export function restProbes(schedule) {
  if (schedule.kind === 'deck') return schedule.rests.map((t) => ({ t, scene: null }));
  const out = schedule.scenes.map((s, i) => ({ t: i === schedule.scenes.length - 1 ? schedule.duration : s.end - LAST, scene: s.id }));
  schedule.holds.forEach((h) => out.push({ t: h.from, scene: h.scene }));
  return out;
}

export default async function (ctx) {
  for (const { t, scene } of restProbes(ctx.schedule)) {
    await ctx.mm.seek(t);
    const rep = await ctx.mm.report();
    const mid = rep.elements.find((e) => (!scene || e.scene === scene) && e.progress > TOL && e.progress < 1 - TOL);
    if (mid) return rule('G-REST', 'FAIL', { instant: round(t), selector: mid.selector, measured: round(mid.progress), reason: `mid-entrance at ${scene ? `the end of scene ${scene}` : `rest ${t}`}` });
  }
  return rule('G-REST', 'PASS', { instants: restProbes(ctx.schedule).length });
}
