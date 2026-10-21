// entrances/slam: a heavy mass comes down and lands: scale from large plus a short drop on the
// type spring, which settles without carrying the line past rest (type never overshoots);
// p is also clamped at 1 for a style whose type spring is under-damped. Writes translate, scale,
// opacity.
// The start scale and the drop are capped so the text never crosses the safe margin mid-entrance
//. Hold after it (H-STILL): the arrival is the loudest move in the library.
import { maxScale, inkOf, pivotOf, safeArea } from '../../../runtime/kit/room.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  from: { type: 'number', default: 1.4, meaning: 'start scale, clamped to 1.1 to 2, then capped so the text stays inside the safe area' },
  d: { type: 'number', default: 0.3, meaning: 'drop as a multiple of the format base size (ctx.unit), before the style multiplier; capped by the room above the scaled text' },
  origin: { type: 'enum(auto|center)', default: 'auto', meaning: 'pivot: the text edge for left or right aligned text, else the centre' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

function pivot(el, origin) {
  if (origin !== 'auto' || typeof getComputedStyle !== 'function') return 'center';
  const a = getComputedStyle(el).textAlign;
  return a === 'left' || a === 'start' ? 'left center' : a === 'right' || a === 'end' ? 'right center' : 'center';
}

// How far the text, scaled by `s` about `origin`, may be lifted before its top crosses the safe margin.
function headroom(el, origin, s) {
  const ink = inkOf(el), o = pivotOf(el, origin), area = safeArea(el);
  if (!ink || !o || !area) return Infinity;
  return Math.max(0, o.y + s * (ink.y0 - o.y) - area.y0);
}

export default {
  name: 'slam',
  group: 'entrances',
  spring: 'type',
  params,
  at(el, pRaw, ctx) {
    const p = Math.min(1, pRaw);
    const prm = { ...DEFAULTS, ...ctx.params };
    const origin = pivot(el, prm.origin);
    const from = Math.min(2, Math.max(1.1, Number(prm.from)), maxScale(el, origin) ?? Infinity);
    const drop = Math.min(Number(prm.d) * ctx.unit * ctx.style.motion.travel, headroom(el, origin, from)) * (1 - p);
    const o = clamp01(p * 4);
    el.style.transformOrigin = origin;
    el.style.opacity = o >= 1 ? '' : String(o);
    el.style.translate = p === 1 ? 'none' : `0 ${(-drop).toFixed(3)}px`;
    el.style.scale = p === 1 ? 'none' : (from + (1 - from) * p).toFixed(5);
  },
};
