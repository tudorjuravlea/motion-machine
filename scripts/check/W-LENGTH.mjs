// W-LENGTH (SPEC §4, §12, provisional): a film runs 20 to 60 s; a deck has 6 to 20 presses.
// A warning: a 15 s bumper or a 90 s explainer is a channel choice, so a length outside the band
// advises and never blocks an export. A style's `gate.length` (filmS, loopS, deckPresses) sets its own band.
import { rule } from '../lib/rule.mjs';
import { EPS, round } from './_pure.mjs';

export const FILM_S = [20, 60];
export const DECK_PRESSES = [6, 20];
export const LOOP_S = [4, 15];   // a post or GIF that repeats

export default async function (ctx) {
  const s = ctx.schedule;
  const loop = ctx.story?.kind === 'loop';
  const tuned = ctx.style?.gate?.length ?? {};
  const [lo, hi] = s.kind === 'deck' ? tuned.deckPresses ?? DECK_PRESSES : loop ? tuned.loopS ?? LOOP_S : tuned.filmS ?? FILM_S;
  const v = s.kind === 'deck' ? s.presses : s.duration;
  const unit = s.kind === 'deck' ? ' presses' : 's';
  if (v < lo - EPS || v > hi + EPS) return rule('W-LENGTH', 'WARN', { measured: round(v), threshold: `${lo}–${hi}${unit}`, reason: `${loop ? 'loop' : s.kind} is ${round(v)}${unit}, outside ${lo}–${hi}${unit}` });
  return rule('W-LENGTH', 'PASS', { measured: round(v), threshold: `${lo}–${hi}${unit}` });
}
