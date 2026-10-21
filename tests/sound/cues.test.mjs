// Cue placement and the two cue gates. W-CUE reports a cue more than 40 ms from the
// beat grid (before snapping); W-MIX reports more than two cues at once, a retrigger inside 45 ms
// (the cooldown), cue peaks outside 6-8 dB over the bed, a rate outside the style's band and a cue
// with no visible event. Each rule returns one row with its reasons in the evidence.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PATTERNS, ctxFor, ensureNegatives, ensurePiece, PIECE, variant, withPicture } from '../../fixtures/sound/setup.mjs';
import { buildSound, planCues } from '../../scripts/sound.mjs';
import wCue from '../../scripts/check/W-CUE.mjs';
import wMix from '../../scripts/check/W-MIX.mjs';
const PICTURE = 'kit-smoke-cues-16x9.mp4';   // <story id>-<format>.mp4: the name `mm export` gives a render

let neg;
before(async () => { await ensurePiece(); neg = await ensureNegatives(); });

const withBand = (ctx, band) => ({ ...ctx, style: { ...ctx.style, sound: { ...ctx.style.sound, cuesPer10s: band } } });
// A hand-made schedule: cue events plus the arrival each marks.
const sched = (cues, { arrivals = true, duration = 10 } = {}) => ({
  kind: 'film', duration, scenes: [], rests: [],
  events: cues.flatMap(([t, cue], i) => [
    ...(arrivals ? [{ t, kind: 'arrive', selector: `#s${i}`, scene: 'a' }] : []),
    { t, kind: 'cue', selector: `#s${i}`, scene: 'a', cue },
  ]).sort((a, b) => a.t - b.t),
});
const wide = [0, 20];
// W-MIX answers PASS only when every half ran; a hand-made schedule has no rendered
// out/cues.json, so the peaks half is unmeasured and a clean result is SKIP (partial). A test that proves
// a structural rule passes gives the context a measured mix: a bed with its cue 7 dB over it, in band.
const measured = (ctx) => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-wmix-'));
  mkdirSync(join(dir, 'out'));
  writeFileSync(join(dir, 'out', 'cues.json'), JSON.stringify({ cues: [{ name: 'bed', at: 0, peakDb: -20 }, { name: 'tick', at: 1, peakDb: -13 }] }));
  return { ...ctx, dir };
};

// ---- W-CUE ----------------------------------------------------------------------------------

test('W-CUE: fixtures/negatives/W-CUE has a cue 120 ms off the grid and warns once, naming the drift', async () => {
  const r = await wCue(await ctxFor(neg.cue));
  assert.equal(r.id, 'W-CUE');
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.drifts.length, 1);
  assert.equal(Math.abs(r.evidence.drifts[0].driftMs), 120);
  assert.equal(r.evidence.measured, 120);
  assert.equal(r.evidence.threshold, 40);
  assert.equal(r.evidence.instant, 1.37);
  assert.match(r.evidence.selector, /data-slot="sub"/);
});

test('W-CUE: cues on the grid pass; 39 ms passes and 41 ms warns; a bed is not snapped so is not measured', async () => {
  const ctx = await ctxFor(PIECE);
  assert.equal((await wCue(ctx)).status, 'PASS');
  const at = (t) => ({ ...ctx, schedule: sched([[t, 'tick']]) });
  assert.equal((await wCue(at(1.25 + 0.039))).status, 'PASS');
  assert.equal((await wCue(at(1.25 + 0.041))).status, 'WARN');
  assert.equal((await wCue(at(1.25 - 0.041))).status, 'WARN');
  assert.equal((await wCue({ ...ctx, schedule: sched([[1.4, 'bed']]) })).status, 'PASS');
});

test('W-CUE: no grid, no cues, a deck, or a missing grid file each say why', async () => {
  const ctx = await ctxFor(PIECE);
  const noGrid = { ...ctx, story: { ...ctx.story, audio: { track: null, bpm: null, beats: null } } };
  const a = await wCue(noGrid);
  assert.equal(a.status, 'SKIP'); assert.match(a.evidence.reason, /no beat grid/);
  const b = await wCue({ ...ctx, schedule: sched([]) });
  assert.equal(b.status, 'SKIP'); assert.match(b.evidence.reason, /no cues/);
  const c = await wCue({ ...ctx, schedule: { kind: 'deck', events: [] } });
  assert.equal(c.status, 'SKIP'); assert.match(c.evidence.reason, /deck/);
  const d = await wCue({ ...ctx, story: { ...ctx.story, audio: { ...ctx.story.audio, beats: 'assets/missing.json' } } });
  assert.equal(d.status, 'WARN'); assert.match(d.evidence.reason, /does not exist/);
});

