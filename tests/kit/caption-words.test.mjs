// text/caption-karaoke without a browser. By default (mode even) it draws exactly what it always
// drew (fixtures/footage/karaoke-even.json holds its output on a grid of groups and progresses).
// In mode words the groups come from the footage's words on the film's clock: every group appears
// at or before its first word and at most 3 frames (30 fps) early, one group at a time, the word
// being said in the accent; with no words it falls back to the even timing of the beat's text.
// These pin `breaks: count`, the fixed runs of words the pattern always cut; the default, `breaks: score`, is
// tested at the end of this file and in captions.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import karaoke from '../../patterns/text/caption-karaoke/pattern.js';

function fakeEl(text = '') {
  const el = { kids: [], style: {}, ownerDocument: { createElement: () => ({ className: '', textContent: '', style: {} }) },
    append(...xs) { this.kids.push(...xs); },
    get textContent() { return this.kids.map((k) => (typeof k === 'string' ? k : k.textContent)).join(''); },
    set textContent(v) { this.kids = v ? [String(v)] : []; } };
  el.textContent = text;
  return el;
}
const snap = (el) => ({ text: el.textContent, colors: el.kids.filter((k) => typeof k !== 'string').map((k) => k.style.color), opacity: el.style.opacity });

// the fixture words, as mm footage cut maps them onto the edit's clock
const WORDS = [['every', 0.12, 0.48], ['frame', 0.52, 0.88], ['comes', 0.92, 1.28], ['from', 1.32, 1.68], ['time', 1.72, 2.08], ['pauses', 2.453, 2.813], ['fall', 2.853, 3.213],
  ['away', 3.253, 3.613], ['between', 3.653, 4.013], ['lines', 4.053, 4.413], ['cuts', 4.753, 5.213], ['land', 5.253, 5.713], ['quietly', 5.753, 6.213],
  ['the', 6.553, 6.913], ['voice', 6.953, 7.313], ['carries', 7.353, 7.713], ['straight', 7.753, 8.113], ['through', 8.153, 8.513]].map(([text, at, end]) => ({ text, at, end }));
const ctxAt = (t, params = {}, words = WORDS) => ({ params: { mode: 'words', breaks: 'count', ...params }, u: t, d: 9, footage: { t, fps: 30, words, clip: 0, clipAt: () => 0 } });
const draw = (t, params, words) => { const el = fakeEl(''); karaoke.at(el, 0.5, ctxAt(t, params, words)); return snap(el); };

test('mode even is the default and draws exactly what the pattern always drew', () => {
  const golden = JSON.parse(readFileSync(new URL('../../fixtures/footage/karaoke-even.json', import.meta.url), 'utf8'));
  assert.ok(golden.length >= 30);
  for (const [group, p, u, d, want] of golden) {
    const el = fakeEl('one two three four five six seven eight nine');
    karaoke.at(el, p, { params: { group, breaks: 'count' }, ...(u != null ? { u, d } : {}) });
    assert.deepEqual(snap(el), want, `group ${group}, p ${p}, u ${u}`);
  }
  assert.equal(karaoke.params.mode.default, 'even');
});

test('mode words: every group appears at or before its first word, at most 3 frames early', () => {
  for (const group of [2, 3, 4, 5, 6]) {
    const first = new Map();
    for (let n = 0; n <= 9 * 30; n++) { const s = draw(n / 30, { group }); if (s.text && !first.has(s.text)) first.set(s.text, n); }
    // the groups as the pattern cuts them: runs of `group` words, a one-word tail merged into the one before
    const groups = [];
    for (let i = 0; i < WORDS.length; i += group) groups.push(WORDS.slice(i, i + group));
    if (groups.length > 1 && groups.at(-1).length === 1) groups.at(-2).push(groups.pop()[0]);
    assert.equal(first.size, groups.length, `group ${group}: every group is shown`);
    for (const g of groups) {
      const n = first.get(g.map((w) => w.text).join(' '));
      assert.ok(n != null, `group ${group}: "${g[0].text}…" never shown`);
      assert.ok(n / 30 <= g[0].at + 1e-9, `group ${group}: "${g[0].text}…" first shown at ${n / 30}, after its word at ${g[0].at}`);
      assert.ok(n / 30 >= g[0].at - 3 / 30 - 1e-9, `group ${group}: "${g[0].text}…" first shown at ${n / 30}, more than 3 frames before ${g[0].at}`);
    }
  }
});

