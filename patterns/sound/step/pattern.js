// step: progress advancing (a counter step, a list item, a stage). A rising blip, 150 ms at most.

import { tone, burst } from '../../../runtime/kit/synth.js';

const DURATION_S = 0.14;
// Calibration so the summed voices peak at the gain param (measured by rendering, then fixed here).
const TRIM = {"soft-ui":1.2389,"percussive":1.5835,"cinematic":1.2799};
const PARAMS = {
  gain: { type: 'number', default: 0.35, meaning: 'peak of the cue gain envelope (0 to 1)' },
  seed: { type: 'number', default: 41, meaning: 'seed for the noise component; the same seed renders the same samples' },
};

export default {
  name: 'step',
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
      tone(ctx, { at, type: 'triangle', f0: 1320, dur: 0.13, peak: pk * 0.55, atk: 0.001 });
      burst(ctx, { at, dur: 0.03, peak: pk * 0.4, atk: 0.001, f0: 4000, q: 1, seed });
        return;
      case 'cinematic':
      tone(ctx, { at, f0: 880, dur: 0.14, peak: pk * 0.45, atk: 0.006 });
      tone(ctx, { at, f0: 1320, dur: 0.14, peak: pk * 0.4, atk: 0.006 });
        return;
      default:
      tone(ctx, { at, f0: 880, f1: 940, dur: 0.13, peak: pk * 0.75, atk: 0.004 });
      tone(ctx, { at, f0: 1760, dur: 0.07, peak: pk * 0.2, atk: 0.004 });
    }
  },
};
