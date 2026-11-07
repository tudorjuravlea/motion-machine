// entrances/punch: lands from slightly large with a fast ease-out, no spring, no travel. A decisive
// arrival for one short line. The start scale is capped so the text never crosses the safe margin
// mid-entrance (a full-measure line punched past the frame edge). Writes scale,
// transform-origin and opacity.
import { maxScale } from '../../../runtime/kit/room.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  from: { type: 'number', default: 1.15, meaning: 'start scale, clamped to 1.05 to 1.3, then capped so the text stays inside the safe area' },
  origin: { type: 'enum(auto|center)', default: 'auto', meaning: 'pivot: the text edge for left or right aligned text, else the centre' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

function pivot(el, origin) {
  if (origin !== 'auto' || typeof getComputedStyle !== 'function') return 'center';
  const a = getComputedStyle(el).textAlign;
  return a === 'left' || a === 'start' ? 'left center' : a === 'right' || a === 'end' ? 'right center' : 'center';
}

export default {
  name: 'punch',
  group: 'entrances',
  dur: 'quick',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const origin = pivot(el, prm.origin);
    const from = Math.min(1.3, Math.max(1.05, Number(prm.from)), maxScale(el, origin) ?? Infinity);
    const o = clamp01(p * 2.5);
    el.style.transformOrigin = origin;
    el.style.opacity = o >= 1 ? '' : String(o);
    el.style.scale = p === 1 ? 'none' : (from + (1 - from) * p).toFixed(5);
  },
};
