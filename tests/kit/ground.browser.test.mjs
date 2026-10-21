// Brand ground: every scene draws the brand's ground behind its camera, blobs in their own
// colours, blurred by a share of the frame width, and a mark centred, scaled past the frame and
// faint. A style without a ground draws none.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (query, format = '16x9') => openPiece(PAGE, { server, browser, format, query: { story: 'film', preset: 'kinetic', ...query } });
const probe = (page) => page.evaluate(() => [...document.querySelectorAll('.mm-scene')].map((sc) => {
  const g = sc.querySelector(':scope > .mm-ground');
  if (!g) return null;
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const mark = g.querySelector('.mm-ground__mark');
  return {
    first: sc.firstElementChild === g, hidden: g.getAttribute('aria-hidden'), chrome: g.hasAttribute('data-chrome'), keep: g.hasAttribute('data-keep'),
    behind: Number(getComputedStyle(g).zIndex) < Number(getComputedStyle(sc.querySelector('.mm-camera')).zIndex || 0) || getComputedStyle(sc.querySelector('.mm-camera')).zIndex === 'auto' ? sc.firstElementChild === g : false,
    blobs: [...g.querySelectorAll('.mm-ground__blob')].map((b) => ({ bg: getComputedStyle(b).backgroundColor, op: getComputedStyle(b).opacity, filter: getComputedStyle(b).filter, box: box(b) })),
    mark: mark && { box: box(mark), op: getComputedStyle(mark).opacity, src: mark.getAttribute('src'), loaded: mark.complete && mark.naturalWidth > 0 },
    frame: { w: innerWidth, h: innerHeight },
  };
}));

test('every scene draws the ground first, behind its camera, hidden from assistive tech', async () => {
  const o = await open({ ground: '1' });
  try {
    await o.mm.seek(0.5);
    const scenes = await probe(o.page);
    assert.ok(scenes.length >= 2);
    for (const g of scenes) {
      assert.ok(g, 'a scene without a ground');
      assert.ok(g.first, 'the ground is the scene\'s first child, so the camera paints over it');
      assert.equal(g.hidden, 'true');
      assert.ok(g.chrome, 'the ground is chrome, not content');
      assert.ok(g.keep, 'the ground is kept: present from the first frame, never an entrance (W-ENTRANCE)');
    }
  } finally { await o.close(); }
});

test('blobs are drawn in their own colour and alpha, placed by frame shares and blurred by a share of the width', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await open({ ground: '1' }, format);
    try {
      await o.mm.seek(0.5);
      const [g] = await probe(o.page);
      const { w, h } = g.frame;
      assert.equal(g.blobs.length, 2);
      assert.equal(g.blobs[0].bg, 'rgb(42, 157, 143)');
      assert.equal(g.blobs[1].bg, 'rgb(233, 196, 106)');
      assert.equal(Number(g.blobs[0].op), 0.85);
      const a = g.blobs[0].box;
      assert.ok(Math.abs(a.x - -0.17 * w) <= 1 && Math.abs(a.y - -0.16 * h) <= 1, `${format}: ${JSON.stringify(a)}`);
      assert.ok(Math.abs(a.w - 0.7 * w) <= 1 && Math.abs(a.h - 0.52 * h) <= 1, `${format}: ${JSON.stringify(a)}`);
      const blur = parseFloat(/blur\(([\d.]+)px\)/.exec(g.blobs[0].filter)?.[1]);
      assert.ok(Math.abs(blur - 0.11 * w) <= 1, `${format}: blur ${g.blobs[0].filter}`);
    } finally { await o.close(); }
  }
});

test('the mark is centred, as wide as its share of the frame, faint, and loads', async () => {
  const o = await open({ ground: '1' });
  try {
    await o.mm.seek(0.5);
    const [g] = await probe(o.page);
    const { w, h } = g.frame;
    assert.ok(g.mark, 'no mark');
    assert.ok(g.mark.loaded, `mark did not load: ${g.mark.src}`);
    assert.ok(Math.abs(g.mark.box.w - 1.9 * w) <= 1, JSON.stringify(g.mark.box));
    assert.ok(Math.abs(g.mark.box.x + g.mark.box.w / 2 - w / 2) <= 1 && Math.abs(g.mark.box.y + g.mark.box.h / 2 - h / 2) <= 1, 'mark off centre');
    assert.equal(Number(g.mark.op), 0.08);
  } finally { await o.close(); }
});

test('a style without a ground draws none', async () => {
  const o = await open({});
  try {
    await o.mm.seek(0.5);
    assert.ok((await probe(o.page)).every((g) => g === null));
  } finally { await o.close(); }
});
