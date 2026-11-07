// moves/depth-parallax in the page: a picture taken apart by mm media layers drifts layer by layer
// in a canvas declared media. Without a lens (aperture 0) the settled frame is the plain picture, pixel
// for pixel; with the default lens the canvas stays at rest, the near layer sharp and the far ones soft.
// The pack is made from fixtures/layers/ into a work copy of fixtures/layers/piece, where the pinhole
// stories (aperture 0) are written beside the fixture's own.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const work = join(ROOT, `.tmp-layers-dp-${process.pid}`), PIECE = join(work, 'layers', 'piece');
const FIX = join(ROOT, 'fixtures', 'layers');
let server, browser;

before(async () => {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, 'layers'), { recursive: true });
  cpSync(join(FIX, 'piece'), PIECE, { recursive: true });
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'mm.mjs'), 'media', 'layers', join(FIX, 'scene.png'), '--name', 'scene', '--piece', PIECE,
    '--mask', `sun=${join(FIX, 'sun-mask.png')}`, '--mask', `box=${join(FIX, 'box-cutout.png')}`, '--poly', join(FIX, 'hill.json'), '--depth', join(FIX, 'depth.png')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  // pinhole copies of the fixture's stories: the same move with the lens off
  for (const [from, to] of [['parallax', 'pin'], ['parallax-push', 'pin-push']]) {
    const story = JSON.parse(readFileSync(join(PIECE, `${from}.json`), 'utf8'));
    for (const sc of story.scenes) sc.moveParams = { ...sc.moveParams, aperture: 0 };
    writeFileSync(join(PIECE, `${to}.json`), JSON.stringify(story));
  }
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(work, { recursive: true, force: true }); });

const open = (story, format = '16x9') => openPiece(PIECE, { server, browser, format, query: { story, preset: 'editorial' } });
const pixels = (png) => decodePng(png).data;
function differing(a, b) { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++; return n; }

test('without a lens, once the move settles the frame equals the plain picture pixel for pixel (both formats, dolly and push)', async () => {
  for (const [story, format] of [['pin', '16x9'], ['pin', '9x16'], ['pin-push', '16x9'], ['pin-push', '9x16']]) {
    const moving = await open(story, format), still = await open('plain', format);
    try {
      const meta = await moving.mm.meta();
      const scene = meta.scenes[0], hold = meta.schedule.holds.find((h) => h.scene === scene.id);
      assert.ok(hold, 'the scene has a rest');
      for (const t of [hold.from, scene.end - 0.04]) {
        const a = pixels(await framePng(moving.page, t)), b = pixels(await framePng(still.page, t));
        assert.equal(differing(a, b), 0, `${story} ${format} at ${t}: the settled frame differs from the plain picture`);
        assert.equal(await moving.page.evaluate(() => document.querySelectorAll('canvas.mm-depth-parallax').length), 0, 'no canvas at rest');
      }
      assert.deepEqual(moving.errors, []);
    } finally { await moving.close(); await still.close(); }
  }
});

test('mid-move the layers drift in a canvas that is a data-media leaf, and the frame differs from the plain picture', async () => {
  const moving = await open('parallax'), still = await open('plain');
  try {
    const a = pixels(await framePng(moving.page, 0.2)), b = pixels(await framePng(still.page, 0.2));
    const leaf = await moving.page.evaluate(() => {
      const c = document.querySelector('[data-slot="image"] canvas.mm-depth-parallax');
      return c && { media: c.hasAttribute('data-media'), children: c.children.length, w: c.width, h: c.height, text: c.textContent };
    });
    assert.ok(leaf, 'a canvas is drawn in the picture slot');
    assert.equal(leaf.media, true); assert.equal(leaf.children, 0); assert.equal(leaf.text, '');
    assert.ok(leaf.w > 100 && leaf.h > 100);
    const n = differing(a, b);
    assert.ok(n > 2000, `only ${n} pixels moved`);
    const requested = await moving.page.evaluate(() => performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname.split('/').pop()));
    for (const f of ['media.json', 'plate.png', 'part-sun.png', 'part-box.png', 'part-hill.png', 'depth.png']) assert.ok(requested.includes(f), `${f} requested`);
  } finally { await moving.close(); await still.close(); }
});

test('the same instant draws the same pixels whatever was drawn before it', async () => {
  const one = await open('parallax'), two = await open('parallax');
  try {
    const a = await framePng(one.page, 0.35);
    await framePng(one.page, 1.6);
    await framePng(two.page, 1.6);
    await framePng(two.page, 3.2);
    const b = await framePng(two.page, 0.35);
    assert.equal(differing(pixels(a), pixels(b)), 0);
    assert.notEqual(differing(pixels(a), pixels(await framePng(one.page, 0.7))), 0, 'the picture moves between instants');
  } finally { await one.close(); await two.close(); }
});

