// moves/depth-parallax, the dolly maths: each layer is displaced by (depth - focus) times a weight that
// falls to 0 as the move settles, so the rest is the plain picture; a depth map is cut into bands of
// equal pixel counts whose soft masks overlap; the plate is drawn large enough to cover the picture.
// A lens blurs each layer by how far its depth lies from the focus, which sits on the nearest layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import MOVE, { shift, quantileBands, bandWeight, plateBleed, blurOf, nearestDepth, layerScale, fillUnder, fillLines } from '../../patterns/moves/depth-parallax/pattern.js';

const o = (x = {}) => ({ path: 'dolly-right', amount: 0.12, focus: 0.5, short: 1080, ...x });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('at rest (w = 0) every layer is in place, whatever its depth or the path', () => {
  for (const path of ['dolly-left', 'dolly-right', 'rise', 'push']) for (const d of [0, 0.3, 1]) {
    const p = shift(d, 0, o({ path }));
    assert.equal(Math.abs(p.dx), 0); assert.equal(Math.abs(p.dy), 0); assert.equal(p.scale, 1);
  }
});

test('a dolly displaces a layer by w x amount x short side x (depth - focus), opposite ways for left and right', () => {
  near(shift(1, 1, o()).dx, 0.12 * 1080 * 0.5, 'dolly-right, a near layer');
  near(shift(0, 1, o()).dx, -0.12 * 1080 * 0.5, 'dolly-right, a far layer moves the other way');
  near(shift(1, 0.5, o({ path: 'dolly-left' })).dx, -0.5 * 0.12 * 1080 * 0.5, 'dolly-left, half weight');
  assert.equal(shift(0.5, 1, o()).dx, 0, 'a layer at the focus stays put');
  assert.equal(shift(1, 1, o()).dy, 0);
  near(shift(0.9, 1, o({ path: 'rise' })).dy, -0.12 * 1080 * 0.4, 'rise moves on y');
  assert.equal(shift(0.9, 1, o({ path: 'rise' })).dx, 0);
});

test('amount defaults to 12 % of the short side and is held in 0.02 to 0.24', () => {
  assert.equal(MOVE.params.amount.default, 0.12);
  const at = (amount) => shift(1, 1, o({ amount, focus: 0 })).dx;
  near(at(undefined), 0.12 * 1080, 'default');
  near(at(1), 0.24 * 1080, 'held at 0.24');
  near(at(0), 0.02 * 1080, 'held at 0.02');
});

test('push scales each layer about the centre by 1 + w Z (d - f), times a whole-picture 1 + w Z / 2, Z = 2.5 x amount', () => {
  const Z = 2.5 * 0.12;
  near(shift(1, 1, o({ path: 'push' })).scale, (1 + Z * 0.5) * (1 + 0.5 * Z), 'near layer');
  near(shift(0, 0.4, o({ path: 'push' })).scale, (1 - 0.4 * Z * 0.5) * (1 + 0.5 * 0.4 * Z), 'far layer, w 0.4');
  assert.equal(shift(1, 1, o({ path: 'push' })).dx, 0);
});

test('the lens blurs a layer by aperture x 1 % of the short side x |depth - focus|: discreet by default, sharp at the focus', () => {
  assert.equal(MOVE.params.aperture.default, 0.35);
  // one whole depth from the focus at the default aperture: 0.35 % of the short side
  near(blurOf(0, o({ focus: 1 })), 0.0035 * 1080, 'the farthest layer, default aperture');
  near(blurOf(1, o({ focus: 0 })), 0.0035 * 1080, 'nearer than the focus blurs alike');
  assert.equal(blurOf(0.7, o({ focus: 0.7 })), 0, 'a layer at the focus is sharp');
  near(blurOf(0.2, o({ focus: 0.9, aperture: 0.7 })), 0.7 * 0.01 * 1080 * 0.7, 'scales with the aperture and the depth gap');
  assert.equal(blurOf(0, o({ focus: 1, aperture: 0 })), 0, 'aperture 0 is a pinhole: nothing blurs');
  near(blurOf(0, o({ focus: 1, aperture: 5 })), 0.01 * 1080, 'held at aperture 1');
  assert.equal(blurOf(0, o({ focus: 1, aperture: -1 })), 0, 'held at aperture 0');
  // the blur does not depend on where the move is: the lens is fixed while the camera travels
  let last = -1;
  for (const d of [0.9, 0.7, 0.5, 0.2, 0]) { const b = blurOf(d, o({ focus: 0.9 })); assert.ok(b > last); last = b; }
});

