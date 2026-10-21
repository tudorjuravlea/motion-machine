// composition belongs to the brand half. The brand carries `composition` (required, with
// bounded values), compose carries it into the composed style, the shipped brands differ on purpose
// and every shipped preset holds its brand's composition.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validators, ROOT } from '../../scripts/lib/validate.mjs';
import { compose } from '../../scripts/compose.mjs';

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const { brand, style } = validators();
const errorsAt = (v) => (v.errors ?? []).map((e) => `${e.instancePath}:${e.params?.missingProperty ?? e.params?.additionalProperty ?? ''}`).join(' | ');

test('a brand half without composition is rejected', () => {
  const b = read('styles/brands/paper.json');
  delete b.composition;
  assert.equal(brand(b), false);
  assert.match(errorsAt(brand), /:composition/);
});

test('each composition field is required and bounded', () => {
  for (const k of ['align', 'headlineScale', 'density']) {
    const b = read('styles/brands/paper.json');
    delete b.composition[k];
    assert.equal(brand(b), false, `missing ${k}`);
    assert.match(errorsAt(brand), new RegExp(`/composition:${k}`));
  }
  const bad = [['align', 'right'], ['align', 'justify'], ['density', 'cosy'], ['headlineScale', 0.5], ['headlineScale', 1.6], ['headlineScale', '1.2']];
  for (const [k, v] of bad) {
    const b = read('styles/brands/paper.json');
    b.composition[k] = v;
    assert.equal(brand(b), false, `${k} = ${JSON.stringify(v)} must be rejected`);
    assert.match(errorsAt(brand), new RegExp(`/composition/${k}`));
  }
  const extra = read('styles/brands/paper.json');
  extra.composition.grid = 12;
  assert.equal(brand(extra), false, 'no unknown composition field');
});

test('the shipped brands differ on purpose', () => {
  const c = Object.fromEntries(['paper', 'signal', 'linen'].map((n) => [n, read(`styles/brands/${n}.json`).composition]));
  assert.deepEqual([c.paper.align, c.paper.density], ['left', 'airy']);
  assert.deepEqual([c.linen.align, c.linen.density], ['left', 'airy']);
  assert.deepEqual([c.signal.align, c.signal.density], ['center', 'compact']);
  assert.ok(c.signal.headlineScale >= c.paper.headlineScale * 1.15, `signal's headline is clearly larger (${c.signal.headlineScale} vs ${c.paper.headlineScale})`);
  assert.ok(c.signal.headlineScale >= c.linen.headlineScale * 1.15);
});

test('compose carries the brand\'s composition into the composed style', () => {
  for (const [b, m] of [['paper', 'calm'], ['signal', 'kinetic'], ['linen', 'premium'], ['signal', 'calm']]) {
    const s = compose({ brand: b, motion: m });
    assert.equal(typeof s.composition?.headlineScale, 'number', `${b} x ${m}: composition carried`);
    assert.deepEqual(s.composition, read(`styles/brands/${b}.json`).composition, `${b} x ${m}`);
    assert.ok(style(s), errorsAt(style));
  }
});

test('every shipped preset holds its brand\'s composition and is what compose writes today', () => {
  for (const f of readdirSync(join(ROOT, 'styles/presets')).filter((x) => x.endsWith('.json'))) {
    const p = read(`styles/presets/${f}`);
    assert.equal(typeof p.composition?.headlineScale, 'number', `${f}: composition present`);
    assert.deepEqual(p.composition, read(p.from.brand).composition, `${f}: composition`);
    const fresh = compose({ brand: join(ROOT, p.from.brand), motion: join(ROOT, p.from.motion), name: p.name });
    assert.deepEqual(p, fresh, `${f} is stale: recompose it with node scripts/compose.mjs`);
  }
});

test('a composed style rejects a bad composition; one with no composition still validates', () => {
  const s = read('styles/presets/editorial.json');
  assert.ok(style(s), errorsAt(style));
  s.composition = { ...s.composition, align: 'right' };
  assert.equal(style(s), false);
  assert.match(errorsAt(style), /\/composition\/align/);
  const old = read('styles/presets/editorial.json');
  delete old.composition;
  assert.ok(style(old), `a style without composition reads as the defaults: ${errorsAt(style)}`);
});
