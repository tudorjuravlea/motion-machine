// A style that names its ground mark by repo path (styles/grounds/…) keeps it when a tool scaffolds a page
// elsewhere: relativiseFonts rewrites the mark's src relative to the page, as it does for font files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { relativiseFonts } from '../../scripts/lib/cli.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const styleFile = join(ROOT, 'styles/presets/blueprint.json');

test('a repo-path ground mark is rewritten relative to the scaffolded page', () => {
  const style = JSON.parse(readFileSync(styleFile, 'utf8'));
  const pieceDir = join(ROOT, 'patterns/layouts/stat-hero/demo/out/.piece');
  const out = relativiseFonts(style, styleFile, pieceDir);
  assert.equal(out.ground.mark.src, '../../../../../../styles/grounds/draftline-grid.svg');
  assert.equal(style.ground.mark.src, 'styles/grounds/draftline-grid.svg', 'the input is not changed');
});

test('a mark already relative to its piece is left alone', () => {
  const style = { type: {}, ground: { blobs: [], blur: 0, mark: { src: 'assets/ground/grid.svg', width: 1, alpha: 0.1 } } };
  const out = relativiseFonts(style, styleFile, join(ROOT, 'pieces/x'));
  assert.equal(out.ground.mark.src, 'assets/ground/grid.svg');
});

test('a mark relative to the style file is rewritten relative to the scaffolded page', () => {
  const skillStyle = join(ROOT, 'styles/grounds/style/style.json');   // ../draftline-grid.svg from here is styles/grounds/draftline-grid.svg
  const style = { type: {}, ground: { blobs: [], blur: 0, mark: { src: '../draftline-grid.svg', width: 1, alpha: 0.1 } } };
  const out = relativiseFonts(style, skillStyle, join(ROOT, 'pieces/x'));
  assert.equal(out.ground.mark.src, '../../styles/grounds/draftline-grid.svg');
});
