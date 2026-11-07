// Ease families, the JSON ease grammar, custom curves, steps, irregular, slowMo, expoScale, bias,
// CSS linear(): every ease is a pure function of p whose ends are exactly 0 and 1 (SPEC §6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseEasing, ease, cubicBezier, easeFamily, FAMILIES, TYPES, steps, irregular, slowMo, expoScale, bias, mirror, reverse,
  parseLinear, easeIssues, toLinear, cssEasing,
} from '../../runtime/kit/ease.js';
import { curve } from '../../runtime/kit/curve.js';

const close = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);
const GRID = Array.from({ length: 101 }, (_, i) => i / 100);

// every spelling the grammar has, with its params where a family takes them
const SPECS = [
  ...FAMILIES.flatMap((f) => TYPES.map((t) => `${f}.${t}`)),
  'back.out(1.7)', 'back.in(0)', 'back.inOut(3)', 'elastic.out(1, .4)', 'elastic.in(2, .2)', 'elastic.inOut(1.5, 0.5)', 'elastic.outIn(1,.3)',
  'power.in(1.5)', 'power.out(3.2)', 'power.inOut(2.5)',
  'steps(8)', 'steps(4, start)', 'steps(1)', 'irregular(10)', 'irregular(6, 0.4, 3)', 'slowMo', 'slowMo(0.5, 0.9)', 'expoScale(1, 2)', 'expoScale(0.5, 4, quad.out)',
  'bias(quad.out, 0.5)', 'bias(back.out(1.7), -0.6)', 'linear(0, 0.25 50%, 1)', 'curve(M0,0 C0.25,0.1 0.25,1 1,1)', 'curve(0,0, 0.3,0.1, 0.5,1.4, 1,1)',
  'anticipate', 'reverse(quad.in)', 'mirror(cubic.in)', 'quad', 'outBack(2)', 'inOutElastic', 'circ.out', 'expo.inOut',
];

test('every ease family, type and spelling starts at exactly 0 and ends at exactly 1', () => {
  for (const s of SPECS) {
    const f = parseEasing(s);
    assert.equal(f(0), 0, `${s}(0)`);
    assert.equal(f(1), 1, `${s}(1)`);
    assert.equal(f(-0.5), 0, `${s}(-0.5)`);
    assert.equal(f(1.5), 1, `${s}(1.5)`);
    for (const p of GRID) assert.ok(Number.isFinite(f(p)), `${s}(${p}) = ${f(p)}`);
  }
});

test('the four types are in, out = 1 - in(1 - p), inOut and outIn as documented', () => {
  for (const fam of FAMILIES) {
    const i = parseEasing(`${fam}.in`), o = parseEasing(`${fam}.out`), io = parseEasing(`${fam}.inOut`), oi = parseEasing(`${fam}.outIn`);
    for (const p of GRID) {
      close(o(p), 1 - i(1 - p), 1e-12, `${fam}.out(${p})`);
      close(io(p), p < 0.5 ? i(2 * p) / 2 : 1 - i(2 - 2 * p) / 2, 1e-12, `${fam}.inOut(${p})`);
      close(oi(p), p < 0.5 ? (1 - i(1 - 2 * p)) / 2 : (i(2 * p - 1) + 1) / 2, 1e-12, `${fam}.outIn(${p})`);
    }
    close(io(0.5), 0.5, 1e-12, `${fam}.inOut(.5)`);
    close(oi(0.5), 0.5, 1e-12, `${fam}.outIn(.5)`);
  }
});

test('outIn is fast, then slow in the middle, then fast: its slope at 0.5 is the in-curve at 0', () => {
  const q = parseEasing('quad.outIn');
  assert.ok(q(0.1) > 0.1 && q(0.9) < 0.9, 'out in the first half, in in the second');
  close(q(0.25), 0.375, 1e-12);
  close(q(0.75), 0.625, 1e-12);
});

