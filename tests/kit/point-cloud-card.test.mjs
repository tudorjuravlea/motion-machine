// 3d/point-cloud's card and header say what the code does: plain quads, a measured export cost
// against 3d/particles-to-shape, a free-floating object (no rectangle) with its reveal and living rest,
// and the params the code reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, '../../patterns/3d/point-cloud');
const card = readFileSync(join(dir, 'PATTERN.md'), 'utf8'), code = readFileSync(join(dir, 'pattern.js'), 'utf8');

test('no instanced quads anywhere: the drawing is plain quads, four vertices per point', () => {
  assert.doesNotMatch(card, /instanced quads/i);
  assert.doesNotMatch(code.split('\n').filter((l) => l.trim().startsWith('//')).join('\n'), /instanced quads/i);
  assert.match(card, /plain quads \(four vertices per point\)/);
});

test('the export cost is a measured ratio against 3d/particles-to-shape, per frame', () => {
  assert.match(card, /about [\d.]+(–[\d.]+)?× the export time of `3d\/particles-to-shape` per frame \(measured/);
});

test('the card describes a free-floating object: no rectangle, a seed, a burst, a front, a living rest', () => {
  for (const s of [/no rectangle/, /seed/, /burst/, /front/, /twinkl/, /sway/]) assert.match(card, s);
  assert.doesNotMatch(card, /SSIM/, 'the rest is an object, not the picture itself');
  assert.doesNotMatch(card, /`land`/, 'land is not a param');
});

test('every param the code declares has a row on the card, with its default', () => {
  const mod = code.slice(code.indexOf('const params = {'), code.indexOf('const read ='));
  const names = [...mod.matchAll(/^\s{2}(\w+): \{ type: '(\w+)'(?:, values: \[[^\]]*\])?, default: ([^,]+),/gm)];
  assert.ok(names.length >= 10, `params found: ${names.length}`);
  for (const [, name, , def] of names) {
    const row = card.split('\n').find((l) => l.startsWith(`| \`${name}\` |`));
    assert.ok(row, `a card row for ${name}`);
    const d = def.replace(/^'|'$/g, '');
    if (d) assert.ok(row.includes(d), `${name}: default ${d} on the card row: ${row}`);
  }
});