test('the focus defaults to the nearest layer: the plate, a band or a part, whichever is nearest', () => {
  assert.equal(MOVE.params.focus.default, 'auto');
  assert.match(MOVE.params.focus.meaning, /nearest/);
  assert.equal(nearestDepth({ plate: { depth: 0.4 }, bands: [], parts: [{ depth: 0.1 }, { depth: 0.9 }, { depth: 0.66 }] }), 0.9);
  assert.equal(nearestDepth({ plate: { depth: 0.4 }, bands: [{ depth: 0.2 }, { depth: 0.95 }], parts: [{ depth: 0.9 }] }), 0.95);
  assert.equal(nearestDepth({ plate: { depth: 0.4 }, bands: [], parts: [] }), 0.4);
});

test('the displacement shrinks steadily to nothing as w falls', () => {
  let last = Infinity;
  for (let i = 20; i >= 0; i--) {
    const m = Math.abs(shift(1, i / 20, o()).dx);
    assert.ok(m <= last + 1e-12, `w ${i / 20}: ${m} after ${last}`);
    last = m;
  }
  assert.equal(last, 0);
});

// a 256-level histogram: counts[v] pixels at depth v / 255
const hist = (f) => Float64Array.from({ length: 256 }, (_, v) => f(v));

test('bands split the depth map at its quantiles, so each holds about the same number of pixels', () => {
  const H = hist((v) => (v < 128 ? 3 : 1));   // three times as many far pixels as near ones
  const total = H.reduce((a, b) => a + b, 0);
  const B = quantileBands(H, 8);
  assert.equal(B.length, 8);
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    assert.ok(b.lo < b.hi, `band ${i} has width`);
    assert.ok(b.depth >= b.lo && b.depth <= b.hi, `band ${i} depth inside it`);
    if (i) assert.equal(b.lo, B[i - 1].hi, 'bands meet edge to edge');
    let n = 0;
    for (let v = 0; v < 256; v++) { const d = v / 255; if (d >= Math.max(b.lo, 0) && d < Math.min(b.hi, 1.0001)) n += H[v]; }
    assert.ok(Math.abs(n - total / 8) <= 3, `band ${i} holds ${n} of ${total}`);
  }
  // the far half is denser, so its bands are narrower in depth
  assert.ok(B[1].hi - B[1].lo < B[6].hi - B[6].lo);
});

test('a map with few distinct depths gives no more bands than depths, and no empty band', () => {
  const H = hist((v) => ([20, 120, 240].includes(v) ? 100 : 0));
  const B = quantileBands(H, 10);
  assert.ok(B.length >= 2 && B.length <= 3, `${B.length} bands`);
  for (const b of B) { assert.ok(b.hi > b.lo); assert.ok(Number.isFinite(b.depth)); }
  for (let d = 0; d <= 1; d += 0.01) for (const b of B) assert.ok(Number.isFinite(bandWeight(d, b)));
});

test('band masks overlap softly: every depth is covered, and a band is nothing far from its range', () => {
  const B = quantileBands(hist((v) => 1 + (v % 7)), 10);
  for (let v = 0; v <= 255; v++) {
    const d = v / 255;
    let sum = 0;
    for (const b of B) sum += bandWeight(d, b);
    assert.ok(sum >= 0.999, `depth ${d.toFixed(3)} covered ${sum}`);
  }
  assert.equal(bandWeight(1, B[0]), 0, 'the farthest band is empty at the nearest depth');
  assert.equal(bandWeight(0, B[B.length - 1]), 0, 'the nearest band is empty at the farthest depth');
  // a pixel near an edge is drawn by both neighbours, so the seam is soft
  const e = B[3].hi;
  assert.ok(bandWeight(e, B[3]) > 0.2 && bandWeight(e, B[4]) > 0.2);
});

test('a flat depth beside a wide band stays in its own band, so a flat wall is never drawn twice at two offsets', () => {
  // two thirds of the picture at one depth (a wall), the rest spread over a wide range (a table)
  const H = hist((v) => (v === 25 ? 20000 : v >= 110 && v <= 215 ? 100 : 0));
  const B = quantileBands(H, 10);
  const own = B.map((b) => bandWeight(25 / 255, b)).sort((x, y) => y - x);
  assert.ok(own[0] >= 0.95, `the wall's own band draws ${own[0].toFixed(3)} of it`);
  assert.ok(own[1] <= 0.05, `a neighbour draws ${own[1].toFixed(3)} of it`);
  let sum = 0; for (const b of B) sum += bandWeight(25 / 255, b);
  assert.ok(sum >= 0.999, 'still fully covered');
});

