// inertia: a closed-form throw that lands on a target or a bound (SPEC §6). A pure function of t:
// the friction curve target - amp e^(-t/tau) with amp = velocity * tau (it leaves at the release speed), the
// bound crossing solved analytically, a spring after it; a snapped throw picks its place by the sheet rules
// and lands on a spring that leaves at the release speed. The bound tests keep the older power 0.8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inertia, FEELS, SNAP, RATES } from '../../runtime/kit/inertia.js';
import { spring } from '../../runtime/kit/springs.js';

const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const TAU = 0.325;

test('the throw leaves at the release speed: a 325 ms time constant, amp = velocity * tau, x(t) = target - amp e^(-t/tau)', () => {
  const th = inertia({ from: 100, velocity: 1000 });
  const amp = 1000 * TAU;
  assert.equal(th.target, 100 + amp);
  assert.equal(th.at(0), 100);
  for (const t of [0.05, 0.325, 1, 2]) close(th.at(t), 100 + amp - amp * Math.exp(-t / TAU), 1e-9, `t=${t}`);
  close(th.velocity(0), 1000, 1e-9, 'the speed it was let go at');
  for (const t of [0.1, 0.5, 1.5]) {
    const h = 1e-6;
    close(th.velocity(t), (th.at(t + h) - th.at(t - h)) / (2 * h), 1e-3, `speed at ${t}`);
  }
});

test('it lands exactly on the target when the remaining distance is within restDelta', () => {
  const th = inertia({ from: 0, velocity: 1000 }), end = 1000 * TAU;
  close(th.settle, TAU * Math.log(end / 0.5), 1e-12);
  assert.equal(th.at(th.settle), end);
  assert.equal(th.at(th.settle + 5), end);
  assert.equal(th.at(Infinity), end);
  assert.ok(Math.abs(th.at(th.settle - 1e-6) - end) <= 0.5 + 1e-4);
  assert.equal(th.velocity(Infinity), 0);
  assert.equal(th.velocity(th.settle + 1), 0);
});

test('a throw to the left mirrors the throw to the right', () => {
  const r = inertia({ from: 0, velocity: 700 }), l = inertia({ from: 0, velocity: -700 });
  for (const t of [0, 0.1, 0.4, 1.2, 4]) close(l.at(t), -r.at(t), 1e-9);
  close(l.target, -700 * TAU, 1e-9);
});

test('no velocity: it stays where it is and is at rest at once', () => {
  const th = inertia({ from: 42, velocity: 0 });
  assert.equal(th.target, 42);
  assert.equal(th.settle, 0);
  assert.equal(th.at(1), 42);
});

test('the drag feel is slower: a 750 ms time constant, a softer rubber band', () => {
  assert.equal(FEELS.throw.timeConstant, 325);
  assert.deepEqual(FEELS.drag, { timeConstant: 750, bounceStiffness: 200, bounceDamping: 40, restDelta: 1 });
  const a = inertia({ from: 0, velocity: 1000 }), b = inertia({ from: 0, velocity: 1000, ...FEELS.drag });
  assert.ok(b.settle > a.settle);
  close(b.at(0.75), 750 - 750 * Math.exp(-1), 1e-9);
});

test('snap: the throw lands on the nearest of a set of places, a step, or what a function returns', () => {
  const slides = inertia({ from: 0, velocity: 3000, snap: [0, 300, 600, 900] });
  assert.equal(slides.target, 900, 'the ideal 975 is nearest 900');
  assert.equal(slides.at(0), 0);
  assert.equal(slides.at(Infinity), 900);
  assert.equal(inertia({ from: 0, velocity: 3000, snap: 250 }).target, 1000, 'a step of 250: 975 is nearest 1000');
  assert.equal(inertia({ from: 0, velocity: 1000, snap: (x) => Math.round(x / 100) * 100 + 7 }).target, 307, 'a function is asked with the ideal end, 325');
  assert.equal(inertia({ from: 0, velocity: 10, snap: [0, 300] }).target, 0, 'a weak flick comes back to where it was');
});

test('snap: a release slower than minFlick lands on the place nearest the release, wherever the curve would end', () => {
  assert.equal(SNAP.minFlick, 500);
  assert.equal(inertia({ from: 280, velocity: 400, snap: [0, 300, 600] }).target, 300);
  assert.equal(inertia({ from: 140, velocity: -499, snap: [0, 300, 600] }).target, 0);
  assert.equal(inertia({ from: 140, velocity: 400, snap: [0, 300], minFlick: 100 }).target, 300, 'a lower minFlick makes it a flick');
});

