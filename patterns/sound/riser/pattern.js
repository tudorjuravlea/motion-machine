// riser: the second before a climax, a swell that rises in pitch and level and stops on the beat it leads to. 0.6 to 1.5 s. The fade-in is the point, so it releases in 20 ms and leaves the hit to the next cue.

import { tone, burst } from '../../../runtime/kit/synth.js';

const DURATION_S = 1.2;
// Calibration so the summed voices peak at the gain param (measured by rendering, then fixed here).
const TRIM = {"soft-ui":1.3018,"percussive":0.9855,"cinematic":1.4133};
const PARAMS = {
  gain: { type: 'number', default: 0.35, meaning: 'peak of the cue gain envelope (0 to 1)' },
  seed: { type: 'number', default: 61, meaning: 'seed for the noise component; the same seed renders the same samples' },
};

export default {
  name: 'riser',
  group: 'sound',
  params: PARAMS,
  durationS: DURATION_S,
  anchor: 'end',   // the schedule places this cue so it resolves on the beat's arrival
  // ctx: a Web Audio BaseAudioContext (an OfflineAudioContext at render time); at: start, seconds;
  // feel: soft-ui | percussive | cinematic (none renders nothing). opts may override gain and seed.
  render(ctx, at, feel = 'soft-ui', opts = {}) {
    const pk = Number(opts.gain ?? PARAMS.gain.default) * (TRIM[feel] ?? TRIM['soft-ui']);
    const seed = Number(opts.seed ?? PARAMS.seed.default) >>> 0;
    const D = DURATION_S;
    switch (feel) {
      case 'none':
        return;
      case 'percussive':
      burst(ctx, { at, dur: D, peak: pk * 0.6, swell: true, kind: 'highpass', f0: 800, f1: 7000, q: 0.7, seed });
      tone(ctx, { at, type: 'sawtooth', f0: 220, f1: 1320, dur: D, peak: pk * 0.3, swell: true, lp: 3000 });
        return;
      case 'cinematic':
      burst(ctx, { at, dur: D, peak: pk * 0.45, swell: true, f0: 200, f1: 5000, q: 0.7, seed });
      tone(ctx, { at, type: 'sawtooth', f0: 110, f1: 440, dur: D, peak: pk * 0.3, swell: true, lp: 1500 });
      tone(ctx, { at, f0: 55, f1: 220, dur: D, peak: pk * 0.25, swell: true });
        return;
      default:
      burst(ctx, { at, dur: D, peak: pk * 0.55, swell: true, kind: 'lowpass', f0: 350, f1: 3200, q: 0.8, seed });
      tone(ctx, { at, f0: 330, f1: 880, dur: D, peak: pk * 0.4, swell: true });
    }
  },
};
