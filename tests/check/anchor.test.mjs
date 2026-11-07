// W-ANCHOR (SPEC §7): a beat that names the spoken word it illustrates arrives from 1.8 s before to
// 0.2 s after the word's first start. The rule is read from the schedule and the words alone, so most of
// it runs here on a built ctx; one case runs the gate on fixtures/negatives/W-ANCHOR.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import wAnchor, { EARLY_S, LATE_S, LEAD_S, occurrences, wordsOf } from '../../scripts/check/W-ANCHOR.mjs';
import { gate, warnsOnly, row } from './_harness.mjs';

const run = gate();
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const WORDS = [['Two', 9.1], ['halves', 10], ['make', 10.4], ['one', 10.6], ['style.', 10.9], ['Halves', 14]].map(([text, start]) => ({ text, start, end: start + 0.2 }));
const piece = (files = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'anchor-'));
  dirs.push(dir);
  for (const [f, body] of Object.entries(files)) { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), JSON.stringify(body)); }
  return dir;
};
const voice = () => piece({ 'assets/v.words.json': { words: WORDS } });
const ctxOf = (dir, beats, { story = {}, style = {}, kind = 'film' } = {}) => ({
  dir, style, story: { audio: { track: 'assets/v.mp3', bpm: null, beats: null }, ...story },
  schedule: { kind, scenes: [{ id: 's', start: 8 }], items: beats.map(([start, anchor], i) => ({ selector: `s${i}`, scene: 's', start, beat: { anchor } })) },
});
const at = async (start, anchor = 'halves', opts) => wAnchor(ctxOf(voice(), [[start, anchor]], opts));

test('the window is 1.8 s before to 0.2 s after the first word, and the edges are inside', async () => {
  assert.equal(EARLY_S, 1.8);
  assert.equal(LATE_S, 0.2);
  for (const start of [8.2, 9, 10, 10.2]) assert.equal((await at(start)).status, 'PASS', `arrives at ${start}, the word at 10`);
  const early = await at(8.19), late = await at(10.21);
  assert.equal(early.status, 'WARN');
  assert.equal(early.evidence.status, 'early');
  assert.equal(late.status, 'WARN');
  assert.equal(late.evidence.status, 'late');
});

test('a late or early beat is told the fix: arrive at the word minus half a second, as the scene\'s `at`', async () => {
  const r = await at(11.5);
  assert.equal(r.evidence.measured, 1.5);
  assert.equal(r.evidence.anchors[0].suggestedAt, 1.5, 'word 10 - 0.5 - the scene at 8');
  assert.match(r.evidence.reason, /arrives 1.5 s after "halves" \(10 s\).*`at` 1\.5/);
  assert.equal(LEAD_S, 0.5);
  const early = await at(5);
  assert.equal(early.evidence.anchors[0].suggestedAt, 1.5);
  assert.equal(early.evidence.measured, -5);
  const clamped = await wAnchor(ctxOf(piece({ 'assets/v.words.json': [{ text: 'hello', start: 8.2, end: 8.4 }] }), [[12, 'hello']]));
  assert.equal(clamped.evidence.anchors[0].suggestedAt, 0, 'never before the scene starts');
});

test('a phrase is its words in a row; case, punctuation and accents do not matter', async () => {
  assert.deepEqual(occurrences(WORDS, 'make one'), [10.4]);
  assert.deepEqual(occurrences(WORDS, 'one make'), []);
  assert.deepEqual(occurrences(WORDS, 'HALVES!'), [10, 14], 'a phrase said twice is found twice');
  assert.deepEqual(occurrences([{ text: 'Café', start: 1, end: 2 }], 'cafe'), [1]);
  assert.deepEqual(occurrences(WORDS, '...'), []);
  assert.equal((await at(10.1, 'Two halves')).status, 'WARN', 'two halves starts at 9.1: 1 s late');
  assert.equal((await at(9.1, 'Two halves')).status, 'PASS');
});

test('a phrase said twice is matched at the nearer occurrence', async () => {
  assert.equal((await at(14.1)).status, 'PASS', 'the second "halves" at 14');
  assert.equal((await at(10.1)).status, 'PASS', 'the first at 10');
});

test('anchor-miss: a phrase the words do not hold warns and says so', async () => {
  const r = await at(10, 'quarters');
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.status, 'anchor-miss');
  assert.match(r.evidence.reason, /"quarters" is not in the words/);
});

