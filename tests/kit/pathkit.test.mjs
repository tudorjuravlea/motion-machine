// pathkit: SVG path data as real geometry. Parsing (every command, arcs to cubics, flags glued to the
// next number), shapes, the arc-length table, slicing as geometry, and point and tangent at a fraction
// with a continuous angle. Pure: the same numbers in Node as in the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify, shape, bbox, measure, reverse, transform, lengthOf, cubicAt, splitCubic, subArea, fit } from '../../runtime/kit/pathkit.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);
const ROOT = new URL('../../', import.meta.url).pathname;

test('parse: absolute and relative lines, h and v, close, implicit repeats', () => {
  const p = parse('M10 10 L 20 10 h 10 v 10 H 10 V 10 z m 5 5 l 5 0 5 5');
  assert.equal(p.subs.length, 2);
  assert.equal(p.subs[0].closed, true);
  assert.equal(p.subs[0].segs.length, 5);
  const last = p.subs[0].segs.at(-1);
  assert.deepEqual([last[6], last[7]], [10, 10]);
  // the second sub starts where the close left the pen (10,10) plus the relative move
  assert.deepEqual([p.subs[1].segs[0][0], p.subs[1].segs[0][1]], [15, 15]);
  assert.equal(p.subs[1].segs.length, 2, 'l with two pairs is two lines');
  assert.equal(p.subs[1].closed, false);
});

test('parse: a moveto followed by pairs is lines; scientific notation; no separators needed', () => {
  const p = parse('M0,0 10,0 10,10 1e1-10 z');
  assert.equal(p.subs[0].segs.length, 4);
  const q = parse('M.5.5L1.5.5');
  assert.deepEqual([q.subs[0].segs[0][6], q.subs[0].segs[0][7]], [1.5, 0.5]);
});

test('parse: quadratics and smooth curves become cubics through the same points', () => {
  const q = parse('M0 0 Q 50 100 100 0 T 200 0');
  assert.equal(q.subs[0].segs.length, 2);
  const [a, b] = q.subs[0].segs;
  near(cubicAt(a, 0.5)[1], 50, 1e-9, 'the quad apex');
  // T reflects the control: the second quad's control is (150,-100)
  near(cubicAt(b, 0.5)[1], -50, 1e-9, 'T reflects');
  const s = parse('M0 0 C 0 50 50 100 100 100 S 200 50 200 0');
  const [, c2] = s.subs[0].segs;
  near(c2[2], 150, 1e-9, 'S reflects the previous control (50,100) about (100,100)');
  near(c2[3], 100, 1e-9);
});

test('parse: S and T reflect only after a cubic or a quadratic; otherwise the control is the current point', () => {
  const s = parse('M0 0 L 10 0 S 30 10 40 0');
  const seg = s.subs[0].segs[1];
  assert.deepEqual([seg[2], seg[3]], [10, 0]);
  const t = parse('M0 0 C 0 10 10 10 10 0 T 20 0');
  const tq = t.subs[0].segs[1];
  near(tq[0], 10, 1e-9);
  near(tq[2], 10, 1e-9, 'T after a cubic is a line to the point (the control is the current point)');
});

test('parse: an arc is cubics and passes through its end point exactly', () => {
  const p = parse('M 10 0 A 10 10 0 0 1 0 10');
  assert.equal(p.subs[0].segs.length, 1);
  const s = p.subs[0].segs[0];
  assert.deepEqual([s[6], s[7]], [0, 10]);
  near(Math.hypot(...cubicAt(s, 0.5)), 10, 3e-3, 'the middle of a quarter arc about (0,0)');
  const half = parse('M 0 0 a 5 5 0 1 1 10 0');
  assert.equal(half.subs[0].segs.length, 2, 'a half turn is two quarter cubics');
  const big = parse('M 0 0 a 5 5 0 1 1 1 0');
  assert.ok(big.subs[0].segs.length >= 3, 'a large arc is more than a half turn');
});

test('parse: arc radii that are too small are scaled up; zero radii are a line', () => {
  const p = parse('M 0 0 A 1 1 0 0 1 10 0');
  const m = measure(p);
  near(m.length, Math.PI * 5, 0.01, 'half a circle of radius 5');
  const z = parse('M 0 0 A 0 5 0 0 1 10 0');
  assert.equal(z.subs[0].segs.length, 1);
  near(lengthOf(z), 10, 1e-9);
});

test('parse: arc flags may be glued to the next number', () => {
  const glued = parse('M0 0a8 8 0 018 8');
  const spaced = parse('M0 0a8 8 0 0 1 8 8');
  assert.equal(stringify(glued), stringify(spaced));
  assert.equal(glued.subs[0].segs.length >= 1, true);
  const g2 = parse('M0 0A5 5 0 1110 0');
  assert.equal(stringify(g2), stringify(parse('M0 0A5 5 0 1 1 10 0')));
});

