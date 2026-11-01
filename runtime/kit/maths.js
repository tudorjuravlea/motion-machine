// The small maths a pattern keeps reaching for (SPEC §6). Pure. Where the last argument is left out the call
// returns the function, so `wrap(0, 360)` is a reusable wrapper.

import { random } from './random.js';

const bad = (msg) => { throw new TypeError(`maths: ${msg}`); };
// a function of the last argument, unless it is given now
const lastOf = (n, fn) => (...a) => (a.length >= n ? fn(...a) : (v) => fn(...a, v));

/** clamp(min, max, v): v held inside [min, max]. */
export const clamp = lastOf(3, (min, max, v) => (v > max ? max : v < min ? min : v));

/** mapRange(inMin, inMax, outMin, outMax, v): v moved from one range to another, not clamped. */
export const mapRange = lastOf(5, (a, b, c, d, v) => (b === a ? c : c + ((d - c) * (v - a)) / (b - a)));

/** wrap(min, max, v): v carried round and round [min, max), whichever way it was left (wrap(0, 360, -10) is 350). */
export const wrap = lastOf(3, (min, max, v) => {
  const r = max - min;
  return ((((v - min) % r) + r) % r) + min;
});

/** wrapYoyo(min, max, v): v run up and down [min, max] like a ping-pong (wrapYoyo(0, 100, 150) is 50). */
export const wrapYoyo = lastOf(3, (min, max, v) => {
  const r = max - min, t = (((v - min) % (2 * r)) + 2 * r) % (2 * r);
  return min + (t > r ? 2 * r - t : t);
});

/** snap(step | [places], v): v moved to the nearest multiple of step, or the nearest of the places (the first on a tie). */
export const snap = lastOf(2, (to, v) => {
  if (Array.isArray(to)) {
    if (!to.length) bad('snap lists no places');
    return to.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), to[0]);
  }
  return to > 0 ? Number((Math.round(v / to) * to).toPrecision(12)) : v;
});

/** randomAt(seed, index): a float in [0, 1) that depends on the seed and the index alone, so any order gives the same value. */
export const randomAt = (seed, index) => random(`${seed}:${index}`)();

/** randomIn(seed, index, min, max, snapTo): randomAt spread over [min, max) and, if snapTo is given, snapped (see snap). */
export const randomIn = (seed, index, min, max, snapTo) => {
  const v = min + (max - min) * randomAt(seed, index);
  return snapTo == null ? v : snap(snapTo, v);
};

/** The turn in degrees from one heading to another: 'short' (the shorter way, half a turn goes clockwise), 'cw' or 'ccw'. */
export function arcDelta(from, to, mode = 'short') {
  if (mode !== 'short' && mode !== 'cw' && mode !== 'ccw') bad(`direction must be short, cw or ccw, got "${mode}"`);
  const d = (((to - from) % 360) + 360) % 360;   // clockwise, 0..360
  if (mode === 'cw') return d;
  if (mode === 'ccw') return d === 0 ? 0 : d - 360;
  return d > 180 ? d - 360 : d;
}

/** The angle to turn to from `from`: a number is that angle; "-170_short", "350_cw", "350_ccw" turn the named way, carrying on from `from`. */
export function rotateTo(from, spec) {
  if (typeof spec === 'number') return spec;
  const m = /^\s*(-?\d+(?:\.\d+)?)(?:_(short|cw|ccw))?\s*$/.exec(String(spec));
  if (!m) bad(`"${spec}" is not an angle: a number, or "170_short", "170_cw", "170_ccw"`);
  return m[2] ? from + arcDelta(from, Number(m[1]), m[2]) : Number(m[1]);
}
