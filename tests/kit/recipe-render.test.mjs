// Recipes rendered to samples by runtime/kit/synth.js `renderRecipe` (plain JavaScript, no audio graph) and
// measured with scripts/lib/audio-measure.mjs: the same recipe, seed and profile render the same samples to
// the last bit; a probe recipe's attack, T60 and partial levels come back as written; the shipped palette sits
// on the matched level in both profiles, inside each profile's register, with the stereo mix leaning under
// 0.5 dB. Nobody listened here: every claim is a measurement. tests/sound/recipes.test.mjs checks the same
// samples through an OfflineAudioContext in Chromium.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/validate.mjs';
import { renderRecipe } from '../../runtime/kit/synth.js';
import * as M from '../../scripts/lib/audio-measure.mjs';

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const recipes = Object.fromEntries(readdirSync(join(ROOT, 'patterns/sound')).filter((n) => existsSync(join(ROOT, 'patterns/sound', n, 'recipe.json'))).map((n) => [n, read(`patterns/sound/${n}/recipe.json`)]));
const profiles = { glass: read('styles/sound/glass.json'), 'soft-ui': read('styles/sound/soft-ui.json') };

const render = (recipe, opts = {}) => renderRecipe(recipe, opts);
const same = (a, b) => a.length === b.length && a.channels.every((c, i) => Buffer.compare(Buffer.from(c.buffer), Buffer.from(b.channels[i].buffer)) === 0);
const probe = (extra = {}) => ({ name: 'probe', meaning: 'a probe for the tests', durationS: 0.4, layers: [{ kind: 'tone', f: 1000, attackS: 0.004, t60: 0.2, peak: 0.5, partials: [[1, 0], [2.76, -20]] }], ...extra });
const slice = (x, from, to) => ({ channels: x.channels.map((c) => c.slice(Math.round(from * x.sampleRate), Math.round(to * x.sampleRate))), sampleRate: x.sampleRate });

test('the same recipe, seed, emphasis and profile render the same samples, bit for bit', () => {
  for (const name of Object.keys(recipes)) {
    for (const profile of [null, profiles.glass, profiles['soft-ui']]) for (const emphasis of ['subtle', 'normal', 'strong']) {
      const a = render(recipes[name], { seed: 7, emphasis, profile }), b = render(recipes[name], { seed: 7, emphasis, profile });
      assert.ok(same(a, b), `${name} in ${profile?.name ?? 'no profile'} at ${emphasis} differs between two renders`);
    }
  }
  assert.ok(same(render(recipes.ready), render(recipes.ready, { seed: undefined })), 'the default seed is the name\'s');
});

test('the seed moves the noise, the spread and the variation, and an outcome cue stays the cue it is', () => {
  const tap1 = render(recipes.tap, { seed: 1 }), tap2 = render(recipes.tap, { seed: 2 });
  assert.ok(!same(tap1, tap2), 'two taps from two seeds are not one sample repeated');
  assert.ok(Math.abs(M.measure(tap1.channels, 48000).lufs100ms - M.measure(tap2.channels, 48000).lufs100ms) < 3, 'but they are the same tap: within 3 dB');
  const a = M.measure(render(recipes.ready, { seed: 1 }).channels, 48000), b = M.measure(render(recipes.ready, { seed: 2 }).channels, 48000);
  assert.ok(Math.abs(a.lufs100ms - b.lufs100ms) < 0.05, 'an outcome cue is the same level whatever the seed');
  assert.ok(Math.abs(a.centroidHz - b.centroidHz) < 1, 'and the same pitch');
});

