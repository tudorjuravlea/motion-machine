// scripts/lib/share.mjs: the pure parts of `mm share` (SPEC §8): the listing title, the share block and
// its idempotent marker, WebVTT captions that match the caption pattern's timing, the transcript, the
// context file and the watch page's text. No browser, no ffmpeg; the CLI test (share.test.mjs) runs the verb.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import karaoke from '../../patterns/text/caption-karaoke/pattern.js';
import {
  MARKER_CLOSE, MARKER_OPEN, baseUrl, captionCues, chaptersOf, contextMd, parseWebvtt, shareBlock, shareDescription,
  shareTitle, transcriptOf, upsertShareBlock, watchPage, webvtt,
} from '../../scripts/lib/share.mjs';

const story = (extra = {}) => ({
  id: 'demo', kind: 'film', formats: ['16x9'], title: 'A launch,\n in one breath', language: 'en',
  facts: [{ id: 'f1', text: 'Ships in March.', source: 'roadmap, 2026' }, { id: 'f2', text: '3 teams use it.', source: 'survey', sample: true }],
  cta: { text: 'Read more', url: 'example.com/launch' },
  scenes: [
    { id: 'hook', duration: 4, layout: 'layouts/statement', say: 'Say one.', beats: [{ at: 0, slot: 'headline', fx: 'entrances/rise', text: 'Make it move' }, { at: 0.3, slot: 'sub', fx: 'entrances/fade', text: 'In your colours' }] },
    { id: 'proof', duration: 5, layout: 'layouts/statement', say: 'Say two.', beats: [{ at: 0, slot: 'sub', fx: 'entrances/fade', text: 'Checked by a gate' }] },
  ],
  ...extra,
});

test('the listing title is the story title as one line, at most 200 characters', () => {
  assert.equal(shareTitle(story()), 'A launch, in one breath');
  assert.equal(shareTitle(story({ title: 'x'.repeat(300) })).length, 200);
  assert.ok(shareTitle(story({ title: 'x'.repeat(300) })).endsWith('…'));
  assert.equal(shareTitle({ id: 'only-an-id', title: '  ' }), 'only-an-id');
});

test('the description is the story\'s share caption, else the hook, the closing headline and the link, on one line', () => {
  assert.equal(shareDescription(story({ share: 'Move your brand.\nChecked.' })), 'Move your brand. Checked.');
  assert.equal(shareDescription(story()), 'Make it move. Checked by a gate. example.com/launch');
});

test('a base URL is http or https, has no credentials and ends in a slash; anything else is refused', () => {
  assert.equal(baseUrl('https://example.com/films/launch'), 'https://example.com/films/launch/');
  assert.equal(baseUrl('http://localhost:8080/x/'), 'http://localhost:8080/x/');
  assert.equal(baseUrl(null), null);
  for (const bad of ['ftp://example.com/', 'javascript:alert(1)', 'https://user:pw@example.com/', 'example.com/x', 'https://exa mple.com/']) assert.throws(() => baseUrl(bad), /url/i, bad);
});

test('the share block is a poster image linking to the page, the link and the credits, between the marker lines', () => {
  const block = shareBlock({ title: 'A [launch]', pageUrl: 'https://example.com/f/', posterUrl: 'https://example.com/f/poster.png', credits: ['Chime by A. Maker, CC BY 4.0'] });
  assert.ok(block.startsWith(MARKER_OPEN) && block.trimEnd().endsWith(MARKER_CLOSE));
  assert.equal(MARKER_OPEN, '<!-- mm-share -->');
  assert.match(block, /\[!\[A \\\[launch\\\]\]\(https:\/\/example\.com\/f\/poster\.png\)\]\(https:\/\/example\.com\/f\/\)/);
  assert.match(block, /\[Watch it\]\(https:\/\/example\.com\/f\/\)/);
  assert.match(block, /Chime by A\. Maker, CC BY 4\.0/);
  assert.equal(block.split(MARKER_OPEN).length, 2);
});

test('the share block cannot be made to close its own marker or break out of its link, whatever the title and credits say', () => {
  const block = shareBlock({ title: 'x --> <!-- mm-share --> ](javascript:alert(1))', pageUrl: 'https://example.com/f/', posterUrl: null, credits: ['a <!-- /mm-share --> b\nc'] });
  assert.equal(block.split(MARKER_OPEN).length, 2);
  assert.equal(block.split(MARKER_CLOSE).length, 2);
  assert.ok(!/\]\(javascript:/.test(block));
  assert.ok(!block.includes('<!-- /mm-share --> b'));
});

