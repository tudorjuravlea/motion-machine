// W-GEN-BRAND (SPEC §7): a generated asset the story uses is off the current brand when its record's
// hash differs from the style's, or it was made with --brand off. Built by the test: a copy of the
// base film with one generated picture and its record.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brandHash } from '../../scripts/lib/brand-prompt.mjs';
import { offBrand, recordFor } from '../../scripts/check/W-GEN-BRAND.mjs';
import { NEG, gate, row, warnsOnly } from './_harness.mjs';

const run = gate();
const dir = join(NEG, '_base', `.tmp-genbrand-${process.pid}`);
const styleOf = () => JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8'));
const withImagery = (style, mood) => ({ ...style, imagery: { style: 'matte studio photography', mood, avoid: 'neon', tone: 'none' } });

before(() => {
  cpSync(join(NEG, '_base', 'film'), dir, { recursive: true, filter: (s) => !s.endsWith('/out') });
  const story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  story.scenes[0].beats[0].asset = 'assets/gen/hero.png';
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
  mkdirSync(join(dir, 'assets', 'gen'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'gen', 'hero.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  writeFileSync(join(dir, 'assets', 'gen', 'hero.licence.json'), JSON.stringify({ source: 'https://kie.ai', licence: 'generated' }));   // as mm gen writes it (W-ASSET-LICENSE)
});
after(() => rmSync(dir, { recursive: true, force: true }));

function record(sc) {
  writeFileSync(join(dir, 'assets', 'gen', 'hero.gen.json'), JSON.stringify({ version: 1, kind: 'image', name: 'hero', file: 'assets/gen/hero.png', ...sc }));
}
const gateRow = async () => row(await run(dir, { only: ['W-GEN-BRAND'] }), 'W-GEN-BRAND');

test('the record\'s name: a prepared folder and a file in assets/gen both find their record; anything else has none', () => {
  assert.equal(recordFor('assets/hero/'), 'assets/gen/hero.gen.json');
  assert.equal(recordFor('assets/gen/hero.png'), 'assets/gen/hero.gen.json');
  assert.equal(recordFor('assets/gen/vo.mp3'), 'assets/gen/vo.gen.json');
  assert.equal(recordFor('assets/gen/vo.words.json'), 'assets/gen/vo.gen.json');
  assert.equal(recordFor('assets/other.png'), null);
});

test('a piece with no generated assets passes', async () => {
  rmSync(join(dir, 'assets', 'gen', 'hero.gen.json'), { force: true });
  assert.equal((await gateRow()).status, 'PASS');
});

test('a record made under the current style passes', async () => {
  const style = withImagery(styleOf(), 'calm');
  writeFileSync(join(dir, 'style.json'), JSON.stringify(style));
  record({ brand: 'on', brandHash: brandHash('image', style) });
  assert.equal((await gateRow()).status, 'PASS');
});

test('a record whose hash differs from the current style warns, naming the asset and the command that brings it on brand', async () => {
  record({ brand: 'on', brandHash: brandHash('image', withImagery(styleOf(), 'calm')) });
  writeFileSync(join(dir, 'style.json'), JSON.stringify(withImagery(styleOf(), 'tense')));
  const r = await gateRow();
  assert.equal(r.status, 'WARN');
  assert.deepEqual(r.evidence.measured, ['assets/gen/hero.png']);
  assert.match(r.evidence.reason, /generated before the brand changed/);
  assert.match(r.evidence.reason, /mm gen image --piece .*--again hero/);
});

test('a record made with --brand off warns', async () => {
  record({ brand: 'off', brandHash: null });
  const r = await gateRow();
  assert.equal(r.status, 'WARN');
  assert.match(r.evidence.reason, /made with --brand off/);
});

test('in a whole gate run it is the only finding, and a warning never blocks (exit 0)', async () => {
  record({ brand: 'off', brandHash: null });
  warnsOnly(await run(dir), 'W-GEN-BRAND');
});

test('a transcript or an import is not steered and never warns; an unreadable record warns', async () => {
  record({ kind: 'import', brand: 'n/a', brandHash: null });
  assert.equal((await gateRow()).status, 'PASS');
  writeFileSync(join(dir, 'assets', 'gen', 'hero.gen.json'), '{ not json');
  const r = await gateRow();
  assert.equal(r.status, 'WARN');
  assert.match(r.evidence.reason, /cannot be read/);
});

test('offBrand is pure over a story, a style and a folder: only assets the story uses count', () => {
  record({ brand: 'off', brandHash: null });
  const style = styleOf();
  assert.equal(offBrand({ dir, story: { scenes: [{ beats: [{ asset: 'assets/gen/hero.png' }] }] }, style }).length, 1);
  assert.equal(offBrand({ dir, story: { scenes: [{ beats: [{ asset: 'assets/other.png' }] }] }, style }).length, 0);
});
