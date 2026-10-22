// entrances/photo-wake, the maths: the picture starts as a two-colour print of the brand's ink and
// canvas (every pixel on the segment between the two roles, dark tones to the darker role), and its
// real colours arrive behind an accent front that travels an equalised arrival field, so the revealed
// share grows evenly. Nothing is revealed and no front shows at q = 0; everything is revealed at q = 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WAKE, { duotone, tones, frontAt, equalise, field } from '../../patterns/entrances/photo-wake/pattern.js';
import { random } from '../../runtime/kit/random.js';

const PAPER = { ink: [0x1e, 0x1b, 0x16], canvas: [0xf4, 0xef, 0xe6] };
const NOCTURNE = { ink: [0xf3, 0xec, 0xe2], canvas: [0x0e, 0x0c, 0x12] };

test('the dark tone is the darker of ink and canvas, whichever the brand\'s polarity', () => {
  assert.deepEqual(tones(PAPER.ink, PAPER.canvas), { dark: PAPER.ink, light: PAPER.canvas });
  assert.deepEqual(tones(NOCTURNE.ink, NOCTURNE.canvas), { dark: NOCTURNE.canvas, light: NOCTURNE.ink });
});

test('a duotone pixel lies on the segment between the two roles; black and white land on them exactly', () => {
  const { dark, light } = tones(PAPER.ink, PAPER.canvas);
  assert.deepEqual(duotone(0, dark, light), dark);
  assert.deepEqual(duotone(1, dark, light), light);
  for (let l = 0; l <= 1; l += 0.05) {
    const c = duotone(l, dark, light);
    // c = dark + k · (light − dark) for one k on every channel, within rounding
    const k = (c[0] - dark[0]) / (light[0] - dark[0]);
    for (let ch = 0; ch < 3; ch++) assert.ok(Math.abs(dark[ch] + k * (light[ch] - dark[ch]) - c[ch]) <= 1, `l ${l} ch ${ch}`);
    assert.ok(k >= -0.01 && k <= 1.01);
  }
});

test('at q = 0 nothing is revealed and no front shows; at q = 1 everything is revealed and the front is gone', () => {
  for (let v = 0; v <= 1; v += 0.01) {
    assert.deepEqual(frontAt(v, 0, 0.1), { reveal: 0, front: 0 });
    assert.deepEqual(frontAt(v, 1, 0.1), { reveal: 1, front: 0 });
  }
  const mid = [0, 0.25, 0.5, 0.75, 1].map((v) => frontAt(v, 0.5, 0.1));
  assert.equal(mid[0].reveal, 1); assert.equal(mid[4].reveal, 0);
  assert.ok(mid[2].front > 0.5, 'the front sits where the field equals the level');
});

test('the equalised field grows the revealed share evenly: about q at every q, in near-equal steps', () => {
  const w = 120, h = 80, T = equalise(field(w, h, { origin: 'left', warp: 0.35, rnd: random(42) }));
  const share = (q) => { let n = 0; for (const v of T) if (frontAt(v, q, 0.1).reveal >= 0.5) n++; return n / T.length; };
  const steps = [];
  let last = share(0);
  assert.equal(last, 0);
  for (let i = 1; i <= 10; i++) {
    const s = share(i / 10);
    steps.push(s - last); last = s;
  }
  assert.equal(last, 1);
  const inner = steps.slice(1, -1);
  assert.ok(Math.max(...inner) / Math.min(...inner) < 1.5, `steps ${inner.map((s) => s.toFixed(3))}`);
});

test('the field is seeded and starts at its origin', () => {
  const a = field(60, 40, { origin: 'left', warp: 0.35, rnd: random(7) }), b = field(60, 40, { origin: 'left', warp: 0.35, rnd: random(7) });
  assert.deepEqual(a, b);
  const col = (T, x) => { let s = 0; for (let y = 0; y < 40; y++) s += T[y * 60 + x]; return s / 40; };
  assert.ok(col(a, 2) < col(a, 30) && col(a, 30) < col(a, 57), 'from the left edge to the right');
  const top = field(60, 40, { origin: 'top', warp: 0, rnd: random(7) });
  assert.ok(top[0] < top[39 * 60]);
});

test('the module is an entrance that takes its time and names its params', () => {
  assert.equal(WAKE.group, 'entrances');
  assert.equal(WAKE.name, 'photo-wake');
  assert.equal(WAKE.dur, 'hold');
  for (const k of ['origin', 'band', 'warp']) assert.ok(WAKE.params[k], k);
});

test('the demo shows the picture full bleed in all four formats, so the headline sits on its plate inside the safe area', async () => {
  const { readFileSync } = await import('node:fs');
  const story = JSON.parse(readFileSync(new URL('../../patterns/entrances/photo-wake/demo/story.json', import.meta.url), 'utf8'));
  assert.deepEqual([...story.formats].sort(), ['16x9', '1x1', '4x5', '9x16']);
  for (const sc of story.scenes) assert.equal(sc.beats.find((b) => b.slot === 'image').params?.frame, 'bleed', sc.id);
});