test('snapping: the nearest beat wins, the drift is recorded, the bed is left alone, and a snapped retrigger keeps its own instant', () => {
  const beats = [0.25, 0.75, 1.25, 1.75];
  const plan = planCues([
    { t: 0.3, name: 'tick' }, { t: 1.37, name: 'hit' }, { t: 1.45, name: 'bed' }, { t: 1.6, name: 'tick' },
  ], beats);
  assert.deepEqual(plan.map((c) => c.at), [0.25, 1.25, 1.45, 1.75]);
  assert.deepEqual(plan.map((c) => c.snappedFrom), [0.3, 1.37, null, 1.6]);
  assert.deepEqual(plan.map((c) => c.driftMs), [-50, -120, null, 150]);
  // two ticks 100 ms apart that would both snap to 1.25 collide under the 45 ms cooldown: the later keeps its instant
  const merged = planCues([{ t: 1.2, name: 'tick' }, { t: 1.3, name: 'tick' }], beats);
  assert.deepEqual(merged.map((c) => c.at), [1.25, 1.3]);
  assert.equal(planCues([{ t: 1, name: 'tick' }], null)[0].at, 1);
});

test('mixing: a 120 ms off-grid cue is snapped to the beat, with snappedFrom and the drift in cues.json', async () => {
  const dir = await variant('snap', { cues: ['tick', 'hit', 'tick', 'tick'], edit: (s) => { s.scenes[0].beats[1].at = 1.37; } });
  await withPicture(dir, PICTURE);
  const r = await buildSound(dir, { patterns: PATTERNS });
  const cues = JSON.parse(readFileSync(join(dir, 'out', 'cues.json'), 'utf8')).cues;
  const hit = cues.find((c) => c.name === 'hit');
  assert.equal(hit.snappedFrom, 1.37);
  assert.ok(Math.abs(hit.at - 1.25) <= 0.003, `hit snapped to ${hit.at}`);
  assert.equal(hit.driftMs, -120);
  assert.equal(hit.feel, 'soft-ui');
  assert.equal(typeof hit.peakDb, 'number');
  assert.deepEqual(r.cues, cues);
  // and the gate sees the drift that the mixer corrected
  const w = await wCue(await ctxFor(dir));
  assert.equal(w.status, 'WARN');
});

// ---- W-MIX ----------------------------------------------------------------------------------

test('W-MIX: fixtures/negatives/W-MIX (three ticks within 45 ms) gives one W-MIX row with the cooldown reason', async () => {
  const r = await wMix(await ctxFor(neg.mix));
  assert.ok(!Array.isArray(r), 'one row, not one per reason');
  assert.equal(r.id, 'W-MIX');
  assert.equal(r.status, 'WARN');
  assert.ok(r.evidence.kinds.includes('cooldown'), JSON.stringify(r.evidence.kinds));
  assert.match(r.evidence.reason, /tick retriggered 20 ms after itself \(cooldown 45 ms\)/);
  assert.equal(r.evidence.reasons.filter((x) => x.kind === 'cooldown').length, 2);
  assert.ok(r.evidence.kinds.includes('overlap'), 'three ticks sound at once');
});

test('W-MIX: the cooldown is 45 ms for one cue, but two different cues may sound together', async () => {
  const ctx = withBand(measured(await ctxFor(PIECE)), wide);
  const run = (cues) => wMix({ ...ctx, schedule: sched(cues) });
  assert.equal((await run([[2, 'tick'], [2.046, 'tick']])).status, 'PASS');
  const r = await run([[2, 'tick'], [2.044, 'tick']]);
  assert.equal(r.status, 'WARN'); assert.deepEqual(r.evidence.kinds, ['cooldown']);
  assert.equal((await run([[2, 'tick'], [2, 'hit']])).status, 'PASS');       // two at once is allowed
  const three = await run([[2, 'tick'], [2.0, 'hit'], [2.01, 'step']]);       // a third makes three
  assert.ok(three.evidence.kinds.includes('overlap'));
});

test('W-MIX: a cue whose instant has no arrive, cut, depart or move event warns', async () => {
  const ctx = withBand(measured(await ctxFor(PIECE)), wide);
  const ok = await wMix({ ...ctx, schedule: sched([[1, 'tick'], [3, 'hit']]) });
  assert.equal(ok.status, 'PASS', JSON.stringify(ok.evidence));
  const bad = await wMix({ ...ctx, schedule: { ...sched([[1, 'tick']]), events: [...sched([[1, 'tick']]).events, { t: 2.2, kind: 'cue', selector: '#ghost', scene: 'a', cue: 'tick' }] } });
  assert.equal(bad.status, 'WARN');
  assert.deepEqual(bad.evidence.kinds, ['no-visible-event']);
  assert.equal(bad.evidence.instant, 2.2);
  assert.equal(bad.evidence.selector, '#ghost');
  const none = await wMix({ ...ctx, schedule: sched([[1, 'tick']], { arrivals: false }) });
  assert.equal(none.status, 'WARN');
});

