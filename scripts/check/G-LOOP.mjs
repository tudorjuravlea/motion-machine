// G-LOOP: a story of kind "loop" repeats, so its last frame must be its first: the
// frame at t = 0 and the last exported frame (duration minus one frame at 30 fps) may differ in at
// most 0.2 % of their pixels by more than 6 levels on any channel (antialiasing noise; provisional).
// Any other kind is SKIP. Read from rendered pixels.
import { rule } from '../lib/report.mjs';
import { framePng } from '../lib/browser.mjs';
import { decodePng } from './_pixels.mjs';
import { round } from './_lib.mjs';

export const MAX_SHARE = 0.002;
const LEVELS = 6;

export default async function (ctx) {
  if (ctx.story?.kind !== 'loop') return rule('G-LOOP', 'SKIP', { reason: 'not a loop: only a story of kind "loop" must end on its first frame' });
  if (!ctx.page) return rule('G-LOOP', 'SKIP', { reason: 'partial: the piece did not open in a browser' });
  const last = Math.max(0, ctx.schedule.duration - 1 / 30);
  const a = decodePng(await framePng(ctx.page, 0)), b = decodePng(await framePng(ctx.page, last));
  let off = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) > LEVELS || Math.abs(a.data[i + 1] - b.data[i + 1]) > LEVELS || Math.abs(a.data[i + 2] - b.data[i + 2]) > LEVELS) off++;
  }
  const share = off / (a.data.length / 4);
  if (share > MAX_SHARE) return rule('G-LOOP', 'FAIL', { instant: round(last, 3), measured: `${round(share * 100, 2)} %`, threshold: `${MAX_SHARE * 100} %`, reason: `the last frame (t = ${round(last, 3)} s) differs from the first in ${round(share * 100, 2)} % of its pixels, so the loop jumps` });
  return rule('G-LOOP', 'PASS', { measured: `${round(share * 100, 3)} %`, threshold: `${MAX_SHARE * 100} %` });
}
