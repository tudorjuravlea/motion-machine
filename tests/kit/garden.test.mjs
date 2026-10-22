// text/garden's growth model, in Node: a stem is a chain of cubic Bézier segments that leaves its
// anchor between the outward normal and "up", turns in a sinuous S, stays smooth across its joints,
// shortens segment by segment and puts out one level of offshoots; vines end in a shrinking spiral.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sprout, startHeading, spiral } from '../../patterns/text/garden/pattern.js';
import { random } from '../../runtime/kit/random.js';

const DEG = Math.PI / 180;
const ang = (v) => Math.atan2(v[1], v[0]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const many = (n, f) => Array.from({ length: n }, (_, i) => f(random(`t|${i}`), i));
const base = { x: 0, y: 0, heading: -Math.PI / 2, size: 100, stemScale: 1, density: 1 };

test('a stem has 3 to 6 segments; the first is size × stemScale × 0.55..0.85, each next 0.72..0.9 of the one before', () => {
  for (const s of many(400, (r) => sprout(r, base))) {
    assert.ok(s.segs.length >= 3 && s.segs.length <= 6, `${s.segs.length} segments`);
    assert.ok(s.segs[0].len >= 55 - 1e-9 && s.segs[0].len <= 85 + 1e-9, `first ${s.segs[0].len}`);
    for (let k = 1; k < s.segs.length; k++) {
      const q = s.segs[k].len / s.segs[k - 1].len;
      assert.ok(q >= 0.72 - 1e-9 && q <= 0.9 + 1e-9, `ratio ${q}`);
    }
  }
  const counts = new Set(many(400, (r) => sprout(r, base).segs.length));
  assert.deepEqual([...counts].sort(), [3, 4, 5, 6], 'every count from 3 to 6 occurs');
});

test('stemScale scales every length and nothing else', () => {
  const a = sprout(random('scale'), base), b = sprout(random('scale'), { ...base, stemScale: 2 });
  assert.equal(a.segs.length, b.segs.length);
  a.segs.forEach((s, k) => {
    assert.ok(Math.abs(b.segs[k].len - 2 * s.len) < 1e-9);
    assert.ok(Math.abs(b.segs[k].turn - s.turn) < 1e-12);
  });
});

test('each segment turns 12 to 34 degrees; the sign flips at about 7 joints in 10, so the line is an S', () => {
  let flips = 0, pairs = 0;
  for (const s of many(600, (r) => sprout(r, base))) {
    for (const g of s.segs) assert.ok(Math.abs(g.turn) >= 12 * DEG - 1e-9 && Math.abs(g.turn) <= 34 * DEG + 1e-9, `turn ${g.turn / DEG}`);
    for (let k = 1; k < s.segs.length; k++) { pairs++; if (Math.sign(s.segs[k].turn) !== Math.sign(s.segs[k - 1].turn)) flips++; }
  }
  const share = flips / pairs;
  assert.ok(share > 0.65 && share < 0.75, `flip share ${share.toFixed(3)}`);
});

test('control points sit at a third and two thirds of the chord, on the outside of the bend, and the curve is smooth across joints', () => {
  for (const s of many(200, (r) => sprout(r, base))) {
    s.segs.forEach((g, k) => {
      const ch = sub(g.p3, g.p0), L = Math.hypot(...ch), u = [ch[0] / L, ch[1] / L], n = [-u[1], u[0]];
      const along = (p) => (sub(p, g.p0)[0] * u[0] + sub(p, g.p0)[1] * u[1]) / L;
      const side = (p) => sub(p, g.p0)[0] * n[0] + sub(p, g.p0)[1] * n[1];
      assert.ok(Math.abs(along(g.c1) - 1 / 3) < 1e-9 && Math.abs(along(g.c2) - 2 / 3) < 1e-9, 'a third and two thirds along');
      assert.ok(Math.abs(side(g.c1) - side(g.c2)) < 1e-9, 'pushed sideways by the same amount');
      // the start and end tangents differ by the segment's turn
      const t0 = ang(sub(g.c1, g.p0)), t1 = ang(sub(g.p3, g.c2));
      assert.ok(Math.abs(wrap(t1 - t0 - g.turn)) < 1e-9, 'the tangent turns by the segment\'s turn');
      if (k) {
        const prev = s.segs[k - 1];
        assert.ok(Math.hypot(...sub(g.p0, prev.p3)) < 1e-9, 'segments join');
        assert.ok(Math.abs(wrap(ang(sub(g.c1, g.p0)) - ang(sub(prev.p3, prev.c2)))) < 1e-9, 'the outgoing tangent is the incoming one');
      }
    });
    // the first tangent is the start heading
    assert.ok(Math.abs(wrap(ang(sub(s.segs[0].c1, s.segs[0].p0)) - base.heading)) < 1e-9);
  }
});

test('offshoots: at joints after the first, about 0.25 × density of them, 1 to 3 segments, turned 28 to 58 degrees, sides alternating, never branching again', () => {
  for (const density of [1, 1.6]) {
    let joints = 0, kids = 0;
    for (const s of many(1500, (r) => sprout(r, { ...base, density }))) {
      joints += Math.max(0, s.segs.length - 2);
      let lastSide = 0;
      for (const c of s.children) {
        kids++;
        assert.ok(c.at >= 2 && c.at <= s.segs.length - 1, `at joint ${c.at} of ${s.segs.length}`);
        assert.ok(c.stem.segs.length >= 1 && c.stem.segs.length <= 3, `${c.stem.segs.length} child segments`);
        assert.deepEqual(c.stem.children, [], 'children never have children');
        const parentTan = ang(sub(s.segs[c.at].c1, s.segs[c.at].p0));
        const off = wrap(ang(sub(c.stem.segs[0].c1, c.stem.segs[0].p0)) - parentTan);
        assert.ok(Math.abs(off) >= 28 * DEG - 1e-9 && Math.abs(off) <= 58 * DEG + 1e-9, `child turned ${off / DEG}`);
        if (lastSide) assert.notEqual(Math.sign(off), lastSide, 'sides alternate');
        lastSide = Math.sign(off);
        const q = c.stem.segs[0].len / s.segs[c.at].len;
        assert.ok(q >= 0.55 - 1e-9 && q <= 0.7 + 1e-9, `child first length ${q}`);
        assert.ok(Math.hypot(...sub(c.stem.segs[0].p0, s.segs[c.at].p0)) < 1e-9, 'it starts on the joint');
      }
    }
    const share = kids / joints;
    assert.ok(Math.abs(share - 0.25 * density) < 0.04, `density ${density}: ${share.toFixed(3)} of joints put out an offshoot`);
  }
});

test('the start heading lies between the outward normal and up, weighted 0.3 to 0.7 toward up', () => {
  for (const [nx, ny] of [[1, 0], [-1, 0], [0.6, -0.8], [-0.8, 0.6]]) {
    for (let i = 0; i < 100; i++) {
      const h = startHeading(random(`h|${i}`), nx, ny);
      const v = [Math.cos(h), Math.sin(h)];
      // v = normalise((1 - w) n + w up): solve for w along the segment n → up
      const a = [nx, ny], up = [0, -1];
      const cross = (p, q) => p[0] * q[1] - p[1] * q[0];
      const w = cross(a, v) / (cross(a, v) - cross(up, v));
      assert.ok(w >= 0.3 - 1e-9 && w <= 0.7 + 1e-9, `weight ${w}`);
    }
  }
});

test('a curl is an Archimedean spiral of 1.2 to 1.8 turns whose radius falls to zero', () => {
  for (let i = 0; i < 50; i++) {
    const c = spiral(random(`c|${i}`), [10, 20], -Math.PI / 2, 1, 30, 2);
    assert.ok(c.turns >= 1.2 && c.turns <= 1.8, `turns ${c.turns}`);
    assert.deepEqual(c.pts[0], [10, 20], 'it starts at the tip');
    const d = c.pts.map((p) => Math.hypot(p[0] - c.centre[0], p[1] - c.centre[1]));
    for (let k = 1; k < d.length; k++) assert.ok(d[k] <= d[k - 1] + 1e-9, 'the radius never grows');
    assert.ok(d.at(-1) < 1e-6, 'and ends at zero');
    // total winding about the centre
    let wind = 0;
    for (let k = 1; k < c.pts.length - 2; k++) wind += wrap(ang(sub(c.pts[k + 1], c.centre)) - ang(sub(c.pts[k], c.centre)));
    assert.ok(Math.abs(Math.abs(wind) / (2 * Math.PI) - c.turns) < 0.05, `wound ${wind / (2 * Math.PI)} turns`);
  }
});

test('the same stream grows the same stem', () => {
  assert.deepEqual(sprout(random('same'), base), sprout(random('same'), base));
});

test('the card names the source honestly and the growth model as ours', () => {
  const card = readFileSync(join(import.meta.dirname, '../../patterns/text/garden/PATTERN.md'), 'utf8');
  assert.match(card, /Type Garden, no licence: ideas only — plants growing from letterforms, weaving behind and in front; our own growth model/);
  assert.doesNotMatch(card, /2\.5 %/, 'the old text box budget is gone');
  assert.match(card, /`stemScale`/);
});
