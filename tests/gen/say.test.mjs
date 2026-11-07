// scripts/lib/say.mjs: a scene's voice-over text is checked before a paid voice speaks it.
//   [display](spoken)   shown as `display`, spoken as `spoken` (a link-shaped body is a link, not a pronunciation)
//   <<slot>>            the beat with that slot arrives on the word the marker precedes
//   a brand's voice.lexicon respells a word once for every use
// and words a voice may get wrong (acronyms, camelCase, file names, URLs, unit numbers, product words) are
// flagged when nothing marks or respells them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignDisplay, cueAnchors, displayText, lintSay, parseSay } from '../../scripts/lib/say.mjs';

const DAY = new Date(0).toISOString().slice(0, 10);   // a fixed day built, not written: the repository keeps no dated notes

const kinds = (text, opts) => lintSay(text, opts).findings.map((f) => `${f.word}:${f.kind}`);

test('parseSay: a pronunciation marker is shown as its display and spoken as its spoken form', () => {
  const p = parseSay('Open the [API](ay pee eye) and [Zalo](ZAH-lo) now.');
  assert.equal(p.display, 'Open the API and Zalo now.');
  assert.equal(p.spoken, 'Open the ay pee eye and ZAH-lo now.');
  assert.equal(p.markers.length, 2);
  assert.deepEqual(p.markers.map((m) => [m.display, m.spoken]), [['API', 'ay pee eye'], ['Zalo', 'ZAH-lo']]);
  assert.equal(displayText('Say [GIF](jif).'), 'Say GIF.');
});

test('parseSay: a link-shaped body is a link and keeps only its display; a plain sentence is untouched', () => {
  const p = parseSay('Read [the docs](https://example.com/docs), [home](/start) or [top](#top).');
  assert.equal(p.display, 'Read the docs, home or top.');
  assert.equal(p.spoken, 'Read the docs, home or top.');
  assert.equal(p.markers.length, 0);
  const plain = parseSay('Nothing special here.');
  assert.equal(plain.display, plain.spoken);
  assert.deepEqual(plain.cues, []);
});

test('parseSay: a cue marker takes no room in the text and names the word it precedes', () => {
  const p = parseSay('We start <<hero>>here and then <<proof>>show the numbers.');
  assert.equal(p.display, 'We start here and then show the numbers.');
  assert.equal(p.spoken, p.display);
  assert.deepEqual(p.cues.map((c) => [c.name, c.word, c.index]), [['hero', 'here', 2], ['proof', 'show', 5]]);
  assert.deepEqual(p.problems, []);
});

test('parseSay: a cue inside a word, at the very end, or twice for one beat is a problem, named', () => {
  assert.match(parseSay('over<<x>>lap').problems[0].reason, /inside a word/);
  assert.match(parseSay('The end <<x>>').problems[0].reason, /precedes no word/);
  assert.match(parseSay('One <<a>>word and <<a>>another.').problems[0].reason, /twice/);
});

test('parseSay: a cue before a pronunciation marker precedes the marker\'s first word', () => {
  const p = parseSay('Meet <<logo>>[Zalo](ZAH-lo) today.');
  assert.deepEqual(p.cues.map((c) => [c.name, c.word, c.index]), [['logo', 'Zalo', 1]]);
});

test('the brand lexicon respells a word wherever it stands, and does not flag it', () => {
  const lexicon = { Zalo: 'ZAH-lo', ZALOPAY: 'zah-lo pay' };
  const p = parseSay('Zalo, then ZALOPAY.', { lexicon });
  assert.equal(p.display, 'Zalo, then ZALOPAY.');
  assert.equal(p.spoken, 'ZAH-lo, then zah-lo pay.');
  assert.deepEqual(kinds('Zalo, then ZALOPAY.', { lexicon }), []);
});

test('lintSay flags an acronym, short or long, unless it is marked or in the lexicon', () => {
  assert.deepEqual(kinds('Use the API and the SDK.'), ['API:acronym', 'SDK:acronym']);
  assert.deepEqual(kinds('It is US only, ID required.'), ['US:acronym', 'ID:acronym']);
  assert.deepEqual(kinds('Use the [API](ay pee eye).'), []);
  assert.deepEqual(kinds('Use the API.', { lexicon: { API: 'ay pee eye' } }), []);
  assert.deepEqual(kinds('I said OK.'), ['OK:acronym']);
  assert.deepEqual(kinds('A single I is not one.'), []);
});

test('lintSay flags camelCase and PascalCase names, identifiers, file names and URLs', () => {
  assert.deepEqual(kinds('Call getUser, then use YouTube and eBook.'), ['getUser:camelcase', 'YouTube:camelcase', 'eBook:camelcase']);
  assert.deepEqual(kinds('Open README.md and story.json.'), ['README.md:file', 'story.json:file']);
  assert.deepEqual(kinds('See https://example.com/docs or www.example.org.'), ['https://example.com/docs:url', 'www.example.org:url']);
  assert.deepEqual(kinds('Visit example.com, or mail me@example.com.'), ['example.com:url', 'me@example.com:url']);
  assert.deepEqual(kinds('Set max_width first.'), ['max_width:identifier']);
  assert.deepEqual(kinds('A well-known fact, and e.g. this.'), []);
});

