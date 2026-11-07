// W-POP (SPEC §7): a single frame that differs sharply from both its neighbours while they match each
// other is a pop: one wrong frame in the middle of a motion (a flash of the end state, a layer drawn a
// frame early, a value that jumps and comes back). Read from frames sampled densely across each
// entrance, exit and move (./_strips.mjs; a cut's own span is left out and so is a motion on a device's
// screen). A deck is SKIP: its motion plays on presses, not on a clock. The strips are read in the first
// format only (the motion is one clock in every format; a story with `variants` is read in each): that bounds the cost.
import { rule } from '../lib/rule.mjs';
import { FPS, POP_RETURN, POP_SHARE, strips, readsHere } from './_strips.mjs';

export const scope = 'format';

export default async function (ctx) {
  if (ctx.kind === 'deck') return rule('W-POP', 'SKIP', { reason: 'a deck plays its motion on presses; frame pops are a film reading' });
  if (!readsHere(ctx)) return rule('W-POP', 'SKIP', { reason: `read in ${ctx.formats[0]}: a film's motion is one clock in every format` });
  const s = await strips(ctx);
  const threshold = `a frame ${POP_SHARE * 100} % different from both neighbours, which differ from each other by under ${POP_RETURN * 100} % of that`;
  if (s.pops.length) {
    const p = s.pops[0];
    return rule('W-POP', 'WARN', { instant: p.instant, selector: p.selector, measured: p.measured, threshold, framesRead: s.framesRead, pops: s.pops.slice(0, 20), reason: `frame ${p.frame} (${p.instant} s) differs from the frames either side of it, which match each other: one frame of a motion is wrong` });
  }
  if (s.capped) return rule('W-POP', 'SKIP', { partial: true, framesRead: s.framesRead, reason: `partial: only the first ${s.framesRead} frames of motion were read (the cost bound)` });
  if (!s.framesRead) return rule('W-POP', 'SKIP', { reason: 'the film has no entrance, exit or move with frames of its own to read' });
  return rule('W-POP', 'PASS', { framesRead: s.framesRead, fps: FPS, threshold });
}
