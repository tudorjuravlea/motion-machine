// A picture a seek asks for (a recording's frame, a page tile) that fails to decode leaves a blank
// screen; the kit says so in window.mm.warnings, once per file, instead of staying silent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

test('a frame that fails to decode at seek time is named once in mm.warnings', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'screen' } });
  try {
    await o.page.route(/\/assets\/rec\/f000[23]\d\.jpg/, (r) => r.abort());
    const named = async () => (await o.mm.meta()).warnings.filter((w) => /f000[23]\d\.jpg/.test(w));
    assert.deepEqual(await named(), [], 'nothing is missing at mount');
    await o.mm.seek(1.2);
    const first = await named();
    assert.equal(first.length, 1, `one warning naming the file (${first})`);
    await o.mm.seek(0.3);
    await o.mm.seek(1.2);
    assert.deepEqual(await named(), first, 'seeking the same frame again does not repeat it');
  } finally { await o.close(); }
});
