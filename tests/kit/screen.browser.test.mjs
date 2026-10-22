// The screen layer in Chromium: a folder asset on a device is drawn
// by the kit's screen layer; a frame sequence shows the frame for t (an implicit play from the
// beat's arrival when no screen/play is given), decoded before pixels are read (settle), and the
// same t gives the same pixels in any seek order. Assets are prepared by the media CLIs in before().
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';
import { PAGE, mediaAssets } from './media-assets.mjs';

let server, browser;

before(async () => {
  mediaAssets('rec', 'site');
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); });
const open = (format = '9x16') => openPiece(PAGE, { server, browser, format, query: { story: 'screen' } });
const layerOf = (page, scene) => page.evaluate((id) => {
  const l = document.querySelector(`[data-scene="${id}"] .mm-screen`);
  if (!l) return null;
  return { own: l.hasAttribute('data-mm-own'), media: l.hasAttribute('data-media'), width: l.clientWidth,
    imgs: [...l.querySelectorAll('img.mm-screen__media, img.mm-screen__tile')].filter((i) => getComputedStyle(i.parentElement).visibility !== 'hidden').map((i) => ({ src: i.getAttribute('src'), w: i.naturalWidth, complete: i.complete, top: parseFloat(i.style.top || '0') })) };
}, scene);

test('a frame sequence shows the frame for t, decoded once settle resolves', async () => {
  const o = await open();
  try {
    const meta = JSON.parse(readFileSync(join(PAGE, 'assets/rec/media.json'), 'utf8'));
    const start = (await o.mm.meta()).schedule.items?.find?.((it) => it.scene === 'seq')?.start ?? 0.2;
    await o.mm.seek(start + 1.5);
    const l = await layerOf(o.page, 'seq');
    assert.ok(l, 'no screen layer'); assert.ok(l.own && l.media);
    assert.equal(l.imgs[0].src, 'assets/rec/f00046.jpg');
    assert.ok(l.imgs[0].complete); assert.equal(l.imgs[0].w, meta.w);
    await o.mm.seek(start + 9);   // past the clip: the scene is gone, so seek inside it near its end
    await o.mm.seek(start + 2.75);
    assert.equal((await layerOf(o.page, 'seq')).imgs[0].src, `assets/rec/f000${meta.frames}.jpg`, 'the last frame holds past the clip');
  } finally { await o.close(); }
});

test('the same t gives the same pixels in any seek order', async () => {
  const o = await open();
  try {
    const first = await framePng(o.page, 1.0);
    await framePng(o.page, 1.6); await framePng(o.page, 0.3); await framePng(o.page, 2.4);
    const again = await framePng(o.page, 1.0);
    assert.ok(first.equals(again), 'frame 1.0 differs after other seeks');
  } finally { await o.close(); }
});

test('a captured page draws its tiles from the top, each one it shows decoded', async () => {
  const o = await open();
  try {
    const sched = (await o.mm.meta()).schedule;
    const sc = sched.scenes.find((s) => s.id === 'page');
    await o.mm.seek(sc.end - 0.1);
    const l = await layerOf(o.page, 'page');
    const site = JSON.parse(readFileSync(join(PAGE, 'assets/site/media.json'), 'utf8'));
    assert.equal(l.imgs.length, site.tiles.length);
    assert.equal(l.imgs[0].top, 0);
    const k = l.width / site.viewport.w;
    assert.equal(l.imgs[1].top, Math.round(site.tiles[1].y * k), 'tile 2 sits right under tile 1');
    assert.ok(l.imgs.filter((i) => i.src).every((i) => i.complete && i.w > 0), 'every tile it shows is decoded');
  } finally { await o.close(); }
});

test('a captured page decodes only the tiles that overlap the visible window, inside settle', async () => {
  const o = await open();
  try {
    const sc = (await o.mm.meta()).schedule.scenes.find((s) => s.id === 'page');
    await o.mm.seek(sc.end - 0.1);
    const l = await layerOf(o.page, 'page');
    const site = JSON.parse(readFileSync(join(PAGE, 'assets/site/media.json'), 'utf8'));
    const k = l.width / site.viewport.w, h = await o.page.evaluate(() => document.querySelector('[data-scene="page"] .mm-screen').clientHeight);
    const want = site.tiles.map((t, i) => (t.y < h / k && t.y + t.h > 0 ? i : -1)).filter((i) => i >= 0);
    assert.ok(want.length < site.tiles.length, 'the fixture page is taller than one screen');
    assert.deepEqual(l.imgs.map((img, i) => (img.src ? i : -1)).filter((i) => i >= 0), want);
    assert.ok(want.every((i) => l.imgs[i].complete && l.imgs[i].w > 0));
  } finally { await o.close(); }
});

test('a folder asset with no media.json is a kit warning, not a crash', async () => {
  const o = await open();
  try {
    const { warnings } = await o.mm.meta();
    assert.ok(warnings.some((w) => /assets\/missing\/ holds no media\.json/.test(w)), warnings.join('\n'));
  } finally { await o.close(); }
});

