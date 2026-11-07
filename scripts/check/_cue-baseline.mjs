// W-CUE's chance baseline (SPEC §7, §9): how often a sound onset falls within 100 ms of a
// picture event, and how often it does when the events are moved by fixed offsets (100, 170, 230 and 290 ms, both ways).
// Only a share better than the shifted one means anything: a crowded film hits its neighbours by chance. Evidence only. Pure.

export const WITHIN_S = 0.1;
export const SHIFTS_S = [0.1, 0.17, 0.23, 0.29, -0.1, -0.17, -0.23, -0.29];

const within = (a, b) => Math.round(Math.abs(a - b) * 1000) < WITHIN_S * 1000;
const shareOf = (events, onsets, shift) => events.filter((p) => onsets.some((o) => within(p + shift, o))).length / events.length;
const r3 = (x) => Math.round(x * 1000) / 1000;

/** { events, share, shiftedShare, gain, shiftsS } for picture instants and sound onsets in seconds, or null with no events or onsets. */
export function baselineOf(events, onsets) {
  if (!events.length || !onsets.length) return null;
  const share = shareOf(events, onsets, 0);
  const shifted = SHIFTS_S.reduce((a, s) => a + shareOf(events, onsets, s), 0) / SHIFTS_S.length;
  return { events: events.length, share: r3(share), shiftedShare: r3(shifted), gain: r3(share - shifted), withinMs: WITHIN_S * 1000, shiftsMs: SHIFTS_S.map((s) => Math.round(s * 1000)) };
}
