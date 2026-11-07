// Keys (environment, then the keys file, never printed) and the words format (what ElevenLabs returns,
// turned into the [{ text, start, end }] list `mm footage cut --words` reads).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findKey, mask, parseKeys, scrub } from '../../scripts/lib/gen/keys.mjs';
import { wordsFromAlignment, wordsFromScribe } from '../../scripts/lib/gen/elevenlabs.mjs';
import { wordsFrom } from '../../scripts/lib/footage.mjs';

test('parseKeys reads KEY=value lines, skips comments, strips quotes and an export prefix', () => {
  const k = parseKeys('# keys\nKIE_API_KEY=abc123\nexport ELEVENLABS_API_KEY="xyz 789"\n\nbad line\n  OTHER = \'q\' \n');
  assert.deepEqual(k, { KIE_API_KEY: 'abc123', ELEVENLABS_API_KEY: 'xyz 789', OTHER: 'q' });
});

test('findKey: the environment first, then the keys file; nothing otherwise', () => {
  const home = mkdtempSync(join(tmpdir(), 'mm-keys-'));
  assert.equal(findKey('kie', { env: {}, home }), null);
  mkdirSync(join(home, '.config', 'motion-machine'), { recursive: true });
  writeFileSync(join(home, '.config', 'motion-machine', 'keys.env'), 'KIE_API_KEY=from-file-1234\nELEVENLABS_API_KEY=el-file-5678\n');
  assert.deepEqual(findKey('kie', { env: {}, home }), { name: 'KIE_API_KEY', value: 'from-file-1234', source: '$HOME/.config/motion-machine/keys.env' });
  assert.equal(findKey('kie', { env: { KIE_API_KEY: 'from-env-9999' }, home }).value, 'from-env-9999');
  assert.equal(findKey('kie', { env: { KIE_API_KEY: 'from-env-9999' }, home }).source, 'environment');
  assert.equal(findKey('elevenlabs', { env: {}, home }).value, 'el-file-5678');
  assert.equal(findKey('higgsfield', { env: {}, home }), null, 'higgsfield has its own CLI login, never a key here');
});

test('mask shows the last four and scrub removes a key wherever it appears', () => {
  assert.equal(mask('sk-very-secret-abcd'), '…abcd');
  const text = scrub('POST failed with Bearer sk-very-secret-abcd and again sk-very-secret-abcd', ['sk-very-secret-abcd']);
  assert.doesNotMatch(text, /very-secret/);
  assert.match(text, /…abcd/);
});

test('wordsFromAlignment: characters grouped on spaces, a word from its first start to its last end', () => {
  const text = 'Hi there, you.';
  const chars = [...text];
  const starts = chars.map((_, i) => i * 0.1);
  const ends = chars.map((_, i) => i * 0.1 + 0.08);
  const words = wordsFromAlignment({ characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends });
  assert.deepEqual(words.map((w) => w.text), ['Hi', 'there,', 'you.']);
  assert.equal(words[0].start, 0);
  assert.equal(words[0].end, 0.18);
  assert.equal(words[1].start, 0.3);
  assert.equal(words[2].end, 1.38);
});

test('wordsFromAlignment: newlines and runs of spaces separate words; an empty alignment gives none', () => {
  const chars = [...'a  b\nc'];
  const t = chars.map((_, i) => i);
  const words = wordsFromAlignment({ characters: chars, character_start_times_seconds: t, character_end_times_seconds: t.map((x) => x + 0.5) });
  assert.deepEqual(words.map((w) => w.text), ['a', 'b', 'c']);
  assert.deepEqual(wordsFromAlignment(null), []);
});

test('wordsFromScribe keeps the words with times, drops spacing and audio events', () => {
  const words = wordsFromScribe({ words: [
    { text: 'Hello', type: 'word', start: 0.1, end: 0.5 }, { text: ' ', type: 'spacing', start: 0.5, end: 0.6 },
    { text: '(laughs)', type: 'audio_event', start: 0.6, end: 1 }, { text: 'world', type: 'word', start: 1.1, end: 1.6 }, { text: 'lost', type: 'word', start: null, end: null }] });
  assert.deepEqual(words, [{ text: 'Hello', start: 0.1, end: 0.5 }, { text: 'world', start: 1.1, end: 1.6 }]);
});

test('both outputs are read by mm footage cut as they are', () => {
  const a = wordsFromAlignment({ characters: [...'ab cd'], character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4], character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5] });
  assert.deepEqual(wordsFrom(a), a);
  const s = wordsFromScribe({ words: [{ text: 'x', type: 'word', start: 0, end: 0.2 }] });
  assert.deepEqual(wordsFrom(JSON.parse(JSON.stringify(s))), s);
});
