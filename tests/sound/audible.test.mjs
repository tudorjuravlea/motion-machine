// W-AUDIBLE (SPEC §7, §9): the third-octave margin of each cue against the music and the voice over its loudest 60 ms and
// its first 20 ms, in the bands within 30 dB of the cue's peak: 6 dB or more clear, 3-6 ok, 0-3 barely, under 0 masked.
// A cue peaking under -70 dBFS is silent, a cue over speech masks it unless ducking is on, and a cue whose 2-6 kHz level is
// more than 6 dB over the music's loudest is harsh. The self-test plants each defect and the rule must catch it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditCue, verdictOf, musicHarshDb, AUDIBLE } from '../../scripts/lib/sound-audible.mjs';
import wAudible from '../../scripts/check/W-AUDIBLE.mjs';
import { IDS } from '../../scripts/check.mjs';

const SR = 48000;
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const noise = (seconds, amp, seed = 5) => { const r = mulberry(seed); return Float32Array.from({ length: Math.round(seconds * SR) }, () => (r() - 0.5) * 2 * amp); };
const place = (seconds, at, sig) => { const x = new Float32Array(Math.round(seconds * SR)); x.set(sig, Math.round(at * SR)); return x; };
/** A tone burst with a 3 ms attack and a 150 ms decay. */
const burst = (hz, amp, seconds = 0.4) => Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => { const t = i / SR; return amp * Math.min(1, t / 0.003) * Math.exp(-t * 18) * Math.sin(2 * Math.PI * hz * t); });
const stereo = (x) => [x, x.slice()];
const R = 3;                                              // seconds in the region
const base = (cueSig, o = {}) => ({ cue: stereo(place(R, 1, cueSig)), music: stereo(o.music ?? noise(R, 0.05)), voice: o.voice ? stereo(o.voice) : null, sr: SR, startS: 0, onsetS: 1, endS: 1.4, G: 0, spans: o.spans ?? [], ducked: o.ducked ?? false, musicHarshDb: o.harsh ?? null });

test('the verdict bands: 6 dB or more clear, 3 to 6 ok, 0 to 3 barely, under 0 masked', () => {
  assert.deepEqual([6, 5.9, 3, 2.9, 0, -0.1].map(verdictOf), ['clear', 'ok', 'ok', 'barely', 'barely', 'masked']);
  assert.deepEqual([AUDIBLE.clearDb, AUDIBLE.okDb, AUDIBLE.silentDb, AUDIBLE.harshOverDb, AUDIBLE.bandWindowDb], [6, 3, -70, 6, 30]);
});

test('a cue well over the bed in its own band is clear', () => {
  const r = auditCue(base(burst(1000, 0.5), { music: noise(R, 0.02) }));
  assert.equal(r.verdict, 'clear', JSON.stringify(r));
  assert.ok(r.readDb >= 6);
  assert.equal(r.silent, false);
});

test('planted defect: a cue 60 dB under a loud bed is masked', () => {
  const r = auditCue(base(burst(1000, 0.0009), { music: noise(R, 0.9) }));
  assert.equal(r.verdict, 'masked', JSON.stringify(r));
  assert.ok(r.readDb < 0);
  assert.equal(r.silent, false, 'it peaks over -70 dBFS: masked, not silent');
});

test('planted defect: a cue on top of a word is over speech, and ducking changes what the rule says', () => {
  const x = noise(R, 0.001, 2), r = mulberry(4);
  for (let i = Math.round(0.8 * SR); i < Math.round(2 * SR); i++) { const t = i / SR; x[i] += 0.15 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)) * (Math.sin(2 * Math.PI * 500 * t) + 0.7 * Math.sin(2 * Math.PI * 1500 * t) + (r() - 0.5) * 0.3); }
  const spans = [{ from: 0.8, to: 2 }];
  const bare = auditCue(base(burst(900, 0.2), { music: noise(R, 0.001, 8), voice: x, spans }));
  assert.equal(bare.overSpeech, true);
  assert.equal(bare.ducked, false);
  const ducked = auditCue(base(burst(900, 0.2), { music: noise(R, 0.001, 8), voice: x, spans, ducked: true }));
  assert.equal(ducked.overSpeech, true);
  assert.equal(ducked.ducked, true);
  const clear = auditCue({ ...base(burst(900, 0.2), { music: noise(R, 0.001, 8), voice: x, spans }), onsetS: 2.4, endS: 2.8, cue: stereo(place(R, 2.4, burst(900, 0.2))) });
  assert.equal(clear.overSpeech, false, 'a cue in the pause is not over speech');
});

