// W-SOUND-SHAPE (SPEC §7, §9): the shape of a film's sound as a critic hears it from the cue list and the stems:
// a hook sound in the first 0.6 s, a spread of at least 8 dB between the loudest and quietest cues (P10 to P90, six
// cues or more), no machine-gun (five identical cues or more at gaps of 0.35 s or less; a `key` run whose gaps vary
// is typing), and a list of the five places to listen first.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, ensureNegatives, variant } from '../../fixtures/sound/setup.mjs';
import { runCheck } from '../../scripts/check.mjs';
import rule from '../../scripts/check/W-SOUND-SHAPE.mjs';
import { cueLevelsFromStem, listenList, percentile, shapeVerdict } from '../../scripts/check/_shape.mjs';
import { wavOf } from '../../scripts/sound-listen.mjs';

const cue = (t, name = 'tick') => ({ t, name });
const lv = (cues, dbs) => cues.map((c, i) => ({ ...c, db: dbs[i % dbs.length], measure: 'loudest 100 ms' }));
const kinds = (v) => v.evidence.kinds ?? [];

// A good film: a hook at 0.2 s, ten cues of different kinds with a 12 dB spread, nothing in a row.
const good = [cue(0.2, 'hit'), cue(1.4, 'pop-in'), cue(2.9, 'tick'), cue(4.1, 'whoosh'), cue(5.0, 'pop-in'), cue(6.8, 'tap'), cue(8.2, 'tick'), cue(9.5, 'hit'), cue(11.3, 'pop-in'), cue(13.0, 'ready')];
const goodDb = [-24, -30, -33, -27, -31, -34, -32, -25, -30, -36];

test('a good film passes: a hook, a spread, no run', () => {
  const v = shapeVerdict({ cues: good, levels: lv(good, goodDb), duration: 14 });
  assert.equal(v.status, 'PASS', JSON.stringify(v.evidence));
  assert.equal(v.evidence.hookS, 0.2);
  assert.ok(v.evidence.spreadDb >= 8, `${v.evidence.spreadDb}`);
  assert.equal(v.evidence.listen.length, 5, 'five places to listen first');
});

test('no hook: the first sound after 0.6 s warns, and says when it is', () => {
  const late = good.slice(1);
  const v = shapeVerdict({ cues: late, levels: lv(late, goodDb), duration: 14 });
  assert.equal(v.status, 'WARN');
  assert.deepEqual(kinds(v), ['hook']);
  assert.match(v.evidence.reason, /0\.6 s/);
  assert.match(v.evidence.reason, /1\.40/);
});

test('the hook is judged against the first event: a sound within 0.35 s of a first event later than 0.6 s still counts; a film under 3 s is exempt', () => {
  const late = good.slice(1);
  const on = shapeVerdict({ cues: late, levels: lv(late, goodDb), duration: 14, firstEventS: 1.3 });
  assert.equal(on.status, 'PASS', JSON.stringify(on.evidence));
  assert.equal(on.evidence.hookS, 1.4);
  const off = shapeVerdict({ cues: late, levels: lv(late, goodDb), duration: 14, firstEventS: 0.4 });
  assert.deepEqual(kinds(off), ['hook'], 'a sound 1.1 s after the first event is no hook');
  const short = [cue(1.2, 'hit'), cue(2, 'tick')];
  assert.equal(shapeVerdict({ cues: short, levels: null, duration: 2.5 }).status, 'PASS', 'under 3 s there is no hook to ask for');
});

test('a flat hierarchy: six cues or more within 8 dB P10 to P90 warn; fewer than six are not judged', () => {
  const flat = [-30, -30.5, -29.5, -30.2, -29.8, -30.1, -30.4, -29.9, -30, -30.3];
  const v = shapeVerdict({ cues: good, levels: lv(good, flat), duration: 14 });
  assert.equal(v.status, 'WARN');
  assert.deepEqual(kinds(v), ['hierarchy']);
  assert.ok(v.evidence.spreadDb < 8);
  const few = good.slice(0, 5);
  const f = shapeVerdict({ cues: few, levels: lv(few, [-30, -30, -30, -30, -30]), duration: 14 });
  assert.equal(f.status, 'PASS', 'five cues cannot have a spread judged');
  assert.equal(f.evidence.spreadDb, undefined);
});

