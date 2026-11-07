// Gate fixture stub (W-SEAM, W-DEADSTOP): travels in `side` over its whole duration (up rises from
// below, left slides in from the right), at constant speed with p, linear in the kit's eased p unless
// `linear` is on, which follows the clock: it stops abruptly at the end. At p = 1 nothing remains.
const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export default {
  name: 'slide-in',
  group: 'entrances',
  params: {
    d: { type: 'number', default: 120, meaning: 'travel in px before the style multiplier' },
    side: { type: 'enum(left|right|up|down)', default: 'up', meaning: 'direction of travel' },
    linear: { type: 'boolean', default: false, meaning: 'travel at constant speed with the clock, stopping abruptly' },
  },
  at(el, p, ctx) {
    const d = Number(ctx.params.d) * ctx.style.motion.travel;
    const q = ctx.params.linear === true || ctx.params.linear === 'true' ? Math.min(1, (ctx.u ?? 0) / (ctx.d || 1)) : p;
    const [vx, vy] = VEC[ctx.params.side] ?? VEC.up;
    el.style.opacity = '1';
    el.style.translate = p >= 1 ? 'none' : `${(-vx * (1 - q) * d).toFixed(3)}px ${(-vy * (1 - q) * d).toFixed(3)}px`;
  },
};
