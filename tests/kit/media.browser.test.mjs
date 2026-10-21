// The media slot. layouts/media carries a framed or full-bleed picture under
// an optional headline and caption; devices/phone, browser and laptop put a beat's asset on their
// screen; layouts/bento-3 tiles take an asset beside their label; moves/push-in, ken-burns and pan
// move the pictures inside their frames with `target: media`. Every picture is a local <img> that
// the pattern declares `data-media` (the gate's pixel test masks it), decoded before the first seek,
// and every frame stays a function of t. Fixture: tests/kit/media (film.json, deck.json, a 3 x 3
// colour grid whose middle cell is #2E86DE).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
const MIDDLE = [46, 134, 222];
let server, browser;

before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (format = '16x9', query = {}) => openPiece(PAGE, { server, browser, format, query: { story: 'film', ...query } });

// The instant a scene is at rest (its first rest), or its last frame when it has none.
const restOf = (sched, id) => { const s = sched.scenes.find((x) => x.id === id); return sched.rests.find((r) => r >= s.start && r < s.end) ?? s.end - 0.001; };
const endOf = (sched, id) => sched.scenes.find((x) => x.id === id).end - 0.001;

// Boxes and facts of the scene's pictures, its headline and caption, at instant t.
const read = (page, t, id) => page.evaluate(([t, id]) => {
  window.mm.seek(t);
  const sc = document.querySelector(`[data-scene="${id}"]`);
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility === 'visible' && el.getClientRects().length > 0;
  const imgs = [...sc.querySelectorAll('img')].map((img) => ({
    src: img.getAttribute('src'), media: img.hasAttribute('data-media'), fit: getComputedStyle(img).objectFit,
    complete: img.complete, natural: img.naturalWidth, shown: shown(img), box: box(img), transform: getComputedStyle(img).transform,
    frame: box(img.parentElement), clip: getComputedStyle(img.parentElement).overflow,
  }));
  const slot = (n) => sc.querySelector(`[data-slot="${n}"]`);
  return {
    imgs, headline: box(slot('headline')), caption: box(slot('caption')), camera: getComputedStyle(sc.querySelector('.mm-camera')).transform,
    rows: [...sc.querySelectorAll('[class*="__row"]')].filter(shown).length,
    label: [...sc.querySelectorAll('[class*="__label"]')].filter(shown).map((e) => e.textContent),
    safe: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mm-safe')),
  };
}, [t, id]);

// The RGB of the frame at (x, y), read from the rendered PNG.
async function pixel(page, t, x, y) {
  const img = decodePng(await framePng(page, t));
  const i = (Math.round(y) * img.width + Math.round(x)) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}
const near = (a, b, tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const centre = (b) => [b.x + b.w / 2, b.y + b.h / 2];

test('layouts/media framed: a declared, decoded, covering picture under its headline, filling the frame inside the safe area', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await open(format);
    try {
      const { schedule } = await o.mm.meta();
      const t = restOf(schedule, 'framed');
      const r = await read(o.page, t, 'framed');
      assert.equal(r.imgs.length, 1);
      const [img] = r.imgs;
      assert.equal(img.src, 'assets/grid.png', `${format}: the beat asset is the src`);
      assert.ok(img.media, `${format}: the picture is declared data-media`);
      assert.ok(img.complete && img.natural === 480, `${format}: decoded before the first seek`);
      assert.equal(img.fit, 'cover');
      const { width: W, height: H } = o.viewport, s = r.safe;
      for (const b of [img.box, r.headline, r.caption]) {
        assert.ok(b.x >= s - 1 && b.y >= s - 1 && b.x + b.w <= W - s + 1 && b.y + b.h <= H - s + 1, `${format}: ${JSON.stringify(b)} inside the safe area`);
      }
      assert.ok(r.headline.y + r.headline.h <= img.box.y + 1, `${format}: the headline sits above the picture`);
      assert.ok(r.caption.y >= img.box.y + img.box.h - 1, `${format}: the caption sits under the picture`);
      assert.ok(Math.abs(img.box.w / img.box.h - 480 / 270) < 0.01, `${format}: the frame takes the picture's proportions`);
      if (format === '16x9') assert.ok(img.box.w * img.box.h >= 0.35 * W * H, `${format}: the picture fills the frame (${Math.round(100 * img.box.w * img.box.h / (W * H))} %)`);
      else assert.ok(img.box.w >= 0.85 * (W - 2 * s), `${format}: a landscape picture takes the full measure (${Math.round(img.box.w)} px)`);
      const mid = (r.headline.y + r.caption.y + r.caption.h) / 2;
      assert.ok(mid > 0.3 * H && mid < 0.52 * H, `${format}: the block is centred under the top row, a little above the middle (H-FILL): ${Math.round(100 * mid / H)} %`);
      assert.ok(near(await pixel(o.page, t, ...centre(img.box)), MIDDLE), `${format}: the picture is drawn`);
      assert.deepEqual(o.errors, []);
      assert.deepEqual((await o.mm.meta()).warnings, []);
    } finally { await o.close(); }
  }
});

