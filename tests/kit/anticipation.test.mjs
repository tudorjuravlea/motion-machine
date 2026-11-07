// transitions/anticipation: a wind-up, then the push through. `frameAt` is the pure part: where each scene
// is at linear progress q through the cut. In `zoom` the scenes never share a frame (the outgoing one
// shrinks a little, then dives and dissolves; the incoming one grows to rest); in `slide` they are
// adjacent and never overlap: the outgoing one pulls back against the way it will go, then both travel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import anticipation, { frameAt } from '../../patterns/transitions/anticipation/pattern.js';

const ease = (name, p) => (name === 'enter' ? 1 - (1 - p) ** 3 : name === 'exit' ? p * p * p : p * p * (3 - 2 * p));
const prm = (o = {}) => ({ mode: 'zoom', direction: 'left', pull: 0.06, depth: 0.6, windup: 0.25, ...o });
const at = (q, o) => frameAt(q, prm(o), ease);

test('zoom: it starts as the outgoing scene at rest and ends as the incoming scene at rest', () => {
  const a = at(0), z = at(1);
  assert.deepEqual([a.from.scale, a.from.opacity, a.shows], [1, 1, 'from']);
  assert.deepEqual([z.to.scale, z.to.opacity, z.shows], [1, 1, 'to']);
});

test('zoom: the outgoing scene first pulls back below its size, then dives past it; the pull is the wind-up', () => {
  const w = at(0.25).from.scale;
  assert.ok(Math.abs(w - 0.94) < 1e-9, `the pull-back is 6 %: ${w}`);
  assert.ok(at(0.1).from.scale < 1 && at(0.1).from.scale > w, 'on its way back');
  let prev = w;
  for (let q = 0.26; q < 0.62; q += 0.03) { const s = at(q).from.scale; assert.ok(s >= prev - 1e-9, `the push only grows: ${q}`); prev = s; }
  assert.ok(at(0.62).from.scale > 1.3, 'dives past its own size');
});

test('zoom: only one scene is drawn in any frame, and the fading one drops its canvas fill', () => {
  for (let q = 0; q < 1; q += 0.01) {
    const f = at(q);
    const drawn = [f.from, f.to].filter((s) => s && !s.hidden);
    assert.equal(drawn.length, 1, `q ${q}`);
    assert.equal(f.shows, drawn[0] === f.from ? 'from' : 'to');
  }
  assert.equal(at(0.5).from.clearFill, true);
  assert.equal(at(0.1).from.clearFill, false);
});

test('zoom: a bigger pull winds up further; depth sets the dive', () => {
  assert.ok(at(0.25, { pull: 0.12 }).from.scale < at(0.25, { pull: 0.04 }).from.scale);
  assert.ok(at(0.6, { depth: 1 }).from.scale > at(0.6, { depth: 0.3 }).from.scale);
  assert.equal(at(0.25, { pull: 0 }).from.scale, 1);
});

test('slide: the outgoing scene pulls back against its way, then both travel; they stay edge to edge', () => {
  for (const [dir, vx, vy] of [['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]]) {
    const wind = frameAt(0.25, prm({ mode: 'slide', direction: dir }), ease);
    assert.ok(wind.from.x * vx + wind.from.y * vy < 0, `${dir}: pulled back against its way (${wind.from.x}, ${wind.from.y})`);
    assert.ok(Math.abs(Math.hypot(wind.from.x, wind.from.y) - 6) < 1e-6, `${dir}: 6 % of the frame`);
    const mid = frameAt(0.6, prm({ mode: 'slide', direction: dir }), ease);
    assert.ok(mid.from.x * vx + mid.from.y * vy > 0, `${dir}: travelling`);
    for (let q = 0.25; q <= 1; q += 0.05) {
      const f = frameAt(q, prm({ mode: 'slide', direction: dir }), ease);
      assert.ok(Math.abs(f.from.x - f.to.x - vx * 100) < 1e-6 && Math.abs(f.from.y - f.to.y - vy * 100) < 1e-6, `${dir} q ${q}: edge to edge`);
    }
    const end = frameAt(1, prm({ mode: 'slide', direction: dir }), ease);
    assert.ok(Math.abs(end.to.x) < 1e-9 && Math.abs(end.to.y) < 1e-9, `${dir}: the incoming scene rests at 0`);
    const start = frameAt(0, prm({ mode: 'slide', direction: dir }), ease);
    assert.ok(Math.abs(start.from.x) < 1e-9 && Math.abs(start.from.y) < 1e-9, `${dir}: the outgoing scene starts at 0`);
  }
});

test('the wind-up is a share of the cut, 0.1 to 0.5, and the module names its params', () => {
  assert.ok(Math.abs(at(0.5, { windup: 0.5 }).from.scale - 0.94) < 1e-9, 'the pull-back ends at the end of the wind-up');
  assert.ok(Math.abs(at(0.1, { windup: 0.01 }).from.scale - at(0.1, { windup: 0.1 }).from.scale) < 1e-9, 'clamped to 0.1');
  assert.equal(anticipation.name, 'anticipation');
  assert.equal(anticipation.group, 'transitions');
  for (const k of ['mode', 'direction', 'pull', 'depth', 'windup']) assert.ok(anticipation.params[k], k);
});
