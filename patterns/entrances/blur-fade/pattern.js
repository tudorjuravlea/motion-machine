// entrances/blur-fade: arrives out of focus and sharpens while fading in. Writes filter and opacity.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  blur: { type: 'number', default: 12, meaning: 'start blur radius in px' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

export default {
  name: 'blur-fade',
  group: 'entrances',
  dur: 'standard',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const q = clamp01(p);
    el.style.opacity = q >= 1 ? '' : String(q);
    el.style.filter = q >= 1 ? 'none' : `blur(${(Number(prm.blur) * (1 - q)).toFixed(3)}px)`;
  },
};
