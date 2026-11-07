// W-SAY (SPEC §7, provisional): a film's voice-over (a scene's `say`) is read for words a voice may get wrong, and a
// word that nothing marks, respells or knows warns: acronyms, camelCase, file names, URLs, unit numbers, and (with a
// brand lexicon) product words. `[display](spoken)` and the brand's voice.lexicon clear a word. A cue marker
// `<<slot>>` that names no beat of its scene warns too. A deck's `say` is a note for the presenter: SKIP.
// The rule reads the story and the style alone, so it runs here on a built ctx; one case runs the whole gate.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import wSay from '../../scripts/check/W-SAY.mjs';
import wAnchor from '../../scripts/check/W-ANCHOR.mjs';
import { IDS } from '../../scripts/check.mjs';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { gate, row, warnsOnly } from './_harness.mjs';

const run = gate();
const film = (scenes, style = {}, kind = 'film') => ({ story: { kind, scenes: scenes.map((s, i) => ({ id: `s${i}`, beats: [], ...s })) }, style });

test('W-SAY is one of the gate\'s ids, a warning', () => {
  assert.ok(IDS.includes('W-SAY'));
  assert.ok(IDS.indexOf('W-SAY') > IDS.indexOf('W-ANCHOR'));
});

test('clean voice-over passes, and says how many scenes it read', async () => {
  const r = await wSay(film([{ say: 'Open the app and press the big button.' }, { say: 'That is all.' }]));
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.scenes, 2);
});

test('an unmarked acronym, file name, URL, camelCase name or unit number warns, naming the scene and the word', async () => {
  const r = await wSay(film([{ say: 'Fine words here.' }, { say: 'Call the API, read README.md, visit example.com, use getUser, wait 300ms.' }]));
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.selector, '[data-scene="s1"]');
  assert.deepEqual(r.evidence.all.map((f) => `${f.word}:${f.kind}`), ['API:acronym', 'README.md:file', 'example.com:url', 'getUser:camelcase', '300ms:unit']);
  assert.match(r.evidence.reason, /scene s1.*"API".*\[API\]\(/);
  assert.match(r.evidence.reason, /\+4 more/);
  assert.equal(r.evidence.measured, 5);
});

test('a pronunciation marker or a lexicon entry clears the word', async () => {
  const text = 'Call the [API](ay pee eye) from Zalo.';
  assert.equal((await wSay(film([{ say: text }]))).status, 'PASS');
  const unmarked = film([{ say: 'Call the API from Zalo.' }], { voice: { provider: 'elevenlabs', id: 'v', lexicon: { API: 'ay pee eye', Zalo: 'ZAH-lo' } } });
  assert.equal((await wSay(unmarked)).status, 'PASS');
});

test('product words are checked only when the brand keeps a lexicon', async () => {
  const say = 'Today we meet Pilar again.';
  assert.equal((await wSay(film([{ say }]))).status, 'PASS');
  const r = await wSay(film([{ say }], { voice: { provider: 'elevenlabs', id: 'v', lexicon: { Zalo: 'ZAH-lo' } } }));
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.all[0].kind, 'product-word');
});

test('a cue marker that names no beat of its scene warns', async () => {
  const r = await wSay(film([{ say: 'Watch <<ghost>>this.', beats: [{ slot: 'real' }] }]));
  assert.equal(r.status, 'WARN');
  assert.match(r.evidence.reason, /<<ghost>>.*no beat with slot "ghost"/);
  const ok = await wSay(film([{ say: 'Watch <<real>>this.', beats: [{ slot: 'real' }] }]));
  assert.equal(ok.status, 'PASS');
});

test('SKIP, with its reason, for a deck and for a film with no voice-over', async () => {
  const deck = await wSay(film([{ say: 'Use the API.' }], {}, 'deck'));
  assert.equal(deck.status, 'SKIP');
  assert.match(deck.evidence.reason, /presenter/);
  const silent = await wSay(film([{ beats: [] }, { say: '   ' }]));
  assert.equal(silent.status, 'SKIP');
  assert.match(silent.evidence.reason, /no scene has voice-over/);
});

// ---- cue markers place a beat: W-ANCHOR reads them as anchors ----

const WORDS = [['We', 8.0], ['start', 8.2], ['here', 10], ['and', 10.3], ['then', 10.5]].map(([text, start]) => ({ text, start, end: start + 0.2 }));
const anchorCtx = (beatStart, dir) => ({
  dir, style: {}, story: { audio: { track: 'assets/v.mp3' }, scenes: [{ id: 's', say: 'We start <<hero>>here and then.', beats: [{ slot: 'hero' }] }] },
  schedule: { kind: 'film', scenes: [{ id: 's', start: 8 }], items: [{ selector: 's0', scene: 's', start: beatStart, beat: { slot: 'hero' } }] },
});
test('W-ANCHOR treats <<slot>> in the scene\'s say as the beat\'s anchor: the word it precedes', async () => {
  const { mkdtempSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'say-anchor-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'v.words.json'), JSON.stringify({ words: WORDS }));
  try {
    assert.equal((await wAnchor(anchorCtx(10, dir))).status, 'PASS', 'arrives on "here"');
    const late = await wAnchor(anchorCtx(12, dir));
    assert.equal(late.status, 'WARN');
    assert.equal(late.evidence.status, 'late');
    assert.equal(late.evidence.anchors[0].anchor, 'here and then');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- the gate itself ----

test('fixtures/negatives/W-SAY warns W-SAY and nothing else; a marker on the word makes it pass', async () => {
  const r = warnsOnly(await run('W-SAY'), 'W-SAY');
  assert.match(r.evidence.reason, /SDK/);
  assert.equal(r.evidence.selector, '[data-scene="open"]');
  const dir = join(ROOT, 'fixtures', 'negatives', '.tmp-w-say');
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(ROOT, 'fixtures', 'negatives', 'W-SAY'), dir, { recursive: true });
  try {
    const f = join(dir, 'story.json');
    const story = JSON.parse(readFileSync(f, 'utf8'));
    story.scenes[0].say = 'Use the [SDK](ess dee kay) to start the film.';
    writeFileSync(f, JSON.stringify(story, null, 2));
    assert.equal(row(await run(dir), 'W-SAY').status, 'PASS');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
