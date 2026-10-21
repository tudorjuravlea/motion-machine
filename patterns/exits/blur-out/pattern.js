// exits/blur-out: loses focus while fading, the mirror of entrances/blur-fade. Writes filter and
// opacity. A layer that carries text is only faded, never blurred: a blurred glyph is not a legal
// still, so the defocus applies to pictures, devices and shapes.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  blur: { type: 'number', default: 12, meaning: 'end blur radius in px' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

export default {
  name: 'blur-out',
  group: 'exits',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const q = clamp01(p);
    el.style.opacity = q <= 0 ? '' : String(1 - q);
    const text = /\S/.test(el.textContent || '');
    el.style.filter = q <= 0 || text ? 'none' : `blur(${(q * Number(prm.blur)).toFixed(3)}px)`;
  },
};
