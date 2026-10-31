// W-SEAM (SPEC §7): across a cut, an element that leaves and the element that arrives after it
// should read as one movement: the same direction, at about the same speed. The rule pairs each
// element that exits (a beat with `out`) with the first element of the next scene to arrive within
// WINDOW_S of the exit's end (or the cut that follows it), and warns on a pair whose travel runs in
// opposite directions, or whose speeds differ by more than SEAM_PCT percent.
// Direction: the one the patterns declare (a `side`, `direction` or `dir` param of left, right, up or
// down, from the beat's params, else the pattern's default; the exit bag `params.exit` first for an
// exit), else the one measured: the box of the element's ink between 15 % and 85 % of its motion.
// An element that does not travel (under MIN_TRAVEL of the frame's width) is not a seam.
// Speed: the measured travel over the motion's duration where both boxes were measured, else the
// durations alone (the same distance assumed). A style's `gate.seamPct` sets SEAM_PCT. A deck is SKIP.
import { rule } from '../lib/rule.mjs';
import { round } from './_lib.mjs';

export const scope = 'format';
export const SEAM_PCT = 5;
export const WINDOW_S = 0.5;
export const MIN_TRAVEL = 0.005;   // of the frame's width

const DIRS = ['left', 'right', 'up', 'down'];
const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

/** The direction a pattern's params declare, or null. `bag` is the beat's params (the exit's own bag for an exit). */
export function declaredDirection(bag, mod) {
  for (const k of ['side', 'direction', 'dir']) {
    const v = bag?.[k] ?? mod?.params?.[k]?.default;
    if (DIRS.includes(v)) return v;
  }
  return null;
}

/** The dominant direction of a travel vector, or null under `min`. */
export function dominant([dx, dy], min) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return null;
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}

export default async function (ctx) {
  if (ctx.kind === 'deck') return rule('W-SEAM', 'SKIP', { reason: 'a deck cuts on presses; the speed of an exit against the next entrance is a film reading' });
  const pct = ctx.style?.gate?.seamPct ?? SEAM_PCT;
  const { items, scenes } = ctx.schedule;
  const pairs = [];
  for (let i = 0; i + 1 < scenes.length; i++) {
    const cut = scenes[i + 1].start, cutEnd = cut + (scenes[i + 1].cut?.d ?? 0);
    for (const out of items.filter((it) => it.scene === scenes[i].id && !it.parent && it.exit && it.exit.d > 0)) {
      const outEnd = out.exit.start + out.exit.d;
      if (outEnd < cut - WINDOW_S || out.exit.start > cutEnd) continue;
      const incoming = items.filter((it) => it.scene === scenes[i + 1].id && !it.parent && it.d > 0 && it.start >= cut - 1e-9 && it.start <= Math.max(outEnd, cutEnd) + WINDOW_S)
        .sort((a, b) => Math.abs(a.start - outEnd) - Math.abs(b.start - outEnd));
      if (incoming.length) pairs.push({ out, incoming, cut });
    }
  }
  if (!pairs.length) return rule('W-SEAM', 'SKIP', { reason: 'no element exits into the next scene\'s first entrance across a cut' });

  const frameW = ctx.page.viewportSize().width;
  const travel = async (it, from, d) => {
    const at = async (t) => {
      const s = await ctx.sample(round(t, 4));
      const e = s.probe.elements.find((x) => x.selector === it.selector && !x.pseudo);
      const b = e?.ink ?? e?.box;
      return b ? [b.x + b.w / 2, b.y + b.h / 2] : null;
    };
    const t0 = from + 0.15 * d, t1 = from + 0.85 * d;
    const a = await at(t0), b = await at(t1);
    return a && b ? { vec: [b[0] - a[0], b[1] - a[1]], px: Math.hypot(b[0] - a[0], b[1] - a[1]), s: t1 - t0 } : null;
  };
  const rows = [];
  for (const { out, incoming, cut } of pairs) {
    const mOut = await travel(out, out.exit.start, out.exit.d);
    const dOut = declaredDirection({ ...out.beat.params, ...(out.beat.params?.exit ?? {}) }, ctx.patterns[out.beat.exit]) ?? (mOut ? dominant(mOut.vec, MIN_TRAVEL * frameW) : null);
    if (!dOut) continue;
    for (const inc of incoming) {
      const mIn = await travel(inc, inc.start, inc.d);
      const dIn = declaredDirection(inc.beat.params, ctx.patterns[inc.beat.fx]) ?? (mIn ? dominant(mIn.vec, MIN_TRAVEL * frameW) : null);
      if (!dIn) continue;
      const vOut = mOut && mIn ? mOut.px / mOut.s : 1 / out.exit.d, vIn = mOut && mIn ? mIn.px / mIn.s : 1 / inc.d;
      const off = Math.abs(vOut - vIn) / Math.max(vOut, vIn);
      rows.push({ instant: round(cut), exits: out.selector, enters: inc.selector, exitDirection: dOut, enterDirection: dIn, exitSpeed: round(vOut, 1), enterSpeed: round(vIn, 1), speedOffPct: round(off * 100, 1), measuredSpeed: !!(mOut && mIn), opposed: OPPOSITE[dOut] === dIn });
      break;   // the first moving arrival after the exit is its partner
    }
  }
  if (!rows.length) return rule('W-SEAM', 'SKIP', { reason: 'no exit meets an arrival that travels: nothing to match' });
  const bad = rows.filter((r) => r.opposed || r.speedOffPct > pct + 1e-9);
  const threshold = `same direction, speeds within ${pct} %`;
  if (bad.length) {
    const w = bad.find((r) => r.opposed) ?? bad[0];
    const reason = w.opposed
      ? `${w.exits} leaves ${w.exitDirection} and ${w.enters} arrives travelling ${w.enterDirection}: opposed across the cut; let them travel the same way`
      : `${w.exits} leaves at ${w.exitSpeed} ${w.measuredSpeed ? 'px/s' : '/s (durations)'} and ${w.enters} arrives at ${w.enterSpeed}: ${w.speedOffPct} % apart across the cut; match them to within ${pct} %`;
    return rule('W-SEAM', 'WARN', { instant: w.instant, selector: `${w.exits}, ${w.enters}`, measured: w.opposed ? `${w.exitDirection} against ${w.enterDirection}` : w.speedOffPct, threshold, seams: rows, reason });
  }
  return rule('W-SEAM', 'PASS', { measured: Math.max(...rows.map((r) => r.speedOffPct)), threshold, seams: rows });
}
