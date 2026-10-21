// complete: the end card, a resolved chord (C major, in the upper octave) that is allowed to ring out. About 0.6 s.

import { tone } from '../../../runtime/kit/synth.js';

const DURATION_S = 0.6;
// Calibration so the summed voices peak at the gain param (measured by rendering, then fixed here).
const TRIM = {"soft-ui":1.2293,"percussive":1.5439,"cinematic":1.1934};
const PARAMS = {
  gain: { type: 'number', default: 0.35, meaning: 'peak of the cue gain envelope (0 to 1)' },
  seed: { type: 'number', default: 83, meaning: 'seed for the noise component; the same seed renders the same samples' },
};

export default {
  name: 'complete',
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
      tone(ctx, { soft: true, at, f0: 140, f1: 60, dur: 0.2, peak: pk * 0.3, atk: 0.001 });
      for (const f of [1046.5, 1318.5, 1568]) tone(ctx, { soft: true, at, type: 'triangle', f0: f, dur: 0.6, peak: pk * 0.22, atk: 0.002 });
        return;
      case 'cinematic':
      tone(ctx, { soft: true, at, f0: 130.81, dur: 0.6, peak: pk * 0.3, atk: 0.02 });
      tone(ctx, { soft: true, at, f0: 196, dur: 0.6, peak: pk * 0.25, atk: 0.02 });
      tone(ctx, { soft: true, at, f0: 1046.5, dur: 0.6, peak: pk * 0.25, atk: 0.03 });
      tone(ctx, { soft: true, at, f0: 1568, dur: 0.6, peak: pk * 0.2, atk: 0.03 });
        return;
      default:
      for (const f of [1046.5, 1318.5, 1568]) tone(ctx, { soft: true, at, f0: f, dur: 0.6, peak: pk * 0.3, atk: 0.01 });
    }
  },
};
