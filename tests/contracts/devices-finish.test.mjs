// Brand devices.finish: an optional brand field naming the finish of
// device frames; compose carries it into the style, and the style schema accepts it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { compose } from '../../scripts/compose.mjs';

const v = validators();
const paper = JSON.parse(readFileSync(join(ROOT, 'styles/brands/paper.json'), 'utf8'));

test('a brand may name a device finish from the four, and nothing else', () => {
  for (const finish of ['graphite', 'silver', 'ink', 'canvas']) assert.ok(v.brand({ ...paper, devices: { finish } }), finish);
  assert.equal(v.brand({ ...paper, devices: { finish: 'gold' } }), false);
  assert.ok(v.brand(paper), 'devices stays optional');
});

test('compose carries the brand finish into the style', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-finish-'));
  try {
    const file = join(dir, 'silver.json');
    writeFileSync(file, JSON.stringify({ ...paper, name: 'silver', devices: { finish: 'silver' } }));
    const style = compose({ brand: file, motion: 'calm', from: { brand: 'silver.json', motion: 'styles/motion/calm.json' } });
    assert.deepEqual(style.devices, { finish: 'silver' });
    assert.ok(v.style(style));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