test('parse: a bad number stops the path where it is, a subpath that is only a move is dropped', () => {
  const p = parse('M 0 0 L 10 0 L x 5 L 20 20');
  assert.equal(p.subs[0].segs.length, 1);
  assert.equal(parse('M 5 5').subs.length, 0);
  assert.equal(parse('M 5 5 z').subs.length, 0);
  assert.equal(parse('').subs.length, 0);
  assert.equal(parse(null).subs.length, 0);
});

test('stringify round-trips: parse(stringify(p)) has the same geometry', () => {
  const src = 'M10 20C30 40 50 60 70 80S 90 10 20 30Q 5 5 6 7Z M100 100 L 120 130';
  const a = parse(src);
  const b = parse(stringify(a, 6));
  assert.equal(a.subs.length, b.subs.length);
  near(lengthOf(a), lengthOf(b), 1e-4);
  assert.equal(stringify(a, 3).includes('-0 '), false);
});

test('shapes: circle, ellipse, rect, rounded rect, line, polygon, polyline', () => {
  const c = shape('circle', { cx: 50, cy: 50, r: 20 });
  assert.equal(c.subs[0].segs.length, 4);
  assert.equal(c.subs[0].closed, true);
  assert.deepEqual([c.subs[0].segs[0][0], c.subs[0].segs[0][1]], [70, 50], 'a circle starts at its right-hand point and runs clockwise on screen');
  near(cubicAt(c.subs[0].segs[0], 1)[1], 70, 1e-9);
  near(lengthOf(c), 2 * Math.PI * 20, 0.05);
  const e = shape('ellipse', { cx: 0, cy: 0, rx: 30, ry: 10 });
  const bb = bbox(e);
  near(bb.x, -30, 1e-6); near(bb.w, 60, 1e-6); near(bb.h, 20, 1e-6);
  const r = shape('rect', { x: 10, y: 20, width: 40, height: 30 });
  near(lengthOf(r), 140, 1e-9);
  const rr = shape('rect', { x: 0, y: 0, width: 40, height: 40, rx: 10 });
  near(lengthOf(rr), 4 * 20 + 2 * Math.PI * 10, 0.05);
  assert.equal(shape('line', { x1: 0, y1: 0, x2: 3, y2: 4 }).subs[0].closed, false);
  near(lengthOf(shape('line', { x1: 0, y1: 0, x2: 3, y2: 4 })), 5, 1e-9);
  const pg = shape('polygon', { points: '0,0 10,0 10,10' });
  assert.equal(pg.subs[0].closed, true);
  assert.equal(pg.subs[0].segs.length, 3);
  assert.equal(shape('polyline', { points: '0,0 10,0 10,10' }).subs[0].segs.length, 2);
  assert.equal(shape('blob', {}).subs.length, 0);
});

test('bbox is tight: a bowed curve is measured at its extremum, not at its control points', () => {
  const b = bbox(parse('M0 0 C 0 100 100 100 100 0'));
  near(b.y, 0, 1e-9);
  near(b.h, 75, 1e-9, 'the apex of this cubic is 75');
  near(b.w, 100, 1e-9);
});

test('measure: lengths of a line and a circle', () => {
  near(measure(parse('M0 0 L 30 40')).length, 50, 1e-9);
  const m = measure(shape('circle', { cx: 0, cy: 0, r: 100 }));
  near(m.length, 2 * Math.PI * 100, 0.1);
  const truth = measure(shape('circle', { cx: 0, cy: 0, r: 100 }), { resolution: 1024 }).length;
  const fine = measure(shape('circle', { cx: 0, cy: 0, r: 100 }), { resolution: 128 });
  assert.ok(Math.abs(fine.length - truth) < Math.abs(m.length - truth) + 1e-9, 'a finer table is no worse');
  near(truth, 2 * Math.PI * 100, 0.3, 'the four-cubic circle is within 5e-4 of a circle');
});

test('at: points on a circle are on the circle, the tangent is perpendicular to the radius', () => {
  const r = 100;
  const m = measure(shape('circle', { cx: 0, cy: 0, r }));
  for (const f of [0, 0.1, 0.25, 0.4, 0.5, 0.77, 0.99, 1]) {
    const q = m.at(f);
    near(Math.hypot(q.x, q.y), r, 0.06, `radius at ${f}`);
    near(q.x * q.tx + q.y * q.ty, 0, 0.2, `tangent at ${f}`);
    near(q.x, r * Math.cos(2 * Math.PI * f), 0.35, `x at ${f}`);
    near(q.y, r * Math.sin(2 * Math.PI * f), 0.35, `y at ${f}`);
  }
});