test('snap: a flick never lands behind its release; it moves at least one place its way', () => {
  // from 100 at 600/s the curve ends at 295, nearest 0, behind the release: the flick goes on to 1000
  assert.equal(inertia({ from: 100, velocity: 600, snap: [0, 1000] }).target, 1000);
  assert.equal(inertia({ from: 100, velocity: 600, snap: 1000 }).target, 1000, 'the same with a step');
  assert.equal(inertia({ from: 900, velocity: -600, snap: [0, 1000] }).target, 0, 'and to the left');
  // past the last place it has nowhere further to go
  assert.equal(inertia({ from: 1000, velocity: 600, snap: [0, 1000] }).target, 1000);
});

test('snap: skip false moves one place at most; the default lets a strong flick pass places', () => {
  assert.equal(SNAP.skip, true);
  assert.equal(inertia({ from: 0, velocity: 3000, snap: [0, 300, 600, 900], skip: false }).target, 300);
  assert.equal(inertia({ from: 900, velocity: -3000, snap: [0, 300, 600, 900], skip: false }).target, 600);
});

test('snap: it lands on the sheet spring that leaves at the release speed, so a snap never jumps in speed', () => {
  const th = inertia({ from: 0, velocity: 1000, snap: [0, 300, 600, 900] });
  assert.equal(th.target, 300);
  close(th.velocity(0), 1000, 1e-6, 'the speed it was let go at');
  const w = (2 * Math.PI) / SNAP.response, sp = { k: w * w, c: 2 * SNAP.flickDamping * w, m: 1 };
  for (const t of [0.02, 0.1, 0.3]) close(th.at(t), spring.from(t, sp, { from: 0, to: 300, velocity: 1000 }), 1e-9, `t=${t}`);
  assert.equal(th.at(th.settle), 300);
  assert.equal(th.at(Infinity), 300);
  assert.ok(Math.abs(th.at(th.settle - 1e-4) - 300) <= 0.5 + 1e-3);
  // a slow release is critically damped: it never passes its place
  const slow = inertia({ from: 280, velocity: 100, snap: [0, 300, 600] });
  for (let t = 0; t < slow.settle; t += 0.005) assert.ok(slow.at(t) <= 300 + 1e-9, `t=${t}`);
  // a snapped place outside the bounds is held to them
  assert.equal(inertia({ from: 0, velocity: 3000, snap: [0, 900], max: 600 }).target, 600);
});

test('rate sets the time constant the way a scroll view decelerates: tau = -1 / ln(rate) ms', () => {
  assert.deepEqual(RATES, { normal: 0.998, fast: 0.99 });
  const n = inertia({ from: 0, velocity: 1000, rate: RATES.normal });
  close(n.target, 1000 * (-1 / Math.log(0.998)) / 1000, 1e-9);
  close(n.velocity(0), 1000, 1e-9);
  assert.ok(inertia({ from: 0, velocity: 1000, rate: RATES.fast }).target < n.target, 'fast stops sooner');
  assert.throws(() => inertia({ from: 0, velocity: 1, rate: 1 }), TypeError);
});

test('an explicit power keeps the older form: amp = power * velocity, leaving at power / tau times the release', () => {
  const th = inertia({ from: 0, velocity: 1000, power: 0.8 });
  assert.equal(th.target, 800);
  close(th.velocity(0), 800 / TAU, 1e-9);
});

test('a bound: the friction curve is cut at the crossing time, solved analytically, and a spring takes over', () => {
  const th = inertia({ from: 0, velocity: 1000, max: 500, power: 0.8 });
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
  const free = inertia({ from: 0, velocity: 1000, power: 0.8 });
  for (const t of [0, 0.1, tb - 0.01]) assert.equal(th.at(t), free.at(t));
});

test('a bound on the left, and the nearest bound when there are two', () => {
  const th = inertia({ from: 400, velocity: -1000, min: 0, max: 1000, power: 0.8 });
  assert.equal(th.bound.value, 0);
  const both = inertia({ from: 600, velocity: 1000, min: 0, max: 1000, power: 0.8 });
  assert.equal(both.bound.value, 1000);
  assert.equal(both.at(Infinity), 1000);
  // a target inside the bounds never meets them
  assert.equal(inertia({ from: 400, velocity: 300, min: 0, max: 1000, power: 0.8 }).bound, null);
});

test('elastic: false is a wall, not a rubber band', () => {
  const th = inertia({ from: 0, velocity: 1000, max: 500, elastic: false, power: 0.8 });
  const tb = th.bound.t;
  for (const t of [tb, tb + 0.01, tb + 1, 10]) assert.equal(th.at(t), 500);
  assert.equal(th.velocity(tb + 0.5), 0);
  assert.equal(th.settle, tb);
});

test('starting outside a bound: the spring pulls it back from the first instant', () => {
  const th = inertia({ from: 650, velocity: 200, max: 500, power: 0.8 });
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
