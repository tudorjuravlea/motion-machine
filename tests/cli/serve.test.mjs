// `mm serve`: the wrapper page holds the play clock; ?press= opens a deck at a rest, Space advances
// it through the kit's cancellable mm:press event, ?t= opens a film paused at an instant and the
// keyboard steps it. The piece itself never owns a clock.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServe } from '../../scripts/serve.mjs';
import { workCopy } from './cli-helpers.mjs';

let w, browser;
before(async () => { w = workCopy('serve'); browser = await chromium.launch(); });
after(async () => { await browser?.close(); w.cleanup(); });

async function open(dir, opts) {
  const server = await startServe(dir, opts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.preview);
  await page.waitForFunction(() => document.getElementById('readout').textContent.length > 0, null, { timeout: 30_000 });
  const inner = page.frames().find((f) => f !== page.mainFrame());
  return { page, inner, errors, close: async () => { await page.close(); await server.close(); } };
}

test('deck: ?press=1 opens at rest 1; Space animates to rest 2 and lands there; Left goes back to a rest', async () => {
  const s = await open(w.deck, { press: 1 });
  try {
    assert.equal(await s.inner.evaluate(() => window.mm.position()), 1);
    assert.match(await s.page.textContent('#readout'), /press 1\.00 \/ 3/);
    await s.page.keyboard.press('Space');
    await s.inner.waitForFunction(() => window.mm.position() === 2, null, { timeout: 15_000 });
    await s.page.keyboard.press('ArrowLeft');
    assert.equal(await s.inner.evaluate(() => window.mm.position()), 1);
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('film: ?t=2.5 opens paused at 2.5 s; ArrowRight steps one second; the scrubber seeks', async () => {
  const s = await open(w.film, { t: 2.5 });
  try {
    assert.equal(await s.inner.evaluate(() => window.mm.report().t), 2.5);
    await s.page.keyboard.press('ArrowRight');
    assert.equal(await s.inner.evaluate(() => window.mm.report().t), 3.5);
    await s.page.locator('#scrub').fill('1');
    await s.page.waitForTimeout(100);
    assert.equal(await s.inner.evaluate(() => window.mm.report().t), 1);
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('a piece outside the repo is refused', async () => {
  await assert.rejects(startServe('/tmp'), /under the repo root/);
});

test('?piece= names a folder of this server only: a backslash or a second host in it opens nothing and no request leaves 127.0.0.1', async () => {
  const server = await startServe(w.film);
  try {
    for (const piece of ['%5Cevil.example', '..%2F..%2Fetc', 'http%3A%2F%2Fevil.example']) {
      const page = await browser.newPage();
      const hosts = new Set();
      await page.route('**/*', (route) => { hosts.add(new URL(route.request().url()).hostname); return route.request().url().startsWith(server.url) ? route.continue() : route.abort(); });
      try {
        await page.goto(`${server.url}/scripts/lib/serve-page.html?piece=${piece}`);
        await page.waitForFunction(() => document.body.textContent.includes('no piece'), null, { timeout: 15_000 });
        assert.deepEqual([...hosts], ['127.0.0.1'], piece);
      } finally { await page.close(); }
    }
  } finally { await server.close(); }
});
