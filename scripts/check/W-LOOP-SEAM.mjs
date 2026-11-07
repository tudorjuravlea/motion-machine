// W-LOOP-SEAM (SPEC §7, provisional): a loop repeats, so the change entering it must match the change leaving it, not only
// the position (G-LOOP judges that). The change between frame 0 and frame 1 is compared with the change between the last
// two exported frames: the mean per-channel difference of the two difference images, over the larger of the two changes.
// 0 is the same movement carried across the seam; 1 is movement against stillness; 2 is the same speed the other way.
// Above MAX_MISMATCH it warns. Both changes under FLOOR_LEVELS (mean levels of 255) are stillness and match: a loop that
// eases to rest at its end and starts from rest passes, a loop that leaves mid-movement and starts still does not. Only a story of
// kind "loop" is read, from rendered pixels. A style's `gate.loopSeam` sets the limit.
import { rule } from '../lib/report.mjs';
import { framePng } from '../lib/browser.mjs';
import { decodePng } from './_pixels.mjs';
import { round } from './_lib.mjs';

export const MAX_MISMATCH = 0.5;
export const FLOOR_LEVELS = 0.1;   // fixtures/negatives/G-LOOP/ok reads 0, G-LOOP/auto 0.057 (an eased settle), W-LOOP-SEAM 0.76 (a loop that leaves mid-exit)
const FPS = 30;

/** { share, entering, leaving }: the mismatch of the change a→b with the change c→d, and the two mean changes in levels. */
export function motionMismatch(a, b, c, d) {
  let enter = 0, leave = 0, diff = 0, n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const e = b.data[i + k] - a.data[i + k], l = d.data[i + k] - c.data[i + k];
      enter += Math.abs(e); leave += Math.abs(l); diff += Math.abs(l - e); n++;
    }
  }
  const entering = enter / n, leaving = leave / n;
  if (Math.max(entering, leaving) < FLOOR_LEVELS) return { share: 0, entering, leaving };
  return { share: diff / n / Math.max(entering, leaving), entering, leaving };
}

export default async function (ctx) {
  if (ctx.story?.kind !== 'loop') return rule('W-LOOP-SEAM', 'SKIP', { reason: 'not a loop: only a story of kind "loop" has a seam' });
  if (!ctx.page) return rule('W-LOOP-SEAM', 'SKIP', { reason: 'partial: the piece did not open in a browser' });
  const limit = ctx.style?.gate?.loopSeam ?? MAX_MISMATCH;
  const end = ctx.schedule.duration, frames = [0, 1 / FPS, Math.max(0, end - 2 / FPS), Math.max(0, end - 1 / FPS)];
  const imgs = [];
  for (const t of frames) imgs.push(decodePng(await framePng(ctx.page, t)));
  const { share, entering, leaving } = motionMismatch(imgs[0], imgs[1], imgs[2], imgs[3]);
  const evidence = { measured: round(share, 3), threshold: limit, entering: round(entering, 3), leaving: round(leaving, 3), frames: 4, ...(Math.max(entering, leaving) < FLOOR_LEVELS ? { still: true } : {}) };
  if (share > limit) return rule('W-LOOP-SEAM', 'WARN', { ...evidence, instant: round(frames[2], 3), reason: `the loop leaves at ${round(leaving, 2)} levels a frame and enters at ${round(entering, 2)}: the movement across the seam differs by ${round(share, 2)} of the larger, above ${limit}; let the last frames move as the first ones do` });
  return rule('W-LOOP-SEAM', 'PASS', evidence);
}
