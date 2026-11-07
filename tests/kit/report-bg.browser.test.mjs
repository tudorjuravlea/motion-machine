// report() gives each element the first non-transparent background up its ancestors, whichever way
// the browser writes "transparent": rgba(0, 0, 0, 0), transparent, or color(srgb r g b / 0) for a
// colour made with color-mix().
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

test('a fully transparent plate of any colour syntax is skipped when reporting the background', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'film' } });
  try {
    await o.mm.seek(1);
    const bgOf = async (plate) => o.page.evaluate((c) => {
      const slot = document.querySelector('[data-scene] [data-slot="headline"]');
      slot.style.backgroundColor = c;
      return window.mm.report().elements.find((e) => e.selector.includes('"headline"')).bg;
    }, plate);
    const plain = await bgOf('');
    for (const plate of ['transparent', 'rgba(10, 20, 30, 0)', 'color-mix(in srgb, red 0%, transparent)']) {
      assert.equal(await bgOf(plate), plain, plate);
    }
    assert.notEqual(await bgOf('rgb(10, 20, 30)'), plain, 'an opaque plate is the background');
  } finally { await o.close(); }
});
