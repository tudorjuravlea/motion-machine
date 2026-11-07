// text/lower-third, text/annotate and emphasis/keyword-cta: the parts that are pure functions of
// their arguments, tested without a browser. The lower third's whole motion is `pose(mechanism, s)`:
// every mechanism ends at rest values exactly, and each part moves only inside its own phase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MECHANISMS, pose } from '../../patterns/text/lower-third/pattern.js';
import { KINDS, bracePath, dashSegments, parsePoint, placeLabel } from '../../patterns/text/annotate/pattern.js';
import { bob } from '../../patterns/emphasis/keyword-cta/pattern.js';

const REST = { mark: 1, plate: 1, slide: 0, text: 1, role: 1, typed: 1, arm: 1, flip: 0, hair: 1, scale: 1, fade: 1, lift: 0 };

test('the lower third has the eight mechanisms the brief names', () => {
  assert.deepEqual([...MECHANISMS].sort(), ['bar-wipe', 'bracket', 'flip', 'pill', 'stamp', 'strip', 'tab', 'typed']);
});

test('every mechanism is at rest values at s = 1, in and out', () => {
  for (const m of MECHANISMS) for (const leaving of [false, true]) assert.deepEqual(pose(m, 1, leaving), REST, m);
});

test('every mechanism starts from nothing shown (s = 0)', () => {
  for (const m of MECHANISMS) {
    const a = pose(m, 0);
    const shown = m === 'flip' ? 1 - a.flip : m === 'stamp' ? a.fade : m === 'bracket' ? a.arm : m === 'typed' ? a.plate : m === 'bar-wipe' || m === 'tab' ? a.mark : a.plate;
    assert.equal(shown, 0, `${m} shows nothing at s = 0`);
  }
});

test('amounts stay between 0 and 1 and rise with s (the bounce of the stamp excepted)', () => {
  for (const m of MECHANISMS.filter((x) => x !== 'stamp')) {
    let prev = null;
    for (let i = 0; i <= 40; i++) {
      const a = pose(m, i / 40);
      for (const k of ['mark', 'plate', 'text', 'role', 'typed', 'arm', 'hair']) assert.ok(a[k] >= 0 && a[k] <= 1, `${m}.${k} at ${i / 40}`);
      if (prev) for (const k of ['mark', 'plate', 'text', 'role', 'typed', 'arm', 'hair']) assert.ok(a[k] >= prev[k] - 1e-9, `${m}.${k} never falls while s rises (${i / 40})`);
      prev = a;
    }
  }
});

test('the stamp lands from large with a small overshoot and settles; it leaves by lifting and fading, not bouncing', () => {
  assert.ok(pose('stamp', 0.01).scale > 1.2, 'starts large');
  const lows = [];
  for (let i = 0; i <= 100; i++) lows.push(pose('stamp', i / 100).scale);
  assert.ok(Math.min(...lows) >= 0.95 && Math.min(...lows) < 1, `a small overshoot under 1: ${Math.min(...lows)}`);
  assert.equal(pose('stamp', 1).scale, 1);
  const out = pose('stamp', 0.5, true);
  assert.ok(out.scale > 1 && out.fade === 0.5, 'leaving: larger and fading');
});

test('the typed name types in the middle of the entrance and the role comes after it', () => {
  assert.equal(pose('typed', 0.3).role, 0);
  assert.ok(pose('typed', 0.3).typed > 0 && pose('typed', 0.3).typed < 1);
  assert.equal(pose('typed', 0.7).typed, 1);
  assert.ok(pose('typed', 0.7).role > 0);
});

test('annotate: a point is "x%,y%" of the area, and nothing else is', () => {
  assert.deepEqual(parsePoint('25%,50%', 400, 200), { x: 100, y: 100 });
  assert.deepEqual(parsePoint(' 10.5% , 90% ', 200, 100), { x: 21, y: 90 });
  assert.equal(parsePoint('headline', 400, 200), null);
  assert.equal(parsePoint('', 400, 200), null);
});

test('annotate: a label sits on the side with room and stays inside the area', () => {
  const base = { w: 100, h: 40, gap: 10, W: 400, H: 300 };
  assert.equal(placeLabel({ ...base, px: 200, py: 200 }).side, 'above');
  assert.equal(placeLabel({ ...base, px: 200, py: 30 }).side, 'below');
  assert.equal(placeLabel({ ...base, px: 200, py: 100, horizontal: true }).side, 'right');
  assert.equal(placeLabel({ ...base, px: 380, py: 100, horizontal: true }).side, 'left');
  const edge = placeLabel({ ...base, px: 2, py: 150, place: 'above' });
  assert.ok(edge.x >= 0 && edge.y >= 0 && edge.x + 100 <= 400 && edge.y + 40 <= 300);
});

test('annotate: a brace is two halves that meet at one cusp, a leader draws dash by dash and ends whole', () => {
  const b = bracePath(300, 20);
  assert.match(b.a, /^M0 0/);
  assert.match(b.b, /^M300 0/);
  assert.ok(b.a.endsWith('150 -40') && b.b.endsWith('150 -40'), 'both end at the cusp, 2d out');
  assert.deepEqual(dashSegments(0, 0, 100, 0, 10, 5, 0), []);
  const half = dashSegments(0, 0, 100, 0, 10, 5, 0.5), full = dashSegments(0, 0, 100, 0, 10, 5, 1);
  assert.ok(half.length > 0 && half.length < full.length);
  assert.ok(Math.max(...half.map((s) => s[2])) <= 50 + 1e-6, 'never past the drawn share');
  assert.ok(Math.max(...full.map((s) => s[2])) <= 100 + 1e-6);
});

test('annotate: the seven kinds the brief names', () => {
  assert.deepEqual([...KINDS].sort(), ['brace', 'chip', 'crosshair', 'leader', 'measure', 'pulse', 'tooltip']);
});

test('keyword-cta: an arrow bobs a finite number of times and is still outside the window', () => {
  const d = 1.2, bobs = 3;
  assert.equal(bob(0.05, d, 0, bobs), 0, 'not yet');
  assert.equal(bob(d - 0.1, d, 0, bobs), 0, 'gone before the end of the window');
  let peaks = 0, prev = 0, rising = false;
  for (let u = 0; u < d; u += 0.005) {
    const v = bob(u, d, 0, bobs);
    if (v > prev) rising = true;
    else if (v < prev && rising) { peaks++; rising = false; }
    prev = v;
  }
  assert.equal(peaks, bobs, 'one peak per bob');
});