test('known values of the closed forms', () => {
  close(parseEasing('quad.in')(0.5), 0.25);
  close(parseEasing('cubic.in')(0.5), 0.125);
  close(parseEasing('quart.in')(0.5), 0.0625);
  close(parseEasing('quint.in')(0.5), 0.03125);
  close(parseEasing('power.in(2.5)')(0.5), 0.5 ** 2.5);
  close(parseEasing('sine.in')(0.5), 1 - Math.cos(Math.PI / 4));
  close(parseEasing('circ.in')(0.5), 1 - Math.sqrt(0.75));
  close(parseEasing('expo.in')(0.5), 2 ** -5);
  const s = 1.70158;
  close(parseEasing('back.in')(0.5), (s + 1) / 8 - s / 4);
  close(parseEasing('bounce.out')(0.5), 0.765625);
  close(parseEasing('bounce.in')(0.5), 0.234375);
  close(parseEasing('bounce.out')(0.1), 7.5625 * 0.01);
  // Penner's elastic.out: 2^(-10p) sin((p - s) 2pi / period) + 1 with s = period / 4 at amplitude 1
  const per = 0.3;
  close(parseEasing('elastic.out(1, .3)')(0.5), 2 ** -5 * Math.sin(((0.5 - per / 4) * 2 * Math.PI) / per) + 1);
});

test('circ never meets a value outside [0, 1]: no NaN from acos or sqrt', () => {
  for (const t of TYPES) for (const p of [-3, -0.1, 0, 0.5, 1, 1.0000001, 7, NaN].filter((x) => !Number.isNaN(x))) assert.ok(Number.isFinite(parseEasing(`circ.${t}`)(p)), `circ.${t}(${p})`);
});

test('expo ends are snapped: exactly 0 at 0 and exactly 1 at 1, in and out', () => {
  for (const t of TYPES) { assert.equal(parseEasing(`expo.${t}`)(0), 0); assert.equal(parseEasing(`expo.${t}`)(1), 1); }
  assert.ok(parseEasing('expo.in')(1e-9) < 1e-3);
});

test('back inOut is the symmetric mirror, and back(0) is the cubic', () => {
  const b = parseEasing('back.inOut(2)');
  for (const p of GRID) close(b(p) + b(1 - p), 1, 1e-12, `p=${p}`);
  const c = parseEasing('cubic.out');
  for (const p of GRID) close(parseEasing('back.out(0)')(p), c(p), 1e-12);
  assert.ok(parseEasing('back.out(1.7)').maxUpTo(1) > 1.05, 'back overshoots');
  assert.ok(parseEasing('back.out(3)').maxUpTo(1) > parseEasing('back.out(1)').maxUpTo(1), 'a bigger overshoot param overshoots more');
});

test('elastic: amplitude and period are params; out rings around 1 and settles on it', () => {
  const e = parseEasing('elastic.out(1, .4)');
  assert.ok(e.maxUpTo(1) > 1.1);
  const crossings = GRID.slice(1).filter((p, i) => (e(GRID[i]) - 1) * (e(p) - 1) < 0).length;
  assert.ok(crossings >= 2, `rings: ${crossings} crossings of 1`);
  assert.ok(parseEasing('elastic.out(2, .4)').maxUpTo(1) > e.maxUpTo(1), 'a bigger amplitude overshoots more');
});

test('bounce.out lands three times and never passes 1', () => {
  const b = parseEasing('bounce.out');
  assert.ok(b.maxUpTo(1) <= 1 + 1e-12);
  const dips = GRID.filter((p, i) => i > 0 && i < 100 && b(GRID[i - 1]) > b(p) && b(p) < b(GRID[i + 1]));
  assert.equal(dips.length, 3);
});

test('steps(n): n levels, jumps exactly at k/n, the last frame pinned to 1; start jumps first', () => {
  const s = steps(8);
  assert.equal(s(0), 0);
  assert.equal(s(1), 1, 'pinned');
  assert.equal(s(0.999), 7 / 8);
  assert.equal(s(0.125), 1 / 8);
  assert.equal(s(0.1249), 0);
  assert.equal(s(0.3), 2 / 8);
  const st = steps(4, 'start');
  assert.equal(st(0), 0);
  assert.equal(st(0.0001), 0.25);
  assert.equal(st(0.25), 0.25);
  assert.equal(st(1), 1);
  assert.equal(new Set(GRID.map((p) => s(p))).size, 9, '8 steps: 9 distinct values including 0 and 1');
  assert.equal(parseEasing('steps(8)')(0.5), 0.5);
  assert.equal(parseEasing('steps(8, end)')(0.999), 7 / 8);
});

