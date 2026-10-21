// G-LENGTH (SPEC §4, §12, provisional): a film runs 20 to 60 s; a deck has 6 to 20 presses.
import { rule } from '../lib/rule.mjs';
import { EPS, round } from './_pure.mjs';

export const FILM_S = [20, 60];
export const DECK_PRESSES = [6, 20];
export const LOOP_S = [4, 15];   // a post or GIF that repeats

export default async function (ctx) {
  const s = ctx.schedule;
  const loop = ctx.story?.kind === 'loop';
  const [lo, hi] = s.kind === 'deck' ? DECK_PRESSES : loop ? LOOP_S : FILM_S;
  const v = s.kind === 'deck' ? s.presses : s.duration;
  const unit = s.kind === 'deck' ? ' presses' : 's';
  if (v < lo - EPS || v > hi + EPS) return rule('G-LENGTH', 'FAIL', { measured: round(v), threshold: `${lo}–${hi}${unit}`, reason: `${loop ? 'loop' : s.kind} is ${round(v)}${unit}, outside ${lo}–${hi}${unit}` });
  return rule('G-LENGTH', 'PASS', { measured: round(v), threshold: `${lo}–${hi}${unit}` });
}
