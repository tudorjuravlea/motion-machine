// G-EDGE (SPEC §7, §12): at rests no visible text crosses the format's safe margin unless it (or
// an ancestor) carries data-bleed. Boxes are the text's own line boxes, not its block; ::before and
// ::after text are measured by their own boxes.
import { rule } from '../lib/report.mjs';
import { restInstants, round, texts } from './_lib.mjs';

export const scope = 'format';
const TOL = 0.5;
/** The UI a platform draws over a 9x16 film (provisional, from the apps' own overlays): text kept out. */
export const PLATFORM_ZONES = { reels: { bottom: 500, right: 120 }, tiktok: { bottom: 500, right: 120 }, shorts: { bottom: 500, right: 120 } };

export default async function (ctx) {
  const { safe } = ctx.floors;
  const zone = ctx.format === '9x16' ? PLATFORM_ZONES[ctx.story?.platform] : null;   // opt-in; other formats ignore it
  let instants = 0, boxes = 0;
  for (const t of restInstants(ctx.schedule)) {
    const s = await ctx.sample(t);
    const { w: W, h: H } = s.probe.frame;
    instants++;
    for (const el of texts(s)) {
      boxes++;
      if (el.bleed) continue;
      const b = el.ink;
      const over = Math.max(safe - b.x, safe - b.y, b.x + b.w - (W - safe), b.y + b.h - (H - safe));
      if (over > TOL) return rule('G-EDGE', 'FAIL', { instant: round(t), selector: el.selector, measured: round(over, 1), threshold: safe, box: { x: round(b.x, 1), y: round(b.y, 1), w: round(b.w, 1), h: round(b.h, 1) }, reason: `text crosses the ${safe}px safe margin by ${round(over, 1)}px` });
      if (zone) {
        const into = Math.max(b.y + b.h - (H - zone.bottom), b.x + b.w - (W - zone.right));
        if (into > TOL) return rule('G-EDGE', 'FAIL', { instant: round(t), selector: el.selector, measured: round(into, 1), threshold: zone, box: { x: round(b.x, 1), y: round(b.y, 1), w: round(b.w, 1), h: round(b.h, 1) }, reason: `text enters the ${ctx.story.platform} UI zone (the bottom ${zone.bottom}px or the right ${zone.right}px) by ${round(into, 1)}px` });
      }
    }
  }
  if (!boxes) return rule('G-EDGE', 'SKIP', { reason: 'no text at any rest: nothing to measure against the safe margin' });
  return rule('G-EDGE', 'PASS', { threshold: safe, instants, texts: boxes });
}