test('layouts/media: the kit writes the picture\'s shape; in 16x9 a portrait picture stands beside its text at full height', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await open(format);
    try {
      const { schedule } = await o.mm.meta();
      const r = await read(o.page, restOf(schedule, 'portrait'), 'portrait');
      const shape = await o.page.evaluate(() => ['framed', 'portrait'].map((id) => document.querySelector(`[data-scene="${id}"] [data-slot="image"]`).dataset.assetShape));
      assert.deepEqual(shape, ['landscape', 'portrait']);
      const [img] = r.imgs;
      const { width: W, height: H } = o.viewport;
      assert.ok(Math.abs(img.box.w / img.box.h - 270 / 480) < 0.01, `${format}: the frame takes the picture's proportions`);
      if (format === '16x9') {
        assert.ok(img.box.x >= r.headline.x + r.headline.w - 1 && img.box.x >= r.caption.x + r.caption.w - 1, `${format}: the picture stands to the right of its text`);
        assert.ok(img.box.h >= 0.7 * H, `${format}: at nearly full height (${Math.round(img.box.h)} px)`);
      } else {
        assert.ok(r.headline.y + r.headline.h <= img.box.y + 1 && r.caption.y >= img.box.y + img.box.h - 1, `${format}: stacked`);
      }
      for (const b of [img.box, r.headline, r.caption]) assert.ok(b.x >= r.safe - 1 && b.y >= r.safe - 1 && b.x + b.w <= W - r.safe + 1 && b.y + b.h <= H - r.safe + 1, `${format}: inside the safe area: ${JSON.stringify(b)}`);
    } finally { await o.close(); }
  }
});

test('layouts/media bleed: the picture covers the whole frame and the headline sits on a plate inside the safe area', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await open(format);
    try {
      const { schedule } = await o.mm.meta();
      const t = restOf(schedule, 'bleed');
      const r = await read(o.page, t, 'bleed');
      const [img] = r.imgs;
      const { width: W, height: H } = o.viewport;
      assert.ok(img.frame.x <= 0 && img.frame.y <= 0 && img.frame.w >= W && img.frame.h >= H, `${format}: the frame is the whole picture: ${JSON.stringify(img.frame)}`);
      assert.ok(r.headline.y >= r.safe - 1 && r.headline.x >= r.safe - 1, `${format}: the headline stays inside the safe area`);
      const bg = await o.page.evaluate(() => getComputedStyle(document.querySelector('[data-scene="bleed"] [data-slot="headline"]')).backgroundColor);
      assert.notEqual(bg, 'rgba(0, 0, 0, 0)', `${format}: the text sits on a plate, never on the picture`);
    } finally { await o.close(); }
  }
});

test('devices/phone, browser, laptop: a beat asset fills the screen as a declared covering picture; without one the placeholder screen stays', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await open(format);
    try {
      const { schedule } = await o.mm.meta();
      for (const [id, screen] of [['phone', '.phone__screen'], ['browser', '.browser__screen'], ['laptop', '.laptop__screen']]) {
        const t = restOf(schedule, id);
        const r = await read(o.page, t, id);
        const [img] = r.imgs;
        assert.equal(img.src, 'assets/grid.png', `${format} ${id}: asset on the screen`);
        assert.ok(img.media && img.shown && img.natural === 480, `${format} ${id}: declared, shown, decoded`);
        assert.equal(img.fit, 'cover');
        const sb = await o.page.evaluate(([id, sel]) => { const r = document.querySelector(`[data-scene="${id}"] ${sel}`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, [id, screen]);
        assert.ok(Math.abs(img.frame.w - sb.w) < 1.5 && Math.abs(img.frame.h - sb.h) < 1.5, `${format} ${id}: the picture's frame is the screen`);
        assert.equal(r.rows, 0, `${format} ${id}: placeholder rows give way to the picture`);
        assert.ok(near(await pixel(o.page, t, ...centre(sb)), MIDDLE), `${format} ${id}: the picture is drawn on the screen`);
      }
      const plain = await read(o.page, restOf(schedule, 'plain'), 'plain');
      assert.ok(plain.imgs.every((i) => !i.shown), `${format}: no asset, no picture`);
      assert.ok(plain.rows >= 1 && plain.label.includes('Overview'), `${format}: no asset keeps the placeholder screen and its title`);
      assert.deepEqual(o.errors, []);
    } finally { await o.close(); }
  }
});

test('devices: size large fills more of the stage, inside the safe area and clear of the caption', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await open(format);
    try {
      const { schedule } = await o.mm.meta();
      const { width: W, height: H } = o.viewport;
      for (const [dev, regular] of [['phone', 'phone'], ['browser', 'browser'], ['laptop', 'laptop']]) {
        const box = async (id) => o.page.evaluate(([t, id, dev]) => { window.mm.seek(t); const r = document.querySelector(`[data-scene="${id}"] .${dev}`).getBoundingClientRect(); const c = document.querySelector(`[data-scene="${id}"] [data-slot="caption"]`)?.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cap: c ? c.y : null }; }, [restOf(schedule, id), id, dev]);
        const a = await box(regular), b = await box(`large-${dev}`);
        assert.ok(b.w * b.h >= 1.4 * a.w * a.h || b.w >= 0.85 * (W - 2 * 64), `${format} ${dev}: large is larger (${Math.round(a.w)} -> ${Math.round(b.w)} px wide)`);
        assert.ok(b.x >= 63 && b.y >= 63 && b.x + b.w <= W - 63 && b.y + b.h <= b.cap + 1, `${format} ${dev}: inside the safe area and above the caption: ${JSON.stringify(b)}`);
      }
    } finally { await o.close(); }
  }
});

