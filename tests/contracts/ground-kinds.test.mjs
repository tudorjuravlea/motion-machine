// Ground kinds and the glass surface in the contracts: a brand's ground may be blobs (as before),
// a bloom, graph-paper or dots, drawn in palette roles only; a brand may carry a `surface` block.
// Every old ground stays valid, the kinds refuse each other's blocks, and compose carries both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { compose } from '../../scripts/compose.mjs';

const v = validators();
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const paper = read('styles/brands/paper.json');
const blobs = { blobs: [{ color: '#2a9d8f', x: -0.17, y: -0.16, w: 0.7, h: 0.52, alpha: 0.85 }], blur: 0.11 };
const ok = (ground) => v.brand({ ...paper, ground });
const why = () => JSON.stringify(v.brand.errors);

test('every ground written before kinds existed stays valid', () => {
  assert.ok(ok(blobs), why());
  assert.ok(ok({ ...blobs, kind: 'blobs' }), why());
  assert.ok(ok({ ...blobs, mark: { src: 'assets/mark.svg', width: 1.9, alpha: 0.08 } }), why());
  assert.equal(ok({ blur: 0.1 }), false, 'blobs still need their blobs');
  assert.equal(ok({ blobs: blobs.blobs }), false, 'and their blur');
  assert.equal(ok({ kind: 'blobs' }), false);
});

test('a bloom, a graph-paper and a dots ground need no other field, and take their own block', () => {
  assert.ok(ok({ kind: 'bloom' }), why());
  assert.ok(ok({ kind: 'dots' }), why());
  assert.ok(ok({ kind: 'graph-paper' }), why());
  assert.ok(ok({ kind: 'bloom', bloom: { role: 'accent', width: 1.4, height: 0.8, strength: 0.4 }, dots: { role: 'line', spacing: 0.03, size: 0.1, strength: 0.5 } }), why());
  assert.ok(ok({ kind: 'graph-paper', grid: { role: 'line', spacing: 0.02, every: 4, weight: 0.0008, strength: 0.6, drift: 0.01, cycle: 8, scan: { role: 'accent', size: 0.2, strength: 0.1 } } }), why());
  assert.ok(ok({ kind: 'dots', dots: { spacing: 0.04 }, mark: { src: 'assets/mark.svg', width: 1, alpha: 0.05 } }), why());
});

test('a newer kind is drawn in roles, so it takes no blob, no hex and no role the palette lacks', () => {
  assert.equal(ok({ kind: 'bloom', ...blobs }), false, 'blobs belong to the blobs kind');
  assert.equal(ok({ kind: 'bloom', bloom: { role: '#ff0000' } }), false, 'a role, not a colour');
  assert.equal(ok({ kind: 'bloom', bloom: { role: 'purple' } }), false);
  assert.equal(ok({ kind: 'graph-paper', grid: { role: 'tomato' } }), false);
  assert.equal(ok({ kind: 'dots', dots: { role: 'accent2' } }), false);
  assert.equal(ok({ kind: 'bloom', bloom: { color: '#ff0000' } }), false, 'no colour field at all');
  assert.equal(ok({ kind: 'plasma' }), false);
});

test('a kind refuses another kind\'s block, and a blobs ground refuses all of them', () => {
  assert.equal(ok({ kind: 'bloom', grid: {} }), false);
  assert.equal(ok({ kind: 'graph-paper', bloom: {} }), false);
  assert.equal(ok({ kind: 'graph-paper', dots: {} }), false);
  assert.equal(ok({ kind: 'dots', bloom: {} }), false);
  assert.equal(ok({ kind: 'dots', grid: {} }), false);
  assert.equal(ok({ ...blobs, bloom: {} }), false);
  assert.equal(ok({ ...blobs, dots: {} }), false);
});

test('sizes are shares of the frame and speeds are params, each within a sane range', () => {
  assert.equal(ok({ kind: 'bloom', bloom: { strength: 1.2 } }), false);
  assert.equal(ok({ kind: 'bloom', bloom: { width: 0 } }), false);
  assert.equal(ok({ kind: 'dots', dots: { spacing: 0.001 } }), false, 'a dot every pixel or two would be a stripe');
  assert.equal(ok({ kind: 'graph-paper', grid: { every: 1 } }), false);
  assert.equal(ok({ kind: 'graph-paper', grid: { every: 4.5 } }), false);
  assert.equal(ok({ kind: 'graph-paper', grid: { cycle: 0 } }), false);
  assert.equal(ok({ kind: 'graph-paper', grid: { cycle: 600 } }), false);
  assert.equal(ok({ kind: 'graph-paper', grid: { drift: 0.5 } }), false);
  assert.equal(ok({ kind: 'graph-paper', grid: { scan: { speed: 3 } } }), false, 'the scan sweeps once per cycle; its speed is the cycle');
});

test('a brand may carry a surface block, every field optional', () => {
  const s = (surface) => v.brand({ ...paper, surface });
  assert.ok(s({}), JSON.stringify(v.brand.errors));
  assert.ok(s({ tint: 0.55, blur: 0.014, saturate: 1.2, border: 0.9, highlight: 0.25, shadow: 0.5, shine: 0.2, angle: 14, shineWidth: 0.08 }), JSON.stringify(v.brand.errors));
  assert.ok(v.brand(paper), 'the surface stays optional');
  assert.equal(s({ tint: 1.5 }), false);
  assert.equal(s({ blur: 0.5 }), false);
  assert.equal(s({ color: '#ffffff' }), false, 'the glass is made of roles');
  assert.equal(s({ saturate: 5 }), false);
});

test('compose carries the ground kind and the surface block into the style, and the style accepts them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-ground-kinds-'));
  try {
    const ground = { kind: 'bloom', bloom: { strength: 0.4 }, dots: {} };
    const surface = { tint: 0.6, shine: 0.3 };
    const file = join(dir, 'glow.json');
    writeFileSync(file, JSON.stringify({ ...paper, name: 'glow', ground, surface }));
    const style = compose({ brand: file, motion: 'calm', from: { brand: 'glow.json', motion: 'styles/motion/calm.json' } });
    assert.deepEqual(style.ground, ground);
    assert.deepEqual(style.surface, surface);
    assert.ok(v.style(style), JSON.stringify(v.style.errors));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the shipped dark glass brand and its preset pass the schema, fictional, with a bloom ground and a surface', () => {
  const brand = read('styles/brands/obsidian.json');
  assert.ok(v.brand(brand), JSON.stringify(v.brand.errors));
  assert.equal(brand.fictional, true);
  assert.equal(brand.ground.kind, 'bloom');
  assert.ok(brand.surface, 'it sets the glass look');
  assert.equal(brand.patterns['data/stat-tile'].surface, 'glass', 'its cards are glass by default');
  assert.equal(brand.patterns['layouts/bento-3'].surface, 'glass');
  const preset = read('styles/presets/obsidian-premium.json');
  assert.ok(v.style(preset), JSON.stringify(v.style.errors));
  assert.equal(preset.fictional, true);
  assert.deepEqual(preset.from, { brand: 'styles/brands/obsidian.json', motion: 'styles/motion/premium.json' });
  assert.deepEqual(compose({ brand: 'obsidian', motion: 'premium' }), preset, 'the preset is what compose writes');
});
