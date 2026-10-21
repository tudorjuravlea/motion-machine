// screen/compare on a device: the flat phone clips the revealed screen right of the line
// and draws the line; the 3D phone copies both into its texture. Story: tests/kit/media/compare.json
// (a blue screen, an orange one revealed).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = () => openPiece(PAGE, { server, browser, format: '9x16', query: { story: 'compare' } });
const startOf = async (o, scene) => (await o.mm.meta()).schedule.items.find((it) => it.scene === scene && it.beat?.slot === 'stage').start;

const FLAT = () => {
  const scr = document.querySelector('[data-scene="flat"] [data-screen]'), box = scr.getBoundingClientRect();
  const b = scr.querySelector('.mm-screen__content[data-asset="assets/compare-b.svg"]');
  const fx = scr.querySelector('.mm-screen-fx[data-do="screen/compare"]'), line = fx?.querySelector('.mm-compare__line');
  const lr = line?.getBoundingClientRect();
  return { clip: b.style.clipPath, hidden: b.style.visibility === 'hidden', shown: fx?.style.display === 'block', lineAt: lr ? (lr.left + lr.width / 2 - box.left) / box.width : null };
};

test('screen/compare on the flat phone: hidden before it starts, the line travels in from the right edge, then holds at stop', async () => {
  const o = await open();
  try {
    const t0 = await startOf(o, 'flat');
    const look = async (t) => { await o.mm.seek(t); return o.page.evaluate(FLAT); };
    const before = await look(t0 + 0.5);
    assert.equal(before.hidden, true); assert.equal(before.shown, false);
    const mid = await look(t0 + 1 + 0.125 * 4);
    const cut = Number(/([\d.]+)%\)$/.exec(mid.clip)[1]) / 100;   // the style's move curve eases the travel
    assert.ok(cut > 0.5 && cut < 1, `part-way: ${mid.clip}`);
    assert.ok(Math.abs(mid.lineAt - cut) < 0.01, `the line (${mid.lineAt}) sits on the cut (${cut})`);
    for (const t of [t0 + 2, t0 + 5.9]) {
      const held = await look(t);
      assert.equal(held.clip, 'inset(0px 0px 0px 50%)');
      assert.ok(Math.abs(held.lineAt - 0.5) < 0.01, `held at ${held.lineAt}`);
    }
  } finally { await o.close(); }
});

test('screen/compare on the 3D phone: the texture shows the screen left of the line and the revealed one right of it', async () => {
  const o = await open();
  try {
    const t = (await startOf(o, 'deep')) + 5;
    const png = decodePng(await framePng(o.page, t));
    const c = await o.page.evaluate(() => { const cv = document.querySelector('[data-scene="deep"] canvas[data-3d]'); const r = cv.getBoundingClientRect(); return { compare: cv.dataset.compare, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
    assert.equal(c.compare, '0.5');
    const px = (x, y) => { const i = (Math.round(y) * png.width + Math.round(x)) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
    const left = px(c.cx - 90, c.cy + 160), right = px(c.cx + 90, c.cy + 160);
    assert.ok(left[2] > left[0] + 40, `left of the line is the blue screen: ${left}`);
    assert.ok(right[0] > right[2] + 40, `right of the line is the orange one: ${right}`);
  } finally { await o.close(); }
});

test('screen/compare on the 3D phone can reveal the screen it started with, after a swap (layers paint in stacking order)', async () => {
  const o = await open();
  try {
    const t = (await startOf(o, 'back')) + 5;
    const png = decodePng(await framePng(o.page, t));
    const c = await o.page.evaluate(() => { const cv = document.querySelector('[data-scene="back"] canvas[data-3d]'); const r = cv.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
    const px = (x, y) => { const i = (Math.round(y) * png.width + Math.round(x)) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
    const left = px(c.cx - 90, c.cy + 160), right = px(c.cx + 90, c.cy + 160);
    assert.ok(left[0] > left[2] + 40, `left of the line is the swapped-in orange screen: ${left}`);
    assert.ok(right[2] > right[0] + 40, `right of the line is the first, blue screen: ${right}`);
  } finally { await o.close(); }
});
