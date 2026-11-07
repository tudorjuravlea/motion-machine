// The rig draws any mascot within its contract: extra parts (paths with an anchor, a layer, a
// swing that follows through on hops and takes, a role colour), characters with no legs that float
// and bob, characters with no arms, eyes-only faces, screen faces on a plate, and a brand's cast,
// picked by name. Every pose stays a pure function of its inputs and inside the headroom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMascot, characterPose, markup, MOODS, VIEWS } from '../../runtime/kit/rig.js';

const color = { canvas: '#f4efe6', ink: '#1d1b18', muted: '#6b665e', surface: '#fffaf2', line: '#d8cfc1', accent: '#2f6f5e', accentInk: '#ffffff' };
const cat = {
  box: [10, 8], ground: [0, 0],
  views: { front: {
    body: 'M-4 -1.5 C-4 -5 -2 -5.5 1 -5.5 C3 -5.5 4.5 -5 4.5 -3 C4.5 -1.5 3.5 -1.5 0 -1.5 Z',
    face: { cx: 2.6, cy: -4, gap: 1.6, size: 0.7 },
    limbs: [
      { kind: 'leg', x: -3, y: -2, width: 0.8, far: true }, { kind: 'leg', x: -2, y: -2, width: 0.8 },
      { kind: 'leg', x: 2.5, y: -2, width: 0.8, far: true }, { kind: 'leg', x: 3.5, y: -2, width: 0.8 },
    ],
  } },
  parts: {
    body: 'accent',
    'ear-left': { d: 'M1.6 -5.3 L2 -6.6 L2.6 -5.4 Z', anchor: [2.1, -5.4], swing: 0.6 },
    'ear-right': { d: 'M3 -5.3 L3.5 -6.6 L4 -5.2 Z', anchor: [3.5, -5.3], swing: 0.6 },
    tail: { d: 'M-4 -3 C-5.5 -3.5 -5.8 -5.5 -5 -6.5', anchor: [-4, -3], layer: 'back', swing: 1.2, stroke: 0.5, color: { role: 'accent', mix: 'ink', share: 0.25 } },
  },
};
const drop = {
  box: [6, 8], ground: [0, 0], float: 1.6,
  views: { front: { body: 'M0 -8 C1.5 -5.6 3 -3.8 3 -2.4 C3 -0.8 1.6 0 0 0 C-1.6 0 -3 -0.8 -3 -2.4 C-3 -3.8 -1.5 -5.6 0 -8 Z', face: { cx: 0, cy: -2.8, gap: 1.8, size: 0.8 } } },
  faces: { mouths: ['none'] },
};
const robot = {
  box: [7, 10], ground: [0, 0],
  views: { front: {
    body: 'M-3 -1.5 H3 V-8 H-3 Z',
    face: { cx: 0, cy: -6, gap: 2, size: 0.9, mouth: 1.2, plate: { w: 4.6, h: 3, r: 0.6, y: 0.5 } },
    limbs: [{ kind: 'arm', x: -3, y: -4.5, length: 2, width: 0.7 }, { kind: 'arm', x: 3, y: -4.5, length: 2, width: 0.7 }, { kind: 'leg', x: -1.4, y: -2, width: 1 }, { kind: 'leg', x: 1.4, y: -2, width: 1 }],
  } },
  parts: { body: 'line', plate: 'ink', antenna: { d: 'M0 -8 V-9.6', anchor: [0, -8], stroke: 0.25, swing: 1, color: 'muted' }, bulb: { d: 'M-0.4 -9.8 A0.4 0.4 0 1 0 0.4 -9.8 A0.4 0.4 0 1 0 -0.4 -9.8 Z', anchor: [0, -8], swing: 1, color: 'accent' } },
};
const style = { color, mascot: { ...drop, cast: { cat, robot } } };

const partsOf = (svg) => [...svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]);
const angleOf = (svg, name) => Number(new RegExp(`data-part="${name}"[^>]*data-swing="(-?[\\d.]+)"`).exec(svg)?.[1] ?? NaN);

test('the cast is picked by name; an unknown name draws the brand\'s main character and says so', () => {
  assert.equal(resolveMascot(style).float, 1.6, 'the main character');
  assert.deepEqual(resolveMascot(style, 'cat').box, cat.box);
  assert.deepEqual(resolveMascot(style, 'robot').box, robot.box);
  const lost = resolveMascot(style, 'dragon');
  assert.equal(lost.float, 1.6);
  assert.ok(lost.issues.some((s) => /dragon/.test(s)), JSON.stringify(lost.issues));
  for (const who of [undefined, 'cat', 'robot']) assert.deepEqual(resolveMascot(style, who).issues, [], who);
});

