// success: a positive outcome, three rising notes (C, E, G). The contour rises; an error would fall. 0.3 to 0.6 s.

import { tone } from '../../../runtime/kit/synth.js';

const DURATION_S = 0.5;
// Calibration so the summed voices peak at the gain param (measured by rendering, then fixed here).
const TRIM = {"soft-ui":1.7388,"percussive":1.3005,"cinematic":1.8553};
const PARAMS = {
  gain: { type: 'number', default: 0.35, meaning: 'peak of the cue gain envelope (0 to 1)' },
  seed: { type: 'number', default: 71, meaning: 'seed for the noise component; the same seed renders the same samples' },
};

export default {
  name: 'success',
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
      tone(ctx, { soft: true, at, type: 'triangle', f0: 1046.5, dur: 0.3, peak: pk * 0.45, atk: 0.001 });
      tone(ctx, { soft: true, at: at + 0.055, type: 'triangle', f0: 1318.5, dur: 0.3, peak: pk * 0.45, atk: 0.001 });
      tone(ctx, { soft: true, at: at + 0.11, type: 'triangle', f0: 1568, dur: 0.36, peak: pk * 0.45, atk: 0.001 });
        return;
      case 'cinematic':
      tone(ctx, { soft: true, at, f0: 523.25, dur: 0.5, peak: pk * 0.2, atk: 0.01 });
      tone(ctx, { soft: true, at, f0: 1046.5, dur: 0.32, peak: pk * 0.35, atk: 0.008 });
      tone(ctx, { soft: true, at: at + 0.09, f0: 1318.5, dur: 0.32, peak: pk * 0.35, atk: 0.008 });
      tone(ctx, { soft: true, at: at + 0.18, f0: 1568, dur: 0.32, peak: pk * 0.35, atk: 0.008 });
        return;
      default:
      tone(ctx, { soft: true, at, f0: 1046.5, dur: 0.3, peak: pk * 0.4, atk: 0.006 });
      tone(ctx, { soft: true, at: at + 0.07, f0: 1318.5, dur: 0.3, peak: pk * 0.4, atk: 0.006 });
      tone(ctx, { soft: true, at: at + 0.14, f0: 1568, dur: 0.34, peak: pk * 0.4, atk: 0.006 });
    }
  },
};