test('without a poster URL the block is the link alone; without a page URL it names index.html and says to set --url', () => {
  const link = shareBlock({ title: 'T', pageUrl: 'https://example.com/f/', posterUrl: null, credits: [] });
  assert.ok(!link.includes('!['));
  assert.match(link, /\[Watch it\]\(https:\/\/example\.com\/f\/\)/);
  const bare = shareBlock({ title: 'T', pageUrl: null, posterUrl: null, credits: [] });
  assert.match(bare, /index\.html/);
  assert.match(bare, /--url/);
});

test('upsertShareBlock appends once, replaces on a second run, and leaves the text around it alone', () => {
  const a = shareBlock({ title: 'One', pageUrl: 'https://example.com/a/', posterUrl: null, credits: [] });
  const b = shareBlock({ title: 'Two', pageUrl: 'https://example.com/b/', posterUrl: null, credits: [] });
  const notes = 'Release notes.\n\nMore words.';
  const once = upsertShareBlock(notes, a);
  assert.ok(once.startsWith('Release notes.\n\nMore words.\n\n'));
  assert.equal(upsertShareBlock(once, a), once, 'the same block twice changes nothing');
  const twice = upsertShareBlock(once, b);
  assert.equal(twice.split(MARKER_OPEN).length, 2);
  assert.ok(twice.includes('example.com/b/') && !twice.includes('example.com/a/'));
  assert.ok(twice.startsWith('Release notes.\n\nMore words.'));
  const after = upsertShareBlock(`${once}\nA closing line.\n`, b);
  assert.ok(after.includes('A closing line.') && after.includes('example.com/b/') && !after.includes('example.com/a/'));
  assert.equal(upsertShareBlock('', a), `${a}\n`);
  const open = `Notes\n\n${MARKER_OPEN}\nold block with no end`;
  assert.equal(upsertShareBlock(open, b).split(MARKER_OPEN).length, 2, 'a block whose end was lost is replaced to the end of the text');
});

test('webvtt writes a header, numbered cues with millisecond times and escaped text; parseWebvtt reads it back', () => {
  const cues = [{ start: 0.5, end: 1.25, text: 'Make it <move> & go' }, { start: 3661.0004, end: 3662, text: 'Late' }];
  const text = webvtt(cues);
  assert.ok(text.startsWith('WEBVTT\n\n1\n00:00:00.500 --> 00:00:01.250\nMake it &lt;move&gt; &amp; go\n\n2\n01:01:01.000 --> 01:01:02.000\nLate'));
  assert.deepEqual(parseWebvtt(text), [{ start: 0.5, end: 1.25, text: 'Make it <move> & go' }, { start: 3661, end: 3662, text: 'Late' }]);
  assert.equal(webvtt([]), 'WEBVTT\n');
});

// the pattern's own text at an instant: the oracle the captions are compared with
function patternText(it, prm, t) {
  const el = { kids: [], style: {}, ownerDocument: { createElement: () => ({ className: '', textContent: '', style: {} }) },
    append(...xs) { this.kids.push(...xs); },
    get textContent() { return this.kids.map((k) => (typeof k === 'string' ? k : k.textContent)).join(''); },
    set textContent(v) { this.kids = v ? [String(v)] : []; } };
  el.textContent = it.beat.text ?? '';
  const u = t - it.start, d = it.d, p = d > 0 ? Math.min(1, Math.max(0, u / d)) : 1;
  const words = prm.words ?? [];
  karaoke.at(el, p, { params: { mode: 'even', ...prm.params }, u, d, ...(words.length ? { footage: { t, fps: 30, words, clip: 0, clipAt: () => 0 } } : {}) });
  return el.textContent;
}
const cueAt = (cues, t) => cues.find((c) => c.start <= t && t < c.end)?.text ?? '';

test('captions of a caption-karaoke beat in mode even match what the pattern shows at every sampled instant', () => {
  const text = 'Every frame comes from time. Pauses fall away between the lines, and cuts land quietly.';
  for (const params of [{}, { group: 3 }, { breaks: 'count', group: 4 }, { group: 5, chars: 0 }]) {
    const it = { selector: 'x', scene: 'hook', fx: 'text/caption-karaoke', start: 1, d: 6, beat: { text, params } };
    const scenes = [{ id: 'hook', start: 0, end: 9 }];
    const cues = captionCues({ items: [it], scenes, style: {}, words: [] });
    assert.ok(cues.length >= 2, JSON.stringify(params));
    for (let k = 1; k < cues.length; k++) assert.ok(cues[k].start >= cues[k - 1].end - 1e-9, 'one group at a time');
    assert.equal(cues.at(-1).end, 9, 'the last group stands until the scene ends');
    for (const c of cues) {
      for (const t of [c.start + 0.002, (c.start + c.end) / 2, c.end - 0.002]) assert.equal(patternText(it, { params }, t), cueAt(cues, t), `${JSON.stringify(params)} at ${t}`);
    }
    assert.equal(cueAt(cues, 0.5), '', 'nothing before the beat starts');
  }
});

