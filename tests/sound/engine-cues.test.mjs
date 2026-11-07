// The eleven cues the engine's newer layers make (patterns/sound/<name>/recipe.json): whoosh, downlifter, pop-in, key, counter,
// ding, click, sub-drop, cut-hit, sting. Each is measured against what its card says, and held to the shipped profiles'
// bands (W-PALETTE's own measure) or listed here with the reason it cannot be.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { loadProfile } from '../../scripts/lib/sound-profile.mjs';
import { judgeCue, misses, powerUnder } from '../../scripts/lib/sound-palette.mjs';
import { CUE_ROLE, roleOf } from '../../scripts/lib/sound-roles.mjs';
import { variantsOf } from '../../scripts/sound-listen.mjs';
import { cueDurationS, layerEndS, plan, recipeModule, renderRecipe, resolveRecipe } from '../../runtime/kit/synth.js';
import { measureCue } from '../../runtime/kit/aim.js';
import { openRenderer } from '../../scripts/lib/cue-render.mjs';
import { buildSound } from '../../scripts/sound.mjs';
import { ensurePiece, variant as pieceVariant, withPicture } from '../../fixtures/sound/setup.mjs';
import * as M from '../../scripts/lib/audio-measure.mjs';

const SR = 48000;
const NEW = ['whoosh', 'downlifter', 'pop-in', 'key', 'counter', 'ding', 'click', 'sub-drop', 'cut-hit', 'sting'];
const recipe = (n) => JSON.parse(readFileSync(join(ROOT, 'patterns/sound', n, 'recipe.json'), 'utf8'));
const R = Object.fromEntries(NEW.map((n) => [n, recipe(n)]));
const profiles = { glass: loadProfile('glass'), 'soft-ui': loadProfile('soft-ui') };
const hash = (r) => { const h = createHash('sha1'); for (const c of r.channels) h.update(Buffer.from(c.buffer, c.byteOffset, c.byteLength)); return h.digest('hex'); };
const versions = (n) => variantsOf(R[n]).map((v) => (v ? { variant: v } : {}));
const render = (n, o = {}) => renderRecipe(R[n], { sampleRate: SR, ...o });

// What a profile may say about a cue and why. A cue not here passes both profiles at every emphasis and version.
const MAY_MISS = {
  key: { glass: ['register', 'level', 'peak'], 'soft-ui': ['register', 'level'] },        // high-passed noise at 3-12 kHz is the cue; a profile that keeps every centre under 5 kHz (2.5 kHz) cannot hold it, and a 5 ms burst at the matched loudness peaks over -13 dBFS
  'sub-drop': { 'soft-ui': ['level'] },                                                   // soft-ui lifts the sub an octave (its floor is 70 Hz) and K-weighting hears it 2 dB louder
};

let renderer;
before(async () => { await ensurePiece(); renderer = await openRenderer(); });
after(async () => { await renderer?.close(); });

test('all ten are recipes that validate, named for their folder, with a role where the placement lot reads one', () => {
  const { soundRecipe } = validators();
  for (const n of NEW) {
    assert.ok(soundRecipe(R[n]), `${n}: ${JSON.stringify(soundRecipe.errors)}`);
    assert.equal(R[n].name, n);
    assert.ok(existsSync(join(ROOT, 'patterns/sound', n, 'PATTERN.md')) && existsSync(join(ROOT, 'patterns/sound', n, 'demo/cue.json')), `${n}: card and demo`);
    assert.ok(R[n].masterGain > 0 && R[n].masterGain !== 1, `${n}: calibrated`);
  }
  for (const n of ['whoosh', 'pop-in', 'key', 'counter', 'click', 'sub-drop', 'cut-hit', 'sting']) assert.ok(CUE_ROLE[n], `${n} has a role`);
  assert.equal(roleOf('whoosh').anchor, 'apex');
});

