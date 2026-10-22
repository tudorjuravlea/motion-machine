// The character rig (runtime/kit/rig.js): a brand's mascot drawn as SVG parts filled from palette
// roles, squashed about its ground point with its area kept, kept alive by an idle locked to the
// beat, hopping in and acting a mood change in closed forms of time. Pure: Node runs it as the
// browser does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  squash, accent, idle, hop, act, blink, resolveMascot, viewOf, moodOf, colorOf, markup, characterPose,
  MOODS, VIEWS, ACT, DEFAULT_MASCOT,
} from '../../runtime/kit/rig.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const paper = read('styles/brands/paper.json'), nocturne = read('styles/brands/nocturne.json');

test('squash keeps the area: within 0.95 to 1.0 for every squash in [-0.3, 0.3], and squash 0 is the drawing', () => {
  for (let s = -0.3; s <= 0.3 + 1e-9; s += 0.01) {
    const { sx, sy } = squash(s);
    const area = sx * sy;
    assert.ok(area >= 0.95 && area <= 1.0 + 1e-9, `s=${s.toFixed(2)}: area ${area}`);
    if (s > 0) assert.ok(sy < 1 && sx > 1, 'a squash is lower and wider');
    if (s < 0) assert.ok(sy > 1 && sx < 1, 'a stretch is taller and thinner');
  }
  assert.deepEqual(squash(0), { sx: 1, sy: 1 });
});

// local maxima of a sampled series: [t, value]
function peaks(f, from, to, fps) {
  const out = [];
  const v = (i) => f(from + i / fps);
  const n = Math.round((to - from) * fps);
  for (let i = 1; i < n; i++) if (v(i) > v(i - 1) && v(i) >= v(i + 1) && v(i) > 1e-3) out.push(from + i / fps);
  return out;
}

test('the beat accent peaks on the beat, is 1 there, and falls to 0 before the next', () => {
  assert.equal(accent(3), 1);
  assert.equal(accent(0), 1);
  assert.ok(accent(2.5) < 0.06, `${accent(2.5)}`);
  assert.ok(Math.abs(accent(3.9999) - accent(4)) < 1e-3, 'continuous into the beat');
  assert.ok(accent(1, 2) < 0.06 && accent(2, 2) === 1, 'every second beat');
});

for (const [bpm, offset] of [[90, 0], [120, 0], [128, 0.137], [100, 0.4]]) {
  test(`every mood's idle squash peaks within one frame of every beat over 10 s (bpm ${bpm}, grid from ${offset} s)`, () => {
    const beat = 60 / bpm, fps = 30;
    const grid = [];
    for (let b = offset; b <= 10 + 1e-9; b += beat) grid.push(b);
    for (const mood of MOODS) {
      const every = mood === 'sleepy' ? 2 : 1;
      const p = peaks((t) => idle(mood, t, { bpm, offset }).sq, 0, 10, fps);
      const beats = grid.filter((_, i) => i % every === 0).filter((b) => b > 1 / fps && b < 10 - 1 / fps);
      for (const b of beats) assert.ok(p.some((t) => Math.abs(t - b) <= 1 / fps + 1e-9), `${mood}: no squash peak within a frame of the beat at ${b.toFixed(3)} s (peaks ${p.slice(0, 6).map((x) => x.toFixed(3))})`);
      for (const t of p) assert.ok(grid.some((b) => Math.abs(t - b) <= 1 / fps + 1e-9), `${mood}: a squash peak at ${t.toFixed(3)} s is off the grid`);
    }
  });
}

test('the idle amplitude scales with the idle param; 0 is still', () => {
  const a = idle('happy', 2.2, { bpm: 120, amp: 1 }), b = idle('happy', 2.2, { bpm: 120, amp: 0.5 }), z = idle('happy', 2.2, { bpm: 120, amp: 0 });
  assert.ok(Math.abs(b.dy - a.dy / 2) < 1e-9 && Math.abs(b.sq - a.sq / 2) < 1e-9);
  assert.equal(z.dy, 0); assert.equal(z.sq, 0); assert.equal(z.dx, 0); assert.equal(z.rot, 0);
});

