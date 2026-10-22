// Importing a mascot drawn in any vector tool: the SVG's layers, named by id, label or data-name
// (body, face, eye-left, eye-right, mouth, arm-*, leg-*, shadow; any other name an extra part),
// become a brand's `mascot` block normalised into its box (ground at the origin, height 10 u),
// with every colour mapped to the nearest palette role or a blend of two (a colour no role
// explains is named in a warning). The three fixture drawings come from three tools' habits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { normalisePath, parseTransform, readSvg, nameOf, apply, flatten, boxOf } from '../../scripts/lib/mascot-svg.mjs';
import { importMascot, nearestPaint } from '../../scripts/lib/mascot-map.mjs';
import { resolveMascot } from '../../runtime/kit/rig.js';

const v = validators();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const palette = JSON.parse(read('fixtures/mascot/palette.json'));
const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;
const svg = (body, vb = '0 0 100 100') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;
const valid = (mascot) => assert.ok(v.brand({ ...palette, mascot }), JSON.stringify(v.brand.errors));

test('the reader folds transforms into coordinates and turns every shape into one path form', () => {
  const M = parseTransform('translate(10 20) scale(2) rotate(90)');
  const [x, y] = apply(M, 1, 0);
  assert.ok(near(x, 10) && near(y, 22), `${x} ${y}`);
  const arc = normalisePath('M0 0 A10 10 0 0 1 20 0');
  assert.ok(arc.every((s) => ['M', 'C'].includes(s[0])), 'an arc becomes cubics');
  const top = boxOf(flatten(arc));
  assert.ok(near(top.y0, -10, 0.05), `a half circle reaches its radius: ${top.y0}`);
  assert.deepEqual(normalisePath('m1 1 h2 v2 h-2 z').map((s) => s[0]), ['M', 'L', 'L', 'L', 'Z']);
  const { shapes } = readSvg(svg('<g id="body" transform="translate(5 5)"><rect x="0" y="0" width="10" height="20" rx="2"/><circle cx="30" cy="30" r="5"/></g>'));
  assert.equal(shapes.length, 2);
  assert.deepEqual(shapes[0].box, { x0: 5, y0: 5, x1: 15, y1: 25 });
  assert.deepEqual(shapes[0].rect, { x: 5, y: 5, w: 10, h: 20, r: 2 });
  assert.ok(near(shapes[1].box.x0, 30) && near(shapes[1].box.y1, 40, 0.05));
  assert.deepEqual(shapes[0].names, ['body']);
});

test('layer names come from labels, data-names and ids; generated ids name nothing', () => {
  const el = (attrs) => ({ attrs });
  assert.equal(nameOf(el({ 'inkscape:label': 'Ear Left', id: 'g12' })), 'ear-left');
  assert.equal(nameOf(el({ 'data-name': 'arm left', id: 'arm-left-2' })), 'arm-left');
  assert.equal(nameOf(el({ id: 'eye_x5F_right' })), 'eye-right');
  for (const id of ['path841', 'rect-12', 'Ellipse 2', 'Vector', 'Group 7', 'Layer_1', 'g870']) assert.equal(nameOf(el({ id })), null, id);
});

test('the reader refuses scripts, entity declarations and outside files', () => {
  assert.throws(() => readSvg(svg('<script>alert(1)</script><path id="body" d="M0 0 H10 V10 Z"/>')), /script/);
  assert.throws(() => readSvg(`<!DOCTYPE svg [<!ENTITY x "y">]>${svg('<path id="body" d="M0 0 H1 V1 Z"/>')}`), /entities/);
  assert.throws(() => readSvg(svg('<image href="https://example.org/a.png" width="10" height="10"/>')), /outside file/);
});

