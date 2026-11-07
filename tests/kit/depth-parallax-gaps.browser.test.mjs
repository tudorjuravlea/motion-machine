// moves/depth-parallax leaves no gap behind a moving part: mid-move, the place a part leaves shows a whole
// background (the clean plate when the pack has one; straight lines run on through the fill when it does
// not), and a part that passes behind a nearer one is whole where it comes out (a shelf behind a bottle
// never shows its break). The pictures are drawn here: a tiled wall with a lip over a table, a box, and
// a shelf bar that passes behind the box; each pack is made with mm media layers in a work copy of
// fixtures/layers/piece.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';
import { encodePng } from '../../scripts/lib/layers-png.mjs';

const work = join(ROOT, `.tmp-layers-gaps-${process.pid}`), PIECE = join(work, 'layers', 'piece'), SRC = join(work, 'src');
const W = 480, H = 270;   // 16:9, so a full-bleed 16x9 frame shows it whole at 4 px per pixel
const WALL = [222, 216, 206], TILE = [165, 160, 152], LIP = [96, 80, 64], TABLE = [186, 156, 124], BAR = [140, 108, 78], BOX = [30, 110, 106];
const inBox = (x, y) => x >= 200 && x < 280 && y >= 60 && y < 230;
const inBar = (x, y) => x >= 150 && x < 400 && y >= 96 && y < 102;
const room = (x, y) => (y >= 154 ? TABLE : y >= 150 ? LIP : x % 40 < 2 || y % 45 < 2 ? TILE : WALL);
function png(name, at, channels = 4) {
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = at(x, y), i = (y * W + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; }
  writeFileSync(join(SRC, name), encodePng({ width: W, height: H, data }, { channels }));
}
const mask = (f) => (x, y) => (f(x, y) ? [255, 255, 255] : [0, 0, 0]);
const layers = (args) => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'mm.mjs'), 'media', 'layers', ...args, '--piece', PIECE], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};
const story = (asset, moveParams) => ({
  id: 'gaps', kind: 'film', formats: ['16x9'], title: 'Gaps fixture', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null },
  scenes: [{ id: 'one', layout: 'layouts/media', duration: 4, cut: 'transitions/hard-cut', move: moveParams ? 'moves/depth-parallax' : null, ...(moveParams ? { moveParams } : {}),
    beats: [{ at: 0, slot: 'image', fx: 'entrances/fade', asset, params: { instant: true, frame: 'bleed' } }], say: 'A picture in layers.' }],
  cta: { text: 'motion-machine', url: 'example.com' },
});
let server, browser;

before(async () => {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, 'layers'), { recursive: true }); mkdirSync(SRC, { recursive: true });
  cpSync(join(ROOT, 'fixtures', 'layers', 'piece'), PIECE, { recursive: true });
  png('box.png', (x, y) => (inBox(x, y) ? BOX : room(x, y)));
  png('shelf.png', (x, y) => (inBox(x, y) ? BOX : inBar(x, y) ? BAR : room(x, y)));
  png('clean.png', room);
  png('box-mask.png', mask(inBox), 1);
  png('bar-mask.png', mask((x, y) => inBar(x, y) && !inBox(x, y)), 1);
  // a: the box over a clean plate; b: the box, no plate (the hole is filled); c: the box and a shelf behind it, clean plate
  layers([join(SRC, 'box.png'), '--name', 'a', '--mask', `box=${join(SRC, 'box-mask.png')}`, '--depths', '1', '--plate', join(SRC, 'clean.png')]);
  layers([join(SRC, 'box.png'), '--name', 'b', '--mask', `box=${join(SRC, 'box-mask.png')}`, '--depths', '1']);
  layers([join(SRC, 'shelf.png'), '--name', 'c', '--mask', `box=${join(SRC, 'box-mask.png')}`, '--mask', `bar=${join(SRC, 'bar-mask.png')}`, '--depths', '1,0.5', '--plate', join(SRC, 'clean.png')]);
  cpSync(join(SRC, 'clean.png'), join(PIECE, 'assets', 'clean.png'));
  // the far plate holds still and the box drifts (focus 0); or the box holds still and the shelf drifts behind it (focus 1)
  const pin = (focus) => ({ path: 'dolly-right', aperture: 0, focus });
  for (const [name, s] of Object.entries({ a: story('assets/a/source.png', pin(0)), b: story('assets/b/source.png', pin(0)), c: story('assets/c/source.png', pin(1)), clean: story('assets/clean.png', null) })) {
    writeFileSync(join(PIECE, `${name}.json`), JSON.stringify(s));
  }
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(work, { recursive: true, force: true }); });

