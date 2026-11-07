// runtime/kit/README.md is the reference a pattern author works from: every name a kit module
// exports, and every ctx member the kit gives a pattern, appears in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const KIT = new URL('../../runtime/kit/', import.meta.url);
const readme = readFileSync(new URL('README.md', KIT), 'utf8');
const mentions = (name) => new RegExp('(?<![\\w$])' + name.replace(/[$]/g, '\\$') + '(?![\\w$])').test(readme);

for (const file of readdirSync(KIT).filter((f) => f.endsWith('.js'))) {
  test(`README.md documents every export of ${file}`, async () => {
    const names = Object.keys(await import(new URL(file, KIT).href));
    const missing = names.filter((n) => !mentions(n));
    assert.deepEqual(missing, [], `${file} exports names the README does not mention`);
  });

  test(`README.md has a section for ${file}`, () => {
    assert.match(readme, new RegExp('^### `' + file.replace('.', '\\.') + '`', 'm'));
  });
}

test('README.md lists every common ctx field, the per-kind fields and the formats', () => {
  const common = ['style', 'format', 'deck', 'unit', 'random', 'spring', 'boil', 'ease', 'afterSettle', 'seeded'];
  for (const f of common) assert.match(readme, new RegExp('`ctx\\.' + f + '\\b'), `ctx.${f}`);
  for (const f of ['params', 'u', 'd', 'scene', 'settle', 'presses', 'from', 'to', 'policy', 'box', 'locate', 'metaOf', 'kindOf', 'islandRest', 'state', 'at', 'host', 'toHost']) {
    assert.match(readme, new RegExp('`ctx\\.' + f + '\\b'), `ctx.${f}`);
  }
  assert.match(readme, /`ctx\.format`: `9x16`, `4x5`, `1x1` or `16x9`/);
  assert.match(readme, /`ctx\.unit`: SPEC §12: 168, 160, 152, 136 \(a 16x9 deck 128\)/);
});
