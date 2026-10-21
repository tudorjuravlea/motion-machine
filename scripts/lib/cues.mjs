// The pure part of the sound cues the gate reads (SPEC §9): cue events from a schedule, the nearest
// beat, the drift W-CUE allows, and a beat grid from its JSON. No Node built-in, so W-CUE's verdict
// loads in a browser (the studio); scripts/sound.mjs re-exports all of it.

export const DRIFT_S = 0.04;

export const cueName = (c) => String(c).replace(/^sound\//, '');

/** Cue events (film) from a schedule: [{ t, name, selector, scene }], sorted. */
export function cueEvents(sched) {
  return (sched?.events ?? []).filter((e) => e.kind === 'cue' && typeof e.t === 'number')
    .map((e) => ({ t: e.t, name: cueName(e.cue), selector: e.selector, scene: e.scene })).sort((a, b) => a.t - b.t);
}

/** The sorted beat times of a parsed beats.json (an array, or `{ beats }`), or null when empty. */
export function beatsOf(json) {
  const beats = Array.isArray(json) ? json : json.beats;
  return Array.isArray(beats) && beats.length ? beats.map(Number).sort((a, b) => a - b) : null;
}

export function nearest(sorted, t) {
  let lo = 0, hi = sorted.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (sorted[mid] < t) lo = mid; else hi = mid; }
  return Math.abs(sorted[lo] - t) <= Math.abs(sorted[hi] - t) ? sorted[lo] : sorted[hi];
}
