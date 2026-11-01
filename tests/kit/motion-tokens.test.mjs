// Brand motion tokens for developers: each ease and spring as CSS, Motion API and physics; the brand sheet's curve plots.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/validate.mjs';
import { easeToken, springToken, motionTokens, toCss, toJson, curvePlots } from '../../scripts/lib/motion-tokens.mjs';
import { parseEasing } from '../../runtime/kit/ease.js';
import { spring } from '../../runtime/kit/springs.js';
import { reviewPage } from '../../scripts/lib/brand-sheet-page.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'mm-motion-tokens-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const editorial = JSON.parse(readFileSync(join(ROOT, 'styles/presets/editorial.json'), 'utf8'));
const close = (a, b, eps, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} vs ${b}`);

test('an ease that is a bezier is exported as it was written, with its four numbers', () => {
  const t = easeToken('cubic-bezier(0.2, 0.7, 0.2, 1)');
  assert.equal(t.css, 'cubic-bezier(0.2, 0.7, 0.2, 1)');
  assert.equal(t.exact, true);
  assert.deepEqual(t.cubicBezier, [0.2, 0.7, 0.2, 1]);
  assert.equal(t.overshoot, 0);
  assert.deepEqual(easeToken('ease-in-out').cubicBezier, [0.42, 0, 0.58, 1]);
  assert.equal(easeToken('steps(6)').css, 'steps(6, jump-end)');
});

test('any other ease is a sampled linear() that reproduces it within 0.005', () => {
  for (const s of ['back.out(1.7)', 'elastic.out(1, .4)', 'expo.inOut', 'bounce.out', 'slowMo(0.6, 0.8)']) {
    const t = easeToken(s);
    assert.equal(t.exact, false);
    assert.equal(t.cubicBezier, null);
    assert.match(t.css, /^linear\(0, /);
    const f = parseEasing(s), g = parseEasing(t.css);
    for (let i = 0; i <= 500; i++) close(g(i / 500), f(i / 500), 0.005, `${s} at ${i / 500}`);
  }
  assert.ok(easeToken('back.out(1.7)').overshoot > 0.05);
});

test('a spring is a duration (its settle time) and a linear() easing that reproduces its curve within 0.005', () => {
  for (const p of [editorial.motion.spring.ui, editorial.motion.spring.heavy, { bounce: 0.35, period: 0.5 }, { bounce: -0.4, period: 0.4, soft: true }, spring.presets.plop, spring.presets.beat, { k: 100, c: 40, m: 1 }]) {
    const t = springToken(p);
    close(t.settleMs, spring.settle(p) * 1000, 0.6);
    assert.equal(t.css.duration, `${t.settleMs}ms`);
    const g = parseEasing(t.css.easing);
    for (let i = 0; i < 1000; i++) {
      const x = i / 1000;
      close(g(x), spring((t.settleMs / 1000) * x, p), 0.005, `${JSON.stringify(p)} at ${x}`);
    }
    close(t.overshoot, spring.overshoot(p), 1e-4);
  }
});

test('the Motion API form: visualDuration is the period over 1.2, bounce is 1 - damping ratio', () => {
  const t = springToken({ bounce: 0.3, period: 0.6 });
  assert.deepEqual(t.motion, { type: 'spring', visualDuration: 0.5, bounce: 0.3 });
  assert.equal(t.motionExact, true);
  // a {k, c, m} spring: the same two numbers from its frequency and damping ratio
  const k = springToken({ k: 100, c: 10, m: 1 });
  close(k.motion.bounce, 0.5, 1e-9);
  close(k.motion.visualDuration, (2 * Math.PI) / 10 / 1.2, 1e-4);
  assert.equal(k.motionExact, true);
  // reading it back through MM's own {bounce, period} gives the same curve
  const back = { bounce: k.motion.bounce, period: k.motion.visualDuration * 1.2 };
  for (const x of [0.05, 0.2, 0.6, 1.2]) close(spring(x, back), spring(x, { k: 100, c: 10, m: 1 }), 2e-4, `t=${x}`);
});

test('the Motion form is exact only when Motion would draw the same curve', () => {
  assert.equal(springToken({ bounce: -0.4, period: 0.4 }).motionExact, false, 'Motion lands an over-damped spring on time; this one lands late');
  assert.equal(springToken({ bounce: -0.4, period: 0.4, soft: true }).motionExact, true);
  assert.equal(springToken({ bounce: -0.4, period: 0.4, soft: true }).motion.bounce, -0.4);
  assert.equal(springToken({ bounce: 0.3, period: 0.4, velocity: 5 }).motionExact, false, 'a spring given by visualDuration forgets an inherited velocity');
  assert.equal(springToken({ k: 4.75, c: 0.05, m: 0.08 }).motionExact, false, 'Motion floors the damping ratio at 0.05');
});

test('the physics form is always exact: stiffness, damping, mass 1, velocity', () => {
  for (const p of [{ bounce: 0.3, period: 0.5 }, { bounce: -0.4, period: 0.4 }, { bounce: -0.4, period: 0.4, soft: true }, spring.presets.jump, spring.presets.swing]) {
    const t = springToken(p);
    assert.equal(t.physics.type, 'spring');
    assert.equal(t.physics.mass, 1);
    const q = { k: t.physics.stiffness, c: t.physics.damping, m: 1, velocity: t.physics.velocity };
    for (const x of [0.03, 0.1, 0.4, 1]) close(spring(x, q), spring(x, p), 1e-4, `${JSON.stringify(p)} at ${x}`);
  }
  assert.equal(springToken(spring.presets.jump).physics.velocity, 8);
});

test('a style gives one token per ease and spring role, including the roles a brand added', () => {
  const style = structuredClone(editorial);
  style.motion.easings.pop = 'back.out(1.7)';
  style.motion.spring.snap = { preset: 'plop' };
  const t = motionTokens(style);
  assert.deepEqual(Object.keys(t.easings), ['enter', 'exit', 'move', 'pop']);
  assert.deepEqual(Object.keys(t.springs), ['ui', 'type', 'heavy', 'snap']);
  assert.equal(t.easings.enter.css, editorial.motion.easings.enter);
  assert.equal(t.name, 'editorial');
  assert.deepEqual(t.durations, editorial.motion.durations);
});

test('CSS: custom properties for durations, eases and springs', () => {
  const css = toCss(motionTokens(editorial));
  assert.match(css, /^\/\* Motion tokens for editorial/);
  assert.match(css, /:root \{/);
  assert.match(css, /--mm-dur-standard: \d+ms;/);
  assert.match(css, new RegExp(`--mm-ease-enter: ${editorial.motion.easings.enter.replace(/[()]/g, '\\$&')};`));
  assert.match(css, /--mm-spring-ui-duration: \d+ms;/);
  assert.match(css, /--mm-spring-ui: linear\(0, /);
  assert.match(css, /--mm-spring-heavy: linear\(/);
  assert.equal(css.trimEnd().endsWith('}'), true);
});

test('JSON: the same data, parseable', () => {
  const j = JSON.parse(toJson(motionTokens(editorial)));
  assert.equal(j.springs.ui.motion.type, 'spring');
  assert.equal(j.easings.enter.exact, true);
  assert.ok(j.springs.heavy.css.easing.startsWith('linear('));
});

test('mm style export-motion writes .css or .json by the extension, and refuses anything else', () => {
  const run = (...a) => spawnSync('node', [join(ROOT, 'scripts', 'mm.mjs'), 'style', 'export-motion', ...a], { encoding: 'utf8', cwd: ROOT });
  const css = join(tmp, 'out', 'motion.css'), json = join(tmp, 'motion.json');
  let r = run('--style', 'styles/presets/editorial.json', '--out', css);
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(css, 'utf8'), /--mm-spring-ui: linear\(/);
  r = run('--style', 'styles/presets/editorial.json', '--out', json);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(readFileSync(json, 'utf8')).name, 'editorial');
  r = run('--style', 'styles/presets/editorial.json', '--out', join(tmp, 'motion.txt'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\.css or \.json/);
  r = run('--style', 'styles/presets/editorial.json');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: mm style export-motion/);
  const bad = join(tmp, 'bad.json');
  writeFileSync(bad, '{"name":"x"}');
  assert.equal(run('--style', bad, '--out', css).status, 1);
});

test('curve plots: one per ease and spring, with the settle time and the overshoot', () => {
  const plots = curvePlots(editorial.motion);
  assert.deepEqual(plots.map((p) => `${p.kind}:${p.name}`), ['ease:enter', 'ease:exit', 'ease:move', 'spring:ui', 'spring:type', 'spring:heavy']);
  for (const p of plots) {
    assert.match(p.d, /^M[-\d.,]+( L[-\d.,]+)+$/);
    assert.ok(!/NaN|Infinity/.test(p.d));
  }
  const ui = plots.find((p) => p.name === 'ui');
  close(ui.settle, spring.settle(editorial.motion.spring.ui) * 1000, 0.6);
  close(ui.overshoot, spring.overshoot(editorial.motion.spring.ui), 1e-4);
  assert.ok(ui.settleX > 0 && ui.settleX < 240);
  assert.ok(ui.targetY < ui.startY, 'one is above zero on the page');
  const back = curvePlots({ easings: { enter: 'back.out(2)' }, spring: {} })[0];
  assert.ok(back.overshoot > 0.1);
});

test('the review sheet draws the curves with their settle time and overshoot', () => {
  const roles = Object.fromEntries(['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'].map((r, i) => [r, { hex: ['#FFFFFF', '#111111', '#555555', '#EEEEEE', '#CCCCCC', '#D1481F', '#FFFFFF'][i], confidence: 'measured', evidence: 'x', fixed: null }]));
  const html = reviewPage({
    name: 'Acme', folder: '/tmp/acme', sources: [], roles, accentText: true, pairs: [], warnings: [], ask: [], fonts: [],
    brandFaces: [], chromeFaces: [], logo: null,
    motion: { name: 'calm', durations: { quick: 120, standard: 240, slow: 480, hold: 1200 }, enter: 'cubic-bezier(0.2, 0.7, 0.2, 1)', curves: curvePlots({ easings: { enter: 'back.out(1.7)', exit: 'ease-in', move: 'ease-in-out' }, spring: { ui: editorial.motion.spring.ui } }) },
    frames: { look: [], tempo: [] },
  });
  assert.match(html, /<h3>Curves<\/h3>/);
  assert.equal((html.match(/<svg class="curve"/g) ?? []).length, 4);
  assert.match(html, /settles in \d+ ms/);
  assert.match(html, /overshoots [\d.]+ %/);
  const without = reviewPage({ name: 'Acme', folder: '/tmp/acme', sources: [], roles, accentText: true, pairs: [], warnings: [], ask: [], fonts: [], brandFaces: [], chromeFaces: [], logo: null, motion: { name: 'calm', durations: {}, enter: '' }, frames: { look: [], tempo: [] } });
  assert.doesNotMatch(without, /<h3>Curves<\/h3>/, 'a sheet with no curves has no curves section');
});
