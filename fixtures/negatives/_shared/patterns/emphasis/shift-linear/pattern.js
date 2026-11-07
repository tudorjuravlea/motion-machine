// Gate fixture stub (W-DEADSTOP): shifts 30 px sideways at constant speed from its first frame, with the
// clock, and is gone at the end: a motion that starts at full speed. At p = 1 nothing remains.
export default {
  name: 'shift-linear',
  group: 'emphasis',
  params: {},
  dur: 'standard',
  at(el, p, ctx) {
    const q = Math.min(1, (ctx.u ?? 0) / (ctx.d || 1));
    el.style.translate = p >= 1 ? 'none' : `${(q * 30 * ctx.style.motion.travel).toFixed(3)}px 0`;
  },
};