test('machine-gun: five identical cues at 0.35 s gaps or less warn; four do not; a gap past 0.35 s ends the run', () => {
  const run = (n, gap, name = 'tick', t0 = 3) => Array.from({ length: n }, (_, i) => cue(t0 + i * gap, name));
  const withRun = (r) => [...good.filter((c) => c.t < 2.5 || c.t > 3 + r.length), ...r].sort((a, b) => a.t - b.t);
  let cues = withRun(run(5, 0.3));
  let v = shapeVerdict({ cues, levels: lv(cues, [-24, -30, -36]), duration: 14 });
  assert.equal(v.status, 'WARN');
  assert.ok(kinds(v).includes('machine-gun'));
  assert.match(v.evidence.reasons.find((r) => r.kind === 'machine-gun').message, /5 tick/);
  cues = withRun(run(4, 0.3));
  v = shapeVerdict({ cues, levels: lv(cues, [-24, -30, -36]), duration: 14 });
  assert.ok(!kinds(v).includes('machine-gun'));
  cues = withRun(run(6, 0.4));
  v = shapeVerdict({ cues, levels: lv(cues, [-24, -30, -36]), duration: 14 });
  assert.ok(!kinds(v).includes('machine-gun'), 'gaps over 0.35 s are not a run');
  cues = withRun([cue(3, 'tick'), cue(3.3, 'tick'), cue(3.6, 'tick'), cue(3.9, 'tick'), cue(4.0, 'tock'), cue(4.3, 'tick')]);
  v = shapeVerdict({ cues, levels: lv(cues, [-24, -30, -36]), duration: 14 });
  assert.ok(!kinds(v).includes('machine-gun'), 'another cue in between breaks the run');
});

test('identical means the same cue and the same seed: a run that rotates seeds across more than two voices is not a machine gun', () => {
  const run = (seeds) => seeds.map((seed, i) => ({ t: 3 + i * 0.3, name: 'tap', seed }));
  const others = good.filter((c) => c.t < 2.5 || c.t > 5);
  const same = [...others, ...run([1, 1, 1, 1, 1, 1])].sort((a, b) => a.t - b.t);
  assert.ok(kinds(shapeVerdict({ cues: same, levels: lv(same, [-24, -30, -36]), duration: 14 })).includes('machine-gun'));
  const rotated = [...others, ...run([1, 2, 3, 4, 1, 2])].sort((a, b) => a.t - b.t);
  assert.ok(!kinds(shapeVerdict({ cues: rotated, levels: lv(rotated, [-24, -30, -36]), duration: 14 })).includes('machine-gun'));
});

test('a key run is typing when its gaps vary, and a machine gun when they do not', () => {
  const at = (gaps) => gaps.reduce((acc, g) => [...acc, acc.at(-1) + g], [3]).map((t) => cue(t, 'key'));
  const others = good.filter((c) => c.t < 2.5 || c.t > 6);
  const typed = [...others, ...at([0.09, 0.12, 0.08, 0.15, 0.1, 0.07, 0.13, 0.11])].sort((a, b) => a.t - b.t);
  assert.ok(!kinds(shapeVerdict({ cues: typed, levels: lv(typed, [-24, -30, -36]), duration: 14 })).includes('machine-gun'));
  const robot = [...others, ...at(Array(8).fill(0.1))].sort((a, b) => a.t - b.t);
  assert.ok(kinds(shapeVerdict({ cues: robot, levels: lv(robot, [-24, -30, -36]), duration: 14 })).includes('machine-gun'));
});