test('captions in mode words follow the footage words, a group showing from `lead` before its first word', () => {
  const words = [['every', 0.12, 0.48], ['frame', 0.52, 0.88], ['comes', 0.92, 1.28], ['from', 1.32, 1.68], ['time', 1.72, 2.08], ['pauses', 2.453, 2.813], ['fall', 2.853, 3.213],
    ['away', 3.253, 3.613], ['between', 3.653, 4.013], ['lines', 4.053, 4.413]].map(([text, at, end]) => ({ text, at, end }));
  const params = { mode: 'words', breaks: 'count', group: 4 };
  const it = { selector: 'x', scene: 'hook', fx: 'text/caption-karaoke', start: 0, d: 9, beat: { text: '', params } };
  const cues = captionCues({ items: [it], scenes: [{ id: 'hook', start: 0, end: 9 }], style: {}, words });
  assert.deepEqual(cues.map((c) => c.text), ['every frame comes from', 'time pauses fall away', 'between lines']);
  assert.equal(cues[0].start, 0.07, 'lead 0.05 before the first word, not before 0');
  for (const c of cues) for (const t of [c.start + 0.002, (c.start + c.end) / 2, c.end - 0.002]) assert.equal(patternText(it, { params, words }, t), cueAt(cues, t), `at ${t}`);
});

test('a style\'s patterns["text/caption-karaoke"] defaults are used, and a story with no caption beat has no cues', () => {
  const text = 'one two three four five six seven eight';
  const it = { selector: 'x', scene: 's', fx: 'text/caption-karaoke', start: 0, d: 4, beat: { text } };
  const base = captionCues({ items: [it], scenes: [{ id: 's', start: 0, end: 4 }], style: {}, words: [] });
  const two = captionCues({ items: [it], scenes: [{ id: 's', start: 0, end: 4 }], style: { patterns: { 'text/caption-karaoke': { group: 2, breaks: 'count' } } }, words: [] });
  assert.equal(two.length, 4);
  assert.notEqual(base.length, two.length);
  assert.deepEqual(captionCues({ items: [{ ...it, fx: 'entrances/rise' }], scenes: [{ id: 's', start: 0, end: 4 }], style: {}, words: [] }), []);
});

test('a beat that leaves early (out) ends its captions then', () => {
  const it = { selector: 'x', scene: 's', fx: 'text/caption-karaoke', start: 0, d: 2, exit: { start: 3, d: 0.2 }, beat: { text: 'one two three four five six', params: { breaks: 'count', group: 3 } } };
  const cues = captionCues({ items: [it], scenes: [{ id: 's', start: 0, end: 8 }], style: {}, words: [] });
  assert.equal(cues.at(-1).end, 3);
});

const sched = (kind) => ({ kind, scenes: kind === 'film' ? [{ id: 'hook', start: 0, end: 4 }, { id: 'proof', start: 4, end: 9 }] : [{ id: 'hook', start: 0, end: 2 }, { id: 'proof', start: 2, end: 3 }] });

test('chapters are the scenes: a title from the headline, else the first text, else the id; a start and an end', () => {
  const ch = chaptersOf({ story: story(), schedule: sched('film') });
  assert.deepEqual(ch.map((c) => [c.n, c.id, c.title, c.start, c.end]), [[1, 'hook', 'Make it move', 0, 4], [2, 'proof', 'Checked by a gate', 4, 9]]);
  const none = chaptersOf({ story: story({ scenes: [{ id: 'quiet-one', duration: 1, beats: [] }] }), schedule: { kind: 'film', scenes: [{ id: 'quiet-one', start: 0, end: 1 }] } });
  assert.equal(none[0].title, 'Quiet one');
});

test('a deck\'s chapters start at the rest the scene is first shown at', () => {
  const ch = chaptersOf({ story: story({ kind: 'deck' }), schedule: sched('deck') });
  assert.deepEqual(ch.map((c) => c.start), [0, 3], 'scene 1 at rest 0, scene 2 at the rest it cuts in at');
});

