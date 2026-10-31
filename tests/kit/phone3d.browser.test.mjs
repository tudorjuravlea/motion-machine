// 3d/phone: a Three.js phone whose screen texture is copied, after the seek's
// decodes, from a hidden 2D screen the screen fold drives. The frame drawn is the one for t,
// the same t gives the same pixels in any seek order, and a deck rest faces the viewer.
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
const open = (story = 'phone3d', format = '9x16') => openPiece(PAGE, { server, browser, format, query: { story } });
const startOf = (sched, scene) => sched.items.find((it) => it.scene === scene && !it.parent && it.beat?.slot === 'stage').start;
const canvasOf = (page, scene) => page.evaluate((id) => { const c = document.querySelector(`[data-scene="${id}"] canvas[data-3d]`); return c ? { frame: c.dataset.frame ?? null, ry: Number(c.dataset.ry), w: c.width, h: c.height } : null; }, scene);

test('the screen texture is drawn from the sequence frame for t, after its decode', async () => {
  const o = await open();
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'seq');
    await o.mm.seek(t0 + 1.5);
    const c = await canvasOf(o.page, 'seq');
    assert.ok(c && c.w > 0, 'no 3D canvas');
    assert.equal(c.frame, 'assets/rec/f00046.jpg');
    const img = decodePng(await framePng(o.page, t0 + 1.5));
    const colours = new Set();
    for (let i = 0; i < img.data.length; i += 4 * 211) colours.add((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]);
    assert.ok(colours.size > 40, 'the 3D phone drew nothing');
  } finally { await o.close(); }
});

test('the same t gives the same pixels in any seek order', async () => {
  const o = await open(), f = await open();
  try {
    const sched = (await o.mm.meta()).schedule;
    const t = startOf(sched, 'page') + 1.1;
    await framePng(o.page, t - 2.2); await framePng(o.page, t + 0.9);
    const a = await framePng(o.page, t), b = await framePng(f.page, t);
    assert.ok(a.equals(b), 'the 3D frame depends on the seek before it');
  } finally { await o.close(); await f.close(); }
});

test('a deck rest shows the phone facing the viewer', async () => {
  const o = await open('phone3d-deck', '16x9');
  try {
    await o.mm.seek(1);
    const c = await canvasOf(o.page, 'd');
    assert.ok(Math.abs(c.ry) < 1e-6, `rotation at rest ${c.ry}`);
  } finally { await o.close(); }
});

// drawn: lines first, the 3D phone hidden behind them; a band reveals the phone; then it stands up
const drawnState = (page) => page.evaluate(() => {
  const c = document.querySelector('[data-scene="drawn"] canvas[data-3d]'), l = document.querySelector('[data-scene="drawn"] canvas.drawn__lines');
  let ink = 0;
  if (l && l.style.display !== 'none') {
    const d = l.getContext('2d').getImageData(0, 0, l.width, l.height).data;
    for (let i = 3; i < d.length; i += 4 * 7) if (d[i] > 0) ink++;
  }
  return { phase: c?.dataset.drawn ?? null, shown: c?.style.visibility !== 'hidden', lines: !!l && l.style.display !== 'none', ink, ry: Number(c?.dataset.ry) };
});

test('drawn: the phone is lines alone, then the band reveals it, then it stands facing the viewer', async () => {
  const o = await open('phone3d-drawn', '16x9');
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'drawn');
    await o.mm.seek(t0 + 1.8);
    let s = await drawnState(o.page);
    assert.equal(s.phase, 'draw');
    assert.ok(s.lines && s.ink > 200, `no lines drawn (${s.ink})`);
    assert.equal(s.shown, false, 'the 3D phone shows before the band');
    await o.mm.seek(t0 + 3.9);
    s = await drawnState(o.page);
    assert.equal(s.phase, 'reveal');
    assert.ok(s.lines && s.shown, 'during the band both the lines and the phone show');
    await o.mm.seek(t0 + 7.5);
    s = await drawnState(o.page);
    assert.equal(s.lines, false, 'the lines are gone once the phone stands');
    assert.ok(Math.abs(s.ry + 0.16) < 0.06, `the phone rests near its hero angle (${s.ry})`);
  } finally { await o.close(); }
});

test('drawn: the same t gives the same pixels in any seek order, lines and band included', async () => {
  const o = await open('phone3d-drawn', '16x9'), f = await open('phone3d-drawn', '16x9');
  try {
    const t = startOf((await o.mm.meta()).schedule, 'drawn') + 3.85;
    await framePng(o.page, t + 2); await framePng(o.page, t - 2.5);
    const a = await framePng(o.page, t), b = await framePng(f.page, t);
    assert.ok(a.equals(b), 'the drawn frame depends on the seek before it');
  } finally { await o.close(); await f.close(); }
});
