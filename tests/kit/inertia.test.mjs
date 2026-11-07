// inertia: a closed-form throw that lands on a target or a bound (SPEC §6). A pure function of t:
// the friction curve target - amp e^(-t/tau), the bound crossing solved analytically, a spring after it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inertia, FEELS } from '../../runtime/kit/inertia.js';
import { spring } from '../../runtime/kit/springs.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const TAU = 0.325;

test('the throw: power 0.8 and a 325 ms time constant, x(t) = target - amp e^(-t/tau)', () => {
  const th = inertia({ from: 100, velocity: 1000 });
  const amp = 800;
  assert.equal(th.target, 900);
  assert.equal(th.at(0), 100);
  for (const t of [0.05, 0.325, 1, 2]) close(th.at(t), 900 - amp * Math.exp(-t / TAU), 1e-9, `t=${t}`);
  close(th.velocity(0), amp / TAU, 1e-9);
  for (const t of [0.1, 0.5, 1.5]) {
    const h = 1e-6;
    close(th.velocity(t), (th.at(t + h) - th.at(t - h)) / (2 * h), 1e-3, `speed at ${t}`);
  }
});

test('it lands exactly on the target when the remaining distance is within restDelta', () => {
  const th = inertia({ from: 0, velocity: 1000 });
  close(th.settle, TAU * Math.log(800 / 0.5), 1e-12);
  assert.equal(th.at(th.settle), 800);
  assert.equal(th.at(th.settle + 5), 800);
  assert.equal(th.at(Infinity), 800);
  assert.ok(Math.abs(th.at(th.settle - 1e-6) - 800) <= 0.5 + 1e-4);
  assert.equal(th.velocity(Infinity), 0);
  assert.equal(th.velocity(th.settle + 1), 0);
});

test('a throw to the left mirrors the throw to the right', () => {
  const r = inertia({ from: 0, velocity: 700 }), l = inertia({ from: 0, velocity: -700 });
  for (const t of [0, 0.1, 0.4, 1.2, 4]) close(l.at(t), -r.at(t), 1e-9);
  assert.equal(l.target, -560);
});

test('no velocity: it stays where it is and is at rest at once', () => {
  const th = inertia({ from: 42, velocity: 0 });
  assert.equal(th.target, 42);
  assert.equal(th.settle, 0);
  assert.equal(th.at(1), 42);
});

test('the drag feel is slower: a 750 ms time constant, a softer rubber band', () => {
  assert.equal(FEELS.throw.timeConstant, 325);
  assert.deepEqual(FEELS.drag, { power: 0.8, timeConstant: 750, bounceStiffness: 200, bounceDamping: 40, restDelta: 1 });
  const a = inertia({ from: 0, velocity: 1000 }), b = inertia({ from: 0, velocity: 1000, ...FEELS.drag });
  assert.ok(b.settle > a.settle);
  close(b.at(0.75), 800 - 800 * Math.exp(-1), 1e-9);
});

test('snap: the throw lands on the nearest of a set of places, a step, or what a function returns', () => {
  const slides = inertia({ from: 0, velocity: 1000, snap: [0, 300, 600, 900] });
  assert.equal(slides.target, 900, 'the ideal 800 is nearest 900');
  assert.equal(slides.at(0), 0);
  close(slides.velocity(0), 900 / TAU, 1e-9, 'the curve is re-aimed at the target, so it starts at the new speed');
  assert.equal(slides.at(Infinity), 900);
  assert.equal(inertia({ from: 0, velocity: 1000, snap: 250 }).target, 750, 'a step of 250: 800 is nearest 750');
  assert.equal(inertia({ from: 0, velocity: 1000, snap: (x) => Math.round(x / 100) * 100 + 7 }).target, 807);
  assert.equal(inertia({ from: 0, velocity: 10, snap: [0, 300] }).target, 0, 'a weak flick comes back to where it was');
});

