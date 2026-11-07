// A brand can always be made more on brand: style.patterns sets defaults for any pattern's params
// (between the pattern's own defaults and a beat's params), and the brand's imagery, voice and music
// travel from the brand half into the composed style for the generators to read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { paramsOf } from '../../runtime/kit/params.js';
import { compose } from '../../scripts/compose.mjs';
import { validators } from '../../scripts/lib/validate.mjs';

const mod = { name: 'phone', group: '3d', params: { move: { type: 'enum(hero|still)', default: 'hero' }, metal: { default: 'aluminium' }, statusTime: { default: '10:00' } } };

test('a pattern param comes from the beat, else the brand, else the pattern', () => {
  const style = { patterns: { '3d/phone': { metal: 'titanium', statusTime: '9:41' } } };
  assert.deepEqual(paramsOf(mod, { statusTime: '12:00' }, style), { move: 'hero', metal: 'titanium', statusTime: '12:00' });
  assert.deepEqual(paramsOf(mod, {}, {}), { move: 'hero', metal: 'aluminium', statusTime: '10:00' });
  assert.deepEqual(paramsOf(mod, undefined, undefined), { move: 'hero', metal: 'aluminium', statusTime: '10:00' });
});

test('brand defaults only reach the pattern they name; an array of params works too', () => {
  const style = { patterns: { '3d/laptop': { metal: 'titanium' } } };
  assert.equal(paramsOf(mod, {}, style).metal, 'aluminium');
  const arr = { name: 'x', group: 'data', params: [{ name: 'k', default: 1 }] };
  assert.deepEqual(paramsOf(arr, {}, { patterns: { 'data/x': { k: 2 } } }), { k: 2 });
});

const brand = (extra) => ({ ...JSON.parse(readFileSync(new URL('../../styles/brands/linen.json', import.meta.url), 'utf8')), ...extra });

test('compose carries patterns, imagery, voice and music from the brand into the style, and the schema checks them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-brand-params-'));
  try {
    const b = brand({
      patterns: { '3d/phone': { metal: 'titanium' } },
      imagery: { style: 'soft daylight product photography, matte surfaces', mood: 'calm', avoid: 'neon, lens flare', references: ['ref.png'], tone: 'palette' },
      voice: { provider: 'elevenlabs', id: 'voice-123', language: 'ro', stability: 0.5 },
      music: { style: 'warm minimal piano and soft pads', avoid: 'vocals' },
    });
    writeFileSync(join(dir, 'brand.json'), JSON.stringify(b));
    const style = compose({ brand: join(dir, 'brand.json'), motion: 'premium', out: join(dir, 'style.json') });
    assert.deepEqual(style.patterns, { '3d/phone': { metal: 'titanium' } });
    assert.equal(style.voice.id, 'voice-123');
    assert.equal(style.music.style, 'warm minimal piano and soft pads');
    assert.equal(style.imagery.references[0], 'ref.png', 'a reference beside the brand stays relative to the composed file');
    const v = validators();
    assert.ok(v.brand(b), JSON.stringify(v.brand.errors));
    assert.ok(!v.brand(brand({ patterns: { phone: { metal: 'x' } } })), 'a pattern is named group/name');
    assert.ok(!v.brand(brand({ patterns: { '3d/phone': { metal: { deep: 1 } } } })), 'brand defaults are scalars');
    assert.ok(!v.brand(brand({ voice: { provider: 'acme', id: 'x' } })), 'a voice names a known provider');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