test('the transcript lists each scene\'s start, title, what is said and what is shown', () => {
  const t = transcriptOf({ story: story(), schedule: sched('film') });
  assert.equal(t.title, 'A launch, in one breath');
  assert.equal(t.kind, 'film');
  assert.equal(t.unit, 's');
  assert.equal(t.duration, 9);
  assert.deepEqual(t.scenes[0], { n: 1, id: 'hook', title: 'Make it move', start: 0, end: 4, say: 'Say one.', shown: ['Make it move', 'In your colours'] });
  const d = transcriptOf({ story: story({ kind: 'deck' }), schedule: { ...sched('deck'), presses: 3 } });
  assert.equal(d.unit, 'press');
  assert.equal(d.presses, 3);
});

test('context.md carries the facts with their sources, marks illustrative numbers, and says it is material not instruction', () => {
  const md = contextMd({ story: story(), schedule: sched('film'), description: 'D.', credits: ['Chime by A. Maker, CC BY 4.0'] });
  assert.match(md, /^# A launch, in one breath/);
  assert.match(md, /material about one piece/i);
  assert.match(md, /f1: Ships in March\. \(source: roadmap, 2026\)/);
  assert.match(md, /f2: 3 teams use it\. \(source: survey\) \[illustrative, not measured\]/);
  assert.match(md, /Say one\./);
  assert.match(md, /Chime by A\. Maker/);
  assert.match(md, /example\.com\/launch/);
});

const page = (extra = {}) => watchPage({
  kind: 'film', title: 'A <b>launch</b> & "more"', description: 'Make it move. <script>alert(1)</script>', lang: 'en', base: null,
  video: 'film-16x9.mp4', poster: 'poster.png', track: 'captions.vtt', deck: null, duration: 9, chapters: chaptersOf({ story: story(), schedule: sched('film') }),
  transcript: transcriptOf({ story: story(), schedule: sched('film') }), cta: { text: 'Read more', url: 'example.com/launch' }, credits: [], css: ':root { --canvas: #fff; }', index: false, ...extra,
});

test('the watch page escapes the story\'s words, carries a CSP that allows only its own files, and names no external host', () => {
  const html = page();
  assert.ok(!html.includes('<b>launch</b>') && !html.includes('<script>alert(1)'));
  assert.match(html, /<title>A &lt;b&gt;launch&lt;\/b&gt; &amp; &quot;more&quot;<\/title>/);
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /default-src 'none'/);
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/<meta [^>]*(og:|twitter:)[^>]*>/g, '')), 'no external URL outside the card tags');
});

test('the watch page is unlisted by default and listable with --index; it wires the captions track and the chapter list', () => {
  assert.match(page(), /<meta name="robots" content="noindex, nofollow">/);
  assert.ok(!/name="robots"/.test(page({ index: true })));
  assert.match(page(), /<track kind="captions" src="captions\.vtt" srclang="en" label="English">/);
  assert.ok(!/<track[^>]* default/.test(page()), 'not on by default: a film with its captions burned in would show them twice');
  assert.ok(!/<track/.test(page({ track: null })));
  assert.match(page(), /data-start="4"/);
  assert.match(page(), /<video[^>]*poster="poster\.png"/);
});

test('Open Graph and Twitter card tags need absolute URLs: written with a base URL, left out without one', () => {
  assert.ok(!/og:image|twitter:image|og:video/.test(page()));
  const html = page({ base: 'https://example.com/films/launch/' });
  assert.match(html, /<meta property="og:image" content="https:\/\/example\.com\/films\/launch\/poster\.png">/);
  assert.match(html, /<meta property="og:video" content="https:\/\/example\.com\/films\/launch\/film-16x9\.mp4">/);
  assert.match(html, /<meta property="og:title" content="A &lt;b&gt;launch/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.com\/films\/launch\/">/);
});

test('the page for a deck embeds the standalone deck and reads ?press=, a film\'s reads ?t=', () => {
  const deck = page({ kind: 'deck', video: null, deck: 'deck/index.html', chapters: chaptersOf({ story: story({ kind: 'deck' }), schedule: sched('deck') }) });
  assert.match(deck, /<iframe[^>]*src="deck\/index\.html"/);
  assert.match(deck, /press/);
  assert.match(page(), /searchParams\.get\('t'\)/);
});

test('the page says how to publish it: any static host, nothing is uploaded', () => {
  assert.match(page(), /static host/i);
  assert.match(page(), /nothing is uploaded/i);
});
