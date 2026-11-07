// exits/push-out: slides out along one side while fading, so the next thing can take the place.
// Writes translate and opacity. The distance scales with --mm-travel.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  d: { type: 'number', default: 120, meaning: 'travel in px before the style multiplier' },
  side: { type: 'enum(left|right|up|down)', default: 'left', meaning: 'the side it leaves toward' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export default {
  name: 'push-out',
  group: 'exits',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const q = clamp01(p);
    const [vx, vy] = VEC[prm.side] ?? VEC.left;
    const dist = q * Number(prm.d) * ctx.style.motion.travel;
    el.style.opacity = q <= 0 ? '' : String(1 - q);
    el.style.translate = q <= 0 ? 'none' : `${(vx * dist).toFixed(3)}px ${(vy * dist).toFixed(3)}px`;
  },
};