test('on a push the plate and the bands never shrink inside the box; parts keep the push law; a dolly scales nothing', () => {
  const opts = o({ path: 'push', focus: 0.9 });
  for (const w of [1, 0.6, 0.2, 0]) for (const d of [0, 0.3, 0.9]) {
    const pose = shift(d, w, opts);
    assert.ok(pose.scale * layerScale('band', pose, opts, 900, 600) >= 1 - 1e-12, `band d ${d} w ${w}`);
    assert.equal(layerScale('part', pose, opts, 900, 600), 1);
  }
  const far = shift(0, 1, opts);
  assert.ok(far.scale < 1, 'the push law shrinks a far layer');
  const dolly = o({ focus: 0.9 });
  assert.equal(layerScale('band', shift(0, 1, dolly), dolly, 900, 600), 1, 'a dolly band slides, unscaled');
  assert.ok(layerScale('plate', shift(0, 1, dolly), dolly, 900, 600) > 1, 'the plate still bleeds on a dolly');
});

test('under a part the depth is filled from around it, so the plate behind a part travels with the background', () => {
  const W = 40, H = 30, at = (x, y) => y * W + x;
  // a wall at 25 on the left half, a table at 200 on the right half, a part covering 12..27 x 8..21
  const depth = Float64Array.from({ length: W * H }, (_, i) => (i % W < 20 ? 25 : 200));
  const covered = Uint8Array.from({ length: W * H }, (_, i) => { const x = i % W, y = Math.floor(i / W); return x >= 12 && x < 28 && y >= 8 && y < 22 ? 1 : 0; });
  for (let i = 0; i < covered.length; i++) if (covered[i]) depth[i] = 240;   // the part's own depth
  const out = fillUnder(depth, covered, W, H);
  for (let i = 0; i < out.length; i++) if (!covered[i]) assert.equal(out[i], depth[i], 'outside the part nothing changes');
  for (let y = 8; y < 22; y++) {
    let last = -Infinity;
    for (let x = 12; x < 28; x++) {
      const v = out[at(x, y)];
      assert.ok(v >= 25 - 1e-9 && v <= 200 + 1e-9, `(${x}, ${y}) = ${v} lies between the depths around it`);
      assert.ok(v >= last - 1e-9, `(${x}, ${y}) rises from the wall toward the table`);
      last = v;
    }
  }
  assert.ok(out[at(12, 15)] < 80 && out[at(27, 15)] > 145, 'each side takes after its neighbour');
  // a part wholly inside one depth takes that depth
  const flat = fillUnder(Float64Array.from(depth, (v, i) => (covered[i] ? 240 : 25)), covered, W, H);
  for (let i = 0; i < flat.length; i++) assert.ok(Math.abs(flat[i] - 25) < 1e-9);
  // a horizon behind a part stays level: wall above, table below, never a blend of the two
  const hz = fillUnder(Float64Array.from({ length: W * H }, (_, i) => (covered[i] ? 240 : Math.floor(i / W) < 15 ? 25 : 150)), covered, W, H);
  for (let i = 0; i < hz.length; i++) assert.equal(hz[i], Math.floor(i / W) < 15 ? 25 : 150);
  // rows covered from end to end take a line between the rows above and below
  const rows = fillUnder(Float64Array.from([10, 10, 99, 99, 99, 99, 40, 40]), Uint8Array.from([0, 0, 1, 1, 1, 1, 0, 0]), 2, 4);
  assert.deepEqual(Array.from(rows), [10, 10, 20, 20, 30, 30, 40, 40]);
});

test('the plate is drawn large enough that its displaced picture still covers the whole box', () => {
  const w = 900, h = 600;
  assert.equal(plateBleed({ dx: 0, dy: 0, scale: 1 }, w, h), 1);
  for (const pose of [{ dx: 30, dy: 0, scale: 1 }, { dx: -12, dy: 25, scale: 1 }, { dx: 0, dy: 0, scale: 0.95 }, { dx: 8, dy: -4, scale: 0.97 }]) {
    const m = plateBleed(pose, w, h), S = pose.scale * m;
    assert.ok(m >= 1);
    assert.ok(S * w / 2 - Math.abs(pose.dx) >= w / 2 - 1e-9 && S * h / 2 - Math.abs(pose.dy) >= h / 2 - 1e-9, JSON.stringify({ pose, m }));
  }
});

test('the module is a move with the documented params, settling by default on a dolly', () => {
  assert.equal(MOVE.group, 'moves');
  assert.equal(MOVE.name, 'depth-parallax');
  assert.equal(MOVE.params.end.default, 'settle');
  assert.equal(MOVE.params.bands.default, 10);
  assert.match(MOVE.params.path.type, /dolly-left/);
  for (const k of ['path', 'amount', 'focus', 'aperture', 'bands', 'end']) assert.ok(MOVE.params[k], k);
});

