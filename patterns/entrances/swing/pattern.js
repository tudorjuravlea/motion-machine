// entrances/swing: an object that hangs from a pivot swings in and settles: a damped swing about
// the pivot, angle * (1 - q)^2 * cos(2 pi * swings * q) over the entrance's own time q, which is
// exactly zero at q = 1. Writes rotate, transform-origin and opacity. Made for a price tag or a
// sign on its cord; it is a function of the entrance's seconds, so a deck rest shows it hanging still.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };

const params = {
  pivot: { type: 'enum(top|left|right|bottom|center)', default: 'top', meaning: 'the point it hangs from: the middle of that edge of the element (its own box, so a cord inside the box is part of the swing)' },
  angle: { type: 'number', default: 16, meaning: 'degrees: how far it is swung out when it arrives, before the style multiplier' },
  swings: { type: 'number', default: 1.5, meaning: 'how many full swings it makes before it hangs still (0.5 to 4)' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const ORIGIN = { top: '50% 0', left: '0 50%', right: '100% 50%', bottom: '50% 100%', center: '50% 50%' };

/** The swing angle in degrees at the entrance's linear time q (0 to 1): damped, zero at q = 1. */
export function angleAt(q, angle, swings) {
  const x = clamp01(q);
  return angle * (1 - x) ** 2 * Math.cos(2 * Math.PI * swings * x);
}

export default {
  name: 'swing',
  group: 'entrances',
  dur: 1.6,   // seconds: a swing needs room to be seen, whatever the style's roles; a beat's dur wins
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const q = p >= 1 ? 1 : ctx?.u != null && ctx?.d > 0 && Number.isFinite(ctx.u) ? clamp01(ctx.u / ctx.d) : clamp01(p);
    if (q >= 1) { el.style.rotate = 'none'; el.style.opacity = ''; return; }
    const swings = Math.min(4, Math.max(0.5, num(prm.swings, 1.5)));
    const travel = ctx?.style?.motion?.travel ?? 1;
    el.style.transformOrigin = ORIGIN[prm.pivot] ?? ORIGIN.top;
    el.style.rotate = `${angleAt(q, num(prm.angle, 16) * travel, swings).toFixed(3)}deg`;
    el.style.opacity = String(clamp01(q * 6));
  },
};
