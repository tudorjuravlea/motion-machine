// Brand ground: an optional brand field for what sits behind every scene, blurred blobs
// in the brand's own colours and a clipped mark. Compose carries it into the style, the style schema
// accepts it, and the palette G-BRAND checks against includes the blob colours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { compose } from '../../scripts/compose.mjs';
import { palette } from '../../scripts/check/_lib.mjs';

const v = validators();
const paper = JSON.parse(readFileSync(join(ROOT, 'styles/brands/paper.json'), 'utf8'));
const ground = {
  blobs: [
    { color: '#2a9d8f', x: -0.17, y: -0.16, w: 0.7, h: 0.52, alpha: 0.85 },
    { color: '#e9c46a', x: 0.6, y: 0.1, w: 0.83, h: 0.6, alpha: 0.55 },
  ],
  blur: 0.11,
  mark: { src: 'assets/mark.svg', width: 1.9, alpha: 0.08 },
};

test('a brand may carry a ground of blobs and a mark, and the ground stays optional', () => {
  assert.ok(v.brand({ ...paper, ground }), JSON.stringify(v.brand.errors));
  assert.ok(v.brand({ ...paper, ground: { blobs: ground.blobs, blur: 0.1 } }), 'the mark is optional');
  assert.ok(v.brand(paper), 'ground stays optional');
});

test('a ground refuses a colour that is not a hex, an alpha above 1, a URL mark and unknown keys', () => {
  assert.equal(v.brand({ ...paper, ground: { ...ground, blobs: [{ ...ground.blobs[0], color: 'blue' }] } }), false);
  assert.equal(v.brand({ ...paper, ground: { ...ground, blobs: [{ ...ground.blobs[0], alpha: 1.5 }] } }), false);
  assert.equal(v.brand({ ...paper, ground: { ...ground, mark: { ...ground.mark, src: 'https://example.com/m.svg' } } }), false);
  assert.equal(v.brand({ ...paper, ground: { ...ground, glow: true } }), false);
  assert.equal(v.brand({ ...paper, ground: { blobs: [], blur: 0.1 } }), false, 'a ground has at least one blob');
});

test('compose carries the ground into the style', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-ground-'));
  try {
    const file = join(dir, 'field.json');
    writeFileSync(file, JSON.stringify({ ...paper, name: 'field', ground }));
    const style = compose({ brand: file, motion: 'calm', from: { brand: 'field.json', motion: 'styles/motion/calm.json' } });
    assert.deepEqual(style.ground, ground);
    assert.ok(v.style(style), JSON.stringify(v.style.errors));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the palette includes the ground colours, named ground-<n>', () => {
  const p = palette({ color: paper.color, ground });
  assert.equal(p.get('42,157,143'), 'ground-0');
  assert.equal(p.get('233,196,106'), 'ground-1');
  for (const hex of Object.values(paper.color)) assert.ok([...p.values()].length >= 7, hex);
  assert.equal(palette({ color: paper.color }).size, new Set(Object.values(paper.color).map((h) => h.toLowerCase())).size);
});

test('a brand may give surfaceInk and composition.accentText; both stay optional and compose carries them', () => {
  const b = { ...paper, color: { ...paper.color, surfaceInk: '#191919' }, composition: { ...paper.composition, accentText: false } };
  assert.ok(v.brand(b), JSON.stringify(v.brand.errors));
  assert.equal(v.brand({ ...paper, color: { ...paper.color, surfaceInk: 'black' } }), false);
  assert.equal(v.brand({ ...paper, composition: { ...paper.composition, accentText: 'no' } }), false);
  const dir = mkdtempSync(join(tmpdir(), 'mm-text-'));
  try {
    const file = join(dir, 'text.json');
    writeFileSync(file, JSON.stringify({ ...b, name: 'text' }));
    const style = compose({ brand: file, motion: 'calm', from: { brand: 'text.json', motion: 'styles/motion/calm.json' } });
    assert.equal(style.color.surfaceInk, '#191919'); assert.equal(style.composition.accentText, false);
    assert.ok(v.style(style), JSON.stringify(v.style.errors));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
