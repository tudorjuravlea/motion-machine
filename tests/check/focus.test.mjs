// W-FOCUS (SPEC §7): at a rest, two beats carrying the accent at full strength compete (warn), and a
// finished text left between 5 % and 50 % visible is a leftover (warn). Each case is the base film with
// CSS on its sub and headline slots.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { gate, warnsOnly, row } from './_harness.mjs';
import { variant, cleanup } from './_variant.mjs';
import { FULL, DIM_MIN, DIM_MAX } from '../../scripts/check/W-FOCUS.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-FOCUS'] };
const slot = (name, decl, scene = 'style') => `[data-scene="${scene}"] [data-slot="${name}"] { ${decl} }\n`;
const accent = 'color: var(--mm-color-accent);';
const mix = (role, pct) => `color: color-mix(in srgb, var(--mm-color-${role}) ${pct}%, transparent);`;
const focus = async (css) => row(await run(variant('_base/film', undefined, { css }), only), 'W-FOCUS');

test('the thresholds: full is 95 % effective opacity; a leftover is above 5 % and under 50 %', () => {
  assert.deepEqual([FULL, DIM_MIN, DIM_MAX], [0.95, 0.05, 0.5]);
});

test('the base film lights nothing in the accent and leaves nothing dim: PASS', async () => {
  const r = row(await run('_base/film', only), 'W-FOCUS');
  assert.equal(r.status, 'PASS');
  assert.ok(r.evidence.instants >= 2);
});

test('one beat in the accent is the focus; a second one at full strength competes', async () => {
  const one = await focus(slot('headline', accent));
  assert.equal(one.status, 'PASS');
  const two = await focus(slot('headline', accent) + slot('sub', accent));
  assert.equal(two.status, 'WARN');
  assert.equal(two.evidence.measured, 2);
  assert.match(two.evidence.reason, /2 beats carry the accent at full strength at once/);
  assert.match(two.evidence.selector, /headline.*sub/);
});

test('the same accent in two scenes is two rests with one focus each: PASS', async () => {
  const r = await focus(slot('headline', accent, 'style') + slot('headline', accent, 'rests'));
  assert.equal(r.status, 'PASS');
});

test('a second beat at 94 % accent recedes; at 95 % it competes', async () => {
  const at = (pct) => focus(slot('headline', accent) + slot('sub', mix('accent', pct)));
  assert.equal((await at(94)).status, 'PASS');
  assert.equal((await at(95)).status, 'WARN');
});

test('a second beat in ink or muted is not a competitor', async () => {
  assert.equal((await focus(slot('headline', accent) + slot('sub', 'color: var(--mm-color-ink);'))).status, 'PASS');
  assert.equal((await focus(slot('headline', accent) + slot('sub', 'color: var(--mm-color-muted);'))).status, 'PASS');
});

test('a text left at a tint of its colour is a leftover between 5 % and 50 %, and not at either edge', async () => {
  const dim = (pct) => focus(slot('sub', mix('ink', pct)));
  const lone = await dim(30);
  assert.equal(lone.status, 'WARN');
  assert.equal(lone.evidence.measured, 0.3);
  assert.match(lone.evidence.reason, /left at 0\.3 opacity at a rest: retire it to 0 or keep it at full/);
  assert.equal((await dim(49)).status, 'WARN');
  assert.equal((await dim(50)).status, 'PASS', 'half is a tier, not a leftover');
  assert.equal((await dim(6)).status, 'WARN');
  assert.equal((await dim(5)).status, 'PASS', 'at 5 % it is as good as gone');
});

test('an ancestor\'s opacity multiplies in: a scene held at 0.3 leaves every text of it a leftover', async () => {
  const r = await focus('[data-scene="style"] .mm-camera { opacity: 0.3; }\n');
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.measured, 0.3);
  const both = await focus('[data-scene="style"] .mm-camera { opacity: 0.6; }\n' + slot('sub', mix('ink', 60)));
  assert.equal(both.status, 'WARN', '0.6 x 0.6');
  assert.equal(both.evidence.measured, 0.36);
});

test('a deck is measured at its rests', async () => {
  const r = row(await run('_base/deck', only), 'W-FOCUS');
  assert.equal(r.status, 'PASS');
});

test('fixtures/negatives/W-FOCUS warns W-FOCUS and nothing else', async () => {
  const r = warnsOnly(await run('W-FOCUS'), 'W-FOCUS');
  assert.equal(r.evidence.measured, 2);
});
