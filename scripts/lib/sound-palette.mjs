// What a sound profile asks of a cue, as numbers read from the cue's samples (SPEC §9, W-PALETTE). Library only.
// Pure in its inputs: `channels` (one Float32Array per channel) and the sample rate, measured by
// scripts/lib/audio-measure.mjs, the same measurer `mm sound-listen`, `mm sound mine` and `mm sound clone` use.
//
//   judgeCue(channels, sr, profile, { durationS, emphasis })   { family, measured, checks: [{ check, ok, measured, band, message }] }
//   misses(judged)                                              the checks that failed
//
// The checks, each against the profile:
//   register  the spectral centroid is at or under `register.maxCentreHz`, and under 2 % of the power sits below three quarters of `register.minHz`
//   attack    a struck note (attack up to 10 ms, as applyProfile reads it) attacks inside `envelope.attackS`, with 3 ms of slack for the
//             measurer's 2 ms window; a longer onset is a swell and has no band
//   length    the cue rings (until it is last within 40 dB of its peak) no longer than the ladder step of its family plus the room's own
//             tail (two thirds of `room.sizeS`), and no shorter than a third of the step under it; the family is the cue's own declared
//             length when it has one, else its measured length (a sample's)
//   level     the loudest 100 ms (K-weighted) is within `loudness.tolDb` of `loudness.cueLufs100ms` (twice that for an arrangement other
//             than normal, which drops or adds a layer)
//   peak      the sample peak is at or under `loudness.peakDbfs`
import { familyOf } from '../../runtime/kit/synth.js';
import { measure, spectrum } from './audio-measure.mjs';

export const LADDER_S = { input: 0.06, surface: 0.3, outcome: 0.65 };     // the top of each family (familyOf)
const LADDER_FLOOR_S = { input: 0, surface: 0.06, outcome: 0.3, swell: 0.65 };
const SWELL_MAX_S = 2.5;
export const STRUCK_S = 0.01;            // an attack up to this is a struck note (synth.js STRUCK_ATTACK_S)
export const ATTACK_SLACK_S = 0.003;
export const LOW_SHARE = 0.02;
export const LOW_FLOOR = 0.75;            // of the profile's minHz: a low note's spectrum leaks a little under its fundamental
const round = (x, p = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** p) / 10 ** p : x);

/** The share of the sound's spectral power under `hz`. */
export function powerUnder(channels, sr, hz) {
  const sp = spectrum(channels, sr);
  let low = 0, all = 0;
  for (let k = 1; k < sp.p.length; k++) { all += sp.p[k]; if (sp.f[k] < hz) low += sp.p[k]; }
  return all > 0 ? low / all : 0;
}

/**
 * `durationS`: the cue's own length when it has one (a recipe's, a sample's trimmed length); without it the family follows
 * from the measured ring (1.5 times the time to fall 40 dB is the time to fall 60).
 */
export function judgeCue(channels, sr, profile, { durationS = null, emphasis = 'normal', measured = null } = {}) {
  const m = measured ?? measure(channels, sr);                       // `measured`: the caller's own measure(channels, sr), when it has one
  const family = familyOf(Number.isFinite(durationS) && durationS > 0 ? durationS : m.audibleS * 1.5);
  const out = [];
  const add = (check, ok, measured, band, message) => out.push({ check, ok, measured, band, message });

  const reg = profile.register, low = powerUnder(channels, sr, reg.minHz * LOW_FLOOR);
  const regOk = m.centroidHz <= reg.maxCentreHz && low <= LOW_SHARE;
  add('register', regOk, { centroidHz: round(m.centroidHz, 0), powerUnderMinPct: round(low * 100, 1) }, { maxCentreHz: reg.maxCentreHz, minHz: reg.minHz },
    m.centroidHz > reg.maxCentreHz ? `its centre of sound is ${Math.round(m.centroidHz)} Hz, above the profile's ${reg.maxCentreHz} Hz`
      : low > LOW_SHARE ? `${round(low * 100, 1)} % of its power sits under ${round(reg.minHz * LOW_FLOOR, 0)} Hz, below the profile's ${reg.minHz} Hz floor` : 'in register');

  const [a0, a1] = profile.envelope.attackS;
  if (m.attackS == null || m.attackS > STRUCK_S) add('attack', true, m.attackS == null ? null : round(m.attackS * 1000, 1), 'swell: no band', 'a swell, which has no struck attack');
  else {
    const ok = m.attackS <= a1 + ATTACK_SLACK_S;
    add('attack', ok, round(m.attackS * 1000, 1), { maxMs: round((a1 + ATTACK_SLACK_S) * 1000, 1), profileMs: [a0 * 1000, a1 * 1000] }, ok ? 'struck inside the profile' : `its attack is ${round(m.attackS * 1000, 1)} ms, slower than the profile's ${a0 * 1000}-${a1 * 1000} ms`);
  }

  const tail = (profile.room.sizeS * 2) / 3;
  const top = family === 'swell' ? SWELL_MAX_S : LADDER_S[family] + tail, bottom = LADDER_FLOOR_S[family] / 3;
  const lenOk = m.audibleS <= top && m.audibleS >= bottom;
  add('length', lenOk, round(m.audibleS), { family, minS: round(bottom), maxS: round(top) },
    lenOk ? `a ${family} cue` : m.audibleS > top ? `it rings ${round(m.audibleS)} s, longer than a ${family} cue's ${round(top)} s` : `it rings only ${round(m.audibleS)} s, shorter than a ${family} cue's ${round(bottom)} s`);

  const tol = profile.loudness.tolDb * (emphasis === 'normal' ? 1 : 2), dev = m.lufs100ms - profile.loudness.cueLufs100ms;
  add('level', Math.abs(dev) <= tol, round(m.lufs100ms, 1), { lufs: profile.loudness.cueLufs100ms, tolDb: tol },
    Math.abs(dev) <= tol ? 'on the matched level' : `its loudest 100 ms is ${round(m.lufs100ms, 1)} LUFS, ${round(Math.abs(dev), 1)} dB ${dev > 0 ? 'over' : 'under'} the profile's ${profile.loudness.cueLufs100ms} LUFS (tolerance ${tol} dB)`);

  add('peak', m.peakDbfs <= profile.loudness.peakDbfs, round(m.peakDbfs, 1), { maxDbfs: profile.loudness.peakDbfs },
    m.peakDbfs <= profile.loudness.peakDbfs ? 'under the ceiling' : `its peak is ${round(m.peakDbfs, 1)} dBFS, over the profile's ${profile.loudness.peakDbfs} dBFS`);

  return { family, measured: m, checks: out };
}

export const misses = (judged) => judged.checks.filter((c) => !c.ok);