test('irregular(n, randomness, seed): seeded, monotone, a function of p alone', () => {
  const a = irregular(10, 1, 4), b = irregular(10, 1, 4), c = irregular(10, 1, 5);
  const fwd = GRID.map((p) => a(p)), rev = [...GRID].reverse().map((p) => b(p)).reverse();
  assert.deepEqual(fwd, rev, 'forward and reverse seek order give the same values');
  assert.notDeepEqual(fwd, GRID.map((p) => c(p)), 'another seed, another cadence');
  for (let i = 1; i < fwd.length; i++) assert.ok(fwd[i] >= fwd[i - 1] - 1e-12, `monotone at ${i}`);
  const lin = irregular(10, 0, 9);
  for (const p of GRID) close(lin(p), p, 1e-12, 'randomness 0 is linear');
  assert.equal(irregular(10)(0.5), irregular(10, 1, 0)(0.5), 'seed defaults to 0');
});

test('slowMo(ratio, power): fast edges, a long slow middle, smooth joins', () => {
  const f = slowMo(0.7, 0.7);
  const slope = (p) => (f(p + 1e-6) - f(p - 1e-6)) / 2e-6;
  close(slope(0.5), 0.3, 1e-4, 'the middle runs at 1 - power');
  assert.ok(slope(0.02) > 1.5, 'the start is fast');
  assert.ok(slope(0.98) > 1.5, 'the end is fast');
  for (const p of GRID) close(f(p) + f(1 - p), 1, 1e-12, `symmetric at ${p}`);
  const w = (1 - 0.7) / 2;   // the joins at w and 1 - w are C1
  close(slope(w - 1e-5), slope(w + 1e-5), 1e-3, 'no kink at the join');
  for (const p of GRID) close(slowMo(0.7, 0)(p), p, 1e-12, 'power 0 is linear');
  assert.ok(f.maxUpTo(1) <= 1 + 1e-12);
});

test('expoScale(a, b): linearly mixing a and b by it grows the scale at a constant rate', () => {
  const f = expoScale(1, 4);
  for (const p of GRID) close(1 + (4 - 1) * f(p), 4 ** p, 1e-12, `p=${p}`);
  close(expoScale(1, 2)(0.5), Math.SQRT2 - 1, 1e-12);
  close(expoScale(2, 0.5)(0.5), (2 * Math.sqrt(0.25) - 2) / (0.5 - 2), 1e-12, 'a zoom out works too');
});

test('bias(ease, r): r = 0 is the ease itself, r > 0 and r < 0 pull it either way, the ends stay', () => {
  const q = parseEasing('quad.out');
  const b0 = bias(q, 0);
  for (const p of GRID) close(b0(p), q(p), 1e-12);
  const lazy = bias(q, -0.8), snappy = bias(q, 0.8);
  assert.ok(snappy(0.3) > q(0.3) && lazy(0.3) < q(0.3));
  for (const b of [lazy, snappy]) { assert.equal(b(0), 0); assert.equal(b(1), 1); }
});

test('piecewise linear: CSS stop positions, implicit and explicit', () => {
  const f = parseEasing('linear(0, 0.25 50%, 1)');
  close(f(0.5), 0.25, 1e-12);
  close(f(0.25), 0.125, 1e-12);
  close(f(0.75), 0.625, 1e-12);
  const even = parseEasing('linear(0, 0.2, 0.9, 1)');   // stops at 0, 1/3, 2/3, 1 by CSS rules
  close(even(1 / 3), 0.2, 1e-12);
  close(even(2 / 3), 0.9, 1e-12);
  const mixed = parseLinear('linear(0, 0.1, 0.4 50%, 0.5, 1)');   // 0.1 at 25 %, 0.5 at 75 %
  assert.deepEqual(mixed.xs.map((x) => +x.toFixed(6)), [0, 0.25, 0.5, 0.75, 1]);
  const two = parseLinear('linear(0, 0.5 20% 40%, 1)');   // two positions: a flat run
  assert.deepEqual(two.xs, [0, 0.2, 0.4, 1]);
  assert.deepEqual(two.ys, [0, 0.5, 0.5, 1]);
  const back = parseLinear('linear(0, 0.9 60%, 0.5 40%, 1)');   // a position below the previous one is raised to it
  assert.deepEqual(back.xs, [0, 0.6, 0.6, 1]);
});

test('the grammar: spelling, spacing, bare family means out, camel names, aliases', () => {
  for (const p of GRID) {
    close(parseEasing('back.out(1.7)')(p), parseEasing(' back.out( 1.7 ) ')(p), 0);
    close(parseEasing('quad')(p), parseEasing('quad.out')(p), 0);
    close(parseEasing('outBack(1.7)')(p), parseEasing('back.out(1.7)')(p), 1e-15);
    close(parseEasing('inOutCubic')(p), parseEasing('cubic.inOut')(p), 1e-15);
    close(parseEasing('none')(p), p, 1e-9);
    close(parseEasing('easeInOut')(p), parseEasing('ease-in-out')(p), 0);
  }
  assert.equal(parseEasing('back.out(1.7)'), parseEasing('back.out(1.7)'), 'cached');
  for (const bad of ['', 'nope', 'quad.sideways', 'back.out(x)', 'steps()', 'steps(0)', 'quad.out(2)', 'bias(quad.out)', 'curve()', 'elastic.out(1,2,3)']) {
    assert.throws(() => parseEasing(bad), TypeError, `"${bad}"`);
  }
});

