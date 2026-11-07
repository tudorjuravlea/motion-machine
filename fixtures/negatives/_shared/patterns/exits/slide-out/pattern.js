// Gate fixture stub (W-SEAM): leaves toward `side` by d px, fading as it goes. The kit hides the element when the exit completes.
const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export default {
  name: 'slide-out',
  group: 'exits',
  params: {
    d: { type: 'number', default: 120, meaning: 'travel in px before the style multiplier' },
    side: { type: 'enum(left|right|up|down)', default: 'left', meaning: 'the side it leaves toward' },
  },
  at(el, p, ctx) {
    const d = Number(ctx.params.d) * ctx.style.motion.travel;
    const [vx, vy] = VEC[ctx.params.side] ?? VEC.left;
    el.style.opacity = String(1 - Math.min(1, Math.max(0, p)) * 0.3);
    el.style.translate = `${(vx * p * d).toFixed(3)}px ${(vy * p * d).toFixed(3)}px`;
  },
};
