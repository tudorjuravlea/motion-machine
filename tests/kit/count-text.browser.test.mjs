// entrances/count with no value counts the first number in the slot's text and keeps the words
// around it: "Save 40% today" lands as "Save 40% today", not as "40"; a grouped number counts as one.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

const textAt = async (o, scene, t) => {
  await o.mm.seek(t);
  return o.page.evaluate((id) => document.querySelector(`[data-scene="${id}"] [data-slot="headline"]`).textContent, scene);
};

test('the text around the counted number stays: "Save 40% today" lands whole', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'count-text' } });
  try {
    const it = (await o.mm.meta()).schedule.items.find((x) => x.scene === 'one');
    assert.equal(await textAt(o, 'one', it.start + it.d + 0.01), 'Save 40% today');
    const mid = await textAt(o, 'one', it.start + it.d * 0.5);
    assert.match(mid, /^Save \d+% today$/);
    assert.notEqual(mid, 'Save 40% today');
  } finally { await o.close(); }
});

test('a grouped number counts as one number and lands with its words', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'count-text' } });
  try {
    const it = (await o.mm.meta()).schedule.items.find((x) => x.scene === 'two');
    assert.equal(await textAt(o, 'two', it.start + it.d + 0.01), '1250 users');
  } finally { await o.close(); }
});
