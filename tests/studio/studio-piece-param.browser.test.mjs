// The studio page takes `?piece=` as a repo folder of its own server and nothing else: a value that
// would read as another host (a backslash, a second slash, a scheme, `..`) opens no piece and
// sends no request off 127.0.0.1.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from '../../scripts/lib/browser.mjs';
import { startStudio } from '../../scripts/studio/server.mjs';
import { workCopy } from '../cli/cli-helpers.mjs';
import { waitMs } from './studio-bench-lib.mjs';

let browser, w, s;
before(async () => {
  browser = await launchBrowser();
  w = workCopy('studio-param');
  s = await startStudio({ piece: w.film });
});
after(async () => { await browser?.close(); await s?.close(); w?.cleanup(); });

test('a piece parameter that names another host opens nothing and sends no request off 127.0.0.1', async () => {
  for (const piece of ['%5Cevil.example', 'http%3A%2F%2Fevil.example', '..%2F..%2Fetc']) {
    const page = await browser.newPage();
    const hosts = new Set();
    await page.route('**/*', (route) => { hosts.add(new URL(route.request().url()).hostname); return route.request().url().startsWith(s.url) ? route.continue() : route.abort(); });
    try {
      await page.goto(`${s.url}/scripts/studio/ui/index.html?piece=${piece}`);
      await page.waitForFunction(() => /No piece/.test(document.body.textContent), null, { timeout: waitMs(15_000) });
      assert.deepEqual([...hosts], ['127.0.0.1'], piece);
    } finally { await page.close(); }
  }
});
