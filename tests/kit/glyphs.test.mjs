// The glyph anchor finder (runtime/kit/glyphs.js): a letter's binary mask becomes a signed
// distance field, a pruned skeleton with its stroke ends, outline normals and a seeded set of
// anchors where ornament may root. Pure: Node runs it on drawn masks as the browser runs it on
// rasterised letters. The masks here are drawn at the analysis size (EM pixels per em).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EM, INSET, analyse, anchors, bridge, candidates, distanceField, sdfAt, skeleton, terminals } from '../../runtime/kit/glyphs.js';

// A glyph cell: w x h pixels, origin (left edge, baseline) at (ox, oy), shapes filled by predicate.
function cell(w, h, ox, oy, inside) {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x + 0.5, y + 0.5)) mask[y * w + x] = 1;
  return { mask, w, h, ox, oy };
}
const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
const union = (...fs) => (x, y) => fs.some((f) => f(x, y));
// "l": one upright stroke, 0.16 em wide, from the ascender to the baseline
const L = () => cell(40, 80, 10, 70, rect(12, 16, 22, 70));
// "o": a ring, outer radius 0.33 em, inner 0.19 em
const O = () => cell(60, 80, 8, 70, (x, y) => { const r = Math.hypot(x - 30, y - 48); return r <= 21 && r >= 12; });
// "T": a bar across the cap height and a stem down to the baseline
const T = () => cell(70, 80, 6, 70, union(rect(10, 24, 60, 34), rect(30, 24, 40, 70)));

test('a stroke end is a terminal: "l" has two, "o" none, "T" three', () => {
  for (const [name, g, n] of [['l', L(), 2], ['o', O(), 0], ['T', T(), 3]]) {
    const a = analyse(g);
    assert.equal(a.terminals.length, n, `${name}: ${JSON.stringify(a.terminals.map((t) => [t.x, t.y]))}`);
  }
});

test('the terminals of "T" sit at the bar ends and the stem foot, pointing outward', () => {
  const a = analyse(T());
  const byX = [...a.terminals].sort((p, q) => p.x - q.x);
  const [left, foot, right] = byX;
  assert.ok(left.x < 20 && left.dx < -0.7, `left end ${JSON.stringify(left)}`);
  assert.ok(right.x > 50 && right.dx > 0.7, `right end ${JSON.stringify(right)}`);
  assert.ok(foot.y > 60 && foot.dy > 0.7, `stem foot ${JSON.stringify(foot)}`);
});

test('the distance field is negative inside the ink and positive outside, in pixels', () => {
  const g = L();
  const sdf = distanceField(g.mask, g.w, g.h);
  const at = (x, y) => sdf[y * g.w + x];
  assert.ok(at(17, 40) < -3.5 && at(17, 40) > -6, `centre of the stroke: ${at(17, 40)}`);
  assert.ok(at(30, 40) > 6 && at(30, 40) < 9, `8.5 px right of the stroke: ${at(30, 40)}`);
  assert.ok(Math.abs(at(12, 40)) <= 1, `edge pixel: ${at(12, 40)}`);
});

test('the skeleton of a ring is a closed curve of one-pixel width', () => {
  const g = O();
  const sk = skeleton(g.mask, g.w, g.h);
  const n = sk.reduce((s, v) => s + v, 0);
  assert.ok(n > 80 && n < 130, `skeleton pixels: ${n}`);   // 2 pi x 16.5 = 104
  assert.equal(terminals(sk, g.w, g.h).length, 0);
});

test('every anchor lies within 0.03 em of the ink edge, inside it, with a unit outward normal', () => {
  for (const g of [L(), O(), T()]) {
    const a = analyse(g);
    const list = anchors(a, { seed: 7, density: 1.6, index: 0, char: 'x' });
    assert.ok(list.length >= 1, 'at least one anchor');
    for (const p of list) {
      const d = sdfAt(a, p.x, p.y);   // em
      assert.ok(d <= 0.001 && d >= -0.03, `anchor ${JSON.stringify(p)} is ${d} em from the edge`);
      assert.ok(Math.abs(Math.hypot(p.nx, p.ny) - 1) < 1e-6, 'unit normal');
    }
  }
});

