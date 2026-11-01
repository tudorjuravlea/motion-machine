// The shared splitter in a real page: the lines it finds are the lines the browser wrapped (checked
// against the text's own client rects at 16x9 and 9x16), units carry their indexes, a mask clips,
// a twin sits a box away, and a deck's split keeps the original text for a screen reader.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (format, query = {}) => openPiece(PAGE, { server, browser, format, query: { story: 'split', preset: 'editorial', ...query } });
const item = async (o, scene) => (await o.mm.meta()).schedule.items.find((x) => x.scene === scene);
const SLOT = (scene) => `[data-scene="${scene}"] [data-slot="headline"]`;

// the oracle: where the browser itself broke the plain text, read from the rects of each word's own range
const oracleLines = (page, scene) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const node = el.firstChild;
  if (!node || node.nodeType !== 3) return null;
  const text = node.nodeValue, lines = [];
  let top = null;
  for (const m of text.matchAll(/\S+/g)) {
    const r = document.createRange();
    r.setStart(node, m.index); r.setEnd(node, m.index + m[0].length);
    const t = r.getClientRects()[0].top;
    if (top === null || t - top > 4) { lines.push([]); top = t; }
    lines.at(-1).push(m[0]);
  }
  return lines.map((l) => l.join(' '));
}, SLOT(scene));