test('a recipe lasts as long as it says, in every version: durationS covers the layers that play', () => {
  for (const n of NEW) for (const o of versions(n)) {
    const r = resolveRecipe(R[n], o);
    const end = Math.max(...r.layers.filter((l) => (l.peak ?? 1) > 0).map(layerEndS));
    assert.ok(r.durationS >= end - 0.011 && r.durationS <= end + 0.06, `${n} ${JSON.stringify(o)}: ${r.durationS} s against ${end.toFixed(3)} s of layers`);
  }
});

test('every cue sounds the same twice and differently for another seed (the ones that vary or hold noise)', () => {
  for (const n of NEW) {
    assert.equal(hash(render(n, { seed: 5 })), hash(render(n, { seed: 5 })), n);
    if (R[n].vary || R[n].layers.some((l) => l.kind === 'noise' || l.kind === 'pass' || l.kind === 'gated')) assert.notEqual(hash(render(n, { seed: 5 })), hash(render(n, { seed: 6 })), n);
  }
});

test('every cue sits on the profile\'s level band and passes W-PALETTE\'s measure under both shipped profiles, or the table says why not', () => {
  for (const n of NEW) for (const o of versions(n)) for (const [pn, profile] of Object.entries(profiles)) for (const emphasis of ['subtle', 'normal', 'strong']) {
    const { channels } = render(n, { emphasis, profile, ...o });
    const j = judgeCue(channels, SR, profile, { durationS: cueDurationS(R[n], profile, o), emphasis });
    const allowed = MAY_MISS[n]?.[pn] ?? [];
    const bad = misses(j).filter((c) => !allowed.includes(c.check));
    assert.deepEqual(bad.map((c) => `${c.check}: ${c.message}`), [], `${n} ${JSON.stringify(o)} (${emphasis}) under ${pn}`);
  }
  const key = render('key', { profile: profiles.glass });
  assert.ok(misses(judgeCue(key.channels, SR, profiles.glass, { durationS: 0.075 })).some((c) => c.check === 'register'), 'the table for key is honest: it does miss the register');
});

test('each cue has its arrangements: subtle drops an ornament, strong adds a layer (the whoosh is one gesture and has one)', () => {
  for (const n of NEW.filter((x) => x !== 'whoosh')) {
    const r = resolveRecipe(R[n], {});
    const count = (e) => plan(r, { emphasis: e }).layers.length;
    assert.ok(count('subtle') >= 1 && count('subtle') < count('strong'), `${n}: subtle ${count('subtle')}, normal ${count('normal')}, strong ${count('strong')}`);
  }
});

test('whoosh: the apex of the pass sits at 50 to 70 % of its length in all three versions; short 0.18 s, medium 0.48 s, long 1.15 s', () => {
  const len = { short: 0.18, medium: 0.48, long: 1.15 };
  for (const [v, want] of Object.entries(len)) {
    const r = resolveRecipe(R.whoosh, { variant: v });
    assert.equal(r.layers[0].lengthS, want);
    assert.ok(r.layers[0].apexAt >= 0.5 && r.layers[0].apexAt <= 0.7, `${v}: apexAt ${r.layers[0].apexAt}`);
    const m = measureCue(R.whoosh, { variant: v });
    assert.ok(m.apexS / m.durS >= 0.5 && m.apexS / m.durS <= 0.7, `${v}: the loudest 5 ms is at ${((100 * m.apexS) / m.durS).toFixed(1)} % of ${m.durS.toFixed(3)} s`);
  }
  assert.deepEqual(recipeModule(R.whoosh).params.variant.values.sort(), ['long', 'medium', 'short']);
  assert.equal(recipeModule(R.whoosh).params.variant.default, 'medium');
});

