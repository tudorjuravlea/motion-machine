// The shared text splitter (runtime/kit/split.js), its pure part: words with punctuation glued to
// them, graphemes that stay whole (accents, emoji, scripts that join), the spaces a unit keeps,
// and the line rule that reads a laid-out run of word boxes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordsOf, wordRuns, graphemesOf, plainOf, lineIndexes, NBSP } from '../../runtime/kit/split.js';

test('plainOf collapses every run of white space to one space and trims', () => {
  assert.equal(plainOf('  one \n two\t\tthree  '), 'one two three');
  assert.equal(plainOf(''), '');
  assert.equal(plainOf(null), '');
});

test('English words keep their punctuation: closing marks stick to the word before, opening marks to the next', () => {
  assert.deepEqual(wordsOf('Hello, world! (Really?) It\'s e-mail.'), ['Hello,', 'world!', '(Really?)', 'It\'s', 'e-mail.']);
});

test('a number with a point or a version stays one word', () => {
  assert.deepEqual(wordsOf('Ship v1.3 at 3.5x speed'), ['Ship', 'v1.3', 'at', '3.5x', 'speed']);
});

test('an em dash between spaces is a unit of its own, not glued to either side', () => {
  assert.deepEqual(wordsOf('fast — and light'), ['fast', '—', 'and', 'light']);
});

test('Romanian words with diacritics are whole words', () => {
  assert.deepEqual(wordsOf('Știința și țara noastră, în mișcare.'), ['Știința', 'și', 'țara', 'noastră,', 'în', 'mișcare.']);
});

test('Japanese is split into words by the dictionary, with the full stop glued to the last word', () => {
  const w = wordsOf('これは日本語のテキストです。');
  assert.ok(w.length >= 4, `expected several words, got ${JSON.stringify(w)}`);
  assert.equal(w.join(''), 'これは日本語のテキストです。');
  assert.ok(w.at(-1).endsWith('。'), 'the full stop belongs to the word before it');
  assert.ok(!w.some((x) => x === '。'), 'no word is the full stop alone');
});

test('an emoji with a skin tone is one word, and a family is one character', () => {
  assert.deepEqual(wordsOf('Hi 👋🏽 there'), ['Hi', '👋🏽', 'there']);
  assert.deepEqual(graphemesOf('a👨‍👩‍👧b'), ['a', '👨‍👩‍👧', 'b']);
  assert.deepEqual(graphemesOf('🇷🇴!'), ['🇷🇴', '!']);
});

test('graphemes keep an accent with its letter, composed or not', () => {
  assert.deepEqual(graphemesOf('Ștéfan'), ['Ș', 't', 'é', 'f', 'a', 'n']);
  assert.deepEqual(graphemesOf('日本語'), ['日', '本', '語']);
});

test('the fallback (no Intl.Segmenter) still keeps accents, joined emoji and flags whole', () => {
  const fb = { fallback: true };
  assert.deepEqual(graphemesOf('Ștéfan', undefined, fb), ['Ș', 't', 'é', 'f', 'a', 'n']);
  assert.deepEqual(graphemesOf('a👨‍👩‍👧b', undefined, fb), ['a', '👨‍👩‍👧', 'b']);
  assert.deepEqual(graphemesOf('x👋🏽y', undefined, fb), ['x', '👋🏽', 'y']);
  assert.deepEqual(graphemesOf('🇷🇴!', undefined, fb), ['🇷🇴', '!']);
  assert.deepEqual(wordsOf('Hello, world', undefined, fb), ['Hello,', 'world']);
});

test('wordRuns says which words had a space after them in the source', () => {
  assert.deepEqual(wordRuns('ab cd'), [{ text: 'ab', space: true }, { text: 'cd', space: false }]);
  const ja = wordRuns('日本語です');
  assert.ok(ja.every((r) => r.space === false), 'no space was written in Japanese');
});

test('wordRuns with spaces kept as NBSP appends the space to the word that owned it', () => {
  const r = wordRuns('ab cd', undefined, { spaces: 'nbsp' });
  assert.deepEqual(r.map((x) => x.text), ['ab' + NBSP, 'cd']);
});

const box = (left, top, width = 40, height = 20) => ({ left, top, width, height });

test('lineIndexes starts a line when a word is lower by more than half a line and has moved back', () => {
  const boxes = [box(0, 0), box(50, 0), box(100, 0), box(0, 24), box(50, 24), box(0, 48)];
  assert.deepEqual(lineIndexes(boxes), [0, 0, 0, 1, 1, 2]);
});

test('lineIndexes ignores a small drop (a superscript or a baseline shift) and a drop with no step back', () => {
  assert.deepEqual(lineIndexes([box(0, 0), box(50, 6), box(100, 0)]), [0, 0, 0]);
  // lower by a whole line but further right than the word before ends: one line (a shifted baseline), not a new one
  assert.deepEqual(lineIndexes([box(0, 0), box(60, 30)]), [0, 0]);
});

test('lineIndexes of nothing is nothing', () => {
  assert.deepEqual(lineIndexes([]), []);
});
