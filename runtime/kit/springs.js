// Closed-form damped spring from 0 to 1 (SPEC §6). Pure: a function of t and the
// parameters only, importable in Node and in the browser. Never integrated numerically.
//
// m x'' + c x' + k (x - 1) = 0, x(0) = 0, x'(0) = 0. With y = 1 - x, w0 = sqrt(k/m) and
// zeta = c / (2 sqrt(k m)), y is the free response of a damped oscillator released from 1:
//   under   (zeta < 1): y = e^(-zeta w0 t) (cos wd t + (zeta w0 / wd) sin wd t),  wd = w0 sqrt(1 - zeta²)
//   critical (zeta = 1): y = e^(-w0 t) (1 + w0 t)
//   over    (zeta > 1): y = (r2 e^(r1 t) - r1 e^(r2 t)) / (r2 - r1),  r1,2 = -w0 (zeta ∓ sqrt(zeta² - 1))

const EPS = 0.005;          // settled when within 0.005 of 1 (SPEC §6)
const CRIT = 1e-6;          // |zeta - 1| below this is treated as critical
const ZMIN = 0.01;          // damping floor (bounce 0.99): an undamped spring never settles

// {k, c, m} | {bounce, period} → { w0, zeta }
function norm(p) {
  if (p && typeof p.period === 'number') {
    const b = Math.max(-0.999, Math.min(1, p.bounce ?? 0));
    const zeta = b >= 0 ? 1 - b : 1 / (1 + b);
    return { w0: (2 * Math.PI) / p.period, zeta: Math.max(ZMIN, zeta) };
  }
  if (!p || !(p.k > 0) || !(p.c >= 0) || !((p.m ?? 1) > 0)) throw new TypeError('spring: expected {k, c, m} or {bounce, period}');
  const m = p.m ?? 1;
  return { w0: Math.sqrt(p.k / m), zeta: Math.max(ZMIN, p.c / (2 * Math.sqrt(p.k * m))) };
}

// y = 1 - x as a function of t for the normalised parameters.
function residual(t, { w0, zeta }) {
  if (Math.abs(zeta - 1) < CRIT) return Math.exp(-w0 * t) * (1 + w0 * t);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  const s = Math.sqrt(zeta * zeta - 1), r1 = -w0 * (zeta - s), r2 = -w0 * (zeta + s);
  return (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

export function spring(t, p) {
  const n = norm(p);
  if (!(t > 0)) return 0;
  if (t === Infinity) return 1;   // a deck passes an arrived item's local time as Infinity
  return 1 - residual(t, n);
}

// First t after which |1 - spring(t)| < 0.005 holds for good.
spring.settle = function settle(p) {
  const n = norm(p);
  const { w0, zeta } = n;
  const y = (t) => residual(t, n);
  if (zeta >= 1 - CRIT) {
    // Monotone residual: one crossing, found by bracketing and bisection.
    let hi = 1 / w0;
    while (y(hi) >= EPS) hi *= 2;
    let lo = 0;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (y(mid) >= EPS) lo = mid; else hi = mid; }
    return hi;
  }
  // Under-damped: |y| <= A e^(-zeta w0 t) with A = 1/sqrt(1 - zeta²), so after the envelope
  // crossing T the residual is settled for good. Scan back from T on a fine grid for the last
  // instant |y| reaches EPS, then bisect that interval.
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const A = 1 / Math.sqrt(1 - zeta * zeta);
  const T = Math.log(A / EPS) / (zeta * w0);
  const h = Math.min(Math.PI / wd / 400, T / 4000);
  for (let t = T; t > 0; t -= h) {
    if (Math.abs(y(t)) >= EPS) {
      let lo = t, hi = Math.min(t + h, T);
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (Math.abs(y(mid)) >= EPS) lo = mid; else hi = mid; }
      return hi;
    }
  }
  return T;
};

// Largest value of spring(t') - 1 over 0 <= t' <= t (default: the whole motion), analytically.
// x rises monotonically until the first peak at t = pi/wd, and later peaks are smaller.
spring.overshoot = function overshoot(p, t = Infinity) {
  const n = norm(p);
  if (n.zeta >= 1 - CRIT || !(t > 0)) return 0;
  const wd = n.w0 * Math.sqrt(1 - n.zeta * n.zeta);
  const first = Math.PI / wd;
  if (t >= first) return Math.exp(-n.zeta * n.w0 * first);
  return Math.max(0, -residual(t, n));
};

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
