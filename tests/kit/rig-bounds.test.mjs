// The character rig stays inside its own box: a mascot whose paths reach far outside the box it
// claims is refused (the front falls back to the rig's default, another view is made from the
// front), the drawing clips to its slot, and the viewBox keeps headroom for every pose the rig
// makes (the idle at every `idle` value, the hop, the take), so nothing is cut at rest. Views made
// from the front turn: the silhouette narrows, the far arm hides in profile, and the face is drawn
// over every limb.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as rig from '../../runtime/kit/rig.js';

const { resolveMascot, viewOf, markup, characterPose, MOODS, VIEWS, DEFAULT_MASCOT } = rig;
const read = (f) => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const paper = read('styles/brands/paper.json'), nocturne = read('styles/brands/nocturne.json');
const base = { box: [8, 10], ground: [0, 0], views: { front: { body: 'M-4 -2 C-4 -10 4 -10 4 -2 Z', face: { cx: 0, cy: -5, gap: 2.4, size: 1 } } } };

test('a body traced at the wrong scale is refused: the front falls back to the default character and says why', () => {
  for (const body of ['M0 0 H200 V200 H0 Z', 'M-999 -999 H999 V999 H-999 Z', 'M-4 -2 c0 -400 8 -400 8 0 Z']) {
    const m = resolveMascot({ mascot: { ...base, views: { front: { ...base.views.front, body } } } });
    assert.equal(m.views.front.body, DEFAULT_MASCOT.views.front.body, body);
    assert.deepEqual(m.box, DEFAULT_MASCOT.box);
    assert.ok(m.issues.some((s) => /front/.test(s) && /box/.test(s)), JSON.stringify(m.issues));
  }
  const side = resolveMascot({ mascot: { ...base, views: { ...base.views, side: { body: 'M0 0 H90 V-90 Z' } } } });
  assert.equal(side.views.front.body, base.views.front.body, 'a fitting front is kept');
  assert.equal(side.views.side, undefined, 'a side view that does not fit is dropped and made from the front');
  assert.ok(side.issues.some((s) => /side/.test(s)));
  assert.equal(resolveMascot({ mascot: { ...base, views: { front: { ...base.views.front, limbs: [{ kind: 'arm', x: 60, y: -4, width: 1 }] } } } }).views.front.body, DEFAULT_MASCOT.views.front.body, 'a limb anchored far outside the box');
});

test('the shipped mascots and the default fit their boxes', () => {
  for (const mascot of [paper.mascot, nocturne.mascot, undefined]) assert.deepEqual(resolveMascot({ mascot }).issues, []);
  assert.deepEqual(Object.keys(resolveMascot({ mascot: nocturne.mascot }).views), VIEWS);
});

test('the rig clips its drawing to its slot', () => {
  const m = resolveMascot({ mascot: paper.mascot });
  for (const sheet of [null, 'all']) assert.match(markup(m, characterPose({ mascot: m }), { id: 'c', sheet }), /^<svg class="mm-rig"[^>]*style="[^"]*overflow: hidden/);
});

