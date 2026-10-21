// Phone and laptop upgrades: a phone with an island, a notch or
// neither, a status bar with its time; a laptop with a camera notch and a short menu; the device
// finish from the brand (devices.finish); and the screen layer stays visible over a still asset.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => {
  if (!existsSync(join(PAGE, 'assets/site/media.json'))) spawnSync(process.execPath, [join(ROOT, 'scripts/mm.mjs'), 'capture', 'site', '--url', pathToFileURL(join(ROOT, 'fixtures/site/index.html')).href, '--name', 'site', '--piece', PAGE, '--mark', 'Pricing=#pricing', '--mark', 'Signup=.cta']);
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); });
const open = (query = {}) => openPiece(PAGE, { server, browser, format: '9x16', query: { story: 'devices', ...query } });
const restOf = async (o, id) => { const s = (await o.mm.meta()).schedule; const sc = s.scenes.find((x) => x.id === id); return sc.end - 0.05; };
const probe = (page, id) => page.evaluate((id) => {
  const sc = document.querySelector(`[data-scene="${id}"]`);
  const box = (el) => { if (!el || getComputedStyle(el).display === 'none') return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const q = (s) => sc.querySelector(s);
  return { screen: box(q('[data-screen]')), island: box(q('.phone__island')), notch: box(q('.phone__notch')), status: box(q('.phone__status')),
    time: q('.phone__time')?.textContent ?? null, cam: box(q('.laptop__cam')), lid: box(q('.laptop__lid')),
    menu: [...sc.querySelectorAll('.laptop__menu-item')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.textContent),
    layer: box(q('.mm-screen')) };
}, id);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

test('the default phone has today\'s proportions and an island: 0.239 of the screen width, 0.043 of its height, 0.016 from the top', async () => {
  const o = await open();
  try {
    await o.mm.seek(await restOf(o, 'island'));
    const p = await probe(o.page, 'island');
    assert.ok(p.island && !p.notch, JSON.stringify(p));
    assert.ok(near(p.island.w / p.screen.w, 0.2385, 0.005), `width ${p.island.w / p.screen.w}`);
    assert.ok(near(p.island.h / p.screen.h, 0.0431, 0.004), `height ${p.island.h / p.screen.h}`);
    assert.ok(near((p.island.y - p.screen.y) / p.screen.h, 0.0161, 0.004), `top ${(p.island.y - p.screen.y) / p.screen.h}`);
    const body = await o.page.evaluate(() => { const r = document.querySelector('[data-scene="island"] .phone').getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x }; });
    assert.ok(near(body.w / body.h, 0.4777, 0.005), `body proportion ${body.w / body.h}`);
    assert.ok(near((p.screen.x - body.x) / body.w, 0.0348, 0.006), `screen inset ${(p.screen.x - body.x) / body.w}`);
    assert.ok(near(p.island.x + p.island.w / 2, p.screen.x + p.screen.w / 2, 1), 'centred');
  } finally { await o.close(); }
});

test('model notch draws a notch and no island; model plain draws neither', async () => {
  const o = await open();
  try {
    await o.mm.seek(await restOf(o, 'notch'));
    const n = await probe(o.page, 'notch');
    assert.ok(n.notch && !n.island, JSON.stringify(n));
    await o.mm.seek(await restOf(o, 'plain'));
    const p = await probe(o.page, 'plain');
    assert.ok(!p.notch && !p.island, JSON.stringify(p));
    assert.equal(p.status, null, 'status: false hides the status bar');
  } finally { await o.close(); }
});

test('the status bar shows 10:00 on a bare phone, stays off over a picture unless asked, and shows statusTime', async () => {
  const o = await open();
  try {
    await o.mm.seek(await restOf(o, 'bare'));
    const bare = await probe(o.page, 'bare');
    assert.ok(bare.status); assert.equal(bare.time, '10:00');
    await o.mm.seek(await restOf(o, 'island'));
    assert.equal((await probe(o.page, 'island')).status, null, 'a picture carries its own status bar');
    await o.mm.seek(await restOf(o, 'time'));
    const t = await probe(o.page, 'time');
    assert.equal(t.time, '10:08'); assert.ok(t.status);
  } finally { await o.close(); }
});

