// 3d/point-cloud: a picture, a mark or the slot's words rebuilt as a free-floating object of sparse,
// glittering points (Three.js, vendored). The reveal: one bright seed at the object's centre, a burst
// that spreads past the object as pale tinted streaks, a front that sends each point home in its own
// colour. At rest the object fills about 60 % of the frame's height, turned three-quarters, never a solid
// rectangle, and it lives: points twinkle and the object sways. Source colours sit on a declared-media
// canvas; palette colours are brand roles with nothing masked.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'fixtures/point-cloud');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (preset = 'nocturne-kinetic', format = '16x9') => openPiece(PAGE, { server, browser, format, query: { story: 'film', preset } });
const itemOf = (sched, scene) => sched.items.find((it) => it.scene === scene && !it.parent && it.beat?.fx === '3d/point-cloud');
const seekTo = async (o, scene, q) => { const it = itemOf((await o.mm.meta()).schedule, scene); await o.mm.seek(it.start + q * it.d); };
const seekPast = async (o, scene, s) => { const it = itemOf((await o.mm.meta()).schedule, scene); await o.mm.seek(it.start + it.d + s); };
const slotOf = (scene) => `[data-scene="${scene}"] [data-fx="3d/point-cloud"]`;
// the canvas's readouts and its pixels: the ink's box (as shares of the frame), how much of that box is
// inked, its top corner patches, the mean colour of the ink and how far it reaches from the slot's centre
const look = (o, scene) => o.page.evaluate((sel) => {
  const el = document.querySelector(sel), c = el.querySelector('canvas[data-3d]'), words = el.querySelector('.mm-pc__text');
  const text = el.textContent.replace(/\s+/g, ' ').trim();
  const wordsStyle = words ? { opacity: getComputedStyle(words).opacity, transform: getComputedStyle(words).transform } : null;
  if (!c) return { canvas: false, text, words: wordsStyle };
  const g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
  const x = g.getContext('2d'); x.drawImage(c, 0, 0);
  const px = x.getImageData(0, 0, g.width, g.height).data;
  const root = el.querySelector('.mm-pc').getBoundingClientRect(), cr = c.getBoundingClientRect();
  const k = cr.width / c.width, ox = (root.left + root.width / 2 - cr.left) / k, oy = (root.top + root.height / 2 - cr.top) / k;
  let ink = 0, x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1, h = 0, reach = 0;
  const sum = [0, 0, 0];
  for (let y = 0; y < g.height; y++) for (let xx = 0; xx < g.width; xx++) {
    const i = (y * g.width + xx) * 4, a = px[i + 3];
    if (a < 24) continue;
    ink++; h = (h * 31 + y * g.width + xx + a) >>> 0;
    sum[0] += px[i]; sum[1] += px[i + 1]; sum[2] += px[i + 2];
    if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y;
    reach = Math.max(reach, Math.hypot(xx - ox, y - oy));
  }
  const inBox = (bx0, by0, bx1, by1) => { let n = 0, all = 0; for (let y = by0; y < by1; y++) for (let xx = bx0; xx < bx1; xx++) { all++; if (px[(y * g.width + xx) * 4 + 3] >= 24) n++; } return all ? n / all : 0; };
  const w = x1 - x0 + 1, hh = y1 - y0 + 1, cw = Math.max(2, Math.round(w * 0.12)), ch = Math.max(2, Math.round(hh * 0.06));
  const corners = ink ? Math.max(inBox(x0, y0, x0 + cw, y0 + ch), inBox(x1 - cw, y0, x1, y0 + ch)) : 0;   // the top two (a bottle's shoulders)
  return {
    canvas: true, ...c.dataset, media: c.hasAttribute('data-media'), ink, h, text, words: wordsStyle,
    box: ink ? { w: w / g.width, h: hh / g.height } : null, fill: ink ? inBox(x0, y0, x1 + 1, y1 + 1) : 0, corners,
    mean: ink ? sum.map((v) => Math.round(v / ink)) : null, reach: reach / g.height,
  };
}, slotOf(scene));
const shot = (o) => o.page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
const warnings = (o) => o.page.evaluate(() => window.mm.warnings ?? []);

