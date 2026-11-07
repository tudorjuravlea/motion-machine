// entrances/one-line's pure parts: an SVG mark read into polylines (paths with every command,
// circles, ellipses, rects, lines, polylines, polygons), planned as one continuous line (the parts in
// a near-to-near order joined by smooth bridges), timed so the pen slows on curves without any jump
// in speed, and weighted so a slow pen draws a wider line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePath, markOf, planLine, timeLine, widthsOf, fitBox, screenWidth } from '../../patterns/entrances/one-line/pattern.js';

const FIX = new URL('../../fixtures/one-line/', import.meta.url);
const read = (f) => readFileSync(new URL(f, FIX), 'utf8');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
const near = (p, pts) => { let m = Infinity; for (let i = 1; i < pts.length; i++) m = Math.min(m, segDist(p, pts[i - 1], pts[i])); return m; };

test('paths: lines, curves and arcs, absolute and relative, flattened into polylines', () => {
  const [sq] = parsePath('M 10 10 H50 V50 h-40 z');
  assert.equal(sq.closed, true);
  for (const c of [[10, 10], [50, 10], [50, 50], [10, 50]]) assert.ok(sq.points.some((p) => dist(p, c) < 1e-9), `corner ${c}`);
  const [circle] = parsePath('M 60 100 A40 40 0 1 0 140 100 A40 40 0 1 0 60 100 Z');
  for (const p of circle.points) assert.ok(Math.abs(dist(p, [100, 100]) - 40) < 0.2, `on the circle: ${p}`);
  assert.ok(circle.points.length >= 24);
  const [rel] = parsePath('m60 100 a40 40 0 1 0 80 0 a40 40 0 1 0 -80 0');
  for (const p of rel.points) assert.ok(Math.abs(dist(p, [100, 100]) - 40) < 0.2);
  const [cubic] = parsePath('M0 0 C0 50 100 50 100 0 S200 -50 200 0');
  assert.deepEqual(cubic.points[0], [0, 0]);
  assert.ok(dist(cubic.points.at(-1), [200, 0]) < 1e-9);
  const mid = cubic.points.reduce((b, p) => (Math.abs(p[0] - 50) < Math.abs(b[0] - 50) ? p : b));
  assert.ok(Math.abs(mid[1] - 37.5) < 1, `the curve's middle sits at 37.5: ${mid}`);
  const [quad] = parsePath('M0 0 Q50 100 100 0 T200 0');
  assert.ok(quad.points.some((p) => Math.abs(p[0] - 150) < 2 && p[1] < -45), 'T reflects the control');
  assert.equal(parsePath('M0 0 L10 0 M 20 0 L30 0').length, 2, 'each M starts a part');
  assert.deepEqual(parsePath('M1,2l3-4').at(0).points, [[1, 2], [4, -2]], 'commas and signs as separators');
});

test('an SVG mark: its viewBox and every drawable element, in document order', () => {
  const wave = markOf(read('wave.svg'));
  assert.deepEqual(wave.box, { x: 0, y: 0, w: 200, h: 120 });
  assert.equal(wave.parts.length, 1);
  const frame = markOf(read('frame.svg'));
  assert.equal(frame.parts.length, 2);
  assert.equal(frame.parts[0].closed, true, 'the rect');
  assert.equal(frame.parts[1].closed, false, 'the polyline');
  const orbit = markOf(read('orbit.svg'));
  assert.equal(orbit.parts.length, 3);
  for (const p of orbit.parts[0].points) assert.ok(Math.abs(dist(p, [120, 100]) - 44) < 0.25, 'the circle');
  const shapes = markOf('<svg viewBox="0 0 10 10"><ellipse cx="5" cy="5" rx="4" ry="2"/><line x1="0" y1="0" x2="10" y2="10"/><polygon points="1,1 9,1 5,8"/></svg>');
  assert.deepEqual(shapes.parts.map((p) => p.closed), [true, false, true]);
  assert.deepEqual(markOf('<svg width="30" height="20"><path d="M0 0L30 20"/></svg>').box, { x: 0, y: 0, w: 30, h: 20 }, 'no viewBox: its width and height');
});

test('transforms on elements and their groups are applied, outermost last; what cannot be read is named', () => {
  const close = (a, b) => a.every((p, i) => dist(p, b[i]) < 1e-6);
  const g = markOf('<svg viewBox="0 0 100 100"><g transform="translate(10 20) scale(2)"><path d="M0 0L10 0"/></g></svg>');
  assert.ok(close(g.parts[0].points, [[10, 20], [30, 20]]), JSON.stringify(g.parts[0].points));
  const nested = markOf('<svg viewBox="0 0 100 100"><g transform="translate(50,0)"><g transform="rotate(90)"><line x1="0" y1="0" x2="10" y2="0" transform="translate(5)"/></g></g></svg>');
  assert.ok(close(nested.parts[0].points, [[50, 5], [50, 15]]), JSON.stringify(nested.parts[0].points));
  const m = markOf('<svg viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10" transform="matrix(1 0 0 1 3 4)"/><g transform="skewX(45)"><path d="M0 10L0 0"/></g><path d="M0 0L5 5"/></svg>');
  assert.ok(m.parts[0].points.some((p) => dist(p, [3, 4]) < 1e-6) && m.parts[0].points.some((p) => dist(p, [13, 14]) < 1e-6), 'matrix');
  assert.ok(close(m.parts[1].points, [[10, 10], [0, 0]]), `skewX: ${JSON.stringify(m.parts[1].points)}`);
  assert.ok(close(m.parts[2].points, [[0, 0], [5, 5]]), 'a sibling after a closed group is untransformed');
  assert.deepEqual(m.unsupported, []);
  const u = markOf('<svg viewBox="0 0 10 10"><defs><path id="a" d="M0 0L1 1"/></defs><use href="#a"/><path d="M0 0L2 2" style="transform: scale(2)"/></svg>');
  assert.deepEqual(u.unsupported.sort(), ['<use>', 'a CSS transform'].sort());
});

