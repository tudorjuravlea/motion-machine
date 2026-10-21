// Fixture stub: a low thump, to give the mix a second, louder cue.
const FREQ = { 'soft-ui': 110, percussive: 80, cinematic: 55 };

export default {
  name: 'hit',
  group: 'sound',
  params: {},
  durationS: 0.25,
  render(ctx, at, feel = 'soft-ui') {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime((FREQ[feel] ?? 110) * 2, at);
    o.frequency.exponentialRampToValueAtTime(FREQ[feel] ?? 110, at + 0.08);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.6, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + this.durationS);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + this.durationS + 0.01);
  },
};
