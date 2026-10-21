// entrances/draw: reveals along x by scaling from 0 to 1 about one edge. On an empty slot the
// stylesheet turns it into a rule that draws itself; on text it widens the line. Writes scale and
// transform-origin. The scale never exceeds 1.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  origin: { type: 'enum(left|center|right)', default: 'left', meaning: 'the edge the line grows from' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

export default {
  name: 'draw',
  group: 'entrances',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const q = clamp01(p);
    el.style.transformOrigin = prm.origin === 'center' ? 'center' : `${prm.origin === 'right' ? 'right' : 'left'} center`;
    el.style.scale = q >= 1 ? 'none' : `${q.toFixed(5)} 1`;
  },
};
