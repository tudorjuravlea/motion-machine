// An entrance is finished from TOL before its end (the kit's progressOf and entrance()), and the
// pattern must see the same: the kit passes u = d within that tolerance (beyond the end u runs on, as
// the 3D devices' turns need; tests/kit/device3d.browser.test.mjs holds that), so a pattern that reads u / d (a
// typewriter flooring characters, a count, a cascade) draws its last state. Found by the catalogue
// films: at the rest that ended a typewriter, 15.9 − 15.3 = 0.5999… left "Hell" and a caret.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

test('a typewriter a hair before its end, where the kit counts it finished, shows the whole line', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'typewriter-end' } });
  try {
    const it = (await o.mm.meta()).schedule.items.find((i) => i.beat?.slot === 'headline');
    await o.mm.seek(it.start + it.d - 1e-12);
    const text = await o.page.evaluate(() => {
      const el = document.querySelector('[data-scene="one"] [data-slot="headline"]');
      return { all: el.textContent, caret: !!el.querySelector('.mm-typewriter__caret') };
    });
    assert.deepEqual(text, { all: 'Hello', caret: false });
  } finally { await o.close(); }
});

