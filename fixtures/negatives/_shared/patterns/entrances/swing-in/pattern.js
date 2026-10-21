// Gate fixture stub (W-OVERSHOOT/measured): rises from below but swings past its resting place on
// the way, inside at() itself, whatever drives p. The kit's type clamp cannot see an overshoot that
// lives in the pattern's own curve; the gate's measurement does. At p = 1 nothing remains.
export default {
  name: 'swing-in',
  group: 'entrances',
  params: { d: { type: 'number', default: 40, meaning: 'travel in px before the style multiplier' } },
  at(el, p, ctx) {
    const d = Number(ctx.params.d) * ctx.style.motion.travel;
    const swing = Math.sin(Math.PI * Math.min(1, Math.max(0, p))) * d * 0.6;
    el.style.opacity = String(Math.min(1, Math.max(0, p)));
    el.style.translate = p >= 1 ? 'none' : `0 ${((1 - p) * d - swing).toFixed(3)}px`;
  },
};
