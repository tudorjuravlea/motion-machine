// The look of the 3D stage (kit/look3d.js): its params read into a config, the tone mapping that
// sits in the materials, and the params both 3D devices carry for a brand to set once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOK_PARAMS, lookOf, toneMapped } from '../../runtime/kit/look3d.js';
import { THREE } from '../../runtime/kit/device3d.js';
import phone from '../../patterns/3d/phone/pattern.js';
import laptop from '../../patterns/3d/laptop/pattern.js';

const ROOT = new URL('../../', import.meta.url);

test('the defaults: ssaa4 in a render and msaa in a preview, light studio, glow on, the rest off (the contact shadow too: the key light\'s soft long shadow is the only one)', () => {
  const r = lookOf({}, true), p = lookOf({}, false);
  assert.equal(r.aa, 'ssaa4');
  assert.equal(p.aa, 'msaa');
  assert.equal(r.studio, 'light');
  assert.ok(r.glow > 0);
  assert.equal(r.contact, 0);
  assert.equal(r.occlusion, 0);
  assert.equal(r.reflection, 0);
  assert.equal(r.dof, 0);
  assert.equal(r.tilt, 0);
});

test('an explicit aa wins over the mode; an unknown one falls back; numbers clamp to 0..1', () => {
  assert.equal(lookOf({ aa: 'ssaa16' }, false).aa, 'ssaa16');
  assert.equal(lookOf({ aa: 'off' }, true).aa, 'off');
  assert.equal(lookOf({ aa: 'fxaa' }, true).aa, 'ssaa4');
  assert.equal(lookOf({ studio: 'neon' }).studio, 'light');
  const c = lookOf({ glow: 7, contact: -1, dof: 'x', occlusion: 0.25 });
  assert.equal(c.glow, 1);
  assert.equal(c.contact, 0);
  assert.equal(c.dof, 0);
  assert.equal(c.occlusion, 0.25);
});

test('every look param is on both 3D devices, with the default the table gives', () => {
  for (const mod of [phone, laptop]) {
    for (const [name, def] of Object.entries(LOOK_PARAMS)) {
      assert.deepEqual(mod.params[name], def, `${mod.name}: ${name}`);
      assert.ok(def.meaning.length > 20, `${name} says what it does`);
    }
  }
});

test('both pattern cards name the look params as brand knobs', () => {
  for (const d of ['phone', 'laptop']) {
    const card = readFileSync(new URL(`patterns/3d/${d}/PATTERN.md`, ROOT), 'utf8');
    const line = card.split('\n').find((l) => l.startsWith('Brand knobs:')) ?? '';
    for (const name of Object.keys(LOOK_PARAMS)) assert.ok(line.includes(name), `${d}: Brand knobs lacks ${name}`);
  }
});

test('toneMapped puts the tone mapping in the material, once, and leaves a toneMapped:false material alone', () => {
  const m = toneMapped(new THREE.MeshStandardMaterial());
  assert.equal(m.userData.neutral, true);
  const shader = { fragmentShader: 'void main() {\n#include <tonemapping_fragment>\n}' };
  m.onBeforeCompile(shader, null);
  assert.match(shader.fragmentShader, /mmNeutral\( gl_FragColor\.rgb \)/);
  assert.doesNotMatch(shader.fragmentShader, /#include <tonemapping_fragment>/);
  const hook = m.onBeforeCompile;
  assert.equal(toneMapped(m).onBeforeCompile, hook, 'a second call changes nothing');
  const screen = new THREE.MeshStandardMaterial({ toneMapped: false });
  toneMapped(screen);
  assert.equal(screen.userData.neutral, undefined);
});

test('the look keeps no clock and no platform random in its own source', () => {
  for (const f of ['look3d.js', 'dof3d.js', 'floor3d.js']) {
    assert.doesNotMatch(readFileSync(new URL(`runtime/kit/${f}`, ROOT), 'utf8'), /\b(Date|performance\.now|setTimeout|requestAnimationFrame|Math\.random)\b/, f);
  }
});
