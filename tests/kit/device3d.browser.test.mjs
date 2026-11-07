// The polished 3D devices: 3d/phone takes the built-in phone's slab, rim, keys and
// cutouts, a showcase half-turn joins hero, turntable and still, and 3d/laptop matches it with a
// lid on a hinge. Poses are pure functions of p and u; a deck rest faces the viewer, lid open.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';
import { PAGE, mediaAssets } from './media-assets.mjs';

let server, browser;
before(async () => {
  mediaAssets('rec', 'site');
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); });
const open = (story = 'device3d', format = '16x9') => openPiece(PAGE, { server, browser, format, query: { story } });
const startOf = (sched, scene) => sched.items.find((it) => it.scene === scene && !it.parent && it.beat?.slot === 'stage').start;
const canvasAt = async (o, scene, t) => {
  await o.mm.seek(t);
  await o.page.evaluate(() => window.mm.settle?.());
  return o.page.evaluate((id) => { const c = document.querySelector(`[data-scene="${id}"] canvas[data-3d]`); return c ? { ...c.dataset, ry: Number(c.dataset.ry), lid: Number(c.dataset.lid), w: c.width } : null; }, scene);
};

test('showcase: the phone starts with its back to the viewer and turns half a turn to face it', async () => {
  const o = await open();
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'show');
    const a = await canvasAt(o, 'show', t0), b = await canvasAt(o, 'show', t0 + 1.2), m = await canvasAt(o, 'show', t0 + 2.2), z = await canvasAt(o, 'show', t0 + 4);
    assert.ok(Math.abs(a.ry + Math.PI) < 0.01, `start ${a.ry}`);
    assert.equal(a.face, 'back');
    assert.ok(a.ry < b.ry && b.ry < m.ry && m.ry < z.ry, `not turning toward the viewer: ${a.ry} ${b.ry} ${m.ry} ${z.ry}`);
    assert.equal(z.ry, 0);
    assert.equal(z.face, 'front');
  } finally { await o.close(); }
});

test('the phone builds the cutout its model names, and the island by default', async () => {
  const o = await open();
  try {
    const sched = (await o.mm.meta()).schedule;
    assert.equal((await canvasAt(o, 'punch', startOf(sched, 'punch') + 1)).cutout, 'punch');
    assert.equal((await canvasAt(o, 'show', startOf(sched, 'show') + 1)).cutout, 'island');
  } finally { await o.close(); }
});

test('the laptop opens its lid as it arrives and rests facing the viewer, its screen drawn', async () => {
  const o = await open();
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'lap');
    const a = await canvasAt(o, 'lap', t0 + 0.05), z = await canvasAt(o, 'lap', t0 + 3.5);
    assert.ok(a && a.w > 0, 'no 3D laptop canvas');
    assert.ok(a.lid > 1.2, `lid not near closed at the start: ${a.lid}`);
    assert.ok(z.lid < 0 && z.lid > -0.4, `lid not open at rest: ${z.lid}`);
    assert.ok(Math.abs(z.ry) < 0.08, `not facing at rest: ${z.ry}`);
    assert.equal(z.cutout, 'notch');
    const img = decodePng(await framePng(o.page, t0 + 3.5));
    const colours = new Set();
    for (let i = 0; i < img.data.length; i += 4 * 211) colours.add((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]);
    assert.ok(colours.size > 40, 'the 3D laptop drew nothing');
  } finally { await o.close(); }
});

test('laptop showcase turns half a turn with the lid open, chin model', async () => {
  const o = await open();
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'lapshow');
    const a = await canvasAt(o, 'lapshow', t0), z = await canvasAt(o, 'lapshow', t0 + 4);
    assert.ok(Math.abs(a.ry + Math.PI) < 0.01 && a.face === 'back', `start ${a.ry}`);
    assert.equal(z.ry, 0);
    assert.ok(a.lid < 0 && z.lid < 0, 'the lid should stay open through a showcase');
    assert.equal(z.cutout, 'chin');
  } finally { await o.close(); }
});

test('the same t gives the same laptop pixels in any seek order', async () => {
  const o = await open(), f = await open();
  try {
    const t = startOf((await o.mm.meta()).schedule, 'lap') + 1.1;
    await framePng(o.page, t - 1.0); await framePng(o.page, t + 1.4);
    const a = await framePng(o.page, t), b = await framePng(f.page, t);
    assert.ok(a.equals(b), 'the 3D laptop frame depends on the seek before it');
  } finally { await o.close(); await f.close(); }
});

test('a deck rest shows the laptop facing the viewer with its lid open', async () => {
  const o = await open('device3d-deck');
  try {
    const c = await canvasAt(o, 'd', 1);
    assert.ok(Math.abs(c.ry) < 1e-6, `rotation at rest ${c.ry}`);
    assert.ok(c.lid < 0, `lid at rest ${c.lid}`);
  } finally { await o.close(); }
});

test('a top bar sits on a captured page and on the laptop; a recording keeps its own', async () => {
  const o = await open();
  try {
    const sched = (await o.mm.meta()).schedule;
    const page = await canvasAt(o, 'page', startOf(sched, 'page') + 1);
    assert.equal(page.status, '10:24', 'the phone over a captured page shows its status bar with statusTime');
    const rec = await canvasAt(o, 'show', startOf(sched, 'show') + 4);
    assert.equal(rec.status, 'off', 'a recording carries its own status bar');
    const lap = await canvasAt(o, 'lap', startOf(sched, 'lap') + 3.5);
    assert.equal(lap.status, '10:00', 'the laptop shows a menu bar with the time');
    assert.equal(lap.browser, 'on', 'a captured page on a laptop sits in a browser window');
    assert.equal(page.browser, 'off', 'a phone shows a page without a desktop browser window');
  } finally { await o.close(); }
});

test('the top bar band keeps one colour while the page scrolls under it (no smear)', async () => {
  const o = await open();
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'page');
    const bands = [];
    for (const dt of [0.6, 1.0, 1.4, 1.8]) bands.push((await canvasAt(o, 'page', t0 + dt)).band);
    assert.ok(bands[0], 'no band colour recorded');
    assert.deepEqual(new Set(bands).size, 1, `the band changed while scrolling: ${bands.join(' ')}`);
  } finally { await o.close(); }
});