test('downlifter: it falls, in pitch and in the centre of its sound, and it lets go of the hit it follows', () => {
  const { channels } = render('downlifter');
  const cut = (a, b) => channels.map((c) => c.subarray(Math.round(a * SR), Math.round(b * SR)));
  const early = M.centroidHz(M.spectrum(cut(0.1, 0.4), SR)), late = M.centroidHz(M.spectrum(cut(1, 1.4), SR));
  assert.ok(late < early / 2, `${Math.round(early)} Hz early, ${Math.round(late)} Hz late`);
  const m = measureCue(R.downlifter);
  assert.ok(m.apexS < 0.2, 'the push comes first');
});

test('pop-in: a thump at 80 to 150 Hz with a tick 30 to 40 dB under it, 0.14 to 0.27 s, in each version', () => {
  for (const o of versions('pop-in')) {
    const m = measureCue(R['pop-in'], o);
    assert.ok(m.durS >= 0.14 && m.durS <= 0.27, `${JSON.stringify(o)}: ${m.durS.toFixed(3)} s`);
    assert.ok(m.pitchHz >= 80 && m.pitchHz <= 150, `${JSON.stringify(o)}: thump at ${m.pitchHz.toFixed(0)} Hz`);
  }
  const r = resolveRecipe(R['pop-in'], {});
  const tick = r.layers.find((l) => l.kind === 'noise'), body = r.layers[0];
  const db = 20 * Math.log10((tick.peak ?? 1) / (body.peak ?? 1));
  assert.ok(db <= -30 && db >= -40, `the tick is ${db.toFixed(1)} dB under the thump`);
  const { channels } = render('pop-in');
  const hi = powerUnder(channels, SR, 1000), lo = powerUnder(channels, SR, 150);
  assert.ok(lo > 0.9 && hi > 0.99, 'nearly all of it is under 150 Hz');
});

test('key: noise at 3 to 12 kHz with under 2 % of its power under 2 kHz, and each stroke is its own (seeded variation)', () => {
  const { channels } = render('key');
  assert.ok(powerUnder(channels, SR, 2000) < 0.02, `${(100 * powerUnder(channels, SR, 2000)).toFixed(3)} % under 2 kHz`);
  const sp = M.spectrum(channels, SR);
  assert.ok(M.centroidHz(sp) > 5000 && M.centroidHz(sp) < 12000);
  const strokes = [1, 2, 3, 4].map((i) => hash(render('key', { seed: i * 101 })));
  assert.equal(new Set(strokes).size, 4, 'four strokes, four renders');
  const m = M.measure(channels, SR);
  assert.ok(m.audibleS < 0.1, 'a key is 50 to 100 ms');
});

test('counter: a short tick that lands, in the input family', () => {
  const m = measureCue(R.counter);
  assert.ok(m.durS <= 0.06 + 0.005 && m.apexS < 0.01, `${m.durS.toFixed(3)} s, apex at ${m.apexS.toFixed(4)} s`);
});

test('ding: a head, a gate that drops it about 20 dB, a quiet body; step raises it a semitone per repeat', () => {
  const head = R.ding.layers[0];
  assert.equal(head.gate.dropDb, 20);
  assert.ok(head.gate.atS >= 0.03 && head.gate.atS <= 0.05);
  const { channels } = render('ding');
  const rms = (a, b) => Math.sqrt(channels.reduce((s, c) => { let e = 0; for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) e += c[i] * c[i]; return s + e; }, 0) / ((b - a) * SR * 2));
  const drop = 20 * Math.log10(rms(0.02, 0.032) / rms(0.045, 0.057));
  assert.ok(drop > 14 && drop < 26, `the gate drops ${drop.toFixed(1)} dB`);
  const f = (step) => plan(R.ding, { step }).layers[0].voices[0].f;
  for (let n = 1; n < 5; n++) assert.ok(Math.abs(f(n) / f(0) - 2 ** (n / 12)) < 1e-9, `repeat ${n}`);
  assert.deepEqual(Object.keys(recipeModule(R.ding).params), ['gain', 'seed', 'emphasis', 'step', 'durS']);
});

