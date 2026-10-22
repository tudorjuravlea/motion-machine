// Decoration text (`data-decor`, SPEC §5/§7): a layout's backdrop words are declared decoration, and
// G-LEGIBLE holds them to what decoration may be. Like data-micro text they may not carry a fact or the
// call to action; unlike data-micro they keep the body floor. Each case is a work copy of a gate
// fixture with only its piece.js changed, so the stories, styles and rests are the fixtures' own.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NEG, gate, failsOnly, row } from './_harness.mjs';

const run = gate();
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

/** A copy of fixtures/negatives/<from> beside it (same depth, so its relative imports hold) whose piece marks `selector` data-decor. */
function decorCopy(from, selector, tag) {
  const dir = join(NEG, from.split('/')[0], `.tmp-decor-${tag}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(NEG, from), dir, { recursive: true, filter: (s) => !s.endsWith('/out') });
  writeFileSync(join(dir, 'piece.js'), `export function after() {\n  document.querySelector('${selector}').setAttribute('data-decor', '');\n}\n`);
  made.push(dir);
  return dir;
}

test('data-decor text may not carry the call to action', async () => {
  const r = failsOnly(await run(decorCopy('G-LEGIBLE/micro-cta', '[data-scene="close"] [data-slot="sub"]', 'cta')), 'G-LEGIBLE');
  assert.equal(r.evidence.measured, 'data-decor text carries the call to action');
  assert.equal(r.evidence.selector, '[data-scene="close"] [data-slot="sub"]');
  assert.match(r.evidence.reason, /decoration/);
});

test('data-decor text may not carry a fact', async () => {
  const r = failsOnly(await run(decorCopy('G-LEGIBLE/micro-fact', '[data-scene="open"] [data-slot="sub"]', 'fact')), 'G-LEGIBLE');
  assert.equal(r.evidence.measured, 'data-decor text carries fact f1');
});

test('data-decor text keeps the body floor: it is not micro text', async () => {
  const r = failsOnly(await run(decorCopy('G-LEGIBLE/size', '[data-scene="style"] [data-slot="sub"]', 'size')), 'G-LEGIBLE');
  assert.equal(r.evidence.threshold, 36, 'the 16x9 film body floor, not the micro floor');
  assert.equal(r.evidence.micro, false);
});

test('data-decor text that carries neither passes', async () => {
  const res = await run(decorCopy('_base/film', '[data-scene="open"] [data-slot="headline"]', 'clean'));
  assert.equal(row(res, 'G-LEGIBLE').status, 'PASS', row(res, 'G-LEGIBLE').evidence.reason ?? '');
});
