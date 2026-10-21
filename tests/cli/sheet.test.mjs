// scripts/lib/sheet.mjs: a grid of PNG buffers becomes one captioned sheet whose geometry is the
// documented arithmetic (margins, gaps, tile width, label rows).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeSheet, pngSize } from '../../scripts/lib/sheet.mjs';
import { solidPng } from './cli-helpers.mjs';

test('five 16:9 tiles at 378 px in three columns: two rows, exact sheet size', async () => {
  const tiles = Array.from({ length: 5 }, (_, i) => ({ png: solidPng(192, 108, [40 * i, 90, 200 - 30 * i]), label: `tile ${i}` }));
  const s = await composeSheet(tiles, { columns: 3, tileWidth: 378, gap: 8, margin: 8, labelHeight: 26 });
  assert.equal(s.tiles.length, 5);
  assert.ok(s.tiles.every((t) => t.w === 378 && t.h === Math.round(108 * 378 / 192)));
  assert.equal(s.width, 8 * 2 + 3 * 378 + 2 * 8);
  assert.equal(s.height, 8 * 2 + 2 * (s.tiles[0].h + 26) + 8);
  assert.deepEqual(pngSize(s.png), { width: s.width, height: s.height });
  assert.deepEqual(s.tiles.map((t) => t.label), tiles.map((t) => t.label));
});

test('mixed aspect ratios share a row without overlapping the next row', async () => {
  const s = await composeSheet([{ png: solidPng(100, 200, [1, 2, 3]) }, { png: solidPng(200, 100, [4, 5, 6]) }, { png: solidPng(100, 100, [7, 8, 9]) }], { columns: 2, tileWidth: 100 });
  assert.ok(s.tiles[2].y >= s.tiles[0].y + s.tiles[0].h + 26, 'second row starts below the tallest tile and its label');
});

test('no tiles is an error; a non-PNG is refused', async () => {
  await assert.rejects(composeSheet([]), /no tiles/);
  await assert.rejects(composeSheet([{ png: Buffer.from('nope, not a png at all, really') }]), /not a PNG/);
});