test('at: the fraction is a share of the length, so a pen at constant speed is a pen on equal fractions', () => {
  const m = measure(parse('M0 0 C 0 300 10 0 300 0'), { resolution: 64 });
  for (const f of [0.1, 0.33, 0.5, 0.8, 0.97]) {
    const s = m.slice(0, f), e = s.subs[0].segs.at(-1), p = m.at(f);
    near(e[6], p.x, 1e-6, `x at ${f}`); near(e[7], p.y, 1e-6, `y at ${f}`);
    near(lengthOf(s, 256) / m.length, f, 0.004, `length of the first ${f}`);
  }
});

test('angle is continuous: it never jumps by a turn, and a full circle turns a full turn', () => {
  const m = measure(shape('circle', { cx: 0, cy: 0, r: 50 }));
  let prev = m.at(0).angle, worst = 0;
  for (let i = 1; i <= 400; i++) {
    const a = m.at(i / 400).angle;
    worst = Math.max(worst, Math.abs(a - prev));
    prev = a;
  }
  assert.ok(worst < 0.1, `largest step ${worst}`);
  near(m.at(1).angle - m.at(0).angle, 2 * Math.PI, 0.02, 'a clockwise (on screen) circle turns +2pi');
  near(m.turn, 2 * Math.PI, 0.02);
  // a loop goes on turning: 1.5 laps is 3pi past the start
  near(m.at(1.5, { wrap: true }).angle - m.at(0).angle, 3 * Math.PI, 0.05);
  near(m.at(2, { wrap: true }).x, 50, 1e-6, 'the lap closes on its start');
});

test('angle at a corner steps by the turn, never by a turn plus 2pi', () => {
  const m = measure(parse('M0 0 L 100 0 L 100 100 L 0 100 L 0 0'));
  const a = [0.1, 0.3, 0.6, 0.9].map((f) => m.at(f).angle);
  near(a[0], 0, 1e-9);
  near(a[1] - a[0], Math.PI / 2, 1e-9);
  near(a[2] - a[1], Math.PI / 2, 1e-9);
  near(a[3] - a[2], Math.PI / 2, 1e-9);
  const back = measure(parse('M0 0 L 100 0 L 0 0.0001'));
  assert.ok(Math.abs(back.at(0.9).angle - back.at(0.1).angle) <= Math.PI + 1e-6, 'a hairpin turns by at most a half turn');
});

test('angle with a window averages the turn across a corner', () => {
  const m = measure(parse('M0 0 L 100 0 L 100 100'));
  const sharp = m.at(0.5 - 1e-6).angle, after = m.at(0.5 + 1e-6).angle;
  near(after - sharp, Math.PI / 2, 1e-3);
  const mid = m.at(0.5, { window: 0.2 }).angle;
  assert.ok(mid > sharp + 0.2 && mid < after - 0.2, `a window leaves ${mid} between ${sharp} and ${after}`);
});

test('slice: a half of a line, a quarter of a circle, reversed, and the whole', () => {
  const line = parse('M0 0 L 100 0');
  const h = measure(line).slice(0.25, 0.75);
  near(h.subs[0].segs[0][0], 25, 1e-9); near(h.subs[0].segs[0][6], 75, 1e-9);
  near(lengthOf(h), 50, 1e-9);
  const circle = shape('circle', { cx: 0, cy: 0, r: 100 });
  const mc = measure(circle);
  const q = mc.slice(0, 0.25);
  const end = q.subs[0].segs.at(-1);
  near(end[6], 0, 0.35); near(end[7], 100, 0.35);
  near(lengthOf(q), Math.PI * 50, 0.1);
  // every point of the slice is on the circle
  for (const s of q.subs[0].segs) for (let t = 0; t <= 1; t += 0.1) near(Math.hypot(...cubicAt(s, t)), 100, 0.06);
  const mid = mc.slice(0.1, 0.9);
  near(lengthOf(mid), 2 * Math.PI * 100 * 0.8, 0.2);
  const rev = mc.slice(0.9, 0.1);
  near(lengthOf(rev), lengthOf(mid), 1e-6);
  assert.deepEqual([rev.subs[0].segs[0][0], rev.subs[0].segs[0][1]].map((x) => Math.round(x * 1e6)), [mid.subs[0].segs.at(-1)[6], mid.subs[0].segs.at(-1)[7]].map((x) => Math.round(x * 1e6)), 'a backward slice starts where the forward one ends');
  assert.equal(mc.slice(0, 1).subs[0].closed, true, 'the whole path keeps its closing');
  assert.equal(mc.slice(0.3, 0.3).subs.length, 0, 'an empty slice is no path');
  assert.equal(mc.slice(-1, 2).subs[0].segs.length, 4, 'values are clamped');
});

