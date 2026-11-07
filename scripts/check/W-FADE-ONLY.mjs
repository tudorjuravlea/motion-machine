// W-FADE-ONLY (SPEC §7, §15; ban `fade-only`): more than 70 % of the piece's entrances are plain
// fades. Fade stays a pattern; only a piece that uses little else is flagged.
import { rule } from '../lib/rule.mjs';
import { banActive, round } from './_pure.mjs';

export const RATIO = 0.7;
export const FADES = new Set(['entrances/fade']);

export default async function (ctx) {
  if (!banActive(ctx.style, 'fade-only')) return rule('W-FADE-ONLY', 'SKIP', { reason: 'the style does not ban fade-only (or lifts it in allow)' });
  const items = ctx.schedule.items;
  if (!items.length) return rule('W-FADE-ONLY', 'SKIP', { reason: 'no entrances' });
  const fades = items.filter((it) => FADES.has(it.fx)).length;
  const r = fades / items.length;
  return rule('W-FADE-ONLY', r > RATIO ? 'WARN' : 'PASS', { measured: round(r), threshold: RATIO, ...(r > RATIO ? { reason: `${fades} of ${items.length} entrances are fades` } : {}) });
}
