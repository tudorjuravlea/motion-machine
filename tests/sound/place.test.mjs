// Exact placement (SPEC §9): a cue's anchor point (its onset, apex or end, measured on the rendered sound) meets its
// picture event plus the role's offset; the sync lock records where each point sits against the picture; the lock
// is judged (a sound leading by more than 45 ms reads early, a peak more than 75 ms late reads late, a whoosh apex
// within 45 ms of its cut, an end-anchored riser ending 250 ms before to 30 ms after its hit, one that rings more
// than 30 ms past its peak). A deviation that exactly one role offset (30 ms or more) explains is deliberate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cueAnchors, offsetFor, placeCue, lockOf, judgeLock, SYNC } from '../../scripts/lib/sound-place.mjs';
import { ROLES } from '../../scripts/lib/sound-roles.mjs';

const SR = 48000;
const buf = (seconds, f) => { const x = new Float32Array(Math.round(seconds * SR)); for (let i = 0; i < x.length; i++) x[i] = f(i / SR); return [x, x.slice()]; };
/** A decaying 1 kHz click starting at `at` s. */
const click = (at, seconds = 0.5) => buf(seconds, (t) => (t < at ? 0 : Math.exp(-(t - at) * 60) * Math.sin(2 * Math.PI * 1000 * (t - at))));
/** A swell: noise-free tone rising to its peak at `peak` s, then a 20 ms release. */
const swell = (peak, seconds = 1.2) => buf(seconds, (t) => (t <= peak ? (t / peak) ** 2 : Math.max(0, 1 - (t - peak) / 0.02)) * Math.sin(2 * Math.PI * 440 * t));
/** A bell-shaped whoosh with its apex at `apex` s. */
const whoosh = (apex, seconds = 0.8) => buf(seconds, (t) => Math.exp(-(((t - apex) / 0.12) ** 2)) * Math.sin(2 * Math.PI * 700 * t));

test('cueAnchors: the onset is the first sample within 20 dB of the peak, to the sample', () => {
  const a = cueAnchors(click(0.1), SR);
  assert.ok(Math.abs(a.onsetS - 0.1) <= 0.0006, `onset ${a.onsetS}`);
  assert.ok(a.peakS >= a.onsetS && a.peakS - a.onsetS < 0.01, `peak ${a.peakS}`);
  assert.equal(cueAnchors([new Float32Array(100)], SR), null, 'silence has no anchors');
});

test('cueAnchors: the apex of a whoosh is the centre of its loudest 50 ms, the end of a riser its last audible sample', () => {
  const w = cueAnchors(whoosh(0.4), SR);
  assert.ok(Math.abs(w.apexS - 0.4) <= 0.01, `apex ${w.apexS}`);
  const r = cueAnchors(swell(0.9), SR);
  assert.ok(r.endS >= 0.9 && r.endS <= 0.92, `end ${r.endS}`);
  assert.ok(r.ringS <= SYNC.ringMs / 1000, `a riser that stops on its peak rings ${r.ringS} s past it`);
  assert.ok(Math.abs(r.peakS - 0.9) <= 0.01, `peak ${r.peakS}`);
});

test('offsetFor: the beat wins over the style, the style over the role; nothing set is the role\'s own', () => {
  assert.deepEqual(offsetFor('tap', {}, null), { role: 'tap', anchor: 'onset', offsetMs: ROLES.tap.offsetMs, from: 'role' });
  const style = { sound: { roles: { tap: { offsetMs: -30 } } } };
  assert.equal(offsetFor('tap', {}, style).offsetMs, -30);
  assert.equal(offsetFor('tap', {}, style).from, 'style');
  assert.equal(offsetFor('tap', { offsetMs: -5 }, style).offsetMs, -5);
  assert.equal(offsetFor('tap', { offsetMs: -5 }, style).from, 'beat');
  assert.equal(offsetFor('swipe', {}, null).anchor, 'apex');
  assert.equal(offsetFor('riser', {}, null).anchor, 'end');
  assert.equal(offsetFor('unheard-of', {}, null).role, 'tone');
});

test('placeCue: each role\'s anchor lands at the picture event plus its offset, to the sample', () => {
  const picture = 1.25;
  for (const [cue, make] of [['tap', () => click(0.12)], ['click', () => click(0.03)], ['hit', () => click(0.2)], ['swipe', () => whoosh(0.35)], ['riser', () => swell(1.0)]]) {
    const ch = make(), a = cueAnchors(ch, SR), off = offsetFor(cue, {}, null);
    const p = placeCue({ pictureS: picture, anchors: a, offset: off });
    const at = p.startS + a[{ onset: 'onsetS', apex: 'apexS', end: 'endS' }[off.anchor]];
    assert.ok(Math.abs(at - (picture + off.offsetMs / 1000)) <= 0.0005, `${cue}: ${at} against ${picture + off.offsetMs / 1000}`);
  }
});