const splitLines = (page, scene) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} .mm-split__line`)].map((l) => [...l.querySelectorAll('.mm-split__word')].map((w) => w.textContent).join(' ')), SLOT(scene));

for (const format of ['16x9', '9x16']) {
  for (const scene of ['en', 'ro']) {
    test(`${format}: the lines of "${scene}" are the lines the browser wrapped`, async () => {
      const o = await open(format);
      try {
        const it = await item(o, scene);
        await o.mm.seek(it.start + it.d + 0.2);   // at rest: the plain text, wrapped by the page
        const want = await oracleLines(o.page, scene);
        assert.ok(want.length >= 2, `the headline should wrap at ${format} (got ${want.length} line)`);
        await o.mm.seek(it.start + it.d * 0.4);
        assert.deepEqual(await splitLines(o.page, scene), want);
      } finally { await o.close(); }
    });
  }
}

test('mid-entrance the lines are clipped boxes and the same text is there at rest', async () => {
  const o = await open('16x9');
  try {
    const it = await item(o, 'en');
    await o.mm.seek(it.start + it.d * 0.3);
    const mid = await o.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const masks = [...el.querySelectorAll('.mm-split__mask')];
      return { masks: masks.length, clip: masks.every((m) => getComputedStyle(m).overflow === 'clip' || getComputedStyle(m).overflowX === 'clip'), lines: el.querySelectorAll('.mm-split__line').length, vars: [...el.querySelectorAll('.mm-split__word')].map((w) => w.style.getPropertyValue('--line')) };
    }, SLOT('en'));
    assert.ok(mid.masks >= 2 && mid.masks === mid.lines, JSON.stringify(mid));
    assert.ok(mid.clip);
    assert.ok(mid.vars.every((v) => v !== ''), 'every word carries its --line');
    await o.mm.seek(it.start + it.d + 0.2);
    const rest = await o.page.evaluate((sel) => ({ html: document.querySelector(sel).innerHTML, text: document.querySelector(sel).textContent }), SLOT('en'));
    assert.equal(rest.html, rest.text, 'at rest the slot holds only its text');
  } finally { await o.close(); }
});

test('the masked layout has the same boxes as the plain one: a unit is not moved by its clip box', async () => {
  const o = await open('16x9');
  try {
    const it = await item(o, 'en');
    await o.mm.seek(it.start + it.d + 0.2);
    const plain = await o.page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.width, r.height]; }, SLOT('en'));
    await o.mm.seek(it.start + it.d * 0.3);
    const split = await o.page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.width, r.height]; }, SLOT('en'));
    assert.ok(Math.abs(plain[0] - split[0]) < 1.5 && Math.abs(plain[1] - split[1]) < 1.5, `plain ${plain} vs split ${split}`);
  } finally { await o.close(); }
});

test('a Japanese headline splits into words by the dictionary and every character is shown', async () => {
  const o = await open('16x9');
  try {
    const it = await item(o, 'ja');
    await o.mm.seek(it.start + it.d * 0.5);
    const r = await o.page.evaluate((sel) => { const ws = [...document.querySelectorAll(`${sel} .mm-split__word`)]; return { n: ws.length, text: ws.map((w) => w.textContent).join('') }; }, SLOT('ja'));
    assert.ok(r.n > 6, `several words, got ${r.n}`);
    assert.equal(r.text, 'これは日本語のテキストです。ブランドの書体で正しく折り返されます。長い文章も行ごとに現れます。');
  } finally { await o.close(); }
});

test('letters keep their accents and joined emoji whole', async () => {
  const o = await open('16x9');
  try {
    const it = await item(o, 'emoji');
    await o.mm.seek(it.start + it.d * 0.5);
    const chars = await o.page.evaluate((sel) => [...document.querySelectorAll(`${sel} .mm-split__char`)].map((c) => c.textContent), SLOT('emoji'));
    assert.ok(chars.includes('👨‍👩‍👧'), 'the family is one letter');
    assert.ok(chars.includes('👋🏽'), 'the waving hand with its tone is one letter');
    assert.ok(chars.includes('é'), 'the accent stays with its letter');
    assert.equal(chars.join(''), 'Hi' + '👋🏽' + 'team' + '👨‍👩‍👧' + 'Ștefan' + 'é');
  } finally { await o.close(); }
});

test('words keep punctuation: "(almost)" is one unit and the dash is its own', async () => {
  const o = await open('16x9');
  try {
    const it = await item(o, 'words');
    await o.mm.seek(it.start + it.d * 0.5);
    const words = await o.page.evaluate((sel) => [...document.querySelectorAll(`${sel} .mm-split__word`)].map((w) => w.textContent), SLOT('words'));
    assert.deepEqual(words, ['Say', 'it', 'plainly,', 'then', 'say', 'it', 'again', '—', '(almost)', 'every', 'time']);
  } finally { await o.close(); }
});

test('a roll gives every letter a twin one box away inside a clip box, and rest is the plain text', async () => {
  const o = await open('16x9');
  try {
    const it = await item(o, 'roll');
    await o.mm.seek(it.start + it.d * 0.4);
    const r = await o.page.evaluate((sel) => {
      const cs = [...document.querySelectorAll(`${sel} .mm-split__char`)];
      const c = cs[0], twin = c.querySelector('.mm-split__twin'), face = c.querySelector('.mm-split__face');
      const tb = twin.getBoundingClientRect(), fb = face.getBoundingClientRect();
      return { n: cs.length, mask: c.parentElement.className, inert: twin.hasAttribute('inert'), hidden: twin.getAttribute('aria-hidden'), gap: Math.round(tb.top - fb.top), height: Math.round(fb.height) };
    }, SLOT('roll'));
    assert.equal(r.n, 'Rolling in'.replace(' ', '').length);
    assert.match(r.mask, /mm-split__mask/);
    assert.ok(r.inert && r.hidden === 'true');
    assert.ok(Math.abs(r.gap - r.height) <= 2, `twin is one box below its face (gap ${r.gap}, box ${r.height})`);
    await o.mm.seek(it.start + it.d + 0.2);
    assert.equal(await o.page.evaluate((sel) => document.querySelector(sel).innerHTML, SLOT('roll')), 'Rolling in');
  } finally { await o.close(); }
});

test('the same instants give the same pixels in forward and reverse seek order', async () => {
  const o = await open('16x9');
  try {
    const it = await item(o, 'en');
    const ts = [0.1, 0.3, 0.5, 0.8].map((k) => it.start + it.d * k);
    const shot = async (t) => { await o.mm.seek(t); return (await o.page.screenshot({ type: 'png' })).toString('base64'); };
    const fwd = []; for (const t of ts) fwd.push(await shot(t));
    const rev = []; for (const t of [...ts].reverse()) rev.push(await shot(t));
    assert.deepEqual(rev.reverse(), fwd);
  } finally { await o.close(); }
});

test('in a deck the original text stays beside the units for a screen reader, and the units are aria-hidden', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'split-deck', preset: 'editorial' } });
  try {
    const read = (sel) => o.page.evaluate((s) => {
      const el = document.querySelector(s);
      const sr = el.querySelector('.mm-split__sr');
      return { sr: sr?.textContent, hidden: [...el.children].filter((c) => c !== sr).every((c) => c.getAttribute('aria-hidden') === 'true'), units: el.querySelectorAll('.mm-split__word').length };
    }, sel);
    await o.mm.seek(0.4);   // mid-way through the first press
    const head = await read('[data-slot="headline"]');
    assert.equal(head.sr, 'Each line arrives where the page breaks it');
    assert.ok(head.hidden && head.units > 3);
    await o.mm.seek(1.4);   // mid-way through the second press: the words of the sub
    const sub = await read('[data-slot="sub"]');
    assert.equal(sub.sr, 'Read for a screen reader too');
    assert.ok(sub.hidden && sub.units > 3);
  } finally { await o.close(); }
});
