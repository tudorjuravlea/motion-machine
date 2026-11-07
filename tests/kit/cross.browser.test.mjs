// 3d/phone move "cross" in a page: the phone faces the viewer on the left, travels to the
// right making one full turn, and a screen swapped while its back faces the viewer arrives unseen.
// Story: tests/kit/media/cross.json (a blue screen; an orange one, cut in half-way).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

test('the phone crosses from left to right with one turn; the swap happens behind its back', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'cross' } });
  try {
    const shot = async (t) => {
      const png = decodePng(await framePng(o.page, t));
      const c = await o.page.evaluate(() => { const cv = document.querySelector('canvas[data-3d]'); const r = cv.getBoundingClientRect(); return { x: Number(cv.dataset.x), face: cv.dataset.face, left: r.left, w: r.width, cy: r.top + r.height / 2 }; });
      const px = (fx) => { const i = (Math.round(c.cy) * png.width + Math.round(c.left + c.w * (0.5 + fx))) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
      return { ...c, at: px };
    };
    const a = await shot(1);
    assert.equal(a.x, -0.28); assert.equal(a.face, 'front');
    const blue = a.at(-0.28);
    assert.ok(blue[2] > blue[0] + 40, `the phone faces us on the left, blue: ${blue}`);
    const mid = await shot(1.5 + 1.2);
    assert.equal(mid.face, 'back', 'half-way its back is to the viewer');
    const b = await shot(5);
    assert.equal(b.x, 0.28); assert.equal(b.face, 'front');
    const orange = b.at(0.28);
    assert.ok(orange[0] > orange[2] + 40, `on the right it shows the swapped screen, orange: ${orange}`);
  } finally { await o.close(); }
});
