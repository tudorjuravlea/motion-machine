// The sound engine's newer layers (runtime/kit/synth.js, runtime/kit/modes.js, contracts/sound-recipe.schema.json): the
// `pass` and `gated` kinds, envelopes in dB, a gate, a tremolo, a drive, a sweep, a chain of filters, modal tables and a
// doublet beat. Pure Node: no browser. Every older recipe still renders sample for sample as it did before the engine grew.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { loadProfile } from '../../scripts/lib/sound-profile.mjs';
import { applyProfile, layerEndS, plan, renderRecipe, resolveRecipe, scaleRecipeTime } from '../../runtime/kit/synth.js';
import { BEAT_HZ, MODE_TABLES, MODE_SLOPE, decayOf, modePartials } from '../../runtime/kit/modes.js';
import * as M from '../../scripts/lib/audio-measure.mjs';

const SR = 48000;
const { soundRecipe } = validators();
const explain = (v) => (v.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
const hash = (r) => { const h = createHash('sha1'); for (const c of r.channels) h.update(Buffer.from(c.buffer, c.byteOffset, c.byteLength)); return h.digest('hex'); };
const recipe = (layers, extra = {}) => ({ name: 'probe', meaning: 'a probe for the engine tests', durationS: 0.5, layers, ...extra });
const energy = (x, a = 0, b = x.length) => { let e = 0; for (let i = a; i < b; i++) e += x[i] * x[i]; return e; };

test('every shipped recipe made before the engine grew renders sample for sample as it did: bare, in each profile, at each emphasis, for two seeds', () => {
  const stored = JSON.parse(readFileSync(join(ROOT, 'tests/sound/data/recipe-hashes.json'), 'utf8'));
  const profiles = { none: null, glass: loadProfile('glass'), 'soft-ui': loadProfile('soft-ui') };
  let n = 0;
  for (const key of Object.keys(stored)) {
    const [name, pn, emphasis, seed] = key.split('|');
    const recipeFile = join(ROOT, 'patterns/sound', name, 'recipe.json');
    const r = JSON.parse(readFileSync(recipeFile, 'utf8'));
    assert.equal(hash(renderRecipe(r, { sampleRate: SR, emphasis, profile: profiles[pn], ...(seed === 'default' ? {} : { seed: Number(seed) }) })), stored[key], key);
    n++;
  }
  assert.equal(n, 198);
});

test('a pass layer is a whoosh: its loudest moment sits at apexAt of its length, and a seed makes the same samples', () => {
  const pass = (extra = {}) => ({ kind: 'pass', lengthS: 0.5, apexAt: 0.6, ...extra });
  const a = renderRecipe(recipe([pass()], { durationS: 0.5 }), { sampleRate: SR, seed: 3 });
  const b = renderRecipe(recipe([pass()], { durationS: 0.5 }), { sampleRate: SR, seed: 3 });
  const c = renderRecipe(recipe([pass()], { durationS: 0.5 }), { sampleRate: SR, seed: 4 });
  assert.equal(hash(a), hash(b), 'the same seed, the same samples');
  assert.notEqual(hash(a), hash(c), 'another seed, other noise');
  const env = M.envelope(a.channels, SR, 0.02, 0.005).db;
  const top = Math.max(...env);
  const apexS = env.indexOf(top) * 0.005 + 0.01;
  assert.ok(apexS > 0.5 * 0.5 && apexS < 0.7 * 0.5, `the apex is at ${apexS.toFixed(3)} s of 0.5`);
  assert.ok(env.at(-2) < top - 40 || env.length * 0.005 < 0.55, 'and it fades out');
});

test('a pass layer: riseK shapes the rise, fallK the fall, doppler glides the bands, low and sub and hiss are optional', () => {
  const at = (extra) => { const r = renderRecipe(recipe([{ kind: 'pass', lengthS: 0.6, apexAt: 0.5, ...extra }]), { sampleRate: SR, seed: 1 }); return M.measure(r.channels, SR); };
  const plain = at({}), withSub = at({ sub: { db: -3, f: 50 } }), withHiss = at({ hiss: { db: -6 } }), withLow = at({ low: { db: -3 } });
  assert.ok(withSub.centroidHz < plain.centroidHz, 'a sub under the pass lowers its centre of sound');
  assert.ok(withHiss.centroidHz > plain.centroidHz, 'a hiss on top raises it');
  assert.ok(withLow.centroidHz < plain.centroidHz, 'a low band lowers it');
  const flat = at({ riseK: 1.6 }), pointed = at({ riseK: 0.5 });
  assert.notEqual(flat.lufsIntegrated, pointed.lufsIntegrated, 'the rise exponent changes the pass');
  const up = (extra) => { const r = renderRecipe(recipe([{ kind: 'pass', lengthS: 0.6, apexAt: 0.5, ...extra }]), { sampleRate: SR, seed: 1 }); return r.channels; };
  assert.notEqual(hash({ channels: up({}) }), hash({ channels: up({ doppler: 8 }) }), 'doppler moves the bands');
});

test('a gated layer is a pulse train whose period shrinks and which ends open: more pulses late than early, the last sample sounds', () => {
  const r = renderRecipe(recipe([{ kind: 'gated', lengthS: 0.4, periodS: [0.04, 0.02], filter: { type: 'bandpass', f: 3000, q: 1 }, depth: 1, openS: 0.01 }], { durationS: 0.4 }), { sampleRate: SR, seed: 2 });
  const m = r.channels[0].map((x, i) => (x + r.channels[1][i]) / 2);
  const crossings = (a, b) => { let n = 0, on = false; for (let i = Math.floor(a * SR); i < Math.floor(b * SR); i++) { const hot = Math.abs(m[i]) > 0.02; if (hot && !on) n++; on = hot; } return n; };
  const early = crossings(0.02, 0.16), late = crossings(0.22, 0.36);
  assert.ok(late > early, `${late} pulse starts late against ${early} early`);
  const end = Math.round(0.4 * SR);
  assert.ok(energy(m, end - 0.01 * SR, end - 0.002 * SR) > 0, 'the train ends open, on its peak');
  assert.equal(hash(r), hash(renderRecipe(recipe([{ kind: 'gated', lengthS: 0.4, periodS: [0.04, 0.02], filter: { type: 'bandpass', f: 3000, q: 1 }, depth: 1, openS: 0.01 }], { durationS: 0.4 }), { sampleRate: SR, seed: 2 })));
});

test('envelope breakpoints in dB replace attack and t60; a gate ends a layer hard or drops it in a step; a tremolo moves the level; a drive adds harmonics; a sweep moves a band', () => {
  const e = renderRecipe(recipe([{ kind: 'noise', envelope: [[0, -60], [0.01, 0], [0.05, -20], [0.1, -60]], filter: { type: 'none' } }], { durationS: 0.12 }), { sampleRate: SR, seed: 1 });
  const env = M.envelope(e.channels, SR, 0.004, 0.002).db;
  assert.ok(Math.abs(env.indexOf(Math.max(...env)) * 0.002 - 0.01) < 0.01, 'peaks where the breakpoint says');
  assert.ok(e.length < 0.2 * SR);
  const hard = renderRecipe(recipe([{ kind: 'tone', f: 440, attackS: 0.002, t60: 0.5, gate: { atS: 0.05 } }], { durationS: 0.5 }), { sampleRate: SR });
  assert.equal(energy(hard.channels[0], Math.round(0.06 * SR)), 0, 'a hard gate leaves nothing after it');
  assert.ok(hard.length < 0.1 * SR, 'and ends the layer');
  const step = renderRecipe(recipe([{ kind: 'tone', f: 440, attackS: 0.002, t60: 2, peak: 1, gate: { atS: 0.05, dropDb: 20 } }], { durationS: 1 }), { sampleRate: SR });
  const before = Math.sqrt(energy(step.channels[0], Math.round(0.03 * SR), Math.round(0.045 * SR)) / (0.015 * SR)), after = Math.sqrt(energy(step.channels[0], Math.round(0.07 * SR), Math.round(0.085 * SR)) / (0.015 * SR));
  assert.ok(Math.abs(20 * Math.log10(before / after) - 20) < 3, `the step drops ${(20 * Math.log10(before / after)).toFixed(1)} dB`);
  const trem = renderRecipe(recipe([{ kind: 'tone', f: 440, attackS: 0.002, t60: 2, tremolo: { hz: 10, depthDb: 20 } }], { durationS: 1 }), { sampleRate: SR });
  const tenv = Array.from(M.envelope(trem.channels, SR, 0.01, 0.01).db).slice(5, 60), range = Math.max(...tenv) - Math.min(...tenv);
  assert.ok(range > 10, `the tremolo swings the level ${range.toFixed(1)} dB`);
  const clean = M.spectrum(renderRecipe(recipe([{ kind: 'tone', f: 500, attackS: 0.002, t60: 0.3 }]), { sampleRate: SR }).channels, SR);
  const driven = M.spectrum(renderRecipe(recipe([{ kind: 'tone', f: 500, attackS: 0.002, t60: 0.3, drive: 2 }]), { sampleRate: SR }).channels, SR);
  assert.ok(M.centroidHz(driven) > M.centroidHz(clean) * 1.2,'soft saturation brings upper harmonics');
  const sw = renderRecipe(recipe([{ kind: 'noise', attackS: 0.001, t60: 0.4, filter: { type: 'bandpass', f: 500, q: 8 }, sweep: [[0, 500], [0.3, 4000]] }], { durationS: 0.4 }), { sampleRate: SR, seed: 5 });
  const first = M.centroidHz(M.spectrum([sw.channels[0].subarray(0, 0.08 * SR), sw.channels[1].subarray(0, 0.08 * SR)], SR)), last = M.centroidHz(M.spectrum([sw.channels[0].subarray(0.22 * SR, 0.3 * SR), sw.channels[1].subarray(0.22 * SR, 0.3 * SR)], SR));
  assert.ok(last > first * 2, `the band moves up: ${Math.round(first)} Hz, then ${Math.round(last)} Hz`);
});

test('a chain of filters shapes a layer: a three-stage high-pass leaves almost nothing under its corner', () => {
  const r = renderRecipe(recipe([{ kind: 'noise', attackS: 0.001, t60: 0.1, filter: { type: 'none' }, chain: [{ type: 'highpass', f: 3400, stages: 3 }] }]), { sampleRate: SR, seed: 9 });
  const sp = M.spectrum(r.channels, SR);
  let low = 0, all = 0;
  for (let k = 1; k < sp.p.length; k++) { all += sp.p[k]; if (sp.f[k] < 2000) low += sp.p[k]; }
  assert.ok(low / all < 0.02, `${((low / all) * 100).toFixed(2)} % of the power under 2 kHz`);
});

test('modal tables: a mode decays in decay x ratio^-slope, a doublet beats about 1 Hz, bells bars and materials are all there', () => {
  assert.equal(MODE_SLOPE, 0.75);
  assert.equal(BEAT_HZ, 1);
  assert.deepEqual(MODE_TABLES.tubular.ratios.slice(0, 4), [1, 2.756, 5.404, 8.933]);
  assert.deepEqual(MODE_TABLES.marimba.ratios, [1, 3.92, 9.8]);
  for (const name of ['tubular', 'glass', 'bowl', 'glock', 'celesta', 'marimba', 'tine', 'block', 'shell', 'tok', 'desk']) assert.ok(MODE_TABLES[name], name);
  assert.ok(Math.abs(decayOf(1, 4, 0.75) - 4 ** -0.75) < 1e-12);
  assert.equal(decayOf(1, 0.5), 1, 'a mode under the fundamental keeps its decay');
  const p = modePartials('marimba');
  assert.equal(p[0][0], 1);
  assert.equal(Math.max(...p.map((x) => x[1])), 0, 'the loudest mode is 0 dB');
  assert.throws(() => modePartials('wood'), /unknown modes/);
  const r = recipe([{ kind: 'tone', f: 600, attackS: 0.002, t60: 0.4, modes: 'tubular', slope: 0.5, beatHz: 1 }]);
  const voices = plan(r).layers[0].voices;
  assert.equal(voices.length, 5);
  assert.ok(Math.abs(voices[1].t60 - 0.4 * 2.756 ** -0.5) < 1e-9, 'the slope is the layer\'s own');
  assert.ok(voices.every((v) => v.beat > 0.3 * 0.4 && v.beat < 2), 'every mode is a doublet beating near 1 Hz');
  assert.equal(JSON.stringify(plan(r)), JSON.stringify(plan(r)), 'and the beats are seeded, not random');
  const mat = plan(recipe([{ kind: 'tone', f: 600, attackS: 0.001, t60: 0.1, modes: 'block' }])).layers[0].voices;
  assert.ok(mat[1].t60 < mat[0].t60 * 0.6, 'a material mode carries its own decay multiplier');
  const soft = applyProfile(r, loadProfile('soft-ui')).recipe.layers[0];
  assert.deepEqual(soft.partials, [[1, 0]], 'a profile with modes none strips the table');
  const doublet = renderRecipe(recipe([{ kind: 'tone', f: 600, attackS: 0.001, t60: 1, beatHz: 4 }]), { sampleRate: SR });
  const ev = Array.from(M.envelope(doublet.channels, SR, 0.02, 0.02).db).slice(1, 24), swing = Math.max(...ev) - Math.min(...ev);
  assert.ok(swing > 6, `the doublet beats: ${swing.toFixed(1)} dB of swing`);
});

test('a recipe with variants resolves one of them; the base is the default; an unknown name is refused', () => {
  const r = recipe([{ kind: 'tone', f: 440, attackS: 0.002, t60: 0.4 }], { durationS: 0.42, variants: { short: { durationS: 0.2, layers: { 0: { t60: 0.15 } } }, long: { durationS: 0.9, layers: { 0: { t60: 0.8 } } } }, variant: 'medium' });
  assert.equal(resolveRecipe(r, {}).durationS, 0.42);
  assert.equal(resolveRecipe(r, { variant: 'short' }).layers[0].t60, 0.15);
  assert.equal(resolveRecipe(r, { variant: 'long' }).durationS, 0.9);
  assert.throws(() => resolveRecipe(r, { variant: 'huge' }), /unknown variant "huge"/);
  assert.equal(r.layers[0].t60, 0.4, 'the recipe given is not changed');
});

test('key moves the layers marked keyed by the shortest interval; step raises every tone by semitones', () => {
  const r = recipe([{ kind: 'tone', f: 261.63, attackS: 0.002, t60: 0.4, keyed: true }, { kind: 'tone', f: 100, attackS: 0.002, t60: 0.4 }], { key: 'C' });
  const g = resolveRecipe(r, { key: 'G' }).layers;
  assert.ok(Math.abs(g[0].f / 261.63 - 2 ** (-5 / 12)) < 1e-9, 'G is five semitones down from C, the shortest way');
  assert.equal(g[1].f, 100, 'a layer not marked keyed stays');
  assert.ok(Math.abs(resolveRecipe(r, { key: 'F#' }).layers[0].f / 261.63 - 2 ** (6 / 12)) < 1e-9 || Math.abs(resolveRecipe(r, { key: 'F#' }).layers[0].f / 261.63 - 2 ** (-6 / 12)) < 1e-9);
  assert.throws(() => resolveRecipe(r, { key: 'H' }), /unknown key/);
  const up = plan(r, { step: 3 }).layers;
  assert.ok(Math.abs(up[0].voices[0].f / 261.63 - 2 ** (3 / 12)) < 1e-9 && Math.abs(up[1].voices[0].f / 100 - 2 ** (3 / 12)) < 1e-9);
});

test('a profile holds the newer layers in its register: a pass keeps its bands under the cap, a long layer shrinks, the times scale together', () => {
  const soft = loadProfile('soft-ui');
  const r = recipe([{ kind: 'pass', lengthS: 0.6, f: 3000, sub: { f: 30 } }, { kind: 'tone', f: 300, envelope: [[0, -60], [0.02, 0], [0.6, -60]], gate: { atS: 0.4, dropDb: 12 }, sweep: [[0, 300], [0.6, 200]] }], { durationS: 0.62 });
  const v = applyProfile(r, soft).recipe;
  assert.ok(v.layers[0].f <= soft.register.maxCentreHz / 2.5 + 1e-9);
  assert.ok(v.layers[0].sub.f >= soft.register.minHz);
  assert.ok(v.durationS < 0.4 && v.layers[0].lengthS < 0.4, 'outcome ceiling 0.35 s');
  assert.ok(Math.abs(v.layers[1].gate.atS / 0.4 - v.layers[1].envelope[2][0] / 0.6) < 1e-9, 'the gate and the envelope shrink by the same factor');
  assert.equal(scaleRecipeTime(r, 2).layers[0].lengthS, 1.2);
});

test('the recipe schema accepts every shipped recipe and the new fields, and refuses a malformed one', () => {
  const dir = join(ROOT, 'patterns/sound');
  for (const n of readdirSync(dir)) if (existsSync(join(dir, n, 'recipe.json'))) assert.ok(soundRecipe(JSON.parse(readFileSync(join(dir, n, 'recipe.json'), 'utf8'))), `${n}: ${explain(soundRecipe)}`);
  const ok = (layers, extra = {}) => soundRecipe({ name: 'probe', meaning: 'a probe for the tests', durationS: 0.5, layers, ...extra });
  assert.ok(ok([{ kind: 'pass', lengthS: 0.5, apexAt: 0.6, riseK: 0.7, fallK: 1.4, doppler: 3, low: { db: -6 }, sub: { f: 50, drive: 0.5 }, hiss: { db: -20 } }]), explain(soundRecipe));
  assert.ok(ok([{ kind: 'gated', lengthS: 0.4, periodS: [0.024, 0.02], filter: { type: 'bandpass', f: 4000 } }]), explain(soundRecipe));
  assert.ok(ok([{ kind: 'tone', f: 440, envelope: [[0, -60], [0.1, 0], [0.4, -60]], gate: { atS: 0.2, dropDb: 20 }, tremolo: { hz: 20, depthDb: 6 }, drive: 1, sweep: [[0, 400], [0.4, 300]], chain: [{ type: 'peaking', f: 3000, db: -3 }], modes: 'glass', slope: 0.6, beatHz: 1, keyed: true }]), explain(soundRecipe));
  assert.equal(ok([{ kind: 'pass' }]), false, 'a pass needs its length');
  assert.equal(ok([{ kind: 'gated', lengthS: 0.4 }]), false, 'a gated layer needs its period');
  assert.equal(ok([{ kind: 'noise' }]), false, 'a noise layer needs a t60 or an envelope');
  assert.equal(ok([{ kind: 'tone', f: 440, t60: 0.3, envelope: [[0, -10]] }]), false, 'an envelope has two points at least');
  assert.equal(ok([{ kind: 'tone', f: 440, t60: 0.3, gate: { dropDb: 20 } }]), false, 'a gate says where');
  assert.equal(ok([{ kind: 'tone', f: 440, t60: 0.3, modes: 'wood' }]), false, 'an unknown table');
  assert.equal(ok([{ kind: 'tone', f: 440, t60: 0.3, tremolo: { hz: 5 } }]), false, 'a tremolo has a depth');
  assert.equal(ok([{ kind: 'tone', f: 440, t60: 0.3, chain: [{ type: 'comb', f: 100 }] }]), false);
  assert.equal(ok([{ kind: 'pass', lengthS: 0.5, apexAt: 2 }]), false, 'the apex is inside the pass');
  assert.equal(ok([{ kind: 'pass', lengthS: 0.5, colour: 'red' }]), false, 'no stray fields');
  assert.equal(ok([{ kind: 'tone', f: 440, t60: 0.3 }], { durationS: 5 }), false, 'a cue is at most 4.5 s');
  assert.equal(ok([{ kind: 'tone', f: 440, t60: 0.3 }], { variants: { loud: { layers: { x: {} } } } }), false, 'a variant edits layers by index');
  assert.ok(ok([{ kind: 'tone', f: 440, t60: 0.3 }], { variants: { loud: { durationS: 0.4, layers: { 0: { peak: 2 } } } }, variant: 'quiet', knobs: ['variant', 'durS'], key: 'G', finish: { highpassHz: 200, dip: { f: 3200, db: -3 }, drive: 0.4, gate: { atS: 0.4 } } }), explain(soundRecipe));
});

test('layerEndS reads every kind', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);
  near(layerEndS({ kind: 'tone', f: 1, attackS: 0.01, t60: 0.2, offsetS: 0.1 }), 0.31);
  near(layerEndS({ kind: 'pass', lengthS: 0.5, offsetS: 0.1 }), 0.6);
  near(layerEndS({ kind: 'noise', envelope: [[0, -60], [0.3, 0]], offsetS: 0 }), 0.3);
  near(layerEndS({ kind: 'tone', f: 1, t60: 1, gate: { atS: 0.2 } }), 0.204);
});

test('a profile lifts a pass layer\'s sub only until it clears the floor, and shortens the sink to keep it there', () => {
  const r = { name: 't', durationS: 1.2, layers: [{ kind: 'pass', lengthS: 1.15, apexAt: 0.65, f: 300, sub: { db: -8, f: 50, glideOct: 0.6 } }] };
  const { recipe } = applyProfile(r, loadProfile('soft-ui'));
  const sub = recipe.layers[0].sub;
  assert.ok(sub.f <= 100, `a sub stays a sub: ${sub.f} Hz`);
  assert.ok(sub.f * 2 ** -sub.glideOct >= 70 - 1e-9, 'its lowest point stays over the floor');
});
