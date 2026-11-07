// W-QUIET (SPEC §7, §12, provisional 2 s from motion-media practice). Film: at least 2 s between
// the last arrival and the end. Deck: the last press introduces at most one element.
// A warning: ending on the beat or on a hard cut is a choice. A style's `gate.quietS` sets its own tail.
import { rule } from '../lib/rule.mjs';
import { EPS, round } from './_pure.mjs';

export const QUIET_S = 2;

export default async function (ctx) {
  const s = ctx.schedule;
  const arrivals = s.events.filter((e) => e.kind === 'arrive');
  if (s.kind === 'deck') {
    const last = arrivals.filter((e) => e.press === s.presses);
    if (last.length > 1) return rule('W-QUIET', 'WARN', { press: s.presses, selector: last.map((e) => e.selector).join(', '), measured: last.length, threshold: 1, reason: `the last press brings ${last.length} elements; it may bring one` });
    return rule('W-QUIET', 'PASS', { press: s.presses, measured: last.length, threshold: 1 });
  }
  const tail = ctx.style?.gate?.quietS ?? QUIET_S;
  if (!arrivals.length) return rule('W-QUIET', 'PASS', { measured: s.duration, threshold: tail });
  const lastT = Math.max(...arrivals.map((e) => e.t));
  const quiet = s.duration - lastT;
  const e = arrivals.find((x) => x.t === lastT);
  if (quiet < tail - EPS) return rule('W-QUIET', 'WARN', { instant: round(lastT), selector: e.selector, measured: round(quiet), threshold: tail, reason: `the last arrival is ${round(quiet)}s before the end` });
  return rule('W-QUIET', 'PASS', { instant: round(lastT), measured: round(quiet), threshold: tail });
}
