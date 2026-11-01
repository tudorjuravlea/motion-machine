// The sound recipe and sound profile contracts (contracts/sound-recipe.schema.json, sound-profile.schema.json)
// and the shipped data that follows them: every recipe under patterns/sound/ and every profile under
// styles/sound/ validates, and the palette keeps the rules it was written by (material marks the family,
// contour carries meaning, a length ladder, one shared room, the register contract). Static checks on the
// JSON; tests/sound/recipes.test.mjs renders the same data and measures it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validators, ROOT } from '../../scripts/lib/validate.mjs';
import { compose } from '../../scripts/compose.mjs';
import { familyOf } from '../../runtime/kit/synth.js';

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const { soundRecipe, soundProfile, story, motion, brand } = validators();
const explain = (v) => (v.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
const PALETTE = ['ready', 'attention', 'success', 'warning', 'error', 'loading', 'tap', 'toggle-on', 'toggle-off', 'open', 'close'];
// every recipe under patterns/sound/ validates; the rules below were written for the first data palette and are checked on it
// (the cues the newer layers make are measured in tests/sound/engine-cues.test.mjs)
const every = readdirSync(join(ROOT, 'patterns/sound')).filter((n) => existsSync(join(ROOT, 'patterns/sound', n, 'recipe.json'))).sort().map((n) => ({ n, r: read(`patterns/sound/${n}/recipe.json`) }));
const recipes = every.filter(({ n }) => PALETTE.includes(n));
const profiles = readdirSync(join(ROOT, 'styles/sound')).filter((f) => f.endsWith('.json')).sort().map((f) => read(`styles/sound/${f}`));
const byName = Object.fromEntries(recipes.map(({ r }) => [r.name, r]));
const semis = (a, b) => 12 * Math.log2(a / b);

test('the first data palette is all there, and every recipe and profile validates', () => {
  assert.deepEqual(recipes.map((x) => x.n), [...PALETTE].sort());
  for (const { n, r } of every) { assert.ok(soundRecipe(r), `${n}: ${explain(soundRecipe)}`); assert.equal(r.name, n, `${n}: the name is the folder`); }
  assert.deepEqual(profiles.map((p) => p.name), ['glass', 'soft-ui']);
  for (const p of profiles) assert.ok(soundProfile(p), `${p.name}: ${explain(soundProfile)}`);
});

test('the schema refuses a recipe that cannot be drawn', () => {
  const ok = () => structuredClone(byName.ready);
  const bad = (edit) => { const r = ok(); edit(r); return soundRecipe(r); };
  assert.equal(bad((r) => { delete r.layers[0].f; }), false, 'a tone needs its f');
  assert.equal(bad((r) => { r.layers[0].kind = 'sample'; }), false);
  assert.equal(bad((r) => { r.layers[0].colour = 'red'; }), false, 'no stray fields');
  assert.equal(bad((r) => { r.durationS = 5; }), false, 'a cue is at most 4.5 s');
  assert.equal(bad((r) => { r.layers[0].from = 3; }), false);
  assert.equal(bad((r) => { r.layers[0].partials = [[1]]; }), false);
  assert.equal(bad((r) => { r.layers[0].partials = [[1, 0, 5]]; }), false);
  assert.equal(bad((r) => { r.layers = []; }), false);
  assert.equal(bad((r) => { r.name = 'Ready'; }), false);
  assert.equal(bad((r) => { r.vary = { pitch: 0.5 }; }), false);
  assert.equal(bad((r) => { r.layers.push({ kind: 'noise', t60: 0.1, filter: { type: 'notch' } }); }), false);
  assert.equal(bad((r) => { r.layers.push({ kind: 'noise', t60: 0.1, glideTo: null, filter: { type: 'none' } }); }), true, 'a noise layer needs no pitch');
  assert.equal(bad((r) => { delete r.room; }), true, 'the room is optional');
});

test('the schema refuses a profile that does not say how a palette sounds', () => {
  const ok = () => structuredClone(profiles[0]);
  const bad = (edit) => { const p = ok(); edit(p); return soundProfile(p); };
  assert.equal(bad((p) => { delete p.loudness; }), false);
  assert.equal(bad((p) => { p.modes = 'plate'; }), false);
  assert.equal(bad((p) => { p.key = ['H']; }), false);
  assert.equal(bad((p) => { p.key = ['C', 'C']; }), false);
  assert.equal(bad((p) => { p.envelope.t60.outcome = [0.1]; }), false);
  assert.equal(bad((p) => { p.stereo.sideMidDb = 3; }), false);
  assert.equal(bad((p) => { p.sources = [{ source: 'a folder' }]; }), false, 'a mined profile names the licence of each source');
  assert.equal(bad((p) => { p.sources = [{ source: 'a folder', licence: 'own recording' }]; }), true);
  assert.equal(bad((p) => { p.key = []; }), true, 'an empty key is no constraint');
});

test('a recipe lasts as long as it says: durationS covers every layer, and the family follows the ladder', () => {
  const FAMILY = { ready: 'outcome', attention: 'outcome', success: 'outcome', warning: 'outcome', error: 'surface', loading: 'swell', tap: 'input', 'toggle-on': 'input', 'toggle-off': 'input', open: 'surface', close: 'surface' };
  for (const { n, r } of recipes) {
    const end = Math.max(...r.layers.map((l) => (l.offsetS ?? 0) + (l.attackS ?? 0.002) + l.t60));
    assert.ok(r.durationS >= end - 0.011, `${n}: ${r.durationS} s ends before its layers (${end.toFixed(3)} s)`);
    assert.ok(r.durationS <= end + 0.06, `${n}: ${r.durationS} s is longer than its layers (${end.toFixed(3)} s)`);
    assert.equal(familyOf(r.durationS), FAMILY[n], `${n}: ${r.durationS} s`);
  }
  assert.ok(byName.tap.durationS <= 0.05, 'input bursts are 5-50 ms');
  assert.ok(byName.ready.durationS >= 0.45 && byName.ready.durationS <= 0.55, 'ready is about 0.5 s');
  assert.ok(byName.attention.durationS >= 0.55 && byName.attention.durationS <= 0.7, 'attention is about 0.6 s');
  const swell = byName.loading.layers.filter((l) => l.kind === 'tone');
  assert.ok(swell.every((l) => l.attackS >= 0.3 && l.attackS <= 0.4), 'loading rises over about 0.35 s');
  assert.ok(byName.loading.durationS >= 0.9, 'and fades over about a second');
});

test('contour carries the meaning: success and attention rise, error falls, warning and ready stay level', () => {
  // the lowest pitch struck at each instant, in order, from the layers that play at normal emphasis
  const line = (r) => {
    const at = new Map();
    for (const l of r.layers.filter((x) => x.kind === 'tone' && (x.from ?? 0) <= 1)) at.set(l.offsetS ?? 0, Math.min(at.get(l.offsetS ?? 0) ?? Infinity, l.f));
    return [...at].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  };
  const ascending = (a) => a.every((v, i) => i === 0 || v > a[i - 1]);
  assert.ok(ascending(line(byName.success)), `success ${line(byName.success)}`);
  assert.ok(ascending(line(byName.attention)), `attention ${line(byName.attention)}`);
  assert.ok(ascending(line(byName.error).slice().reverse()) && line(byName.error).length >= 2, `error ${line(byName.error)}`);
  const w = line(byName.warning);
  assert.ok(w.every((v) => v === w[0]), `warning ${w}: every strike on the same pitch`);
  assert.equal(line(byName.ready).length, 1, 'ready is struck once');
  const [hi, lo] = byName.error.layers.filter((l) => (l.from ?? 0) === 0 && l.kind === 'tone').map((l) => l.f);
  assert.ok(semis(hi, lo) >= 15 && semis(hi, lo) <= 16, `error falls a tenth, not ${semis(hi, lo).toFixed(1)} semitones`);
  const fifth = byName.warning.layers.filter((l) => (l.from ?? 0) === 0 && l.kind === 'tone' && l.f < 800).map((l) => l.f);
  assert.ok(Math.abs(semis(Math.max(...fifth), Math.min(...fifth)) - 7) < 0.1, 'warning is a fifth');
  const on = byName['toggle-on'].layers.filter((l) => l.kind === 'tone' && (l.from ?? 0) === 0).sort((a, b) => (a.offsetS ?? 0) - (b.offsetS ?? 0));
  const off = byName['toggle-off'].layers.filter((l) => l.kind === 'tone' && (l.from ?? 0) === 0).sort((a, b) => (a.offsetS ?? 0) - (b.offsetS ?? 0));
  assert.ok(on[1].f > on[0].f && off[1].f < off[0].f, 'a switch on rises, a switch off falls');
  const gl = (r) => r.layers.find((l) => l.kind === 'noise');
  assert.ok(gl(byName.open).glideTo > gl(byName.open).filter.f && gl(byName.close).glideTo < gl(byName.close).filter.f, 'open sweeps up, close sweeps down');
});

test('material marks the family: bars for presence and attention, mallets for outcomes, air and knocks for input', () => {
  const ratios = (r) => new Set(r.layers.flatMap((l) => (l.partials ?? []).map((p) => p[0])).filter((x) => x !== 1));
  for (const n of ['ready', 'attention']) assert.ok([...ratios(byName[n])].every((x) => x === 2.76 || x === 5.4) && ratios(byName[n]).has(2.76), `${n}: glass bar ratios`);
  for (const n of ['success', 'warning', 'error']) assert.ok([...ratios(byName[n])].every((x) => x === 3.99) && ratios(byName[n]).has(3.99), `${n}: mallet ratio`);
  for (const n of ['tap', 'toggle-on', 'toggle-off', 'open', 'close']) assert.ok(byName[n].layers.some((l) => l.kind === 'noise'), `${n}: air in it`);
  assert.ok(byName.ready.layers.some((l) => l.kind === 'tone' && Math.abs(l.f - 880) > 0.5 && Math.abs(l.f - 880) < 3), 'ready has a twin a hair sharp for one slow shimmer');
});

test('the palette shares one room (doubled for success and ready) and only input and surface cues vary', () => {
  const shape = (r) => JSON.stringify([r.room.predelayS, r.room.sizeS, r.room.lowpassHz]);
  for (const { n, r } of recipes) {
    assert.equal(shape(r), shape(byName.tap), `${n}: the same room`);
    assert.equal(r.room.send, n === 'ready' || n === 'success' ? -16 : -22, `${n}: its send`);
  }
  for (const { n, r } of recipes) {
    const varies = Boolean(r.vary);
    assert.equal(varies, ['tap', 'toggle-on', 'toggle-off', 'open', 'close'].includes(n), `${n}: outcome cues are identical every time, input cues vary`);
    if (varies) assert.ok(r.vary.pitch > 0 && r.vary.force > 0, `${n}: pitch and force together`);
  }
});

test('every cue has three arrangements: subtle drops an ornament, strong adds a layer', () => {
  for (const { n, r } of recipes) {
    const rank = r.emphasis ?? { subtle: 0, normal: 1, strong: 2 };
    const count = (e) => r.layers.filter((l) => (l.from ?? 0) <= rank[e]).length;
    assert.ok(count('subtle') >= 1 && count('subtle') < count('normal'), `${n}: subtle ${count('subtle')} < normal ${count('normal')}`);
    assert.ok(count('strong') > count('normal'), `${n}: strong ${count('strong')} > normal ${count('normal')}`);
  }
});

test('the register contract: sines only, no fundamental centred above 5 kHz or below 40 Hz, every pitch in the key', () => {
  const glass = profiles.find((p) => p.name === 'glass');
  const PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const inKey = (f) => { const m = 69 + 12 * Math.log2(f / 440); return glass.key.some((k) => { const d = (((m - PC[k]) % 12) + 12) % 12; return Math.min(d, 12 - d) <= 0.2; }); };
  for (const { n, r } of recipes) for (const l of r.layers) {
    if (l.kind === 'tone') {
      for (const f of [l.f, l.glideTo].filter(Boolean)) {
        assert.ok(f <= glass.register.maxCentreHz && f >= glass.register.minHz, `${n}: ${f} Hz is outside the register`);
        assert.ok(inKey(f), `${n}: ${f} Hz is not in the key`);
      }
    } else assert.ok(Math.max(l.filter?.f ?? 0, l.glideTo ?? 0) <= glass.register.maxCentreHz, `${n}: a band centred above the register`);
  }
});

test('the profiles agree with the ladder: glass is the reference, soft-ui is softer, shorter and pure', () => {
  const [glass, soft] = [profiles.find((p) => p.name === 'glass'), profiles.find((p) => p.name === 'soft-ui')];
  assert.equal(glass.modes, 'bar');
  assert.equal(soft.modes, 'none');
  assert.ok(soft.loudness.cueLufs100ms < glass.loudness.cueLufs100ms, 'soft-ui sits under glass');
  assert.ok(soft.room.sizeS < glass.room.sizeS && soft.stereo.sideMidDb < glass.stereo.sideMidDb);
  assert.ok(soft.register.maxCentreHz < glass.register.maxCentreHz);
  for (const p of profiles) for (const fam of ['input', 'surface', 'outcome']) assert.ok(p.envelope.t60[fam][0] < p.envelope.t60[fam][1]);
  assert.equal(glass.loudness.cueLufs100ms, -30);
});

test('the story\'s cue is a name now, not a closed list: a recipe cue validates, a malformed name does not; params.cue is a bag', () => {
  const film = () => read('fixtures/golden/story.film.json');
  const withCue = (cue, params) => { const s = film(); Object.assign(s.scenes[0].beats[0], { cue }); if (params) s.scenes[0].beats[0].params = params; return s; };
  assert.ok(story(withCue('ready')), explain(story));
  assert.ok(story(withCue('toggle-on')), explain(story));
  assert.ok(story(withCue('ready', { cue: { emphasis: 'strong', gain: 0.8 } })), explain(story));
  assert.equal(story(withCue('Ready!')), false);
  assert.equal(story(withCue('9lives')), false);
  assert.equal(story(withCue('ready', { cue: 'strong' })), false, 'params.cue is a bag, not a string');
});

test('the motion half and the brand half may name a sound profile, and the brand\'s wins when they are composed', () => {
  const m = read('styles/motion/calm.json'), b = read('styles/brands/paper.json');
  assert.ok(motion({ ...m, sound: { ...m.sound, profile: 'glass' } }), explain(motion));
  assert.ok(brand({ ...b, sound: { profile: 'soft-ui' } }), explain(brand));
  assert.equal(brand({ ...b, sound: { profile: 'soft-ui', extra: 1 } }), false);
  // composed: the brand's profile wins over the motion half's; neither set leaves the style without one
  const tmp = mkdtempSync(join(tmpdir(), 'mm-sound-compose-'));
  try {
    const half = (name, json) => { const f = join(tmp, name); writeFileSync(f, JSON.stringify(json)); return f; };
    const mf = half('motion.json', { ...m, sound: { ...m.sound, profile: 'glass' } });
    const bf = half('brand.json', { ...b, sound: { profile: 'soft-ui' } });
    const plain = half('plain-brand.json', b);
    const out = join(tmp, 'style.json');
    assert.equal(compose({ brand: bf, motion: mf, out }).sound.profile, 'soft-ui', 'the brand wins');
    assert.equal(compose({ brand: plain, motion: mf, out }).sound.profile, 'glass', 'no brand profile: the motion half\'s');
    assert.equal(compose({ brand: plain, motion: half('plain-motion.json', m), out }).sound.profile, undefined);
    assert.ok(validators().style(compose({ brand: bf, motion: mf, out })), 'and the composed style validates');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