// ---------------------------------------------------------------------------------------------
// The screen patterns: patterns/screen/{play,scroll,tap,swap,zoom-to,callout}.

const openActions = (preset = 'editorial', format = '9x16') => openPiece(PAGE, { server, browser, format, query: { story: 'screen-actions', preset } });
const startOf = (sched, scene) => sched.items.find((it) => it.scene === scene && !it.parent && it.beat?.slot === 'stage').start;
const screenAt = (page, scene) => page.evaluate((id) => {
  const s = document.querySelector(`[data-scene="${id}"] [data-screen]`);
  const l = s.querySelector('.mm-screen');
  const r = s.getBoundingClientRect();
  const shown = [...l.querySelectorAll(':scope > .mm-screen__content')].filter((c) => getComputedStyle(c).visibility !== 'hidden');
  const tiles = [...l.querySelectorAll('.mm-screen__tile')].map((i) => ({ top: parseFloat(i.style.top), h: parseFloat(i.style.height) }));
  const ring = l.querySelector('.tap');
  const rr = ring && getComputedStyle(ring.parentElement).display !== 'none' ? ring.getBoundingClientRect() : null;
  const out = document.querySelector(`[data-scene="${id}"] .mm-screen-out`);
  const dot = out?.querySelector('.callout__dot');
  const dr = dot?.getBoundingClientRect();
  const lab = out?.querySelector('.callout__label')?.getBoundingClientRect();
  const content = shown[0];
  return { box: { x: r.x, y: r.y, w: s.clientWidth, h: s.clientHeight }, shown: shown.map((c) => c.dataset.asset), tiles,
    transform: content ? getComputedStyle(content).transform : null,
    ring: rr && { cx: rr.x + rr.width / 2, cy: rr.y + rr.height / 2 }, dot: dr && { cx: dr.x + dr.width / 2, cy: dr.y + dr.height / 2 },
    label: lab && { x: lab.x, w: lab.width, text: out.querySelector('.callout__label').textContent } };
}, scene);
const siteMeta = () => JSON.parse(readFileSync(join(PAGE, 'assets/site/media.json'), 'utf8'));

before(() => mediaAssets('short'));

test('screen/scroll to a mark lands the mark at the top of the screen', async () => {
  const o = await openActions();
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'scroll');
    await o.mm.seek(t0 + 1.6);
    const s = await screenAt(o.page, 'scroll');
    const k = s.box.w / siteMeta().viewport.w;
    assert.ok(Math.abs(-s.tiles[0].top / k - siteMeta().marks.Pricing.y) <= 1, `scrollY ${-s.tiles[0].top / k}`);
  } finally { await o.close(); }
});

test('a sticky header stays pinned at the top of the screen after a scroll', async () => {
  const o = await openActions();
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'scroll');
    await o.mm.seek(t0 + 1.6);
    const ov = siteMeta().overlays?.[0];
    assert.ok(ov, 'the fixture capture has an overlay');
    const r = await o.page.evaluate(() => {
      const c = [...document.querySelectorAll('[data-scene="scroll"] .mm-screen__content')].find((x) => getComputedStyle(x).visibility !== 'hidden');
      const img = c?.querySelector('.mm-screen__overlay');
      return img && { top: parseFloat(img.style.top), h: parseFloat(img.style.height), w: c.parentElement.clientWidth, src: img.getAttribute('src'), ok: img.complete && img.naturalWidth > 0, tile: parseFloat(c.querySelector('.mm-screen__tile').style.top) };
    });
    assert.ok(r && r.ok, JSON.stringify(r));
    const k = r.w / siteMeta().viewport.w;
    assert.ok(r.tile < -100, 'the page has scrolled');
    assert.equal(r.top, Math.round(ov.top * k));
    assert.equal(r.h, Math.round(ov.h * k));
  } finally { await o.close(); }
});

test('screen/scroll on a page shorter than the screen stays at the top', async () => {
  const o = await openActions();
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'short');
    await o.mm.seek(t0 + 1.6);
    assert.equal((await screenAt(o.page, 'short')).tiles[0].top, 0);
  } finally { await o.close(); }
});

test('screen/scroll across a tile seam leaves no gap and no double row', async () => {
  const o = await openActions('kinetic');
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'seam');
    const t = t0 + 1.6;
    const png = decodePng(await framePng(o.page, t));
    const s = await screenAt(o.page, 'seam');
    const meta = siteMeta();
    const k = s.box.w / meta.viewport.w;
    assert.equal(s.tiles[1].top, s.tiles[0].top + s.tiles[0].h, 'tile 2 starts on the row after tile 1');
    const seam = Math.round(s.box.y + s.tiles[1].top);
    assert.ok(seam > s.box.y && seam < s.box.y + s.box.h, 'the seam is on screen');
    const x = Math.round(s.box.x + s.box.w * 0.7);
    for (const y of [seam - 1, seam, seam + 1]) {
      const i = (y * png.width + x) * 4;
      const rgb = [png.data[i], png.data[i + 1], png.data[i + 2]];
      assert.ok(rgb.every((v, j) => Math.abs(v - [0xF4, 0xEF, 0xE6][j]) <= 10), `row ${y} at the seam is ${rgb}, not the page colour`);
    }
    assert.ok(k > 0);
  } finally { await o.close(); }
});