test('the hop entrance anticipates, flies, lands squashed and ends at the rest pose', () => {
  const crouch = hop(0.18), air = hop(0.45), land = hop(0.7), rest = hop(1);
  assert.ok(crouch.sq > 0.15, `anticipation crouches: ${crouch.sq}`);
  assert.ok(air.dy < -1, `in the air: ${air.dy}`);
  assert.ok(land.sq > 0.15, `lands squashed: ${land.sq}`);
  for (const k of ['dx', 'dy', 'sq', 'rot']) assert.equal(Math.abs(rest[k]), 0, `${k} at rest`);
  assert.equal(rest.opacity, 1);
  assert.equal(hop(0).opacity, 0);
  const side = hop(0.1, { from: 'left', d: 1, width: 8 });
  assert.ok(side.dx < -7, `from the left it starts a box width away: ${side.dx}`);
  assert.equal(hop(1, { from: 'left', d: 1, width: 8 }).dx, 0);
});

test('an acted mood change: the eyes shut into the key, the face swaps while they are shut, a take peaks just after, and the pose settles', () => {
  const at = (a) => act('calm', 'surprised', a);
  for (let a = -0.05; a <= 0.05 + 1e-9; a += 0.005) assert.ok(at(a).squint >= 0.8, `squint at ${a.toFixed(3)}: ${at(a).squint}`);
  assert.equal(at(-0.001).face, 'calm');
  assert.equal(at(0).face, 'surprised');
  assert.equal(at(-0.5).squint, 0); assert.equal(at(0.5).squint, 0);
  // the take: the highest hop after the key
  let best = 0, tPeak = 0;
  for (let a = 0; a <= 0.6; a += 1 / 240) if (-at(a).dy > best) { best = -at(a).dy; tPeak = a; }
  assert.ok(best > 0.3 && tPeak <= 0.15, `take peak ${best.toFixed(3)} at ${tPeak.toFixed(3)} s`);
  // the pose blends with an overshoot and has settled by 0.6 s (error under 0.5 %)
  assert.ok(Math.max(...[0.15, 0.2, 0.25].map((a) => at(a).w)) > 1, 'blend overshoots');
  for (let a = 0.6; a <= 2; a += 0.05) {
    const s = at(a);
    assert.ok(Math.abs(s.w - 1) < 0.005 && Math.abs(s.sq) < 0.005 && Math.abs(s.dy) < 0.005, `settled at ${a.toFixed(2)}: ${JSON.stringify(s)}`);
  }
  assert.ok(ACT.key + 0.6 <= ACT.dur, 'the act settles inside its window');
});

test('blinks are a closed form of time, phase-shifted by the seed, and brief', () => {
  let shut = 0;
  for (let t = 0; t < 10; t += 1 / 30) if (blink(t, 0.3) > 0.5) shut++;
  assert.ok(shut >= 2 && shut <= 12, `${shut} frames of 300 shut`);
  assert.equal(blink(4.21, 0.3), blink(4.21, 0.3));
  let differ = 0;
  for (let t = 0; t < 10; t += 1 / 30) if ((blink(t, 0.3) > 0.5) !== (blink(t, 0.71) > 0.5)) differ++;
  assert.ok(differ > 0, 'two seeds do not blink together');
});

test('views fall back: a missing 3/4 or side view moves and narrows the front face, a missing back has no face', () => {
  const m = resolveMascot({ mascot: paper.mascot });
  const front = viewOf(m, 'front'), three = viewOf(m, 'threeQuarter'), side = viewOf(m, 'side'), back = viewOf(m, 'back');
  assert.equal(three.body, front.body);
  assert.ok(three.face.cx > front.face.cx && three.face.fw < 1);
  assert.ok(side.face.cx > three.face.cx && side.face.fw < three.face.fw && side.face.sides === 'near');
  assert.equal(back.face, null);
  const block = resolveMascot({ mascot: nocturne.mascot });
  assert.ok(viewOf(block, 'threeQuarter').strip, 'a drawn view is used as drawn');
  assert.deepEqual(VIEWS, ['front', 'threeQuarter', 'side', 'back']);
});

test('a style without a mascot gets the rig\'s plain default; moods and faces the brand does not allow fall back', () => {
  assert.equal(resolveMascot({}).views.front.body, DEFAULT_MASCOT.views.front.body);
  const m = resolveMascot({ mascot: { ...paper.mascot, moods: ['calm', 'happy'], faces: { eyes: ['dot'], mouths: ['none', 'smile'] } } });
  assert.equal(moodOf(m, 'sad').name, 'calm', 'a mood outside the list is the first one');
  const happy = moodOf(m, 'happy');
  assert.equal(happy.eyes, 'dot', 'happy eyes are arcs, which this brand does not allow');
  assert.equal(happy.mouth, 'smile');
});

