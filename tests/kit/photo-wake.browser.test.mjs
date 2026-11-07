// entrances/photo-wake in the page. As it arrives (p = 0) the picture is a two-colour print in the
// brand's ink and canvas, and it passes G-BRAND's pixel test with no mask at all, in a light and in a
// dark brand; mid-way an accent front carries the real colours in; at rest the frame is the plain
// picture, pixel for pixel. The picture is fixtures/layers' scene, copied into a work copy of the piece.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng, offPalette, paletteDistance, rgbToLab, deltaE } from '../../scripts/check/_pixels.mjs';
import { DELTA_E, OFF_MAX, REGION_MAX } from '../../scripts/check/G-BRAND.mjs';

const work = join(ROOT, `.tmp-layers-pw-${process.pid}`), PIECE = join(work, 'layers', 'piece');
const FIX = join(ROOT, 'fixtures', 'layers');
let server, browser;

before(async () => {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, 'layers'), { recursive: true });
  cpSync(join(FIX, 'piece'), PIECE, { recursive: true });
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'mm.mjs'), 'media', 'layers', join(FIX, 'scene.png'), '--name', 'scene', '--piece', PIECE, '--mask', `sun=${join(FIX, 'sun-mask.png')}`], { encoding: 'utf8' });
  assert.ok(r.status === 0 || r.status === 1, r.stderr);   // only source.png is used here
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(work, { recursive: true, force: true }); });

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const roleRgbs = (preset) => Object.values(JSON.parse(readFileSync(join(ROOT, 'styles', 'presets', `${preset}.json`), 'utf8')).color).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).map(hex);
const open = (story, preset, format = '16x9') => openPiece(PIECE, { server, browser, format, query: { story, preset } });
const boxOf = (page) => page.evaluate(() => { const r = document.querySelector('[data-slot="image"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
/** The picture's entrance in the schedule: { start, d } (p = 0 at start, 1 at start + d). */
async function wakeOf(o) {
  const it = (await o.mm.meta()).schedule.items.find((i) => i.selector.includes('"image"'));
  return { start: it.start, d: it.d };
}
function differing(a, b) { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++; return n; }

test('as it arrives the picture is a print in ink and canvas that passes the pixel test unmasked, light and dark', async () => {
  for (const preset of ['editorial', 'nocturne-kinetic']) {
    const o = await open('wake', preset), plain = await open('wake-plain', preset);
    try {
      const dist = paletteDistance(roleRgbs(preset));
      const { start } = await wakeOf(o);
      const img = decodePng(await framePng(o.page, start)), rect = await boxOf(o.page);
      const leaf = await o.page.evaluate(() => { const c = document.querySelector('[data-slot="image"] canvas.mm-photo-wake'); return c && { media: c.hasAttribute('data-media'), children: c.children.length }; });
      assert.deepEqual(leaf, { media: true, children: 0 }, `${preset}: the print is drawn in a media leaf`);
      const r = offPalette(img, dist, DELTA_E, { rect });   // no masks: the media box is read like any other pixel
      assert.ok(r.total > 50_000, `${preset}: the picture box was read (${r.total} px)`);
      assert.equal(r.all, 0, `${preset}: ${r.all} off-palette pixels in the print (${r.colours})`);
      assert.ok(r.off / r.total <= OFF_MAX && r.largest.size <= REGION_MAX);
      // the same box holding the real picture fails the same unmasked test: the print is what passes
      await plain.mm.seek(3);
      const real = offPalette(decodePng(await framePng(plain.page, 3)), dist, DELTA_E, { rect: await boxOf(plain.page) });
      assert.ok(real.off / real.total > OFF_MAX, `${preset}: the plain picture is off-palette (${real.off} px)`);
      assert.deepEqual(o.errors, []);
    } finally { await o.close(); await plain.close(); }
  }
});

test('at rest the frame is the plain picture, pixel for pixel', async () => {
  for (const preset of ['editorial', 'nocturne-kinetic']) {
    const o = await open('wake', preset), plain = await open('wake-plain', preset);
    try {
      const meta = await o.mm.meta(), hold = meta.schedule.holds[0];
      for (const t of [hold.from, meta.scenes[0].end - 0.04]) {
        const a = decodePng(await framePng(o.page, t)).data, b = decodePng(await framePng(plain.page, t)).data;
        assert.equal(differing(a, b), 0, `${preset} at ${t}`);
      }
      assert.equal(await o.page.evaluate(() => document.querySelectorAll('canvas.mm-photo-wake').length), 0);
    } finally { await o.close(); await plain.close(); }
  }
});

test('mid-way an accent front crosses the picture, real colours behind it and the print ahead', async () => {
  const o = await open('wake', 'editorial');
  try {
    const { start, d } = await wakeOf(o);
    const img = decodePng(await framePng(o.page, start + d * 0.5)), rect = await boxOf(o.page);
    const accent = rgbToLab(...hex('#B5451B')), dist = paletteDistance(roleRgbs('editorial'));
    let near = 0, real = 0, print = 0;
    for (let y = Math.ceil(rect.y) + 2; y < rect.y + rect.h - 2; y++) for (let x = Math.ceil(rect.x) + 2; x < rect.x + rect.w - 2; x++) {
      const i = (y * img.width + x) * 4, c = [img.data[i], img.data[i + 1], img.data[i + 2]];
      if (deltaE(rgbToLab(...c), accent) < 12) near++;
      if (dist(...c) > 6) real++; else print++;
    }
    assert.ok(near > 200, `accent front pixels: ${near}`);
    assert.ok(real > 5000 && print > 5000, `real ${real}, print ${print}`);
  } finally { await o.close(); }
});

test('the same instant draws the same pixels whatever was drawn before it', async () => {
  const one = await open('wake', 'editorial'), two = await open('wake', 'editorial');
  try {
    const a = await framePng(one.page, 1.2);
    await framePng(two.page, 3.5);
    await framePng(two.page, 0.1);
    const b = await framePng(two.page, 1.2);
    assert.equal(differing(decodePng(a).data, decodePng(b).data), 0);
  } finally { await one.close(); await two.close(); }
});