const frame = async (name, t) => {
  const p = await openPiece(PIECE, { server, browser, format: '16x9', query: { story: name, preset: 'editorial' } });
  try { const img = decodePng(await framePng(p.page, t)); assert.deepEqual(p.errors, []); return img; } finally { await p.close(); }
};
// per-pixel largest channel difference between two frames over a frame-px rectangle: { mean, p99, n }
function compare(a, b, [x0, x1, y0, y1]) {
  const d = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * a.width + x) * 4;
    d.push(Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])));
  }
  d.sort((p, q) => p - q);
  return { mean: d.reduce((s, v) => s + v, 0) / d.length, p99: d[Math.floor(d.length * 0.99)], n: d.length };
}
// At t = 0 the box (depth 1, focus 0) starts 12 % of the 1080 px short side, 129.6 px, right of its home
// (picture x 200..280, y 60..230, frame x 800..1120, y 240..920). Its home left of where it now is:
// frame x 800..929, kept 4 px clear of both edges.
const HOME = [804, 926, 244, 916];

test('with a clean plate, mid-move the place the part left shows the clean plate', async (t) => {
  const [moving, clean] = [await frame('a', 0), await frame('clean', 0)];
  const r = compare(moving, clean, HOME);
  t.diagnostic(`clean plate: mean ${r.mean.toFixed(2)}, p99 ${r.p99}`);
  assert.ok(r.mean <= 1.5 && r.p99 <= 8, `home region against the clean plate: mean ${r.mean.toFixed(2)}, p99 ${r.p99}`);
});

test('without a clean plate, the fill runs the lip, the tile lines and the table on through the place the part left', async (t) => {
  const [moving, clean] = [await frame('b', 0), await frame('clean', 0)];
  const r = compare(moving, clean, HOME);
  assert.ok(r.mean <= 2 && r.p99 <= 16, `home region against the clean plate: mean ${r.mean.toFixed(2)}, p99 ${r.p99}`);
  // the lip (picture rows 150..154, frame 600..616) runs straight through, as does a tile line (picture x 240, frame 960)
  const lip = compare(moving, clean, [804, 926, 602, 614]);
  assert.ok(lip.mean <= 4, `the lip through the fill: mean ${lip.mean.toFixed(2)}`);
  const tile = compare(moving, clean, [804, 926, 244, 596]);
  t.diagnostic(`filled: mean ${r.mean.toFixed(2)}, p99 ${r.p99}; lip mean ${lip.mean.toFixed(2)}; wall mean ${tile.mean.toFixed(2)}`);
  assert.ok(tile.mean <= 3, `the tiled wall through the fill: mean ${tile.mean.toFixed(2)}`);
});

test('a part passing behind a nearer one comes out whole: the shelf shows no break beside the box', async (t) => {
  // the box holds still (focus 1); the shelf (depth 0.5) starts 64.8 px left, so the stretch that sat behind
  // the box (frame x 800..1120) now shows at x 735..800, beside the box: picture rows 96..102 are frame 384..408
  const [moving] = [await frame('c', 0)];
  let worst = 0, sum = 0, n = 0;
  for (let y = 388; y < 404; y++) for (let x = 740; x < 796; x++) {
    const i = (y * moving.width + x) * 4, d = Math.max(...[0, 1, 2].map((c) => Math.abs(moving.data[i + c] - BAR[c])));
    worst = Math.max(worst, d); sum += d; n++;
  }
  t.diagnostic(`shelf beside the box: mean ${(sum / n).toFixed(2)}, worst ${worst}`);
  assert.ok(sum / n <= 4 && worst <= 24, `the shelf beside the box: mean ${(sum / n).toFixed(2)} off the shelf colour, worst ${worst}`);
});