test('click: four layers into a high-pass, a dip, saturation and a hard end; the release comes 60 to 110 ms later, 0 to 3 dB under the press', () => {
  const base = resolveRecipe(R.click, {});
  assert.ok(base.layers.filter((l) => l.peak > 0 && !l.offsetS).length >= 4);
  assert.ok(base.finish.highpassHz && base.finish.dip.f >= 2500 && base.finish.dip.f <= 4000 && base.finish.drive > 0 && base.finish.gate.dropDb >= 90);
  const { channels } = renderRecipe({ ...base, room: undefined, vary: undefined }, { sampleRate: SR });
  const peak = (a, b) => { let p = 0; for (const c of channels) for (let i = Math.round(a * SR); i < Math.min(c.length, Math.round(b * SR)); i++) p = Math.max(p, Math.abs(c[i])); return p; };
  const press = peak(0, 0.03), release = peak(0.06, 0.12);
  const env = M.envelope(channels, SR, 0.002, 0.0005).db, starts = [];
  for (let i = 1; i < env.length; i++) if (env[i] > -60 && env[i - 1] <= -60) starts.push(i * 0.0005);
  const gap = starts.find((t) => t > 0.05);
  assert.ok(gap >= 0.06 && gap <= 0.11, `the release starts ${gap?.toFixed(3)} s in`);
  const db = 20 * Math.log10(release / press);
  assert.ok(db <= 0.5 && db >= -4, `the release is ${db.toFixed(1)} dB against the press`);
  const pressOnly = resolveRecipe(R.click, { variant: 'press' });
  assert.ok(pressOnly.durationS < 0.06);
  assert.ok(measureCue(R.click, { variant: 'press' }).durS < measureCue(R.click, {}).durS);
});

test('sub-drop: 64 down to 44 Hz over 0.75 s with harmonics 2 to 6 above it; the pitch falls', () => {
  const sub = R['sub-drop'].layers[0];
  assert.equal(sub.f, 64);
  assert.equal(sub.glideTo, 44);
  assert.equal(sub.glideS, 0.75);
  const harmonics = R['sub-drop'].layers.filter((l) => l.kind === 'tone' && l.f > 64 && l.f < 400).map((l) => l.f / 64);
  assert.deepEqual(harmonics, [2, 3, 4, 5, 6]);
  const r = resolveRecipe(R['sub-drop'], {});
  const { channels } = renderRecipe({ ...r, layers: r.layers.filter((l) => l.kind === 'tone' && l.f === 64), room: undefined }, { sampleRate: SR });
  const at = (a, b) => channels.map((c) => c.subarray(Math.round(a * SR), Math.round(b * SR)));
  const peakHz = (seg) => { const sp = M.spectrum(seg, SR); let k = 1; for (let i = 1; i < sp.p.length; i++) if (sp.p[i] > sp.p[k]) k = i; return sp.f[k]; };
  assert.ok(peakHz(at(0.2, 0.45)) > peakHz(at(0.95, 1.4)) + 5, 'it falls');
  assert.ok(peakHz(at(0.95, 1.4)) < 50);
  assert.ok(measureCue(R['sub-drop']).apexS > 0.3 && measureCue(R['sub-drop']).apexS < 0.5, 'it blooms to its peak after the cut');
});

test('cut-hit: 0.26 s, a kick and a sub', () => {
  assert.equal(R['cut-hit'].durationS, 0.26);
  const m = measureCue(R['cut-hit']);
  assert.ok(m.durS > 0.16 && m.durS <= 0.27, `${m.durS.toFixed(3)} s`);
  const { channels } = render('cut-hit');
  assert.ok(powerUnder(channels, SR, 300) > 0.9, 'the weight is in the sub and the kick');
});

