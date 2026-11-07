// moves/punch in Chromium, on the synthetic recording whose red marker sits at (50 %, 35 %) and blue
// marker at (20 %, 80 %): across a punched cut the anchor's pixel position is unchanged while the
// rest of the picture moves out from it, and the next cut puts the framing back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPiece, serveRoot, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';
import { footagePiece } from '../../fixtures/footage/piece.mjs';

const story = (edit) => ({
  id: 'footage-punch', kind: 'film', formats: ['9x16'], title: 'footage punch', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, footage: { asset: 'assets/talk/' },
  scenes: [{ id: 'talk', layout: 'layouts/talking-full', duration: edit.duration, cut: 'transitions/hard-cut', move: 'moves/punch', moveParams: { x: 50, y: 35 }, say: '',
    beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'A test line', params: { instant: true } }] }],
  cta: { text: 'test', url: 'example.org' },
});

let piece, server, browser, o;
before(async () => {
  piece = footagePiece('punch', story);
  server = await serveRoot(); browser = await launchBrowser();
  o = await openPiece(piece.dir, { server, browser, format: '9x16' });
});
after(async () => { await o?.close(); await browser?.close(); await server?.close(); piece?.cleanup(); });

/** Centroid of the marker's pixels inside a square of half-side 55 px around (cx, cy). */
function marker(img, cx, cy, isIt) {
  let n = 0, sx = 0, sy = 0;
  for (let y = Math.round(cy - 55); y <= cy + 55; y++) for (let x = Math.round(cx - 55); x <= cx + 55; x++) {
    const i = (y * img.width + x) * 4;
    if (isIt(img.data[i], img.data[i + 1], img.data[i + 2])) { n++; sx += x; sy += y; }
  }
  return n > 100 ? { x: sx / n, y: sy / n, n } : null;
}
const red = (r, g, b) => r > 180 && g < 90 && b < 90;
const blue = (r, g, b) => b > 180 && r < 90 && g < 90;
const ANCHOR = [540, 672], BLUE = [216, 1536];
const scaled = ([x, y], s) => [ANCHOR[0] + (x - ANCHOR[0]) * s, ANCHOR[1] + (y - ANCHOR[1]) * s];

test('across a punched cut the anchor keeps its pixel position and the picture scales out from it', async (t) => {
  const { picture, fps } = piece.edit;
  const cut = picture[1].start;
  const a = decodePng(await framePng(o.page, (cut - 0.5) / fps)), b = decodePng(await framePng(o.page, (cut + 0.5) / fps));
  const ra = marker(a, ...ANCHOR, red), rb = marker(b, ...ANCHOR, red);
  assert.ok(ra && rb, 'the anchor marker is found on both sides');
  assert.ok(Math.hypot(ra.x - rb.x, ra.y - rb.y) <= 1, `anchor at (${ra.x}, ${ra.y}) then (${rb.x}, ${rb.y})`);
  t.diagnostic(`anchor (${ra.x.toFixed(2)}, ${ra.y.toFixed(2)}) -> (${rb.x.toFixed(2)}, ${rb.y.toFixed(2)}); marker ${ra.n} -> ${rb.n} px`);
  assert.ok(rb.n > ra.n * 1.2, 'the punched marker covers more pixels');
  const ba = marker(a, ...BLUE, blue), bb = marker(b, ...scaled(BLUE, 1.15), blue);
  assert.ok(ba && bb, 'the second marker is where the scale about the anchor puts it');
  assert.ok(Math.hypot(ba.x - bb.x, ba.y - bb.y) > 100, 'and it moved');
});

test('the next cut puts the framing back', async () => {
  const { picture, fps } = piece.edit;
  const cut = picture[2].start;
  const c = decodePng(await framePng(o.page, (cut + 0.5) / fps));
  const bc = marker(c, ...BLUE, blue);
  assert.ok(bc && Math.hypot(bc.x - BLUE[0], bc.y - BLUE[1]) <= 2, `second marker back at ${JSON.stringify(bc)}`);
  const caption = await o.page.evaluate(() => getComputedStyle(document.querySelector('.mm-camera')).transform);
  assert.equal(caption, 'none', 'the camera itself never moves');
});

// The anchor is a point of the recording. With the red marker moved off-centre to (144, 269) of the
// 360 x 640 recording and the anchor set on it, every frame shape crops the recording differently
// around it (9x16 matches the recording's shape; 4x5, 1x1 and 16x9 cut its top and bottom), and the
// marker must hold its pixel position across the punched cut in each.
const AX = 144 / 360, AY = 269 / 640;
const offStory = (edit) => ({ ...story(edit), id: 'footage-punch-off', formats: ['9x16', '4x5', '1x1', '16x9'],
  scenes: story(edit).scenes.map((sc) => ({ ...sc, moveParams: { x: AX * 100, y: AY * 100 } })) });

test('the anchor holds within 1 px in 1x1, 4x5, 16x9 and 9x16, wherever the frame crops the recording', async (t) => {
  const off = footagePiece('punch-off', offStory, { env: { RED_X: '144', RED_Y: '269' } });
  try {
    const { picture, fps } = off.edit, cut = picture[1].start;
    for (const format of ['1x1', '4x5', '16x9', '9x16']) {
      const p = await openPiece(off.dir, { server, browser, format });
      try {
        const a = decodePng(await framePng(p.page, (cut - 0.5) / fps));
        // where the cover fit puts the recording's point, from the picture's box and its natural size
        const at = await p.page.evaluate(([ax, ay]) => {
          const el = document.querySelector('[data-footage]'), r = el.getBoundingClientRect();
          const k = Math.max(r.width / el.naturalWidth, r.height / el.naturalHeight);
          return [r.x + (r.width - el.naturalWidth * k) / 2 + ax * el.naturalWidth * k, r.y + (r.height - el.naturalHeight * k) / 2 + ay * el.naturalHeight * k];
        }, [AX, AY]);
        const b = decodePng(await framePng(p.page, (cut + 0.5) / fps));
        const ra = marker(a, ...at, red), rb = marker(b, ...at, red);
        assert.ok(ra && rb, `${format}: the anchor marker is found on both sides near ${at}`);
        const moved = Math.hypot(ra.x - rb.x, ra.y - rb.y);
        t.diagnostic(`${format}: anchor (${ra.x.toFixed(2)}, ${ra.y.toFixed(2)}) -> (${rb.x.toFixed(2)}, ${rb.y.toFixed(2)}), ${moved.toFixed(2)} px`);
        assert.ok(moved <= 1, `${format}: the anchor moved ${moved.toFixed(2)} px across the punched cut`);
        assert.ok(rb.n > ra.n * 1.2, `${format}: the punched marker covers more pixels`);
      } finally { await p.close(); }
    }
  } finally { off.cleanup(); }
});
