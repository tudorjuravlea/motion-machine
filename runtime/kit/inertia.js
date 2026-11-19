// A throw: motion that carries on after a release and comes to rest on a target or a bound (SPEC §6). Pure: a
// closed form in t, importable in Node and in the browser. For flicks, carousels and card throws.
//
// Released at `velocity` (units per second) from `from`, the position follows exponential friction toward a
// target:   x(t) = target - amp e^(-t / tau),   amp = velocity * tau,   target = from + amp
// so the throw leaves at exactly the release speed (amp / tau = velocity) and travels velocity * tau, as a
// scroll view does (`rate`, its deceleration per millisecond, sets tau = -1 / ln(rate)). An explicit `power`
// keeps the older form, amp = power * velocity, whose start speed is power / tau times the release.
//
// With `snap`, the throw picks where it ends the way a sheet or a carousel does: a release slower than
// `minFlick` lands on the place nearest where it was let go; a flick lands on the place nearest the friction
// curve's end, but never on one behind the release, so it moves at least one place its way, and with
// `skip: false` at most one. It lands on a spring that starts at the release speed (the sheet spring:
// response 0.34 s, critically damped, damping 0.88 once the release is a flick), so a snap never jumps in speed.
//
// If the friction target (with no snap) lies beyond `min` or
// `max`, the curve reaches the bound at t_b = -tau ln((target - bound) / amp), solved here rather than found
// by stepping, and from then on a spring carries the position: it starts on the bound with the friction
// curve's own speed there, (target - bound) / tau, so the hand-off is smooth, and settles on the bound (a rubber
// band). A throw that starts outside its bounds is handed to the spring at once. `elastic: false` is a wall:
// the position stops on the bound at t_b. Positions within restDelta of rest are drawn at rest, exactly on the
// target (or bound).
//
// The defaults are the throw feel: tau 325 ms, a band of stiffness 500 and damping 10. FEELS.drag is the slower
// feel of a dragged card (tau 750 ms, stiffness 200, damping 40). The snap rules and the sheet spring follow
// the sheet physics of UI SDK (Apache-2.0), restated in our own code; see PROVENANCE.md.

import { spring } from './springs.js';

/** The two feels, as the options they set. */
export const FEELS = {
  throw: { timeConstant: 325, bounceStiffness: 500, bounceDamping: 10, restDelta: 0.5 },
  drag: { timeConstant: 750, bounceStiffness: 200, bounceDamping: 40, restDelta: 1 },
};

/** The snap landing: the slowest flick (units per second; 0.5 px per ms), and the sheet spring as period and damping. */
export const SNAP = { minFlick: 500, skip: true, response: 0.34, damping: 1, flickDamping: 0.88 };

/** A scroll view's deceleration per millisecond: how far a throw goes, as tau = -1 / ln(rate) ms. */
export const RATES = { normal: 0.998, fast: 0.99 };

const fail = (msg) => { throw new TypeError(`inertia: ${msg}`); };

// The place `snap` lets the throw end on. A function is asked with the ideal end. A step or a list of places:
// a release slower than minFlick takes the place nearest `from`; a flick the place nearest `ideal`, moved on to
// the first place past `from` in its direction when that one is behind, and with skip false no further than it.
function snapTo(snap, { from, ideal, velocity, minFlick, skip }) {
  if (typeof snap === 'function') return snap(ideal);
  let nearest, beyond;
  if (Array.isArray(snap)) {
    if (!snap.length) fail('snap lists no places');
    nearest = (x) => snap.reduce((best, p) => (Math.abs(p - x) < Math.abs(best - x) ? p : best), snap[0]);
    beyond = (dir) => { const past = snap.filter((p) => (dir > 0 ? p > from + 1e-9 : p < from - 1e-9)); return past.length ? (dir > 0 ? Math.min(...past) : Math.max(...past)) : null; };
  } else {
    if (!(snap > 0)) fail('snap must be a step above 0, a list of places or a function');
    nearest = (x) => Math.round(x / snap) * snap;
    beyond = (dir) => (dir > 0 ? Math.floor(from / snap + 1e-9) + 1 : Math.ceil(from / snap - 1e-9) - 1) * snap;
  }
  if (Math.abs(velocity) < minFlick) return nearest(from);
  const dir = Math.sign(velocity), next = beyond(dir);
  let to = nearest(ideal);
  if (next != null && (dir > 0 ? to <= from : to >= from)) to = next;
  if (!skip && next != null) to = dir > 0 ? Math.min(to, next) : Math.max(to, next);
  return to;
}

/**
 * inertia({ from, velocity, timeConstant (ms) | rate, power, min, max, snap, minFlick, skip, response, damping,
 *   flickDamping, elastic, bounceStiffness, bounceDamping, restDelta })
 * → { at(t), velocity(t), target, end, settle, bound } with t in seconds from the release. `target` is where the
 * friction curve is headed, `end` where the position comes to rest (the bound, when the throw meets one), `settle`
 * when. `bound` is null, or { value, t } for the bound the throw meets (t is when it reaches it).
 */
export function inertia(opts) {
  const { from, velocity = 0, min, max, snap, elastic = true, power, rate } = opts;
  const { bounceStiffness, bounceDamping, restDelta } = { ...FEELS.throw, ...opts };
  const { minFlick, skip, response, damping, flickDamping } = { ...SNAP, ...opts };
  if (!Number.isFinite(from)) fail('from must be a number');
  if (!Number.isFinite(velocity)) fail('velocity must be a number');
  if (rate != null && !(rate > 0 && rate < 1)) fail('rate must lie between 0 and 1 (the deceleration per millisecond)');
  const timeConstant = rate != null ? -1 / Math.log(rate) : opts.timeConstant ?? FEELS.throw.timeConstant;
  if (!(timeConstant > 0)) fail('timeConstant must be above 0 (milliseconds)');
  if (min != null && max != null && min > max) fail('min is above max');
  if (power != null && !Number.isFinite(power)) fail('power must be a number');
  const tau = timeConstant / 1000;

  let amp = (power ?? tau) * velocity;
  const ideal = from + amp;
  const clampIn = (x) => (min != null && x < min ? min : max != null && x > max ? max : x);
  if (snap != null) {
    // a snapped throw lands on a spring that leaves at the release speed
    const target = clampIn(snapTo(snap, { from, ideal, velocity, minFlick, skip }));
    const w = (2 * Math.PI) / response, zeta = Math.abs(velocity) >= minFlick ? flickDamping : damping;
    const sp = { k: w * w, c: 2 * zeta * w, m: 1 };
    const settle = target === from && velocity === 0 ? 0 : spring.settleFrom(sp, { delta: target - from, velocity, eps: restDelta });
    const at = (t) => (!(t > 0) ? from : t >= settle ? target : spring.from(t, sp, { from, to: target, velocity }));
    const speed = (t) => (t < 0 || t >= settle ? 0 : spring.velocityFrom(t, sp, { from, to: target, velocity }));
    return { at, velocity: speed, target, end: target, settle, bound: null };
  }
  const target = ideal;

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
