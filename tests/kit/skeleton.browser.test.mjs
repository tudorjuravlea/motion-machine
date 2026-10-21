// The skeletons are the first files a new piece starts from. A missing story.json or style.json
// must fail with the file's name and the HTTP status, not with a JSON parse error on an empty body.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { ROOT, serveRoot, launchBrowser } from '../../scripts/lib/browser.mjs';

const TMP = join(ROOT, 'out');   // a piece folder two levels under the root, as the skeleton's import path assumes
const dirOf = (kind) => join(TMP, `test-skeleton-${process.pid}-${kind}`);
let server, browser;
before(async () => { mkdirSync(TMP, { recursive: true }); server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); for (const k of ['film', 'deck']) rmSync(dirOf(k), { recursive: true, force: true }); });

for (const kind of ['film', 'deck']) {
  test(`the ${kind} skeleton names the missing style.json and its status`, async () => {
    cpSync(join(ROOT, 'runtime/skeletons', kind), dirOf(kind), { recursive: true });   // story.json is there, style.json is not
    const page = await browser.newPage();
    try {
      const failed = page.waitForEvent('pageerror');
      await page.goto(`${server.url}/out/test-skeleton-${process.pid}-${kind}/index.html`);
      assert.match((await failed).message, /style\.json: 404/);
    } finally { await page.close(); }
  });
}
