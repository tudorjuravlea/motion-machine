// A frame is the same however the playhead got there: a page that has just played an entrance paints the rest it lands
// on exactly as a page that went straight to it. The browser keeps raster state from the transforms an entrance used.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, framePng, launchBrowser, openPiece, serveRoot } from '../../scripts/lib/browser.mjs';

let browser, server;
before(async () => { browser = await launchBrowser(); server = await serveRoot(ROOT); });
after(async () => { await browser.close(); await server.close(); });

for (const [piece, t] of [['catalogue-looks-1', 20.667], ['catalogue-looks-4', 16.567], ['catalogue-moves-3', 9.667], ['catalogue-layouts-3', 8.333]]) {
  test(`${piece}: the rest at ${t} s after playing its scene equals the same rest drawn cold`, async () => {
    const o = await openPiece(join(ROOT, 'pieces', piece), { format: '16x9', browser, server });
    try {
      const cold = await framePng(o.page, t);
      const { schedule } = await o.mm.meta();
      const scene = schedule.scenes.find((s) => t >= s.start && t < s.end);
      for (let k = Math.ceil(scene.start * 30); k / 30 <= t; k++) await framePng(o.page, k / 30);
      assert.ok(cold.equals(await framePng(o.page, t)), 'played forward');
      for (let k = Math.floor(scene.end * 30) - 1; k / 30 >= t; k--) await framePng(o.page, k / 30);
      assert.ok(cold.equals(await framePng(o.page, t)), 'reached backward');
    } finally { await o.close(); }
  });
}