test('levels that were not measured make a clean result SKIP with partial, never PASS; findings still warn', () => {
  const v = shapeVerdict({ cues: good, levels: null, duration: 14 });
  assert.equal(v.status, 'SKIP');
  assert.equal(v.evidence.partial, true);
  assert.match(v.evidence.reason, /spread|level/);
  const late = good.slice(1);
  const w = shapeVerdict({ cues: late, levels: null, duration: 14 });
  assert.equal(w.status, 'WARN');
  assert.equal(w.evidence.partial, true);
  const few = shapeVerdict({ cues: good.slice(0, 4), levels: null, duration: 14 });
  assert.equal(few.status, 'PASS', 'with fewer than six cues there is no spread to measure');
});

test('no cues, a deck, or a bed alone: SKIP with a reason', () => {
  assert.equal(shapeVerdict({ cues: [], levels: null, duration: 10 }).status, 'SKIP');
  assert.equal(shapeVerdict({ cues: [cue(0, 'bed')], levels: null, duration: 10 }).status, 'SKIP');
  assert.equal(shapeVerdict({ cues: good, levels: null, duration: 10, deck: true }).status, 'SKIP');
  for (const v of [shapeVerdict({ cues: [], levels: null, duration: 10 }), shapeVerdict({ cues: good, levels: null, duration: 10, deck: true })]) assert.ok(v.evidence.reason);
});

test('the listen list: at most five distinct moments, each with a time and a reason, the opening first', () => {
  const l = listenList({ cues: good, levels: lv(good, goodDb), duration: 14 });
  assert.equal(l.length, 5);
  assert.equal(l[0].t, 0.2);
  assert.match(l[0].why, /open/i);
  assert.equal(new Set(l.map((m) => m.t)).size, 5, 'five distinct places');
  for (const m of l) assert.ok(Number.isFinite(m.t) && m.why.length > 10);
  assert.ok(l.some((m) => /loudest/i.test(m.why)) && l.some((m) => /quietest/i.test(m.why)));
  const sorted = l.map((m) => m.t).sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] >= 1.5 - 1e-9, 'at least 1.5 s apart');
  for (const m of l) assert.match(m.why, /\?$/, 'each is a question for the ear');
  for (const m of l) assert.ok(m.reasons.length >= 1 && m.reasons.length <= 2);
  const few = listenList({ cues: [cue(0.2, 'hit'), cue(5, 'tick')], levels: null, duration: 10 });
  assert.ok(few.length >= 1 && few.length <= 5);
  assert.equal(listenList({ cues: [], levels: null, duration: 10 }).length, 0);
});

test('percentile: linear between ranks', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0), 1);
  assert.equal(percentile([1, 2, 3, 4, 5], 100), 5);
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  assert.ok(Math.abs(percentile([0, 10], 10) - 1) < 1e-9);
});

// ---- the stems ----------------------------------------------------------------------------------------------

const SR = 48000;
function stem(seconds, pulses) {
  const L = new Float32Array(Math.round(seconds * SR));
  for (const { t, amp } of pulses) for (let i = 0; i < 0.12 * SR; i++) L[Math.round(t * SR) + i] += amp * Math.sin((2 * Math.PI * 1000 * i) / SR) * Math.exp(-i / (0.03 * SR));
  return [L, Float32Array.from(L)];
}

test('cueLevelsFromStem reads each cue\'s loudest 100 ms from the cue stem, so a louder pulse reads louder', () => {
  const cues = [cue(0.5, 'a'), cue(1.5, 'b'), cue(2.5, 'c')];
  const levels = cueLevelsFromStem({ cues, channels: stem(4, [{ t: 0.5, amp: 0.5 }, { t: 1.5, amp: 0.25 }, { t: 2.5, amp: 0.05 }]), sr: SR });
  assert.equal(levels.length, 3);
  assert.ok(Math.abs(levels[0].db - levels[1].db - 6.02) < 0.3, `${levels[0].db} ${levels[1].db}`);
  assert.ok(levels[1].db > levels[2].db + 10);
  assert.equal(levels[0].measure, 'loudest 100 ms');
});

// ---- the rule through the gate ------------------------------------------------------------------------------

let tmp;
before(() => { tmp = mkdtempSync(join(tmpdir(), 'mm-shape-')); });
after(() => rmSync(tmp, { recursive: true, force: true }));

