// W-DEAD (SPEC §7, §12, provisional 4 s): a film has no window longer than 4 s
// without an arrival, a departure, a cut or a move keyframe (a move's start and end), counting
// the stretch from the last keyframe to the end. Read from the schedule. A warning: a long held
// hero shot can be the most expensive-looking moment of a film. A style's `gate.deadS` sets its own window.
import { rule } from '../lib/rule.mjs';
import { EPS, round } from './_pure.mjs';

export const WINDOW_S = 4;

export function keyframes(schedule) {
  const ts = [0, schedule.duration];
  for (const e of schedule.events) {
    if (e.kind === 'arrive' || e.kind === 'depart' || e.kind === 'cut') ts.push(e.t);
    if (e.kind === 'move') ts.push(e.t, e.t + (e.d ?? 0));
  }
  return [...new Set(ts.map((t) => round(Math.min(schedule.duration, t), 6)))].sort((a, b) => a - b);
}

export default async function (ctx) {
  if (ctx.schedule.kind === 'deck') return rule('W-DEAD', 'SKIP', { reason: 'a deck waits on the presenter; dead time is a film rule' });
  const ts = keyframes(ctx.schedule);
  let worst = { gap: 0 };
  for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > worst.gap) worst = { gap: ts[i] - ts[i - 1], from: ts[i - 1], to: ts[i] };
  const window = ctx.style?.gate?.deadS ?? WINDOW_S;
  if (worst.gap > window + EPS) return rule('W-DEAD', 'WARN', { instant: worst.from, measured: round(worst.gap), threshold: window, reason: `nothing arrives, leaves, cuts or moves from ${worst.from}s to ${worst.to}s` });
  return rule('W-DEAD', 'PASS', { measured: round(worst.gap), threshold: window });
}
