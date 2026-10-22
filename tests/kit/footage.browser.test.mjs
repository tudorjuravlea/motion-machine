// The footage layer in Chromium, on the synthetic recording (its frame index burned in as a
// barcode): the frames either side of every cut come from the right source frames, the footage runs
// on across a scene cut, the same t gives the same pixels in forward and reverse seek order, and the
// picture is declared media.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPiece, serveRoot, framePng } from '../../scripts/lib/browser.mjs';
import { footagePiece, readBarcode } from '../../fixtures/footage/piece.mjs';

const SPLIT = 3.5;
const story = (edit) => ({
  id: 'footage-layer', kind: 'film', formats: ['9x16'], title: 'footage layer', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, footage: { asset: 'assets/talk/' },
  scenes: [
    { id: 'a', layout: 'layouts/talking-full', duration: SPLIT, cut: 'transitions/hard-cut', move: null, say: '',
      beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'A test line', params: { instant: true } }] },
    { id: 'b', layout: 'layouts/talking-full', duration: Math.round((edit.duration - SPLIT) * 1000) / 1000, cut: 'transitions/hard-cut', move: null, say: '',
      beats: [{ at: 0.2, slot: 'caption', fx: 'entrances/fade', text: 'Another test line' }] },
  ],
  cta: { text: 'test', url: 'example.org' },
});

let piece, server, browser, o;
before(async () => {
  piece = footagePiece('layer', story);
  server = await serveRoot(); browser = await launchBrowser();
  o = await openPiece(piece.dir, { server, browser, format: '9x16' });
});
after(async () => { await o?.close(); await browser?.close(); await server?.close(); piece?.cleanup(); });

const sceneAt = (t) => (t < SPLIT ? 'a' : 'b');
async function shown(t) {
  await o.mm.seek(t);
  const sel = `[data-scene="${sceneAt(t)}"] img[data-footage]`;
  return { src: await o.page.evaluate((s) => document.querySelector(s).getAttribute('src'), sel), n: await o.page.evaluate(readBarcode, sel) };
}
const file = (i) => `assets/talk/f${String(i + 1).padStart(5, '0')}.jpg`;

test('the frames either side of every cut come from the right source frames', async () => {
  const { picture, fps } = piece.edit;
  assert.equal(picture.length, 3);
  for (let k = 1; k < picture.length; k++) {
    const prev = picture[k - 1], c = picture[k];
    const before = await shown((c.start - 0.5) / fps), after = await shown((c.start + 0.5) / fps);
    assert.equal(before.n, prev.from + prev.length - 1, `last frame before cut ${k} (barcode)`);
    assert.equal(before.src, file(prev.from + prev.length - 1));
    assert.equal(after.n, c.from, `first frame after cut ${k} (barcode)`);
    assert.equal(after.src, file(c.from));
  }
  assert.equal((await shown(0.5 / fps)).n, picture[0].from, 'the film opens on the first kept frame');
});

test('the footage runs on across a scene cut', async () => {
  const fps = piece.edit.fps;
  const a = await shown(SPLIT - 0.5 / fps), b = await shown(SPLIT + 0.5 / fps);
  assert.equal(b.n - a.n, 1, `frames ${a.n} then ${b.n}`);
});

test('the same t gives the same pixels in forward and reverse seek order', async () => {
  const ts = [0.1, 2.3, 2.37, 3.49, 3.51, 6.4, 6.47, 8.6];
  const fwd = [];
  for (const t of ts) fwd.push(await framePng(o.page, t));
  for (let i = ts.length - 1; i >= 0; i--) assert.ok((await framePng(o.page, ts[i])).equals(fwd[i]), `t = ${ts[i]}`);
});

test('the picture is a declared media leaf and the kit raises no warning', async () => {
  const m = await o.page.evaluate(() => [...document.querySelectorAll('img[data-footage]')].map((i) => ({ media: i.hasAttribute('data-media'), keep: i.hasAttribute('data-keep'), kids: i.children.length })));
  assert.equal(m.length, 2);
  for (const x of m) assert.deepEqual(x, { media: true, keep: true, kids: 0 });
  assert.deepEqual((await o.mm.meta()).warnings, []);
});
