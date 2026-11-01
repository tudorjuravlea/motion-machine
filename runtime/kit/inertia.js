// A throw: motion that carries on after a release and comes to rest on a target or a bound (SPEC §6). Pure: a
// closed form in t, importable in Node and in the browser. For flicks, carousels and card throws.
//
// Released at `velocity` (units per second) from `from`, the position follows exponential friction toward a
// target:   x(t) = target - amp e^(-t / tau),   amp = power * velocity,   target = from + amp
// (or the nearest of the places `snap` allows, with amp re-aimed at it). If that target lies beyond `min` or
// `max`, the curve reaches the bound at t_b = -tau ln((target - bound) / amp), solved here rather than found
// by stepping, and from then on a spring carries the position: it starts on the bound with the friction
// curve's own speed there, (target - bound) / tau, so the hand-off is smooth, and settles on the bound (a rubber
// band). A throw that starts outside its bounds is handed to the spring at once. `elastic: false` is a wall:
// the position stops on the bound at t_b. Positions within restDelta of rest are drawn at rest, exactly on the
// target (or bound).
//
// The defaults are the throw feel: power 0.8, tau 325 ms, a band of stiffness 500 and damping 10. FEELS.drag is
// the slower feel of a dragged card (tau 750 ms, stiffness 200, damping 40).

import { spring } from './springs.js';

/** The two feels, as the options they set. */
export const FEELS = {
  throw: { power: 0.8, timeConstant: 325, bounceStiffness: 500, bounceDamping: 10, restDelta: 0.5 },
  drag: { power: 0.8, timeConstant: 750, bounceStiffness: 200, bounceDamping: 40, restDelta: 1 },
};

const fail = (msg) => { throw new TypeError(`inertia: ${msg}`); };

// the place `snap` lets the throw end on: a step (the nearest multiple), a list of places (the nearest), or a function
function snapTo(snap, ideal) {
  if (snap == null) return ideal;
  if (typeof snap === 'function') return snap(ideal);
  if (Array.isArray(snap)) {
    if (!snap.length) fail('snap lists no places');
    return snap.reduce((best, x) => (Math.abs(x - ideal) < Math.abs(best - ideal) ? x : best), snap[0]);
  }
  if (!(snap > 0)) fail('snap must be a step above 0, a list of places or a function');
  return Math.round(ideal / snap) * snap;
}

/**
 * inertia({ from, velocity, power, timeConstant (ms), min, max, snap, elastic, bounceStiffness, bounceDamping, restDelta })
 * → { at(t), velocity(t), target, end, settle, bound } with t in seconds from the release. `target` is where the
 * friction curve is headed, `end` where the position comes to rest (the bound, when the throw meets one), `settle`
 * when. `bound` is null, or { value, t } for the bound the throw meets (t is when it reaches it).
 */
export function inertia(opts) {
  const { from, velocity = 0, min, max, snap, elastic = true } = opts;
  const { power, timeConstant, bounceStiffness, bounceDamping, restDelta } = { ...FEELS.throw, ...opts };
  if (!Number.isFinite(from)) fail('from must be a number');
  if (!Number.isFinite(velocity)) fail('velocity must be a number');
  if (!(timeConstant > 0)) fail('timeConstant must be above 0 (milliseconds)');
  if (min != null && max != null && min > max) fail('min is above max');
  const tau = timeConstant / 1000;

  let amp = power * velocity;
  const ideal = from + amp;
  const target = snapTo(snap, ideal);
  if (target !== ideal) amp = target - from;

  const below = min != null && from < min, above = max != null && from > max;
  const outside = (x) => (min != null && x < min) || (max != null && x > max);
  const nearest = (x) => (min == null ? max : max == null ? min : Math.abs(min - x) < Math.abs(max - x) ? min : max);

  // the hand-off: where it leaves the friction curve, when, how fast, and the bound it settles on
  let hand = null;
  if (below || above) hand = { t: 0, x: from, v: amp / tau, to: nearest(from) };
  else if (outside(target)) {
    const bound = target > max ? max : min;
    const tb = -tau * Math.log((target - bound) / amp);
    hand = { t: tb, x: bound, v: (target - bound) / tau, to: bound };
  }

  const sp = { k: bounceStiffness, c: bounceDamping, m: 1 };
  const frictionEnd = Math.abs(amp) > restDelta ? tau * Math.log(Math.abs(amp) / restDelta) : 0;
  let settle = frictionEnd;
  if (hand) settle = hand.t + (elastic ? spring.settleFrom(sp, { delta: hand.to - hand.x, velocity: hand.v, eps: restDelta }) : 0);

  const at = (t) => {
    if (!(t > 0)) return from;
    if (t >= settle) return hand ? hand.to : target;
    if (hand && t >= hand.t) return spring.from(t - hand.t, sp, { from: hand.x, to: hand.to, velocity: hand.v });
    return target - amp * Math.exp(-t / tau);
  };
  const speed = (t) => {
    if (t < 0 || t >= settle) return 0;
    if (hand && t >= hand.t) return spring.velocityFrom(t - hand.t, sp, { from: hand.x, to: hand.to, velocity: hand.v });
    return (amp / tau) * Math.exp(-t / tau);
  };

  return { at, velocity: speed, target, end: hand ? hand.to : target, settle, bound: hand ? { value: hand.to, t: hand.t } : null };
}
