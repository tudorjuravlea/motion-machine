// exits/drop-out: falls away downward while fading, the mirror of entrances/drop. Writes
// translate and opacity. The distance scales with --mm-travel.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  d: { type: 'number', default: 96, meaning: 'fall in px before the style multiplier' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

export default {
  name: 'drop-out',
  group: 'exits',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const q = clamp01(p);
    el.style.opacity = q <= 0 ? '' : String(1 - q);
    el.style.translate = q <= 0 ? 'none' : `0 ${(q * Number(prm.d) * ctx.style.motion.travel).toFixed(3)}px`;
  },
};
