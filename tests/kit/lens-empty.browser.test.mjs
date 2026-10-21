// emphasis/lens softens the focused slot's siblings. A slot no beat filled (data-empty) is not
// managed by the kit, so the lens leaves it alone: its inline style never depends on the seek history.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

test('a lens emphasis writes no style on an empty sibling slot', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '9x16', query: { story: 'effects' } });
  try {
    const it = (await o.mm.meta()).schedule.items.find((x) => x.scene === 'lens' && x.slot === 'item-2');
    await o.mm.seek(it.emphasis.start + 0.5 * it.emphasis.d);
    const styles = await o.page.evaluate(() => [...document.querySelectorAll('[data-scene="lens"] [data-slot][data-empty]')].map((s) => s.getAttribute('style')));
    assert.ok(styles.length > 0, 'the scene has an empty slot');
    assert.ok(styles.every((s) => !s || !/filter|opacity/.test(s)), `empty slots keep their style (${JSON.stringify(styles)})`);
    const lit = await o.page.evaluate(() => [...document.querySelectorAll('[data-scene="lens"] [data-slot]:not([data-empty])')].filter((s) => s.style.filter).length);
    assert.ok(lit > 0, 'the filled siblings are still softened');
  } finally { await o.close(); }
});