test('both demo scenes show the picture full bleed, so it fills 16x9 and 9x16 alike', () => {
  const story = JSON.parse(readFileSync(new URL('../../patterns/moves/depth-parallax/demo/story.json', import.meta.url), 'utf8'));
  for (const sc of story.scenes) {
    const img = sc.beats.find((b) => b.slot === 'image');
    assert.equal(img.params?.frame, 'bleed', sc.id);
  }
  for (const f of ['16x9', '9x16']) assert.ok(story.formats.includes(f), f);
});

test('the demo shows the lens at the default depth: no scene turns the lens off or lowers the drift', () => {
  const story = JSON.parse(readFileSync(new URL('../../patterns/moves/depth-parallax/demo/story.json', import.meta.url), 'utf8'));
  for (const sc of story.scenes) {
    const p = sc.moveParams ?? {};
    assert.ok(p.aperture == null || p.aperture > 0, `${sc.id}: the lens is on`);
    assert.ok(p.amount == null || p.amount >= 0.12, `${sc.id}: at least the default drift`);
  }
});

// fillLines: a hole in an RGBA picture filled so straight edges run on through it, never blurred
const WALL = [222, 216, 206], LINE = [165, 160, 152], LIP = [96, 80, 64], TABLE = [186, 156, 124];
function picture(W, H, at) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = at(x, y), i = (y * W + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3] ?? 255; }
  return px;
}
const rectMask = (W, H, x0, y0, x1, y1) => Uint8Array.from({ length: W * H }, (_, i) => { const x = i % W, y = Math.floor(i / W); return x >= x0 && x < x1 && y >= y0 && y < y1 ? 1 : 0; });
const off = (px, W, x, y, c) => { const i = (y * W + x) * 4; return Math.max(Math.abs(px[i] - c[0]), Math.abs(px[i + 1] - c[1]), Math.abs(px[i + 2] - c[2])); };

test('a hole fill runs a horizontal line straight through the hole and keeps the rest flat', () => {
  const W = 40, H = 30, truth = (x, y) => (y === 14 || y === 15 ? LINE : WALL);
  const hole = rectMask(W, H, 10, 5, 30, 25);
  const src = picture(W, H, (x, y) => (hole[y * W + x] ? [0, 0, 0] : truth(x, y)));
  const out = fillLines(src, W, H, hole);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) assert.ok(off(out, W, x, y, truth(x, y)) <= 2, `(${x}, ${y}) is ${off(out, W, x, y, truth(x, y))} off`);
});

test('a hole fill carries a vertical line down to a level edge and stops there, and keeps the edge level', () => {
  // tiles above row 20 with a vertical line at x 19-20, a lip at rows 20-21, a table below
  const W = 40, H = 40, truth = (x, y) => (y >= 22 ? TABLE : y >= 20 ? LIP : x === 19 || x === 20 ? LINE : WALL);
  const hole = rectMask(W, H, 10, 8, 30, 32);
  const src = picture(W, H, (x, y) => (hole[y * W + x] ? [0, 0, 0] : truth(x, y)));
  const out = fillLines(src, W, H, hole);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) assert.ok(off(out, W, x, y, truth(x, y)) <= 2, `(${x}, ${y}) is ${off(out, W, x, y, truth(x, y))} off`);
});

test('completing a part behind a nearer one bridges only between its own pixels: a bar runs on, nothing grows past it', () => {
  // a bar at rows 10-15 with a gap at x 15-24 where a nearer part covers it; elsewhere the part is transparent
  const W = 40, H = 30, BAR = [140, 108, 78];
  const covered = rectMask(W, H, 15, 2, 25, 28);
  const src = picture(W, H, (x, y) => (y >= 10 && y < 16 && !covered[y * W + x] ? [...BAR, 255] : [0, 0, 0, 0]));
  const out = fillLines(src, W, H, covered, { both: true });
  for (let y = 0; y < H; y++) for (let x = 15; x < 25; x++) {
    const a = out[(y * W + x) * 4 + 3];
    if (y >= 10 && y < 16) { assert.ok(a >= 250, `(${x}, ${y}) alpha ${a}`); assert.ok(off(out, W, x, y, BAR) <= 2); }
    else assert.equal(a, 0, `(${x}, ${y}) stays transparent`);
  }
  for (let i = 0; i < out.length; i++) if (!covered[i >> 2]) assert.equal(out[i], src[i], 'pixels outside the hole are kept');
});
