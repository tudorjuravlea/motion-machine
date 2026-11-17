// scripts/lib/voice-script.mjs: a generated voice's script against the words heard in its audio (SPEC §8, Round trip),
// and the per-word score WhisperX gives, kept by wordsFrom and warned about by checkTranscript.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareScript, tokens } from '../../scripts/lib/voice-script.mjs';
import { wordsFrom } from '../../scripts/lib/footage.mjs';
import { checkTranscript } from '../../scripts/lib/footage-words.mjs';

test('tokens: no case, punctuation or diacritics; digits as words for 0 to 20 and the round tens', () => {
  assert.deepEqual(tokens('Don\'t buy 3 apples, 20 pears and $30 of Știință!'), ['dont', 'buy', 'three', 'apples', 'twenty', 'pears', 'and', 'thirty', 'of', 'stiinta']);
  assert.deepEqual(tokens('Twenty-one, 3.5x and 1,000'), ['twenty', 'one', '3.5x', 'and', '1000']);
  assert.deepEqual(tokens(''), []);
});

test('a voice that says its script has a word error rate of 0', () => {
  const c = compareScript('We shipped 3 builds in two days.', ['We', 'shipped', 'three', 'builds', 'in', '2', 'days']);
  assert.equal(c.wer, 0);
  assert.deepEqual([c.missing, c.extra, c.changed, c.numbers], [[], [], [], []]);
});

test('missing, extra and changed words are reported in order, with the rate over the script', () => {
  const c = compareScript('open the app and press the big button', 'open app and push the big button now'.split(' '));
  assert.deepEqual(c.missing, ['the']);
  assert.deepEqual(c.changed, [{ meant: 'press', said: 'push' }]);
  assert.deepEqual(c.extra, ['now']);
  assert.equal(c.errors, 3);
  assert.equal(c.wer, 3 / 8);
  assert.deepEqual(c.ops.map((o) => o.op), ['del', 'sub', 'ins']);
});

test('a changed figure is listed apart: a digit said as another number, or a number word as a word', () => {
  assert.deepEqual(compareScript('ship 3 builds', ['ship', 'five', 'builds']).numbers, [{ meant: 'three', said: 'five' }]);
  assert.deepEqual(compareScript('ship 40 builds', ['ship', 'for', 'builds']).numbers, [{ meant: 'forty', said: 'for' }]);
  assert.deepEqual(compareScript('ship three builds', ['ship', 'builds']).numbers, [], 'a missing figure is a missing word, not a changed one');
});

test('the edge cases: nothing heard, nothing sent, both', () => {
  assert.equal(compareScript('hello there', []).wer, 1);
  assert.equal(compareScript('', ['hello']).wer, 1);
  assert.equal(compareScript('', []).wer, 0);
});

test('wordsFrom keeps WhisperX\'s score on a word that has one, and nothing on a word that has none', () => {
  const wx = { word_segments: [{ word: 'Hello', start: 0, end: 0.4, score: 0.93 }, { word: '2026' }, { word: 'world', start: 1, end: 1.4, score: 0.3 }] };
  assert.deepEqual(wordsFrom(wx), [{ text: 'Hello', start: 0, end: 0.4, score: 0.93 }, { text: '2026', start: 0.4, end: 1 }, { text: 'world', start: 1, end: 1.4, score: 0.3 }]);
  assert.deepEqual(wordsFrom([{ text: 'a', start: 0, end: 1, score: 0.7 }]), [{ text: 'a', start: 0, end: 1, score: 0.7 }]);
  assert.deepEqual(wordsFrom([{ text: 'a', start: 0, end: 1 }]), [{ text: 'a', start: 0, end: 1 }]);
});

test('checkTranscript warns on a word under 0.5, and on a word with a digit under 0.8; a good word and an unscored one pass', () => {
  const w = (text, score, i) => ({ text, start: i, end: i + 0.5, ...(score === undefined ? {} : { score }) });
  const quiet = checkTranscript([w('fine', 0.95, 0), w('12', 0.8, 1), w('maybe', 0.5, 2), w('2026', undefined, 3)]);
  assert.deepEqual(quiet.warnings, []);
  const low = checkTranscript([w('fine', 0.95, 0), w('murky', 0.49, 1), w('300', 0.79, 2), w('year', 0.6, 3)]);
  assert.equal(low.warnings.length, 1);
  assert.match(low.warnings[0], /2 words the transcriber was not sure of.*"murky" at 1\.00 s \(0\.49\).*"300" at 2\.00 s \(0\.79\)/);
  assert.equal(low.words[1].score, 0.49, 'the score travels with the word');
});
