// The vendored Three.js (runtime/vendor/three/0.170.0) loads from the repository and
// renders a lit rounded box under the project's launch flags (SwiftShader), the same pixels each time.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, serveRoot, launchBrowser } from '../../scripts/lib/browser.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

test('the vendored module renders a lit rounded box to non-uniform pixels, identically twice', async () => {
  const shots = [];
  for (let i = 0; i < 2; i++) {
    const page = await browser.newPage({ viewport: { width: 480, height: 480 } });
    const errors = []; page.on('pageerror', (e) => errors.push(String(e.message)));
    await page.goto(`${server.url}/tests/kit/three/index.html`);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 20_000 }).catch(() => {});
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.draw(0.7));
    shots.push(await page.screenshot({ type: 'png' }));
    await page.close();
  }
  assert.ok(shots[0].equals(shots[1]), 'two renders differ');
  const img = decodePng(shots[0]);
  const colours = new Set();
  for (let i = 0; i < img.data.length; i += 4 * 97) colours.add((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]);
  assert.ok(colours.size > 40, `only ${colours.size} colours: nothing lit was drawn`);
});
