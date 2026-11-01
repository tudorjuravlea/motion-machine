// Closed-form damped spring from 0 to 1 (SPEC §6). Pure: a function of t and the
// parameters only, importable in Node and in the browser. Never integrated numerically.
//
// m x'' + c x' + k (x - 1) = 0, x(0) = 0, x'(0) = 0. With y = 1 - x, w0 = sqrt(k/m) and
// zeta = c / (2 sqrt(k m)), y is the free response of a damped oscillator released from 1:
//   under   (zeta < 1): y = e^(-zeta w0 t) (cos wd t + (zeta w0 / wd) sin wd t),  wd = w0 sqrt(1 - zeta²)
//   critical (zeta = 1): y = e^(-w0 t) (1 + w0 t)
//   over    (zeta > 1): y = (r2 e^(r1 t) - r1 e^(r2 t)) / (r2 - r1),  r1,2 = -w0 (zeta ∓ sqrt(zeta² - 1))
//
// An initial velocity v (params.velocity, in distances per second; 0 when absent) changes only y(0)' = -v. The
// three regimes then read (a = zeta w0, wd = w0 sqrt(1 - zeta²), s = w0 sqrt(zeta² - 1)):
//   under:    y = e^(-a t) (cos wd t + ((a - v) / wd) sin wd t)
//   critical: y = e^(-w0 t) (1 + (w0 - v) t)
//   over:     y = ((1 + b) e^((s - a) t) + (1 - b) e^(-(s + a) t)) / 2,  b = (a - v) / s
// The over-damped form is a sum of two decaying exponentials, so nothing overflows however heavily it is damped.
// A spring with no velocity takes the original expressions above, term for term.

const EPS = 0.005;          // settled when within 0.005 of 1 (SPEC §6)
const CRIT = 1e-6;          // |zeta - 1| below this is treated as critical
const ZMIN = 0.01;          // damping floor (bounce 0.99): an undamped spring never settles

// The named feels (a brand picks one by name): mass, stiffness, damping and the initial velocity of a spring
// that moves 0 → 1. Beat, jump and strike start with a push; bounce rings a long time; smooth does not ring.
const PRESETS = {
  beat: { k: 5.7, c: 1.2, m: 0.13, velocity: 10 },
  plop: { k: 20, c: 0.68, m: 0.2 },
  bounce: { k: 4.75, c: 0.05, m: 0.08 },
  swing: { k: 19.85, c: 2.82, m: 0.39 },
  jump: { k: 10, c: 0.7, m: 0.04, velocity: 8 },
  strike: { k: 20, c: 0.9, m: 0.03, velocity: 4.8 },
  smooth: { k: 15.35, c: 1.88, m: 0.16 },
};

// Soft landing for an over-damped {bounce < 0, period}: an over-damped spring of the same period arrives late.
// Rescale its frequency so that at t = period / 1.2 it has as far left to go as the critical spring has then
// (a bounce below 0 then changes the shape of the curve, not when it arrives). Newton on the remaining distance,
// which is convex from the critical spring's phase onwards, so it climbs to the root from below.
const CRIT_PHASE = (2 * Math.PI) / 1.2;   // the critical spring's w0 t at t = period / 1.2
function softScale(zeta) {
  if (!(zeta > 1)) return 1;
  const root = Math.sqrt(zeta * zeta - 1), slow = zeta - root, fast = zeta + root;
  const target = 2 * root * Math.exp(-CRIT_PHASE) * (1 + CRIT_PHASE);
  let x = CRIT_PHASE;
  for (let i = 0; i < 11; i++) {
    x -= (fast * Math.exp(-slow * x) - slow * Math.exp(-fast * x) - target) / (Math.exp(-fast * x) - Math.exp(-slow * x));
  }
  const scale = x / CRIT_PHASE;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

// {k, c, m} | {bounce, period} | {preset}, each with an optional velocity → { w0, zeta, v }
function norm(p) {
  if (p && typeof p.preset === 'string') {
    const base = PRESETS[p.preset];
    if (!base) throw new TypeError(`spring: unknown preset "${p.preset}" (${Object.keys(PRESETS).join(', ')})`);
    const { preset, ...own } = p;
    p = { ...base, ...own };
  }
  const v = p && Number.isFinite(p.velocity) ? p.velocity : 0;
  if (p && typeof p.period === 'number') {
    const w0 = (2 * Math.PI) / p.period;
    if (p.soft === true && (p.bounce ?? 0) < 0) {
      const zeta = 1 / Math.max(1 + Math.max(-1, p.bounce), 0.05);
      return { w0: w0 * softScale(zeta), zeta, v };
    }
    const b = Math.max(-0.999, Math.min(1, p.bounce ?? 0));
    const zeta = b >= 0 ? 1 - b : 1 / (1 + b);
    return { w0, zeta: Math.max(ZMIN, zeta), v };
  }
  if (!p || !(p.k > 0) || !(p.c >= 0) || !((p.m ?? 1) > 0)) throw new TypeError('spring: expected {k, c, m}, {bounce, period} or {preset}');
  const m = p.m ?? 1;
  return { w0: Math.sqrt(p.k / m), zeta: Math.max(ZMIN, p.c / (2 * Math.sqrt(p.k * m))), v };
}

// y = 1 - x as a function of t for the normalised parameters.
function residual(t, n) {
  const { w0, zeta } = n;
  if (n.v) return displacement(t, w0, zeta, 1, n.v);
  if (Math.abs(zeta - 1) < CRIT) return Math.exp(-w0 * t) * (1 + w0 * t);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  const s = Math.sqrt(zeta * zeta - 1), r1 = -w0 * (zeta - s), r2 = -w0 * (zeta + s);
  return (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

// The distance left to the target, y, for a spring that starts d0 away and moves toward it at v0 (y(0)' = -v0).
function displacement(t, w0, zeta, d0, v0) {
  const a = zeta * w0;
  if (Math.abs(zeta - 1) < CRIT) return Math.exp(-w0 * t) * (d0 + (w0 * d0 - v0) * t);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return Math.exp(-a * t) * (d0 * Math.cos(wd * t) + (((a * d0 - v0) / wd) * Math.sin(wd * t)));
  }
  const s = w0 * Math.sqrt(zeta * zeta - 1), b = (a * d0 - v0) / s;
  return ((d0 + b) * Math.exp((s - a) * t) + (d0 - b) * Math.exp(-(s + a) * t)) / 2;
}

// Its derivative: the speed of the target-ward motion x' = -y', in distances per second.
function speed(t, w0, zeta, d0, v0) {
  const a = zeta * w0;
  if (Math.abs(zeta - 1) < CRIT) return Math.exp(-w0 * t) * (v0 + w0 * (w0 * d0 - v0) * t);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta), B = (a * d0 - v0) / wd;
    return Math.exp(-a * t) * (v0 * Math.cos(wd * t) + (a * B + d0 * wd) * Math.sin(wd * t));
  }
  const s = w0 * Math.sqrt(zeta * zeta - 1), b = (a * d0 - v0) / s;
  return ((a - s) * ((d0 + b) / 2)) * Math.exp((s - a) * t) + ((a + s) * ((d0 - b) / 2)) * Math.exp(-(s + a) * t);
}