test('lintSay flags unit numbers, versions, dates and ratios; plain numbers are fine', () => {
  assert.deepEqual(kinds('It takes 300ms on 16GB at 24fps and 1.5x speed.'), ['300ms:unit', '16GB:unit', '24fps:unit', '1.5x:unit']);
  assert.deepEqual(kinds('Wait 300 ms, then 5 kg.'), ['300 ms:unit', '5 kg:unit']);
  assert.deepEqual(kinds(`Version v2.1.0 shipped on ${DAY} in 16:9.`), ['v2.1.0:unit', `${DAY}:unit`, '16:9:unit']);
  assert.deepEqual(kinds('Pay $4.99 or €5.'), ['$4.99:unit', '€5:unit']);
  assert.deepEqual(kinds('We sold 3 of them in 2026, about 3.5 each.'), []);
});

test('lintSay checks product words only when the brand keeps a lexicon: a capitalised word mid-sentence it does not know', () => {
  const text = 'Today we meet Zalo and Monday, then Pilar speaks.';
  assert.deepEqual(kinds(text), [], 'no lexicon: no product-word check');
  const l = lintSay(text, { lexicon: { Zalo: 'ZAH-lo' } });
  assert.deepEqual(l.findings.map((f) => `${f.word}:${f.kind}`), ['Pilar:product-word'], 'a day is not a product; a known word is not flagged; a sentence start is not a name');
  assert.equal(l.productWordsChecked, true);
  assert.equal(lintSay(text).productWordsChecked, false);
});

test('a finding names its word, its position, why it is risky and what to do', () => {
  const f = lintSay('Open the API.').findings[0];
  assert.equal(f.word, 'API');
  assert.equal(f.kind, 'acronym');
  assert.equal(f.index, 2);
  assert.match(f.reason, /acronym/);
  assert.match(f.fix, /\[API\]\(.+\)/);
});

test('lintSay reads punctuation off the word: quotes, commas and a closing full stop', () => {
  assert.deepEqual(kinds('"API", (SDK); README.md.'), ['API:acronym', 'SDK:acronym', 'README.md:file']);
});

test('cueAnchors: each cue becomes the phrase of the word it precedes and the two after it, for the beat with that slot', () => {
  const story = { scenes: [
    { id: 'a', say: 'We start <<hero>>here and then <<proof>>show the numbers.', beats: [{ slot: 'hero' }, { slot: 'proof' }, { slot: 'other' }] },
    { id: 'b', say: 'No cues in this one.', beats: [{ slot: 'x' }] },
    { id: 'c', say: 'Lost <<ghost>>cue.', beats: [{ slot: 'real' }] },
  ] };
  const { anchors, problems } = cueAnchors(story);
  assert.deepEqual(anchors, [
    { scene: 'a', slot: 'hero', anchor: 'here and then' },
    { scene: 'a', slot: 'proof', anchor: 'show the numbers' },
  ].concat([]));
  assert.equal(problems.length, 1);
  assert.match(problems[0].reason, /<<ghost>>.*no beat with slot "ghost".*real/);
  assert.equal(problems[0].scene, 'c');
});

test('alignDisplay turns the voice\'s words (as spoken) back into the words shown, so an anchor finds them', () => {
  const p = parseSay('Open the [API](ay pee eye) now.');
  const spoken = [['Open', 0, 0.4], ['the', 0.4, 0.6], ['ay', 0.6, 0.9], ['pee', 0.9, 1.2], ['eye', 1.2, 1.5], ['now.', 1.5, 1.9]].map(([text, start, end]) => ({ text, start, end }));
  const shown = alignDisplay(p, spoken);
  assert.deepEqual(shown.map((w) => w.text), ['Open', 'the', 'API', 'now.']);
  assert.deepEqual([shown[2].start, shown[2].end], [0.6, 1.5], 'the display word spans its spoken words');
  assert.equal(shown[3].start, 1.5);
  assert.equal(alignDisplay(parseSay('Plain words.'), [{ text: 'Plain', start: 0, end: 1 }, { text: 'words.', start: 1, end: 2 }]).length, 2);
});

test('alignDisplay: a marker that shows more words than it speaks splits its span evenly; a count mismatch returns the words untouched', () => {
  const p = parseSay('Say [the API](api).');
  const w = alignDisplay(p, [{ text: 'Say', start: 0, end: 1 }, { text: 'api.', start: 1, end: 3 }]);
  assert.deepEqual(w.map((x) => [x.text, x.start, x.end]), [['Say', 0, 1], ['the', 1, 2], ['API.', 2, 3]]);
  const odd = [{ text: 'only', start: 0, end: 1 }];
  assert.deepEqual(alignDisplay(p, odd), odd);
});
