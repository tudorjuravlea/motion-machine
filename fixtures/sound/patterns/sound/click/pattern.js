// Fixture stub: a click that starts on its sample, so a test can find where a cue landed. 64 samples
// (1.3 ms at 48 kHz) of a 3 kHz sine under a raised-cosine window: sharp enough to place to a
// fraction of a millisecond, soft enough for an AAC encoder. Deterministic, DOM-free.
const N = 64;

export default {
  name: 'click',
  group: 'sound',
  params: {},
  durationS: 0.01,
  render(ctx, at) {
    const buf = ctx.createBuffer(1, N, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < N; i++) d[i] = 0.9 * Math.sin(2 * Math.PI * 3000 * (i / ctx.sampleRate)) * 0.5 * (1 - Math.cos((2 * Math.PI * (i + 0.5)) / N));
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.connect(ctx.destination);
    s.start(at);
  },
};
