// W-SCREEN-IDLE (SPEC §7): a device whose screen shows a still picture and runs no screen action for the whole scene is a camera
// move over a screenshot, not the product working. A device with no picture, a recording and a deck are not read.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gate, row } from './_harness.mjs';
import { variant, cleanup, scene } from './_variant.mjs';
import { withStubs } from './_stubs.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-SCREEN-IDLE'] };
const check = async (dir) => row(await run(dir, only), 'W-SCREEN-IDLE');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
/** The first scene's headline becomes a phone showing assets/app.png (a still), with the given screen actions. */
const phone = (screen, { asset = 'assets/app.png', fx = 'devices/phone' } = {}) => (v) => {
  mkdirSync(join(v.dir, 'assets'), { recursive: true });
  writeFileSync(join(v.dir, 'assets', 'app.png'), PNG);
  const b = scene(v.story, 'open').beats[0];
  Object.assign(b, { fx, ...(asset ? { asset } : {}), ...(screen ? { screen } : {}) });
  delete b.text;
  withStubs(v.dir, { 'devices/phone': null, '3d/phone': null, 'devices/laptop': null });
};
const make = (...a) => variant('_base/film', phone(...a));

test('a phone showing a still with no screen action for the whole scene warns, naming the device and the scene', async () => {
  const r = await check(make(null));
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.selector, '[data-scene="open"] [data-slot="headline"]');
  assert.equal(r.evidence.scene, 'open');
  assert.equal(r.evidence.asset, 'assets/app.png');
  assert.match(r.evidence.reason, /frozen/);
});

test('a screen action makes it pass, and the pass says how many screens it read', async () => {
  const r = await check(make([{ do: 'screen/tap', at: 1, params: { at: '40%,30%' } }]));
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.screens, 1);
  assert.equal(r.evidence.idle, 0);
});

test('a 3d device and a laptop are read the same way', async () => {
  assert.equal((await check(make(null, { fx: '3d/phone' }))).status, 'WARN');
  assert.equal((await check(make(null, { fx: 'devices/laptop' }))).status, 'WARN');
});

test('a device with no picture shows nothing frozen: SKIP, because nothing was measured', async () => {
  const r = await check(make(null, { asset: null }));
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /no picture/);
});

/** The first scene's phone shows the footage folder assets/app/ whose media.json is `meta`. */
const folder = (meta, screen = null) => variant('_base/film', (v) => {
  phone(screen, { asset: 'assets/app/' })(v);
  mkdirSync(join(v.dir, 'assets', 'app'), { recursive: true });
  writeFileSync(join(v.dir, 'assets', 'app', 'media.json'), JSON.stringify(meta));
});

test('a captured page is a still until an action moves it; a frame sequence plays', async () => {
  assert.equal((await check(folder({ kind: 'page', device: 'phone' }))).status, 'WARN');
  assert.equal((await check(folder({ kind: 'page', device: 'phone' }, [{ do: 'screen/scroll', at: 1, params: { to: 'A' } }]))).status, 'PASS');
  const seq = await check(folder({ kind: 'sequence', fps: 30, frames: 90 }));
  assert.equal(seq.status, 'PASS', JSON.stringify(seq.evidence));
});

test('a folder with no media.json cannot be read: SKIP', async () => {
  const r = await check(variant('_base/film', (v) => phone(null, { asset: 'assets/app/' })(v)));
  assert.equal(r.status, 'SKIP');
});

test('a film with no device is a SKIP', async () => assert.match((await check('_base/film')).evidence.reason, /no scene shows a device/));
test('a deck is a SKIP', async () => assert.match((await check('_base/deck')).evidence.reason, /deck/));
