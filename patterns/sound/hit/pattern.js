// hit: a slam or a figure landing. A low body with a short transient on top, 150 to 400 ms.

import { tone, burst } from '../../../runtime/kit/synth.js';

const DURATION_S = 0.4;
// Calibration so the summed voices peak at the gain param (measured by rendering, then fixed here).
const TRIM = {"soft-ui":1.3628,"percussive":1.3664,"cinematic":1.7056};
const PARAMS = {
  gain: { type: 'number', default: 0.35, meaning: 'peak of the cue gain envelope (0 to 1)' },
  seed: { type: 'number', default: 53, meaning: 'seed for the noise component; the same seed renders the same samples' },
};

export default {
  name: 'hit',
  group: 'sound',
  params: PARAMS,
  durationS: DURATION_S,
  // ctx: a Web Audio BaseAudioContext (an OfflineAudioContext at render time); at: start, seconds;
  // feel: soft-ui | percussive | cinematic (none renders nothing). opts may override gain and seed.
  render(ctx, at, feel = 'soft-ui', opts = {}) {
    const pk = Number(opts.gain ?? PARAMS.gain.default) * (TRIM[feel] ?? TRIM['soft-ui']);
    const seed = Number(opts.seed ?? PARAMS.seed.default) >>> 0;
    switch (feel) {
      case 'none':
        return;
      case 'percussive':
      tone(ctx, { at, f0: 170, f1: 48, dur: 0.34, peak: pk * 0.6, atk: 0.001 });
      burst(ctx, { at, dur: 0.08, peak: pk * 0.4, atk: 0.001, f0: 1800, q: 0.8, seed });
        return;
      case 'cinematic':
      tone(ctx, { at, f0: 100, f1: 38, dur: 0.4, peak: pk * 0.5, atk: 0.003 });
      burst(ctx, { at, dur: 0.4, peak: pk * 0.3, atk: 0.004, kind: 'lowpass', f0: 600, f1: 140, seed });
      tone(ctx, { at, type: 'triangle', f0: 1200, f1: 600, dur: 0.08, peak: pk * 0.2, atk: 0.002 });
        return;
      default:
      tone(ctx, { at, f0: 180, f1: 80, dur: 0.4, peak: pk * 0.6, atk: 0.004 });
      burst(ctx, { at, dur: 0.1, peak: pk * 0.25, atk: 0.003, kind: 'lowpass', f0: 900, seed });
      tone(ctx, { at, f0: 1400, f1: 900, dur: 0.05, peak: pk * 0.15, atk: 0.002 });
    }
  },
};
