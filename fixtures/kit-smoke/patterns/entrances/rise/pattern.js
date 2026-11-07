// Fixture stub: rise from below by d px × the style's travel. Writes translate and
// opacity individually (never transform); at p = 1 nothing residual remains. Opacity never
// overshoots even when a spring drives p past 1.
export default {
  name: 'rise',
  group: 'entrances',
  params: { d: { type: 'number', default: 40, meaning: 'travel in px before the style multiplier' } },
  at(el, p, ctx) {
    const d = Number(ctx.params.d) * ctx.style.motion.travel;
    el.style.opacity = String(Math.min(1, Math.max(0, p)));
    el.style.translate = p === 1 ? 'none' : `0 ${((1 - p) * d).toFixed(3)}px`;
  },
};
