// bed: a quiet loop under a held rest. Partials sit on whole cycles of the 1.6 s cell, so the
// cell loops without a seam, and stay below about 4 kHz so the bed does not mask the cues above
// roughly 800 Hz. Peak 0.12, about 8 dB under a cue at 0.35.

import { noiseBuf } from '../../../runtime/kit/synth.js';

const DURATION_S = 1.6;
const FADE_IN_S = 0.3;
const FADE_OUT_S = 1.5;
// Calibration so the summed partials peak at the gain param (measured by rendering, then fixed here).
const TRIM = { 'soft-ui': 1.11, percussive: 2.1, cinematic: 2.0 };
const PARAMS = {
  gain: { type: 'number', default: 0.12, meaning: 'peak of the bed (0 to 1)' },
  seed: { type: 'number', default: 97, meaning: 'seed for the noise component (cinematic feel)' },
};

// Frequencies are multiples of 0.625 Hz (whole cycles in 1.6 s) so the cell loops seamlessly.
const FEELS = {
  'soft-ui': { partials: [['sine', 110, 0.45], ['sine', 165, 0.3], ['sine', 220, 0.25]], lfo: [0.625, 0.15], lp: 1200, noise: 0 },
  percussive: { partials: [['triangle', 110, 0.4], ['triangle', 165, 0.3], ['triangle', 330, 0.1]], lfo: [2.5, 0.35], lp: 900, noise: 0 },
  cinematic: { partials: [['sine', 55, 0.35], ['sine', 82.5, 0.25], ['sine', 165, 0.15]], lfo: [0.625, 0.2], lp: 1500, noise: 0.25 },
};

export default {
  name: 'bed',
  group: 'sound',
  params: PARAMS,
  durationS: DURATION_S,
  // opts.durationS renders a longer span (the pipeline tiles the cell under a whole piece); the
  // fade-in is 0.3 s and the fade-out 1.5 s, the fade-out shortened to fit a span under 1.8 s.
  render(ctx, at, feel = 'soft-ui', opts = {}) {
    const f = FEELS[feel];
    if (!f) return;
    const pk = Number(opts.gain ?? PARAMS.gain.default) * TRIM[feel];
    const seed = Number(opts.seed ?? PARAMS.seed.default) >>> 0;
    const span = Number(opts.durationS ?? DURATION_S);
    const fadeOut = Math.min(FADE_OUT_S, Math.max(0, span - FADE_IN_S));
    const end = at + span;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, at);
    master.gain.linearRampToValueAtTime(1, at + FADE_IN_S);
    master.gain.setValueAtTime(1, end - fadeOut);
    master.gain.linearRampToValueAtTime(0, end);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = f.lp;
    lp.connect(master);
    master.connect(ctx.destination);

    // A slow swell: one gain stage whose level is moved by a low oscillator on whole cycles.
    const body = ctx.createGain();
    body.gain.value = pk * (1 - f.lfo[1]);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = f.lfo[0];
    const depth = ctx.createGain();
    depth.gain.value = pk * f.lfo[1];
    lfo.connect(depth);
    depth.connect(body.gain);
    body.connect(lp);
    lfo.start(at);
    lfo.stop(end);

    const share = 1 - f.noise;
    for (const [type, hz, w] of f.partials) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = w * share;
      o.connect(g);
      g.connect(body);
      o.start(at);
      o.stop(end);
    }
    if (f.noise) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf(ctx, DURATION_S, seed);
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 400;
      bp.Q.value = 0.5;
      const g = ctx.createGain();
      g.gain.value = f.noise;
      src.connect(bp);
      bp.connect(g);
      g.connect(body);
      src.start(at);
      src.stop(end);
    }
  },
};
