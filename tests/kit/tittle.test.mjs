// The dot finder in runtime/kit/glyphs.js: the round mark of a letter, read from its rasterised
// mask. On an "i" or a "j" it is the tittle, the small separate blob above the stem; on a full stop or
// a round bullet it is the whole mark. Its centre and radius come from the coverage (an antialiased
// edge counts by its share), so they hold to a fraction of a pixel; a mark that is not round (a
// square tittle) says so. Pure: Node runs it on drawn masks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dotOf } from '../../runtime/kit/glyphs.js';

// A cell of w x h pixels, origin (left edge, baseline) at (ox, oy), its coverage supersampled 8 x 8
// per pixel, so an edge pixel holds its share of ink; the mask is coverage at half or more.
function cell(w, h, ox, oy, inside) {
  const alpha = new Uint8Array(w * h), mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (inside(x + (i + 0.5) / 8, y + (j + 0.5) / 8)) n++;
    alpha[y * w + x] = Math.round((n / 64) * 255);
    mask[y * w + x] = alpha[y * w + x] >= 128 ? 1 : 0;
  }
  return { mask, alpha, w, h, ox, oy };
}
const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
const disc = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) <= r;
const union = (...fs) => (x, y) => fs.some((f) => f(x, y));
const EMPX = 100;   // these cells are drawn at 100 px per em

test('the tittle of an "i": the small blob above the stem, its centre and radius to a tenth of a pixel', () => {
  // stem from the x-height (y 50) to the baseline (y 100), a dot of radius 7.3 centred at (30.4, 31.7)
  const g = cell(60, 120, 10, 100, union(rect(23, 50, 37, 100), disc(30.4, 31.7, 7.3)));
  const d = dotOf(g, { char: 'i', em: EMPX });
  assert.ok(d, 'found');
  assert.ok(Math.abs(d.x * EMPX + 10 - 30.4) < 0.1, `centre x ${d.x * EMPX + 10}`);
  assert.ok(Math.abs(d.y * EMPX + 100 - 31.7) < 0.1, `centre y ${d.y * EMPX + 100}`);
  assert.ok(Math.abs(d.r * EMPX - 7.3) < 0.1, `radius ${d.r * EMPX}`);
  assert.equal(d.round, true);
});

test('a "j" has its tittle too; an "l" and an "o" have none', () => {
  const j = cell(60, 140, 10, 100, union(rect(26, 50, 38, 125), rect(12, 115, 38, 125), disc(32, 30, 8)));
  const d = dotOf(j, { char: 'j', em: EMPX });
  assert.ok(d && Math.abs(d.x * EMPX + 10 - 32) < 0.1 && Math.abs(d.y * EMPX + 100 - 30) < 0.1 && Math.abs(d.r * EMPX - 8) < 0.1, JSON.stringify(d));
  assert.equal(dotOf(cell(40, 120, 10, 100, rect(12, 16, 22, 100)), { char: 'l', em: EMPX }), null);
  assert.equal(dotOf(cell(60, 120, 8, 100, (x, y) => { const r = Math.hypot(x - 30, y - 75); return r <= 21 && r >= 12; }), { char: 'o', em: EMPX }), null);
});

test('a full stop and a round bullet are the dot themselves', () => {
  const stop = dotOf(cell(40, 120, 10, 100, disc(20, 93, 6.5)), { char: '.', em: EMPX });
  assert.ok(stop && Math.abs(stop.x * EMPX + 10 - 20) < 0.1 && Math.abs(stop.y * EMPX + 100 - 93) < 0.1 && Math.abs(stop.r * EMPX - 6.5) < 0.1, JSON.stringify(stop));
  const bullet = dotOf(cell(50, 120, 10, 100, disc(25, 65, 12)), { char: '•', em: EMPX });
  assert.ok(bullet && Math.abs(bullet.r * EMPX - 12) < 0.1 && bullet.round, JSON.stringify(bullet));
});

test('a square tittle is found and marked not round; without coverage the mask alone still finds it', () => {
  const sq = dotOf(cell(60, 120, 10, 100, union(rect(23, 50, 37, 100), rect(23, 24, 37, 38))), { char: 'i', em: EMPX });
  assert.ok(sq, 'found');
  assert.equal(sq.round, false);
  const g = cell(60, 120, 10, 100, union(rect(23, 50, 37, 100), disc(30, 32, 7)));
  delete g.alpha;
  const d = dotOf(g, { char: 'i', em: EMPX });
  assert.ok(d && Math.abs(d.x * EMPX + 10 - 30) < 0.5 && Math.abs(d.r * EMPX - 7) < 0.6, JSON.stringify(d));
});

test('an empty cell and an "i" with its dot joined to the stem have no dot', () => {
  assert.equal(dotOf(cell(20, 20, 0, 20, () => false), { char: 'i', em: EMPX }), null);
  assert.equal(dotOf(cell(60, 120, 10, 100, union(rect(23, 30, 37, 100), disc(30, 31, 7))), { char: 'i', em: EMPX }), null);
});

test('an oval tittle gives its upright semi-axes and counts as round; a slanted one does not', () => {
  const oval = (cx, cy, a, b, t = 0) => (x, y) => { const u = (x - cx) * Math.cos(t) + (y - cy) * Math.sin(t), v = -(x - cx) * Math.sin(t) + (y - cy) * Math.cos(t); return (u / a) ** 2 + (v / b) ** 2 <= 1; };
  const d = dotOf(cell(60, 120, 10, 100, union(rect(23, 50, 37, 100), oval(30.2, 30.6, 9.4, 7.6))), { char: 'i', em: EMPX });
  assert.ok(d && d.round, JSON.stringify(d));
  assert.ok(Math.abs(d.rx * EMPX - 9.4) < 0.15 && Math.abs(d.ry * EMPX - 7.6) < 0.15, `semi-axes ${d.rx * EMPX}, ${d.ry * EMPX}`);
  assert.ok(Math.abs(d.x * EMPX + 10 - 30.2) < 0.1 && Math.abs(d.y * EMPX + 100 - 30.6) < 0.1, 'centre');
  const round = dotOf(cell(60, 120, 10, 100, union(rect(23, 50, 37, 100), disc(30.4, 31.7, 7.3))), { char: 'i', em: EMPX });
  assert.ok(Math.abs(round.rx - round.ry) * EMPX < 0.1 && Math.abs(round.rx * EMPX - 7.3) < 0.1, JSON.stringify(round));
  const slant = dotOf(cell(60, 120, 10, 100, union(rect(23, 50, 37, 100), oval(30, 28, 11, 5.5, Math.PI / 4))), { char: 'i', em: EMPX });
  assert.ok(slant && slant.round === false, JSON.stringify(slant));
});