test('a screen layer over a still asset stays visible (the placeholder rule hides only placeholders)', async () => {
  const o = await open();
  try {
    await o.mm.seek(await restOf(o, 'still-tap'));
    const p = await probe(o.page, 'still-tap');
    assert.ok(p.layer && p.layer.w > 0, 'the screen layer is hidden');
  } finally { await o.close(); }
});

test('devices.finish sets the device colours: silver differs from the default', async () => {
  const a = await open(), b = await open({ finish: 'silver' });
  try {
    const body = (o) => o.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mm-device-body').trim());
    const [x, y] = [await body(a), await body(b)];
    assert.ok(x && y && x !== y, `default ${x}, silver ${y}`);
  } finally { await a.close(); await b.close(); }
});

test('the laptop has a camera notch (0.12 of the lid width), a menu of at most 5 items, and model plain drops the notch', async () => {
  const o = await open();
  try {
    await o.mm.seek(await restOf(o, 'laptop-menu'));
    const l = await probe(o.page, 'laptop-menu');
    assert.ok(l.cam, 'no camera notch');
    assert.ok(near(l.cam.w / l.lid.w, 0.12, 0.01), `notch width ${l.cam.w / l.lid.w}`);
    assert.deepEqual(l.menu, ['File', 'Edit', 'View', 'Go', 'Window']);
    await o.mm.seek(await restOf(o, 'laptop-plain'));
    const p = await probe(o.page, 'laptop-plain');
    assert.equal(p.cam, null); assert.deepEqual(p.menu, []);
  } finally { await o.close(); }
});

test('beat text on a device with a folder asset is hidden, not covered by the screen layer', async () => {
  const o = await open();
  try {
    await o.mm.seek(await restOf(o, 'folder-text'));
    const shown = await o.page.evaluate(() => {
      const l = document.querySelector('[data-scene="folder-text"] .phone__label');
      return getComputedStyle(l).display !== 'none' && l.getClientRects().length > 0;
    });
    assert.equal(shown, false);
  } finally { await o.close(); }
});

test('every device finish stands apart from the canvas in every shipped preset', async () => {
  const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  for (const preset of ['editorial', 'kinetic', 'calm-product', 'nocturne-kinetic']) {
    for (const finish of ['ink', 'canvas', 'graphite', 'silver']) {
      const o = await open({ preset, finish });
      try {
        await o.mm.seek(await restOf(o, 'bare'));
        // the finish colour itself (the shell draws it as a metal gradient, not a flat fill)
        const [body, canvas] = await o.page.evaluate(() => { const i = document.createElement('i'); i.style.color = 'var(--mm-device-body)'; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return [c, getComputedStyle(document.body).backgroundColor]; });
        assert.ok(ratio(rgb(body), rgb(canvas)) >= 1.3, `${preset} ${finish}: body ${body} on canvas ${canvas}`);
      } finally { await o.close(); }
    }
  }
});

// ---- realistic, polished devices ----
const look = (page, id) => page.evaluate((id) => {
  const sc = document.querySelector(`[data-scene="${id}"]`);
  const cs = (el, pseudo) => (el ? getComputedStyle(el, pseudo) : null);
  const phone = sc.querySelector('.phone'), shell = sc.querySelector('.phone__shell'), screen = sc.querySelector('[data-screen]');
  const laptop = sc.querySelector('.laptop'), lid = sc.querySelector('.laptop__lid'), deck = sc.querySelector('.laptop__deck');
  const glass = getComputedStyle(document.documentElement).getPropertyValue('--mm-device-glass').trim();
  return {
    glass,
    shell: shell && { border: parseFloat(cs(shell).borderTopWidth), bg: cs(shell).backgroundImage, pad: parseFloat(cs(shell).paddingTop) },
    buttons: phone && [cs(phone, '::before'), cs(phone, '::after')].map((p) => parseFloat(p.width) > 0 && parseFloat(p.height) > 0),
    sheen: screen && cs(screen, '::after').backgroundImage,
    shadow: (phone ?? laptop) && cs(phone ?? laptop).filter,
    lid: lid && { border: parseFloat(cs(lid).borderTopWidth), bg: cs(lid).backgroundImage },
    deck: deck && cs(deck).backgroundImage,
  };
}, id);

