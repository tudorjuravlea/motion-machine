// Modal tables for struck things, as data: the partials a bell, a bar or a block rings in, so a recipe names
// a material (`modes: "tubular"`) instead of listing ratios. Ratios and relative amplitudes restated from
// Earshot's bells, bars and knock materials (MIT, see NOTICE). Pure and dependency-free, so the clone and
// the mine lots can import it as well as synth.js.
//
// Each table: { kind: 'bell' | 'bar' | 'material', ratios, amps, decays? }. `amps` are linear, the loudest
// 1 or below; `decays` (materials only) multiply the decay time of each mode. A mode decays as
// tau = decay * ratio^-slope (a higher mode dies sooner); SLOPE is the default exponent, 0.75.
//
//   MODE_TABLES                    every table by name
//   MODE_SLOPE                     0.75, the exponent a recipe gets when it gives none
//   modePartials(name)             [[ratio, dB, decayMultiplier?], ...] for a table, dB against the loudest mode
//   decayOf(decay, ratio, slope)   the decay time of one mode
//   BEAT_HZ                        about 1 Hz, the doublet beat of a struck metal or glass body

export const MODE_SLOPE = 0.75;
export const BEAT_HZ = 1;

export const MODE_TABLES = {
  // bells: struck metal and glass that ring on
  tubular: { kind: 'bell', ratios: [1, 2.756, 5.404, 8.933, 13.34], amps: [0.35, 1, 0.7, 0.4, 0.2] },
  church: { kind: 'bell', ratios: [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166, 5.433, 6.796, 8.215], amps: [0.55, 0.8, 0.7, 0.35, 1, 0.45, 0.4, 0.3, 0.25, 0.18, 0.12, 0.08] },
  glass: { kind: 'bell', ratios: [1, 2.32, 4.25, 6.63, 9.38], amps: [1, 0.45, 0.25, 0.12, 0.06] },
  bowl: { kind: 'bell', ratios: [1, 2.71, 5.13, 8.27], amps: [1, 0.6, 0.3, 0.12] },
  // bars: tuned or free bars, struck with a mallet
  glock: { kind: 'bar', ratios: [1, 2.756, 5.404, 8.933], amps: [1, 0.35, 0.12, 0.05] },
  celesta: { kind: 'bar', ratios: [1, 2, 3.98, 6.9], amps: [1, 0.05, 0.22, 0.05] },
  metal: { kind: 'bar', ratios: [1, 3.9, 9.9], amps: [1, 0.25, 0.08] },
  marimba: { kind: 'bar', ratios: [1, 3.92, 9.8], amps: [1, 0.3, 0.08] },
  tine: { kind: 'bar', ratios: [1, 5.8, 6.27], amps: [1, 0.12, 0.2] },
  // materials: a knuckle or a stick on a body, many modes that die quickly
  block: { kind: 'material', ratios: [1, 1.48, 2.15, 3.4, 4.6], amps: [1, 0.55, 0.45, 0.25, 0.12], decays: [1, 0.6, 0.45, 0.3, 0.2] },
  shell: { kind: 'material', ratios: [1, 1.31, 1.77, 2.43, 3.1, 4.2, 5.6], amps: [0.7, 1, 0.8, 0.6, 0.4, 0.25, 0.15], decays: [1, 0.8, 0.6, 0.5, 0.35, 0.25, 0.2] },
  tok: { kind: 'material', ratios: [1, 2.7, 5.1], amps: [1, 0.15, 0.05], decays: [1, 0.3, 0.15] },
  desk: { kind: 'material', ratios: [1, 1.9, 2.8, 4.4, 6.3], amps: [1, 0.6, 0.5, 0.3, 0.15], decays: [1, 0.5, 0.4, 0.25, 0.15] },
};
// `bar` is the name a sound profile uses for the glockenspiel bar; both resolve to the same table.
MODE_TABLES.bar = MODE_TABLES.glock;

const round = (x) => Math.round(x * 100) / 100;

/** The partials of a table as `[ratio, dB]` pairs (a third entry, the decay multiplier, for a material); the loudest mode is 0 dB. */
export function modePartials(name) {
  const t = MODE_TABLES[name];
  if (!t) throw new Error(`unknown modes "${name}": ${Object.keys(MODE_TABLES).join(', ')}`);
  const top = Math.max(...t.amps);
  return t.ratios.map((ratio, i) => [ratio, round(20 * Math.log10(t.amps[i] / top)), ...(t.decays ? [t.decays[i]] : [])]);
}

/** The decay time of a mode at `ratio` to the fundamental: decay * ratio^-slope (a mode below the fundamental keeps the fundamental's). */
export const decayOf = (decay, ratio, slope = MODE_SLOPE) => (ratio > 1 ? decay * ratio ** -slope : decay);
