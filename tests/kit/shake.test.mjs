// moves/shake: an impact shake on the scene's camera that decays to stillness. Pure in the scene's
// seconds: the same instant gives the same offset in every load and in any seek order; the offset is
// exactly zero from the scene's rest on, so the gate reads a still frame; a deck never shakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const FILE = join(import.meta.dirname, '..', '..', 'patterns', 'moves', 'shake', 'pattern.js');
const load = async (tag) => (await import(`${pathToFileURL(FILE).href}?load=${tag}`)).default;
const shake = await load('a');

const cam = () => ({ style: {} });
const ctxAt = (u, { params, ...rest } = {}) => ({
  u, d: 6, settle: 4, deck: false, scene: 's', style: { motion: { travel: 1 } }, ...rest,
  params: { hits: '1', amp: 20, decay: 0.5, seed: 3, ...params },
});
// the offset written, in px, as [x, y]; [0, 0] when nothing is written
const offset = (el) => {
  const v = el.style.translate;
  if (!v || v === 'none') return [0, 0];
  const [x, y = '0px'] = v.split(/\s+/);
  return [parseFloat(x), parseFloat(y)];
};
const at = (m, u, extra) => { const el = cam(); m.at(el, 0, ctxAt(u, extra)); return el; };

test('moves/shake: a move module with the card params', () => {
  assert.equal(shake.group, 'moves');
  assert.equal(shake.name, 'shake');
  for (const k of ['hits', 'amp', 'decay', 'seed']) assert.ok(shake.params[k], `param ${k}`);
});

test('moves/shake: still before the hit, moving during it, never past the amplitude on either axis', () => {
  assert.deepEqual(offset(at(shake, 0.5)), [0, 0], 'before the hit nothing is written');
  let peak = 0, moved = 0;
  for (let u = 1; u < 1.5; u += 1 / 120) {
    const [x, y] = offset(at(shake, u));
    assert.ok(Math.abs(x) <= 20 + 1e-6 && Math.abs(y) <= 20 + 1e-6, `|offset| ≤ amp at ${u}: ${x}, ${y}`);
    peak = Math.max(peak, Math.abs(x), Math.abs(y));
    if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) moved++;
  }
  assert.ok(peak > 8, `the shake is felt: peak ${peak}`);
  assert.ok(moved > 10, 'it moves over many frames');
});

test('moves/shake: the amplitude decays to stillness by the end of the decay', () => {
  const mag = (u) => Math.hypot(...offset(at(shake, u)));
  const early = Math.max(...Array.from({ length: 12 }, (_, i) => mag(1 + i / 120)));
  const late = Math.max(...Array.from({ length: 12 }, (_, i) => mag(1.38 + i / 120)));
  assert.ok(late < early / 4, `late ${late} is a quarter of early ${early} or less`);
  for (const u of [1.5, 1.6, 2, 3]) assert.deepEqual(offset(at(shake, u)), [0, 0], `still at ${u}`);
});

test('moves/shake: under 0.5 px at the rest and after it, even when a hit rings into the rest', () => {
  // the hit at 3.8 s would ring to 4.3 s, but the scene rests at 4 s: the ring is shortened to end there
  for (const u of [4, 4.01, 4.2, 5, 6]) {
    const [x, y] = offset(at(shake, u, { params: { hits: '3.8' } }));
    assert.ok(Math.hypot(x, y) < 0.5, `still at ${u}: ${x}, ${y}`);
    assert.deepEqual([x, y], [0, 0]);
  }
  const ringing = Math.max(...Array.from({ length: 10 }, (_, i) => Math.hypot(...offset(at(shake, 3.8 + i / 60, { params: { hits: '3.8' } })))));
  assert.ok(ringing > 1, `it still shakes before the rest: ${ringing}`);
  // a hit at or after the rest is dropped
  for (const u of [4.1, 4.3]) assert.deepEqual(offset(at(shake, u, { params: { hits: '4.05' } })), [0, 0]);
});

test('moves/shake: the same instant gives the same offset in a fresh load and in any seek order', async () => {
  const again = await load('b');
  const times = Array.from({ length: 40 }, (_, i) => 1 + i * 0.0123);
  const fwd = times.map((u) => at(shake, u).style.translate ?? '');
  const rev = [...times].reverse().map((u) => at(again, u).style.translate ?? '').reverse();
  assert.deepEqual(rev, fwd);
});

test('moves/shake: a deck never shakes', () => {
  for (const u of [0, 1, 1.1, 1.2, Infinity]) {
    const el = cam();
    shake.at(el, 0.5, { ...ctxAt(u), deck: true, presses: 2 });
    assert.deepEqual(el.style, {}, `nothing written in a deck at ${u}`);
  }
});

test('moves/shake: the seed changes the path, not its bounds; the style travel scales it', () => {
  const a = offset(at(shake, 1.05)), b = offset(at(shake, 1.05, { params: { seed: 9 } }));
  assert.notDeepEqual(a, b);
  const calm = offset(at(shake, 1.05, { style: { motion: { travel: 0.5 } } }));
  assert.ok(Math.abs(calm[0] - a[0] / 2) < 1e-3 && Math.abs(calm[1] - a[1] / 2) < 1e-3, `half travel, half the offset: ${calm} vs ${a}`);
});

test('moves/shake: several hits, each with its own ring; bad values fall back to the defaults', () => {
  const two = (u) => Math.hypot(...offset(at(shake, u, { params: { hits: '1, 2.5' } })));
  assert.ok(two(1.05) > 1 && two(2.55) > 1 && two(2) === 0, 'two rings and stillness between');
  assert.doesNotThrow(() => at(shake, 1.05, { params: { hits: 'x', amp: 'loud', decay: -1 } }));
  const [x, y] = offset(at(shake, 1.05, { params: { amp: 400 } }));
  assert.ok(Math.abs(x) <= 40 && Math.abs(y) <= 40, 'the amplitude is capped at 40 px');
});