test('colours map to the nearest role, a blend of two roles, or a warning', () => {
  assert.deepEqual(nearestPaint([46, 126, 210], palette.color).part, 'accent');
  const mid = nearestPaint([0x3a, 0x44, 0x52], palette.color);
  assert.equal(typeof mid.part, 'object', 'a midtone between ink and muted is a blend');
  assert.deepEqual([mid.part.role, mid.part.mix].sort(), ['ink', 'muted']);
  assert.equal(mid.warn, null);
  const odd = nearestPaint([255, 0, 170], palette.color);
  assert.ok(typeof odd.part === 'string' && odd.warn && /#FF00AA/.test(odd.warn), JSON.stringify(odd));
});

test('the droplet: no legs, no arms, floating over its shadow, an eyes-only face, a shine that does not swing', () => {
  const r = importMascot(read('fixtures/mascot/droplet.svg'), palette);
  const m = r.mascot;
  valid(m);
  assert.deepEqual(m.ground, [0, 0]);
  assert.equal(m.box[1], 10, 'height normalised to 10 u');
  assert.deepEqual(m.views.front.limbs ?? [], []);
  assert.ok(m.float > 1, `floats: ${m.float}`);
  assert.deepEqual(m.faces?.mouths, ['none'], 'no mouth drawn: an eyes-only face');
  assert.equal(m.parts.body, 'accent');
  assert.equal(m.parts.eyes, 'ink');
  assert.ok(m.parts.shine?.stroke > 0, 'a stroked extra part');
  assert.equal(m.parts.shine.swing, 0, 'a marking holds still');
  assert.equal(m.outline, 0, 'no outline drawn, none added');
  assert.ok(!('vector-3' in m.parts), 'a generated id is no part');
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(resolveMascot({ color: palette.color, mascot: m }).issues, []);
});

test('the cat: four short legs (two far), ears and a tail with anchors at the body, the tail behind it', () => {
  const r = importMascot(read('fixtures/mascot/cat.svg'), palette);
  const m = r.mascot;
  valid(m);
  const legs = m.views.front.limbs.filter((L) => L.kind === 'leg');
  assert.equal(legs.length, 4);
  assert.equal(legs.filter((L) => L.far).length, 2);
  assert.ok(legs.every((L) => L.y < 0 && L.width > 0.5), JSON.stringify(legs));
  assert.equal(m.views.front.limbs.filter((L) => L.kind === 'arm').length, 0, 'no arms');
  assert.equal(m.parts.tail.layer, 'back');
  assert.ok(m.parts.tail.stroke > 0);
  assert.equal(m.parts.tail.swing, 1.2);
  assert.equal(m.parts['ear-left'].swing, 0.6);
  // the ear's anchor sits at its base, inside the head, below its tip
  const ear = m.parts['ear-left'];
  const tipY = Math.min(...(ear.d.match(/-?[\d.]+/g).map(Number).filter((_, i) => i % 2 === 1)));
  assert.ok(ear.anchor[1] > tipY + 1, `anchor ${ear.anchor} below the tip ${tipY}`);
  // the tail joins the torso at its right end
  const tailXs = m.parts.tail.d.match(/-?[\d.]+/g).map(Number).filter((_, i) => i % 2 === 0);
  assert.ok(near(m.parts.tail.anchor[0], Math.max(...tailXs), 0.6), `tail anchor ${m.parts.tail.anchor}`);
  assert.equal(m.parts.body, 'muted');
  assert.equal(m.parts.limbs, undefined, 'legs in the body colour need no limbs colour');
  assert.ok(m.outline > 0, 'the drawn outline becomes the rig outline');
  assert.equal(m.views.front.face.sides ?? 'both', 'both');
  assert.ok(m.views.front.face.mouth > 0, 'a mouth below the eyes');
  assert.deepEqual(resolveMascot({ color: palette.color, mascot: m }).issues, []);
});

test('the robot: a screen face from the face layer\'s plate, an antenna in two strokes that swing as one, arms at the shoulders', () => {
  const r = importMascot(read('fixtures/mascot/robot.svg'), palette);
  const m = r.mascot;
  valid(m);
  const face = m.views.front.face;
  assert.ok(face.plate && face.plate.w > face.gap && face.plate.r > 0, JSON.stringify(face));
  assert.equal(m.parts.plate, 'ink');
  assert.equal(m.parts.eyes, 'accent');
  assert.equal(m.parts.mouth, 'accent');
  assert.equal(m.parts.body, 'line');
  const ant = Object.entries(m.parts).filter(([k]) => k.startsWith('antenna'));
  assert.equal(ant.length, 2, 'a stroke and a filled bulb');
  assert.deepEqual(ant[0][1].anchor, ant[1][1].anchor);
  assert.deepEqual(ant[0][1].tip, ant[1][1].tip, 'one tip, so both turn by the same angle');
  const arms = m.views.front.limbs.filter((L) => L.kind === 'arm');
  assert.equal(arms.length, 2);
  for (const a of arms) assert.ok(Math.abs(a.x) < m.box[0] / 2 && a.length > 1, JSON.stringify(a));
  assert.deepEqual(arms.map((a) => a.side).sort(), ['left', 'right']);
  assert.equal(m.parts.limbs, 'muted');
  assert.deepEqual(resolveMascot({ color: palette.color, mascot: m }).issues, []);
});

test('the importer refuses a drawing with no body, and warns on what it skips or cannot explain', () => {
  assert.throws(() => importMascot(svg('<circle id="head" cx="5" cy="5" r="4"/>'), palette), /body/);
  const r = importMascot(svg('<path id="body" d="M10 90 C10 20 90 20 90 90 Z" fill="#FF00AA"/><text>hi</text>'), palette);
  assert.ok(r.warnings.some((w) => /#FF00AA/.test(w)), JSON.stringify(r.warnings));
  assert.ok(r.notes.some((n) => /text/.test(n)), JSON.stringify(r.notes));
  valid(r.mascot);
});

test('a data-anchor and a data-swing on a layer override the importer\'s guesses', () => {
  const r = importMascot(svg('<path id="body" d="M10 90 C10 20 90 20 90 90 Z" fill="#2E7ED2"/><path id="hat" data-anchor="50 30" data-swing="0.1" d="M35 34 H65 L50 10 Z" fill="#1B2430"/>'), palette);
  assert.equal(r.mascot.parts.hat.swing, 0.1);
  const [ax, ay] = r.mascot.parts.hat.anchor;
  assert.ok(near(ax, 0, 0.01), `x ${ax}`);
  assert.ok(ay < -5, `y ${ay}`);
});
