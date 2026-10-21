// W-HOOK: the first frame is the hook. A film's frame 0 and a deck's rest 0 show
// the first scene's headline finished: its entrance is not in flight (the kit reports progress 1:
// `params.instant: true` on a film beat, `step: 0` on a deck beat) and its ink is on screen (at
// least 3 % of its text box differs from the colour behind it by more than ΔE 2). The headline is
// the first scene's `headline` slot, else its first beat. A warning: a cold open or a reveal that
// builds can be the hook on purpose, so the rule advises and never blocks an export.
import { rule } from '../lib/report.mjs';
import { frameAt, parseColor, round } from './_lib.mjs';
import { countPixels, deltaE, rgbToLab } from './_pixels.mjs';

export const scope = 'format';
export const INK_MIN = 0.03;
const DE = 2;

/** The first scene's headline item from the schedule (a cascade's parent, never a child). */
export function headlineOf(schedule) {
  const first = schedule.scenes[0]?.id;
  const own = schedule.items.filter((it) => it.scene === first && !it.parent);
  const order = (it) => (schedule.kind === 'deck' ? it.press * 1e3 + (it.at ?? 0) : it.start);
  return own.find((it) => it.slot === 'headline') ?? own.sort((a, b) => order(a) - order(b))[0] ?? null;
}

export default async function (ctx) {
  const it = headlineOf(ctx.schedule);
  if (!it) return rule('W-HOOK', 'WARN', { instant: 0, reason: 'the first scene has no beat: the first frame shows nothing to hook on' });
  const s = await ctx.sample(0);
  const rep = s.report.elements.find((e) => e.selector === it.selector);
  const fix = ctx.kind === 'deck' ? 'give the headline beat `step: 0`' : 'give the headline beat `at: 0` and `params.instant: true`';
  if (!rep || !(rep.progress >= 1 - 1e-6) || !rep.visible) {
    return rule('W-HOOK', 'WARN', { instant: 0, selector: it.selector, measured: rep ? `progress ${round(rep.progress, 3)}${rep.visible ? '' : ', not visible'}` : 'not reported',
      reason: `the first ${ctx.kind === 'deck' ? 'rest' : 'frame'} does not show the first scene's headline finished; ${fix}` });
  }
  const el = s.probe.elements.find((e) => e.selector === it.selector && !e.pseudo);
  const box = el?.ink ?? el?.box;
  if (!box) return rule('W-HOOK', 'WARN', { instant: 0, selector: it.selector, measured: 'no box', reason: 'the headline is finished but not visible at the first frame' });
  const { img } = await frameAt(ctx, 0);
  const behind = rgbToLab(...(parseColor(el.bg) ?? parseColor(ctx.style.color.canvas)).slice(0, 3));
  const f = s.probe.frame;
  const { counted, total } = countPixels(img, (r, g, b) => deltaE(rgbToLab(r, g, b), behind) > DE, { rect: { x: box.x + f.x, y: box.y + f.y, w: box.w, h: box.h } });
  const share = total ? counted / total : 0;
  if (share < INK_MIN) return rule('W-HOOK', 'WARN', { instant: 0, selector: it.selector, measured: `${round(share * 100, 2)} % ink`, threshold: `${INK_MIN * 100} %`, reason: 'the headline is finished but its ink is not on screen at the first frame' });
  return rule('W-HOOK', 'PASS', { instant: 0, selector: it.selector, measured: `${round(share * 100, 1)} % ink`, threshold: `${INK_MIN * 100} %` });
}
