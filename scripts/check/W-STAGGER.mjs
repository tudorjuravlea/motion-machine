// W-STAGGER (SPEC §7, provisional, from heygen-com/hyperframes and emilkowalski/skills): a data-each cascade longer than
// motion.stagger.capS, or a film scene whose first arrival starts less than 0.1 s after its cut
// settles. (Deck scenes open on the presenter's press, where the cut and the arrival share the
// input; the 0.1 s half applies to films.) the film's first scene (its first frame is the
// hook) and a scene that arrives by a hard cut (nothing to settle) are exempt from the 0.1 s half.
// an instant beat (d = 0) at the scene's start is not an arrival in that sense: it does not
// move, the cut reveals it (transitions/sketch-to-ink, shared-element), so the first arrival is the
// first beat that animates.
import { rule } from '../lib/report.mjs';
import { EPS, round } from './_lib.mjs';

export const CLEAR_S = 0.1;

function cascades(eachDefault) {
  return [...document.querySelectorAll('[data-each]')].map((el) => {
    const n = el.children.length;
    const each = el.dataset.stagger != null ? parseFloat(el.dataset.stagger) : eachDefault;
    const sc = el.closest('[data-scene]');
    return { selector: `${sc ? `[data-scene="${sc.dataset.scene}"] ` : ''}${el.dataset.slot ? `[data-slot="${el.dataset.slot}"]` : '[data-each]'}`, n, each, span: Math.max(0, n - 1) * each };
  });
}

export default async function (ctx) {
  const hits = [];
  const cap = ctx.style.motion.stagger?.capS;
  if (ctx.page && cap != null) {
    for (const c of await ctx.page.evaluate(cascades, ctx.style.motion.stagger.eachS)) {
      if (c.span > cap + EPS) hits.push({ selector: c.selector, measured: round(c.span), threshold: cap, reason: `a ${c.n}-item cascade spans ${round(c.span)}s; the cap is ${cap}s` });
    }
  }
  if (ctx.schedule.kind === 'film') {
    for (const [i, sc] of ctx.schedule.scenes.entries()) {
      if (i === 0 || sc.cut.d === 0 || sc.cut.pattern === 'transitions/hard-cut') continue;
      const revealed = (e) => !(e.d > 0) && !e.spring && Math.abs(e.t - sc.start) < EPS;
      const first = ctx.schedule.events.filter((e) => e.kind === 'arrive' && e.scene === sc.id && !revealed(e)).sort((a, b) => a.t - b.t)[0];
      if (!first) continue;
      const settle = sc.start + sc.cut.d;
      const gap = first.t - settle;
      if (gap < CLEAR_S - EPS) hits.push({ selector: first.selector, instant: round(first.t), measured: round(gap), threshold: CLEAR_S, reason: `first arrival ${round(gap)}s after the cut settles; leave ${CLEAR_S}s` });
    }
  }
  if (hits.length) return rule('W-STAGGER', 'WARN', { ...hits[0], all: hits });
  return rule('W-STAGGER', 'PASS', { threshold: CLEAR_S, cap });
}
