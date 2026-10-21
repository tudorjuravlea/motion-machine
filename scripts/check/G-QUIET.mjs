// G-QUIET (SPEC §7, §12, provisional 2 s from motion-media practice). Film: at least 2 s between
// the last arrival and the end. Deck: the last press introduces at most one element.
import { rule } from '../lib/rule.mjs';
import { EPS, round } from './_pure.mjs';

export const QUIET_S = 2;

export default async function (ctx) {
  const s = ctx.schedule;
  const arrivals = s.events.filter((e) => e.kind === 'arrive');
  if (s.kind === 'deck') {
    const last = arrivals.filter((e) => e.press === s.presses);
    if (last.length > 1) return rule('G-QUIET', 'FAIL', { press: s.presses, selector: last.map((e) => e.selector).join(', '), measured: last.length, threshold: 1, reason: `the last press brings ${last.length} elements; it may bring one` });
    return rule('G-QUIET', 'PASS', { press: s.presses, measured: last.length, threshold: 1 });
  }
  if (!arrivals.length) return rule('G-QUIET', 'PASS', { measured: s.duration, threshold: QUIET_S });
  const lastT = Math.max(...arrivals.map((e) => e.t));
  const quiet = s.duration - lastT;
  const e = arrivals.find((x) => x.t === lastT);
  if (quiet < QUIET_S - EPS) return rule('G-QUIET', 'FAIL', { instant: round(lastT), selector: e.selector, measured: round(quiet), threshold: QUIET_S, reason: `the last arrival is ${round(quiet)}s before the end` });
  return rule('G-QUIET', 'PASS', { instant: round(lastT), measured: round(quiet), threshold: QUIET_S });
}