test('planted defect: a cue peaking under -70 dBFS is silent', () => {
  const r = auditCue(base(burst(1000, 0.00005)));
  assert.equal(r.silent, true, JSON.stringify(r));
  assert.equal(r.verdict, 'silent');
  // the master gain counts: the same cue at -75 dBFS before the master and 10 dB of gain is -65 after
  assert.equal(auditCue({ ...base(burst(1000, 0.00018)), G: 10 }).silent, false);
});

test('planted defect: a bright cue far over the music\'s loudest 2-6 kHz level is harsh', () => {
  const music = noise(R, 0.01);
  const harsh = musicHarshDb([music], SR);
  assert.ok(Number.isFinite(harsh));
  const bad = auditCue(base(burst(4000, 0.6), { music, harsh }));
  assert.ok(bad.harshOverDb > 6, `${bad.harshOverDb}`);
  const fine = auditCue(base(burst(1000, 0.05), { music, harsh }));
  assert.ok(fine.harshOverDb < 6, `${fine.harshOverDb}`);
  assert.equal(auditCue(base(burst(4000, 0.6), { music, harsh: null })).harshOverDb, null, 'no music, no judgement');
});

const piece = (cues, extra = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-audible-'));
  mkdirSync(join(dir, 'out'));
  writeFileSync(join(dir, 'out', 'cues.json'), JSON.stringify({ loudness: {}, cues, ...extra }));
  return dir;
};
const ctx = (dir, over = {}) => ({ dir, style: { sound: { palette: 'soft-ui' } }, schedule: { kind: 'film', duration: 6, events: [{ kind: 'cue', t: 1, cue: 'tick' }] }, ...over });
const row = (o = {}) => ({ name: 'tick', at: 1, rule: 'role tick', audible: { verdict: 'clear', readDb: 12, silent: false, overSpeech: false, ducked: false, harshOverDb: 0, ...o } });

test('W-AUDIBLE is in the gate\'s order and skips with nothing to judge', async () => {
  assert.ok(IDS.includes('W-AUDIBLE') && IDS.indexOf('W-AUDIBLE') > IDS.indexOf('W-MIX'));
  assert.equal((await wAudible({ ...ctx(piece([])), schedule: { kind: 'deck', events: [] } })).status, 'SKIP');
  assert.equal((await wAudible(ctx(mkdtempSync(join(tmpdir(), 'mm-audible-'))))).status, 'SKIP', 'no out/cues.json: nothing measured');
  assert.equal((await wAudible({ ...ctx(piece([row()])), style: { sound: { palette: 'none' } } })).status, 'SKIP');
});

test('W-AUDIBLE passes clear, ok and barely cues (barely is listed as info) and warns on each planted defect, naming the rule that placed the cue', async () => {
  assert.equal((await wAudible(ctx(piece([row()])))).status, 'PASS');
  const barely = await wAudible(ctx(piece([row({ verdict: 'barely', readDb: 1.5 })])));
  assert.equal(barely.status, 'PASS');
  assert.equal(barely.evidence.barely.length, 1);
  const masked = await wAudible(ctx(piece([row({ verdict: 'masked', readDb: -12 })])));
  assert.equal(masked.status, 'WARN');
  assert.match(masked.evidence.reason, /masked/);
  assert.match(masked.evidence.reason, /role tick/, 'the warning names the rule that placed the cue');
  const silent = await wAudible(ctx(piece([row({ verdict: 'silent', readDb: null, silent: true })])));
  assert.equal(silent.status, 'WARN'); assert.match(silent.evidence.reason, /silent/);
  const speech = await wAudible(ctx(piece([row({ overSpeech: true })])));
  assert.equal(speech.status, 'WARN'); assert.match(speech.evidence.reason, /speech/);
  assert.equal((await wAudible(ctx(piece([row({ overSpeech: true, ducked: true })])))).status, 'PASS', 'ducking is on: the cue over speech is judged after the duck');
  const harsh = await wAudible(ctx(piece([row({ harshOverDb: 9 })])));
  assert.equal(harsh.status, 'WARN'); assert.match(harsh.evidence.reason, /2-6 kHz/);
});

test('W-AUDIBLE: a beat\'s soundOk acknowledges a masked cue', async () => {
  const c = ctx(piece([row({ verdict: 'masked', readDb: -12 })]));
  c.schedule.events[0].params = { soundOk: 'meant to sit in the bed' };
  const r = await wAudible(c);
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.acknowledged.length, 1);
});

test('W-AUDIBLE: a cues.json from before the margins were measured is not judged', async () => {
  const dir = piece([{ name: 'tick', at: 1 }]);
  const r = await wAudible(ctx(dir));
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /not measured/);
});
