// The unit of a travel distance is stated by its param. A param declared in px is px of the page
// (every format is 1080 px on its short side, so a px nudge is the same share of it everywhere);
// a param declared as a multiple of ctx.unit scales with the format's type size. Both are
// multiplied by the style's travel.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

const startOffsets = async (format) => {
  const o = await openPiece(PAGE, { server, browser, format, query: { story: 'travel-units' } });
  try {
    const items = (await o.mm.meta()).schedule.items;
    const read = async (slot) => {
      await o.mm.seek(items.find((i) => i.slot === slot).start);
      return o.page.evaluate((s) => document.querySelector(`[data-slot="${s}"]`).style.translate, slot);
    };
    const travel = await o.page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--mm-travel')));
    return { rise: await read('headline'), drop: await read('sub'), travel };
  } finally { await o.close(); }
};

test('rise travels d px of the page in every format; drop travels a multiple of the format unit', async () => {
  const tall = await startOffsets('9x16');
  const wide = await startOffsets('16x9');
  assert.equal(tall.travel, wide.travel);
  const px = (v) => Number(/(-?[\d.]+)px$/.exec(v)[1]);
  assert.equal(px(tall.rise), 60 * tall.travel, 'rise: d px × travel in 9x16');
  assert.equal(px(wide.rise), 60 * wide.travel, 'rise: the same px in 16x9');
  const capTall = 0.75 * 168 * tall.travel, capWide = 0.75 * 136 * wide.travel;
  assert.ok(Math.abs(px(tall.drop)) <= capTall + 1e-6, `drop in 9x16 is at most 0.75 × 168 × travel (${tall.drop})`);
  assert.ok(Math.abs(px(wide.drop)) <= capWide + 1e-6, `drop in 16x9 is at most 0.75 × 136 × travel (${wide.drop})`);
});
