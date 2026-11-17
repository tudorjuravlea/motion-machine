// The opt-in tech looks: transitions/glitch (one scene a frame, a slip that grows to the middle and is gone
// by the end, at most two single-frame stutters) and entrances/ascii (a glyph per cell by its light, that
// flickers on a stepped clock and then settles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameAt } from '../../patterns/transitions/glitch/pattern.js';
import { glyphAt, RAMP } from '../../patterns/entrances/ascii/pattern.js';

const o = { d: 0.52, width: 1080, seed: 12345 };

test('the glitch slip grows to the middle of the cut and is gone by 90 % of it; the same instant draws the same', () => {
  assert.equal(frameAt(0, {}, o).slip, 0);
  assert.ok(frameAt(0.45, {}, o).slip > frameAt(0.1, {}, o).slip);
  assert.ok(frameAt(0.92, {}, o).slip < 1e-9);
  assert.ok(frameAt(0.45, { strength: 1 }, o).slip <= 0.06 * 1080);
  assert.deepEqual(frameAt(0.33, {}, o), frameAt(0.33, {}, o));
});

test('the glitch shows the outgoing scene, then the incoming, with at most two single-frame stutters', () => {
  const frames = Array.from({ length: Math.round(o.d * 120) }, (_, i) => frameAt(i / (o.d * 120), {}, o).shows);
  const swaps = frames.slice(1).filter((s, i) => s !== frames[i]).length;
  assert.equal(frames[0], 'from'); assert.equal(frames.at(-1), 'to');
  assert.ok(swaps >= 1 && swaps <= 5, `${swaps} swaps`);
  const calm = Array.from({ length: 60 }, (_, i) => frameAt(i / 60, { stutter: 'false' }, o).shows);
  assert.equal(calm.slice(1).filter((s, i) => s !== calm[i]).length, 1);
});

test('an ascii cell settles on the glyph of its light, darkest to lightest, after flickering', () => {
  assert.equal(glyphAt(0, 0.9, 0.1, 3, 7), RAMP[0]);
  assert.equal(glyphAt(1, 0.9, 0.1, 3, 7), RAMP.at(-1));
  assert.equal(glyphAt(0.5, 0.9, 0.1, 3, 7), RAMP[Math.round(0.5 * (RAMP.length - 1))]);
  assert.equal(glyphAt(0.5, 0.12, 0.1, 3, 7), glyphAt(0.5, 0.12, 0.1, 3, 7));
  assert.ok(RAMP.includes(glyphAt(0.5, 0.12, 0.1, 3, 7)));
});