test('mode words: the word being said is in the accent, said words in ink, words to come muted; nothing before the first word', () => {
  assert.deepEqual(draw(0, {}), { text: '', colors: [], opacity: '0' });
  const s = draw(0.6, { group: 4 });
  assert.equal(s.text, 'every frame comes from');
  assert.deepEqual(s.colors, ['var(--mm-color-ink)', 'var(--mm-accent-text)', 'var(--mm-color-muted)', 'var(--mm-color-muted)']);
  assert.equal(s.opacity, '', 'a hard swap: the group is fully there');
  assert.deepEqual(draw(0.9, { group: 4 }).colors, ['var(--mm-color-ink)', 'var(--mm-color-ink)', 'var(--mm-color-muted)', 'var(--mm-color-muted)'], 'between words nothing is lit');
});

test('mode words: lead is clamped to 0.1 s; with no words the beat\'s text runs evenly', () => {
  const firstShown = (params) => { for (let n = 0; n < 60; n++) if (draw(n / 30, params).text) return n / 30; return null; };
  assert.ok(firstShown({ lead: 5 }) >= 0.12 - 0.1 - 1e-9);
  assert.equal(firstShown({ lead: 0 }), 4 / 30, 'lead 0: the first frame at or after the word');
  const even = fakeEl('one two three four'), words = fakeEl('one two three four');
  karaoke.at(even, 0.3, { params: { group: 2, breaks: 'count' } });
  karaoke.at(words, 0.3, { params: { group: 2, mode: 'words', breaks: 'count' } });
  assert.deepEqual(snap(words), snap(even));
});

// ---- breaks: score (the default)

test('breaks: score is the default; count keeps the old runs', () => {
  assert.equal(karaoke.params.breaks.default, 'score');
  assert.equal(karaoke.params.chars.default, 30);
});

test('breaks: score in mode even: a sentence end closes a group; at rest the last group stands in ink', () => {
  const text = 'We shipped it. Nobody noticed at all';
  const at = (p, params = {}) => { const el = fakeEl(text); karaoke.at(el, p, { params: { group: 4, ...params } }); return snap(el); };
  assert.equal(at(0.1).text, 'We shipped it.');
  assert.equal(at(0.9).text, 'Nobody noticed at all');
  assert.deepEqual(at(1).colors, ['var(--mm-color-ink)', 'var(--mm-color-ink)', 'var(--mm-color-ink)', 'var(--mm-color-ink)']);
  // the time is spread over the words: 3 of 7 words are the first group
  assert.equal(at(0.42).text, 'We shipped it.');
  assert.equal(at(0.44).text, 'Nobody noticed at all');
  // the accent walks the group a word at a time
  assert.deepEqual(at(0.15).colors, ['var(--mm-color-ink)', 'var(--mm-accent-text)', 'var(--mm-color-muted)']);
  // count cuts 4 and 3
  assert.equal(at(0.1, { breaks: 'count' }).text, 'We shipped it. Nobody');
});

test('breaks: score in mode words: a pause of the speaker breaks the group where no punctuation does', () => {
  const words = [['so', 0, 0.3], ['today', 0.35, 0.7], ['we', 0.75, 1.0], ['talk', 1.05, 1.4], ['about', 1.45, 1.8], ['pricing', 2.4, 2.9], ['and', 2.95, 3.2], ['plans', 3.25, 3.7]].map(([text, at, end]) => ({ text, at, end }));
  const shown = (t, params) => { const el = fakeEl(''); karaoke.at(el, 0.5, { params: { mode: 'words', group: 5, ...params }, u: t, d: 9, footage: { t, fps: 30, words, clip: 0, clipAt: () => 0 } }); return snap(el).text; };
  assert.equal(shown(1.6), 'so today we talk about', 'the 0.6 s pause after "about" ends the group');
  assert.equal(shown(2.6), 'pricing and plans');
  assert.equal(shown(1.6, { breaks: 'count' }), 'so today we talk about', 'count with 5 happens to agree');
  assert.equal(shown(2.6, { breaks: 'count' }), 'pricing and plans');
  assert.equal(shown(0.5, { group: 3, breaks: 'count' }), 'so today we');
});

test('breaks: score keeps a group within chars; 0 is no limit', () => {
  const text = 'internationalization characteristically unquestionably misunderstood extraordinarily incomprehensible';
  const first = (params) => { const el = fakeEl(text); karaoke.at(el, 0.01, { params: { group: 4, ...params } }); return snap(el).text; };
  assert.equal(first({ chars: 45 }).split(' ').length, 2);
  assert.ok(first({ chars: 0 }).split(' ').length >= 3, 'with no limit three or more words fit');
});