test('the plan: one continuous line through every part of the mark, joined by smooth bridges', () => {
  for (const f of ['wave.svg', 'frame.svg', 'orbit.svg']) {
    const m = markOf(read(f));
    const line = planLine(m.parts, { step: 1 });
    for (const part of m.parts) for (const p of part.points) assert.ok(near(p, line.points) < 0.6, `${f}: ${p} is off the line`);
    for (let i = 1; i < line.points.length; i++) assert.ok(dist(line.points[i], line.points[i - 1]) <= 1.0001, `${f}: an even step`);
    const markLen = m.parts.reduce((s, p) => s + p.points.slice(1).reduce((a, q, i) => a + dist(q, p.points[i]), 0) + (p.closed ? dist(p.points.at(-1), p.points[0]) : 0), 0);
    const bridged = line.bridge.filter(Boolean).length;
    assert.ok(bridged <= 0.25 * markLen, `${f}: bridges ${bridged} of ${markLen.toFixed(0)}`);
    // smooth: no sharp turn where a bridge meets the mark
    for (let i = 2; i < line.points.length - 2; i++) {
      if (line.bridge[i] === line.bridge[i - 1]) continue;
      const a = Math.atan2(line.points[i][1] - line.points[i - 2][1], line.points[i][0] - line.points[i - 2][0]);
      const b = Math.atan2(line.points[i + 2][1] - line.points[i][1], line.points[i + 2][0] - line.points[i][0]);
      const turn = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
      assert.ok(turn < 0.6, `${f}: a bridge joins at ${turn.toFixed(2)} rad`);
    }
  }
  assert.equal(planLine(markOf(read('wave.svg')).parts, { step: 1 }).bridge.filter(Boolean).length, 0, 'one part needs no bridge');
});

test('the timing: from 0 to 1, always forward, slower on curves, with no jump in speed', () => {
  const line = planLine(markOf(read('frame.svg')).parts, { step: 1 });
  const T = timeLine(line.points, { curves: 1.5 });
  assert.equal(T[0], 0);
  assert.equal(T.at(-1), 1);
  for (let i = 1; i < T.length; i++) assert.ok(T[i] > T[i - 1], `forward at ${i}`);
  const speed = T.slice(1).map((t, i) => 1 / (t - T[i]));
  for (let i = 1; i < speed.length; i++) assert.ok(speed[i] / speed[i - 1] < 2 && speed[i - 1] / speed[i] < 2, `a jump at ${i}`);
  // the rect's straight top edge against its rounded corner
  const edge = [], corner = [];
  line.points.forEach((p, i) => {
    if (i === 0 || line.bridge[i]) return;
    if (Math.abs(p[1] - 30) < 0.01 && p[0] > 70 && p[0] < 130) edge.push(speed[i - 1]);
    if (p[0] > 150 && p[1] < 50 && Math.hypot(p[0] - 142, p[1] - 58) > 27) corner.push(speed[i - 1]);
  });
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  assert.ok(edge.length > 10 && corner.length > 5, `${edge.length} edge, ${corner.length} corner samples`);
  assert.ok(mean(corner) < 0.8 * mean(edge), `the pen slows on the curve: ${mean(corner)} vs ${mean(edge)}`);
  const even = timeLine(line.points, { curves: 0 });
  assert.ok(Math.abs(even[Math.floor(even.length / 2)] - 0.5) < 0.01, 'curves 0 is an even pace');
});

test('the weight: a slower pen draws a wider line, within its range; never thinner on screen than the floor', () => {
  const line = planLine(markOf(read('orbit.svg')).parts, { step: 1 });
  const T = timeLine(line.points, { curves: 1.5 });
  const w = widthsOf(T, 6);
  assert.equal(w.length, line.points.length);
  for (const x of w) assert.ok(x >= 6 * 0.88 - 1e-9 && x <= 6 * 1.18 + 1e-9, `${x}`);
  const speed = T.slice(1).map((t, i) => 1 / (t - T[i]));
  const slow = speed.indexOf(Math.min(...speed)), fast = speed.indexOf(Math.max(...speed));
  assert.ok(w[slow + 1] > w[fast + 1], 'slow is wider than fast');
  assert.equal(screenWidth(6, 1), 6);
  assert.equal(screenWidth(1, 0.5), 3, 'a line under 1.5 px on screen is widened to 1.5 px on screen');
  assert.equal(screenWidth(4, 0.25), 6);
});

test('the mark fits its slot whole, centred, at its own proportions', () => {
  const f = fitBox({ x: 0, y: 0, w: 200, h: 100 }, 1000, 1000, 0.8);
  assert.equal(f.k, 4);
  assert.deepEqual([f.dx, f.dy], [100, 300]);
  const g = fitBox({ x: 10, y: 20, w: 100, h: 100 }, 600, 300, 1);
  assert.equal(g.k, 3);
  assert.deepEqual([g.dx, g.dy], [150 - 30, 0 - 60]);
});
