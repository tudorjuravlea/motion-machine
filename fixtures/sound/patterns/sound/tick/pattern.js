// Fixture stub: the smallest sound pattern satisfying the SPEC §5 / §9 module contract,
// so the pipeline is tested without depending on patterns/sound/*. Deterministic, DOM-free.
const FREQ = { 'soft-ui': 1500, percussive: 2400, cinematic: 900 };

export default {
  name: 'tick',
  group: 'sound',
  params: {},
  durationS: 0.07,
  render(ctx, at, feel = 'soft-ui') {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = FREQ[feel] ?? 1500;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.35, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + this.durationS);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + this.durationS + 0.01);
  },
};
