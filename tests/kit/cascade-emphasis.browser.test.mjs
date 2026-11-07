// An emphasis on a cascade beat (params.each) writes into the same slot that holds the cascade's
// managed children. Every seek must start from the mounted markup, so nodes an emphasis added at
// one instant are gone at the next, and a frame is the same whether reached forward or backward.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
const EMPHASES = ['brackets', 'lens', 'marker-circle', 'stretch-pill', 'circumscribe', 'indicate', 'shine'];
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

for (const name of EMPHASES) {
  test(`emphasis/${name} on a cascade leaves no nodes behind across seeks`, async () => {
    const o = await openPiece(PAGE, { server, browser, format: '9x16', query: { story: 'cascade-emphasis' } });
    try {
      const it = (await o.mm.meta()).schedule.items.find((x) => !x.parent && x.scene === name && x.emphasis);
      const { start, d } = it.emphasis;
      const extra = () => o.page.evaluate((id) => document.querySelector(`[data-scene="${id}"] [data-slot="headline"]`)
        .querySelectorAll(':scope > :not(.mm-each)').length, name);
      const inside = [];
      for (const q of [0.3, 0.4, 0.5, 0.6, 0.3]) { await o.mm.seek(start + q * d); inside.push(await extra()); }
      assert.equal(inside[4], inside[0], `the same instant draws the same nodes (${inside})`);
      assert.ok(inside.every((n) => n === inside[0]), `nodes do not pile up across seeks (${inside})`);
      const sc = (await o.mm.meta()).scenes.find((x) => x.id === name);
      await o.mm.seek(sc.end - 0.05);
      assert.equal(await extra(), 0, 'after the emphasis the slot holds only the cascade');
      await o.mm.seek(sc.start + 0.01);
      assert.equal(await extra(), 0, 'before the emphasis the slot holds only the cascade');
      const forward = await framePng(o.page, start + 0.5 * d);
      await framePng(o.page, start + 0.9 * d);
      const backward = await framePng(o.page, start + 0.5 * d);
      assert.ok(forward.equals(backward), 'a frame reached forward and backward is byte-equal');
    } finally { await o.close(); }
  });
}

test('a sketch entrance on a cascade draws its strokes once however often it is seeked', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '9x16', query: { story: 'cascade-emphasis' } });
  try {
    const it = (await o.mm.meta()).schedule.items.find((x) => !x.parent && x.scene === 'sketch');
    const strokes = () => o.page.evaluate(() => document.querySelectorAll('[data-scene="sketch"] [data-slot="headline"] svg.mm-sketch').length);
    const counts = [];
    for (const q of [0.3, 0.5, 0.7, 0.5]) { await o.mm.seek(it.start + q * it.d); counts.push(await strokes()); }
    assert.ok(counts.every((n) => n === counts[0]), `strokes do not pile up across seeks (${counts})`);
  } finally { await o.close(); }
});

// layouts/desktop's `desk` slot holds another slot (`menu`), so the kit keeps its child list instead of
// restoring its markup: a sketch drawn on it must be removed by the next seek, forward or backward.
test('a sketch entrance on a slot that holds another slot draws its strokes once across forward and backward seeks', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '9x16', query: { story: 'cascade-emphasis' } });
  try {
    const it = (await o.mm.meta()).schedule.items.find((x) => !x.parent && x.scene === 'sketch-nested' && x.slot === 'desk');
    const strokes = () => o.page.evaluate(() => document.querySelectorAll('[data-scene="sketch-nested"] [data-slot="desk"] svg.mm-sketch').length);
    const counts = [];
    for (const q of [0.3, 0.5, 0.7, 0.9, 0.7, 0.5, 0.3, 0.5, 0.9, 0.3]) { await o.mm.seek(it.start + q * it.d); counts.push(await strokes()); }
    assert.ok(counts[0] > 0, `the sketch draws strokes on the nested slot (${counts})`);
    assert.ok(counts.every((n) => n === counts[0]), `strokes do not pile up across seeks (${counts})`);
    await o.mm.seek(it.start - 0.01);
    assert.equal(await strokes(), 0, 'before the entrance the slot holds no strokes');
  } finally { await o.close(); }
});
