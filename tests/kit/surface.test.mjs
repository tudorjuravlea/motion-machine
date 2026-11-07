// The glass surface (SPEC §3): the custom properties the brand's `surface` block becomes, made of
// palette roles only, and the one shine sweep on arrival, off the card at every rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURFACE_DEFAULTS, glass, glassRoles, shinePosition, surfaceSpec, surfaceVars } from '../../runtime/kit/surface.js';

const dark = { canvas: '#090B12', ink: '#EEF1F8' }, light = { canvas: '#FAFAF7', ink: '#23262B' };
const frame = { w: 1920 };

test('a missing surface block reads the defaults; a given field overrides one', () => {
  assert.deepEqual(surfaceSpec(undefined), SURFACE_DEFAULTS);
  assert.deepEqual(surfaceSpec({}), SURFACE_DEFAULTS);
  assert.equal(surfaceSpec({ tint: 0.2 }).tint, 0.2);
  assert.equal(surfaceSpec({ tint: 0.2 }).blur, SURFACE_DEFAULTS.blur);
});

test('light falls in the lighter of ink and canvas, shadow in the darker', () => {
  assert.deepEqual(glassRoles(dark), { light: 'ink', dark: 'canvas' });
  assert.deepEqual(glassRoles(light), { light: 'canvas', dark: 'ink' });
});

test('the vars are made of palette roles and nothing else: no hex, no rgb, no named colour', () => {
  for (const color of [dark, light]) {
    const vars = surfaceVars({}, frame, color);
    const all = Object.values(vars).join(' ');
    assert.doesNotMatch(all, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    for (const m of all.matchAll(/var\(--mm-color-(\w+)\)/g)) assert.ok(['surface', 'line', 'ink', 'canvas'].includes(m[1]), m[1]);
    assert.match(vars['--mm-surface-fill'], /var\(--mm-color-surface\)/, 'the tint is the surface role');
    assert.match(vars['--mm-surface-shadow'], /var\(--mm-color-line\)/, 'the hairline is the line role');
  }
  assert.match(surfaceVars({}, frame, dark)['--mm-surface-shadow'], /inset 0 \S+ 0 0 color-mix\(in srgb, var\(--mm-color-ink\)/, 'on a dark brand the top highlight is ink');
  assert.match(surfaceVars({}, frame, light)['--mm-surface-shadow'], /inset 0 \S+ 0 0 color-mix\(in srgb, var\(--mm-color-canvas\)/, 'on a light one it is canvas');
});

test('every look a brand may want to change is a field: tint, blur, saturation, hairline, highlight, shadow, shine', () => {
  const base = surfaceVars({}, frame, dark);
  for (const [k, v] of [['tint', 0.8], ['blur', 0.03], ['saturate', 1.4], ['border', 0.2], ['highlight', 0.7], ['shadow', 0.9], ['shine', 0.6], ['angle', 30], ['shineWidth', 0.2]]) {
    const other = surfaceVars({ [k]: v }, frame, dark);
    assert.notDeepEqual(other, base, k);
  }
  assert.equal(surfaceVars({ blur: 0.02 }, frame, dark)['--mm-surface-blur'], '38.4px', 'the blur is a share of the frame width');
  assert.equal(surfaceVars({ blur: 0.02 }, { w: 1080 }, dark)['--mm-surface-blur'], '21.6px');
  assert.equal(surfaceVars({ saturate: 1.3 }, frame, dark)['--mm-surface-saturate'], '1.3');
  assert.match(surfaceVars({ angle: 20 }, frame, dark)['--mm-surface-shine'], /^linear-gradient\(110deg/);
  assert.match(surfaceVars({ shine: 0 }, frame, dark)['--mm-surface-shine'], /^linear-gradient\(transparent, transparent\)$/, 'no shine: an empty layer');
});

test('the shine is off the card before the sweep, at the end and at every rest, and crosses it once in between', () => {
  assert.equal(shinePosition(0), null);
  assert.equal(shinePosition(0.3), null);
  assert.equal(shinePosition(1), null);
  const xs = [0.31, 0.45, 0.6, 0.75, 0.9, 0.99].map((q) => parseFloat(shinePosition(q)));
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] < xs[i - 1], 'the stripe\'s position falls as its bar moves right across the card');
  assert.ok(xs[0] > 90 && xs.at(-1) < 5, `from just off the left edge to just off the right: ${xs}`);
  assert.equal(shinePosition(0.6), shinePosition(0.6), 'pure');
  assert.notEqual(shinePosition(0.6, (p) => p * p), shinePosition(0.6), 'through the style\'s move ease');
});

test('a pattern opts in with glass(el, "glass") and out with anything else', () => {
  const attrs = new Map();
  const el = { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) };
  glass(el, 'glass');
  assert.deepEqual([...attrs.keys()].sort(), ['data-glass', 'data-surface']);
  assert.equal(attrs.get('data-surface'), 'glass');
  glass(el, 'flat');
  assert.equal(attrs.size, 0);
  glass(el, 'glass'); glass(el, undefined);
  assert.equal(attrs.size, 0);
});
