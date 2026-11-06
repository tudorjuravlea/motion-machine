// A motion half can be handed to another agent: essence (visible traits, named neighbours with the line
// between them), nativeMoves (what only this style does, each with a transfer example), pitfalls (mechanism
// and fix) and variation (the agent's freedom, apart from its invariants). Optional in the schema, present on
// every shipped half, and carried through `mm style compose`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { compose } from '../../scripts/compose.mjs';

const v = validators();
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const halves = readdirSync(join(ROOT, 'styles/motion')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
const clone = (o) => JSON.parse(JSON.stringify(o));

test('there are six shipped motion halves', () => assert.deepEqual(halves.sort(), ['calm', 'grid', 'kinetic', 'premium', 'proof', 'stop-motion']));

test('every shipped half carries the four fields and validates', () => {
  for (const name of halves) {
    const m = read(`styles/motion/${name}.json`);
    assert.ok(v.motion(m), `${name}: ${JSON.stringify(v.motion.errors)}`);
    assert.ok(m.essence.traits.length >= 3 && m.essence.traits.length <= 5, `${name} traits`);
    assert.ok(m.essence.notLike.length >= 1, `${name} notLike`);
    for (const n of m.essence.notLike) assert.ok(halves.includes(n.style) && n.style !== name, `${name} names ${n.style}`);
    assert.ok(m.nativeMoves.length >= 2 && m.nativeMoves.every((x) => x.move && x.transfer), `${name} nativeMoves`);
    assert.ok(m.pitfalls.length >= 2 && m.pitfalls.every((x) => x.mistake && x.mechanism && x.fix), `${name} pitfalls`);
    assert.ok(m.variation.free.length >= 2 && m.variation.invariants.length >= 2, `${name} variation`);
  }
});

test('the schema refuses a malformed brief', () => {
  const base = read('styles/motion/calm.json');
  const bad = (edit) => { const m = clone(base); edit(m); return v.motion(m); };
  assert.equal(bad((m) => { m.essence.traits = m.essence.traits.slice(0, 2); }), false, 'two traits');
  assert.equal(bad((m) => { m.essence.traits = [...m.essence.traits, 'a sixth visible trait on screen', 'a seventh visible trait on screen', 'an eighth visible trait on screen']; }), false, 'too many traits');
  assert.equal(bad((m) => { delete m.pitfalls[0].fix; }), false, 'pitfall without fix');
  assert.equal(bad((m) => { delete m.nativeMoves[0].transfer; }), false, 'native move without transfer');
  assert.equal(bad((m) => { delete m.essence.notLike[0].line; }), false, 'neighbour without the line');
  assert.equal(bad((m) => { delete m.variation.invariants; }), false, 'variation without invariants');
});

test('a half without the four fields still validates (they are optional)', () => {
  const m = clone(read('styles/motion/calm.json'));
  for (const k of ['essence', 'nativeMoves', 'pitfalls', 'variation']) delete m[k];
  assert.ok(v.motion(m), JSON.stringify(v.motion.errors));
});

test('compose carries the four fields into the style, and the style schema accepts them', () => {
  for (const name of halves) {
    const half = read(`styles/motion/${name}.json`);
    const style = compose({ brand: 'paper', motion: name });
    for (const k of ['essence', 'nativeMoves', 'pitfalls', 'variation']) assert.deepEqual(style[k], half[k], `${name}.${k}`);
    assert.ok(v.style(style), `${name}: ${JSON.stringify(v.style.errors)}`);
  }
});
