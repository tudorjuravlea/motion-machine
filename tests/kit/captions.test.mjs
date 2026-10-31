// runtime/kit/captions.js: caption groups by a score of the break points, without a browser. Sentence ends
// break best, then strong punctuation, then a pause of 150 to 400 ms, then a phrase boundary; a group is 2 to 6
// words, never one alone on a line; width counts characters, wide scripts as two.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BREAK_SCORE, PAUSE_STRONG_S, PAUSE_WEAK_S, breakScore, captionGroups, charWidth, countGroups, lineWidth } from '../../runtime/kit/captions.js';

const words = (text) => text.split(/\s+/).filter(Boolean);
const texts = (groups) => groups.map((g) => g.map((w) => (typeof w === 'string' ? w : w.text)).join(' '));
/** Words with times: [text, at, end] rows. */
const timed = (rows) => rows.map(([text, at, end]) => ({ text, at, end }));

test('countGroups is the plain way: runs of a size, a one-word tail joins the run before it', () => {
  assert.deepEqual(texts(countGroups(words('a b c d e f g h i'), 4)), ['a b c d', 'e f g h i']);
  assert.deepEqual(texts(countGroups(words('a b c d e f g h'), 4)), ['a b c d', 'e f g h']);
  assert.deepEqual(countGroups([], 4), []);
});

test('break scores: sentence end over strong punctuation over a pause over a phrase boundary over nothing', () => {
  const a = (text, at, end) => ({ text, at, end });
  assert.equal(breakScore('done.', 'next'), BREAK_SCORE.sentence);
  assert.equal(breakScore('done?!', 'next'), BREAK_SCORE.sentence);
  assert.equal(breakScore('"done."', 'next'), BREAK_SCORE.sentence);
  assert.equal(breakScore('done,', 'next'), BREAK_SCORE.strong);
  assert.equal(breakScore('done;', 'next'), BREAK_SCORE.strong);
  assert.equal(breakScore('done —', 'next'), BREAK_SCORE.strong);
  assert.equal(breakScore('done', 'and'), BREAK_SCORE.phrase);
  assert.equal(breakScore('done', 'Și'), BREAK_SCORE.phrase, 'Romanian, folded');
  assert.equal(breakScore('done', 'next'), 0);
  assert.ok(BREAK_SCORE.sentence > BREAK_SCORE.strong && BREAK_SCORE.strong > BREAK_SCORE.pauseHigh && BREAK_SCORE.pauseHigh >= BREAK_SCORE.pauseLow && BREAK_SCORE.pauseLow > BREAK_SCORE.phrase);
  // a pause of 150 ms starts to count, 400 ms and more is the strongest pause; under 150 ms it is nothing
  assert.equal(breakScore(a('done', 0, 1), a('next', 1.1, 2)), 0);
  assert.equal(breakScore(a('done', 0, 1), a('next', 1 + PAUSE_WEAK_S, 2)), BREAK_SCORE.pauseLow);
  assert.equal(breakScore(a('done', 0, 1), a('next', 1 + PAUSE_STRONG_S, 2)), BREAK_SCORE.pauseHigh);
  assert.equal(breakScore(a('done', 0, 1), a('next', 3, 4)), BREAK_SCORE.pauseHigh, 'a long pause is no stronger than 400 ms');
  const mid = breakScore(a('done', 0, 1), a('next', 1.275, 2));
  assert.ok(mid > BREAK_SCORE.pauseLow && mid < BREAK_SCORE.pauseHigh);
  assert.equal(breakScore(a('done.', 0, 1), a('next', 1.01, 2)), BREAK_SCORE.sentence, 'punctuation outranks a pause');
});

test('groups break after sentence ends, then commas, instead of at a fixed count', () => {
  const text = 'Hold on. That is not what I meant, honestly. Try again please';
  const g = texts(captionGroups(words(text), { group: 4 }));
  assert.deepEqual(g, ['Hold on.', 'That is not what', 'I meant, honestly.', 'Try again please'], 'both sentence ends close a group; a count of 4 would cut mid-sentence');
  assert.notDeepEqual(g, texts(countGroups(words(text), 4)));
});

test('the sentence end wins over the count: two sentences become two groups', () => {
  assert.deepEqual(texts(captionGroups(words('We shipped it. Nobody noticed at all'), { group: 4 })), ['We shipped it.', 'Nobody noticed at all']);
});

