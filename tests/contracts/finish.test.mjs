// brand.finish: an optional brand field for the surface look, five strengths
// from 0 to 1 (grain, halftone, vignette, edgeFringe, paperEdge). The brand and style schemas
// accept it, refuse values outside 0..1 and unknown keys, and compose carries it into the style.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { compose } from '../../scripts/compose.mjs';

const v = validators();
const paper = JSON.parse(readFileSync(join(ROOT, 'styles/brands/paper.json'), 'utf8'));
const finish = { grain: 0.6, halftone: 0.3, vignette: 0.8, edgeFringe: 0.4, paperEdge: 1 };

test('a brand may carry a finish of five strengths, each optional, and the finish stays optional', () => {
  assert.ok(v.brand({ ...paper, finish }), JSON.stringify(v.brand.errors));
  assert.ok(v.brand({ ...paper, finish: { grain: 0.4 } }), 'one strength alone');
  assert.ok(v.brand(paper), 'finish stays optional');
});

test('a finish refuses a strength outside 0..1 and unknown keys', () => {
  assert.equal(v.brand({ ...paper, finish: { grain: 1.2 } }), false);
  assert.equal(v.brand({ ...paper, finish: { vignette: -0.1 } }), false);
  assert.equal(v.brand({ ...paper, finish: { bloom: 0.5 } }), false);
});

test('compose carries the finish into the style, and the style schema accepts it', () => {
  const brandPath = join(ROOT, 'styles/brands/paper.json');
  const style = compose({ brand: brandPath, motion: 'calm' });
  assert.equal(style.finish, undefined, 'no finish, no field');
  const dir = mkdtempSync(join(tmpdir(), 'mm-finish-'));
  try {
    const p = join(dir, 'brand.json');
    writeFileSync(p, JSON.stringify({ ...paper, finish }));
    const carried = compose({ brand: p, motion: 'calm', from: { brand: 'styles/brands/paper.json', motion: 'styles/motion/calm.json' } });
    assert.deepEqual(carried.finish, finish);
    assert.ok(v.style(carried), JSON.stringify(v.style.errors));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