test('part colours are role variables or sRGB blends of two roles, never a literal', () => {
  assert.equal(colorOf('accent'), 'var(--mm-color-accent)');
  assert.equal(colorOf({ role: 'accent', mix: 'ink', share: 0.25 }), 'color-mix(in srgb, var(--mm-color-accent) 75%, var(--mm-color-ink))');
  assert.equal(colorOf('gold', 'ink'), 'var(--mm-color-ink)', 'an unknown role falls back');
  for (const mascot of [paper.mascot, nocturne.mascot, undefined]) {
    const m = resolveMascot({ mascot, color: paper.color });
    for (const view of VIEWS) for (const mood of MOODS) {
      const svg = markup(m, characterPose({ mascot: m, mood, view }), { id: 'x' });
      assert.doesNotMatch(svg, /#[0-9a-f]{3,8}\b(?!["'])|rgba?\(|hsla?\(/i, `${view} ${mood}: a literal colour`);
      for (const c of svg.matchAll(/(?:fill|stroke):\s*([^;"]+)/g)) {
        if (c[1] === 'none') continue;
        assert.match(c[1], /^(var\(--mm-color-[a-zA-Z]+\)|color-mix\(in srgb, var\(--mm-color-[a-zA-Z]+\) [\d.]+%, (var\(--mm-color-[a-zA-Z]+\)|transparent)\))$/, `${view} ${mood}: ${c[1]}`);
      }
    }
  }
});

test('shade darkens and light, cheeks and shadow follow the brand\'s polarity: toward its darkest and lightest roles', () => {
  const dark = resolveMascot({ mascot: nocturne.mascot, color: nocturne.color }).css;
  assert.match(dark.shade, /var\(--mm-color-accent\) [\d.]+%, var\(--mm-color-canvas\)\)$/, `nocturne's darkest role is canvas: ${dark.shade}`);
  assert.match(dark.light, /var\(--mm-color-accent\) [\d.]+%, var\(--mm-color-ink\)\)$/, `nocturne's lightest role is ink: ${dark.light}`);
  assert.match(dark.blush, /, var\(--mm-color-ink\)\)$/);
  assert.match(dark.shadow, /var\(--mm-color-canvas\)/);
  const light = resolveMascot({ mascot: paper.mascot, color: paper.color }).css;
  assert.match(light.shade, /, var\(--mm-color-ink\)\)$/);
  assert.match(light.light, /, var\(--mm-color-surface\)\)$/);
  const own = resolveMascot({ mascot: { ...paper.mascot, parts: { body: 'muted', light: 'line' } }, color: paper.color }).css;
  assert.match(own.shade, /^color-mix\(in srgb, var\(--mm-color-muted\)/, 'the shade follows the body\'s own role');
  assert.equal(own.light, 'var(--mm-color-line)', 'a part the brand gives is used as given');
});

test('the markup is the same for the same pose, carries one face only, and reports its pose', () => {
  const m = resolveMascot({ mascot: paper.mascot });
  const pose = characterPose({ mascot: m, mood: 'happy', view: 'front', t: 1.3, bpm: 120 });
  const a = markup(m, pose, { id: 'r1' }), b = markup(m, pose, { id: 'r1' });
  assert.equal(a, b);
  assert.equal((a.match(/class="mm-rig__face"/g) ?? []).length, 1);
  assert.match(a, /data-mood="happy"/);
  assert.match(a, /data-sq="-?[\d.]+"/);
  const back = markup(m, characterPose({ mascot: m, mood: 'happy', view: 'back' }), { id: 'r1' });
  assert.equal((back.match(/class="mm-rig__face"/g) ?? []).length, 0, 'the back view shows no face');
});

test('a sheet draws every view in every mood: one face per front-facing cell', () => {
  const m = resolveMascot({ mascot: nocturne.mascot });
  const svg = markup(m, characterPose({ mascot: m, mood: 'calm' }), { id: 's', sheet: 'all' });
  assert.equal((svg.match(/class="mm-rig__cell"/g) ?? []).length, VIEWS.length * MOODS.length);
  assert.equal((svg.match(/class="mm-rig__face"/g) ?? []).length, (VIEWS.length - 1) * MOODS.length);
});