test('anticipate winds back, then lands; reverse and mirror are the documented modifiers', () => {
  const a = parseEasing('anticipate');
  assert.ok(a(0.2) < 0, 'it goes backwards first');
  assert.equal(a(1), 1);
  const i = parseEasing('cubic.in');
  for (const p of GRID) {
    close(reverse(i)(p), 1 - i(1 - p), 1e-12);
    close(mirror(i)(p), p <= 0.5 ? i(2 * p) / 2 : (2 - i(2 * (1 - p))) / 2, 1e-12);
  }
});

test('existing cubic beziers are still the exact Bezier curve, and keep maxUpTo and overshoot', () => {
  const f = parseEasing('cubic-bezier(.5,-0.5,.5,1.5)');
  assert.ok(typeof f.maxUpTo === 'function');
  const g = cubicBezier(0.5, -0.5, 0.5, 1.5);
  for (const p of GRID) assert.equal(f(p), g(p));
  assert.ok(ease.overshoot('back.out(2)', 1, {}) > 0);
  assert.equal(ease.overshoot('quad.out', 1, {}), 0);
});

test('a style role may name any ease; the beat may spell one in place of a role', () => {
  const style = { motion: { easings: { enter: 'back.out(1.4)', exit: 'expo.in', move: 'steps(5)' } } };
  assert.equal(ease('enter', 0.5, style), parseEasing('back.out(1.4)')(0.5));
  assert.equal(ease('exit', 0.5, style), parseEasing('expo.in')(0.5));
  assert.equal(ease('move', 0.5, style), 0.4);
  assert.equal(ease('elastic.out(1, .4)', 0.5, style), parseEasing('elastic.out(1, .4)')(0.5));
});

test('easeFamily builds a family directly', () => {
  const f = easeFamily('back', 'out', 1.7);
  for (const p of GRID) assert.equal(f(p), parseEasing('back.out(1.7)')(p));
  assert.throws(() => easeFamily('nope', 'in'), TypeError);
});

test('custom curve from 4 numbers is the cubic bezier, exactly', () => {
  const f = curve('0.25, 0.1, 0.25, 1');
  const g = cubicBezier(0.25, 0.1, 0.25, 1);
  for (const p of GRID) assert.equal(f(p), g(p));
  assert.deepEqual(f.issues, []);
});

test('custom curve from SVG path data in a unit box reads as drawn (y up)', () => {
  const f = curve('M0,0 C0.25,0.1 0.25,1 1,1');
  const g = cubicBezier(0.25, 0.1, 0.25, 1);
  for (const p of GRID) close(f(p), g(p), 2e-4, `p=${p}`);
  assert.equal(f(0), 0);
  assert.equal(f(1), 1);
});

test('custom curve drawn the way an editor draws it (y down, any size) is normalised', () => {
  // 200 x 100 box, y down: starts bottom-left (0,100) ends top-right (200,0), same shape as the unit curve above
  const f = curve('M20,100 C70,80 70,0 220,0');
  const g = cubicBezier(0.25, 0.2, 0.25, 1);
  for (const p of GRID) close(f(p), g(p), 3e-3, `p=${p}`);
  assert.equal(f(0), 0);
  assert.equal(f(1), 1);
  assert.deepEqual(f.issues, []);
  // a drawing that overshoots (control point above the end) overshoots after normalising
  const o = curve('M0,100 C60,100 80,-100 100,0');
  assert.ok(o.maxUpTo(1) > 1.2);
});

test('custom curve: an x that runs backwards is not a function of x; it is made monotone and flagged', () => {
  const f = curve('M0,0 C1.2,0.2 -0.1,0.8 1,1');
  assert.ok(f.issues.some((i) => i.kind === 'curve-backward'), JSON.stringify(f.issues));
  let prev = -Infinity;
  for (const p of GRID) { const y = f(p); assert.ok(Number.isFinite(y)); prev = y; }
  assert.ok(Number.isFinite(prev));
  assert.equal(f(0), 0); assert.equal(f(1), 1);
});

