// G-DETERMINISM (SPEC §2.5): the same instant rendered in two fresh page loads
// yields byte-identical PNGs. The instants come from the schedule: the first frame, the middle of
// the first entrance, the last rest, and one instant per scene (its rest, else its middle), so
// randomness confined to any scene is seen. The first page renders them in order and the
// second in reverse, so a frame that depends on what was drawn before also differs.
import { framePng, openPiece } from '../lib/browser.mjs';
import { rule } from '../lib/report.mjs';
import { round, threeInstants } from './_lib.mjs';

export const scope = 'format';

/** Named instants: { first, midEntrance, lastRest, 'scene:<id>'… } (duplicates of an earlier instant dropped). */
export function instants(schedule) {
  const out = { ...threeInstants(schedule) };
  for (const sc of schedule.scenes) {
    let t;
    if (schedule.kind === 'deck') t = sc.end;
    else { const h = schedule.holds.find((x) => x.scene === sc.id); t = h ? h.from : (sc.start + sc.end) / 2; }
    if (!Object.values(out).some((x) => Math.abs(x - t) < 1e-6)) out[`scene:${sc.id}`] = t;
  }
  return out;
}

export default async function (ctx) {
  const at = Object.entries(instants(ctx.schedule));
  const list = at.map(([, t]) => round(t));
  const a = await openPiece(ctx.dir, { format: ctx.format, browser: ctx.browser, server: ctx.server });
  const b = await openPiece(ctx.dir, { format: ctx.format, browser: ctx.browser, server: ctx.server });
  try {
    const pa = [], pb = new Array(at.length);
    for (const [, t] of at) pa.push(await framePng(a.page, t));
    for (let i = at.length - 1; i >= 0; i--) pb[i] = await framePng(b.page, at[i][1]);
    for (let i = 0; i < at.length; i++) {
      if (pa[i].equals(pb[i])) continue;
      let diff = 0;
      for (let k = 0; k < Math.min(pa[i].length, pb[i].length); k++) if (pa[i][k] !== pb[i][k]) diff++;
      const [name, t] = at[i];
      return rule('G-DETERMINISM', 'FAIL', { instant: round(t), frame: name, instants: list, measured: `${diff} differing bytes (${pa[i].length} vs ${pb[i].length})`,
        reason: `two fresh loads (one rendering in order, one in reverse) painted different pixels at the ${name} instant` });
    }
  } finally {
    await a.close(); await b.close();
  }
  return rule('G-DETERMINISM', 'PASS', { instants: list, frames: at.map(([n]) => n), order: 'forward and reverse' });
}
