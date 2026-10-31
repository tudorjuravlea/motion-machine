// The pure half of the sound recipes (runtime/kit/synth.js): what a recipe resolves to for one render
// (`plan`), how a sound profile voices it (`applyProfile`), the length ladder and the seed of a name.
// No audio is drawn here; tests/sound/recipes.test.mjs renders and measures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLOOR_T60_S, NATIVE_LUFS, REF_SEND_DB, applyProfile, familyOf, plan, recipeModule, seedOf } from '../../runtime/kit/synth.js';

const profile = (patch = {}) => ({
  name: 'test', register: { maxCentreHz: 5000, minHz: 40, tones: 'sine' }, key: [], modes: 'bar',
  envelope: { attackS: [0.001, 0.003], t60: { input: [0.005, 0.05], surface: [0.06, 0.3], outcome: [0.1, 0.5] } },
  loudness: { cueLufs100ms: -30, tolDb: 1.5, peakDbfs: -13 }, room: { send: -22, predelayS: 0.008, sizeS: 0.25, lowpassHz: 3500 }, stereo: { sideMidDb: -22 }, ...patch,
});
const tone = (f, extra = {}) => ({ kind: 'tone', f, t60: 0.3, attackS: 0.002, ...extra });
const recipe = (layers, extra = {}) => ({ name: 'probe', meaning: 'a probe for the tests', durationS: 0.4, layers, ...extra });

test('the length ladder: input to 0.06 s, surface to 0.3 s, outcome to 0.65 s, then a swell', () => {
  assert.deepEqual([0.02, 0.06, 0.061, 0.3, 0.301, 0.65, 0.651, 1].map(familyOf), ['input', 'input', 'surface', 'surface', 'outcome', 'outcome', 'swell', 'swell']);
});

test('seedOf is a stable number from the name, different per name', () => {
  assert.equal(seedOf('ready'), seedOf('ready'));
  assert.notEqual(seedOf('ready'), seedOf('error'));
  assert.ok(Number.isInteger(seedOf('tap')) && seedOf('tap') >= 0 && seedOf('tap') < 2 ** 32);
});

test('plan: a partial decays in t60 x ratio^-0.75, never faster than 28 ms, and a higher partial dies sooner', () => {
  const p = plan(recipe([tone(1000, { t60: 0.4, partials: [[1, 0], [2.76, -27], [5.4, -36]] })]));
  const v = p.layers[0].voices;
  assert.equal(v[0].t60, 0.4);
  assert.ok(Math.abs(v[1].t60 - 0.4 * 2.76 ** -0.75) < 1e-9);
  assert.ok(Math.abs(v[2].t60 - 0.4 * 5.4 ** -0.75) < 1e-9);
  assert.ok(v[0].t60 > v[1].t60 && v[1].t60 > v[2].t60);
  const short = plan(recipe([tone(1000, { t60: 0.04, partials: [[1, 0], [8, -20]] })])).layers[0].voices;
  assert.equal(short[1].t60, FLOOR_T60_S, 'a 40 ms note lets a high partial last no less than 28 ms');
  const tiny = plan(recipe([tone(1000, { t60: 0.02, partials: [[1, 0], [8, -20]] })])).layers[0].voices;
  assert.equal(tiny[1].t60, 0.02, 'but never longer than the note itself');
  assert.ok(Math.abs(v[1].g - 10 ** (-27 / 20)) < 1e-12 && v[0].f === 1000 && Math.abs(v[2].f - 5400) < 1e-9);
});

test('plan: emphasis ranks decide which layers play (subtle drops the ornament, strong adds one layer)', () => {
  const r = recipe([tone(500), tone(1000, { from: 1 }), tone(1500, { from: 2 })]);
  assert.deepEqual(['subtle', 'normal', 'strong'].map((e) => plan(r, { emphasis: e }).layers.length), [1, 2, 3]);
  const custom = recipe([tone(500), tone(1000, { from: 1 })], { emphasis: { subtle: 1, normal: 1, strong: 1 } });
  assert.deepEqual(['subtle', 'strong'].map((e) => plan(custom, { emphasis: e }).layers.length), [2, 2], 'the recipe may re-rank the names');
  assert.equal(plan(r, { emphasis: 'nonsense' }).layers.length, 2, 'an unknown name plays as normal');
});

