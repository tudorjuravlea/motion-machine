// W-CAPTION (SPEC §7, provisional, from heygen-com/hyperframes): two caption groups visible at once. A caption
// group is an entrance through text/caption-* or an element marked data-caption; and a group
// whose words fall outside the style's words-per-group range (`motion.captions.wordsPerGroup`). Without that range the half is not measured and
// a clean result is SKIP with `partial: true`, never PASS.
import { rule } from '../lib/report.mjs';
import { restInstants, round, words } from './_lib.mjs';

export const scope = 'format';

export default async function (ctx) {
  const capItems = new Set(ctx.schedule.items.filter((it) => /^text\/caption/.test(it.fx)).map((it) => it.selector));
  const marked = await ctx.page.evaluate(() => document.querySelectorAll('[data-caption]').length);
  if (!capItems.size && !marked) return rule('W-CAPTION', 'SKIP', { reason: 'no caption groups (text/caption-* entrances or data-caption)' });
  const end = ctx.schedule.kind === 'deck' ? (it) => it.press : (it) => it.start + it.d;
  const instants = [...new Set([...restInstants(ctx.schedule), ...ctx.schedule.items.filter((it) => capItems.has(it.selector)).map(end)])].sort((a, b) => a - b);
  const range = ctx.style.motion?.captions?.wordsPerGroup ?? null;
  const note = range ? `words per group checked against ${range[0]}–${range[1]}` : 'words-per-group not checked: the style contract has no range yet';
  if (range) {
    for (const it of ctx.schedule.items.filter((x) => capItems.has(x.selector))) {
      const n = words(it.beat?.text);
      if (n < range[0] || n > range[1]) return rule('W-CAPTION', 'WARN', { selector: it.selector, measured: n, threshold: `${range[0]}–${range[1]} words`, reason: `a caption group of ${n} words is outside the style's ${range[0]}–${range[1]}`, note });
    }
  }
  for (const t of instants) {
    const s = await ctx.sample(t);
    const groups = new Set(s.probe.elements.filter((e) => (e.item && capItems.has(e.item)) || e.caption).map((e) => e.item ?? e.selector));
    if (groups.size > 1) return rule('W-CAPTION', 'WARN', { instant: round(t), selector: [...groups].join(', '), measured: groups.size, threshold: 1, reason: `${groups.size} caption groups visible at once`, note });
  }
  if (!range) return rule('W-CAPTION', 'SKIP', { partial: true, groups: capItems.size + marked, reason: `partial: never two groups at once; ${note}` });
  return rule('W-CAPTION', 'PASS', { groups: capItems.size + marked, note });
}
