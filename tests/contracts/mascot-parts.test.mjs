// Any mascot, within a contract: a brand's character may add named extra parts (ears, a tail, an
// antenna, a hat, wings, a held prop) as path data with an anchor, a layer, a swing and a colour;
// it may float with no legs, have no arms, wear a screen face (a rounded plate behind its eyes), and
// a brand may carry a cast of further characters a beat names with `who`. Compose carries all of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { compose } from '../../scripts/compose.mjs';

const v = validators();
const read = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const linen = read('styles/brands/linen.json');
const errs = () => JSON.stringify(v.brand.errors);

const figure = {
  box: [8, 10],
  ground: [0, 0],
  views: { front: { body: 'M-4 0 C-4 -8 4 -8 4 0 Z', face: { cx: 0, cy: -5, gap: 2.4, size: 1, plate: { w: 5, h: 3.2, r: 0.8, y: 0.5 } }, limbs: [] } },
  float: 1.5,
  parts: {
    body: 'accent', plate: 'ink',
    tail: { d: 'M-4 -2 C-6 -2 -6 -5 -5 -6', anchor: [-4, -2], layer: 'back', swing: 1, color: { role: 'accent', mix: 'ink', share: 0.2 } },
    antenna: { d: 'M0 -7 L0 -9.5', anchor: [0, -7], swing: 0.8, color: 'line', stroke: 0.3 },
  },
};
const brand = (mascot) => ({ ...linen, mascot });

test('a mascot may add named extra parts beside its colours, float, and wear a screen face', () => {
  assert.ok(v.brand(brand(figure)), errs());
  assert.ok(v.brand(brand({ ...figure, parts: { hat: { d: 'M-2 -8 H2 V-9 H-2 Z', anchor: [0, -8] } } })), `only d and anchor are required: ${errs()}`);
});

test('an extra part refuses markup, a missing anchor, an unknown layer, a colour that is not a role and unknown keys', () => {
  const part = (p) => brand({ ...figure, parts: { ear: p } });
  assert.equal(v.brand(part({ d: '<script>', anchor: [0, 0] })), false, 'path data only');
  assert.equal(v.brand(part({ d: 'M0 0 L1 1' })), false, 'an anchor is required');
  assert.equal(v.brand(part({ d: 'M0 0 L1 1', anchor: [0, 0], layer: 'top' })), false, 'back or front');
  assert.equal(v.brand(part({ d: 'M0 0 L1 1', anchor: [0, 0], color: '#ff0000' })), false, 'a role or a blend of roles');
  assert.equal(v.brand(part({ d: 'M0 0 L1 1', anchor: [0, 0], swing: 9 })), false, 'swing 0 to 2');
  assert.equal(v.brand(part({ d: 'M0 0 L1 1', anchor: [0, 0], href: 'x.svg' })), false, 'no unknown keys');
  assert.equal(v.brand(brand({ ...figure, parts: { 'Bad Name!': { d: 'M0 0 L1 1', anchor: [0, 0] } } })), false, 'a plain name');
  assert.equal(v.brand(brand({ ...figure, parts: { body: { d: 'M0 0 L1 1', anchor: [0, 0] } } })), false, 'a colour name stays a colour');
});

test('float, the plate and the cast are bounded', () => {
  assert.equal(v.brand(brand({ ...figure, float: -1 })), false);
  assert.equal(v.brand(brand({ ...figure, float: 40 })), false);
  const plate = (p) => brand({ ...figure, views: { front: { ...figure.views.front, face: { ...figure.views.front.face, plate: p } } } });
  assert.equal(v.brand(plate({ w: 0, h: 2 })), false, 'a plate has a size');
  assert.equal(v.brand(plate({ w: 4, h: 2, fill: 'red' })), false, 'no unknown plate keys');
  assert.ok(v.brand(brand({ ...figure, cast: { cat: figure, robot: { ...figure, float: 0 } } })), errs());
  assert.equal(v.brand(brand({ ...figure, cast: { cat: { ...figure, cast: { kit: figure } } } })), false, 'a cast member has no cast of its own');
  assert.equal(v.brand(brand({ ...figure, cast: { 'Big Cat': figure } })), false, 'a plain name');
  assert.equal(v.brand(brand({ ...figure, cast: { cat: { box: [8, 10] } } })), false, 'a cast member is a whole character');
});

test('compose carries extra parts, float, plates and the cast into the style, and the style schema accepts them', () => {
  const mascot = { ...figure, cast: { robot: { ...figure, float: 0 } } };
  const dir = mkdtempSync(join(tmpdir(), 'mm-cast-'));
  try {
    const file = join(dir, 'cast.json');
    writeFileSync(file, JSON.stringify({ ...linen, name: 'cast', mascot }));
    const style = compose({ brand: file, motion: 'calm', from: { brand: 'cast.json', motion: 'styles/motion/calm.json' } });
    assert.deepEqual(style.mascot, mascot);
    assert.ok(v.style(style), JSON.stringify(v.style.errors));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the fictional cast fixture validates: a droplet, a cat-like animal and a small robot', () => {
  const b = read('fixtures/mascot/brand.json');
  assert.ok(v.brand(b), errs());
  assert.equal(b.fictional, true);
  assert.deepEqual(Object.keys(b.mascot.cast).sort(), ['cat', 'robot']);
  assert.equal((b.mascot.views.front.limbs ?? []).length, 0, 'the droplet has no limbs');
  assert.ok(b.mascot.float > 0, 'the droplet floats');
  const cat = b.mascot.cast.cat, robot = b.mascot.cast.robot;
  assert.equal(cat.views.front.limbs.filter((L) => L.kind === 'leg').length, 4, 'four short legs');
  for (const name of ['ear-left', 'ear-right', 'tail']) assert.ok(cat.parts[name]?.d, `the cat has a ${name}`);
  assert.ok(robot.views.front.face.plate, 'a screen face');
  assert.ok(robot.parts.antenna?.d, 'an antenna');
  assert.equal(robot.views.front.limbs.filter((L) => L.kind === 'arm').length, 2, 'arms');
});