test('slice: the arc-length of a slice is the fraction asked for, at several resolutions', () => {
  const p = parse('M0 0 C 0 200 200 200 200 0 S 300 -100 400 0');
  const m = measure(p, { resolution: 48 });
  for (const [a, b] of [[0, 0.3], [0.2, 0.9], [0.45, 0.55], [0.7, 1]]) {
    near(lengthOf(m.slice(a, b), 96) / m.length, b - a, 0.004, `${a}..${b}`);
  }
});

test('slice across subpaths keeps the break', () => {
  const p = parse('M0 0 L 100 0 M 0 50 L 100 50');
  const m = measure(p);
  const s = m.slice(0.25, 0.75);
  assert.equal(s.subs.length, 2);
  near(s.subs[0].segs[0][0], 50, 1e-9);
  near(s.subs[1].segs[0][6], 50, 1e-9);
});

test('reverse and transform and splitCubic', () => {
  const p = parse('M0 0 C 10 20 30 40 50 60 L 70 0');
  const r = reverse(p);
  assert.deepEqual([r.subs[0].segs[0][0], r.subs[0].segs[0][1]], [70, 0]);
  near(lengthOf(r), lengthOf(p), 1e-9);
  const moved = transform(p, [2, 0, 0, 2, 5, 5]);
  assert.deepEqual([moved.subs[0].segs[0][0], moved.subs[0].segs[0][1]], [5, 5]);
  near(lengthOf(moved), 2 * lengthOf(p), 1e-6);
  const [a, b] = splitCubic(p.subs[0].segs[0], 0.4);
  assert.deepEqual([a[6], a[7]], [b[0], b[1]]);
  const whole = cubicAt(p.subs[0].segs[0], 0.4);
  near(a[6], whole[0], 1e-9); near(a[7], whole[1], 1e-9);
});

test('subArea is signed: clockwise on screen is positive', () => {
  assert.ok(subArea(shape('circle', { cx: 0, cy: 0, r: 10 }).subs[0]) > 0);
  assert.ok(subArea(reverse(shape('circle', { cx: 0, cy: 0, r: 10 })).subs[0]) < 0);
  near(subArea(shape('rect', { x: 0, y: 0, width: 10, height: 20 }).subs[0]), 200, 1e-6);
});

// Every shipped SVG that holds paths parses, and its geometry survives the round trip.
function svgFiles(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.git' || n === 'out') continue;
    const f = join(dir, n);
    const st = statSync(f);
    if (st.isDirectory()) svgFiles(f, out); else if (n.endsWith('.svg')) out.push(f);
  }
  return out;
}
test('the shipped SVGs: every path d parses, measures and round-trips', () => {
  let seen = 0;
  for (const f of svgFiles(join(ROOT, 'fixtures')).concat(svgFiles(join(ROOT, 'patterns')), svgFiles(join(ROOT, 'styles')), svgFiles(join(ROOT, 'tests')))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<path\b[^>]*?\bd\s*=\s*"([^"]*)"/g)) {
      const p = parse(m[1]);
      assert.ok(p.subs.length > 0, `${f}: ${m[1].slice(0, 40)} parsed to nothing`);
      const L = lengthOf(p, 64);
      assert.ok(L > 0 && Number.isFinite(L), f);
      const again = parse(stringify(p, 5));
      near(lengthOf(again, 64), L, Math.max(1e-3, L * 1e-4), f);
      seen++;
    }
  }
  assert.ok(seen >= 3, `read ${seen} shipped paths`);
});

test('fit lays a drawing in a box evenly and centred, like xMidYMid meet', () => {
  const p = shape('rect', { x: 0, y: 0, width: 100, height: 50 });
  const f = bbox(fit(p, { x: 0, y: 0, w: 100, h: 50 }, { x: 10, y: 20, w: 400, h: 400 }));
  near(f.w, 400, 1e-9); near(f.h, 200, 1e-9); near(f.x, 10, 1e-9); near(f.y, 120, 1e-9, 'centred across the spare height');
  const g = bbox(fit(p, { x: -10, y: -10, w: 120, h: 70 }, { x: 0, y: 0, w: 120, h: 70 }));
  near(g.x, 10, 1e-9); near(g.y, 10, 1e-9, 'the drawing\'s own padding is kept');
  assert.equal(fit(p, { x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 5, h: 5 }).subs.length, 0);
});