test('a hairline thinner than twice INSET keeps its candidates on its own ink, at its deepest', () => {
  // a stem with a 2 px arm: no point of the arm lies INSET deep, so the inward walk must stop inside it
  const a = analyse(cell(60, 80, 10, 70, union(rect(12, 16, 22, 70), rect(22, 30, 50, 32))));
  const arm = candidates(a).filter((c) => c.x * EM + a.ox > 24);
  assert.ok(arm.length > 0, 'the arm has candidates');
  for (const c of arm) {
    const d = sdfAt(a, c.x, c.y);
    assert.ok(d <= 0, `${c.kind} at (${c.x}, ${c.y}) is ${d.toFixed(4)} em outside the ink`);
    assert.ok(c.y * EM + a.oy > 29 && c.y * EM + a.oy < 33, `${c.kind} at y ${c.y} left the arm`);
  }
});

test('anchors root a stem INSET inside the edge: terminals, upward edges, the baseline', () => {
  const a = analyse(T());
  const list = anchors(a, { seed: 3, density: 1.6, index: 0, char: 'T' });
  for (const p of list) assert.ok(['terminal', 'up', 'down'].includes(p.kind), p.kind);
  assert.ok(list.some((p) => p.kind === 'terminal'), 'a terminal is among the anchors');
  for (const p of list.filter((q) => q.kind === 'up')) assert.ok(p.ny < -0.5, `an upward edge faces up: ${p.ny}`);
  assert.ok(INSET > 0 && INSET < 0.03);
});

test('anchors are seeded: the same seed gives the same list, another seed another', () => {
  const a = analyse(O());
  const one = anchors(a, { seed: 11, density: 1.4, index: 2, char: 'o' });
  const two = anchors(analyse(O()), { seed: 11, density: 1.4, index: 2, char: 'o' });
  assert.deepEqual(one, two);
  const other = [1, 2, 3, 4, 5].map((s) => JSON.stringify(anchors(a, { seed: s, density: 1.4, index: 2, char: 'o' })));
  assert.ok(new Set(other).size > 1, 'some other seed moves the anchors');
});

test('anchors are in em from the glyph origin, so a glyph drawn elsewhere in its cell gives the same anchors', () => {
  const near = analyse(cell(40, 80, 10, 70, rect(12, 16, 22, 70)));
  const far = analyse(cell(60, 90, 25, 76, rect(27, 22, 37, 76)));   // the same stroke, shifted 15, 6 in a larger cell
  const a = anchors(near, { seed: 5, density: 1, index: 0, char: 'l' });
  const b = anchors(far, { seed: 5, density: 1, index: 0, char: 'l' });
  assert.deepEqual(a, b);
});

test('a wider letter gets more anchors than a narrow one', () => {
  const m = cell(110, 80, 6, 70, union(rect(10, 30, 100, 40), rect(10, 30, 20, 70), rect(55, 30, 65, 70), rect(90, 30, 100, 70)));
  const nm = anchors(analyse(m), { seed: 1, density: 1, index: 0, char: 'm' }).length;
  const nl = anchors(analyse(L()), { seed: 1, density: 1, index: 0, char: 'l' }).length;
  assert.ok(nm > nl, `m ${nm} vs l ${nl}`);
});

test('a bridge joins the facing sides of two neighbouring letters', () => {
  const a = analyse(L()), b = analyse(L());
  const advance = 26 / EM;   // the second "l" starts 26 px (0.41 em) right of the first
  const br = bridge(a, b, advance, { seed: 2 });
  assert.ok(br, 'a bridge exists');
  assert.ok(br.from.nx > 0.3 && br.to.nx < -0.3, JSON.stringify(br));
  assert.ok(sdfAt(a, br.from.x, br.from.y) <= 0.001 && sdfAt(b, br.to.x, br.to.y) <= 0.001, 'both ends on ink');
  assert.ok(br.to.x + advance > br.from.x, 'the far end is to the right');
});

test('an empty mask has no terminals, no anchors and no bridge', () => {
  const g = cell(20, 20, 2, 18, () => false);
  const a = analyse(g);
  assert.equal(a.terminals.length, 0);
  assert.deepEqual(anchors(a, { seed: 1 }), []);
  assert.equal(bridge(a, a, 0.3, { seed: 1 }), null);
});