test('layouts/bento-3: a tile takes an asset under its label; a tile without one keeps its plain fill', async () => {
  const o = await open('16x9');
  try {
    const { schedule } = await o.mm.meta();
    const t = restOf(schedule, 'bento');
    const tiles = await o.page.evaluate((t) => {
      window.mm.seek(t);
      return ['tile-1', 'tile-2', 'tile-3'].map((n) => {
        const tile = document.querySelector(`[data-scene="bento"] [data-slot="${n}"]`);
        const img = tile.querySelector('img');
        const r = tile.getBoundingClientRect(), ir = img?.getBoundingClientRect();
        return { text: tile.textContent.trim(), src: img?.getAttribute('src') ?? null, media: !!img?.hasAttribute('data-media'),
          shown: !!img && getComputedStyle(img).display !== 'none', fit: img ? getComputedStyle(img).objectFit : null,
          tile: { x: r.x, y: r.y, w: r.width, h: r.height }, img: ir ? { x: ir.x, y: ir.y, w: ir.width, h: ir.height } : null };
      });
    }, t);
    assert.equal(tiles[0].text, 'paper', 'the label survives beside the picture');
    assert.ok(tiles[0].src === 'assets/grid.png' && tiles[0].media && tiles[0].shown && tiles[0].fit === 'cover');
    assert.ok(tiles[1].src === 'assets/grid.png' && tiles[1].shown, 'a picture-only tile');
    assert.ok(!tiles[2].shown && tiles[2].text === 'linen', 'a text tile has no picture');
    assert.ok(near(await pixel(o.page, t, tiles[1].tile.x + tiles[1].tile.w / 2, tiles[1].tile.y + tiles[1].tile.h / 2), MIDDLE), 'the picture fills its tile');
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});

test('moves with target media: push-in, ken-burns and pan move the picture inside its clipping frame; the camera and the type stay put', async () => {
  const o = await open('16x9');
  try {
    const { schedule } = await o.mm.meta();
    for (const id of ['bleed', 'browser', 'laptop', 'bento']) {
      const sc = schedule.scenes.find((s) => s.id === id);
      const a = await read(o.page, sc.start + 0.05, id), b = await read(o.page, endOf(schedule, id), id);
      assert.equal(b.camera, 'none', `${id}: the camera is untouched`);
      const moved = b.imgs.map((i, k) => [a.imgs[k], i]).filter(([, i]) => i.src);
      assert.ok(moved.length >= 1);
      for (const [x, y] of moved) {
        assert.notEqual(x.transform, y.transform, `${id}: the picture moves over the scene`);
        assert.ok(/hidden|clip/.test(y.clip), `${id}: its frame clips it`);
        assert.ok(y.box.x <= y.frame.x + 0.5 && y.box.y <= y.frame.y + 0.5 && y.box.x + y.box.w >= y.frame.x + y.frame.w - 0.5 && y.box.y + y.box.h >= y.frame.y + y.frame.h - 0.5,
          `${id}: the moved picture still covers its frame: ${JSON.stringify({ box: y.box, frame: y.frame })}`);
      }
      if (id === 'bento') assert.deepEqual((await read(o.page, restOf(schedule, id), id)).headline, b.headline, `${id}: the headline does not move from the rest to the scene's end`);
    }
  } finally { await o.close(); }
});

test('media frames are pure in t: two fresh loads, in opposite orders, give byte-identical PNGs (mid-entrance, mid-move, rest)', async () => {
  const instants = [0.15, 0.5, 2.5, 4.3, 6.0, 9.6, 12.4, 15.7, 19.2, 20.5];
  const shoot = async (order) => {
    const o = await open('16x9');
    try { const out = {}; for (const t of order) out[t] = (await framePng(o.page, t)).toString('base64'); return out; } finally { await o.close(); }
  };
  const a = await shoot(instants), b = await shoot([...instants].reverse());
  for (const t of instants) assert.ok(a[t] === b[t], `frame at ${t}s differs between loads`);
});

test('a deck shows the asset at its rests too (device and media slot)', async () => {
  const o = await open('16x9', { story: 'deck' });
  try {
    for (const n of [1, 2]) {
      const s = await o.page.evaluate((n) => { window.mm.goto(n); return [...document.querySelectorAll('img[data-media]')].filter((i) => getComputedStyle(i).display !== 'none' && getComputedStyle(i).visibility === 'visible').map((i) => ({ src: i.getAttribute('src'), natural: i.naturalWidth })); }, n);
      assert.ok(s.some((i) => i.src === 'assets/grid.png' && i.natural === 480), `rest ${n}: ${JSON.stringify(s)}`);
    }
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});
