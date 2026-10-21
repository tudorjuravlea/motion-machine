// W-OVERSHOOT (SPEC §7, §15): overshoot above motion.overshootMax, judged three
// ways. Declared: every spring role the style declares (used or not), and the `type` role
// not at all. Reported: the kit's per-element overshoot once every entrance has run. Measured: each
// entrance is sampled through its run in the page; an element whose box passes its resting
// place (or grows past its resting size) by more than overshootMax of its travel warns, and type
// (a beat with text, a value, or a text/ or data/ pattern) and opacity never overshoot at all
// (§15): no box past rest by more than half a pixel, no opacity dip after it reached full.
import { spring } from '../../runtime/kit/springs.js';
import { rule } from '../lib/report.mjs';
import { EPS, round } from './_lib.mjs';

export const scope = 'format';
export const SAMPLES = 16;
const PX = 0.5;
// "Never" for the type spring, as a number: 0.1 % (a pixel over a 1000 px travel).
export const TYPE_EPS = 1e-3;

const isType = (it) => !!it && ((it.beat?.text != null && it.beat.text !== '') || it.beat?.value != null || /^(text|data)\//.test(it.fx ?? ''));

// In the page: the element's own motion through its entrance, read from what its pattern writes on
// it (translate, scale, transform), so a camera move or a counter's growing text is not counted.
function measure(list) {
  const eff = (el) => { if (getComputedStyle(el).visibility !== 'visible') return 0; let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  const own = (el) => {
    const cs = getComputedStyle(el);
    const tr = cs.translate === 'none' ? [0, 0] : cs.translate.split(/\s+/).map((v) => parseFloat(v) || 0);
    const sc = cs.scale === 'none' ? [1, 1] : cs.scale.split(/\s+/).map(Number);
    const m = cs.transform === 'none' ? new DOMMatrix() : new DOMMatrix(cs.transform);
    return { x: tr[0] + m.e, y: (tr[1] ?? 0) + m.f, s: Math.min(sc[0], sc[1] ?? sc[0]) * Math.min(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)) };
  };
  return list.map(({ selector, times }) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    return times.map((t) => { window.mm.seek(t); return { ...own(el), o: eff(el) }; });
  });
}

export default async function (ctx) {
  const max = ctx.style.motion.overshootMax;
  const hits = [];
  for (const [role, p] of Object.entries(ctx.style.motion.spring ?? {})) {
    const o = spring.overshoot(p);
    if (role === 'type' && o > TYPE_EPS) hits.push({ kind: 'declared', selector: `style.motion.spring.${role}`, measured: round(o, 4), threshold: TYPE_EPS, reason: `the type spring overshoots ${round(o * 100, 2)} %; type never overshoots (SPEC §15)` });
    else if (o > max + EPS) hits.push({ kind: 'declared', selector: `style.motion.spring.${role}`, measured: round(o, 4), threshold: max, reason: `spring role ${role} overshoots ${round(o * 100, 1)} %, above the style's ${max * 100} %` });
  }

  const end = ctx.schedule.kind === 'deck' ? ctx.schedule.presses : ctx.schedule.duration;
  await ctx.mm.seek(end);
  const rep = await ctx.mm.report();
  for (const e of rep.elements.filter((x) => x.overshoot > max + EPS)) hits.push({ kind: 'reported', selector: e.selector, measured: round(e.overshoot, 4), threshold: max, reason: `the kit reports overshoot ${round(e.overshoot * 100, 1)} %, above the style's ${max * 100} %` });

  const byItem = new Map(ctx.schedule.items.map((it) => [it.selector, it]));
  const arrivals = ctx.schedule.events.filter((e) => e.kind === 'arrive' && e.d > 0).map((e) => {
    const [a, b] = ctx.schedule.kind === 'deck' ? [e.from, e.to] : [e.t, e.t + e.d];
    const times = Array.from({ length: SAMPLES + 1 }, (_, k) => a + ((b - a) * k) / SAMPLES);
    return { selector: e.selector, times, item: byItem.get(e.selector) ?? byItem.get(e.selector.replace(/ > :nth-child\(\d+\)$/, '')) };
  });
  const runs = arrivals.length ? await ctx.page.evaluate(measure, arrivals.map(({ selector, times }) => ({ selector, times }))) : [];
  const unmeasured = [];
  arrivals.forEach((a, i) => {
    const run = runs[i];
    if (!run) { unmeasured.push(a.selector); return; }
    const rest = run.at(-1), shown = run.filter((s) => s.o > 0.001);
    const start = shown[0] ?? rest;
    const travel = Math.hypot(start.x - rest.x, start.y - rest.y);
    let past = 0;
    if (travel > PX) { const ux = (rest.x - start.x) / travel, uy = (rest.y - start.y) / travel; for (const s of shown) past = Math.max(past, (s.x - rest.x) * ux + (s.y - rest.y) * uy); }
    const grow = rest.s > 0 ? (start.s <= rest.s ? Math.max(0, ...shown.map((s) => s.s / rest.s - 1)) : Math.max(0, ...shown.map((s) => 1 - s.s / rest.s))) : 0;
    const peakO = run.findIndex((s) => s.o >= 0.999);
    const dip = peakO >= 0 ? Math.max(0, ...run.slice(peakO).map((s) => 0.999 - s.o)) : 0;
    const type = isType(a.item);
    if (dip > 0.01) hits.push({ kind: 'measured', selector: a.selector, measured: round(dip, 3), threshold: 0, reason: `opacity dips ${round(dip * 100, 1)} % after reaching full; opacity never overshoots (SPEC §15)` });
    if (type && (past > PX || grow > 0.005)) hits.push({ kind: 'measured', selector: a.selector, measured: round(past > PX ? past : grow, 3), threshold: 0, reason: past > PX ? `type passes its resting place by ${round(past, 1)} px; type never overshoots (SPEC §15)` : `type grows ${round(grow * 100, 1)} % past its resting size; type never overshoots (SPEC §15)` });
    else if (!type) {
      const frac = Math.max(travel > PX ? past / travel : 0, grow);
      if (frac > max + EPS) hits.push({ kind: 'measured', selector: a.selector, measured: round(frac, 4), threshold: max, reason: `measured overshoot ${round(frac * 100, 1)} % exceeds the style's ${max * 100} %` });
    }
  });

  if (hits.length) return rule('W-OVERSHOOT', 'WARN', { ...hits[0], kinds: [...new Set(hits.map((h) => h.kind))], all: hits.slice(0, 20) });
  const ev = { threshold: max, roles: Object.keys(ctx.style.motion.spring ?? {}).length, entrances: arrivals.length };
  if (unmeasured.length) return rule('W-OVERSHOOT', 'SKIP', { ...ev, partial: true, reason: `partial: ${unmeasured.length} entrance(s) could not be measured in the page (${unmeasured[0]})`, unmeasured });
  return rule('W-OVERSHOOT', 'PASS', ev);
}
