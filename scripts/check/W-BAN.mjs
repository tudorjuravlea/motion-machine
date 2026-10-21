// W-BAN (SPEC §7, references/bans.md): the three detectable bans, each only while the style bans
// it. centered-title-on-gradient: the first scene's first rest shows one text block, centred,
// over a gradient. corner-labels: text smaller than the caption size inside a corner zone, device
// chrome (data-chrome) excepted (20 %
// of each side). frame-borders: a bordered or outlined element covering ≥ 90 % of the frame.
// A style's `gate.liftBans` names looks this check stops reporting; the others are still checked.
import { rule } from '../lib/report.mjs';
import { banActive, restInstants, round, texts } from './_lib.mjs';

export const scope = 'format';
export const CORNER = 0.2;
export const FRAME = 0.9;
export const CENTRE_TOL = 0.02;

export default async function (ctx) {
  const lifted = (ctx.style.gate?.liftBans ?? []).filter((b) => banActive(ctx.style, b));   // the style's gate stops this check only; the ban stays in its bans
  const active = ['centered-title-on-gradient', 'corner-labels', 'frame-borders'].filter((b) => banActive(ctx.style, b) && !lifted.includes(b));
  if (!active.length) return rule('W-BAN', 'SKIP', { reason: lifted.length ? `the style's gate lifts ${lifted.join(', ')} and bans no other detectable look` : 'the style bans none of the detectable looks', ...(lifted.length ? { lifted } : {}) });
  const hits = [];
  const caption = ctx.style.scale.caption * ctx.floors.base;
  const first = ctx.story.scenes[0].id;
  let firstChecked = false;
  for (const t of restInstants(ctx.schedule)) {
    const s = await ctx.sample(t);
    const { w: W, h: H } = s.probe.frame;
    if (active.includes('centered-title-on-gradient') && !firstChecked) {
      const own = texts(s).filter((e) => e.scene === first);
      if (own.length) {
        firstChecked = true;
        const blocks = [...new Set(own.map((e) => e.item ?? e.selector))];
        const e = own[0];
        if (blocks.length === 1 && Math.abs(e.ink.x + e.ink.w / 2 - W / 2) <= CENTRE_TOL * W && own.some((x) => x.gradient)) {
          hits.push({ ban: 'centered-title-on-gradient', instant: round(t), selector: e.selector });
        }
      }
    }
    if (active.includes('corner-labels')) {
      for (const e of texts(s)) {
        if (e.fontPx >= caption || e.chrome) continue;   // device chrome (a menu bar, a status bar) is not a label
        const cx = e.ink.x + e.ink.w / 2, cy = e.ink.y + e.ink.h / 2;
        if ((cx < CORNER * W || cx > (1 - CORNER) * W) && (cy < CORNER * H || cy > (1 - CORNER) * H)) hits.push({ ban: 'corner-labels', instant: round(t), selector: e.selector, measured: round(e.fontPx, 2) });
      }
    }
    if (active.includes('frame-borders')) {
      for (const e of s.probe.elements) if (e.framed && e.box.w >= FRAME * W && e.box.h >= FRAME * H) hits.push({ ban: 'frame-borders', instant: round(t), selector: e.selector });
    }
  }
  if (hits.length) return rule('W-BAN', 'WARN', { ...hits[0], reason: `banned look: ${hits[0].ban}`, all: hits.slice(0, 20), ...(lifted.length ? { lifted } : {}) });
  return rule('W-BAN', 'PASS', { bans: active, ...(lifted.length ? { lifted } : {}) });
}
