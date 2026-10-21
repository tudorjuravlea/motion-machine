// seek(t) stays synchronous; mm.settle() resolves once every decode the last
// seek asked for is done, and the renderer awaits it before reading pixels.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (query = {}) => openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'film', ...query } });

test('settle resolves at once with nothing pending', async () => {
  const o = await open();
  try {
    const ms = await o.page.evaluate(async () => { window.mm.seek(1); const a = performance.now(); await window.mm.settle(); return performance.now() - a; });
    assert.ok(ms < 50, `settle took ${ms} ms`);
  } finally { await o.close(); }
});

test('settle waits for a tracked decode', async () => {
  const o = await open();
  try {
    await o.page.evaluate(async () => {
      const { trackDecode } = await import('../../../runtime/kit/kit.js');
      let release; window.__p = new Promise((r) => { release = r; }); window.__release = release;
      trackDecode(window.__p);
      window.__settled = false; window.mm.settle().then(() => { window.__settled = true; });
    });
    assert.equal(await o.page.evaluate(() => window.__settled), false, 'settle resolved before the tracked promise');
    await o.page.evaluate(async () => { window.__release(); await window.mm.settle(); });
    assert.equal(await o.page.evaluate(() => window.__settled), true);
  } finally { await o.close(); }
});

test('framePng and mm.seek await settle', async () => {
  const o = await open();
  try {
    await o.page.evaluate(() => { const s = window.mm.settle; window.__calls = 0; window.mm.settle = () => { window.__calls++; return s(); }; });
    await framePng(o.page, 0.5); await framePng(o.page, 1); await o.mm.seek(1.5);
    assert.equal(await o.page.evaluate(() => window.__calls), 3);
  } finally { await o.close(); }
});

test('an afterSettle callback runs once the decodes of the seek are done, and settle waits for it', async () => {
  const o = await open();
  try {
    const seen = await o.page.evaluate(async () => {
      const { trackDecode, afterSettle } = await import('../../../runtime/kit/kit.js');
      window.mm.seek(1);
      let release; const p = new Promise((r) => { release = r; });
      window.__decoded = false;
      trackDecode(p.then(() => { window.__decoded = true; }));
      afterSettle(() => { window.__seen = window.__decoded; });
      const s = window.mm.settle();
      release();
      await s;
      return window.__seen;
    });
    assert.equal(seen, true);
  } finally { await o.close(); }
});
