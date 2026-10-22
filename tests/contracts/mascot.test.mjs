// Brand mascot: an optional brand block that describes a character the rig can draw and act
// (views as silhouette paths in the character's own unit, a face frame, limb anchors with a layer,
// part colours as palette roles or blends of two roles, the ground point, the moods and faces the
// brand allows). Compose carries it into the style and the style schema accepts it. Two shipped
// brands carry one: a round character and a block character, both invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { compose } from '../../scripts/compose.mjs';
import { MOODS, EYES, MOUTHS, ROLES, VIEWS } from '../../runtime/kit/rig.js';

const v = validators();
const read = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const linen = read('styles/brands/linen.json');
const schema = read('contracts/brand.schema.json');

const mascot = {
  box: [8, 10],
  ground: [0, 0],
  views: {
    front: {
      body: 'M-4 -2 C-4 -8 4 -8 4 -2 Z',
      face: { cx: 0, cy: -5, gap: 2.6, size: 1 },
      limbs: [
        { kind: 'arm', x: -3.6, y: -4, length: 2, width: 0.9, side: 'left', layer: 'back' },
        { kind: 'leg', x: 1.5, y: -2, width: 1, side: 'right', layer: 'back' },
      ],
    },
    back: { body: 'M-4 -2 C-4 -8 4 -8 4 -2 Z', face: null },
  },
  parts: { body: 'accent', shade: { role: 'accent', mix: 'ink', share: 0.3 }, eyes: 'ink' },
  outline: 1,
  moods: ['calm', 'happy'],
  faces: { eyes: ['dot', 'arc'], mouths: ['none', 'smile'] },
};
const errs = () => JSON.stringify(v.brand.errors);

test('a brand may carry a mascot, and the mascot stays optional', () => {
  assert.ok(v.brand({ ...linen, mascot }), errs());
  assert.ok(v.brand({ ...linen, mascot: { box: [6, 9], ground: [0, 0], views: { front: { body: 'M0 0 L1 1 Z' } } } }), `only box, ground and the front view are required: ${errs()}`);
  assert.ok(v.brand(linen), 'mascot stays optional');
});

test('a mascot refuses a missing front view, a colour that is not a role, a path with anything but path data, and unknown keys', () => {
  assert.equal(v.brand({ ...linen, mascot: { ...mascot, views: { side: mascot.views.front } } }), false, 'front is required');
  assert.equal(v.brand({ ...linen, mascot: { ...mascot, parts: { body: '#ff0000' } } }), false, 'a part colour is a role, never a hex');
  assert.equal(v.brand({ ...linen, mascot: { ...mascot, parts: { body: { role: 'accent', mix: 'gold', share: 0.2 } } } }), false, 'a blend is of two roles');
  assert.equal(v.brand({ ...linen, mascot: { ...mascot, parts: { body: { role: 'accent', mix: 'ink', share: 1.5 } } } }), false, 'a share is 0 to 1');
  assert.equal(v.brand({ ...linen, mascot: { ...mascot, views: { front: { body: 'M0 0 url(x)' } } } }), false, 'path data only');
  assert.equal(v.brand({ ...linen, mascot: { ...mascot, views: { front: { body: '<script>' } } } }), false, 'no markup in a path');
  assert.equal(v.brand({ ...linen, mascot: { ...mascot, logo: 'x.svg' } }), false, 'no unknown keys');
  assert.equal(v.brand({ ...linen, mascot: { ...mascot, moods: ['furious'] } }), false, 'a mood the rig knows');
  assert.equal(v.brand({ ...linen, mascot: { ...mascot, faces: { eyes: ['laser'] } } }), false, 'an eye shape the rig knows');
  assert.equal(v.brand({ ...linen, mascot: { ...mascot, views: { front: { ...mascot.views.front, limbs: [{ kind: 'tail', x: 0, y: 0, width: 1 }] } } } }), false, 'arms and legs only');
});

test('a mascot path keeps its numbers in the box\'s range: no number of four or more digits before the point, no exponent', () => {
  const withBody = (body) => ({ ...linen, mascot: { ...mascot, views: { front: { ...mascot.views.front, body } } } });
  for (const body of ['M-100000 -100000 H100000 V100000 H-100000 Z', 'M0 0 H1000 V-2 Z', 'M0 0 L1e9 0 Z', 'M0 0 L2E3 1 Z', 'M0 0 L0 -1234.5 Z']) {
    assert.equal(v.brand(withBody(body)), false, `refused: ${body}`);
  }
  for (const body of ['M-4 -2 C-4 -8 4 -8 4 -2 Z', 'M-999.99 0 L.5.5 -0.25 Z', 'm0 0 l1.5-2.25 h-3z']) assert.ok(v.brand(withBody(body)), `accepted: ${body}: ${errs()}`);
});

test('the schema and the rig name the same moods, eye shapes, mouths, roles and views', () => {
  const m = schema.properties.mascot;
  assert.deepEqual(m.properties.moods.items.enum, MOODS);
  assert.deepEqual(m.properties.faces.properties.eyes.items.enum, EYES);
  assert.deepEqual(m.properties.faces.properties.mouths.items.enum, MOUTHS);
  assert.deepEqual(Object.keys(m.properties.views.properties), VIEWS);
  assert.deepEqual(schema.$defs.role.enum, ROLES);
  assert.deepEqual(ROLES, Object.keys(read('styles/brands/paper.json').color), 'the seven palette roles');
});

test('compose carries the brand mascot into the style, and the style schema accepts it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-mascot-'));
  try {
    const file = join(dir, 'pebble.json');
    writeFileSync(file, JSON.stringify({ ...linen, name: 'pebble', mascot }));
    const style = compose({ brand: file, motion: 'calm', from: { brand: 'pebble.json', motion: 'styles/motion/calm.json' } });
    assert.deepEqual(style.mascot, mascot);
    assert.ok(v.style(style), JSON.stringify(v.style.errors));
    const plain = compose({ brand: 'linen', motion: 'calm' });
    assert.equal('mascot' in plain, false, 'a brand without a mascot composes without one');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('two shipped brands carry an invented mascot: paper a round one, nocturne a block one', () => {
  const paper = read('styles/brands/paper.json'), nocturne = read('styles/brands/nocturne.json');
  for (const [name, b] of [['paper', paper], ['nocturne', nocturne]]) {
    assert.ok(v.brand(b), `${name}: ${errs()}`);
    assert.equal(b.fictional, true);
    assert.ok(b.mascot?.views?.front?.body, `${name} has a mascot`);
  }
  // round: the front body has curves and no straight edges; block: straight edges and corner curves
  assert.match(paper.mascot.views.front.body, /C/);
  assert.doesNotMatch(paper.mascot.views.front.body, /[HV]/);
  assert.match(nocturne.mascot.views.front.body, /[HV]/);
  assert.ok(nocturne.mascot.views.threeQuarter?.strip, 'the block shows a side strip in its 3/4 view');
});
