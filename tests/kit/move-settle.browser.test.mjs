// A move with `end: "settle"` ends at the scene's settle instant (ctx.settle, seconds from the
// scene's start) and holds its end pose, so the scene's rest is still. Without it the move runs the
// whole scene.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

test('end: settle reaches the end pose at the scene rest and holds it to the last frame', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'move-settle' } });
  try {
    const meta = await o.mm.meta();
    const scene = meta.scenes.find((s) => s.id === 'one');
    const hold = meta.schedule.holds.find((h) => h.scene === 'one');
    const camera = async (t) => { await o.mm.seek(t); return o.page.evaluate(() => document.querySelector('[data-scene="one"] .mm-camera').style.transform); };
    const atRest = await camera(hold.from);
    assert.notEqual(atRest, '', 'the camera has moved by the rest');
    assert.equal(await camera(scene.end - 0.01), atRest, 'the pose at the last frame equals the pose at the rest');
    assert.notEqual(await camera(scene.start + (hold.from - scene.start) / 2), atRest, 'the camera is still moving halfway to the rest');
  } finally { await o.close(); }
});

test('without end: settle the move runs the whole scene', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'move-settle' } });
  try {
    const meta = await o.mm.meta();
    const scene = meta.scenes.find((s) => s.id === 'two');
    const hold = meta.schedule.holds.find((h) => h.scene === 'two');
    const camera = async (t) => { await o.mm.seek(t); return o.page.evaluate(() => document.querySelector('[data-scene="two"] .mm-camera').style.transform); };
    assert.notEqual(await camera(scene.end - 0.01), await camera(hold.from), 'the camera still moves after the rest');
  } finally { await o.close(); }
});
