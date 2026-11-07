// swipe: a transition between scenes, a band of air sweeping across. 150 to 350 ms; the sound pipeline places it on the cut.

import { tone, burst } from '../../../runtime/kit/synth.js';

const DURATION_S = 0.3;
// Calibration so the summed voices peak at the gain param (measured by rendering, then fixed here).
const TRIM = {"soft-ui":2.4693,"percussive":1.0323,"cinematic":2.9988};
const PARAMS = {
  gain: { type: 'number', default: 0.35, meaning: 'peak of the cue gain envelope (0 to 1)' },
  seed: { type: 'number', default: 37, meaning: 'seed for the noise component; the same seed renders the same samples' },
};

export default {
  name: 'swipe',
  group: 'sound',
  params: PARAMS,
  durationS: DURATION_S,
  anchor: 'end',   // the schedule places this cue so it resolves on the beat's arrival
  // ctx: a Web Audio BaseAudioContext (an OfflineAudioContext at render time); at: start, seconds;
  // feel: soft-ui | percussive | cinematic (none renders nothing). opts may override gain and seed.
  render(ctx, at, feel = 'soft-ui', opts = {}) {
    const pk = Number(opts.gain ?? PARAMS.gain.default) * (TRIM[feel] ?? TRIM['soft-ui']);
    const seed = Number(opts.seed ?? PARAMS.seed.default) >>> 0;
    switch (feel) {
      case 'none':
        return;
      case 'percussive':
      burst(ctx, { at, dur: 0.28, peak: pk * 0.7, atk: 0.015, kind: 'highpass', f0: 1500, f1: 6000, q: 0.8, seed });
      burst(ctx, { at, dur: 0.08, peak: pk * 0.25, atk: 0.002, f0: 3000, q: 1, seed: seed + 1 });
        return;
      case 'cinematic':
      burst(ctx, { at, dur: 0.3, peak: pk * 0.65, atk: 0.12, f0: 600, f1: 2800, q: 1.2, seed });
      tone(ctx, { at, f0: 440, f1: 220, dur: 0.3, peak: pk * 0.2, atk: 0.1 });
        return;
      default:
      burst(ctx, { at, dur: 0.28, peak: pk * 0.9, atk: 0.09, f0: 700, f1: 2800, q: 0.9, seed });
    }
  },
};
