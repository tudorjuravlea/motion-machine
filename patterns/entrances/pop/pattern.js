// entrances/pop: scale from 0.9 to 0.97 up to 1 with opacity, on the ui spring. Never from zero.
// Writes scale, transform-origin and opacity. p is clamped at 1, which cuts the spring's overshoot
// off: neither scale nor opacity passes rest (type never overshoots).
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  from: { type: 'number', default: 0.94, meaning: 'start scale, clamped to 0.9 to 0.97' },
  origin: { type: 'enum(center|auto)', default: 'center', meaning: 'pivot: the centre, or the text edge for left or right aligned text' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

function pivot(el, origin) {
  if (origin !== 'auto' || typeof getComputedStyle !== 'function') return 'center';
  const a = getComputedStyle(el).textAlign;
  return a === 'left' || a === 'start' ? 'left center' : a === 'right' || a === 'end' ? 'right center' : 'center';
}

export default {
  name: 'pop',
  group: 'entrances',
  spring: 'ui',
  params,
  at(el, pRaw, ctx) {
    const p = Math.min(1, pRaw);
    const prm = { ...DEFAULTS, ...ctx.params };
    const from = Math.min(0.97, Math.max(0.9, Number(prm.from)));
    el.style.transformOrigin = pivot(el, prm.origin);
    el.style.opacity = p >= 1 ? '' : String(clamp01(p));
    el.style.scale = p === 1 ? 'none' : (from + (1 - from) * p).toFixed(5);
  },
};
