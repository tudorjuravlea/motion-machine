// G-FACT-REF (SPEC §4, H-FACTS): every beat's `fact` names a fact in the story's facts list. A fact
// marked `sample: true` is illustrative, not measured: at every rest where a beat
// citing it is visible, a visible element carrying `data-sample` with text ("Illustrative") must be
// on the stage too. Rendered per format: a label can fall out of one format's frame.
import { rule } from '../lib/report.mjs';
import { restInstants, round } from './_lib.mjs';

export const scope = 'format';

export default async function (ctx) {
  const ids = new Set((ctx.story.facts ?? []).map((f) => f.id));
  const bad = [];
  for (const sc of ctx.story.scenes) for (const b of sc.beats) if (b.fact && !ids.has(b.fact)) bad.push({ selector: `${sc.id}.${b.slot}`, measured: b.fact });
  if (bad.length) return rule('G-FACT-REF', 'FAIL', { ...bad[0], reason: `fact ${bad[0].measured} is not in the story's facts`, all: bad });
  const samples = new Set((ctx.story.facts ?? []).filter((f) => f.sample).map((f) => f.id));
  const cite = ctx.schedule.items.filter((it) => !it.parent && samples.has(it.beat.fact)).map((it) => ({ selector: it.selector, fact: it.beat.fact }));
  if (!cite.length) return rule('G-FACT-REF', 'PASS', { facts: ids.size, samples: samples.size });
  if (!ctx.page) return rule('G-FACT-REF', 'SKIP', { partial: true, reason: 'partial: the piece did not open, so the sample-data labels were not looked for' });
  const unlabelled = [];
  for (const t of restInstants(ctx.schedule)) {
    await ctx.mm.seek(t);
    const r = await ctx.page.evaluate((cite) => {
      const st = document.querySelector('.mm-stage').getBoundingClientRect();
      const seen = (el) => {   // visible, with area inside the stage (a label cropped out of this format does not count)
        if (!el?.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
        const b = el.getBoundingClientRect();
        return Math.min(b.right, st.right) - Math.max(b.left, st.left) > 0 && Math.min(b.bottom, st.bottom) - Math.max(b.top, st.top) > 0;
      };
      const shown = cite.filter((c) => seen(document.querySelector(c.selector)));
      const label = [...document.querySelectorAll('.mm-stage [data-sample]')].some((el) => seen(el) && el.textContent.trim());
      return { shown, label };
    }, cite);
    if (r.shown.length && !r.label) unlabelled.push({ instant: round(t, 3), selector: r.shown[0].selector, measured: r.shown[0].fact });
  }
  if (unlabelled.length) return rule('G-FACT-REF', 'FAIL', { ...unlabelled[0], reason: `fact ${unlabelled[0].measured} is sample data, and at the rest ${unlabelled[0].instant} no visible element with data-sample and text says so`, all: unlabelled });
  return rule('G-FACT-REF', 'PASS', { facts: ids.size, samples: samples.size });
}
