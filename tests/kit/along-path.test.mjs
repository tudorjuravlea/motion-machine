// moves/along-path, the pure half: the path laid into the frame, a point carried along it at constant
// speed with a continuous heading, start and end as shares of the path (start after end runs backwards),
// and the trail drawn behind (a line, or a comet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameOf, carry, trailWindow, bump } from '../../patterns/moves/along-path/pattern.js';
import { shares } from '../../runtime/kit/morph.js';
import { bbox } from '../../runtime/kit/pathkit.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);
const S = 'M 0 0 C 100 0 100 100 200 100 S 300 0 400 0';

test('frameOf: the path is laid evenly into the frame, clear of the margin, and centred', () => {
  const f = frameOf(S, 1000, 600, 0.1);
  const b = bbox(f.path);
  assert.ok(b.x >= 60 - 1e-6 && b.y >= 60 - 1e-6 && b.x + b.w <= 940 + 1e-6 && b.y + b.h <= 540 + 1e-6, `a margin of a tenth of the short side: ${JSON.stringify(b)}`);
  near(b.x + b.w / 2, 500, 1e-6); near(b.y + b.h / 2, 300, 1e-6);
  near(b.w / b.h, 400 / 100 * 1, 0.5, 'the proportions are kept');
  assert.ok(f.length > 0);
  assert.equal(frameOf('', 1000, 600, 0.1), null);
  assert.equal(frameOf('M 3 3', 1000, 600, 0.1), null);
});

test('carry: runs from the start to the end of the path at constant speed', () => {
  const f = frameOf('M 0 0 L 100 0 L 100 100', 1000, 1000, 0);
  const a = carry(f, 0), z = carry(f, 1), m = carry(f, 0.5);
  near(a.x, 0, 1e-6); near(a.y, 0, 1e-6);
  near(z.x, 1000, 1e-6); near(z.y, 1000, 1e-6);
  near(m.x, 1000, 1e-6, 'half the length is the corner'); near(m.y, 0, 1e-6);
  near(carry(f, 0.25).x, 500, 1e-6);
});

test('carry: start and end are shares of the path; a start after the end runs backwards, heading and all', () => {
  const f = frameOf('M 0 0 L 100 0', 1000, 1000, 0);
  near(carry(f, 0, { start: 0.2, end: 0.8 }).x, 200, 1e-6);
  near(carry(f, 1, { start: 0.2, end: 0.8 }).x, 800, 1e-6);
  const back = carry(f, 0.5, { start: 1, end: 0 });
  near(back.x, 500, 1e-6);
  near(carry(f, 0, { start: 1, end: 0 }).x, 1000, 1e-6);
  near(Math.abs(back.angle - carry(f, 0.5).angle), Math.PI, 1e-9, 'heading the other way is half a turn');
});

test('carry: the heading follows the tangent, continuous, plus an offset in degrees', () => {
  const f = frameOf('M0 0 A 50 50 0 1 1 100 0 A 50 50 0 1 1 0 0', 1000, 1000, 0);
  let prev = carry(f, 0).angle, worst = 0;
  for (let i = 1; i <= 300; i++) { const a = carry(f, i / 300).angle; worst = Math.max(worst, Math.abs(a - prev)); prev = a; }
  assert.ok(worst < 0.1, `the heading steps by at most ${worst} between samples`);
  near(carry(f, 1).angle - carry(f, 0).angle, 2 * Math.PI, 0.05, 'a loop turns once');
  near(carry(f, 0.3, { offset: 90 }).angle - carry(f, 0.3).angle, Math.PI / 2, 1e-9);
});

test('carry: a window gives a corner a gradual turn', () => {
  const f = frameOf('M 0 0 L 100 0 L 100 100', 1000, 1000, 0);
  const sharp = carry(f, 0.499, { window: 0 }).angle, soft = carry(f, 0.499, { window: 0.2 }).angle;
  assert.ok(soft > sharp + 0.2 && soft < Math.PI / 2 - 0.2, `${soft}`);
});

test('trailWindow: a line grows from the start behind the carried point, a comet slides with it, both with the empty window at 0', () => {
  assert.deepEqual(trailWindow('line', 0, { start: 0, end: 1, comet: 0.2 }), { a: 0, b: 0 });
  const half = trailWindow('line', 0.5, { start: 0, end: 1, comet: 0.2 });
  near(half.a, 0, 1e-12); near(half.b, 0.5, 1e-12);
  const c = trailWindow('comet', 0.5, { start: 0, end: 1, comet: 0.2 });
  near(c.b - c.a, 0.2, 1e-12);
  // a trail over part of the path stays inside it
  const part = trailWindow('line', 1, { start: 0.2, end: 0.7, comet: 0.2 });
  near(part.a, 0.2, 1e-12); near(part.b, 0.7, 1e-12);
  // run backwards the trail grows from the later end
  const rev = trailWindow('line', 0.5, { start: 0.8, end: 0.2, comet: 0.2 });
  near(rev.b, 0.8, 1e-12); near(rev.a, 0.5, 1e-12);
  assert.equal(trailWindow('none', 0.5, { start: 0, end: 1, comet: 0.2 }), null);
});

test('bump: 0 at both ends and 1 in the middle, so a camera that dives to the point is back on the whole frame at rest', () => {
  near(bump(0), 0, 1e-12); near(bump(1), 0, 1e-12); near(bump(0.5), 1, 1e-12);
  assert.ok(bump(0.2) > 0 && bump(0.2) < 1);
});

test('shares reads an anchor as shares of a box', () => {
  assert.deepEqual(shares('50% 50%'), [0.5, 0.5]);
  assert.deepEqual(shares('left bottom'), [0, 1]);
  assert.deepEqual(shares('', [0.2, 0.3]), [0.2, 0.3]);
  assert.deepEqual(shares('25%'), [0.25, 0.25]);
});
