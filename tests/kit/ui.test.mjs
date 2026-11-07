// The authored-UI core: the clock, the script of steps, cursor travel and the press. All pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elapsed, timeline, travelS, cursorAt, pressAt, shownOf, cutAt, leaderRoute, lengthOf } from '../../runtime/kit/ui.js';
import { spreadKinds, cutFiller } from '../../patterns/ui/bento/pattern.js';
import { keyframes } from '../../scripts/check/W-DEAD.mjs';
import { paceWindows } from '../../scripts/check/W-PACE.mjs';

test('elapsed is the seconds since the beat, and the whole beat at a rest or in a deck', () => {
  assert.equal(elapsed(0.4, { u: 1.5, d: 6 }), 1.5);
  assert.equal(elapsed(1, { u: 1.5, d: 6 }), 6, 'a finished element is finished, whatever u says');
  assert.equal(elapsed(0.4, { u: Infinity, d: 6 }), 6);
  assert.equal(elapsed(0.4, { u: 9, d: 6 }), 6);
  assert.equal(elapsed(0, { u: -1, d: 6 }), 0);
});

test('a timeline runs its steps in order, and each reads 0 to 1 over its own span', () => {
  const tl = timeline([['open', 0.4], ['type', 1], ['send', 0.2]]);
  assert.ok(Math.abs(tl.total - 1.6) < 1e-9);
  assert.equal(tl.at('open', 0), 0);
  assert.equal(tl.at('open', 0.2), 0.5);
  assert.equal(tl.at('type', 0.2), 0, 'not started');
  assert.equal(tl.at('type', 0.9), 0.5);
  assert.equal(tl.at('send', 5), 1, 'held once done');
  assert.throws(() => tl.at('nope', 1), /unknown step/);
});

test('a step may overlap the one before it, and may be spaced from it', () => {
  const tl = timeline([['a', 1], ['b', 1, { after: -0.25 }], ['c', 1, { after: 0.5 }]]);
  assert.equal(tl.start('b'), 0.75);
  assert.equal(tl.start('c'), 2.25);
  assert.equal(tl.total, 3.25);
});

test('cursor travel is timed by distance and clamped, in the frame of the type size', () => {
  assert.equal(travelS(0), 0.3);
  assert.ok(Math.abs(travelS(200) - 0.44) < 1e-9);
  assert.equal(travelS(5000), 0.65);
  assert.ok(Math.abs(travelS(400, 2) - 0.44) < 1e-9, 'twice the type size, twice the pixels for the same time');
});

test('the cursor rests at each stop, travels on a bow between them, and is pure', () => {
  const path = [{ x: 0, y: 0, at: 0 }, { x: 100, y: 0, at: 1 }, { x: 100, y: 100, at: 3 }];
  assert.deepEqual(cursorAt(-1, path), { x: 0, y: 0 });
  const startMove = 1 - travelS(100);
  assert.deepEqual(cursorAt(startMove - 0.01, path), { x: 0, y: 0 }, 'still until it has to leave');
  const mid = cursorAt(1 - travelS(100) / 2, path);
  assert.ok(mid.x > 40 && mid.x < 60);
  assert.ok(Math.abs(mid.y) > 1, 'a hand bows, it does not rule a line');
  assert.ok(Math.abs(mid.y) <= 8 + 1e-9, 'the bow is 8% of the distance at most');
  assert.deepEqual(cursorAt(1, path), { x: 100, y: 0 }, 'it is on the stop at the stop\'s time');
  assert.deepEqual(cursorAt(9, path), { x: 100, y: 100 });
  assert.deepEqual(cursorAt(1.7, path), cursorAt(1.7, path));
});

test('a press dips and comes back, and a press that has not come is 1', () => {
  assert.equal(pressAt(0.9, 1), 1);
  assert.ok(Math.abs(pressAt(1.08, 1) - 0.9) < 1e-9);
  assert.ok(Math.abs(pressAt(1.12, 1) - 0.9) < 1e-9, 'it holds a moment');
  assert.equal(pressAt(1.5, 1), 1);
});

test('shownOf reveals n items in turn across a window, each with its own short fade', () => {
  const at = (t, i) => shownOf(t, i, 4, { start: 1, span: 2, fade: 0.2 });
  assert.equal(at(0.5, 0), 0);
  assert.equal(at(3.5, 3), 1);
  assert.ok(at(1.1, 0) > at(1.1, 1));
  assert.equal(at(3, 3), 1, 'the last item is whole when the window ends');
});

test('a story inside one beat is not dead air: its steps count as change', () => {
  const schedule = { duration: 10, events: [{ t: 0, kind: 'arrive' }, { t: 3, kind: 'step' }, { t: 6, kind: 'step' }] };
  assert.deepEqual(keyframes(schedule), [0, 3, 6, 10]);
  assert.equal(paceWindows(schedule)[0].count, 3);
});

test('leaderRoute arrives along the line it left on and stops short of its target', () => {
  const r = leaderRoute({ x: 300, y: 40 }, { x: 100, y: 120 }, 6);
  assert.deepEqual(r[0], { x: 300, y: 40 });
  assert.deepEqual(r.at(-1), { x: 106, y: 120 });
  assert.equal(r.at(-2).y, 120, 'the last leg is level, so it meets the target\'s facing edge square on');
  assert.deepEqual(leaderRoute({ x: 0, y: 50 }, { x: 80, y: 50 }, 5), [{ x: 0, y: 50 }, { x: 75, y: 50 }], 'level ends need no turn');
});

test('cutAt gives the first part of a route, so a dashed line reveals without its dashes stretching', () => {
  const r = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  assert.equal(lengthOf(r), 20);
  assert.deepEqual(cutAt(r, 5), [{ x: 0, y: 0 }, { x: 5, y: 0 }]);
  assert.deepEqual(cutAt(r, 15), [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }]);
  assert.deepEqual(cutAt(r, 99), r);
  assert.deepEqual(cutAt(r, 0), [{ x: 0, y: 0 }]);
});

const kinds = (x) => [...x].map((kind, id) => ({ kind, id }));
const spelled = (a) => a.map((t) => t.kind).join('');

test('spreadKinds keeps a spread order, parts neighbours of a kind, keeps the lead and drops nothing', () => {
  assert.equal(spelled(spreadKinds(kinds('abcab'))), 'abcab');
  assert.equal(spelled(spreadKinds(kinds('abbc'))), 'abcb');
  assert.equal(spelled(spreadKinds(kinds('abcc'))), 'acbc');
  assert.equal(spelled(spreadKinds(kinds('acc'))), 'acc', 'no order parts them, so it stays');
  assert.equal(spreadKinds(kinds('abbbcc')).length, 6);
});

test('cutFiller cuts only filler, only a third or more of the grid, and only where room is short', () => {
  const tiles = (...k) => k.map((kind) => ({ kind }));
  assert.equal(cutFiller(tiles('figure', 'filler', 'bars', 'filler', 'chip', 'list'), '9x16').length, 4);
  assert.equal(cutFiller(tiles('figure', 'filler', 'bars', 'chip'), '9x16').length, 4, 'one of four is under a third');
  assert.equal(cutFiller(tiles('figure', 'filler', 'bars', 'filler'), '16x9').length, 4);
});
