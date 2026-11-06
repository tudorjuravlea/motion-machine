// W-READS (SPEC §7, provisional): too much at once. More than five arrivals
// inside any 1.3 s window warns. An arrival is a beat's entrance; the children of one cascade (`data-each`, a beat's
// parts) are one arrival, at the first child. Read from the schedule. A style's `gate.readsMax` and
// `gate.readsWindowS` set the count and the window. A deck is SKIP (its presses are the presenter's).
import { rule } from '../lib/rule.mjs';
import { EPS, round } from './_pure.mjs';

export const READS_MAX = 5;
export const WINDOW_S = 1.3;

/** The most arrivals inside one window (both ends inclusive) and where that window starts: { count, from }. `times` ascending or not. */
export function peakArrivals(times, windowS) {
  const ts = [...times].sort((a, b) => a - b);
  let best = { count: 0, from: 0 };
  for (let i = 0, j = 0; i < ts.length; i++) {
    while (ts[i] - ts[j] > windowS + EPS) j++;
    if (i - j + 1 > best.count) best = { count: i - j + 1, from: ts[j] };
  }
  return best;
}

export default async function (ctx) {
  if (ctx.schedule.kind === 'deck') return rule('W-READS', 'SKIP', { reason: 'a deck waits on the presenter; arrivals per second are a film rule' });
  const max = ctx.style?.gate?.readsMax ?? READS_MAX, windowS = ctx.style?.gate?.readsWindowS ?? WINDOW_S;
  const arrivals = (ctx.schedule.items ?? []).filter((it) => !it.parent && typeof it.start === 'number');
  if (!arrivals.length) return rule('W-READS', 'SKIP', { reason: 'the schedule has no arrivals' });
  const peak = peakArrivals(arrivals.map((it) => it.start), windowS);
  const evidence = { measured: peak.count, threshold: max, windowS, arrivals: arrivals.length };
  if (peak.count > max) return rule('W-READS', 'WARN', { ...evidence, instant: round(peak.from), reason: `${peak.count} arrivals inside ${windowS} s from ${round(peak.from)} s; more than ${max} at once cannot be read` });
  return rule('W-READS', 'PASS', evidence);
}