test('plan: the same inputs resolve to the same plan, and the seed changes noise and variation only', () => {
  const r = recipe([tone(800), { kind: 'noise', t60: 0.05, filter: { type: 'bandpass', f: 2000, q: 1 } }], { vary: { pitch: 0.03, force: 0.2 } });
  assert.deepEqual(plan(r, { seed: 5 }), plan(r, { seed: 5 }));
  const a = plan(r, { seed: 5 }), b = plan(r, { seed: 6 });
  assert.notDeepEqual(a.layers[1].seed, b.layers[1].seed);
  assert.notEqual(a.layers[0].voices[0].f, b.layers[0].voices[0].f);
  const still = recipe([tone(800)]);
  assert.deepEqual(plan(still, { seed: 5 }).layers[0].voices, plan(still, { seed: 6 }).layers[0].voices, 'a cue with no vary is identical every time');
});

test('plan: pitch and force vary together, inside their bounds, from one draw', () => {
  const r = recipe([tone(1000)], { vary: { pitch: 0.04, force: 0.2 } });
  const rows = Array.from({ length: 200 }, (_, i) => { const p = plan(r, { seed: i * 977 }); return { pitch: p.layers[0].voices[0].f / 1000 - 1, force: p.gain - 1 }; });
  for (const x of rows) {
    assert.ok(Math.abs(x.pitch) <= 0.04 + 1e-9 && Math.abs(x.force) <= 0.2 + 1e-9);
    assert.ok(Math.abs(x.pitch / 0.04 - x.force / 0.2) < 1e-9, 'one draw moves both by the same share of their range');
  }
  assert.ok(Math.max(...rows.map((x) => x.pitch)) > 0.03 && Math.min(...rows.map((x) => x.pitch)) < -0.03, 'and it does use the range');
});

test('applyProfile modes: none strips partials, string snaps them to whole harmonics, bar and mallet leave them', () => {
  const r = recipe([tone(500, { partials: [[1, 0], [2.76, -27], [5.4, -36]] })]);
  assert.deepEqual(applyProfile(r, profile({ modes: 'none' })).recipe.layers[0].partials, [[1, 0]]);
  assert.deepEqual(applyProfile(r, profile({ modes: 'string' })).recipe.layers[0].partials, [[1, 0], [3, -27], [5, -36]]);
  assert.deepEqual(applyProfile(r, profile({ modes: 'bar' })).recipe.layers[0].partials, r.layers[0].partials);
  assert.deepEqual(applyProfile(r, profile({ modes: 'mallet' })).recipe.layers[0].partials, r.layers[0].partials);
});

test('applyProfile register: a fundamental folds by octaves into the range, a partial outside it goes, a band centre is capped', () => {
  const out = (f, p = profile()) => applyProfile(recipe([tone(f, { glideTo: f * 1.5 })]), p).recipe.layers[0];
  assert.equal(out(8000).f, 4000);
  assert.ok(Math.abs(out(8000).glideTo - 6000) < 1e-9, 'a glide keeps its interval');
  assert.equal(out(20).f, 40);
  assert.equal(out(1000).f, 1000);
  const high = applyProfile(recipe([tone(3000, { partials: [[1, 0], [5.4, -30]] })]), profile({ register: { maxCentreHz: 5000, minHz: 40, tones: 'sine' } })).recipe.layers[0];
  assert.deepEqual(high.partials.map((p) => p[0]), [1, 5.4], 'a partial above the centre cap is still a partial: only its fundamental is capped');
  const dropped = applyProfile(recipe([tone(4000, { partials: [[1, 0], [5.4, -30]] })]), profile()).recipe.layers[0];
  assert.deepEqual(dropped.partials.map((p) => p[0]), [1], 'above 18 kHz it goes');
  const band = applyProfile(recipe([{ kind: 'noise', t60: 0.05, glideTo: 12000, filter: { type: 'bandpass', f: 9000, q: 1 } }]), profile()).recipe.layers[0];
  assert.equal(band.filter.f, 5000);
  assert.equal(band.glideTo, 5000);
});

