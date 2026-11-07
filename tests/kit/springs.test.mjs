// closed-form springs (SPEC §6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spring, track, fromReactSpring } from '../../runtime/kit/springs.js';

const editorial = JSON.parse(readFileSync(new URL('../../styles/presets/editorial.json', import.meta.url), 'utf8'));
const { ui, type, heavy } = editorial.motion.spring;

// Peak of a sampled trajectory, for checking the closed form against what a viewer would see.
const peak = (p, T = 3, n = 30000) => {
  let m = -Infinity;
  for (let i = 0; i <= n; i++) m = Math.max(m, spring((i / n) * T, p));
  return m;
};

// Reference trajectory by RK4 on m x'' = -k (x - 1) - c x'. Integration lives in the test only:
// it is how react-spring itself advances, so agreeing with it is what "identity" means.
const rk4 = (p, T, h = 1e-4) => {
  let x = 0, v = 0;
  const a = (x, v) => (-p.k * (x - 1) - p.c * v) / p.m;
  const steps = Math.round(T / h);
  for (let i = 0; i < steps; i++) {
    const k1x = v, k1v = a(x, v);
    const k2x = v + (h / 2) * k1v, k2v = a(x + (h / 2) * k1x, v + (h / 2) * k1v);
    const k3x = v + (h / 2) * k2v, k3v = a(x + (h / 2) * k2x, v + (h / 2) * k2v);
    const k4x = v + h * k3v, k4v = a(x + h * k3x, v + h * k3v);
    x += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
  }
  return x;
};

test('spring(0) = 0 and spring is 0 for negative time', () => {
  assert.equal(spring(0, ui), 0);
  assert.equal(spring(-1, ui), 0);
  assert.equal(spring(0, { bounce: 0.3, period: 0.4 }), 0);
});

test('ui settles within 0.35 ± 0.03 s with overshoot ≤ 1.5 %', () => {
  const s = spring.settle(ui);
  assert.ok(Math.abs(s - 0.35) <= 0.03, `settle ${s}`);
  // settled for good from s on
  for (let t = s; t < 3; t += 0.0005) assert.ok(Math.abs(1 - spring(t, ui)) < 0.005 + 1e-12, `t=${t}`);
  // and not settled just before
  assert.ok(Math.abs(1 - spring(s - 1e-3, ui)) >= 0.005);
  const over = peak(ui) - 1;
  assert.ok(over > 0 && over <= 0.015, `overshoot ${over}`);
  assert.ok(Math.abs(spring.overshoot(ui) - over) < 1e-6, 'analytic overshoot matches the sampled peak');
});

test('type never exceeds 1 (to a millionth; its analytic overshoot is ~3e-10)', () => {
  assert.ok(peak(type, 5) <= 1 + 1e-6);
  assert.ok(spring.overshoot(type) < 1e-6);
});

test('heavy overshoots 1.7 ± 0.6 %', () => {
  const over = peak(heavy, 4) - 1;
  assert.ok(Math.abs(over - 0.017) <= 0.006, `overshoot ${over}`);
});

test('{bounce, period} with bounce 0 equals critical damping', () => {
  const T = 0.5, k = (2 * Math.PI / T) ** 2;
  const critical = { k, c: 2 * Math.sqrt(k), m: 1 };
  for (let t = 0; t <= 2; t += 0.01) {
    assert.ok(Math.abs(spring(t, { bounce: 0, period: T }) - spring(t, critical)) < 1e-12, `t=${t}`);
  }
  assert.equal(spring.overshoot({ bounce: 0, period: T }), 0);
  // positive bounce is underdamped (ζ = 1 − b), negative bounce overdamped (ζ = 1/(1+b))
  assert.ok(spring.overshoot({ bounce: 0.3, period: T }) > 0);
  assert.equal(spring.overshoot({ bounce: -0.3, period: T }), 0);
  assert.ok(spring.settle({ bounce: -0.3, period: T }) > spring.settle({ bounce: 0, period: T }));
});

test('overdamped and critical branches rise monotonically to 1', () => {
  for (const p of [{ k: 100, c: 20, m: 1 }, { k: 100, c: 60, m: 1 }]) {
    let prev = 0;
    for (let t = 0.001; t < 3; t += 0.001) {
      const x = spring(t, p);
      assert.ok(x >= prev - 1e-15 && x <= 1, `t=${t} x=${x}`);
      prev = x;
    }
    const s = spring.settle(p);
    assert.ok(Math.abs(1 - spring(s, p) - 0.005) < 1e-6);
  }
});

test('track is continuous at every key and within 1 % of 10 at t = 1.9', () => {
  const keys = [[0, 0], [1, 10], [2, 0]];
  for (const [kt] of keys) {
    const a = track(kt - 1e-7, keys, ui), b = track(kt + 1e-7, keys, ui);
    assert.ok(Math.abs(a - b) < 1e-3, `jump at ${kt}: ${a} → ${b}`);
  }
  assert.equal(track(-1, keys, ui), 0);
  const v = track(1.9, keys, ui);
  assert.ok(Math.abs(v - 10) <= 0.1, `track(1.9) = ${v}`);
  assert.ok(Math.abs(track(5, keys, ui)) < 0.05);
});

test('react-spring 170/26 conversion is identity', () => {
  const p = fromReactSpring({ tension: 170, friction: 26 });
  assert.deepEqual(p, { k: 170, c: 26, m: 1 });
  assert.deepEqual(fromReactSpring({}), { k: 170, c: 26, m: 1 }, 'react-spring default config');
  for (const T of [0.05, 0.1, 0.2, 0.4, 0.8]) {
    assert.ok(Math.abs(spring(T, p) - rk4(p, T)) < 1e-5, `t=${T}`);
  }
});

test('springs.js is pure: no clock, no randomness, no DOM', () => {
  const src = readFileSync(new URL('../../runtime/kit/springs.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Date|Math\.random|performance|setTimeout|setInterval|requestAnimationFrame|document|window/);
});

test('a spring at infinite time is exactly 1 for under-, critically and over-damped parameters', () => {
  for (const p of [{ k: 170, c: 26 }, { k: 100, c: 20 }, { k: 100, c: 40 }, { bounce: 0.3, period: 0.5 }]) {
    assert.equal(spring(Infinity, p), 1, JSON.stringify(p));
  }
});
