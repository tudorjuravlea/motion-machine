// scripts/lib/sound-score.mjs: how near one sound is to another, with no model. The score `mm sound clone` minimises: a
// multi-resolution log-mel distance (64 bands, FFT 256 / 1024 / 4096, cells within 60 dB of the peak), 8 x (1 - envelope
// correlation), an onset-sharpness error, 0.3 x third-octave tone dB, 1.5 x excess dB and 1 x missing dB (energy beyond +-6 dB
// over third-octave x 10 ms cells). Plus the distances between the variants of one cue. Sounds here are rendered from recipes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderRecipe } from '../../runtime/kit/synth.js';
import { characterDistance, envelopeStats, prepareTarget, scoreAgainst, soundDistance } from '../../scripts/lib/sound-score.mjs';
import { SR, render } from './_synthetic.mjs';

const tone = (f, t60, { partials, attackS = 0.002, seed } = {}) => renderRecipe({ name: 'probe', meaning: 'a probe for the tests', durationS: t60 + 0.05, layers: [{ kind: 'tone', f, attackS, t60, partials }] }, { sampleRate: SR, seed }).channels;
const score = (a, b) => scoreAgainst(prepareTarget(a, SR), b);

test('a sound against itself scores nothing', () => {
  const a = render('bar-a');
  const s = score(a, a);
  assert.ok(s.total < 1e-6, JSON.stringify(s));
  assert.ok(s.envCorr > 0.9999 && s.onsetErr < 1e-9 && s.toneDb < 1e-6 && s.excess === 0 && s.missing === 0);
});

test('the level does not decide: the same sound 12 dB down scores nothing', () => {
  const a = render('mallet'), b = a.map((c) => c.map((x) => x * 0.25));
  assert.ok(score(a, b).total < 0.01, `${score(a, b).total}`);
});

test('nearer sounds score lower: a note 3 % off, then a semitone off, then another material, then a knock', () => {
  const a = tone(440, 0.3, { partials: [[1, 0], [2.76, -20]] });
  const near = tone(440 * 1.03, 0.3, { partials: [[1, 0], [2.76, -20]] }), semitone = tone(466.16, 0.3, { partials: [[1, 0], [2.76, -20]] });
  const other = tone(440, 0.3, { partials: [[1, 0], [2, -6], [3, -9]] }), knock = render('knock');
  const s = [near, semitone, other, knock].map((b) => score(a, b).total);
  assert.ok(s[0] < s[1] && s[1] < s[3] && s[0] < s[2], s.map((v) => v.toFixed(2)).join(' < '));
});

test('a sound that rings longer or dies sooner costs envelope correlation and excess or missing energy', () => {
  const a = tone(440, 0.3, { partials: [[1, 0]] });
  const long = score(a, tone(440, 0.6, { partials: [[1, 0]] })), short = score(a, tone(440, 0.1, { partials: [[1, 0]] }));
  assert.ok(long.excess > 0.5, `excess ${long.excess}`);
  assert.ok(short.missing > 0.5, `missing ${short.missing}`);
  assert.ok(long.envCorr < 1 && short.envCorr < 1);
});

test('a blunt onset against a sharp one costs the onset error', () => {
  // a noise burst: the onset measure reads broadband attacks (a low sine's own cycle ripples a 0.125 ms level)
  const burst = (attackS) => renderRecipe({ name: 'probe', meaning: 'a probe for the tests', durationS: 0.1, layers: [{ kind: 'noise', filter: { type: 'bandpass', f: 3000, q: 0.7 }, attackS, t60: 0.08 }] }, { sampleRate: SR }).channels;
  const sharp = burst(0.0005), blunt = burst(0.006);
  assert.ok(score(sharp, blunt).onsetErr > 0.5, `${score(sharp, blunt).onsetErr}`);
  assert.ok(score(sharp, burst(0.0005)).onsetErr < 1e-9);
});

test('the total is the weighted sum the score is defined as', () => {
  const s = score(render('bar-a'), render('string'));
  const sum = s.mel + 0.3 * s.toneDb + 8 * (1 - s.envCorr) + Math.min(s.onsetErr, 2) + 1.5 * s.excess + s.missing;
  assert.ok(Math.abs(sum - s.total) < 1e-9, `${sum} against ${s.total}`);
  assert.equal(s.melByRes.length, 3);
});

test('a prepared target scores the same as one prepared again, whatever the candidate\'s length', () => {
  const t = prepareTarget(render('bar-a'), SR);
  for (const b of [render('knock'), render('string'), tone(300, 1.2, { partials: [[1, 0]] })]) {
    assert.deepEqual(scoreAgainst(t, b), scoreAgainst(prepareTarget(render('bar-a'), SR), b));
  }
});

test('the distance between two variants: a take of one cue is near, another cue is far', () => {
  const recipe = { name: 'probe', meaning: 'a probe for the tests', durationS: 0.2, vary: { pitch: 0.02, force: 0.12 }, layers: [{ kind: 'noise', filter: { type: 'bandpass', f: 1500, q: 1.5 }, attackS: 0.002, t60: 0.05 }, { kind: 'tone', f: 600, attackS: 0.002, t60: 0.12, peak: 0.6 }] };
  const take = (seed) => renderRecipe(recipe, { sampleRate: SR, seed }).channels;
  const same = soundDistance(take(1), take(2), SR), far = soundDistance(take(1), render('bar-a'), SR);
  assert.ok(same.total < far.total && same.total < 3, `${same.total} against ${far.total}`);
  assert.ok(far.toneDb > same.toneDb && far.envelope > 0);
  assert.equal(soundDistance(take(1), take(1), SR).total, 0);
});

test('the envelope statistics: the attack, the times to fall 10, 20 and 40 dB, the centroid, the crest and the level at the end', () => {
  const e = envelopeStats(tone(440, 0.3, { partials: [[1, 0]] }), SR);
  assert.ok(e.attackMs >= 0 && e.attackMs <= 6);
  assert.ok(e.t10Ms < e.t20Ms && e.t20Ms < e.t40Ms);
  assert.ok(Math.abs(e.t20Ms - 100) < 25, `20 dB in ${e.t20Ms} ms for a 0.3 s T60`);
  assert.ok(e.endDb <= -40);
});

test('character distance: eight features, zero for a sound against itself, near 1.4 for a knock against a note', () => {
  const a = render('bar-a');
  assert.equal(characterDistance(a, a, SR), 0);
  assert.ok(characterDistance(a, render('knock'), SR) > 1.0, 'a knock against a note sits near 1.4');
  assert.ok(characterDistance(a, render('string'), SR) < 0.5 && characterDistance(a, render('bar-e'), SR) < 0.5, 'notes of one family sit close');
  assert.ok(characterDistance(a, tone(440, 0.3, { partials: [[1, 0], [2.76, -20], [5.4, -30]] }), SR) < 0.5, 'the same recipe, level-matched or not');
});