test('lockOf: where each point sits against the picture event, in ms', () => {
  const a = cueAnchors(click(0.1), SR);
  const off = offsetFor('click', {}, null);
  const lock = lockOf({ pictureS: 2, anchors: a, offset: off });
  assert.equal(lock.role, 'click');
  assert.equal(lock.anchor, 'onset');
  assert.equal(lock.offsetMs, ROLES.click.offsetMs);
  assert.ok(Math.abs(lock.vsPictureMs.onset - ROLES.click.offsetMs) <= 1, JSON.stringify(lock.vsPictureMs));
  assert.ok(lock.vsPictureMs.peak >= lock.vsPictureMs.onset);
});

const lock = (o) => ({ role: 'click', anchor: 'onset', offsetMs: 0, struck: true, ringMs: 0, vsPictureMs: { onset: 0, peak: 5, apex: 10, end: 200, ...(o.vs ?? {}) }, ...o, vs: undefined });

test('judgeLock: a sound leading by more than 45 ms reads early, a peak more than 75 ms late reads late, inside both is ok', () => {
  assert.equal(judgeLock(lock({ vs: { onset: -30 } })).status, 'ok');
  const early = judgeLock(lock({ vs: { onset: -50 } }));
  assert.equal(early.status, 'issue');
  assert.match(early.issue, /leads/);
  const late = judgeLock(lock({ vs: { onset: 20, peak: 80 } }));
  assert.equal(late.status, 'issue');
  assert.match(late.issue, /late/);
  assert.equal(judgeLock(lock({ struck: false, vs: { onset: 20, peak: 400 } })).status, 'ok', 'a swell has no struck peak to be late');
});

test('judgeLock: a deviation that exactly one role offset (30 ms or more) explains is deliberate and names it', () => {
  const j = judgeLock(lock({ role: 'tap', offsetMs: -60, vs: { onset: -60, peak: -50 } }));
  assert.equal(j.status, 'deliberate');
  assert.equal(j.explained.offsetMs, -60);
  assert.match(j.explained.text, /role tap/);
  // an offset under 30 ms explains nothing
  assert.equal(judgeLock(lock({ offsetMs: -20, vs: { onset: -60, peak: -50 } })).status, 'issue');
  // an offset that does not explain it
  assert.equal(judgeLock(lock({ offsetMs: -40, vs: { onset: -120, peak: -110 } })).status, 'issue');
});

test('judgeLock: params.cue.soundOk acknowledges a deviation with its reason', () => {
  const j = judgeLock(lock({ vs: { onset: -90, peak: -80 } }), { soundOk: 'the sound is meant to lead' });
  assert.equal(j.status, 'acknowledged');
  assert.equal(j.reason, 'the sound is meant to lead');
});

test('judgeLock: a whoosh apex within 45 ms of its cut is ok, beyond it is not; a riser ends 250 ms before to 30 ms after its hit', () => {
  const w = (apex, offsetMs = 0) => lock({ role: 'whoosh', anchor: 'apex', offsetMs, vs: { apex, onset: -300, peak: apex } });
  assert.equal(judgeLock(w(40)).status, 'ok');
  assert.equal(judgeLock(w(60)).status, 'issue');
  assert.equal(judgeLock(w(-100, -100)).status, 'deliberate');
  const r = (end, ringMs = 0) => lock({ role: 'riser', anchor: 'end', offsetMs: -23, ringMs, vs: { end, onset: -1200 } });
  assert.equal(judgeLock(r(-23)).status, 'ok');
  assert.equal(judgeLock(r(-300)).status, 'issue');
  assert.equal(judgeLock(r(60)).status, 'issue');
});

test('judgeLock: an end-aligned riser that rings on more than 30 ms past its peak warns, because its climax would land early', () => {
  const j = judgeLock(lock({ role: 'riser', anchor: 'end', offsetMs: -23, ringMs: 80, vs: { end: -23, onset: -1200 } }));
  assert.equal(j.status, 'issue');
  assert.match(j.issue, /rings/);
  assert.equal(judgeLock(lock({ role: 'riser', anchor: 'end', offsetMs: -23, ringMs: 20, vs: { end: -23, onset: -1200 } })).status, 'ok');
});
