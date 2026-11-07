// W-FOCUS (SPEC §7): one thing is fully lit at a time. At each rest the rule groups the visible
// elements by the beat that brought them and finds the beats that carry the accent at full strength
// (text painted in the accent role, or a fill of it, at an effective opacity of at least FULL): two
// or more beats doing so compete for the eye. And a finished text left half-visible (an effective
// opacity above DIM_MIN and under DIM_MAX, its own opacity times its ancestors' times its colour's
// alpha) is a leftover: retire it to 0 or keep it at full. Decoration (`data-decor`), browser chrome
// (`data-chrome`) and a piece's own `data-keep` are left out of the second half; an element still
// arriving is judged once it is in place.
import { rule } from '../lib/rule.mjs';
import { parseColor, restInstants, round } from './_lib.mjs';

export const scope = 'format';
export const FULL = 0.95;
export const DIM_MIN = 0.05;
export const DIM_MAX = 0.5;
const TOL = 2;   // per channel: the accent as the browser rounds it

const alphaOf = (c) => parseColor(c)?.[3] ?? 1;
const isAccent = (color, accent) => {
  const c = parseColor(color);
  return !!c && accent.slice(0, 3).every((v, i) => Math.abs(v - c[i]) <= TOL);
};

export default async function (ctx) {
  const accent = parseColor(ctx.style.color.accent);
  const rests = restInstants(ctx.schedule);
  for (const t of rests) {
    const s = await ctx.sample(t);
    const live = s.probe.elements.filter((e) => !e.moving && !e.structural && !e.pseudo);
    const lit = new Map();
    for (const e of live) {
      if (!e.item || e.decor || e.chrome) continue;
      const strong = (e.text && e.ink && isAccent(e.color, accent) && e.opacity * alphaOf(e.color) >= FULL) || (e.ownBg && isAccent(e.ownBg, accent) && e.opacity * alphaOf(e.ownBg) >= FULL);
      if (strong && !lit.has(e.item)) lit.set(e.item, e.selector);
    }
    if (lit.size > 1) {
      return rule('W-FOCUS', 'WARN', { instant: round(t), selector: [...lit.keys()].join(', '), measured: lit.size, threshold: 1, reason: `${lit.size} beats carry the accent at full strength at once (${[...lit.keys()].join(', ')}): light one and let the rest recede` });
    }
    for (const e of live) {
      if (!e.text || !e.ink || e.decor || e.chrome || e.keep) continue;
      const eff = e.opacity * alphaOf(e.color);
      if (eff > DIM_MIN && eff < DIM_MAX) {
        return rule('W-FOCUS', 'WARN', { instant: round(t), selector: e.selector, measured: round(eff, 2), threshold: `${DIM_MIN}–${DIM_MAX}`, reason: `${e.selector} is left at ${round(eff, 2)} opacity at a rest: retire it to 0 or keep it at full` });
      }
    }
  }
  return rule('W-FOCUS', 'PASS', { instants: rests.length, threshold: 'one lit beat per rest; no text between 5 % and 50 % opacity' });
}