export function spring(t, p) {
  const n = norm(p);
  if (!(t > 0)) return 0;
  if (t === Infinity) return 1;   // a deck passes an arrived item's local time as Infinity
  return 1 - residual(t, n);
}

// The last instant the distance left, |y|, is at least `eps`, for a spring that starts d0 away moving at v0
// toward the target: |y| <= A e^(-lam t) bounds it, so scan back from the envelope's crossing for the last
// instant |y| reaches eps, then bisect that interval. 0 when it never reaches eps.
function lastOutside(w0, zeta, d0, v0, eps) {
  const a = zeta * w0, y = (t) => Math.abs(displacement(t, w0, zeta, d0, v0));
  let A, lam, wd = 0;
  if (Math.abs(zeta - 1) < CRIT) { A = Math.abs(d0) + (Math.abs(w0 * d0 - v0) * 2) / (w0 * Math.E); lam = w0 / 2; }
  else if (zeta < 1) { wd = w0 * Math.sqrt(1 - zeta * zeta); A = Math.hypot(d0, (a * d0 - v0) / wd); lam = a; }
  else { const s = w0 * Math.sqrt(zeta * zeta - 1), b = (a * d0 - v0) / s; A = (Math.abs(d0 + b) + Math.abs(d0 - b)) / 2; lam = a - s; }
  if (!(A > eps)) return 0;
  const T = Math.log(A / eps) / lam;
  const h = Math.min(wd ? Math.PI / wd / 400 : Infinity, T / 4000);
  for (let t = T; t > 0; t -= h) {
    if (y(t) >= eps) {
      let lo = t, hi = Math.min(t + h, T);
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (y(mid) >= eps) lo = mid; else hi = mid; }
      return hi;
    }
  }
  return 0;
}

// First t after which |1 - spring(t)| < eps (0.005) holds for good.
spring.settle = function settle(p, eps = EPS) {
  const n = norm(p);
  if (n.v) return lastOutside(n.w0, n.zeta, 1, n.v, eps);
  const { w0, zeta } = n;
  const y = (t) => residual(t, n);
  if (zeta >= 1 - CRIT) {
    // Monotone residual: one crossing, found by bracketing and bisection.
    let hi = 1 / w0;
    while (y(hi) >= eps) hi *= 2;
    let lo = 0;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (y(mid) >= eps) lo = mid; else hi = mid; }
    return hi;
  }
  // Under-damped: |y| <= A e^(-zeta w0 t) with A = 1/sqrt(1 - zeta²), so after the envelope
  // crossing T the residual is settled for good. Scan back from T on a fine grid for the last
  // instant |y| reaches eps, then bisect that interval.
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const A = 1 / Math.sqrt(1 - zeta * zeta);
  const T = Math.log(A / eps) / (zeta * w0);
  const h = Math.min(Math.PI / wd / 400, T / 4000);
  for (let t = T; t > 0; t -= h) {
    if (Math.abs(y(t)) >= eps) {
      let lo = t, hi = Math.min(t + h, T);
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (Math.abs(y(mid)) >= eps) lo = mid; else hi = mid; }
      return hi;
    }
  }
  return T;
};