test('W-MIX: cues per 10 s must sit inside the style band', async () => {
  const base = measured(await ctxFor(PIECE));                       // calm: 1-4 per 10 s; the fixture has 4 cues in 6 s = 6.7
  const r = await wMix(base);
  assert.equal(r.status, 'WARN'); assert.deepEqual(r.evidence.kinds, ['rate']);
  assert.match(r.evidence.reason, /6\.7 cues per 10 s, the style's band is 1-4/);
  assert.equal((await wMix(withBand(base, [1, 8]))).status, 'PASS');
  const quiet = await wMix({ ...base, schedule: sched([[1, 'tick']], { duration: 30 }), style: { ...base.style, sound: { ...base.style.sound, cuesPer10s: [2, 4] } } });
  assert.equal(quiet.status, 'WARN'); assert.match(quiet.evidence.reason, /0\.3 cues per 10 s/);
  const burst = await wMix({ ...base, schedule: sched(Array.from({ length: 6 }, (_, i) => [1 + i * 0.5, 'tick']), { duration: 40 }), style: { ...base.style, sound: { ...base.style.sound, cuesPer10s: [0, 4] } } });
  assert.equal(burst.status, 'WARN'); assert.match(burst.evidence.reason, /6 cues in the 10 s from 1\.0 s/);
});

test('W-MIX: with a bed in the mix, every cue peak is 6-8 dB above it (checked on the rendered cues.json)', async () => {
  const dir = await variant('bedpeaks', { cues: ['bed', 'hit', 'tick', 'tick'], style: { sound: { cuesPer10s: [1, 8] } } });
  await withPicture(dir, PICTURE);
  await buildSound(dir, { patterns: PATTERNS });
  const ctx = await ctxFor(dir);
  const cues = JSON.parse(readFileSync(join(dir, 'out', 'cues.json'), 'utf8')).cues;
  const bed = cues.find((c) => c.name === 'bed');
  for (const c of cues.filter((x) => x.name !== 'bed')) assert.ok(c.peakDb - bed.peakDb >= 6 && c.peakDb - bed.peakDb <= 8, `${c.name}: ${c.peakDb - bed.peakDb} dB over the bed`);
  const ok = await wMix(ctx);
  assert.equal(ok.status, 'PASS', JSON.stringify(ok.evidence));
  assert.equal(ok.evidence.peaks, 'checked against the bed');
  // a cue 12 dB over the bed is flagged
  cues.find((c) => c.name === 'hit').peakDb = bed.peakDb + 12;
  writeFileSync(join(dir, 'out', 'cues.json'), JSON.stringify({ cues }));
  const bad = await wMix(ctx);
  assert.equal(bad.status, 'WARN'); assert.deepEqual(bad.evidence.kinds, ['peak']);
  assert.match(bad.evidence.reason, /hit at 1\.25 s peaks 12\.0 dB over the bed/);
});

test('W-MIX: a clean structure with no rendered cues.json is SKIP and partial, never PASS', async () => {
  const ctx = withBand(await ctxFor(PIECE), wide);
  const r = await wMix({ ...ctx, schedule: sched([[1, 'tick'], [3, 'hit']]) });
  assert.equal(r.status, 'SKIP'); assert.equal(r.evidence.partial, true);
  assert.match(r.evidence.reason, /peaks not measured/);
});

test('W-MIX: no cues, silent palette and a deck each skip with a reason', async () => {
  const ctx = await ctxFor(PIECE);
  assert.equal((await wMix({ ...ctx, schedule: sched([]) })).status, 'SKIP');
  const none = await wMix({ ...ctx, style: { ...ctx.style, sound: { ...ctx.style.sound, palette: 'none' } } });
  assert.equal(none.status, 'SKIP'); assert.match(none.evidence.reason, /none/);
  assert.equal((await wMix({ ...ctx, schedule: { kind: 'deck', events: [] } })).status, 'SKIP');
});

test('W-MIX: a story that names a cue with no sound pattern is reported, and the mixer refuses it', async () => {
  const ctx = withBand(await ctxFor(PIECE, { patternsBase: PATTERNS }), wide);
  const r = await wMix({ ...ctx, schedule: sched([[1, 'riser']]) });
  assert.deepEqual(r.evidence.unresolvedPatterns, ['riser']);
  const dir = await variant('nopattern', { cues: ['riser', null, null, null] });
  await assert.rejects(() => buildSound(dir, { patterns: PATTERNS }), /sound pattern\(s\) not found.*riser/);
});
