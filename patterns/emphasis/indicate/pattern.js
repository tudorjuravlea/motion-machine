// emphasis/indicate: there and back. Scale goes 1 to 1 + amp and home while the colour is pulled
// toward --mm-color-accent and released. It directs the eye and changes no content. Writes scale,
// transform-origin and color; at p = 0 and p = 1 it writes nothing, so nothing stays behind.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  amp: { type: 'number', default: 0.08, meaning: 'peak scale gain, 0.02 to 0.12' },
  tint: { type: 'number', default: 1, meaning: 'how far the colour moves toward the accent at the peak, 0 to 1' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

function pivot(el) {
  if (typeof getComputedStyle !== 'function') return 'center';
  const a = getComputedStyle(el).textAlign;
  return a === 'left' || a === 'start' ? 'left center' : a === 'right' || a === 'end' ? 'right center' : 'center';
}

export default {
  name: 'indicate',
  group: 'emphasis',
  dur: 'standard',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const s = Math.sin(Math.PI * clamp01(p));
    if (!(s > 1e-6)) return;
    const amp = Math.min(0.12, Math.max(0.02, Number(prm.amp)));
    const tint = clamp01(Number(prm.tint)) * s * 100;
    const base = typeof getComputedStyle === 'function' ? getComputedStyle(el).color : 'currentcolor';
    el.style.transformOrigin = pivot(el);
    el.style.scale = (1 + amp * s).toFixed(5);
    el.style.color = `color-mix(in srgb, var(--mm-accent-text) ${tint.toFixed(3)}%, ${base})`;
  },
};
