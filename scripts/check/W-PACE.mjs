// W-PACE (SPEC §3, §7, provisional, from the motion style): arrivals per 10 s outside the motion
// style's pacing.arrivalsPer10s band, counted in consecutive 10 s windows from 0; a final partial
// window of at least 5 s is scaled to 10 s, a shorter one is not judged. A screen action (a scroll,
// a tap, a swap, a play) counts as an arrival: it is new motion on the screen.
import { rule } from '../lib/rule.mjs';
import { EPS, round } from './_pure.mjs';

export const WINDOW_S = 10;

export function paceWindows(schedule) {
  const arrivals = schedule.events.filter((e) => e.kind === 'arrive' || e.screen).map((e) => e.t);
  const out = [];
  for (let from = 0; from < schedule.duration - EPS; from += WINDOW_S) {
    const to = Math.min(schedule.duration, from + WINDOW_S);
    const len = to - from;
    if (len < WINDOW_S / 2 - EPS) break;
    const n = arrivals.filter((t) => t >= from - EPS && t < to - EPS).length;
    out.push({ from, to: round(to), count: n, per10s: round((n * WINDOW_S) / len, 2) });
  }
  return out;
}

export default async function (ctx) {
  if (ctx.story.kind === 'deck') return rule('W-PACE', 'SKIP', { reason: 'deck presses are paced by the presenter, not per 10 s' });
  const band = ctx.style.pacing?.arrivalsPer10s;
  if (!band) return rule('W-PACE', 'SKIP', { reason: 'the style has no pacing.arrivalsPer10s band' });
  const wins = paceWindows(ctx.schedule);
  if (!wins.length) return rule('W-PACE', 'SKIP', { reason: 'film shorter than 5 s: no 10 s window judged' });
  const bad = wins.filter((w) => w.per10s < band[0] - EPS || w.per10s > band[1] + EPS);
  if (bad.length) return rule('W-PACE', 'WARN', { instant: bad[0].from, measured: bad[0].per10s, threshold: `${band[0]}–${band[1]} per 10 s`, reason: `${bad[0].count} arrivals between ${bad[0].from}s and ${bad[0].to}s`, windows: wins });
  return rule('W-PACE', 'PASS', { threshold: `${band[0]}–${band[1]} per 10 s`, windows: wins });
}
