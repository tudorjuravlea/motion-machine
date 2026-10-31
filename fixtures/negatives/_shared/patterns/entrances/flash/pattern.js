// Gate fixture stub (W-POP): the element sits in place and jolts `jolt` px down for exactly one frame
// (the 8th of its entrance, 30 fps) before it is done: a lone odd frame in the middle of a motion.
// At p = 1 nothing remains.
export default {
  name: 'flash',
  group: 'entrances',
  params: { jolt: { type: 'number', default: 60, meaning: 'how far the odd frame is off, in px before the style multiplier' } },
  at(el, p, ctx) {
    const jolt = Math.round((ctx.u ?? 0) * 30) === 7 && p < 1;
    el.style.opacity = '1';
    el.style.translate = jolt ? `0 ${(Number(ctx.params.jolt) * ctx.style.motion.travel).toFixed(3)}px` : 'none';
  },
};
