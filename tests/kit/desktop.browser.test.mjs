// layouts/desktop: a full-frame screen stage with a menu bar, a notch at top centre
// (data-island, so screen/island grows it), a two-colour wallpaper from palette roles, and a
// caption under the notch.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (format = '16x9', preset = 'kinetic') => openPiece(PAGE, { server, browser, format, query: { story: 'desktop', preset } });
const probe = (page) => page.evaluate(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const q = (s) => document.querySelector(s);
  return { frame: { w: innerWidth, h: innerHeight }, bar: box(q('.desktop__bar')), notch: box(q('.desktop__notch')), caption: box(q('[data-slot="caption"]')),
    menu: q('[data-slot="menu"]').textContent, menuMicro: q('[data-slot="menu"]').hasAttribute('data-micro'), wall: getComputedStyle(q('[data-slot="desk"]')).backgroundImage,
    screen: q('[data-slot="desk"]').hasAttribute('data-screen'), canvas: getComputedStyle(document.body).backgroundColor };
});

test('the menu bar spans the top and holds the notch at top centre and the menu as micro text', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await open(format);
    try {
      await o.mm.seek(0.5);
      const p = await probe(o.page);
      assert.equal(p.bar.y, 0); assert.ok(Math.abs(p.bar.w - p.frame.w) < 1);
      assert.equal(p.notch.y, 0); assert.ok(Math.abs(p.notch.x + p.notch.w / 2 - p.frame.w / 2) <= 1, `${format}: notch off centre`);
      assert.ok(p.notch.h <= p.bar.h + 1);
      assert.match(p.menu, /File/); assert.ok(p.menuMicro);
      assert.ok(p.screen, 'the desk is a screen');
      assert.ok(p.caption.y > p.bar.y + p.bar.h, 'the caption sits under the bar');
    } finally { await o.close(); }
  }
});

test('the wallpaper is a gradient from the chosen role into the canvas, nothing else', async () => {
  const o = await open();
  try {
    await o.mm.seek(0.5);
    const p = await probe(o.page);
    const colours = p.wall.match(/rgba?\([^)]*\)/g) ?? [];
    const accent = await o.page.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--mm-color-accent)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    assert.ok(colours.length >= 2, p.wall);
    assert.deepEqual([...new Set(colours)].sort(), [accent, p.canvas].sort());
  } finally { await o.close(); }
});

test('screen/island grows the desktop notch into a widget', async () => {
  const o = await open();
  try {
    await o.mm.seek(2.0);
    const w = await o.page.evaluate(() => ({ n: document.querySelector('.desktop__notch').offsetWidth, d: document.querySelector('[data-slot="desk"]').clientWidth, t: document.querySelector('.desktop__notch .island__text').textContent }));
    assert.ok(Math.abs(w.n / w.d - 0.4) < 0.01, JSON.stringify(w)); assert.equal(w.t, 'Now playing');
  } finally { await o.close(); }
});