// The fixture picture is 960 x 640: the sun (depth about 0.12) is a disc of radius 72 at (220, 160), the
// box (depth about 0.9, the nearest layer) spans 584..784 x 300..500.
const geometry = (page) => page.evaluate(() => { const r = document.querySelector('[data-slot="image"] img').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const toFrame = (box) => { const cs = Math.max(box.w / 960, box.h / 640); return { cs, ox: box.x + (box.w - 960 * cs) / 2, oy: box.y + (box.h - 640 * cs) / 2 }; };
// the sideways shift of the plain frame b that best matches frame a inside a window (picture px)
function bestShift(a, b, f, [px0, px1, py0, py1], range) {
  const x0 = Math.round(f.ox + px0 * f.cs), x1 = Math.round(f.ox + px1 * f.cs), y0 = Math.round(f.oy + py0 * f.cs), y1 = Math.round(f.oy + py1 * f.cs);
  let best = { k: 0, err: Infinity };
  for (let k = -range; k <= range; k++) {
    let err = 0;
    for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
      const i = (y * a.width + x) * 4, j = (y * b.width + (x - k)) * 4;
      err += Math.abs(a.data[i] - b.data[j]) + Math.abs(a.data[i + 1] - b.data[j + 1]) + Math.abs(a.data[i + 2] - b.data[j + 2]);
    }
    if (err < best.err) best = { k, err };
  }
  return best.k;
}

// the focus sits on the nearest layer, so the box stays put and everything behind it slides: the far
// sun starts amount x short side x (0.12 - 0.9), about 100 px at 12 % of a 1080 px short side
test('the default dolly is deep: the near part is the anchor and the far part starts far off its place', async () => {
  const moving = await open('pin'), still = await open('plain');
  try {
    const a = decodePng(await framePng(moving.page, 0)), b = decodePng(await framePng(still.page, 0));
    const f = toFrame(await geometry(still.page));
    const sun = bestShift(a, b, f, [170, 270, 110, 210], 160), box = bestShift(a, b, f, [610, 760, 330, 470], 160);
    assert.ok(sun <= -70, `the far part starts ${sun} px off its place`);
    assert.ok(Math.abs(box) <= 2, `the near part starts ${box} px off its place`);
  } finally { await moving.close(); await still.close(); }
});

// how much a window of a frame changes from pixel to pixel: the sum of absolute steps, all channels
function sharpness(img, f, [px0, px1, py0, py1]) {
  const x0 = Math.round(f.ox + px0 * f.cs), x1 = Math.round(f.ox + px1 * f.cs), y0 = Math.round(f.oy + py0 * f.cs), y1 = Math.round(f.oy + py1 * f.cs);
  let s = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * img.width + x) * 4;
    for (let c = 0; c < 3; c++) s += Math.abs(img.data[i + c] - img.data[i + 4 + c]) + Math.abs(img.data[i + c] - img.data[i + img.width * 4 + c]);
  }
  return s;
}

test('with the default lens the rest keeps its canvas: settled, still, the near part sharp and the far part soft', async () => {
  for (const format of ['16x9', '9x16']) {
    const lens = await open('parallax', format), still = await open('plain', format);
    try {
      const meta = await lens.mm.meta();
      const scene = meta.scenes[0], hold = meta.schedule.holds.find((h) => h.scene === scene.id);
      const a = decodePng(await framePng(lens.page, hold.from));
      const leaf = await lens.page.evaluate(() => {
        const c = document.querySelector('[data-slot="image"] canvas.mm-depth-parallax');
        return c && { media: c.hasAttribute('data-media'), children: c.children.length, opacity: getComputedStyle(c).opacity };
      });
      assert.ok(leaf, `${format}: the canvas stays at rest`);
      assert.equal(leaf.media, true); assert.equal(leaf.children, 0); assert.equal(leaf.opacity, '1');
      const late = decodePng(await framePng(lens.page, scene.end - 0.04));
      assert.equal(differing(a.data, late.data), 0, `${format}: the rest is still`);
      const b = decodePng(await framePng(still.page, hold.from));
      assert.ok(differing(a.data, b.data) > 1000, `${format}: the rest is no longer the plain picture`);
      const f = toFrame(await geometry(still.page));
      // the sun's rim with the sky around it, and the box's own face (the near layer), in picture px
      const sunRim = [130, 310, 140, 180], boxEdge = [588, 780, 304, 496];
      const soft = sharpness(a, f, sunRim) / sharpness(b, f, sunRim), crisp = sharpness(a, f, boxEdge) / sharpness(b, f, boxEdge);
      assert.ok(soft < 0.8, `${format}: the far sun keeps ${soft.toFixed(2)} of its sharpness`);
      assert.ok(crisp > 0.9, `${format}: the near box keeps ${crisp.toFixed(2)} of its sharpness`);
      // the blurred plate stays whole up to the picture's border: the sky's grain is as soft in the top
      // rows of the picture's box as a little further in, so no sharp copy shows through at the edge
      const box = await geometry(still.page);
      const rows = (img, y0) => { let s = 0; for (let y = y0; y < y0 + 3; y++) for (let x = Math.round(box.x + box.w * 0.3); x < box.x + box.w * 0.7; x++) { const i = (y * img.width + x) * 4; s += Math.abs(img.data[i] - img.data[i + 4]); } return s; };
      const top = Math.max(0, Math.ceil(box.y));
      assert.ok(rows(a, top) < 1.3 * rows(a, top + 12), `${format}: the top rows hold ${rows(a, top)} against ${rows(a, top + 12)} further in`);
      assert.deepEqual(lens.errors, []);
    } finally { await lens.close(); await still.close(); }
  }
});

test('the lens is deterministic: the same rest instant draws the same pixels whatever was drawn before it', async () => {
  const one = await open('parallax'), two = await open('parallax');
  try {
    const meta = await one.mm.meta();
    const hold = meta.schedule.holds.find((h) => h.scene === meta.scenes[0].id);
    const a = await framePng(one.page, hold.from + 0.2);
    await framePng(two.page, 0.1);
    await framePng(two.page, hold.from - 0.3);
    const b = await framePng(two.page, hold.from + 0.2);
    assert.equal(differing(pixels(a), pixels(b)), 0);
  } finally { await one.close(); await two.close(); }
});
