// Gate fixture stub (W-DEADSTOP): sits d px off its place, and in the entrance's second frame is in
// its place and stays there for the rest of its time: one jump, then nothing. At p = 1 nothing remains.
export default {
  name: 'snap',
  group: 'entrances',
  params: { d: { type: 'number', default: 60, meaning: 'travel in px before the style multiplier' } },
  at(el, p, ctx) {
    const d = Number(ctx.params.d) * ctx.style.motion.travel;
    const first = (ctx.u ?? 0) < 1 / 60;
    el.style.opacity = '1';
    el.style.translate = p >= 1 || !first ? 'none' : `0 ${d.toFixed(3)}px`;
  },
};
