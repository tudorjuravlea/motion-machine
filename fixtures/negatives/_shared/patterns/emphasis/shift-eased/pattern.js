// Gate fixture stub (W-DEADSTOP): shifts 30 px sideways and back along a half sine of the kit's eased p,
// so it begins and ends at rest. At p = 1 nothing remains.
export default {
  name: 'shift-eased',
  group: 'emphasis',
  params: {},
  dur: 'standard',
  at(el, p, ctx) {
    el.style.translate = p >= 1 ? 'none' : `${(Math.sin(Math.PI * p) * 30 * ctx.style.motion.travel).toFixed(3)}px 0`;
  },
};
