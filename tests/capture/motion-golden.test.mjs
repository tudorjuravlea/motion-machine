// `capture-motion` on the two golden films, whose ground truth is the
// kit's own schedule of their story under their style, and the motion style each was made with
// (styles/motion/kinetic.json, styles/motion/calm.json). Never typed numbers.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureMotion, extractFrames, analyse } from '../../scripts/capture-motion.mjs';
import { truthOf, LABELLED, FAMILY_OF } from './motion-truth.mjs';

const KINETIC = LABELLED.find((f) => f.id === 'golden-kinetic');
const EDITORIAL = LABELLED.find((f) => f.id === 'golden-editorial');
const ONSET = 0.1 + 1e-6; // a gradual cut's first visible change may trail its scheduled start by an eased frame or three

const run = {};
before(async () => {
  for (const f of [KINETIC, EDITORIAL]) {
    const out = join(mkdtempSync(join(tmpdir(), 'mm-capture-golden-')), `${f.id}.json`);
    const truth = await truthOf(f.dir, f.style);
    const result = await captureMotion({ from: f.video, name: f.id, out });
    run[f.id] = { truth, result, notes: readFileSync(result.notesPath, 'utf8') };
  }
});

for (const f of [KINETIC, EDITORIAL]) {
  test(`${f.id}: every scheduled cut is found, with its pattern's kind and direction, near its instant`, () => {
    const { truth, result } = run[f.id];
    const cuts = result.analysis.cuts;
    assert.deepEqual(cuts.map((c) => c.kind), truth.cuts.map((c) => c.kind), JSON.stringify(cuts.map((c) => [c.t, c.kind])));
    truth.cuts.forEach((c, i) => {
      assert.equal(cuts[i].direction ?? null, c.direction, `cut ${i} at ${c.t}: direction`);
      assert.ok(Math.abs(cuts[i].t - c.t) <= ONSET, `cut ${i}: detected ${cuts[i].t}, scheduled ${c.t}`);
    });
  });

  test(`${f.id}: the headline entrance is its style's family, read from the frames`, () => {
    const { truth, result, notes } = run[f.id];
    assert.equal(FAMILY_OF[result.motion.entrances.headline], FAMILY_OF[truth.motion.entrances.headline]);
    assert.match(notes, /entrances\.headline: entrances\/\S+, family /, 'derived, not defaulted');
  });
}

test('golden-kinetic: energy high, arrivals within one of the style, durations within 20 %', () => {
  const { truth, result } = run['golden-kinetic'];
  const want = truth.motion;
  assert.equal(want.pacing.energy, 'high', 'the fixture is the kinetic film');
  assert.equal(result.motion.pacing.energy, 'high');
  result.motion.pacing.arrivalsPer10s.forEach((n, i) => assert.ok(Math.abs(n - want.pacing.arrivalsPer10s[i]) <= 1,
    `arrivalsPer10s ${JSON.stringify(result.motion.pacing.arrivalsPer10s)} vs ${JSON.stringify(want.pacing.arrivalsPer10s)}`));
  // quick is judged on the changes whose pattern takes quick (the whip-pan); the derived
  // quick role also takes a spring-driven arrival, documented in the next test.
  const quickCuts = result.facts.timedCuts.filter((c) => truth.cuts.some((t) => t.kind === c.kind && t.pattern === 'transitions/whip-pan'));
  assert.ok(quickCuts.length, 'the film has a timed whip-pan');
  for (const c of quickCuts) assert.ok(Math.abs(c.d * 1000 - want.motion.durations.quick) / want.motion.durations.quick <= 0.2, `quick (${c.kind} at ${c.t} s): captured ${Math.round(c.d * 1000)} ms, style ${want.motion.durations.quick} ms`);
  for (const role of ['standard', 'slow']) {
    const got = result.motion.motion.durations[role], exp = want.motion.durations[role];
    assert.ok(Math.abs(got - exp) / exp <= 0.2, `${role}: captured ${got} ms, style ${exp} ms`);
  }
});

test('golden-kinetic: known limit: the derived quick (152 ms) also takes a spring-driven drop, so it sits above the whip-pan', () => {
  const { truth, result } = run['golden-kinetic'];
  const pre = truth.motion.motion.durations;
  const fps = result.analysis.fps;
  // The quick role's basin (scripts/capture-motion.mjs, durationRoles): from quick / 1.6 to the geometric mean with standard.
  const inQuick = result.facts.arrivals.filter((a) => a.burst >= 3 / fps - 1e-9 && a.d * 1000 >= pre.quick / 1.6 && a.d * 1000 < Math.sqrt(pre.quick * pre.standard));
  assert.ok(inQuick.length, 'an arrival falls in the quick basin');
  for (const a of inQuick) {
    const sched = truth.arrivals.find((s) => Math.abs(s.t - a.t) <= ONSET);
    assert.ok(sched?.spring && sched.fx === 'entrances/drop', `arrival at ${a.t} s in the quick basin: scheduled ${JSON.stringify(sched)}`);
  }
  const whip = result.facts.timedCuts.find((c) => c.kind === 'whip-pan');
  assert.equal(result.motion.motion.durations.quick, 152, 'the derived quick, as documented in the capture notes');
  assert.ok(result.motion.motion.durations.quick > Math.round(whip.d * 1000), 'the drop pulls the derived quick above the whip-pan');
  assert.match(result.notesPath && readFileSync(result.notesPath, 'utf8'), /A spring-driven arrival .* can land in a duration role's basin and pull that derived role/);
});

test('golden-editorial: energy calm', () => {
  assert.equal(run['golden-editorial'].result.motion.pacing.energy, 'calm');
});

test('the notes say what was derived, what was defaulted and why (no preset copied silently)', () => {
  const { notes } = run['golden-kinetic'];
  assert.match(notes, /pacing\.energy: \*\*high\*\*: weighted votes/);
  assert.match(notes, /cut timing \(move easing\): push \(left\)/);
  assert.match(notes, /## Defaulted \(from styles\/motion\/kinetic\.json, the high preset\)/);
  assert.match(notes, /entrances\.body, figure, plate: kinetic/);
  assert.match(notes, /\| whip-pan \(left\) \|/);
});

test('read at 10 fps only, the 0.12 s whip-pan cannot be told from a push; at the source rate it can', async () => {
  const ten = analyse(await extractFrames(KINETIC.video, { fps: 10 }));
  const at = (cuts) => cuts.find((c) => Math.abs(c.t - 18.5) <= 0.15)?.kind;
  assert.notEqual(at(ten.cuts), 'whip-pan');
  assert.equal(at(run['golden-kinetic'].result.analysis.cuts), 'whip-pan');
});
