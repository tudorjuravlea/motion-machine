// moves/morph: inside a scene one box becomes another: a box travels from the `from`
// slot's rect to the `to` slot's rect, its width and left on the ui spring, its height and top on
// the heavier one; a dashed ghost stays at the origin; from fades out early, to fades in late; at
// the end only `to` shows and the overlay is gone.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (format) => openPiece(PAGE, { server, browser, format, query: { story: 'morph' } });
const probe = async (o, t) => { await o.mm.seek(t); return o.page.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const sc = document.querySelector('[data-scene="m"]');
  const op = (n) => Number(getComputedStyle(sc.querySelector(`[data-slot="${n}"]`)).opacity);
  return { box: r(sc.querySelector('.mm-morph__box')), ghost: r(sc.querySelector('.mm-morph__ghost')), from: r(sc.querySelector('[data-slot="left"]')), to: r(sc.querySelector('[data-slot="headline"]')), fromO: op('left'), toO: op('headline') };
}); };
const near = (a, b, tol = 2) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) <= tol);

test('before the morph only from shows; at its start the box covers from, with a ghost there', async () => {
  const o = await open('16x9');
  try {
    const pre = await probe(o, 0.5);
    assert.equal(pre.box, null); assert.equal(pre.toO, 0); assert.equal(pre.fromO, 1);
    const s = await probe(o, 1.0 + 0.001);
    assert.ok(s.box && near(s.box, s.from), JSON.stringify(s));
    assert.ok(s.ghost && near(s.ghost, s.from), 'the ghost marks the origin');
  } finally { await o.close(); }
});

test('mid-way the width has travelled further than the height', async () => {
  const o = await open('16x9');
  try {
    const m = await probe(o, 1.0 + 0.3 * 1.2);
    const pw = Math.abs(m.box.w - m.from.w) / Math.abs(m.to.w - m.from.w), ph = Math.abs(m.box.h - m.from.h) / Math.abs(m.to.h - m.from.h);
    assert.ok(pw > ph, `width ${pw} vs height ${ph}`);
  } finally { await o.close(); }
});

test('it lands on to in 16x9 and 9x16, and after it only to shows, with no overlay', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await open(format);
    try {
      const end = await probe(o, 1.0 + 1.2 - 0.001);
      assert.ok(near(end.box, end.to, 3), `${format}: ${JSON.stringify(end)}`);
      const post = await probe(o, 3.5);
      assert.equal(post.box, null); assert.equal(post.ghost, null);
      assert.equal(post.toO, 1); assert.equal(post.fromO, 0);
    } finally { await o.close(); }
  }
});