test('a bound: the friction curve is cut at the crossing time, solved analytically, and a spring takes over', () => {
  const th = inertia({ from: 0, velocity: 1000, max: 500 });
  const amp = 800, tb = -TAU * Math.log((800 - 500) / amp);
  assert.ok(th.bound && th.bound.value === 500);
  close(th.bound.t, tb, 1e-12);
  close(th.at(tb), 500, 1e-9, 'it is on the bound at the crossing');
  // the speed is continuous across the hand-off: friction speed (target - bound)/tau, then the spring starts at it
  close(th.velocity(tb - 1e-9), (800 - 500) / TAU, 1e-3);
  close(th.velocity(tb), (800 - 500) / TAU, 1e-6);
  // the rubber band: it goes past the bound, comes back and ends on it
  let past = -Infinity;
  for (let t = tb; t < tb + 2; t += 0.001) past = Math.max(past, th.at(t));
  assert.ok(past > 500, 'it stretches beyond the bound');
  const sp = { k: 500, c: 10, m: 1 };
  for (const t of [0.01, 0.05, 0.2]) close(th.at(tb + t), spring.from(t, sp, { from: 500, to: 500, velocity: 300 / TAU }), 1e-9, `spring at +${t}`);
  assert.equal(th.at(Infinity), 500);
  assert.equal(th.at(th.settle), 500);
  assert.ok(th.settle > tb);
  // nothing before the bound is touched by it
  const free = inertia({ from: 0, velocity: 1000 });
  for (const t of [0, 0.1, tb - 0.01]) assert.equal(th.at(t), free.at(t));
});

test('a bound on the left, and the nearest bound when there are two', () => {
  const th = inertia({ from: 400, velocity: -1000, min: 0, max: 1000 });
  assert.equal(th.bound.value, 0);
  const both = inertia({ from: 600, velocity: 1000, min: 0, max: 1000 });
  assert.equal(both.bound.value, 1000);
  assert.equal(both.at(Infinity), 1000);
  // a target inside the bounds never meets them
  assert.equal(inertia({ from: 400, velocity: 300, min: 0, max: 1000 }).bound, null);
});

test('elastic: false is a wall, not a rubber band', () => {
  const th = inertia({ from: 0, velocity: 1000, max: 500, elastic: false });
  const tb = th.bound.t;
  for (const t of [tb, tb + 0.01, tb + 1, 10]) assert.equal(th.at(t), 500);
  assert.equal(th.velocity(tb + 0.5), 0);
  assert.equal(th.settle, tb);
});

test('starting outside a bound: the spring pulls it back from the first instant', () => {
  const th = inertia({ from: 650, velocity: 200, max: 500 });
  assert.equal(th.bound.t, 0);
  assert.equal(th.at(0), 650);
  close(th.velocity(0), (0.8 * 200) / TAU, 1e-9, 'it keeps the speed it had');
  assert.ok(th.at(0.3) < 650 + 200);
  assert.equal(th.at(Infinity), 500);
});

test('a pure function of t: forward and reverse seek order give the same values', () => {
  const th = inertia({ from: 0, velocity: 1500, max: 500 });
  const ts = Array.from({ length: 200 }, (_, i) => i * 0.017);
  const fwd = ts.map((t) => th.at(t)), rev = [...ts].reverse().map((t) => th.at(t)).reverse();
  assert.deepEqual(fwd, rev);
  const again = inertia({ from: 0, velocity: 1500, max: 500 });
  assert.deepEqual(ts.map((t) => again.at(t)), fwd);
});

test('bad input: a non-finite from or velocity throws, a time constant must be positive', () => {
  assert.throws(() => inertia({ from: NaN, velocity: 1 }), TypeError);
  assert.throws(() => inertia({ from: 0, velocity: Infinity }), TypeError);
  assert.throws(() => inertia({ from: 0, velocity: 1, timeConstant: 0 }), TypeError);
  assert.throws(() => inertia({ from: 0, velocity: 1, min: 5, max: 1 }), TypeError);
});

test('inertia.js is pure: no clock, no randomness, no DOM', () => {
  const src = readFileSync(new URL('../../runtime/kit/inertia.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Date|Math\.random|performance|setTimeout|setInterval|requestAnimationFrame|document|window/);
});
