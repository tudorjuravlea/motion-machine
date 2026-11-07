// emphasis/spotlight: everything else dims toward the canvas colour and returns, so the eye lands
// on this element. The dim is the element's own spread shadow in canvas colour: it paints over the
// rest of the frame and leaves the element's box clear, and being a style on the element the kit
// restores it on every seek. No node outside the element is touched or added. Nothing remains at p = 1.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  dim: { type: 'number', default: 0.8, meaning: 'how much of the rest is covered at the peak; 0.8 leaves it at 0.2' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const IN = 0.25;

export default {
  name: 'spotlight',
  group: 'emphasis',
  dur: 'hold',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const q = clamp01(p);
    const e = Math.min(1, q / IN, (1 - q) / IN);
    if (!(e > 1e-4)) return;
    const smooth = e * e * (3 - 2 * e);
    const cover = clamp01(Number(prm.dim)) * smooth * 100;
    if (typeof getComputedStyle === 'function' && getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.zIndex = '1';
    el.style.boxShadow = `0 0 0 200vmax color-mix(in srgb, var(--mm-color-canvas) ${cover.toFixed(3)}%, transparent)`;
  },
};
