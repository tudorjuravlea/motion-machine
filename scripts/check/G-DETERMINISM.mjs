// G-DETERMINISM (SPEC §2.5): the same instant rendered in two fresh page loads
// yields byte-identical PNGs. The instants come from the schedule: the first frame, the middle of
// the first entrance, the last rest, one instant per scene (its rest, else its middle), and the
// middle of each cut that takes time, so randomness confined to any scene or seam is seen. The first
// page renders them in order and the second in reverse, so a frame that depends on what was drawn
// before also differs; the first page then walks them backward, so a page that has already played
// them must paint the same.
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
    if (schedule.kind !== 'deck' && sc.cut?.d > 0) {
      const mid = sc.start + sc.cut.d / 2;
      if (!Object.values(out).some((x) => Math.abs(x - mid) < 1e-6)) out[`cut:${sc.id}`] = mid;
    }
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
    const pc = new Array(at.length);
    for (let i = at.length - 1; i >= 0; i--) pc[i] = await framePng(a.page, at[i][1]);
    for (let i = 0; i < at.length; i++) {
      for (const [other, how] of [[pb[i], 'two fresh loads (one rendering in order, one in reverse)'], [pc[i], 'one page, walking back over instants it had already drawn,']]) {
        if (pa[i].equals(other)) continue;
        let diff = 0;
        for (let k = 0; k < Math.min(pa[i].length, other.length); k++) if (pa[i][k] !== other[k]) diff++;
        const [name, t] = at[i];
        return rule('G-DETERMINISM', 'FAIL', { instant: round(t), frame: name, instants: list, measured: `${diff} differing bytes (${pa[i].length} vs ${other.length})`,
          reason: `${how} painted different pixels at the ${name} instant` });
      }
    }
  } finally {
    await a.close(); await b.close();
  }
  return rule('G-DETERMINISM', 'PASS', { instants: list, frames: at.map(([n]) => n), order: 'forward and reverse' });
}