test('never one word alone: every group has 2 to 6 words, whatever the text and the group size', () => {
  const text = 'it works. and then, because the plan was clear, we moved on to the next step of the long road ahead.';
  for (const group of [2, 3, 4, 5, 6]) for (let n = 2; n <= 24; n++) {
    const list = words(text).slice(0, n);
    const groups = captionGroups(list, { group, chars: 1000 });
    assert.deepEqual(groups.flat(), list, `no word lost or moved (${n} words, group ${group})`);
    for (const g of groups) assert.ok(g.length >= 2 && g.length <= 6, `${n} words, group ${group}: ${JSON.stringify(texts(groups))}`);
  }
  assert.deepEqual(captionGroups(['solo']), [['solo']], 'one word is the only exception: there is nothing to pair it with');
  assert.deepEqual(captionGroups([]), []);
});

test('a group does not end on a word that wants the next one, unless punctuation closes it', () => {
  const g = texts(captionGroups(words('She wanted to go to the market and buy some bread for dinner tonight'), { group: 4 }));
  for (const t of g.slice(0, -1)) assert.ok(!/\b(the|to|and|of|a|an|for)$/i.test(t), `"${t}" ends on a word that wants the next: ${JSON.stringify(g)}`);
});

test('a pause breaks the group where there is no punctuation', () => {
  const list = timed([['so', 0, 0.3], ['today', 0.35, 0.7], ['we', 0.75, 1.0], ['talk', 1.05, 1.4], ['about', 1.45, 1.8], ['pricing', 2.4, 2.9], ['and', 2.95, 3.2], ['plans', 3.25, 3.7], ['for', 3.75, 3.9], ['teams', 3.95, 4.3]]);
  const g = texts(captionGroups(list, { group: 5 }));
  assert.equal(g[0], 'so today we talk about', `the 0.6 s pause after "about" ends the first group: ${JSON.stringify(g)}`);
  const noPause = texts(captionGroups(list.map(({ text }) => text), { group: 5 }));
  assert.ok(Array.isArray(noPause));
});

test('width: a group stays within the characters asked for; wide scripts count two a character', () => {
  assert.equal(charWidth('abc'), 3);
  assert.equal(charWidth('日本語'), 6);
  assert.equal(charWidth('한국'), 4);
  assert.equal(charWidth('é'), 1);
  assert.equal(lineWidth(['one', 'two']), 7, 'a space between words');
  assert.equal(lineWidth(['日本', '語']), 6, 'no space between two wide scripts');
  assert.equal(lineWidth(['日本', 'ok']), 7);
  const long = words('internationalization characteristically unquestionably misunderstood extraordinarily incomprehensible');
  assert.deepEqual(texts(captionGroups(long, { group: 4, chars: 45 })).map((t) => t.split(' ').length), [2, 2, 2], 'only pairs fit in 45');
  for (const chars of [45, 60, 90]) {
    const groups = captionGroups(long, { group: 4, chars });
    for (const g of groups) assert.ok(lineWidth(texts([g])[0].split(' ')) <= chars, `${chars}: ${JSON.stringify(texts(groups))}`);
    assert.ok(groups.every((g) => g.length >= 2));
  }
  // CJK: each "word" is wide; 6 of 4 characters are 24 wide, over 20
  const cjk = ['今日は', '天気が', 'とても', '良いので', '散歩に', '行きます'];
  const g = captionGroups(cjk, { group: 6, chars: 16 });
  assert.ok(g.length > 1 && g.every((x) => x.length >= 2), JSON.stringify(g));
  for (const x of g) assert.ok(lineWidth(x) <= 16, JSON.stringify(g));
});

test('when nothing can fit the width, the words are grouped as if it were unlimited', () => {
  const g = captionGroups(['extraordinarily', 'unquestionably', 'misunderstood'], { group: 2, chars: 10 });
  assert.deepEqual(g.flat().length, 3);
  assert.ok(g.every((x) => x.length >= 2) || g.length === 1);
});

test('group is clamped to 2 to 6 and the result is reused for the same list', () => {
  const list = words('one two three four five six seven eight nine ten eleven twelve');
  assert.deepEqual(captionGroups(list, { group: 99 }), captionGroups(list, { group: 6 }));
  assert.deepEqual(captionGroups(list, { group: 0 }), captionGroups(list, { group: 2 }));
  assert.strictEqual(captionGroups(list, { group: 3 }), captionGroups(list, { group: 3 }), 'the same list and settings: the same array');
  assert.notStrictEqual(captionGroups(list, { group: 3 }), captionGroups(list, { group: 4 }));
});

test('the same input gives the same groups, whatever the order of calls', () => {
  const list = words('This is the first sentence. Here is another one, a longer one, with commas and so on.');
  const a = texts(captionGroups(list, { group: 4 }));
  captionGroups(list, { group: 5 });
  assert.deepEqual(texts(captionGroups(list, { group: 4 })), a);
});
