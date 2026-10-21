// G-OVERLAP (SPEC §7): at rests no two visible text boxes intersect unless one carries data-over.
// ::before/::after/::marker text is a box of its own; a host and its own generated or
// restyled text (::first-letter, ::first-line) are nested.
import { rule } from '../lib/report.mjs';
import { restInstants, round, texts } from './_lib.mjs';

export const scope = 'format';
const TOL = 0.5;
const host = (s) => s.replace(/::(before|after|marker|first-letter|first-line)$/, '');
const nested = (a, b) => {
  const x = host(a.selector), y = host(b.selector);
  return x === y || y.startsWith(x + ' ') || x.startsWith(y + ' ');
};

export default async function (ctx) {
  let instants = 0, boxes = 0;
  for (const t of restInstants(ctx.schedule)) {
    const s = await ctx.sample(t);
    const list = texts(s);
    instants++; boxes += list.length;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.over || b.over || nested(a, b) || (a.item && a.item === b.item)) continue;
        const w = Math.min(a.ink.x + a.ink.w, b.ink.x + b.ink.w) - Math.max(a.ink.x, b.ink.x);
        const h = Math.min(a.ink.y + a.ink.h, b.ink.y + b.ink.h) - Math.max(a.ink.y, b.ink.y);
        if (w > TOL && h > TOL) return rule('G-OVERLAP', 'FAIL', { instant: round(t), selector: `${a.selector} × ${b.selector}`, measured: `${round(w, 1)}×${round(h, 1)}px`, reason: 'two text boxes intersect at a rest' });
      }
    }
  }
  if (!boxes) return rule('G-OVERLAP', 'SKIP', { reason: 'no text at any rest: no text boxes to compare' });
  return rule('G-OVERLAP', 'PASS', { instants, texts: boxes });
}