test('screen/tap puts its ring on the point halfway through, and nothing at p = 1', async () => {
  const o = await openActions();
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'tap');
    await o.mm.seek(t0 + 1.0);
    const s = await screenAt(o.page, 'tap');
    assert.ok(s.ring, 'no ring at p = 0.5');
    assert.ok(Math.abs(s.ring.cx - (s.box.x + 0.3 * s.box.w)) <= 2 && Math.abs(s.ring.cy - (s.box.y + 0.4 * s.box.h)) <= 2, JSON.stringify(s));
    await o.mm.seek(t0 + 1.6);
    assert.equal((await screenAt(o.page, 'tap')).ring, null);
  } finally { await o.close(); }
});

test('screen/swap at p = 1 shows only the new asset', async () => {
  const o = await openActions();
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'swap');
    await o.mm.seek(t0 + 0.8);
    assert.deepEqual((await screenAt(o.page, 'swap')).shown.sort(), ['assets/grid.png', 'assets/site/'].sort(), 'both during the swap');
    await o.mm.seek(t0 + 1.2);
    assert.deepEqual((await screenAt(o.page, 'swap')).shown, ['assets/grid.png']);
  } finally { await o.close(); }
});

test('screen/zoom-to at p = 1 has the point at the screen centre at scale s', async () => {
  const o = await openActions();
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'zoom');
    await o.mm.seek(t0 + 1.6);
    const s = await screenAt(o.page, 'zoom');
    const [a, , , d, e, f] = s.transform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
    assert.equal(a, 2); assert.equal(d, 2);
    // the content point (0.5, 0.25) of the screen maps to its centre
    assert.ok(Math.abs(e + 2 * 0.5 * s.box.w - s.box.w / 2) <= 2 && Math.abs(f + 2 * 0.25 * s.box.h - s.box.h / 2) <= 2, s.transform);
  } finally { await o.close(); }
});

test('screen/callout draws a dot on the point and a label beside the device', async () => {
  const o = await openActions();
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'callout');
    await o.mm.seek(t0 + 2.0);
    const s = await screenAt(o.page, 'callout');
    assert.ok(s.dot && s.label, 'no callout drawn');
    assert.ok(Math.abs(s.dot.cx - (s.box.x + 0.3 * s.box.w)) <= 2 && Math.abs(s.dot.cy - (s.box.y + 0.4 * s.box.h)) <= 2, JSON.stringify(s));
    assert.equal(s.label.text, 'Here');
    const vw = await o.page.evaluate(() => innerWidth);
    assert.ok(s.label.x >= 0 && s.label.x + s.label.w <= vw, `the label runs off the frame: ${s.label.x} + ${s.label.w} > ${vw}`);
    assert.ok(s.label.x > s.dot.cx || s.label.x + s.label.w < s.dot.cx, 'the label covers the point it names');
    await o.mm.seek(t0 + 3.6);
    assert.equal((await screenAt(o.page, 'callout')).dot, undefined, 'gone at p = 1');
  } finally { await o.close(); }
});

test('an emphasis on a device with a screen leaves nothing behind: a frame does not depend on the seek before it', async () => {
  const o = await openActions(), f = await openActions();
  try {
    const sched = (await o.mm.meta()).schedule;
    const item = sched.items.find((it) => it.scene === 'emph' && !it.parent && it.beat?.slot === 'stage');
    const mid = item.emphasis.start + item.emphasis.d / 2;
    const late = sched.scenes.find((s) => s.id === 'emph').end - 0.2;
    await framePng(o.page, mid);
    const after = await framePng(o.page, late);
    const fresh = await framePng(f.page, late);
    assert.ok(after.equals(fresh), 'the frame after an emphasis differs from a fresh render of the same t');
  } finally { await o.close(); await f.close(); }
});

test('a recording with no screen/play is scheduled as one, lasting the clip', async () => {
  const o = await open();
  try {
    const sched = (await o.mm.meta()).schedule;
    const ev = sched.events.filter((e) => e.screen && e.scene === 'seq');
    assert.equal(ev.length, 1); assert.equal(ev[0].pattern, 'screen/play');
    assert.ok(Math.abs(ev[0].d - 2) < 0.05, `d ${ev[0].d}`);
  } finally { await o.close(); }
});

test('in a deck, a callout is fully shown at its rest and gone after the next press', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'screen-deck' } });
  try {
    const label = () => o.page.evaluate(() => { const l = document.querySelector('.mm-screen-out .callout__label'); return l ? Number(getComputedStyle(l).opacity) : null; });
    await o.mm.seek(3);
    assert.equal(await label(), 1, 'the callout is not shown at its rest');
    await o.mm.seek(2);
    assert.equal(await label(), null, 'the callout shows before its press');
  } finally { await o.close(); }
});