test('the phone has a metal rim, a glass bezel, side buttons, a glass sheen and a soft shadow at rest', async () => {
  const o = await open();
  try {
    await o.mm.seek(await restOf(o, 'look-phone'));
    const r = await look(o.page, 'look-phone');
    assert.match(r.glass, /^(#[0-9A-Fa-f]{6}|var\(--mm-color-)/, 'the glass is a palette role');
    assert.ok(r.shell.border > 0 && r.shell.pad > r.shell.border, `a rim, then a wider bezel: ${JSON.stringify(r.shell)}`);
    assert.equal((r.shell.bg.match(/linear-gradient/g) ?? []).length, 2, r.shell.bg);
    assert.deepEqual(r.buttons, [true, true]);
    assert.match(r.sheen, /linear-gradient/);
    assert.ok((r.shadow.match(/drop-shadow/g) ?? []).length >= 2, r.shadow);
  } finally { await o.close(); }
});

test('the laptop has a rimmed lid with a glass bezel, a shaded deck and a soft shadow at rest', async () => {
  const o = await open();
  try {
    await o.mm.seek(await restOf(o, 'look-laptop'));
    const r = await look(o.page, 'look-laptop');
    assert.ok(r.lid.border > 0, JSON.stringify(r.lid));
    assert.equal((r.lid.bg.match(/linear-gradient/g) ?? []).length, 2, r.lid.bg);
    assert.match(r.deck, /linear-gradient/);
    assert.ok((r.shadow.match(/drop-shadow/g) ?? []).length >= 2, r.shadow);
  } finally { await o.close(); }
});

test('metal glow and reflections, glossy glass: specular bands on the rim, a lit inner edge, a glow, a two-layer screen reflection', async () => {
  const o = await open();
  try {
    for (const id of ['look-phone', 'look-laptop']) {
      await o.mm.seek(await restOf(o, id));
      const r = await o.page.evaluate((id) => {
        const sc = document.querySelector(`[data-scene="${id}"]`);
        const frame = sc.querySelector('.phone__shell, .laptop__lid'), screen = sc.querySelector('[data-screen]'), dev = sc.querySelector('.phone, .laptop');
        const rim = getComputedStyle(frame).backgroundImage.split('linear-gradient').pop();
        return { stops: (rim.match(/color-mix|rgb/g) ?? []).length, inner: getComputedStyle(frame).boxShadow, glow: (getComputedStyle(dev).filter.match(/drop-shadow/g) ?? []).length,
          gloss: (getComputedStyle(screen, '::after').backgroundImage.match(/gradient/g) ?? []).length };
      }, id);
      assert.ok(r.stops >= 7, `${id}: the rim carries light bands, ${r.stops} stops`);
      assert.match(r.inner, /inset/, `${id}: a lit inner edge`);
      assert.equal(r.glow, 3, `${id}: contact shadow, ambient shadow and a metal glow`);
      assert.ok(r.gloss >= 2, `${id}: a diagonal reflection and a top highlight on the glass`);
    }
  } finally { await o.close(); }
});

test('a device with your own frame image: the frame sits over the screen, the screen fills its hole, the built-in shell steps aside', async () => {
  const o = await open();
  try {
    await o.mm.seek(await restOf(o, 'framed'));
    const meta = JSON.parse(readFileSync(join(PAGE, 'assets/frames/test-phone.json'), 'utf8'));
    const r = await o.page.evaluate(() => {
      const sc = document.querySelector('[data-scene="framed"]');
      const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      const dev = sc.querySelector('.phone'), img = sc.querySelector('img.mm-device-frame'), screen = sc.querySelector('[data-screen]'), shell = sc.querySelector('.phone__shell');
      return { framed: sc.querySelector('[data-slot="stage"]').hasAttribute('data-frame'), media: img?.hasAttribute('data-media'), src: img?.getAttribute('src'), loaded: img?.naturalWidth > 0,
        dev: box(dev), img: img && box(img), screen: box(screen), shellBg: getComputedStyle(shell).backgroundImage, button: getComputedStyle(dev, '::before').content, island: getComputedStyle(sc.querySelector('.phone__island')).display, sheen: getComputedStyle(screen, '::after').content };
    });
    assert.ok(r.framed && r.media && r.loaded && r.src.endsWith('assets/frames/test-phone.png'), JSON.stringify(r));
    assert.ok(Math.abs(r.dev.w / r.dev.h - meta.image.w / meta.image.h) < 0.01, 'the device takes the frame image\'s proportions');
    assert.ok(Math.abs(r.img.w - r.dev.w) < 1.5 && Math.abs(r.img.h - r.dev.h) < 1.5, 'the frame covers the device');
    const k = r.dev.w / meta.image.w, s = meta.screen;
    for (const [a, b] of [[r.screen.x - r.dev.x, s.x * k], [r.screen.y - r.dev.y, s.y * k], [r.screen.w, s.w * k], [r.screen.h, s.h * k]]) assert.ok(Math.abs(a - b) < 1.5, `screen in the hole: ${a} vs ${b}`);
    assert.equal(r.shellBg, 'none'); assert.equal(r.button, 'none'); assert.equal(r.island, 'none'); assert.equal(r.sheen, 'none', 'the frame brings its own glass');
  } finally { await o.close(); }
});

test('model punch: a round camera dot 0.071 of the screen wide, 0.020 from the top, centred; the body a touch wider; buttons on one side only', async () => {
  const o = await open();
  try {
    await o.mm.seek(await restOf(o, 'punch'));
    const p = await probe(o.page, 'punch');
    assert.ok(p.island, JSON.stringify(p));
    assert.ok(Math.abs(p.island.w - p.island.h) < 1.5, 'a round dot');
    assert.ok(near(p.island.w / p.screen.w, 0.071, 0.005), `dot ${p.island.w / p.screen.w}`);
    assert.ok(near((p.island.y - p.screen.y) / p.screen.h, 0.0196, 0.004), `top ${(p.island.y - p.screen.y) / p.screen.h}`);
    assert.ok(near(p.island.x + p.island.w / 2, p.screen.x + p.screen.w / 2, 1), 'centred');
    const r = await o.page.evaluate(() => { const ph = document.querySelector('[data-scene="punch"] .phone'), b = ph.getBoundingClientRect();
      return { ratio: b.width / b.height, left: getComputedStyle(ph, '::after').content, right: getComputedStyle(ph, '::before').content }; });
    assert.ok(near(r.ratio, 0.4724, 0.005), `body ${r.ratio}`);
    assert.equal(r.left, 'none', 'no buttons on the left'); assert.notEqual(r.right, 'none');
  } finally { await o.close(); }
});

test('the island phone has three keys on the left (action, volume up, volume down) and two on the right (power, camera key)', async () => {
  const o = await open();
  try {
    await o.mm.seek(await restOf(o, 'island'));
    const r = await o.page.evaluate(() => { const ph = document.querySelector('[data-scene="island"] .phone');
      const bands = (pseudo) => (getComputedStyle(ph, pseudo).backgroundImage.match(/transparent|rgba\(0, 0, 0, 0\)/g) ?? []).length; return { left: bands('::after'), right: bands('::before') }; });
    assert.deepEqual(r, { left: 4, right: 2 }, 'gaps between the keys, as transparent stops');
  } finally { await o.close(); }
});

test('model chin: the lid is 0.814 of the base wide, with thin side bezels, a deeper top and a chin, a camera dot and no notch', async () => {
  const o = await open();
  try {
    await o.mm.seek(await restOf(o, 'laptop-chin'));
    const r = await o.page.evaluate(() => { const sc = document.querySelector('[data-scene="laptop-chin"]'); const b = (s) => sc.querySelector(s).getBoundingClientRect();
      const lid = b('.laptop__lid'), scr = b('[data-screen]'), lap = b('.laptop'), cam = b('.laptop__cam');
      return { lidW: lid.width / lap.width, side: (scr.left - lid.left) / lid.width, top: (scr.top - lid.top) / lid.height, chin: (lid.bottom - scr.bottom) / lid.height, cam: cam.width > 0 && Math.abs(cam.width - cam.height) < 1.5 && cam.width < lid.width * 0.02 }; });
    assert.ok(near(r.lidW, 0.814, 0.01), `lid ${r.lidW}`);
    assert.ok(near(r.side, 0.017, 0.004), `side ${r.side}`);
    assert.ok(near(r.top, 0.044, 0.006), `top ${r.top}`);
    assert.ok(near(r.chin, 0.055, 0.008), `chin ${r.chin}`);
    assert.ok(r.cam, 'a small round camera dot in the top bezel');
  } finally { await o.close(); }
});
