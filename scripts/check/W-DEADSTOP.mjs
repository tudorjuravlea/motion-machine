// W-DEADSTOP (SPEC §7): two ways a motion stops being a motion, read from the frames sampled across
// each entrance, exit and move (./_strips.mjs).
//   - a dead stop, or a front-loaded ease: one frame step carries at least JUMP_SHARE of the change
//     of the whole motion and the frames after it stand still: the object jumped, then waited out the
//     rest of its time.
//   - a stitch: one element's motion ends abruptly, at most STITCH_GAP frames stand still, and a
//     different motion of the same element starts abruptly (an entrance then an emphasis that begins
//     at full speed): one gesture drawn in two pieces. Suggest one gesture: let the first run into the second.
// A deck is SKIP. The strips are read in the first format only (the motion is one clock
// in every format; a story with `variants` is read in each): that bounds the cost.
import { rule } from '../lib/rule.mjs';
import { JUMP_SHARE, STITCH_GAP, strips, readsHere } from './_strips.mjs';

export const scope = 'format';

export default async function (ctx) {
  if (ctx.kind === 'deck') return rule('W-DEADSTOP', 'SKIP', { reason: 'a deck plays its motion on presses; dead stops are a film reading' });
  if (!readsHere(ctx)) return rule('W-DEADSTOP', 'SKIP', { reason: `read in ${ctx.formats[0]}: a film's motion is one clock in every format` });
  const s = await strips(ctx);
  const threshold = `one frame step under ${JUMP_SHARE * 100} % of a motion's change; at most ${STITCH_GAP} still frames between two abrupt motions`;
  if (s.deadStops.length) {
    const d = s.deadStops[0];
    return rule('W-DEADSTOP', 'WARN', { instant: d.instant, selector: d.selector, measured: d.share, threshold, framesRead: s.framesRead, deadStops: s.deadStops.slice(0, 20),
      reason: `${d.selector} (${d.kind}) makes ${Math.round(d.share * 100)} % of its change in one frame at ${d.instant} s, then stands still for ${d.still} frames: a front-loaded ease or a dead stop; ease the whole duration` });
  }
  if (s.stitches.length) {
    const t = s.stitches[0];
    return rule('W-DEADSTOP', 'WARN', { instant: t.instant, selector: t.selector, measured: t.gap, threshold, framesRead: s.framesRead, stitches: s.stitches.slice(0, 20),
      reason: `${t.selector}: its ${t.from} stops and its ${t.to} starts ${t.gap} frame${t.gap === 1 ? '' : 's'} later, both at speed; make it one gesture` });
  }
  if (s.capped) return rule('W-DEADSTOP', 'SKIP', { partial: true, framesRead: s.framesRead, reason: `partial: only the first ${s.framesRead} frames of motion were read (the cost bound)` });
  if (!s.framesRead) return rule('W-DEADSTOP', 'SKIP', { reason: 'the film has no entrance, exit or move with frames of its own to read' });
  return rule('W-DEADSTOP', 'PASS', { framesRead: s.framesRead, threshold });
}
