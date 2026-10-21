// W-ENTRANCE (SPEC §6, §7): at rests, a visible element inside a scene (text, or painted: a
// background, a border, an image) that is neither an entrance (nor inside one), nor a container
// of entrances, nor marked data-keep.
import { rule } from '../lib/report.mjs';
import { restInstants, round } from './_lib.mjs';

export const scope = 'format';

export default async function (ctx) {
  const seen = new Map();
  for (const t of restInstants(ctx.schedule)) {
    const s = await ctx.sample(t);
    for (const e of s.probe.elements) {
      if (!e.scene || e.structural || e.item || e.itemAncestor || e.keep) continue;
      if (!(e.text && e.ink) && !e.painted) continue;
      if (!seen.has(e.selector)) seen.set(e.selector, { instant: round(t), selector: e.selector });
    }
  }
  const list = [...seen.values()];
  if (list.length) return rule('W-ENTRANCE', 'WARN', { ...list[0], reason: 'visible with no entrance and no data-keep', all: list.slice(0, 20) });
  return rule('W-ENTRANCE', 'PASS', {});
}
