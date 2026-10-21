// Web Audio building blocks for the sound patterns: a seeded noise buffer, a gain envelope, a
// pitched tone and a filtered noise burst, each scheduled on an AudioContext at a time in seconds.
// Pure in their arguments: the noise comes from a seeded generator (mulberry32, not the kit's
// random(): the cues' calibration was measured against this sequence), so a cue renders to the same
// samples every time.

const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
export function noiseBuf(ctx, secs, seed) {
  const n = Math.max(1, Math.round(ctx.sampleRate * secs));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0), r = rng(seed);
  for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
  return buf;
}
const FLOOR = 0.0001;
// Envelope: silence, a short attack to peak, then an exponential decay that ends at at + dur.
// With swell: a rise from the floor to peak at the end, released over the last 20 ms.
// With soft: the decay stops at 6 % of peak at 85 % of the length and falls linearly to silence,
// so a chord rings for most of its length instead of dying early.
function shape(g, at, peak, atk, dur, swell, soft) {
  const p = g.gain;
  if (swell) {
    p.setValueAtTime(FLOOR, at);
    p.exponentialRampToValueAtTime(peak, at + dur - 0.02);
    p.linearRampToValueAtTime(0, at + dur);
    return;
  }
  p.setValueAtTime(0, at);
  p.linearRampToValueAtTime(peak, at + atk);
  if (soft) {
    p.exponentialRampToValueAtTime(peak * 0.06, at + dur * 0.85);
    p.linearRampToValueAtTime(0, at + dur);
    return;
  }
  p.exponentialRampToValueAtTime(FLOOR, at + dur);
  p.setValueAtTime(0, at + dur);
}
export function tone(ctx, o) {
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f0, o.at);
  if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(o.f1, o.at + o.dur);
  const g = ctx.createGain();
  shape(g, o.at, o.peak, o.atk ?? 0.003, o.dur, o.swell, o.soft);
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    osc.connect(f);
    f.connect(g);
  } else osc.connect(g);
  g.connect(ctx.destination);
  osc.start(o.at);
  osc.stop(o.at + o.dur + 0.02);
}
export function burst(ctx, o) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf(ctx, o.dur + 0.05, o.seed);
  const f = ctx.createBiquadFilter();
  f.type = o.kind || 'bandpass';
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f0, o.at);
  if (o.f1 && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(o.f1, o.at + o.dur);
  const g = ctx.createGain();
  shape(g, o.at, o.peak, o.atk ?? 0.002, o.dur, o.swell, o.soft);
  src.connect(f);
  f.connect(g);
  g.connect(ctx.destination);
  src.start(o.at);
  src.stop(o.at + o.dur + 0.02);
}
