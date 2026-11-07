// Looks a brand can wear: three motion halves (grid, stop-motion, proof), two finish strengths
// (misregister, paper) and three look presets (spot-mono, print-plates, blueprint). The look supplies
// motion personality and surface character; the brand keeps its palette roles and faces. Each motion
// half composes with every shipped brand, and each look preset is what compose writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { compose } from '../../scripts/compose.mjs';
import { spring } from '../../runtime/kit/springs.js';
import { parseEasing } from '../../runtime/kit/ease.js';

const v = validators();
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const motionOf = (name) => read(`styles/motion/${name}.json`);
const BRANDS = ['linen', 'nocturne', 'paper', 'signal'];
const LOOKS = ['grid', 'stop-motion', 'proof'];
const withHold = (h) => { const m = motionOf('calm'); return { ...m, motion: { ...m.motion, frameHold: h } }; };
const springs = (m) => Object.values(m.motion.spring);
const easings = (m) => Object.values(m.motion.easings);
const refs = (m) => [...Object.values(m.entrances), ...Object.entries(m.transitions).filter(([k]) => k !== 'policy').map(([, r]) => r)];
// sRGB hex → CIE L*a*b* chroma, enough to tell a neutral role from a saturated one
function chroma(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [lin(n >> 16), lin((n >> 8) & 255), lin(n & 255)];
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return Math.hypot(500 * (X - Y), 200 * (Y - Z));
}
const luminance = (hex) => { const n = parseInt(hex.slice(1, 7), 16); const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };

test('frameHold 3 animates on a 10 fps grid; 4 and fractions stay refused', () => {
  assert.ok(v.motion(withHold(3)), JSON.stringify(v.motion.errors));
  for (const h of [0, 4, 1.5]) assert.equal(v.motion(withHold(h)), false, `frameHold ${h}`);
});

test('the three look motion halves validate, name patterns that exist, and compose with every shipped brand', () => {
  for (const look of LOOKS) {
    const m = motionOf(look);
    assert.equal(m.name, look);
    assert.ok(v.motion(m), `${look}: ${JSON.stringify(v.motion.errors)}`);
    for (const r of refs(m)) assert.ok(existsSync(join(ROOT, 'patterns', r, 'PATTERN.md')), `${look}: ${r} is a shipped pattern`);
    for (const b of BRANDS) assert.ok(v.style(compose({ brand: b, motion: look })), `${b} x ${look}: ${JSON.stringify(v.style.errors)}`);
    for (const s of springs(m)) assert.ok(spring.overshoot(s) <= m.motion.overshootMax + 1e-9, `${look}: a spring overshoots past overshootMax`);
    for (const e of easings(m)) assert.ok(parseEasing(e).maxUpTo(1) <= 1 + m.motion.overshootMax + 1e-9, `${look}: ${e} overshoots past overshootMax`);
  }
});

test('grid: one hard ease for every move, no overshoot, durations as note values of its tempo', () => {
  const m = motionOf('grid');
  assert.equal(new Set(easings(m)).size, 1, 'one easing for enter, exit and move');
  assert.match(m.motion.easings.enter, /^cubic-bezier\(0\.7, 0, 0\.2, 1\)$/);
  assert.equal(m.motion.overshootMax, 0);
  for (const s of springs(m)) assert.equal(spring.overshoot(s), 0, 'critically damped');
  const beatMs = 60000 / m.sound.bpm;
  const { quick, standard, slow, hold } = m.motion.durations;
  assert.deepEqual([quick, standard, slow, hold].map((d) => d / beatMs), [0.25, 0.5, 1, 4], 'a sixteenth, an eighth, a beat and a bar');
  assert.ok(!Object.values(m.transitions).some((r) => /crossfade|blur|dip/.test(r)), 'cuts and wipes, never a crossfade');
  assert.equal(m.motion.frameHold ?? 1, 1, 'arrivals land on the beat, smoothly');
});

test('stop-motion: on threes, durations on its 10 fps grid, and a hold after each landing', () => {
  const m = motionOf('stop-motion');
  assert.equal(m.motion.frameHold, 3);
  for (const d of Object.values(m.motion.durations)) assert.equal(d % 100, 0, `${d} ms is a whole number of 10 fps steps`);
  assert.ok(m.pacing.holdMinS >= 0.8 && m.pacing.holdMinS <= 1.2);
  assert.equal(m.entrances.plate, 'entrances/drop');
  assert.equal(m.transitions.topic, 'transitions/flip');
});