// the body's top above the ground at a pose: lifted by -dy, scaled by sy, a lean adds a corner
const reach = (svg, m) => {
  const n = (k) => Number(svg.match(new RegExp(`data-${k}="(-?[\\d.]+)"`))?.[1] ?? 0);
  const [W, H] = m.box, sq = n('sq'), rot = n('rot');
  const sy = 1 - Math.max(-0.45, Math.min(0.45, sq)), sx = 1 / sy;
  return -n('dy') + H * sy * Math.cos(rot) + 0.5 * W * sx * Math.abs(Math.sin(rot));
};
const top = (svg) => -Number(svg.match(/viewBox="[-\d.]+ (-?[\d.]+)/)[1]);

test('the viewBox keeps headroom for every pose: the idle of every mood at every idle value, the hop, and the largest take', () => {
  for (const mascot of [paper.mascot, nocturne.mascot, undefined]) {
    const m = resolveMascot({ mascot });
    const check = (o, what) => {
      const svg = markup(m, characterPose({ mascot: m, ...o }), { id: 'h' });
      assert.ok(reach(svg, m) <= top(svg) + 1e-6, `${what}: reaches ${reach(svg, m).toFixed(3)} u above the ground, the viewBox ${top(svg).toFixed(3)}`);
    };
    for (const mood of MOODS) for (const amp of [0, 0.5, 1, 1.5]) for (const bpm of [90, 128]) {
      for (let t = 0; t < 4; t += 1 / 60) check({ mood, amp, bpm, t, blinks: false }, `${mood} idle ${amp} at ${bpm} bpm, t ${t.toFixed(3)}`);
    }
    for (const from of ['place', 'left']) for (let q = 0; q <= 1; q += 1 / 120) check({ q, from, amp: 0 }, `hop from ${from} at ${q.toFixed(3)}`);
    for (const to of MOODS) for (let a = -0.3; a < 1; a += 1 / 120) check({ mood: 'calm', amp: 1.5, t: a, act: { from: 'calm', to, a, amt: 1.5 } }, `take to ${to} at ${a.toFixed(3)}`);
  }
});

test('the idle keeps its documented size: a hop of 2 u and a squash of 0.16 at idle 1, both scaling with idle up to 3 u and 0.24 at 1.5', () => {
  for (const [amp, hopU, sq] of [[1, 2, 0.16], [1.5, 3, 0.24], [0.5, 1, 0.08]]) {
    let hi = 0, lo = 0;
    for (let t = 0; t < 4; t += 1 / 240) { const p = rig.idle('excited', t, { bpm: 120, amp }); hi = Math.max(hi, -p.dy); lo = Math.max(lo, p.sq); }
    assert.ok(Math.abs(hi - hopU) < 1e-3 && Math.abs(lo - sq) < 1e-3, `idle ${amp}: hop ${hi.toFixed(3)}, squash ${lo.toFixed(3)}`);
  }
});

test('views made from the front turn: the silhouette narrows, the far arm hides in profile, the near eye sits inside the body', () => {
  const m = resolveMascot({ mascot: paper.mascot });
  const front = viewOf(m, 'front'), three = viewOf(m, 'threeQuarter'), side = viewOf(m, 'side');
  assert.equal(front.narrow ?? 1, 1);
  assert.ok(three.narrow < 1 && side.narrow < three.narrow, `narrow ${three.narrow}, ${side.narrow}`);
  const arms = (v) => (v.limbs ?? []).filter((L) => L.kind === 'arm');
  assert.equal(arms(front).length, 2);
  assert.equal(arms(side).length, 1, 'one arm in profile');
  assert.ok(arms(side)[0].x >= m.ground[0], 'the near arm, on the side it faces');
  assert.ok(arms(three).some((L) => L.far), 'the far arm is shaded at 3/4');
  const hw = 0.5 * m.box[0] * side.narrow, eye = 0.5 * side.face.size * side.face.fw;
  assert.ok(side.face.cx + eye <= m.ground[0] + hw - 0.3, `the near eye (${(side.face.cx + eye).toFixed(2)}) inside the body (${hw.toFixed(2)})`);
});

test('the face is drawn over every limb, so an arm in front never hides the mouth', () => {
  const m = resolveMascot({ mascot: nocturne.mascot });
  for (const view of ['side', 'threeQuarter', 'front']) for (const mood of MOODS) {
    const svg = markup(m, characterPose({ mascot: m, view, mood, amp: 0 }), { id: 'f' });
    const face = svg.indexOf('class="mm-rig__face"');
    assert.ok(face > 0 && svg.includes('class="mm-rig__limb'), `${view} ${mood}: a face and limbs`);
    assert.ok(svg.lastIndexOf('class="mm-rig__limb') < face, `${view} ${mood}: a limb drawn after the face`);
  }
});

test('kick is gone: the rig exports only what the patterns use', () => {
  assert.equal('kick' in rig, false);
});

test('nocturne\'s drawn side view hangs its near arm below the mouth line', () => {
  const v = viewOf(resolveMascot({ mascot: nocturne.mascot }), 'side');
  const mouth = v.face.cy + v.face.mouth;
  for (const L of v.limbs.filter((l) => l.kind === 'arm' && l.layer === 'front')) assert.ok(L.y - L.width / 2 > mouth, `arm top ${L.y - L.width / 2} against the mouth line ${mouth}`);
});