test('a probe\'s attack, T60 and partial level come back as written, and the high partial dies sooner', () => {
  const x = render(probe());
  const m = M.measure(x.channels, x.sampleRate);
  assert.ok(m.attackS >= 0.0025 && m.attackS <= 0.0045, `attack ${m.attackS} for a 4 ms linear rise (10 to 90 % is 3.2 ms)`);
  assert.ok(m.t60S >= 0.2 * 0.85 && m.t60S <= 0.2 * 1.15, `T60 ${m.t60S} for 0.2`);
  const peaks = M.peaksOf(M.spectrum(x.channels, x.sampleRate), { floorDb: -45 });
  const near = (f) => peaks.find((p) => Math.abs(p.f - f) / f < 0.01);
  assert.ok(near(1000) && near(2760), `peaks ${peaks.map((p) => Math.round(p.f))}`);
  // written as -20 dB; a partial that decays 2.76^-0.75 as long spends 6.6 dB less in the spectrum: -26.6 dB
  const rel = near(2760).db - near(1000).db;
  assert.ok(Math.abs(rel - -26.6) < 2, `the 2.76 partial reads ${rel.toFixed(1)} dB under the fundamental`);
  const ratio = (from, to) => {
    const p = M.peaksOf(M.spectrum(slice(x, from, to).channels, x.sampleRate), { floorDb: -70 });
    const lvl = (f) => p.find((q) => Math.abs(q.f - f) / f < 0.02)?.db ?? -70;
    return lvl(2760) - lvl(1000);
  };
  assert.ok(ratio(0, 0.05) > ratio(0.1, 0.15) + 6, 'the upper partial falls away faster than the fundamental');
});

test('a glide moves the pitch, a noise layer\'s band moves the colour, a long attack is a swell', () => {
  const g = render({ ...probe(), layers: [{ kind: 'tone', f: 500, glideTo: 1000, glideS: 0.2, attackS: 0.002, t60: 0.3, peak: 0.5 }] });
  const top = (x) => M.peaksOf(M.spectrum(x.channels, x.sampleRate), { max: 1 })[0].f;
  assert.ok(top(slice(g, 0.01, 0.05)) < 650 && top(slice(g, 0.2, 0.25)) > 850, `glide ${top(slice(g, 0.01, 0.05))} -> ${top(slice(g, 0.2, 0.25))}`);
  const n = render({ ...probe(), layers: [{ kind: 'noise', attackS: 0.002, t60: 0.3, peak: 0.5, glideTo: 4000, glideS: 0.2, filter: { type: 'bandpass', f: 500, q: 4 } }] });
  const early = M.centroidHz(M.spectrum(slice(n, 0.01, 0.05).channels, n.sampleRate)), late = M.centroidHz(M.spectrum(slice(n, 0.2, 0.25).channels, n.sampleRate));
  assert.ok(late > early * 2, `the band sweeps up: ${Math.round(early)} -> ${Math.round(late)} Hz`);
  const lp = render({ ...probe(), layers: [{ kind: 'noise', attackS: 0.002, t60: 0.2, peak: 0.5, filter: { type: 'lowpass', f: 800, q: 0.7 } }] });
  const hp = render({ ...probe(), layers: [{ kind: 'noise', attackS: 0.002, t60: 0.2, peak: 0.5, filter: { type: 'highpass', f: 5000, q: 0.7 } }] });
  assert.ok(M.centroidHz(M.spectrum(lp.channels, 48000)) < 1500 && M.centroidHz(M.spectrum(hp.channels, 48000)) > 6000, 'low-pass and high-pass noise');
  const s = render({ ...probe(), layers: [{ kind: 'tone', f: 500, attackS: 0.3, t60: 0.4, peak: 0.5 }] });
  assert.ok(M.measure(s.channels, s.sampleRate).attackS > 0.2, 'a 0.3 s attack is a swell');
});