// proof is short-form evidence (a claim, a figure, a quote) cut hard: its numbers come from the two
// halves the repo already ships. Entrances take kinetic's snap (its enter and exit easings, its quick
// and slow, its standard rounded to whole frames); the camera and the travel take calm's stillness;
// nothing bounces, since a bouncing proof reads as play; holds and tempo sit between the two.
test('proof: kinetic entrances, calm stillness, no bounce, every cut hard', () => {
  const m = motionOf('proof'), kinetic = motionOf('kinetic'), calm = motionOf('calm');
  assert.equal(m.motion.easings.enter, kinetic.motion.easings.enter, 'enters with kinetic\'s snap');
  assert.equal(m.motion.easings.exit, kinetic.motion.easings.exit);
  assert.equal(m.motion.easings.move, calm.motion.easings.move, 'the camera moves as calm does');
  assert.equal(m.motion.durations.quick, kinetic.motion.durations.quick);
  assert.equal(m.motion.durations.slow, kinetic.motion.durations.slow);
  assert.equal((m.motion.durations.standard * 30) % 1000, 0, 'the standard entrance is a whole number of frames at 30 fps');
  assert.ok(m.motion.durations.standard >= kinetic.motion.durations.standard && m.motion.durations.standard < calm.motion.durations.standard);
  assert.equal(m.motion.travel, calm.motion.travel, 'short travel keeps the frame still');
  assert.equal(m.motion.overshootMax, 0, 'nothing bounces');
  for (const sp of springs(m)) assert.ok(sp.c / (2 * Math.sqrt(sp.k * sp.m)) >= 1, 'critically damped or more');
  for (const k of ['opening', 'topic', 'related', 'climax', 'outro']) assert.equal(m.transitions[k], 'transitions/hard-cut', k);
  assert.ok(m.pacing.holdMinS > kinetic.pacing.holdMinS && m.pacing.holdMinS < calm.pacing.holdMinS, 'a proof holds long enough to be read');
  assert.ok(m.pacing.arrivalsPer10s[0] > calm.pacing.arrivalsPer10s[0] && m.pacing.arrivalsPer10s[1] < kinetic.pacing.arrivalsPer10s[1], 'denser than calm, sparser than kinetic');
  assert.equal(m.entrances.figure, 'entrances/count', 'a figure counts up: evidence arriving');
});

test('a finish may misregister its plates and lay a static paper fibre; both are strengths 0..1', () => {
  const paper = read('styles/brands/paper.json');
  assert.ok(v.brand({ ...paper, finish: { misregister: 0.6, paper: 0.8 } }), JSON.stringify(v.brand.errors));
  assert.equal(v.brand({ ...paper, finish: { misregister: 1.2 } }), false);
  assert.equal(v.brand({ ...paper, finish: { paper: -0.1 } }), false);
});

test('the three look presets are fictional compositions of a look brand and a look motion', () => {
  const want = { 'spot-mono': 'proof', 'print-plates': 'stop-motion', blueprint: 'grid' };
  for (const [name, motion] of Object.entries(want)) {
    const p = read(`styles/presets/${name}.json`);
    assert.equal(p.name, name);
    assert.equal(p.fictional, true);
    assert.equal(p.from.motion, `styles/motion/${motion}.json`);
    assert.equal(read(p.from.brand).fictional, true, `${name}: its brand half is fictional`);
    assert.ok(v.style(p), `${name}: ${JSON.stringify(v.style.errors)}`);
    assert.deepEqual(p, compose({ brand: join(ROOT, p.from.brand), motion: join(ROOT, p.from.motion), name }), `${name} is what compose writes`);
  }
});

test('spot-mono: a neutral system and one saturated accent, which may land on the subject (a figure in the accent)', () => {
  const p = read('styles/presets/spot-mono.json');
  for (const role of ['canvas', 'ink', 'muted', 'surface', 'line']) assert.ok(chroma(p.color[role]) < 6, `${role} ${p.color[role]} is neutral`);
  assert.ok(chroma(p.color.accent) > 50, 'the accent is the one saturated colour');
  assert.equal(p.composition.accentText, true, 'the spot lands on the subject, not only on decoration');
});

test('print-plates: plates off register on paper that does not shimmer, printed on threes', () => {
  const p = read('styles/presets/print-plates.json');
  assert.ok(p.finish.misregister > 0 && p.finish.paper > 0, JSON.stringify(p.finish));
  const lightest = Object.entries(p.color).filter(([k]) => k !== 'surfaceInk').sort((a, b) => luminance(b[1]) - luminance(a[1]));
  assert.ok(['canvas', 'surface'].includes(lightest[0][0]) && luminance(p.color.canvas) > 0.7, 'printed on light stock');
  assert.equal(p.motion.frameHold, 3);
});

test('blueprint: pale line work on a deep field, the accent the only warm colour', () => {
  const p = read('styles/presets/blueprint.json');
  assert.ok(luminance(p.color.canvas) < 0.08 && chroma(p.color.canvas) > 20, 'a deep coloured field');
  assert.ok(luminance(p.color.ink) > 0.7, 'pale lines');
  const warm = (hex) => { const n = parseInt(hex.slice(1, 7), 16); return (n >> 16) > (n & 255) + 40; };
  assert.deepEqual(Object.entries(p.color).filter(([, h]) => warm(h)).map(([k]) => k), ['accent']);
  assert.equal(p.from.motion, 'styles/motion/grid.json');
});

