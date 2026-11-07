// energy bands calibrated on labelled films. The labelled set is the two golden films and
// two reference stories (fixtures/capture/reference/pieces/tempo-a, tempo-b) rendered under each
// motion preset (calm, premium = medium, kinetic = high) by fixtures/capture/reference/render.mjs.
// Each film's label is the energy of the motion style it was made with.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { extractFrames, analyse, deriveMotion, energyFeatures, calibrateEnergy, energyFrom, ENERGY_CALIBRATION } from '../../scripts/capture-motion.mjs';
import { truthOf, LABELLED, FAMILY_OF } from './motion-truth.mjs';

// A crossfade between shots that carry text (owns-exit) is drawn through the canvas, like a
// color-dip; capture reports the two as one class outside the golden films (see the notes).
const THROUGH = new Set(['fade', 'dip']);
const sameKind = (a, b) => a === b || (THROUGH.has(a) && THROUGH.has(b));

const films = [];
before(async () => {
  for (const f of LABELLED) {
    const truth = await truthOf(f.dir, f.style);
    const analysis = analyse(await extractFrames(f.video));
    films.push({ ...f, truth, energy: truth.motion.pacing.energy, analysis, features: energyFeatures(analysis) });
  }
});

test('the labelled set holds every energy at least twice (sanity of the fixtures)', () => {
  for (const e of ['calm', 'medium', 'high']) assert.ok(films.filter((f) => f.energy === e).length >= 2, e);
  assert.ok(films.length >= 6);
});

test('each labelled film is captured with its own energy', () => {
  for (const f of films) {
    const { motion } = deriveMotion(f.analysis, { name: 'labelled', source: f.id });
    assert.equal(motion.pacing.energy, f.energy, `${f.id}: ${JSON.stringify(energyFrom(f.features))}`);
  }
});

test('leave-one-out: bands calibrated without a film still give that film its energy', () => {
  for (const f of films) {
    const bands = calibrateEnergy(films.filter((g) => g !== f));
    const r = energyFrom(f.features, bands);
    assert.equal(r.energy, f.energy, `${f.id} left out: ${JSON.stringify(r)}`);
  }
});

test('the shipped bands are the calibration of the labelled films (regenerable, not hand-tuned)', () => {
  const cal = calibrateEnergy(films);
  for (const key of ['anchors', 'spreads']) {
    for (const [feat, v] of Object.entries(cal[key])) {
      const shipped = ENERGY_CALIBRATION[key][feat];
      [v].flat().forEach((x, i) => assert.ok(Math.abs(x - [shipped].flat()[i]) <= 0.02 + 0.05 * Math.abs(x), `${key}.${feat}: shipped ${JSON.stringify(shipped)}, measured ${JSON.stringify(v)}`));
    }
  }
  for (const [feat, w] of Object.entries(cal.weights)) {
    w.forEach((x, i) => assert.equal(x > 0, ENERGY_CALIBRATION.weights[feat][i] > 0, `weights.${feat}[${i}]: shipped ${ENERGY_CALIBRATION.weights[feat]}, measured ${w}`));
  }
});

test('every labelled film: cuts found at their instants with their kind (fade and dip as one class)', () => {
  for (const f of films) {
    const cuts = f.analysis.cuts;
    assert.equal(cuts.length, f.truth.cuts.length, `${f.id}: ${JSON.stringify(cuts.map((c) => [c.t, c.kind]))}`);
    f.truth.cuts.forEach((c, i) => {
      assert.ok(sameKind(cuts[i].kind, c.kind), `${f.id} cut ${i} at ${c.t}: ${cuts[i].kind} vs ${c.kind}`);
      assert.equal(cuts[i].direction ?? null, c.direction, `${f.id} cut ${i}: direction`);
      assert.ok(Math.abs(cuts[i].t - c.t) <= 0.1 + 1e-6, `${f.id} cut ${i}: ${cuts[i].t} vs ${c.t}`);
    });
  }
});

test('the headline family is never a wrong one: the style\'s family, or "not distinguishable" in the notes', () => {
  for (const f of films) {
    const { motion, facts } = deriveMotion(f.analysis, { name: 'labelled', source: f.id });
    const derived = facts.derived.some((d) => d.startsWith('entrances.headline'));
    if (derived) assert.equal(FAMILY_OF[motion.entrances.headline], FAMILY_OF[f.truth.motion.entrances.headline], f.id);
    else assert.ok(facts.defaulted.some((d) => d.startsWith('entrances.headline: not distinguishable')), f.id);
  }
});
