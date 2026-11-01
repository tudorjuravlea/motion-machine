// The aim knobs (runtime/kit/aim.js): a cue lands a duration, an apex and a pitch through its own fields. Pure Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { AIM_TOL, aim, estimatePitch, measureCue } from '../../runtime/kit/aim.js';
import { PASS_DEFAULTS, renderRecipe, resolveRecipe } from '../../runtime/kit/synth.js';

const recipe = (n) => JSON.parse(readFileSync(join(ROOT, 'patterns/sound', n, 'recipe.json'), 'utf8'));
const { soundRecipe } = validators();
const cents = (a, b) => Math.abs(1200 * Math.log2(a / b));

test('the tolerances are the stated ones: 5 ms of duration, 2.5 ms of apex, 50 cents', () => {
  assert.deepEqual(AIM_TOL, { durS: 0.005, apexS: 0.0025, pitchCents: 50 });
});

test('a whoosh lands its duration and its apex: the duration inside 5 ms, the loudest 5 ms inside 2.5 ms', () => {
  const w = recipe('whoosh');
  for (const [durS, apexS] of [[0.6, 0.36], [0.3, 0.16], [0.9, 0.55]]) {
    const a = aim(w, { durS, apexS });
    const m = measureCue(a);
    assert.ok(Math.abs(m.durS - durS) <= AIM_TOL.durS, `duration ${m.durS.toFixed(4)} for ${durS}`);
    assert.ok(Math.abs(m.apexS - apexS) <= AIM_TOL.apexS, `apex ${m.apexS.toFixed(4)} for ${apexS}`);
    assert.ok(soundRecipe(a), 'the aimed recipe still validates');
    assert.equal(a.durationS, durS);
  }
});

test('a ding lands its pitch inside 50 cents and its duration, and keeps the doublet and the gate it was written with', () => {
  const d = recipe('ding');
  const a = aim(d, { durS: 0.25, pitchHz: 2093 });
  const m = measureCue(a);
  assert.ok(cents(m.pitchHz, 2093) <= AIM_TOL.pitchCents, `${m.pitchHz.toFixed(1)} Hz`);
  assert.ok(Math.abs(m.durS - 0.25) <= AIM_TOL.durS, `${m.durS.toFixed(4)} s`);
  assert.equal(a.layers[0].beatHz, 0.8);
  assert.ok(a.layers[0].gate.dropDb === 20 && a.layers[0].gate.atS < 0.034 * 2);
  assert.ok(Math.abs(a.layers[0].f / 1760 - a.layers[1].f / 880) < 1e-9, 'every tone moved by the same ratio');
});

test('a pop-in lands duration, apex and pitch together', () => {
  const a = aim(recipe('pop-in'), { durS: 0.2, apexS: 0.022, pitchHz: 120 });
  const m = measureCue(a);
  assert.ok(Math.abs(m.durS - 0.2) <= AIM_TOL.durS && Math.abs(m.apexS - 0.022) <= AIM_TOL.apexS && cents(m.pitchHz, 120) <= AIM_TOL.pitchCents, JSON.stringify(m));
});

test('a noise sound refuses a pitch target and says why', () => {
  assert.throws(() => aim(recipe('whoosh'), { pitchHz: 440 }), /no pitch to aim.*noise has no note/);
  assert.throws(() => aim(recipe('key'), { pitchHz: 440 }), /key has no pitch to aim/);
  assert.throws(() => aim(recipe('ding'), { pitchHz: 1 }), /outside 20 Hz/);
});

test('a missing field is filled from the recipe\'s own default, never from the middle of a range; aiming at nothing changes nothing', () => {
  const w = recipe('whoosh');
  const bare = structuredClone(w);
  delete bare.variants;
  delete bare.variant;
  delete bare.layers[0].apexAt;
  delete bare.layers[0].riseK;
  assert.deepEqual(aim(bare, {}), bare, 'no target, no change');
  const a = aim(bare, { apexS: 0.3 });
  assert.equal(a.layers[0].riseK, undefined, 'a field it did not need to move is left out');
  assert.ok(a.layers[0].apexAt > 0.05 && a.layers[0].apexAt < 0.95);
  const m = measureCue(bare);
  assert.ok(Math.abs(m.apexS / bare.layers[0].lengthS - PASS_DEFAULTS.apexAt) < 0.1, 'the omitted apexAt plays as its default 0.6 of the length');
  assert.ok(PASS_DEFAULTS.apexAt >= 0.5 && PASS_DEFAULTS.apexAt <= 0.7);
});

test('the same inputs aim to the same recipe, and a beat\'s durS aims the cue it renders', () => {
  const d = recipe('ding');
  assert.deepEqual(aim(d, { durS: 0.2 }), aim(d, { durS: 0.2 }));
  assert.equal(resolveRecipe(d, { durS: 0.2 }).durationS, 0.2);
  const plain = renderRecipe(d, { sampleRate: 48000 }), aimed = renderRecipe(d, { sampleRate: 48000, durS: 0.2 });
  assert.notEqual(plain.length, aimed.length);
  const dry = (r) => measureCue(r).durS;
  assert.ok(Math.abs(dry(resolveRecipe(d, { durS: 0.2 })) - 0.2) <= AIM_TOL.durS);
  assert.equal(resolveRecipe(d, { durS: 0 }), d, 'durS 0 plays the cue as written');
});

test('estimatePitch finds the strongest peak near a note, and is null on silence', () => {
  const sr = 48000, n = sr / 2, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 440 * i) / sr) * Math.exp(-i / sr);
  assert.ok(cents(estimatePitch([x, x], sr, 400), 440) < 5);
  assert.equal(estimatePitch([new Float32Array(100), new Float32Array(100)], sr, 440), null);
});
