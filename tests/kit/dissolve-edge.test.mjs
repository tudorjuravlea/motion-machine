// transitions/dissolve-edge: the incoming scene is revealed where a seeded noise field lies under a level
// that rises with the cut; the moving edge of that reveal glows in a palette role. `levelOf` is the pure
// map from the cut's progress to the field's level (area revealed is about the progress), and `markup`
// builds the one SVG filter the incoming section wears: a turbulence field, a threshold, the glow band.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import dissolve, { levelOf, burnOf, markup, KNOTS } from '../../patterns/transitions/dissolve-edge/pattern.js';

test('the level rises with the cut from nothing revealed to everything revealed', () => {
  assert.ok(levelOf(0, 0.1) + 0.1 <= 0, 'at 0 not even the glow band reaches the field');
  assert.ok(levelOf(1, 0.1) >= 1, 'at 1 the whole field is under the level');
  let prev = -Infinity;
  for (let q = 0; q <= 1.0001; q += 0.02) { const l = levelOf(q, 0.1); assert.ok(l >= prev, `monotone at ${q}`); prev = l; }
});

test('the knots are a measured curve: strictly rising, one per tenth of the area', () => {
  assert.equal(KNOTS.length, 11);
  for (let i = 1; i < KNOTS.length; i++) assert.ok(KNOTS[i] > KNOTS[i - 1], `knot ${i}`);
});

test('the filter holds the seed, the frequency, the level and the glow colour, and no other colour', () => {
  const m = markup({ id: 'fx', w: 1080, h: 1920, seed: 41, freq: 0.004, octaves: 3, level: 0.5, width: 0.1, glow: '#35c3a0' });
  assert.match(m, /<filter id="fx"/);
  assert.match(m, /feTurbulence[^>]*seed="41"/);
  assert.match(m, /baseFrequency="0\.004"/);
  assert.match(m, /numOctaves="3"/);
  assert.match(m, /color-interpolation-filters="sRGB"/);
  assert.deepEqual([...m.matchAll(/#[0-9a-f]{6}\b/gi)].map((x) => x[0].toLowerCase()), ['#35c3a0']);
});

test('a wider glow band makes the outer ramp longer', () => {
  const slope = (w) => Number(/result="out"[\s\S]*?feFuncA[^>]*slope="(-?[\d.]+)"/.exec(markup({ id: 'fx', w: 100, h: 100, seed: 1, freq: 0.01, octaves: 2, level: 0.5, width: w, glow: '#ffffff' }))[1]);
  assert.ok(Math.abs(slope(0.05)) > Math.abs(slope(0.2)));
});

test('the edge kindles at the start of the cut and dies out at its end, so nothing of it outlives the reveal', () => {
  assert.equal(burnOf(0), 0);
  assert.equal(burnOf(1), 0);
  assert.equal(burnOf(0.5), 1);
  assert.ok(burnOf(0.05) > 0 && burnOf(0.05) < 1 && burnOf(0.95) > 0 && burnOf(0.95) < 1);
  assert.match(markup({ id: 'fx', w: 100, h: 100, seed: 1, freq: 0.01, octaves: 2, level: 0.5, width: 0.1, glow: '#ffffff', burn: 0.4 }), /feFuncA type="gamma" amplitude="0\.4"/);
});

test('the module is a slow transition with its params named, and the glow is a role', () => {
  assert.equal(dissolve.name, 'dissolve-edge');
  assert.equal(dissolve.group, 'transitions');
  for (const k of ['glow', 'width', 'scale', 'detail']) assert.ok(dissolve.params[k], k);
  assert.match(dissolve.params.glow.type, /accent/);
});
