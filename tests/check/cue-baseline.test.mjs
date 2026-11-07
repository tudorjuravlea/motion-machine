// W-CUE's chance baseline (SPEC §7, §9): the share of picture events with a sound onset within 100 ms, beside the same share with
// the events shifted by fixed offsets. Evidence only: it adds no warning. And W-CUE with only a bed cue read nothing, so it is a SKIP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cueVerdict } from '../../scripts/check/_cue.mjs';
import { baselineOf, WITHIN_S, SHIFTS_S } from '../../scripts/check/_cue-baseline.mjs';

const ev = (t, cue, extra = {}) => ({ t, kind: 'cue', cue, selector: `#${cue}`, scene: 's', ...extra });
const sched = (...events) => ({ kind: 'film', duration: 6, events });
const grid = (beats) => () => ({ beats, declared: true });
const lock = (name, pictureS, onsetMs = 0) => ({ name, requestedAt: pictureS, at: pictureS, lock: { role: 'click', anchor: 'onset', offsetMs: 0, offsetFrom: 'role', pictureS, onsetS: pictureS + onsetMs / 1000, struck: true, ringMs: 0, vsPictureMs: { onset: onsetMs, peak: onsetMs + 4, apex: 0, end: 90 } } });

test('the window is 100 ms and the shifts are 100, 170, 230 and 290 ms both ways', () => {
  assert.equal(WITHIN_S, 0.1);
  assert.deepEqual(SHIFTS_S, [0.1, 0.17, 0.23, 0.29, -0.1, -0.17, -0.23, -0.29]);
});

test('baselineOf: sounds on their pictures read 1; shifted away they read lower; sounds a long way from each other read 0 shifted', () => {
  const b = baselineOf([1, 2, 3, 4], [1, 2, 3, 4]);
  assert.equal(b.events, 4);
  assert.equal(b.share, 1);
  assert.equal(b.shiftedShare, 0, 'one second apart: no shift reaches a neighbour, and a shift of exactly 100 ms is not within 100 ms');
  assert.equal(b.gain, 1);
  const crowd = baselineOf([1, 1.2, 1.4, 1.6], [1, 1.2, 1.4, 1.6]);
  assert.equal(crowd.share, 1);
  assert.ok(crowd.shiftedShare > 0.3, `${crowd.shiftedShare}: neighbours 0.2 s apart are reached by the shifts`);
  assert.ok(crowd.gain < 0.7);
});

test('W-CUE with locks carries the baseline in its evidence, on a pass and on a warning', () => {
  const s = sched(ev(1, 'press'), ev(2, 'press'), ev(3, 'press'));
  const locks = () => [lock('press', 1), lock('press', 2), lock('press', 3)];
  const pass = cueVerdict(s, grid(null), locks);
  assert.equal(pass.status, 'PASS');
  assert.equal(pass.evidence.baseline.events, 3);
  assert.equal(pass.evidence.baseline.share, 1);
  assert.equal(pass.evidence.baseline.shiftedShare, 0);
  const warn = cueVerdict(s, grid(null), () => [lock('press', 1, -90), lock('press', 2), lock('press', 3)]);
  assert.equal(warn.status, 'WARN');
  assert.ok(warn.evidence.baseline);
});

test('without locks the baseline is skipped, with the reason, and the verdict is as before', () => {
  const r = cueVerdict(sched(ev(1.25, 'press')), grid([1.25]), () => null);
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.baseline.status, 'SKIP');
  assert.match(r.evidence.baseline.reason, /no sync locks/);
});

test('a schedule with only a bed cue read nothing: SKIP with a reason, not PASS with measured 0', () => {
  const r = cueVerdict(sched(ev(0, 'bed')), grid([0.5, 1]), () => null);
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /only a bed/);
});

test('a pass states how many cues it read', () => {
  const r = cueVerdict(sched(ev(1.25, 'press'), ev(2.5, 'press')), grid([1.25, 2.5]), () => null);
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.cues, 2);
});
