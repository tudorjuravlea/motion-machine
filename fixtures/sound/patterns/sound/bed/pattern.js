// Fixture stub: a seamless two-partial loop of exactly durationS (whole cycles, so the
// tiled copies join without a click).
export default {
  name: 'bed',
  group: 'sound',
  params: {},
  durationS: 1,
  render(ctx, at) {
    for (const [f, a] of [[220, 0.2], [330, 0.1]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.value = a;
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + this.durationS);
    }
  },
};