test('sting: a build, a stop, a hit, and a tonal bloom of 2 to 4 s whose key is a param', () => {
  const r = R.sting;
  assert.ok(r.layers.some((l) => l.kind === 'gated'), 'a build of pulses');
  const bloom = r.layers.filter((l) => l.keyed && (l.peak ?? 1) > 0);
  assert.ok(bloom.length >= 3 && bloom.every((l) => l.t60 >= 1.8 && l.t60 <= 4), 'the bloom rings 2 to 4 s');
  const build = r.layers[0], hit = r.layers.find((l) => (l.offsetS ?? 0) >= 0.4);
  assert.ok(hit.offsetS >= build.lengthS + 0.04, 'a stop between the build and the hit');
  const root = (k) => plan(r, { key: k }).layers[4].voices[0].f;
  assert.ok(Math.abs(root('G') / root('C') - 2 ** (-5 / 12)) < 1e-9 && Math.abs(root('E') / root('C') - 2 ** (4 / 12)) < 1e-9);
  assert.equal(recipeModule(R.sting).params.key.default, 'C');
  assert.ok(R.sting.durationS > 2 && R.sting.durationS <= 4.5);
  assert.ok(M.measure(render('sting').channels, SR).audibleS > 1.5);
});

test('the browser plays the samples Node renders for a cue with a variant, a step, a key and an aimed length', async () => {
  const cases = [['whoosh', { variant: 'short', durS: 0.3 }], ['ding', { step: 3 }], ['sting', { key: 'F#', emphasis: 'strong' }], ['click', { variant: 'press' }]];
  for (const [n, opts] of cases) {
    const web = await renderer.renderChannels([{ cue: n, recipe: R[n], profile: profiles.glass, at: 0.05, feel: 'soft-ui', opts }], { seconds: 4.2 });
    const node = renderRecipe(R[n], { sampleRate: web.sampleRate, profile: profiles.glass, ...opts });
    const at = Math.round(0.05 * web.sampleRate);
    let worst = 0;
    for (let c = 0; c < 2; c++) for (let i = 0; i < Math.min(node.length, web.channels[c].length - at); i++) worst = Math.max(worst, Math.abs(web.channels[c][at + i] - node.channels[c][i]));
    assert.ok(worst < 1e-6, `${n}: the browser and Node differ by ${worst}`);
  }
});

test('mm sound-listen lists every new cue, each version of a cue that has them, under both profiles', async () => {
  const names = readdirSync(join(ROOT, 'patterns/sound')).filter((n) => existsSync(join(ROOT, 'patterns/sound', n, 'recipe.json')));
  for (const n of NEW) assert.ok(names.includes(n), n);
  assert.deepEqual(variantsOf(R.whoosh).sort(), ['long', 'medium', 'short']);
  assert.deepEqual(variantsOf(R.key), [null]);
});

test('mm sound reads a beat\'s knobs: the whoosh of one beat is short and the next long, a ding climbs, a sting is in another key', async () => {
  const dir = await pieceVariant('engine-knobs', {
    cues: ['whoosh', 'whoosh', 'ding', 'sting'],
    style: { sound: { profile: 'glass', cuesPer10s: [0, 12] } },
    edit: (s) => {
      const beats = s.scenes.flatMap((sc) => sc.beats).filter((b) => b.cue);
      const bag = (i, cue) => { beats[i].params = { ...(beats[i].params ?? {}), cue }; };
      bag(0, { variant: 'short' }); bag(1, { variant: 'long' }); bag(2, { step: 5, durS: 0.2 }); bag(3, { key: 'G' });
    },
  });
  await withPicture(dir, 'kit-smoke-cues-16x9.mp4');
  await buildSound(dir, { patterns: join(ROOT, 'patterns') });
  const json = JSON.parse(readFileSync(join(dir, 'out', 'cues.json'), 'utf8'));
  const whoosh = json.cues.filter((c) => c.name === 'whoosh');
  assert.equal(whoosh.length, 2);
  assert.notEqual(whoosh[0].peakDb, whoosh[1].peakDb, 'the short and the long whoosh are two renders');
  assert.deepEqual(new Set(json.cues.map((c) => c.name)), new Set(['whoosh', 'ding', 'sting']));
  assert.ok(json.cues.every((c) => c.profile === 'glass'));
});
