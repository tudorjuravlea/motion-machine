// G-LEGIBLE (SPEC §7, §12). The CLI exits 1 and out/check.json names the
// selector and the measured px. Rendered size counts transforms; ::after text counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { NEG, gate, failsOnly, row } from './_harness.mjs';
import { hiddenTextOffenders } from '../../scripts/check/_lib.mjs';

const run = gate();

test('node scripts/check.mjs fixtures/negatives/G-LEGIBLE/size exits 1 and names selector and px', () => {
  const p = spawnSync(process.execPath, [join(ROOT, 'scripts/check.mjs'), 'fixtures/negatives/G-LEGIBLE/size', '--quiet'], { cwd: ROOT, encoding: 'utf8', timeout: 180_000 });
  assert.equal(p.status, 1, p.stderr);
  const report = JSON.parse(readFileSync(join(NEG, 'G-LEGIBLE/size/out/check.json'), 'utf8'));
  const r = report.rules.find((x) => x.id === 'G-LEGIBLE');
  assert.equal(r.status, 'FAIL');
  assert.equal(r.evidence.selector, '[data-scene="style"] [data-slot="sub"]');
  assert.equal(r.evidence.measured, 25.84);           // 0.19 × 136 px: the micro size on a 16x9 film
  assert.equal(r.evidence.threshold, 36);             // the 16x9 film body floor
  const others = report.rules.filter((x) => x.id !== 'G-LEGIBLE' && (x.status === 'FAIL' || x.status === 'WARN'));
  assert.deepEqual(others, []);
});

test('G-LEGIBLE/scaled: the computed size passes, the rendered size (scale 0.6) fails', async () => {
  const r = failsOnly(await run('G-LEGIBLE/scaled'), 'G-LEGIBLE');
  assert.equal(r.evidence.computed, 36.72);
  assert.equal(r.evidence.scale, 0.6);
  assert.ok(Math.abs(r.evidence.measured - 36.72 * 0.6) < 0.05, String(r.evidence.measured));
});

test('G-LEGIBLE/no-rest: a 12 px headline in a scene with motion across its cut fails', async () => {
  const r = failsOnly(await run('G-LEGIBLE/no-rest'), 'G-LEGIBLE', { inherent: ['W-SCENE-END', 'W-HOLD', 'W-DEAD', 'W-READ', 'W-EMPTY', 'W-LITERAL'] });
  assert.equal(r.evidence.measured, 12);
  assert.match(r.evidence.selector, /data-scene="style"/);
});

test('G-LEGIBLE/micro-fact: data-micro text may not carry a fact', async () => {
  const r = failsOnly(await run('G-LEGIBLE/micro-fact'), 'G-LEGIBLE');
  assert.equal(r.evidence.measured, 'data-micro text carries fact f1');
  assert.equal(r.evidence.selector, '[data-scene="open"] [data-slot="sub"]');
});

test('G-LEGIBLE/micro-cta: data-micro text may not carry the call to action', async () => {
  const r = failsOnly(await run('G-LEGIBLE/micro-cta'), 'G-LEGIBLE');
  assert.equal(r.evidence.measured, 'data-micro text carries the call to action');
  assert.equal(r.evidence.selector, '[data-scene="close"] [data-slot="sub"]');
});

test('G-LEGIBLE/pseudo: ::after small print is measured', async () => {
  const r = failsOnly(await run('G-LEGIBLE/pseudo'), 'G-LEGIBLE');
  assert.match(r.evidence.selector, /::after$/);
  assert.equal(r.evidence.measured, 25.84);
});

test('G-LEGIBLE/first-letter: a ::first-letter at 10 % of the headline is measured at its own size', async () => {
  const r = failsOnly(await run('G-LEGIBLE/first-letter'), 'G-LEGIBLE');
  assert.match(r.evidence.selector, /data-slot="headline"\]::first-letter$/);
  assert.equal(r.evidence.measured, 8.43);   // 84.32 px × 10 %
});

test('G-LEGIBLE/shadow: attachShadow reached by a computed name is refused and fails', async () => {
  const r = failsOnly(await run('G-LEGIBLE/shadow'), 'G-LEGIBLE');
  assert.equal(r.evidence.measured, 'attachShadow');
  assert.match(r.evidence.file, /G-LEGIBLE\/shadow\/piece\.js$/);
});

test('G-LEGIBLE/canvas-text: fillText reached by a computed name fails', async () => {
  const r = failsOnly(await run('G-LEGIBLE/canvas-text'), 'G-LEGIBLE');
  assert.equal(r.evidence.measured, 'canvas fillText');
  assert.match(r.evidence.file, /G-LEGIBLE\/canvas-text\/piece\.js$/);
});

test('a pattern that declares canvasText may draw canvas text; the piece passes', async () => {
  const src = readFileSync(join(ROOT, 'fixtures/negatives/_shared/patterns/entrances/canvas-word/pattern.js'), 'utf8');
  assert.ok(hiddenTextOffenders(src).some((h) => h.match === 'fillText'), 'the pattern does call fillText');
  const res = await run('_base/canvas-text');
  assert.equal(row(res, 'G-LEGIBLE').status, 'PASS');
  assert.equal(res.code, 0);
});

test('the hidden-text grep: shadow roots (imperative and declarative) and canvas text', () => {
  const found = hiddenTextOffenders("el.attachShadow({mode:'open'}); g.fillText('a',0,0); g.strokeText('b',0,0); '<template shadowrootmode=\"open\">'").map((h) => h.match);
  assert.deepEqual(found, ['attachShadow', 'fillText', 'strokeText', 'shadowrootmode']);
  assert.deepEqual(hiddenTextOffenders('g.fillRect(0, 0, 4, 4); el.shadowRootless = 1;'), []);
});
