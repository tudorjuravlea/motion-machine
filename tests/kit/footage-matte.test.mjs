// The person matte's pure half: a 3-frame temporal median removes a one-frame flicker, the feather
// softens an edge over about its radius and never moves a flat area, the grey PNG encoder writes a
// file that decodes back to the same bytes, a sequence smoother holds the ends, and the kit maps a
// source frame to its matte file and a picture's fit to the mask's preserveAspectRatio. Also: word
// lists from WhisperX (word_segments or segments[].words) read as the plain { text, start, end } list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { feather, grayPng, median3, matteSmoother } from '../../scripts/lib/footage-matte.mjs';
import { wordsFrom } from '../../scripts/lib/footage.mjs';
import { matteAspect, matteFile } from '../../runtime/kit/footage.js';

const W = 40, H = 30;
const disc = (cx, cy, r) => { const b = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) b[y * W + x] = 255; return b; };

/** Decodes an 8-bit grey, non-interlaced PNG with filters 0 to 4 (the test's own reader). */
function readPng(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'PNG signature');
  let o = 8, w, h, idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); assert.equal(data[8], 8, 'bit depth'); assert.equal(data[9], 0, 'grey'); assert.equal(data[12], 0, 'no interlace'); }
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (w + 1)];
    for (let x = 0; x < w; x++) {
      const v = raw[y * (w + 1) + 1 + x], a = x ? out[y * w + x - 1] : 0, b = y ? out[(y - 1) * w + x] : 0, c = x && y ? out[(y - 1) * w + x - 1] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      out[y * w + x] = (v + pred) & 255;
    }
  }
  return { w, h, px: out };
}

test('the 3-frame median removes a frame where the person drops out, and keeps a steady edge', () => {
  const a = disc(20, 15, 8), gone = new Uint8Array(W * H), c = disc(20, 15, 8);
  assert.deepEqual(median3(a, gone, c), a);
  const moved = disc(21, 15, 8);
  const m = median3(disc(19, 15, 8), disc(20, 15, 8), moved);
  assert.equal(m[15 * W + 20], 255, 'the middle of a moving disc stays white');
  assert.equal(m[0], 0, 'a far corner stays black');
});

test('the feather softens an edge over about its radius and leaves flat areas untouched', () => {
  const half = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 20; x < W; x++) half[y * W + x] = 255;
  const f = feather(half, W, H, 3);
  const row = [...f.subarray(15 * W, 16 * W)];
  assert.equal(row[0], 0, 'far left stays black');
  assert.equal(row[W - 1], 255, 'far right stays white');
  const soft = row.filter((v) => v > 0 && v < 255).length;
  assert.ok(soft >= 4 && soft <= 12, `${soft} soft pixels across the edge for radius 3`);
  for (let x = 1; x < W; x++) assert.ok(row[x] >= row[x - 1], 'the ramp only rises');
  assert.deepEqual(feather(half, W, H, 0), half, 'radius 0 is the mask itself');
  assert.deepEqual(feather(half, W, H, 3), f, 'the same input gives the same bytes');
});

test('the grey PNG decodes back to the exact bytes', () => {
  const m = feather(disc(12, 9, 6), W, H, 2);
  const png = grayPng(m, W, H);
  const back = readPng(png);
  assert.equal(back.w, W);
  assert.equal(back.h, H);
  assert.deepEqual(back.px, m);
  assert.deepEqual(grayPng(m, W, H), png, 'same bytes on a second encode');
});

test('the smoother takes the median of each frame with its neighbours and holds the first and last frames', () => {
  const frames = [disc(10, 15, 6), new Uint8Array(W * H), disc(12, 15, 6), disc(14, 15, 6)];
  const out = [];
  const s = matteSmoother(W, H, 0, (i, buf) => out.push([i, buf]));
  for (const f of frames) s.push(f);
  s.end();
  assert.deepEqual(out.map(([i]) => i), [0, 1, 2, 3]);
  assert.deepEqual(out[0][1], median3(frames[0], frames[0], frames[1]));
  assert.equal(out[1][1][15 * W + 11], 255, 'the dropped frame is filled from its neighbours');
  assert.deepEqual(out[3][1], median3(frames[2], frames[3], frames[3]));
});

test('the kit names a source frame\'s matte and maps the picture\'s fit onto the mask', () => {
  assert.equal(matteFile('assets/talk/', 0), 'assets/talk/matte/f00001.png');
  assert.equal(matteFile('assets/talk/', 966), 'assets/talk/matte/f00967.png');
  assert.equal(matteAspect('cover', '50% 50%'), 'xMidYMid slice');
  assert.equal(matteAspect('cover', '50% 0%'), 'xMidYMin slice');
  assert.equal(matteAspect('contain', '0% 100%'), 'xMinYMax meet');
  assert.equal(matteAspect('fill', '50% 50%'), 'none');
});

test('WhisperX word lists read as { text, start, end }, words without timings placed between their neighbours', () => {
  const plain = [{ text: 'one', start: 0.1, end: 0.3 }];
  assert.deepEqual(wordsFrom(plain), plain);
  assert.deepEqual(wordsFrom({ words: plain }), plain);
  const wx = { segments: [{ start: 0.1, end: 1, text: ' one two', words: [{ word: 'one', start: 0.1, end: 0.3, score: 0.9 }, { word: 'two', start: 0.5, end: 0.9, score: 0.8 }] }],
    word_segments: [{ word: 'one', start: 0.1, end: 0.3, score: 0.9 }, { word: '42' }, { word: 'two', start: 0.5, end: 0.9, score: 0.8 }] };
  assert.deepEqual(wordsFrom(wx), [{ text: 'one', start: 0.1, end: 0.3 }, { text: '42', start: 0.3, end: 0.5 }, { text: 'two', start: 0.5, end: 0.9 }]);
  const segOnly = { segments: wx.segments };
  assert.deepEqual(wordsFrom(segOnly), [{ text: 'one', start: 0.1, end: 0.3 }, { text: 'two', start: 0.5, end: 0.9 }]);
  assert.throws(() => wordsFrom({ segments: [] }), /no timed word/);
  assert.throws(() => wordsFrom([{ text: 'x', start: 2, end: 1 }]), /end ≥ start/);
});