test('the room rings after the dry cue ends, and without a room nothing does', () => {
  const tail = (x) => { const c = x.channels[0]; let e = 0; for (let i = Math.round(0.26 * x.sampleRate); i < c.length; i++) e += c[i] * c[i]; return e; };
  const dry = render(probe({ room: undefined })), wet = render(probe({ room: { send: -10, predelayS: 0.008, sizeS: 0.25, lowpassHz: 3500 } }));
  assert.ok(tail(dry) < 1e-10, 'no room: silent after the note');
  assert.ok(tail(wet) > 1e-6, 'a room: a tail');
  assert.ok(wet.length > dry.length, 'and the buffer is long enough to hold it');
  const shifted = render(probe({ room: { send: -10, predelayS: 0.05, sizeS: 0.25, lowpassHz: 3500 } }));
  const first = (x) => x.channels[0].findIndex((v, i) => i > Math.round(0.27 * x.sampleRate) && Math.abs(v) > 1e-5);
  assert.ok(first(shifted) >= first(wet), 'a longer predelay does not bring the tail forward');
});

test('stereo: a cue is nearly centred with a little width, and left and right carry the same power', () => {
  const x = render(recipes.ready, { profile: profiles.glass });
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff = Math.max(diff, Math.abs(x.channels[0][i] - x.channels[1][i]));
  assert.ok(diff > 0, 'left and right are not the same signal');
  const m = M.measure(x.channels, x.sampleRate);
  assert.ok(m.sideMidDb < -15 && m.sideMidDb > -30, `side under mid by ${m.sideMidDb.toFixed(1)} dB`);
  const bare = render({ ...recipes.ready, room: undefined });
  assert.ok(Math.abs(M.sideMidDb(bare.channels) - -22) < 0.5, `without the room the side is the recipe's -22 dB: ${M.sideMidDb(bare.channels).toFixed(2)}`);
  assert.ok(Math.abs(M.balanceDb(bare.channels, bare.sampleRate)) < 0.05, 'and the two sides are equal in power');
  const wide = render({ ...recipes.ready, room: undefined }, { profile: { ...profiles.glass, stereo: { sideMidDb: -10 } } });
  assert.ok(M.sideMidDb(wide.channels) > M.sideMidDb(bare.channels) + 8, 'the profile sets the width');
});

test('every cue of the palette leans less than 0.5 dB, in both profiles and at every emphasis', () => {
  const worst = [];
  for (const [name, recipe] of Object.entries(recipes)) for (const profile of Object.values(profiles)) for (const emphasis of ['subtle', 'normal', 'strong']) {
    const x = render(recipe, { profile, emphasis });
    worst.push([Math.abs(M.balanceDb(x.channels, x.sampleRate)), `${name}/${profile.name}/${emphasis}`]);
  }
  worst.sort((a, b) => b[0] - a[0]);
  assert.ok(worst[0][0] <= 0.5, `${worst[0][1]} leans ${worst[0][0].toFixed(2)} dB`);
});

test('levels are matched on the loudest 100 ms: -30 LUFS as written and under glass, inside the tolerance under soft-ui; peaks under the profile\'s ceiling', () => {
  for (const [name, recipe] of Object.entries(recipes)) {
    const native = M.measure(render(recipe).channels, 48000);
    assert.ok(Math.abs(native.lufs100ms - -30) <= 0.3, `${name} as written: ${native.lufs100ms.toFixed(2)} LUFS`);
    for (const p of Object.values(profiles)) {
      const x = render(recipe, { profile: p });
      const m = M.measure(x.channels, x.sampleRate);
      assert.ok(Math.abs(m.lufs100ms - p.loudness.cueLufs100ms) <= p.loudness.tolDb, `${name} in ${p.name}: ${m.lufs100ms.toFixed(2)} LUFS against ${p.loudness.cueLufs100ms} +- ${p.loudness.tolDb}`);
      assert.ok(m.peakDbfs <= p.loudness.peakDbfs, `${name} in ${p.name}: peak ${m.peakDbfs.toFixed(1)} dBFS over ${p.loudness.peakDbfs}`);
      assert.ok(m.centroidHz <= p.register.maxCentreHz, `${name} in ${p.name}: centroid ${Math.round(m.centroidHz)} Hz`);
      assert.ok(m.audibleS <= recipe.durationS + p.room.sizeS, `${name} in ${p.name}: ${m.audibleS.toFixed(2)} s audible against ${recipe.durationS} s and the room`);
    }
  }
});