test('applyProfile key: a note more than 20 cents from the key moves to the nearest, one inside it is left (a twin keeps its beat)', () => {
  const p = profile({ key: ['C', 'E', 'G', 'A'] });
  const f = (hz) => applyProfile(recipe([tone(hz)]), p).recipe.layers[0].f;
  assert.ok(Math.abs(f(587.33) - 659.255) < 0.01 || Math.abs(f(587.33) - 523.25) < 0.01, 'D5 is not in this key');
  assert.equal(f(880), 880);
  assert.equal(f(881.6), 881.6, 'a twin 3 cents sharp of A stays sharp');
  assert.ok(Math.abs(f(1000) - 987.77) < 0.01 || Math.abs(f(1000) - 1046.5) < 0.01);
  assert.equal(applyProfile(recipe([tone(587.33)]), profile({ key: [] })).recipe.layers[0].f, 587.33, 'an empty key is no constraint');
});

test('applyProfile envelope: a struck attack is held in range, a swell attack is left, a cue too long for its family shrinks in proportion', () => {
  const p = profile();
  const r = applyProfile(recipe([tone(500, { attackS: 0.0005 }), tone(500, { attackS: 0.3 })], { durationS: 0.28 }), p).recipe;
  assert.equal(r.layers[0].attackS, 0.001);
  assert.equal(r.layers[1].attackS, 0.3);
  const long = recipe([tone(500, { t60: 0.6 }), tone(700, { t60: 0.3, offsetS: 0.1, glideTo: 800, glideS: 0.1 })], { durationS: 0.6 });   // outcome: at most 0.5
  const s = applyProfile(long, p).recipe;
  assert.ok(Math.abs(s.layers[0].t60 - 0.5) < 1e-12 && Math.abs(s.layers[1].t60 - 0.25) < 1e-12);
  assert.ok(Math.abs(s.layers[1].offsetS - 0.1 * (0.5 / 0.6)) < 1e-12 && Math.abs(s.durationS - 0.5) < 1e-12);
  const swell = applyProfile(recipe([tone(500, { t60: 1.2, attackS: 0.3 })], { durationS: 1.5 }), p).recipe;
  assert.equal(swell.layers[0].t60, 1.2, 'a swell has no band');
  const inRange = applyProfile(recipe([tone(500, { t60: 0.3 })], { durationS: 0.4 }), p).recipe;
  assert.equal(inRange.layers[0].t60, 0.3, 'a cue inside its family is not stretched or squeezed');
});

test('applyProfile room and loudness: the profile gives the shape, the recipe keeps its send relative to the reference, the level moves to the profile\'s', () => {
  const r = recipe([tone(500)], { room: { send: -16, predelayS: 0.02, sizeS: 0.9, lowpassHz: 9000 }, masterGain: 0.5 });
  const p = profile({ room: { send: -26, predelayS: 0.006, sizeS: 0.15, lowpassHz: 2800 }, loudness: { cueLufs100ms: -32, tolDb: 1.5, peakDbfs: -13 }, stereo: { sideMidDb: -28 } });
  const { recipe: v, sideMidDb } = applyProfile(r, p);
  assert.deepEqual(v.room, { send: -16 + (-26 - REF_SEND_DB), predelayS: 0.006, sizeS: 0.15, lowpassHz: 2800 });
  assert.ok(Math.abs(v.masterGain - 0.5 * 10 ** ((-32 - NATIVE_LUFS) / 20)) < 1e-12);
  assert.equal(sideMidDb, -28);
  assert.deepEqual(applyProfile(recipe([tone(500)]), p).recipe.room, p.room, 'a recipe with no room takes the profile\'s whole');
  assert.equal(r.room.send, -16, 'the recipe given is not changed');
});

test('applyProfile with no profile is the recipe as written, and recipeModule reports the length it has in a profile', () => {
  const r = recipe([tone(500, { partials: [[1, 0], [2.76, -27]] })]);
  assert.deepEqual(applyProfile(r, null).recipe, r);
  assert.equal(recipeModule(r).durationS, 0.4);
  const long = recipe([tone(500, { t60: 0.6 })], { durationS: 0.6 });
  assert.ok(Math.abs(recipeModule(long, profile()).durationS - 0.5) < 1e-12);
  const m = recipeModule(r);
  assert.equal(m.group, 'sound');
  assert.equal(m.name, 'probe');
  assert.equal(typeof m.render, 'function');
  assert.deepEqual(Object.keys(m.params), ['gain', 'seed', 'emphasis']);
});
