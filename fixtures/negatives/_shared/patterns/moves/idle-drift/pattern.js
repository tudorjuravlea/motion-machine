// Gate fixture stub: a deliberately large idle drift (space step 4, twice over the scene) so
// W-AMBIENT has something to catch. Downward only, so text never crosses the top margin.
export default {
  name: 'idle-drift',
  group: 'moves',
  params: {},
  at(el, p, ctx) {
    const amp = ctx.style.space[4];
    el.style.translate = `0 ${(amp * (1 - Math.cos(p * Math.PI * 4)) / 2).toFixed(3)}px`;
  },
};