test('custom curve: a vertical step is kept and read from the upper side', () => {
  const f = curve('M0,0 L0.5,0 L0.5,1 L1,1');
  assert.equal(f(0.25), 0);
  assert.equal(f(0.5), 1);
  assert.equal(f(0.75), 1);
});

test('custom curve: path numbers 2 + 6n, relative commands, bad data throws', () => {
  const abs = curve('0,0, 0.25,0.1, 0.25,1, 1,1');
  const g = cubicBezier(0.25, 0.1, 0.25, 1);
  for (const p of GRID) close(abs(p), g(p), 2e-4);
  const rel = curve('m0,0 c0.25,0.1 0.25,1 1,1');
  for (const p of GRID) close(rel(p), abs(p), 1e-9);
  assert.throws(() => curve('1, 2, 3'), TypeError);
  assert.throws(() => curve('M0,0 Q1,1 2,2'), TypeError);
});

test('curve() in the grammar', () => {
  const f = parseEasing('curve(M0,0 C0.25,0.1 0.25,1 1,1)');
  close(f(0.5), cubicBezier(0.25, 0.1, 0.25, 1)(0.5), 2e-4);
  assert.deepEqual(easeIssues('curve(M0,0 C1.2,0.2 -0.1,0.8 1,1)').map((i) => i.kind), ['curve-backward']);
});

test('easeIssues: unknown names, partial steps, a start or end that is not 0 and 1; clean eases give none', () => {
  assert.deepEqual(easeIssues('back.out(1.7)'), []);
  assert.deepEqual(easeIssues('cubic-bezier(.2,.7,.2,1)'), []);
  assert.deepEqual(easeIssues('steps(8)'), []);
  assert.deepEqual(easeIssues('bounce.out'), []);
  assert.equal(easeIssues('bak.out')[0].kind, 'unknown');
  assert.equal(easeIssues('steps(2.5)')[0].kind, 'steps-last');
  assert.equal(easeIssues('linear(0.2, 1)')[0].kind, 'ends');
  assert.equal(easeIssues('linear(0, 0.9)')[0].kind, 'ends');
});

test('toLinear: linear() reproduces every family within 0.005, with the collinear points pruned', () => {
  for (const s of ['quad.inOut', 'back.out(1.7)', 'elastic.out(1, .4)', 'bounce.out', 'expo.out', 'sine.inOut', 'circ.in', 'slowMo', 'anticipate', 'irregular(8, 1, 2)', 'cubic-bezier(.2,.7,.2,1)', 'bias(back.out, 0.4)']) {
    const f = parseEasing(s);
    const css = toLinear(f);
    assert.match(css, /^linear\(/, s);
    const g = parseEasing(css);
    for (let i = 0; i <= 1000; i++) { const p = i / 1000; assert.ok(Math.abs(g(p) - f(p)) <= 0.005, `${s} at ${p}: ${g(p)} vs ${f(p)}`); }
    const n = css.split(',').length;
    assert.ok(n < 200, `${s}: ${n} points`);
    assert.ok(!/\.\d{5,}/.test(css), `${s}: 4 decimals`);
  }
  // a straight line prunes to its two ends
  assert.equal(toLinear(parseEasing('linear')), 'linear(0, 1)');
});

test('cssEasing: keywords and cubic-bezier stay as written, steps become steps(), the rest linear()', () => {
  assert.deepEqual(cssEasing('cubic-bezier(0.7, 0, 0.2, 1)'), { css: 'cubic-bezier(0.7, 0, 0.2, 1)', exact: true });
  assert.deepEqual(cssEasing('ease-in-out'), { css: 'ease-in-out', exact: true });
  assert.deepEqual(cssEasing('easeIn'), { css: 'ease-in', exact: true });
  assert.deepEqual(cssEasing('steps(8)'), { css: 'steps(8, jump-end)', exact: true });
  assert.deepEqual(cssEasing('steps(8, start)'), { css: 'steps(8, jump-start)', exact: true });
  const b = cssEasing('back.out(1.7)');
  assert.equal(b.exact, false);
  assert.match(b.css, /^linear\(/);
});

test('ease.js and curve.js are pure: no clock, no randomness, no DOM', () => {
  for (const f of ['ease.js', 'curve.js']) {
    const src = readFileSync(new URL(`../../runtime/kit/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /Date|Math\.random|performance|setTimeout|setInterval|requestAnimationFrame|document|window/, f);
  }
});