function ctxFor(cues, { duration = 14, deck = false, cuesJson = null, stemPulses = null } = {}) {
  const dir = mkdtempSync(join(tmp, 'p-'));
  mkdirSync(join(dir, 'out', 'stems'), { recursive: true });
  if (cuesJson) writeFileSync(join(dir, 'out', 'cues.json'), JSON.stringify({ cues: cuesJson }));
  if (stemPulses) writeFileSync(join(dir, 'out', 'stems', 'cues.wav'), wavOf(stem(duration, stemPulses), SR));
  return { dir, style: { sound: { palette: 'soft-ui' } }, schedule: { kind: deck ? 'deck' : 'film', duration, events: cues.map((c) => ({ kind: 'cue', t: c.t, cue: c.name, selector: '[data-scene="x"]', scene: 'x' })) } };
}

test('the rule reads the cue stem when it is there', async () => {
  const cues = good.slice(0, 8);
  const amps = [0.5, 0.2, 0.12, 0.4, 0.1, 0.06, 0.15, 0.5];
  const v = await rule(ctxFor(cues, { stemPulses: cues.map((c, i) => ({ t: c.t, amp: amps[i] })) }));
  assert.equal(v.id, 'W-SOUND-SHAPE');
  assert.equal(v.status, 'PASS', JSON.stringify(v.evidence));
  assert.equal(v.evidence.levels, 'cue stem');
  const flat = await rule(ctxFor(cues, { stemPulses: cues.map((c) => ({ t: c.t, amp: 0.3 })) }));
  assert.equal(flat.status, 'WARN');
  assert.deepEqual(flat.evidence.kinds, ['hierarchy']);
});

test('without a stem it falls back to the peaks in out/cues.json, and says so; with neither it is a partial SKIP', async () => {
  const cues = good.slice(0, 8);
  const peaks = cues.map((c, i) => ({ name: c.name, at: c.t, peakDb: [-6, -14, -20, -9, -22, -24, -16, -5][i] }));
  const v = await rule(ctxFor(cues, { cuesJson: peaks }));
  assert.equal(v.status, 'PASS', JSON.stringify(v.evidence));
  assert.match(v.evidence.levels, /peak/);
  const none = await rule(ctxFor(cues));
  assert.equal(none.status, 'SKIP');
  assert.equal(none.evidence.partial, true);
});

test('the rule skips a deck and a film with no cues', async () => {
  assert.equal((await rule(ctxFor(good, { deck: true }))).status, 'SKIP');
  assert.equal((await rule(ctxFor([]))).status, 'SKIP');
  assert.equal((await rule({ dir: tmp, style: { sound: { palette: 'none' } }, schedule: { kind: 'film', duration: 5, events: [{ kind: 'cue', t: 0, cue: 'tick' }] } })).status, 'SKIP', 'a palette of none renders no cues');
});

// ---- composed into the gate ---------------------------------------------------------------------------------

let rulesDir, neg;
before(async () => {
  neg = await ensureNegatives();
  rulesDir = mkdtempSync(join(tmp, 'rules-'));
  symlinkSync(join(ROOT, 'scripts/check', 'W-SOUND-SHAPE.mjs'), join(rulesDir, 'W-SOUND-SHAPE.mjs'));
});

test('through the composer the rule is picked up by name and reports the hook, with the listen list in its evidence', async () => {
  const dir = await variant('shape-late', { cues: [null, 'tick', 'tick', 'tick'] });
  const r = await runCheck(dir, { rulesDir, only: ['W-SOUND-SHAPE'] });
  const row = r.rules.find((x) => x.id === 'W-SOUND-SHAPE');
  assert.ok(row, 'present in the report');
  assert.ok(!row.evidence.crash, JSON.stringify(row.evidence));
  assert.equal(row.status, 'WARN', JSON.stringify(row.evidence));
  assert.deepEqual(row.evidence.kinds, ['hook'], 'the first sound is a second after the first thing on screen');
  assert.ok(row.evidence.listen.length >= 1);
  assert.ok(neg, 'negatives exist');
});
