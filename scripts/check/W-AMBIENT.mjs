// W-AMBIENT (SPEC §7, provisional, from heygen-com/hyperframes): over a film scene's rest, a camera move
// whose amplitude exceeds 20 % of the scene's primary travel (the largest distance an entrance
// carries an element), or text whose scale oscillates beyond ±5 %. Sampled from the page at nine
// instants across the rest. A moving scene with no rest, or whose entrances do not travel (so the
// 20 % cap has nothing to scale), is not measured: a clean result is then SKIP with `partial: true`
// naming it, never PASS.
import { rule } from '../lib/report.mjs';
import { round } from './_lib.mjs';

export const scope = 'format';
export const AMP = 0.2;
export const SCALE = 0.05;
export const SAMPLES = 9;

function boxes({ scene, selectors }) {
  const cam = document.querySelector(`[data-scene="${scene}"] > .mm-camera`);
  const c = cam.getBoundingClientRect();
  return { cam: { x: c.x, y: c.y, w: c.width, h: c.height }, items: selectors.map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x - c.x, y: r.y - c.y, w: r.width, h: r.height }; }) };
}

export default async function (ctx) {
  if (ctx.kind === 'deck') return rule('W-AMBIENT', 'SKIP', { reason: 'camera moves in decks are not in the kit yet' });
  const moving = ctx.schedule.scenes.filter((s) => s.move);
  if (!moving.length) return rule('W-AMBIENT', 'SKIP', { reason: 'no scene has a move' });
  const hits = [], seen = [], unmeasured = [];
  for (const sc of moving) {
    const hold = ctx.schedule.holds.find((h) => h.scene === sc.id);
    if (!hold) { unmeasured.push(`${sc.id}: no rest to sample`); continue; }
    const items = ctx.schedule.items.filter((it) => it.scene === sc.id);
    const selectors = items.map((it) => it.selector);
    const at = async (t) => { await ctx.mm.seek(t); return ctx.page.evaluate(boxes, { scene: sc.id, selectors }); };
    let travel = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const a = (await at(it.start + 1e-4)).items[i], b = (await at(it.start + it.d)).items[i];
      travel = Math.max(travel, Math.hypot(a.x - b.x, a.y - b.y));
    }
    const frames = [];
    const end = hold.to - 1e-3;
    for (let k = 0; k < SAMPLES; k++) frames.push(await at(hold.from + ((end - hold.from) * k) / (SAMPLES - 1)));
    let amp = 0;
    for (const f of frames) for (const g of frames) amp = Math.max(amp, Math.hypot(f.cam.x - g.cam.x, f.cam.y - g.cam.y));
    let scale = 0;
    items.forEach((_, i) => { const w0 = frames[0].items[i].w; if (w0 > 0) for (const f of frames) scale = Math.max(scale, Math.abs(f.items[i].w / w0 - 1)); });
    seen.push({ scene: sc.id, move: sc.move, amplitude: round(amp, 1), travel: round(travel, 1), scale: round(scale, 3) });
    if (travel > 0.5 && amp > AMP * travel) hits.push({ selector: `[data-scene="${sc.id}"] .mm-camera`, measured: round(amp, 1), threshold: round(AMP * travel, 1), reason: `${sc.move} moves ${round(amp, 1)}px over the rest; the scene's entrances travel ${round(travel, 1)}px (cap ${AMP * 100} %)` });
    if (!(travel > 0.5)) unmeasured.push(`${sc.id}: amplitude not judged, its entrances do not travel`);
    if (scale > SCALE) hits.push({ selector: `[data-scene="${sc.id}"]`, measured: round(scale, 3), threshold: SCALE, reason: `text scale oscillates by ${round(scale * 100, 1)} % over the rest` });
  }
  if (hits.length) return rule('W-AMBIENT', 'WARN', { ...hits[0], scenes: seen });
  if (unmeasured.length) return rule('W-AMBIENT', 'SKIP', { partial: true, scenes: seen, unmeasured, reason: `partial: ${unmeasured.join('; ')}` });
  return rule('W-AMBIENT', 'PASS', { scenes: seen });
}
