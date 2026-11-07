// press: a deck press or a button. A short falling click, 120 ms at most.

import { tone, burst } from '../../../runtime/kit/synth.js';

const DURATION_S = 0.1;
// Calibration so the summed voices peak at the gain param (measured by rendering, then fixed here).
const TRIM = {"soft-ui":1.407,"percussive":1.6361,"cinematic":1.5182};
const PARAMS = {
  gain: { type: 'number', default: 0.35, meaning: 'peak of the cue gain envelope (0 to 1)' },
  seed: { type: 'number', default: 23, meaning: 'seed for the noise component; the same seed renders the same samples' },
};

export default {
  name: 'press',
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
      tone(ctx, { at, f0: 1300, f1: 420, dur: 0.08, peak: pk * 0.6, atk: 0.001 });
      burst(ctx, { at, dur: 0.02, peak: pk * 0.4, atk: 0.001, f0: 2200, q: 1.5, seed });
        return;
      case 'cinematic':
      tone(ctx, { at, f0: 1000, f1: 520, dur: 0.095, peak: pk * 0.55, atk: 0.003 });
      tone(ctx, { at, type: 'triangle', f0: 1800, f1: 1100, dur: 0.04, peak: pk * 0.25, atk: 0.001 });
      burst(ctx, { at, dur: 0.03, peak: pk * 0.2, atk: 0.001, kind: 'lowpass', f0: 1800, seed });
        return;
      default:
      tone(ctx, { at, f0: 1100, f1: 800, dur: 0.09, peak: pk * 0.7, atk: 0.003 });
      burst(ctx, { at, dur: 0.02, peak: pk * 0.3, atk: 0.001, kind: 'lowpass', f0: 2500, seed });
    }
  },
};
