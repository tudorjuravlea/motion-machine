// drawn: the timeline of a device that is first drawn in thin lines and then becomes the real
// thing. Each phase is a pure 0..1 of the seconds since the beat arrived, in a fixed order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAWN, phases, stroke } from '../../runtime/kit/drawn.js';

test('every phase runs 0 to 1, draw, gather, reveal and rise in that order', () => {
  const a = phases(0), z = phases(30);
  for (const k of ['draw', 'gather', 'reveal', 'rise']) { assert.equal(a[k], 0, k); assert.equal(z[k], 1, k); }
  const end = (k) => DRAWN[k][0] + DRAWN[k][1];
  assert.ok(end('draw') <= DRAWN.gather[0]);
  assert.ok(end('gather') <= DRAWN.reveal[0]);
  assert.ok(DRAWN.rise[0] >= DRAWN.reveal[0] + DRAWN.reveal[1] * 0.85, 'the device stands up only once it is nearly all revealed');
  let last = phases(0);
  for (let u = 0; u <= 9; u += 0.05) {
    const p = phases(u);
    for (const k of Object.keys(p)) assert.ok(p[k] >= last[k] - 1e-12, `${k} goes back at ${u}`);
    last = p;
  }
});

test('a deck rests on the finished device', () => {
  const p = phases(0, { deck: true, rest: true });
  for (const k of ['draw', 'gather', 'reveal', 'rise']) assert.equal(p[k], 1);
});

test('stroke: a line is drawn on from its start, eased, and is whole after its time', () => {
  assert.equal(stroke(0.5, 1, 0.4), 0);
  assert.equal(stroke(2, 1, 0.4), 1);
  const mid = stroke(1.2, 1, 0.4);
  assert.ok(mid > 0.5 && mid < 1, 'eased out: more than half drawn at half its time');
});
