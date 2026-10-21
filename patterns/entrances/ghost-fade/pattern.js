// entrances/ghost-fade: a faint, slightly large, soft ghost of the element appears first, then
// tightens into the real thing. Two stages of one opacity curve plus a scale and blur that settle
// to rest. Writes opacity, scale, filter and transform-origin.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  ghost: { type: 'number', default: 0.25, meaning: 'opacity of the ghost stage, 0 to 0.5' },
  from: { type: 'number', default: 1.04, meaning: 'start scale, clamped to 1 to 1.12' },
  blur: { type: 'number', default: 6, meaning: 'ghost blur radius in px' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

function pivot(el) {
  if (typeof getComputedStyle !== 'function') return 'center';
  const a = getComputedStyle(el).textAlign;
  return a === 'left' || a === 'start' ? 'left center' : a === 'right' || a === 'end' ? 'right center' : 'center';
}

export default {
  name: 'ghost-fade',
  group: 'entrances',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const ghost = Math.min(0.5, Math.max(0, Number(prm.ghost)));
    const from = Math.min(1.12, Math.max(1, Number(prm.from)));
    const q = clamp01(p);
    const stage1 = clamp01(q / 0.4);
    const stage2 = clamp01((q - 0.4) / 0.6);
    const o = q >= 1 ? 1 : ghost * stage1 + (1 - ghost) * stage2;
    el.style.transformOrigin = pivot(el);
    el.style.opacity = o >= 1 ? '' : o.toFixed(5);
    el.style.scale = q >= 1 ? 'none' : (from + (1 - from) * q).toFixed(5);
    el.style.filter = q >= 1 ? 'none' : `blur(${(Number(prm.blur) * (1 - stage2)).toFixed(3)}px)`;
  },
};
