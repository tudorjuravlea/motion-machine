// Every ease, spring and stagger the kit had before the motion maths grew keeps its exact values:
// tests/kit/motion-baseline.json was taken from the kit before ease families, spring velocity,
// inertia and stagger v2 existed, and these assertions compare bit for bit (deepEqual on the numbers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEasing } from '../../runtime/kit/ease.js';
import { spring } from '../../runtime/kit/springs.js';
import { stagger, clip } from '../../runtime/kit/schedule.js';

const base = JSON.parse(readFileSync(new URL('./motion-baseline.json', import.meta.url), 'utf8'));

test('every existing ease keeps its exact values and its overshoot', () => {
  for (const [name, want] of Object.entries(base.ease)) {
    const f = parseEasing(name);
    assert.deepEqual(base.ps.map((p) => f(p)), want, name);
    assert.deepEqual(base.ps.map((p) => f.maxUpTo(p)), base.over[name], `${name} maxUpTo`);
  }
});

test('every existing spring keeps its exact trajectory, settle time and overshoot', () => {
  for (const [name, p] of Object.entries(base.params)) {
    assert.deepEqual(base.ts.map((t) => spring(t, p)), base.spring[name], name);
    assert.equal(spring.settle(p), base.settle[name], `${name} settle`);
    assert.equal(spring.overshoot(p), base.overshoot[name], `${name} overshoot`);
  }
});

test('every existing stagger keeps its exact offsets', () => {
  const items = Array.from({ length: 7 }, () => clip(0.4));
  const opts = {
    '{"from":"first"}': { from: 'first' },
    '{"from":"center"}': { from: 'center' },
    '{"from":"last"}': { from: 'last' },
    '{"from":"index","index":2}': { from: 'index', index: 2 },
    '{"from":"first","cap":0.4}': { from: 'first', cap: 0.4 },
    'center-square': { from: 'center', ease: (x) => x * x },
  };
  for (const [key, o] of Object.entries(opts)) assert.deepEqual(stagger(0.1, items, o).offsets, base.stagger[key], key);
});