test('the same instant draws the same pixels after seeking away and back in reverse order, in the reveal and at rest', async () => {
  const o = await open();
  try {
    await seekTo(o, 'shot', 0.5);
    const a = await shot(o), la = await look(o, 'shot');
    await seekPast(o, 'shot', 0.8);
    const b = await shot(o), lb = await look(o, 'shot');
    assert.ok(la.canvas && la.media && la.ink > 2000, JSON.stringify(la));
    await seekTo(o, 'shot', 0.9); await seekTo(o, 'shot', 0.2); await seekTo(o, 'word', 0.6);
    await seekPast(o, 'shot', 0.8);
    assert.ok(b.equals(await shot(o)), 'the same PNG at rest');
    assert.deepEqual(await look(o, 'shot'), lb);
    await seekTo(o, 'shot', 0.5);
    assert.ok(a.equals(await shot(o)), 'the same PNG mid-reveal');
    assert.deepEqual(await look(o, 'shot'), la);
  } finally { await o.close(); }
});

test('the reveal: a single seed at the centre, a burst past the object\'s bounds in the tint, a front that lands it in its own colours', async () => {
  const o = await open();
  try {
    await seekTo(o, 'shot', 0.03);
    const seed = await look(o, 'shot');
    await seekTo(o, 'shot', 0.24);
    const burst = await look(o, 'shot');
    await seekTo(o, 'shot', 0.62);
    const front = await look(o, 'shot');
    await seekPast(o, 'shot', 0.5);
    const rest = await look(o, 'shot');
    assert.equal(seed.phase, 'seed');
    assert.ok(seed.ink > 0 && seed.reach < 0.08, `the seed is one small light at the slot's centre: reach ${seed.reach}`);
    assert.equal(burst.phase, 'burst');
    assert.ok(burst.reach > rest.reach * 1.2, `the burst spreads past the object: ${burst.reach} against ${rest.reach} at rest`);
    assert.equal(Number(burst.landed), 0);
    assert.ok(Number(front.landed) > 0.05 && Number(front.landed) < 0.95, `the front is landing points: ${front.landed}`);
    assert.equal(rest.phase, 'rest'); assert.equal(Number(rest.landed), 1);
    // the cloud is tinted (the accent toward the lightest role: warm and pale), the rest takes the bottle's own teal
    const [r, g, b] = burst.mean;
    assert.ok(r > g && g > b && r > 150, `the cloud is pale and warm: ${burst.mean}`);
    assert.ok(rest.mean[1] > rest.mean[0] && rest.mean[2] > rest.mean[0], `the object rests in its own (teal) colours: ${rest.mean}`);
  } finally { await o.close(); }
});

test('at rest a free-floating object about 60 % of the frame high: sparse points with gaps, never a solid rectangle', async () => {
  const o = await open();
  try {
    await seekPast(o, 'shot', 0.5);
    const r = await look(o, 'shot');
    assert.equal(r.relief, 'pillow'); assert.equal(r.ground, 'cut');
    assert.ok(r.box.h > 0.5 && r.box.h < 0.7, `height ${r.box.h} of the frame`);
    assert.ok(r.fill < 0.6, `points with gaps between them: ${r.fill} of the object's box is inked`);
    assert.ok(r.corners < 0.05, `the box's top corners are empty (beside the neck), so it is no rectangle: ${r.corners}`);
    assert.ok(Number(r.dot) >= 1 && Number(r.dot) <= 3.2, `dots of about 1 to 3 px: ${r.dot}`);
    assert.ok(Math.abs(Number(r.yaw) - 20) <= 6.01, `three-quarters, swaying round 20°: ${r.yaw}`);
  } finally { await o.close(); }
});