// Largest value of spring(t') - 1 over 0 <= t' <= t (default: the whole motion), analytically.
// From rest, x rises monotonically until the first peak at t = pi/wd, and later peaks are smaller.
// With an initial velocity x can turn earlier, so its turning points (x' = 0) are visited in order.
spring.overshoot = function overshoot(p, t = Infinity) {
  const n = norm(p);
  if (!(t > 0)) return 0;
  if (!n.v) {
    if (n.zeta >= 1 - CRIT) return 0;
    const wd = n.w0 * Math.sqrt(1 - n.zeta * n.zeta);
    const first = Math.PI / wd;
    if (t >= first) return Math.exp(-n.zeta * n.w0 * first);
    return Math.max(0, -residual(t, n));
  }
  const { w0, zeta, v } = n, a = zeta * w0;
  let best = t === Infinity ? 0 : -residual(t, n);
  const visit = (at) => { if (at > 1e-12 && at <= t) best = Math.max(best, -residual(at, n)); };
  if (Math.abs(zeta - 1) < CRIT) { if (v > w0) visit(v / (w0 * (v - w0))); }
  else if (zeta < 1) {
    // x' = 0  <=>  v cos + (a B + wd) sin = 0, B = (a - v) / wd: tan(wd t) = -v / K
    const wd = w0 * Math.sqrt(1 - zeta * zeta), K = a * ((a - v) / wd) + wd;
    let th = Math.atan2(-v, K);
    if (th <= 0) th += Math.PI;
    for (let k = 0; k < 4; k++) visit((th + k * Math.PI) / wd);
  } else {
    // x' = 0  <=>  (a - s) P e^((s - a) t) + (a + s) Q e^(-(s + a) t) = 0
    const s = w0 * Math.sqrt(zeta * zeta - 1), b = (a - v) / s, P = (1 + b) / 2, Q = (1 - b) / 2;
    const r = -((a + s) * Q) / ((a - s) * P);
    if (r > 0 && r !== 1) visit(Math.log(r) / (2 * s));
  }
  return Math.max(0, best);
};

/** The speed of the motion at t, in distances per second (x', analytically); 0 for t < 0 and at Infinity. */
spring.velocity = function velocity(t, p) {
  const n = norm(p);
  if (t < 0 || t === Infinity) return 0;
  return speed(t, n.w0, n.zeta, 1, n.v);
};

/**
 * A spring between any two values: opts = { from = 0, to = 1, velocity } with the velocity in values per second
 * (default: params.velocity distances per second). Position at t seconds; exactly `to` at Infinity.
 */
spring.from = function from(t, p, { from: a = 0, to = 1, velocity } = {}) {
  const n = norm(p);
  if (!(t > 0)) return a;
  if (t === Infinity) return to;
  return to - displacement(t, n.w0, n.zeta, to - a, velocity ?? n.v * (to - a));
};

/** The speed of `spring.from` at t, in values per second. */
spring.velocityFrom = function velocityFrom(t, p, { from: a = 0, to = 1, velocity } = {}) {
  const n = norm(p);
  if (t < 0 || t === Infinity) return 0;
  return speed(t, n.w0, n.zeta, to - a, velocity ?? n.v * (to - a));
};

/** First t after which a spring that starts `delta` from its target with `velocity` toward it stays within `eps`. */
spring.settleFrom = function settleFrom(p, { delta = 1, velocity = 0, eps = EPS } = {}) {
  const n = norm(p);
  return lastOutside(n.w0, n.zeta, delta, velocity, eps);
};

/** The physics a params object stands for: { w0, zeta, velocity } (the preset read, soft landing applied). */
spring.physics = function physics(p) {
  const n = norm(p);
  return { w0: n.w0, zeta: n.zeta, velocity: n.v };
};

/** The named feels: beat, plop, bounce, swing, jump, strike, smooth, as { k, c, m, velocity? }. */
spring.presets = PRESETS;

// Stacked springs over keys [[time, value], ...]: the first value, plus one spring per change.
export function track(t, keys, p) {
  if (!keys.length) return 0;
  const ks = [...keys].sort((a, b) => a[0] - b[0]);
  let v = ks[0][1];
  for (let i = 1; i < ks.length; i++) v += (ks[i][1] - ks[i - 1][1]) * spring(t - ks[i][0], p);
  return v;
}

// react-spring's {tension, friction, mass} is k, c, m by construction (its default is 170/26/1).
export function fromReactSpring({ tension = 170, friction = 26, mass = 1 } = {}) {
  return { k: tension, c: friction, m: mass };
}
