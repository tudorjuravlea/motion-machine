// entrances/mask-reveal: a clip-path wipe uncovers the element along one side. The mask keeps a
// small margin on the open sides so descenders and overshoots are not cut. Writes clip-path only.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  side: { type: 'enum(left|right|up|down)', default: 'left', meaning: 'the direction the reveal edge travels: left uncovers from the left edge' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const M = '-0.12em';

export default {
  name: 'mask-reveal',
  group: 'entrances',
  dur: 'standard',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const q = clamp01(p);
    if (q >= 1) { el.style.clipPath = 'none'; return; }
    const r = `${((1 - q) * 100).toFixed(3)}%`;
    const inset = {
      left: `${M} ${r} ${M} ${M}`,
      right: `${M} ${M} ${M} ${r}`,
      up: `${r} ${M} ${M} ${M}`,
      down: `${M} ${M} ${r} ${M}`,
    }[prm.side] ?? `${M} ${r} ${M} ${M}`;
    el.style.clipPath = `inset(${inset})`;
  },
};
