// W-SOUND-SHAPE's payoff check (SPEC §7, §9): when the mix has a bed or a track, at least 0.4 s at or under -40 dBFS in the two seconds
// before the loudest 100 ms, so the loudest moment is earned. A cue-only film passes that trivially, so there the check is a
// sub-check SKIP, said in the evidence; the rule's own verdict stands.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import rule from '../../scripts/check/W-SOUND-SHAPE.mjs';
import { payoffOf, QUIET_S, FLOOR_DB, WINDOW_S } from '../../scripts/check/_payoff.mjs';
import { wavOf } from '../../scripts/sound-listen.mjs';

const SR = 48000;
const seconds = 14;
/** A stereo buffer holding `parts`: { from, to, amp } sine segments at 220 Hz. */
function track(parts, len = seconds) {
  const L = new Float32Array(Math.round(len * SR));
  for (const { from, to, amp } of parts) for (let i = Math.round(from * SR); i < Math.min(L.length, Math.round(to * SR)); i++) L[i] += amp * Math.sin((2 * Math.PI * 220 * i) / SR);
  return [L, Float32Array.from(L)];
}
const pulse = (t, amp = 0.9) => ({ from: t, to: t + 0.15, amp });

test('the check asks for 0.4 s at or under -40 dBFS in the 2 s before the loudest 100 ms', () => {
  assert.equal(QUIET_S, 0.4); assert.equal(FLOOR_DB, -40); assert.equal(WINDOW_S, 2);
});

test('payoffOf finds the loudest 100 ms and the quiet before it', () => {
  const gap = payoffOf(track([{ from: 0, to: 8.4, amp: 0.05 }, { from: 9.6, to: 14, amp: 0.05 }, pulse(10)]), SR);
  assert.ok(Math.abs(gap.loudestAtS - 10.04) < 0.1, `${gap.loudestAtS}`);
  assert.ok(gap.quietS >= 1, `${gap.quietS}`);
  const bed = payoffOf(track([{ from: 0, to: 14, amp: 0.05 }, pulse(10)]), SR);
  assert.equal(bed.quietS, 0);
  const silent = payoffOf(track([]), SR);
  assert.equal(silent, null, 'a silent mix has no loudest moment');
});

let tmp;
before(() => { tmp = mkdtempSync(join(tmpdir(), 'mm-payoff-')); });
after(() => rmSync(tmp, { recursive: true, force: true }));

const CUES = [{ t: 0.2, name: 'hit' }, { t: 3, name: 'tick' }, { t: 10, name: 'hit' }];
/** A piece folder whose stems are `stems` ({ bed, track, cues }: buffers), and the ctx the rule is given. */
function ctxFor({ stems, bed = false, style = {}, trackFile = null }) {
  const dir = mkdtempSync(join(tmp, 'p-'));
  mkdirSync(join(dir, 'out', 'stems'), { recursive: true });
  for (const [name, buf] of Object.entries(stems)) writeFileSync(join(dir, 'out', 'stems', `${name}.wav`), wavOf(buf, SR));
  const events = CUES.map((c) => ({ kind: 'cue', t: c.t, cue: c.name, selector: '[data-scene="x"]', scene: 'x' }));
  if (bed) events.unshift({ kind: 'cue', t: 0, cue: 'bed', selector: '[data-scene="x"]', scene: 'x' });
  return { dir, style: { sound: { palette: 'soft-ui' }, ...style }, story: { audio: { track: trackFile } }, schedule: { kind: 'film', duration: seconds, events } };
}
const cuesStem = track([pulse(0.2, 0.5), pulse(3, 0.4), pulse(10)]);

test('a cue-only film: the payoff is a sub-check SKIP and the verdict is the rule\'s own', async () => {
  const v = await rule(ctxFor({ stems: { cues: cuesStem } }));
  assert.equal(v.status, 'PASS', JSON.stringify(v.evidence));
  assert.equal(v.evidence.payoff.status, 'SKIP');
  assert.match(v.evidence.payoff.reason, /cue-only/);
});

test('a bed that never lets go before the loudest moment warns the payoff', async () => {
  const v = await rule(ctxFor({ bed: true, stems: { cues: cuesStem, bed: track([{ from: 0, to: 14, amp: 0.05 }]) } }));
  assert.equal(v.status, 'WARN', JSON.stringify(v.evidence));
  assert.ok(v.evidence.kinds.includes('payoff'));
  assert.equal(v.evidence.payoff.status, 'WARN');
  assert.equal(v.evidence.payoff.quietS, 0);
  assert.equal(v.evidence.payoff.thresholdS, 0.4);
  assert.match(v.evidence.reason, /loudest 100 ms/);
});

test('a bed that drops out before it passes, and the pass says how much quiet it found', async () => {
  const v = await rule(ctxFor({ bed: true, stems: { cues: cuesStem, bed: track([{ from: 0, to: 8.4, amp: 0.05 }, { from: 9.7, to: 14, amp: 0.05 }]) } }));
  assert.equal(v.status, 'PASS', JSON.stringify(v.evidence));
  assert.equal(v.evidence.payoff.status, 'PASS');
  assert.ok(v.evidence.payoff.quietS >= 0.4);
});

test('a track counts as a bed', async () => {
  const v = await rule(ctxFor({ trackFile: 'assets/music.wav', stems: { cues: cuesStem, track: track([{ from: 0, to: 14, amp: 0.05 }]) } }));
  assert.equal(v.status, 'WARN');
  assert.equal(v.evidence.payoff.status, 'WARN');
});

test('a bed named in the schedule with no stem to read is a partial SKIP, never a PASS', async () => {
  const v = await rule(ctxFor({ bed: true, stems: { cues: cuesStem } }));
  assert.equal(v.status, 'SKIP');
  assert.equal(v.evidence.partial, true);
  assert.match(v.evidence.reason, /payoff/);
});

test('a style\'s gate.payoff sets the quiet, the floor and the window, and the evidence says so', async () => {
  const v = await rule(ctxFor({ bed: true, style: { gate: { payoff: { quietS: 0.1, floorDb: -10, windowS: 2 } } }, stems: { cues: cuesStem, bed: track([{ from: 0, to: 14, amp: 0.05 }]) } }));
  assert.equal(v.status, 'PASS', JSON.stringify(v.evidence));
  assert.equal(v.evidence.payoff.thresholdS, 0.1);
  assert.equal(v.evidence.payoff.floorDb, -10);
});
