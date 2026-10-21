// motion.frameHold: with 2, each element's local time steps every 2/30 s ("on twos"), so
// two frames 1/60 s apart inside one step draw the same state, while cuts and camera moves stay
// smooth. With the default (1) every instant draws its own state. Story: tests/kit/media/effects.json.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (frameHold) => openPiece(PAGE, { server, browser, format: '9x16', query: { story: 'effects', ...(frameHold ? { frameHold } : {}) } });
const level = (o, t) => o.mm.seek(t).then(() => o.page.evaluate(() => document.querySelector('[data-scene="masked"] .mm-masked-fill')?.style.getPropertyValue('--mm-mf-p')));
const camera = (o, t) => o.mm.seek(t).then(() => o.page.evaluate(() => document.querySelector('[data-scene="explode"] .mm-camera').style.transform));

test('on twos: two instants inside one 2/30 s step draw the same entrance state; the next step moves on', async () => {
  const o = await open(2);
  try {
    const it = (await o.mm.meta()).schedule.items.find((x) => x.scene === 'masked' && !x.parent);
    const t0 = it.start + 0.4 + 0.001;                       // just inside a step boundary (0.4 = 6 × 2/30)
    assert.equal(await level(o, t0 + 1 / 60), await level(o, t0));
    assert.notEqual(await level(o, t0 + 2 / 30), await level(o, t0));
  } finally { await o.close(); }
});

test('on twos, report() gives the progress of the drawn step, not of the raw instant', async () => {
  const o = await open(2);
  try {
    const it = (await o.mm.meta()).schedule.items.find((x) => x.scene === 'masked' && !x.parent);
    const progress = async (t) => { await o.mm.seek(t); return (await o.mm.report()).elements.find((e) => e.selector === it.selector).progress; };
    const t0 = it.start + 0.4 + 0.001;
    assert.equal(await progress(t0 + 1 / 60), await progress(t0));
    assert.notEqual(await progress(t0 + 2 / 30), await progress(t0));
  } finally { await o.close(); }
});

test('by default every instant draws its own state', async () => {
  const o = await open(0);
  try {
    const it = (await o.mm.meta()).schedule.items.find((x) => x.scene === 'masked' && !x.parent);
    const t0 = it.start + 0.4 + 0.001;
    assert.notEqual(await level(o, t0 + 1 / 60), await level(o, t0));
  } finally { await o.close(); }
});

test('on twos, camera moves stay smooth', async () => {
  const o = await open(2);
  try {
    const sc = (await o.mm.meta()).schedule.scenes.find((s) => s.id === 'explode');
    const t0 = sc.start + 0.3 * (sc.end - sc.start) + 0.001;
    assert.notEqual(await camera(o, t0 + 1 / 60), await camera(o, t0));
  } finally { await o.close(); }
});
