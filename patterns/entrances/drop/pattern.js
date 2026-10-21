// entrances/drop: falls from above on the ui spring and stops at its place: p is clamped at 1, so
// the spring's bounce is cut off and the element never passes rest (type never overshoots).
// Writes translate and opacity. Position only: no scale, so type keeps its size. The fall is capped
// by the room above the element, so a plate never drops through the headline over it.
import { roomAbove } from '../../../runtime/kit/room.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  d: { type: 'number', default: 0.75, meaning: 'fall height as a multiple of the format base size (ctx.unit), before the style multiplier; capped by the free room above the element' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

export default {
  name: 'drop',
  group: 'entrances',
  spring: 'ui',
  params,
  at(el, pRaw, ctx) {
    const p = Math.min(1, pRaw);
    const prm = { ...DEFAULTS, ...ctx.params };
    const height = Math.min(Number(prm.d) * ctx.unit * ctx.style.motion.travel, roomAbove(el) ?? Infinity) * (1 - p);
    const o = clamp01(p * 4);
    el.style.opacity = o >= 1 ? '' : String(o);
    el.style.translate = p === 1 ? 'none' : `0 ${(-height).toFixed(3)}px`;
  },
};
