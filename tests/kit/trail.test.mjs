// Ribbon, flag and cable motion faked from delayed copies of a main motion (runtime/kit/trail.js), and
// entrances/streamer, which uses it: pure in t, collapsed when the motion has been still for its lag,
// tapered, and fluttering only while the caller lets it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trailOf, trailLength, normalAt, polygonPath } from '../../runtime/kit/trail.js';

const path = (s) => [Math.max(0, Math.min(1, s)) * 300, 0];   // moves right for 1 s, then holds

test('point i is where the anchor was i·lag ago, so the trail lies behind the motion', () => {
  const { points } = trailOf(path, 0.5, { n: 10, lag: 0.02 });
  assert.deepEqual(points[0], [150, 0]);
  assert.ok(Math.abs(points[10][0] - 90) < 1e-9);
  assert.ok(trailLength(points) > 59);
});

test('once the motion has held still for the whole lag the trail has caught up: length 0', () => {
  assert.equal(trailLength(trailOf(path, 1.3, { n: 10, lag: 0.02 }).points), 0);
});

test('the same instant draws the same trail; a flutter moves it across, and with no wave it is straight', () => {
  const a = trailOf(path, 0.4, { n: 12, lag: 0.03, wave: 20 });
  assert.deepEqual(a, trailOf(path, 0.4, { n: 12, lag: 0.03, wave: 20 }));
  assert.ok(a.points.some(([, y]) => Math.abs(y) > 1));
  assert.ok(trailOf(path, 0.4, { n: 12, lag: 0.03 }).points.every(([, y]) => y === 0));
});

test('the outline tapers from the anchor\'s width to the free end\'s, and draws as a closed path', () => {
  const { outline } = trailOf(path, 0.5, { n: 4, lag: 0.05, width: [10, 2] });
  assert.equal(outline.length, 10);
  assert.ok(Math.abs(Math.abs(outline[0][1] - outline[9][1]) - 10) < 1e-9);
  assert.ok(Math.abs(Math.abs(outline[4][1] - outline[5][1]) - 2) < 1e-9);
  assert.match(polygonPath(outline), /^M[\d.-]+ [\d.-]+(L[\d.-]+ [\d.-]+)+Z$/);
  assert.deepEqual(normalAt([[0, 0], [0, 0]], 0), [0, -1]);
});
