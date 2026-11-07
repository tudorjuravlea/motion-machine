// The modal fit (scripts/lib/modal-fit.mjs): a tonal sound -> its modes, each with a frequency, a decay and an amplitude
// (damped sinusoids found by ESPRIT on sub-bands, amplitudes by least squares). The sounds are rendered from known recipes
// (runtime/kit/synth.js), whose partials are sines with a known T60 each (partial n decays in t60 x ratio^-0.75), so the
// modes are known: a fit must find them within 2 % in frequency and 20 % in decay, and mining must keep them in the record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderRecipe } from '../../runtime/kit/synth.js';
import { fitModes, modalPartials } from '../../scripts/lib/modal-fit.mjs';
import { analyseSound } from '../../scripts/lib/sound-mine.mjs';
import { KNOWN, SR, render } from './_synthetic.mjs';

const T60_LAW = 0.75;
/** The modes a tone layer has: [f, t60, dB] per partial, by the synth's own decay law. */
const truth = (f, t60, partials) => partials.map(([ratio, db]) => [f * ratio, ratio > 1 ? Math.max(Math.min(0.028, t60), t60 * ratio ** -T60_LAW) : t60, db]);
const tone = (f, t60, partials, attackS = 0.002) => renderRecipe({ name: 'probe', meaning: 'a probe for the tests', durationS: t60 + 0.05, layers: [{ kind: 'tone', f, attackS, t60, partials }] }, { sampleRate: SR }).channels;

/** Every true mode is found within 2 % in frequency and 20 % in decay; returns the fit's modes matched to the truth. */
function assertFound(fit, want, what) {
  assert.ok(fit.ok, `${what}: no fit`);
  for (const [f, t60] of want) {
    const near = fit.modes.filter((m) => Math.abs(m.f / f - 1) <= 0.02).sort((a, b) => Math.abs(a.f - f) - Math.abs(b.f - f))[0];
    assert.ok(near, `${what}: no mode within 2 % of ${f.toFixed(1)} Hz in ${JSON.stringify(fit.modes.map((m) => Math.round(m.f)))}`);
    assert.ok(Math.abs(near.t60S / t60 - 1) <= 0.2, `${what}: ${f.toFixed(0)} Hz decays in ${near.t60S.toFixed(3)} s, wanted ${t60.toFixed(3)} s`);
  }
}

test('a bar (1 : 2.76 : 5.4): the three modes, their frequencies and their decays', () => {
  const partials = [[1, 0], [2.76, -20], [5.4, -30]];
  const fit = fitModes(tone(440, 0.3, partials), SR);
  assertFound(fit, truth(440, 0.3, partials), 'bar');
  assert.ok(fit.residualDb < -20, `the modes explain the sound: residual ${fit.residualDb} dB`);
});

test('a string (1 : 2 : 3 : 4), whose modes sit in different bands and one above the other', () => {
  const partials = [[1, 0], [2, -6], [3, -9], [4, -12]];
  assertFound(fitModes(tone(330, 0.4, partials), SR), truth(330, 0.4, partials), 'string');
});

test('a mallet (1 : 3.99) at another pitch, and a high short note', () => {
  assertFound(fitModes(tone(392, 0.3, [[1, 0], [3.99, -24]]), SR), truth(392, 0.3, [[1, 0], [3.99, -24]]), 'mallet');
  assertFound(fitModes(tone(1760, 0.12, [[1, 0], [2.76, -18]]), SR), truth(1760, 0.12, [[1, 0], [2.76, -18]]), 'high');
});

test('the amplitudes come back in dB under the strongest, and the fundamental is the lowest strong mode', () => {
  const fit = fitModes(tone(440, 0.3, [[1, 0], [2.76, -20], [5.4, -30]]), SR);
  const top = fit.modes.reduce((a, b) => (b.db > a.db ? b : a));
  assert.equal(top.db, 0);
  const p = modalPartials(fit);
  assert.ok(Math.abs(p.f0Hz / 440 - 1) < 0.005, `${p.f0Hz}`);
  assert.deepEqual(p.partials[0], [1, 0]);
  assert.ok(p.partials.some(([r, db]) => Math.abs(r / 2.76 - 1) < 0.02 && db > -26 && db < -14), JSON.stringify(p.partials));
  assert.equal(p.t60S.length, p.partials.length, 'a decay for each partial');
  assert.ok(Math.abs(p.t60S[0] / 0.3 - 1) < 0.2);
});

test('the fit is the same every time, from a stereo mix of a mid and a side', () => {
  const a = fitModes(tone(440, 0.3, [[1, 0], [2.76, -20]]), SR), b = fitModes(tone(440, 0.3, [[1, 0], [2.76, -20]]), SR);
  assert.deepEqual(a, b);
});

test('a sound that is not at its start is read from its own peak, with a ramp of attack before it', () => {
  const partials = [[1, 0], [2.76, -20]];
  const slow = tone(523.25, 0.3, partials, 0.01);                      // a 10 ms attack
  assertFound(fitModes(slow, SR), truth(523.25, 0.3, partials), 'slow attack');
});

test('mining keeps the modes in the record: the tone layer\'s shape, a decay for each partial, a pitch to a hundredth', () => {
  for (const [name, k] of Object.entries(KNOWN).filter(([, x]) => x.pitchHz)) {
    const a = analyseSound(render(name), SR);
    assert.ok(a.modal, `${name}: no modal record`);
    assert.ok(Math.abs(a.modal.f0Hz / k.pitchHz - 1) < 0.01, `${name}: ${a.modal.f0Hz} against ${k.pitchHz}`);
    assert.equal(a.modal.t60S.length, a.modal.partials.length);
    assert.deepEqual(a.modal.partials[0], [1, 0]);
    for (const [ratio] of k.ratios.map((r) => [r])) assert.ok(a.modal.partials.some(([r]) => Math.abs(r / ratio - 1) <= 0.03), `${name}: no modal partial near ${ratio} in ${JSON.stringify(a.modal.partials)}`);
    assert.ok(Math.abs(a.modal.t60S[0] / k.t60 - 1) <= 0.2, `${name}: fundamental T60 ${a.modal.t60S[0]} against ${k.t60}`);
  }
  assert.equal(analyseSound(render('knock'), SR).modal, null, 'a knock has no modes');
});
