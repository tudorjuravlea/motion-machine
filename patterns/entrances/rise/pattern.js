// entrances/rise: slides in along one side by d px x --mm-travel while fading in. Writes translate
// and opacity individually, never transform. Opacity never overshoots when a spring drives p past 1.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  d: { type: 'number', default: 40, meaning: 'travel in px before the style multiplier' },
  side: { type: 'enum(up|down|left|right)', default: 'up', meaning: 'direction of travel: up rises from below, left slides in from the right' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const VEC = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] };

export default {
  name: 'rise',
  group: 'entrances',
  dur: 'standard',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const [vx, vy] = VEC[prm.side] ?? VEC.up;
    const dist = Number(prm.d) * ctx.style.motion.travel * (1 - p);
    el.style.opacity = p >= 1 ? '' : String(clamp01(p));
    el.style.translate = p === 1 ? 'none' : `${(vx * dist).toFixed(3)}px ${(vy * dist).toFixed(3)}px`;
  },
};