test('extra parts are drawn in their layer, in their colour, from roles only', () => {
  const m = resolveMascot(style, 'cat');
  const svg = markup(m, characterPose({ mascot: m }), { id: 'c' });
  assert.deepEqual(partsOf(svg).sort(), ['ear-left', 'ear-right', 'tail']);
  const iTail = svg.indexOf('data-part="tail"'), iFill = svg.indexOf('mm-rig__fill'), iEar = svg.indexOf('data-part="ear-left"'), iOut = svg.indexOf('mm-rig__outline'), iFace = svg.indexOf('mm-rig__face');
  assert.ok(iTail < iFill, 'a back part sits behind the body');
  assert.ok(iEar > iOut && iEar < iFace, 'a front part sits over the body, under the face');
  assert.match(svg, /data-part="tail"[\s\S]*?stroke: color-mix\(in srgb, var\(--mm-color-accent\) 75%, var\(--mm-color-ink\)\)/, 'the tail is a stroke in its blend');
  for (const fill of svg.matchAll(/(?:fill|stroke): ([^;"]+)/g)) assert.match(fill[1], /^(none|var\(--mm-color-[a-zA-Z]+\)|color-mix\(in srgb, var\(--mm-color-[a-zA-Z]+\) [\d.]+%, (var\(--mm-color-[a-zA-Z]+\)|transparent)\))$/, fill[1]);
});

test('a part limited to some views is drawn only there; a part that reaches outside the box is dropped and named', () => {
  const only = { ...cat, parts: { ...cat.parts, tail: { ...cat.parts.tail, views: ['side'] } } };
  const m = resolveMascot({ color, mascot: only });
  assert.ok(!partsOf(markup(m, characterPose({ mascot: m, view: 'front' }), { id: 'a' })).includes('tail'));
  assert.ok(partsOf(markup(m, characterPose({ mascot: m, view: 'side' }), { id: 'a' })).includes('tail'));
  const far = resolveMascot({ color, mascot: { ...cat, parts: { ...cat.parts, flag: { d: 'M0 0 L90 -90', anchor: [0, 0] } } } });
  assert.ok(far.issues.some((s) => /flag/.test(s)), JSON.stringify(far.issues));
  assert.ok(!partsOf(markup(far, characterPose({ mascot: far }), { id: 'a' })).includes('flag'));
  assert.ok(partsOf(markup(far, characterPose({ mascot: far }), { id: 'a' })).includes('tail'), 'the rest of the character is kept');
});

test('parts swing with follow-through on the hop and the take, and hang still at rest', () => {
  const m = resolveMascot(style, 'cat');
  const at = (o) => markup(m, characterPose({ mascot: m, amp: 0, blinks: false, dur: 0.8, ...o }), { id: 's' });
  assert.equal(angleOf(at({ q: 3, t: 9 }), 'tail'), 0, 'still at rest, long after the landing');
  let peak = 0;
  for (let q = 0; q <= 1; q += 1 / 48) peak = Math.max(peak, Math.abs(angleOf(at({ q, t: q * 0.8 }), 'tail')));
  assert.ok(peak > 8, `the tail swings on the hop: ${peak.toFixed(1)} degrees`);
  assert.ok(peak <= 1.2 * 40 + 1e-6, `bounded by its swing: ${peak.toFixed(1)}`);
  let take = 0;
  for (let a = 0; a < 0.4; a += 1 / 60) take = Math.max(take, Math.abs(angleOf(at({ t: 3 + a, act: { from: 'calm', to: 'surprised', a } }), 'ear-left')));
  assert.ok(take > 2, `the ears follow through on the take: ${take.toFixed(1)}`);
  const rigid = resolveMascot({ color, mascot: { ...cat, parts: { ...cat.parts, tail: { ...cat.parts.tail, swing: 0 } } } });
  for (let q = 0; q <= 1; q += 0.1) assert.equal(angleOf(markup(rigid, characterPose({ mascot: rigid, q, t: q, dur: 0.8 }), { id: 'r' }), 'tail'), 0);
  assert.equal(at({ q: 0.5, t: 0.4 }), at({ q: 0.5, t: 0.4 }), 'pure');
});

test('a character with no legs floats and bobs over its shadow; one with no arms draws no arms', () => {
  const m = resolveMascot(style);
  const rest = markup(m, characterPose({ mascot: m, amp: 0, blinks: false }), { id: 'f' });
  assert.doesNotMatch(rest, /mm-rig__limb/, 'no limbs at all');
  assert.match(rest, /class="mm-rig__body" transform="translate\(0 -1\.6\)/, 'lifted by its float at rest');
  assert.match(rest, /class="mm-rig__shadow" cx="0" cy="0"/, 'the shadow stays on the ground');
  const ys = [];
  for (let t = 0; t < 2; t += 0.05) ys.push(Number(/mm-rig__body" transform="translate\(-?[\d.]+ (-?[\d.]+)\)/.exec(markup(m, characterPose({ mascot: m, mood: 'calm', t, bpm: 120 }), { id: 'f' }))[1]));
  assert.ok(Math.max(...ys) - Math.min(...ys) > 0.1, 'it bobs while it idles');
  const armless = resolveMascot({ color, mascot: { ...robot, views: { front: { ...robot.views.front, limbs: robot.views.front.limbs.filter((L) => L.kind === 'leg') } } } });
  assert.equal((markup(armless, characterPose({ mascot: armless }), { id: 'n' }).match(/mm-rig__limb/g) ?? []).length, 4, 'two legs, each with an outline, no arms');
});

test('an eyes-only face never draws a mouth in any mood', () => {
  const m = resolveMascot(style);
  for (const mood of MOODS) {
    const svg = markup(m, characterPose({ mascot: m, mood }), { id: 'e' });
    assert.match(svg, /data-mouth="none"/, mood);
    assert.doesNotMatch(svg, /translate\(0 [\d.]+\)"><(path|ellipse)/, `${mood}: no mouth group`);
  }
});

test('a screen face draws its plate under the eyes, and the eyes default to the lightest role', () => {
  const m = resolveMascot(style, 'robot');
  const svg = markup(m, characterPose({ mascot: m, mood: 'happy' }), { id: 'p' });
  const face = svg.slice(svg.indexOf('mm-rig__face'));
  assert.match(face, /^mm-rig__face"[^>]*><rect class="mm-rig__plate"[^>]*style="fill: var\(--mm-color-ink\)/, 'the plate first, in its colour');
  assert.match(face, /stroke: var\(--mm-color-accentInk\)/, 'eyes in the lightest role (accentInk in this palette)');
  assert.equal(m.css.eyes, 'var(--mm-color-accentInk)');
  assert.doesNotMatch(face, /opacity="0\.55"/, 'no cheeks on a screen');
  const given = resolveMascot({ color, mascot: { ...robot, parts: { ...robot.parts, eyes: 'accent' } } });
  assert.equal(given.css.eyes, 'var(--mm-color-accent)', 'a given eye colour wins');
});

test('every new character stays under its headroom: floating, antennae and ears included', () => {
  const reach = (svg, m) => {
    const n = (k) => Number(svg.match(new RegExp(`data-${k}="(-?[\\d.]+)"`))?.[1] ?? 0);
    const sy = 1 - Math.max(-0.45, Math.min(0.45, n('sq'))), rot = n('rot');
    // -dy already holds a floating character's float, so the body above its own base is top - float
    return -n('dy') + (m.top - m.float) * sy * Math.cos(rot) + 0.5 * m.box[0] * (1 / sy) * Math.abs(Math.sin(rot));
  };
  for (const who of [undefined, 'cat', 'robot']) {
    const m = resolveMascot(style, who);
    assert.ok(m.top >= (who === 'robot' ? 10.2 : who === 'cat' ? 6.6 : 9.6) - 1e-9, `${who ?? 'drop'}: top ${m.top} counts the parts and the float`);
    const top = (svg) => -Number(svg.match(/viewBox="[-\d.]+ (-?[\d.]+)/)[1]);
    for (const mood of MOODS) for (let t = 0; t < 3; t += 1 / 30) {
      const svg = markup(m, characterPose({ mascot: m, mood, t, amp: 1.5, bpm: 128 }), { id: 'h' });
      assert.ok(reach(svg, m) <= top(svg) + 1e-6, `${who} ${mood} ${t.toFixed(2)}`);
    }
    for (const view of VIEWS) assert.match(markup(m, characterPose({ mascot: m, view }), { id: 'v' }), /^<svg class="mm-rig"/);
  }
});
