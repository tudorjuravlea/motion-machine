// tick: the smallest cue, a small arrival (a chip, a word, a bar landing). 40 to 90 ms, so it sits under the arrival it marks without becoming a second event.

import { tone, burst } from '../../../runtime/kit/synth.js';

const DURATION_S = 0.06;
// Calibration so the summed voices peak at the gain param (measured by rendering, then fixed here).
const TRIM = {"soft-ui":1.0596,"percussive":1.2143,"cinematic":1.3335};
const PARAMS = {
  gain: { type: 'number', default: 0.35, meaning: 'peak of the cue gain envelope (0 to 1)' },
  seed: { type: 'number', default: 11, meaning: 'seed for the noise component; the same seed renders the same samples' },
};

export default {
  name: 'tick',
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
      burst(ctx, { at, dur: 0.045, peak: pk * 0.55, atk: 0.001, kind: 'highpass', f0: 3500, q: 0.7, seed });
      tone(ctx, { at, f0: 2600, f1: 1900, dur: 0.06, peak: pk * 0.45, atk: 0.001 });
        return;
      case 'cinematic':
      tone(ctx, { at, f0: 1000, f1: 700, dur: 0.06, peak: pk * 0.6, atk: 0.002 });
      tone(ctx, { at, type: 'triangle', f0: 500, f1: 400, dur: 0.06, peak: pk * 0.35, atk: 0.002, lp: 2000 });
        return;
      default:
      tone(ctx, { at, f0: 1500, f1: 1250, dur: 0.06, peak: pk * 0.9, atk: 0.002, lp: 4000 });
    }
  },
};
