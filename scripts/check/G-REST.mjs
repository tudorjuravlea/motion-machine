// G-REST (SPEC §7, AXIOM 9): a rest is a finished picture. Deck: at every rest 0..presses no element
// reports progress strictly between 0 and 1. Film: likewise at each settle rest, for that scene's
// elements. A deck press drawn mid-entrance breaks the deck, so this fails. A film scene that ends
// with an element still moving is W-SCENE-END's, a warning. Reads the kit's report().
import { rule } from '../lib/report.mjs';
import { firstMidEntrance, settleProbes } from './_rest.mjs';

export const scope = 'format';

export default async function (ctx) {
  const probes = settleProbes(ctx.schedule);
  if (!probes.length) return rule('G-REST', 'SKIP', { reason: 'no scene of the film rests: every scene ends while something still arrives (W-SCENE-END reads the scene ends)' });
  const mid = await firstMidEntrance(ctx, probes);
  if (mid) return rule('G-REST', 'FAIL', { instant: mid.t, selector: mid.selector, measured: mid.progress, reason: `mid-entrance at ${mid.scene ? `the rest of scene ${mid.scene}` : `rest ${mid.t}`}` });
  return rule('G-REST', 'PASS', { instants: probes.length });
}