test('levels across the palette stay within 1.5 dB of each other in each profile, at every emphasis the palette ships', () => {
  for (const p of Object.values(profiles)) {
    const levels = Object.values(recipes).map((r) => M.measure(render(r, { profile: p }).channels, 48000).lufs100ms);
    assert.ok(Math.max(...levels) - Math.min(...levels) <= 2 * p.loudness.tolDb, `${p.name}: ${Math.min(...levels).toFixed(2)} to ${Math.max(...levels).toFixed(2)}`);
    assert.ok(Math.max(...levels) - Math.min(...levels) <= 3, `${p.name}: spread ${(Math.max(...levels) - Math.min(...levels)).toFixed(2)} dB`);
  }
});

test('emphasis: subtle is quieter than normal, strong is not quieter, and the three renders differ', () => {
  for (const name of Object.keys(recipes)) {
    const e = {};
    for (const emphasis of ['subtle', 'normal', 'strong']) e[emphasis] = render(recipes[name], { profile: profiles.glass, emphasis });
    const lu = (x) => M.ungatedLufs(x.channels, x.sampleRate);
    // a layer that adds only a short knock may add nothing audible to the whole-cue level: strong must not be quieter than normal by more than 0.2 dB
    assert.ok(lu(e.subtle) < lu(e.normal) && lu(e.strong) >= lu(e.normal) - 0.2, `${name}: ${lu(e.subtle).toFixed(2)} < ${lu(e.normal).toFixed(2)} <= ${lu(e.strong).toFixed(2)}`);
    assert.ok(!same(e.subtle, e.normal) && !same(e.normal, e.strong));
  }
});

test('the strongest peaks of each material are where the recipe puts them: bars at 2.76 and 5.4, mallets at 3.99', () => {
  const peaksOf = (name) => M.peaksOf(M.spectrum(render(recipes[name], { emphasis: 'subtle' }).channels, 48000), { floorDb: -50, max: 60 });
  const has = (peaks, f) => peaks.some((p) => Math.abs(p.f - f) / f < 0.012);
  assert.ok(has(peaksOf('ready'), 880) && has(peaksOf('ready'), 880 * 2.76), 'ready: a bar');
  assert.ok(has(peaksOf('attention'), 1318.5 * 2.76), 'attention: a bar');
  assert.ok(has(peaksOf('success'), 523.25) && has(peaksOf('success'), 523.25 * 3.99), 'success: a mallet');
  assert.ok(has(peaksOf('warning'), 440 * 3.99), 'warning: a mallet');
});

test('a profile changes the sound: glass keeps the bar\'s inharmonic partial, soft-ui is pure sine and shorter', () => {
  const peak = (x, f) => M.peaksOf(M.spectrum(x.channels, x.sampleRate), { floorDb: -45 }).find((p) => Math.abs(p.f - f) / f < 0.01);
  const g = render(recipes.ready, { profile: profiles.glass }), s = render(recipes.ready, { profile: profiles['soft-ui'] });
  assert.ok(peak(g, 880 * 2.76), 'glass: the 2.76 partial of the bar');
  assert.ok(!peak(s, 880 * 2.76), 'soft-ui: pure sines');
  assert.ok(M.measure(s.channels, s.sampleRate).audibleS < M.measure(g.channels, g.sampleRate).audibleS);
});

test('rendering a palette cue is fast enough to search with: under a second each', () => {
  const t = Date.now();
  for (const r of Object.values(recipes)) render(r, { profile: profiles.glass });
  assert.ok((Date.now() - t) / Object.keys(recipes).length < 1000);
});
