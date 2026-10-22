// emphasis/emote's pure parts: the drawn marks (each inside its own box, strokes and fills as
// polylines, never text), where a mark sits beside the words (never on them, inside the safe area),
// and its pop and fade through the window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import emote, { MARKS, markOf, placeMark, popScale, fadeOf } from '../../patterns/emphasis/emote/pattern.js';
import { random } from '../../runtime/kit/random.js';

test('eight marks, each a set of polylines inside its own box of height 1', () => {
  assert.deepEqual([...MARKS].sort(), ['dots', 'drops', 'exclaim', 'heart', 'note', 'question', 'sparkle', 'zzz']);
  for (const name of MARKS) {
    const m = markOf(name);
    assert.ok(m.w > 0 && m.w <= 1.2, `${name}: width ${m.w}`);
    assert.ok(m.parts.length >= 1, name);
    for (const part of m.parts) {
      assert.ok(part.points.length >= 2, name);
      assert.ok(['stroke', 'ink', 'wash'].includes(part.paint), `${name}: ${part.paint}`);
      if (part.paint !== 'stroke') assert.equal(part.closed, true, `${name}: a filled part is closed`);
      for (const [x, y] of part.points) assert.ok(x >= -1e-9 && x <= m.w + 1e-9 && y >= -1e-9 && y <= 1 + 1e-9, `${name}: ${x}, ${y} outside its box`);
    }
  }
  assert.equal(markOf('nothing'), markOf('exclaim'), 'an unknown mark is the exclamation');
});

test('a mark sits beside the words, never on them, and inside the safe area; it changes side when it must, and is left out when no side has room', () => {
  const next = random(5);
  let none = 0, all = 0;
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (let k = 0; k < 400; k++) {
    const safe = { x0: 60, y0: 60, x1: 1020, y1: 1860 };
    const text = { x: 60 + next() * 700, y: 200 + next() * 1400, w: 40 + next() * 900, h: 40 + next() * 200 };
    text.w = Math.min(text.w, safe.x1 - text.x);
    const h = 40 + next() * 120, w = h * (0.3 + next() * 0.8);
    for (const side of ['right', 'left', 'top']) {
      const at = placeMark(text, safe, { side, w, h });
      all++;
      if (!at) { none++; continue; }
      const box = { x: at.x, y: at.y, w, h };
      assert.ok(!overlap(box, text), `${side}: mark ${JSON.stringify(box)} on the words ${JSON.stringify(text)}`);
      assert.ok(box.x >= safe.x0 - 1e-6 && box.x + w <= safe.x1 + 1e-6 && box.y >= safe.y0 - 1e-6 && box.y + h <= safe.y1 + 1e-6, `${side}: outside the safe area ${JSON.stringify(box)}`);
    }
  }
  assert.ok(none / all < 0.05, `left out ${none} of ${all}`);
  assert.equal(placeMark({ x: 60, y: 60, w: 960, h: 1800 }, { x0: 60, y0: 60, x1: 1020, y1: 1860 }, { side: 'right', w: 60, h: 60 }), null);
  const t = { x: 100, y: 500, w: 300, h: 80 }, s = { x0: 60, y0: 60, x1: 1020, y1: 1860 };
  assert.equal(placeMark(t, s, { side: 'right', w: 60, h: 60 }).side, 'right');
  assert.ok(placeMark(t, s, { side: 'right', w: 60, h: 60 }).x >= t.x + t.w);
  assert.equal(placeMark({ x: 600, y: 500, w: 420, h: 80 }, s, { side: 'right', w: 60, h: 60 }).side, 'left', 'no room on the right: the left');
});

test('a mark keeps clear of every other text in the scene: it slides along its side or changes side, and is left out when every place is taken', () => {
  const next = random(11);
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const safe = { x0: 60, y0: 60, x1: 1020, y1: 1860 };
  let placed = 0;
  for (let k = 0; k < 400; k++) {
    const text = { x: 100 + next() * 500, y: 300 + next() * 1200, w: 80 + next() * 400, h: 40 + next() * 160 };
    // other lines in the scene: above, below and beside the words
    const obstacles = Array.from({ length: 1 + Math.floor(next() * 4) }, () => ({ x: 60 + next() * 700, y: text.y - 300 + next() * 600, w: 60 + next() * 500, h: 30 + next() * 90 }))
      .filter((o) => !overlap(o, text));
    const h = 50 + next() * 80, w = h * (0.3 + next() * 0.7);
    for (const side of ['right', 'left', 'top']) {
      const at = placeMark(text, safe, { side, w, h, obstacles });
      if (!at) continue;
      placed++;
      const box = { x: at.x, y: at.y, w, h };
      assert.ok(!overlap(box, text), `${side}: on its own words`);
      for (const o of obstacles) assert.ok(!overlap(box, o), `${side}: mark ${JSON.stringify(box)} on other words ${JSON.stringify(o)}`);
      assert.ok(box.x >= safe.x0 - 1e-6 && box.x + w <= safe.x1 + 1e-6 && box.y >= safe.y0 - 1e-6 && box.y + h <= safe.y1 + 1e-6, `${side}: outside the safe area`);
    }
  }
  assert.ok(placed > 600, `placed ${placed} of 1200`);
  // the line above blocks the spot over the words' end: the mark slides down its side, it stays right
  const text = { x: 100, y: 500, w: 300, h: 200 }, line = { x: 100, y: 420, w: 600, h: 70 };
  const at = placeMark(text, safe, { side: 'right', w: 60, h: 60, obstacles: [line] });
  assert.equal(at.side, 'right');
  assert.ok(!overlap({ x: at.x, y: at.y, w: 60, h: 60 }, line));
  // a long wrapped headline: no room right of its widest line, but beside its short first line there is
  const own = [{ x: 100, y: 300, w: 400, h: 90 }, { x: 100, y: 390, w: 860, h: 90 }];
  const box = { x: 100, y: 300, w: 860, h: 180 };
  const by = placeMark(box, safe, { side: 'right', w: 120, h: 110, obstacles: [{ x: 100, y: 150, w: 700, h: 60 }], lines: own });
  assert.equal(by.side, 'right');
  assert.ok(by.x >= 500 && !own.some((L) => overlap({ x: by.x, y: by.y, w: 120, h: 110 }, L)), JSON.stringify(by));
  // every side taken
  const walls = [{ x: 60, y: 60, w: 960, h: 430 }, { x: 60, y: 710, w: 960, h: 1150 }, { x: 60, y: 490, w: 30, h: 220 }, { x: 410, y: 490, w: 610, h: 220 }];
  assert.equal(placeMark(text, safe, { side: 'right', w: 60, h: 60, obstacles: walls }), null);
});

test('the pop: from nothing, a small overshoot, then exactly 1 through the hold; the fade at the end', () => {
  assert.equal(popScale(0), 0);
  const peak = Math.max(...Array.from({ length: 200 }, (_, i) => popScale(i / 200)));
  assert.ok(peak > 1.05 && peak <= 1.12, `peak ${peak}`);
  for (const q of [0.22, 0.3, 0.5, 0.74, 0.9]) assert.equal(popScale(q), 1, `q ${q}`);
  assert.equal(fadeOf(0.5), 1);
  assert.equal(fadeOf(0.75), 1);
  assert.ok(fadeOf(0.9) > 0 && fadeOf(0.9) < 1);
  assert.equal(fadeOf(1), 0);
});

test('by default the mark is three quarters of the unit tall and drawn in the accent', () => {
  assert.equal(emote.params.size.default, 0.75);
  assert.equal(emote.params.color.default, 'accent');
});
