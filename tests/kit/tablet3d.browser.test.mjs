// 3d/tablet: its demo story in a piece, upright and on its side. The canvas renders and faces the
// viewer at rest, the same t gives the same pixels after a seek elsewhere, and on its side the
// hidden screen the texture is copied from is wider than tall. The floor's shadow fades out before the edges of
// the canvas, so a slot narrower than the frame never cuts it in a hard line.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';
import { newPiece } from '../../scripts/new.mjs';

const OUT = join(ROOT, 'out', 'tablet3d-test');
const demo = JSON.parse(readFileSync(join(ROOT, 'patterns/3d/tablet/demo/story.json'), 'utf8'));
let server, browser;
const dirs = {};

function piece(name, orientation) {
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  newPiece({ kind: 'film', style: join(ROOT, 'styles/presets/editorial.json'), dir });
  const story = structuredClone(demo);
  for (const b of story.scenes[0].beats) if (b.fx === '3d/tablet') b.params = { ...b.params, orientation };
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
  return dir;
}

before(async () => {
  mkdirSync(OUT, { recursive: true });
  dirs.portrait = piece('portrait', 'portrait');
  dirs.landscape = piece('landscape', 'landscape');
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const open = (which, format) => openPiece(dirs[which], { server, browser, format });
const state = (page) => page.evaluate(() => {
  const c = document.querySelector('canvas[data-3d]'), s = document.querySelector('.tablet3d [data-screen]');
  const r = s?.getBoundingClientRect();
  return c ? { face: c.dataset.face, ry: Number(c.dataset.ry), orientation: c.dataset.orientation, w: c.width, screen: r ? { w: r.width, h: r.height } : null } : null;
});

test('the tablet renders and faces the viewer at rest', async () => {
  const o = await open('portrait', '9x16');
  try {
    const img = decodePng(await framePng(o.page, 3));
    const c = await state(o.page);
    assert.ok(c && c.w > 0, 'no 3D canvas');
    assert.equal(c.face, 'front');
    assert.ok(Number.isFinite(c.ry) && Math.abs(c.ry) < 0.1, `rotation at rest ${c.ry}`);
    assert.ok(c.screen.h > c.screen.w, 'upright, the screen is taller than wide');
    const colours = new Set();
    for (let i = 0; i < img.data.length; i += 4 * 211) colours.add((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]);
    assert.ok(colours.size > 40, 'the 3D tablet drew nothing');
  } finally { await o.close(); }
});

test('the same t gives the same pixels after a seek elsewhere', async () => {
  const o = await open('portrait', '9x16'), f = await open('portrait', '9x16');
  try {
    await framePng(o.page, 4.5); await framePng(o.page, 0.4);
    const a = await framePng(o.page, 2.2), b = await framePng(f.page, 2.2);
    assert.ok(a.equals(b), 'the 3D frame depends on the seek before it');
  } finally { await o.close(); await f.close(); }
});

test('on its side the screen is wider than tall', async () => {
  const o = await open('landscape', '16x9');
  try {
    await o.mm.seek(3);
    const c = await state(o.page);
    assert.equal(c.orientation, 'landscape');
    assert.equal(c.face, 'front');
    assert.ok(c.screen.w > c.screen.h * 1.2, `screen box ${c.screen.w} x ${c.screen.h}`);
  } finally { await o.close(); }
});

test('the floor\'s shadow fades out before the canvas edges: no hard line where the slot ends', async () => {
  const o = await open('portrait', '9x16');
  try {
    const png = decodePng(await framePng(o.page, 3));
    const box = await o.page.evaluate(() => { const r = document.querySelector('canvas[data-3d]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const px = (x, y) => { const i = (Math.round(y) * png.width + Math.round(x)) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
    // across each side edge of the canvas, over its lower half, the pixel just inside matches the one just outside
    for (const [inX, outX] of [[box.x + 2, box.x - 3], [box.x + box.w - 3, box.x + box.w + 2]]) {
      for (let y = box.y + box.h * 0.5; y < box.y + box.h - 2; y += 6) {
        const a = px(inX, y), b = px(outX, y);
        assert.ok(a.every((v, k) => Math.abs(v - b[k]) <= 3), `a step at the canvas edge x=${Math.round(inX)} y=${Math.round(y)}: ${a} inside, ${b} outside`);
      }
    }
  } finally { await o.close(); }
});