test('the rest lives: later instants differ (twinkle and sway) while each stays the same when drawn again', async () => {
  const o = await open();
  try {
    const frames = [];
    for (const s of [0.4, 1.1, 1.8]) { await seekPast(o, 'shot', s); frames.push(await look(o, 'shot')); }
    assert.notEqual(frames[0].h, frames[1].h); assert.notEqual(frames[1].h, frames[2].h);
    assert.notEqual(frames[0].yaw, frames[1].yaw, 'the sway turns it');
    for (const f of frames) assert.equal(f.phase, 'rest');
  } finally { await o.close(); }
});

test('a picture on a flat ground is keyed into an object; one on a busy ground is refused with a warning, never drawn as a slab', async () => {
  const o = await open();
  try {
    await seekPast(o, 'keyed', 0.5);
    const k = await look(o, 'keyed');
    assert.equal(k.ground, 'keyed');
    assert.ok(k.corners < 0.05 && k.box.h < 0.7, JSON.stringify({ corners: k.corners, box: k.box }));
    await seekPast(o, 'refused', 0.5);
    const r = await look(o, 'refused');
    assert.equal(r.canvas, false, 'nothing drawn');
    assert.ok((await warnings(o)).some((w) => /refused|not drawn/.test(w) && w.includes('[data-scene="refused"]')), JSON.stringify(await warnings(o)));
  } finally { await o.close(); }
});

test('a supplied depth map displaces the points and removes the far ground; an SVG mark is extruded', async () => {
  const o = await open();
  try {
    await seekPast(o, 'depth', 0.5);
    const d = await look(o, 'depth');
    assert.equal(d.relief, 'map'); assert.equal(d.ground, 'map');
    assert.ok(d.corners < 0.05 && d.box.h < 0.7, JSON.stringify({ corners: d.corners, box: d.box }));
    await seekPast(o, 'mark', 0.5);
    const m = await look(o, 'mark');
    assert.equal(m.relief, 'extrude');
    assert.equal(m.media, false, 'palette colours: the canvas is not declared media');
  } finally { await o.close(); }
});

test('the slot\'s words: a cloud mid-reveal; at rest the slot\'s own text, readable, turning with the glittering object', async () => {
  const o = await open();
  try {
    await seekTo(o, 'word', 0.5);
    const mid = await look(o, 'word');
    assert.ok(mid.canvas && mid.ink > 500, JSON.stringify(mid));
    assert.equal(mid.text, 'Made to be seen');
    await seekPast(o, 'word', 0.7);
    const rest = await look(o, 'word');
    assert.equal(rest.text, 'Made to be seen');
    assert.equal(Number(rest.words.opacity), 1);
    assert.ok(rest.canvas && rest.ink > 200, 'the points stay as a glittering shell');
    assert.ok(Math.abs(Number(rest.yaw)) <= 6.01, `words face the viewer and only sway: ${rest.yaw}`);
    assert.match(rest.words.transform, /matrix3d/, 'the text turns with the object');
  } finally { await o.close(); }
});

test('on a light brand the object reads: firm, darker points and a darker tint', async () => {
  const o = await open('calm-product');
  try {
    await seekPast(o, 'shot', 0.5);
    const r = await look(o, 'shot');
    assert.ok(r.ink > 20000 && r.box.h > 0.5, JSON.stringify({ ink: r.ink, box: r.box }));
    assert.ok(r.mean.reduce((s, v) => s + v, 0) / 3 < 82, `the points are deepened against the light ground: ${r.mean}`);
    await seekTo(o, 'shot', 0.3);
    const b = await look(o, 'shot');
    assert.ok(b.mean.reduce((s, v) => s + v, 0) / 3 < 160, `the cloud is darker than the light canvas: ${b.mean}`);
  } finally { await o.close(); }
});

test('land is no longer read: it is named in mm.warnings and the object rests as points', async () => {
  const o = await open();
  try {
    await seekPast(o, 'legacy', 0.5);
    const r = await look(o, 'legacy');
    assert.ok(r.canvas && r.phase === 'rest');
    assert.ok((await warnings(o)).some((w) => w.includes('[data-scene="legacy"]') && /land is not read/.test(w)));
  } finally { await o.close(); }
});