test('no-words: an anchor and nothing to check it against is a partial SKIP, never a PASS', async () => {
  const r = await wAnchor(ctxOf(piece(), [[10, 'halves']]));
  assert.equal(r.status, 'SKIP');
  assert.equal(r.evidence.partial, true);
  assert.match(r.evidence.reason, /^partial: 1 anchor could not be checked: no words/);
  assert.equal(r.evidence.anchors[0].status, 'no-words');
  const none = await wAnchor(ctxOf(piece(), [[10, 'halves']], { story: { audio: { track: null, bpm: null, beats: null } } }));
  assert.equal(none.status, 'SKIP');
  assert.match(none.evidence.reason, /neither footage words nor an audio.track/);
});

test('a finding wins over an unchecked anchor; a story with no anchor and a deck are SKIP with a reason', async () => {
  const dir = voice();
  const mixed = await wAnchor({ ...ctxOf(dir, [[11.5, 'halves'], [10, 'halves']]), });
  assert.equal(mixed.status, 'WARN');
  assert.equal(mixed.evidence.anchors.length, 2);
  const none = await wAnchor({ ...ctxOf(dir, []), });
  assert.equal(none.status, 'SKIP');
  assert.match(none.evidence.reason, /no beat names an anchor/);
  const deck = await wAnchor(ctxOf(dir, [[10, 'halves']], { kind: 'deck' }));
  assert.equal(deck.status, 'SKIP');
  assert.match(deck.evidence.reason, /deck/);
});

test('the words come from the footage edit first (on the film\'s clock), else the voice\'s sidecar beside audio.track', () => {
  const edit = { words: [{ text: 'halves', at: 3.2, end: 3.6 }] };
  const dir = piece({ 'assets/talk/edit.json': edit, 'assets/v.words.json': { words: WORDS } });
  const both = wordsOf(dir, { footage: { asset: 'assets/talk/' }, audio: { track: 'assets/v.mp3' } });
  assert.equal(both.source, 'assets/talk/edit.json');
  assert.deepEqual(both.words, [{ text: 'halves', start: 3.2, end: 3.6 }]);
  const voiceOnly = wordsOf(dir, { audio: { track: 'assets/v.mp3' } });
  assert.equal(voiceOnly.source, 'assets/v.words.json');
  assert.equal(voiceOnly.words.length, WORDS.length);
  const noWords = wordsOf(piece({ 'assets/talk/edit.json': { fps: 30 } }), { footage: { asset: 'assets/talk/' }, audio: { track: null } });
  assert.equal(noWords.words, null);
  assert.match(noWords.why, /holds no words/);
});

test('the sidecar may be the plain list or a WhisperX result', () => {
  const plain = wordsOf(piece({ 'v.words.json': [{ text: 'a', start: 1, end: 2 }] }), { audio: { track: 'v.wav' } });
  assert.deepEqual(plain.words, [{ text: 'a', start: 1, end: 2 }]);
  const wx = wordsOf(piece({ 'v.words.json': { word_segments: [{ word: 'b', start: 1.5, end: 2, score: 0.9 }] } }), { audio: { track: 'v.wav' } });
  assert.deepEqual(wx.words, [{ text: 'b', start: 1.5, end: 2 }]);
  const bad = wordsOf(piece({ 'v.words.json': { nothing: 1 } }), { audio: { track: 'v.wav' } });
  assert.equal(bad.words, null);
  assert.match(bad.why, /v\.words\.json: the words must be/);
});

test('a style\'s gate.anchor sets the window and the evidence says what was used', async () => {
  const wide = await at(7.5, 'halves', { style: { gate: { anchor: { earlyS: 3 } } } });
  assert.equal(wide.status, 'PASS');
  assert.match(wide.evidence.threshold, /^3 s before to 0\.2 s after/);
  const strict = await at(10.1, 'halves', { style: { gate: { anchor: { lateS: 0 } } } });
  assert.equal(strict.status, 'WARN');
});

test('fixtures/negatives/W-ANCHOR warns W-ANCHOR and nothing else', async () => {
  const r = warnsOnly(await run('W-ANCHOR'), 'W-ANCHOR');
  assert.equal(r.evidence.status, 'late');
  assert.equal(r.evidence.measured, 3);
  assert.match(r.evidence.reason, /`at` 0/);
});

test('the base film has no anchor: SKIP with a reason', async () => {
  const r = row(await run('_base/film', { only: ['W-ANCHOR'] }), 'W-ANCHOR');
  assert.equal(r.status, 'SKIP');
  assert.ok(r.evidence.reason);
});
