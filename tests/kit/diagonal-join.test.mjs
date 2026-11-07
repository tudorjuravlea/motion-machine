// entrances/diagonal-join, the maths: the type is cut into two halves along a line at an angle
// through its middle; the halves start apart, each slid along the cut in opposite directions, and
// close to exactly nothing at p = 1. The slide is bounded so the type's ink never leaves the safe
// area, and nothing is ever rotated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import JOIN, { halvesOf, slideAt, roomAlong, sideOf } from '../../patterns/entrances/diagonal-join/pattern.js';

test('the two halves are complementary half-planes through the middle of the box', () => {
  const { a, b } = halvesOf(400, 120, 30);
  assert.equal(a.length, 4); assert.equal(b.length, 4);
  // both share the cut: the same two points, the line through the centre
  assert.deepEqual(a.slice(0, 2), b.slice(0, 2));
  const [[x0, y0], [x1, y1]] = a;
  const cross = (x, y) => (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0);
  assert.ok(Math.abs(cross(200, 60)) < 1e-6, 'the cut passes through the centre');
  assert.ok(Math.abs((Math.atan2(y0 - y1, x1 - x0) * 180) / Math.PI - 30) < 1e-9, 'the cut rises at the angle');
  // the far corners of each polygon lie on opposite sides of the cut
  assert.ok(Math.sign(cross(...a[2])) === -Math.sign(cross(...b[2])) && cross(...a[2]) !== 0);
});

test('the halves slide along the cut, apart at p = 0, joined exactly at p = 1', () => {
  const start = slideAt(0, 80, 30);
  assert.ok(Math.abs(Math.hypot(start.x, start.y) - 80) < 1e-9);
  assert.ok(Math.abs(start.y / start.x + Math.tan(Math.PI / 6)) < 1e-9, 'along the cut');
  assert.deepEqual(slideAt(1, 80, 30), { x: 0, y: 0 });
  let last = Infinity;
  for (let i = 0; i <= 100; i++) { const s = slideAt(i / 100, 80, 30), m = Math.hypot(s.x, s.y); assert.ok(m <= last + 1e-12); last = m; }
});

test('the slide never carries the ink out of the safe area, in either direction', () => {
  const area = { x0: 72, y0: 72, x1: 1008, y1: 1848 };
  for (const ink of [{ x0: 100, y0: 800, x1: 980, y1: 1000 }, { x0: 72, y0: 72, x1: 400, y1: 200 }, { x0: 500, y0: 900, x1: 600, y1: 950 }]) {
    for (const angle of [0, 30, 60, 90]) for (const sign of [0, 1, -1]) {
      const t = roomAlong(ink, area, angle, sign);
      assert.ok(t >= 0);
      const c = Math.cos((angle * Math.PI) / 180), s = -Math.sin((angle * Math.PI) / 180);
      for (const k of sign ? [sign] : [1, -1]) {
        const dx = k * t * c, dy = k * t * s;
        assert.ok(ink.x0 + dx >= area.x0 - 1e-6 && ink.x1 + dx <= area.x1 + 1e-6 && ink.y0 + dy >= area.y0 - 1e-6 && ink.y1 + dy <= area.y1 + 1e-6, `angle ${angle} sign ${sign} t ${t}`);
      }
    }
  }
  assert.equal(roomAlong(null, null, 30), Infinity, 'no layout to read: no bound');
});

test('each half is bounded by the ink on its own side of the cut, so a title flush on the left still slides', () => {
  // a wide title flush with the safe margin on the left: the whole ink has no room to the left,
  // but the half above the cut moves up and right, the half below moves down and left from well inside
  const area = { x0: 72, y0: 72, x1: 1008, y1: 1848 };
  const ink = { x0: 72, y0: 800, x1: 900, y1: 1000 }, cx = 486, cy = 900;
  const up = sideOf(ink, cx, cy, 30, -1), down = sideOf(ink, cx, cy, 30, 1);
  assert.equal(up.x0, 72, 'the upper half holds the left edge');
  assert.ok(down.x0 > 200, `the lower half starts well inside: ${down.x0}`);
  assert.ok(down.x1 === 900 && up.y0 === 800 && down.y1 === 1000);
  assert.equal(roomAlong(ink, area, 30, 0), 0, 'the whole ink has no room both ways');
  assert.ok(roomAlong(up, area, 30, 1) > 100 && roomAlong(down, area, 30, -1) > 100);
  assert.deepEqual(sideOf(ink, cx, 2000, 30, 1), null, 'a cut below the ink leaves nothing on its lower side');
});

test('the module is an entrance with angle and gap params', () => {
  assert.equal(JOIN.group, 'entrances');
  assert.equal(JOIN.name, 'diagonal-join');
  assert.deepEqual(Object.keys(JOIN.params).sort(), ['angle', 'gap']);
});
