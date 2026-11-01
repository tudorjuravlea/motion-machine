// W-CUE with the sync lock (SPEC §7, §9): the sound is judged against the picture where it plays, not where the schedule
// starts it. An end-anchored cue is measured at its landing (this removes the old "known limit"), a deviation one role offset
// explains is deliberate and named, `soundOk` acknowledges one, and a grid the kick check marked unusable is not snapped to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cueVerdict } from '../../scripts/check/_cue.mjs';

const ev = (t, cue, extra = {}) => ({ t, kind: 'cue', cue, selector: `#${cue}`, scene: 's', ...extra });
const sched = (...events) => ({ kind: 'film', duration: 6, events });
const grid = (beats, extra = {}) => () => ({ beats, declared: true, ...extra });
const lockFor = (name, pictureS, vs, o = {}) => ({ name, requestedAt: pictureS, at: pictureS, lock: { role: 'click', anchor: 'onset', offsetMs: 0, offsetFrom: 'role', pictureS, struck: true, ringMs: 0, vsPictureMs: { onset: 0, peak: 4, apex: 8, end: 100, ...vs }, ...o } });

test('an end-anchored cue is held against the grid at its landing, not at its start', () => {
  const s = sched(ev(0.3, 'riser', { d: 1.2, anchor: 'end' }));
  const r = cueVerdict(s, grid([0.25, 1.5, 2.5]), () => null);
  assert.equal(r.status, 'PASS', JSON.stringify(r.evidence));
  assert.equal(r.evidence.measured, 0);
  // the same event read at its start (the old reading) sits 50 ms from a beat at 0.25 and passes too: the landing is what is measured
  const off = cueVerdict(sched(ev(0.3, 'riser', { d: 1.2, anchor: 'end' })), grid([0.25, 1.57]), () => null);
  assert.equal(off.status, 'WARN');
  assert.equal(off.evidence.drifts[0].driftMs, 70);
});

test('a lock that sits on its picture passes, with or without a beat grid', () => {
  const s = sched(ev(1.25, 'press'));
  const lk = () => [lockFor('press', 1.25, { onset: -11, peak: -7 })];
  assert.equal(cueVerdict(s, grid([1.25]), lk).status, 'PASS');
  assert.equal(cueVerdict(s, grid(null), lk).status, 'PASS', 'locks are judged without a grid');
  assert.equal(cueVerdict(s, grid(null), () => null).status, 'SKIP', 'no grid and no lock: nothing to judge');
});

test('a sound that leads its picture by more than 45 ms warns; one role offset that explains it makes it deliberate', () => {
  const s = sched(ev(1.25, 'tap'));
  const early = cueVerdict(s, grid(null), () => [lockFor('tap', 1.25, { onset: -90, peak: -85 })]);
  assert.equal(early.status, 'WARN');
  assert.match(early.evidence.reason, /tap/);
  assert.equal(early.evidence.sync[0].test, 'impact');
  const named = cueVerdict(s, grid(null), () => [lockFor('tap', 1.25, { onset: -60, peak: -55 }, { role: 'tap', offsetMs: -60 })]);
  assert.equal(named.status, 'PASS');
  assert.equal(named.evidence.deliberate.length, 1);
  assert.match(named.evidence.deliberate[0].explained, /role tap/);
});

test('a late peak, a whoosh apex off its cut and a riser that rings on each warn', () => {
  const late = cueVerdict(sched(ev(1, 'hit')), grid(null), () => [lockFor('hit', 1, { onset: 40, peak: 120 })]);
  assert.equal(late.status, 'WARN'); assert.match(late.evidence.reason, /late/);
  const wh = cueVerdict(sched(ev(1, 'swipe')), grid(null), () => [lockFor('swipe', 1, { apex: 90 }, { anchor: 'apex', role: 'whoosh' })]);
  assert.equal(wh.status, 'WARN'); assert.match(wh.evidence.reason, /apex/);
  const ring = cueVerdict(sched(ev(0.3, 'riser', { d: 1.2, anchor: 'end' })), grid(null), () => [lockFor('riser', 1.5, { end: -23 }, { anchor: 'end', role: 'riser', offsetMs: -23, ringMs: 90 })]);
  assert.equal(ring.status, 'WARN'); assert.match(ring.evidence.reason, /rings/);
});

test('a beat\'s soundOk acknowledges a deviation and names the reason', () => {
  const s = sched(ev(1.25, 'tap', { params: { soundOk: 'the tap is meant to lead' } }));
  const r = cueVerdict(s, grid(null), () => [lockFor('tap', 1.25, { onset: -90, peak: -85 })]);
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.acknowledged[0].reason, 'the tap is meant to lead');
});

test('a grid marked unusable by the kick check is not snapped to: SKIP, with the reason', () => {
  const r = cueVerdict(sched(ev(1.37, 'tick')), grid(null, { unusable: true, kickShare: 0.2 }), () => null);
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /kick/);
  assert.match(r.evidence.reason, /20 %/);
});

test('the drift check is what it was: a cue 120 ms from the nearest beat warns', () => {
  const r = cueVerdict(sched(ev(1.37, 'hit')), grid([1.25, 1.75]), () => null);
  assert.equal(r.status, 'WARN');
  assert.match(r.evidence.reason, /more than 40 ms from the nearest beat/);
  assert.equal(r.evidence.drifts[0].driftMs, -120);
});

test('planCues snaps the picture event: an end-anchored cue is snapped by its landing, and `at` is the instant its anchor meets', async () => {
  const { planCues } = await import('../../scripts/sound.mjs');
  const plan = planCues([{ t: 0.3, pictureS: 1.52, name: 'riser' }, { t: 2.4, name: 'tick' }], [0.5, 1.5, 2.5]);
  assert.deepEqual(plan.map((c) => c.at), [1.5, 2.5]);
  assert.deepEqual(plan.map((c) => c.requestedAt), [1.52, 2.4]);
  assert.deepEqual(plan.map((c) => c.driftMs), [-20, 100]);
});
