// Springs v2 (SPEC §6): an initial velocity with its analytic speed in all three regimes, the soft-landing
// negative bounce that keeps its arrival time, the seven named feels, springs between any two values.
// Existing springs keep their values: tests/kit/motion-baseline.test.mjs compares them bit for bit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spring } from '../../runtime/kit/springs.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

// the three regimes, with and without a push
const REGIMES = {
  under: { k: 170, c: 14, m: 1 },
  critical: { k: 100, c: 20, m: 1 },
  over: { k: 100, c: 40, m: 1 },
  'over (bounce, period)': { bounce: -0.4, period: 0.5 },
  'under (bounce, period)': { bounce: 0.35, period: 0.45 },
};
const withV = (p, velocity) => ({ ...p, velocity });

// reference trajectory by RK4 on x'' = -(k/m)(x - 1) - (c/m) x', x(0) = 0, x'(0) = v. Integration lives in the test only.
const rk4 = (p, v, T, h = 1e-4) => {
  const { w0, zeta } = spring.physics(p);
  const K = w0 * w0, C = 2 * zeta * w0;
  let x = 0, u = v;
  const a = (x, u) => -K * (x - 1) - C * u;
  for (let i = 0, n = Math.round(T / h); i < n; i++) {
    const k1x = u, k1u = a(x, u);
    const k2x = u + (h / 2) * k1u, k2u = a(x + (h / 2) * k1x, u + (h / 2) * k1u);
    const k3x = u + (h / 2) * k2u, k3u = a(x + (h / 2) * k2x, u + (h / 2) * k2u);
    const k4x = u + h * k3u, k4u = a(x + h * k3x, u + h * k3u);
    x += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    u += (h / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
  }
  return [x, u];
};

test('with an initial velocity the closed form agrees with an integration of the same spring, in every regime', () => {
  for (const [name, base] of Object.entries(REGIMES)) {
    for (const v of [-3, 2, 12]) {
      const p = withV(base, v);
      for (const T of [0.05, 0.2, 0.6]) {
        const [x, u] = rk4(p, v, T);
        close(spring(T, p), x, 2e-6, `${name} v=${v} t=${T} position`);
        close(spring.velocity(T, p), u, 2e-4, `${name} v=${v} t=${T} speed`);
      }
    }
  }
});

test('the speed at 0 is the velocity, and the speed is the derivative of the position', () => {
  for (const [name, base] of Object.entries(REGIMES)) {
    const p = withV(base, 6);
    close(spring.velocity(0, p), 6, 1e-12, `${name} at 0`);
    for (const t of [0.03, 0.1, 0.4]) {
      const h = 1e-6;
      close(spring.velocity(t, p), (spring(t + h, p) - spring(t - h, p)) / (2 * h), 1e-4, `${name} at ${t}`);
    }
    assert.equal(spring.velocity(-1, p), 0);
    assert.equal(spring.velocity(Infinity, p), 0);
    close(spring.velocity(0, base), 0, 1e-12, `${name} from rest`);
  }
});

test('no cosh or sinh overflow: a heavily damped spring stays finite and lands', () => {
  for (const p of [{ k: 1000, c: 200, m: 0.01, velocity: 5 }, { k: 2000, c: 200, m: 0.05 }, { k: 10, c: 200, m: 0.1, velocity: -4 }]) {
    for (const t of [0.001, 0.1, 1, 10, 100, 1e4]) {
      assert.ok(Number.isFinite(spring(t, p)), `${JSON.stringify(p)} at ${t}`);
      assert.ok(Number.isFinite(spring.velocity(t, p)));
    }
    close(spring(1e4, p), 1, 1e-9);
  }
});

test('a spring with a velocity settles for good, and starts where it should', () => {
  for (const [name, base] of Object.entries(REGIMES)) {
    for (const v of [4, 14]) {
      const p = withV(base, v);
      const s = spring.settle(p);
      assert.ok(s > 0 && s < 20, `${name} v=${v}: ${s}`);
      for (let t = s; t < s + 3; t += 0.003) assert.ok(Math.abs(1 - spring(t, p)) < 0.005 + 1e-9, `${name} v=${v} t=${t}`);
      assert.ok(Math.abs(1 - spring(s - 1e-3, p)) >= 0.005 - 1e-9, `${name} v=${v} just before`);
    }
  }
});

test('overshoot with a velocity is the largest value above 1, analytically', () => {
  for (const [name, base] of Object.entries(REGIMES)) {
    for (const v of [0, 4, 14]) {
      const p = withV(base, v);
      let peak = -Infinity;
      for (let i = 0; i <= 40000; i++) peak = Math.max(peak, spring((i / 40000) * 4, p));
      close(spring.overshoot(p), Math.max(0, peak - 1), 2e-5, `${name} v=${v}`);
    }
  }
  // a push can make a critically damped spring overshoot, which from rest it never does
  assert.equal(spring.overshoot({ k: 100, c: 20, m: 1 }), 0);
  assert.ok(spring.overshoot({ k: 100, c: 20, m: 1, velocity: 40 }) > 0.05);
  assert.ok(spring.overshoot({ k: 100, c: 40, m: 1, velocity: 40 }) > 0.01);
});

test("anime's settle oracles hold for MM's measure (the last time |1 - x| is 0.0005 or more, plus its 200 ms rest hold)", () => {
  const rest = 0.0005, hold = 0.2;
  const comparable = [
    [{ k: 100, c: 10, m: 1 }, 1760],
    [{ k: 100, c: 50, m: 1 }, 3880],
    [{ k: 100, c: 10, m: 1, velocity: 10 }, 1700],
    [{ bounce: 0.3, period: 0.5 }, 1080],
    [{ bounce: 0.7, period: 0.6 }, 2520],
    [{ bounce: -0.5, period: 0.5 }, 2480],
  ];
  for (const [p, ms] of comparable) close((spring.settle(p, rest) + hold) * 1000, ms, 25, JSON.stringify(p));
  // mass 10 (13700) and bounce 0.9 over 1 s (11900) ring so slowly that a zero crossing lasts 200 ms inside the band:
  // that measure calls them at rest early. Staying within the band for good takes longer.
  assert.ok((spring.settle({ k: 100, c: 10, m: 10 }, rest) + hold) * 1000 > 13700);
  assert.ok((spring.settle({ bounce: 0.9, period: 1 }, rest) + hold) * 1000 > 11900);
});

test('soft landing: a negative bounce changes the shape of the curve, not when it arrives', () => {
  const period = 0.5, at = period / 1.2;   // the critical spring has 3.3 % left here
  const crit = spring(at, { bounce: 0, period });
  for (const bounce of [-0.1, -0.3, -0.5, -0.8, -0.95]) {
    const soft = { bounce, period, soft: true }, plain = { bounce, period };
    close(spring(at, soft), crit, 1e-9, `bounce ${bounce}`);
    assert.ok(spring(at, plain) < crit - 0.01, `without soft the spring is still behind at ${bounce}`);
    const crossings = (p) => { let n = 0; for (let t = 0; t < 3; t += 0.001) if ((spring(t, p) - 1) * (spring(t + 0.001, p) - 1) < 0) n++; return n; };
    assert.equal(crossings(soft), 0, 'it does not overshoot');
    let prev = 0;
    for (let t = 0.001; t < 3; t += 0.001) { const x = spring(t, soft); assert.ok(x >= prev - 1e-12); prev = x; }
    assert.ok(spring.settle(soft) <= 1.2 * spring.settle({ bounce: 0, period }), `settles close to the critical one at ${bounce}`);
    assert.ok(spring.settle(soft) >= spring.settle({ bounce: 0, period }) - 1e-9);
  }
  // it is only for negative bounce; 0 and positive bounce are untouched by `soft`
  assert.equal(spring(0.2, { bounce: 0.3, period, soft: true }), spring(0.2, { bounce: 0.3, period }));
  assert.equal(spring(0.2, { bounce: 0, period, soft: true }), spring(0.2, { bounce: 0, period }));
});

test('the seven named feels, as brand presets', () => {
  assert.deepEqual(Object.keys(spring.presets), ['beat', 'plop', 'bounce', 'swing', 'jump', 'strike', 'smooth']);
  assert.deepEqual(spring.presets.beat, { k: 5.7, c: 1.2, m: 0.13, velocity: 10 });
  assert.deepEqual(spring.presets.smooth, { k: 15.35, c: 1.88, m: 0.16 });
  const zeta = { beat: 0.7, plop: 0.17, bounce: 0.041, swing: 0.51, jump: 0.55, strike: 0.58, smooth: 0.6 };
  for (const [name, p] of Object.entries(spring.presets)) {
    close(spring.physics(p).zeta, zeta[name], 0.005, `${name} damping ratio`);
    assert.equal(spring(0, p), 0);
    close(spring(spring.settle(p) + 0.01, p), 1, 0.005, name);
    assert.deepEqual(spring.physics({ preset: name }), spring.physics(p), `{preset: "${name}"} is the preset`);
  }
  // a preset can be overridden field by field, and a bad name throws
  assert.equal(spring.physics({ preset: 'plop', velocity: 3 }).velocity, 3);
  assert.equal(spring.physics({ preset: 'beat', velocity: 0 }).velocity, 0);
  assert.throws(() => spring(0.1, { preset: 'wobble' }), TypeError);
  // the presets that start with a push do move faster at first than the same spring from rest
  assert.ok(spring(0.02, spring.presets.jump) > spring(0.02, { ...spring.presets.jump, velocity: 0 }));
  assert.ok(spring.overshoot(spring.presets.beat) > spring.overshoot({ ...spring.presets.beat, velocity: 0 }));
});

test('spring.from: between any two values, with the velocity in values per second', () => {
  const p = { k: 100, c: 20, m: 1 };
  assert.equal(spring.from(0, p, { from: 10, to: 30 }), 10);
  assert.equal(spring.from(-1, p, { from: 10, to: 30 }), 10);
  assert.equal(spring.from(Infinity, p, { from: 10, to: 30 }), 30);
  for (const t of [0.1, 0.3, 1]) close(spring.from(t, p, { from: 10, to: 30 }), 10 + 20 * spring(t, p), 1e-12);
  // a released flick: starts at 5 moving at 40 per second toward 0
  const flick = { from: 5, to: 0, velocity: -40 };
  close(spring.velocityFrom(0, p, flick), -40, 1e-12);
  const h = 1e-6;
  close(spring.velocityFrom(0.1, p, flick), (spring.from(0.1 + h, p, flick) - spring.from(0.1 - h, p, flick)) / (2 * h), 1e-4);
  // a push is scaled by the move when the call gives none
  const pv = { k: 100, c: 20, m: 1, velocity: 2 };
  close(spring.velocityFrom(0, pv, { from: 0, to: 50 }), 100, 1e-12);
  // from zero distance with a velocity: an impulse that rings out and comes back
  const kick = { from: 4, to: 4, velocity: 30 };
  assert.ok(spring.from(0.05, { k: 300, c: 12, m: 1 }, kick) > 4);
  close(spring.from(10, { k: 300, c: 12, m: 1 }, kick), 4, 1e-9);
  // settleFrom: the time to come to rest within eps
  const s = spring.settleFrom(p, { delta: 20, velocity: 0, eps: 0.1 });
  close(Math.abs(20 - 20 * spring(s, p)), 0.1, 1e-3);
});

test('track and a velocity-free spring are as before', () => {
  assert.equal(spring.physics({ k: 100, c: 20 }).velocity, 0);
  assert.deepEqual(spring.physics({ bounce: 0.2, period: 0.4 }), { w0: (2 * Math.PI) / 0.4, zeta: 0.8, velocity: 0 });
});
