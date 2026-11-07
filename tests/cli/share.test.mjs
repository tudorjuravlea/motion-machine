// mm share (SPEC §8): a self-contained watch folder for a finished film or deck. It writes index.html,
// transcript.json, context.md, captions.vtt (when the film has captions) and share-block.md beside the
// media, copies only regular files from inside the piece, uploads nothing, and the page asks for
// nothing outside the folder. Deep links (?t= for a film, ?press= for a deck) seek.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, launchBrowser, serveRoot } from '../../scripts/lib/browser.mjs';
import { buildStandalone } from '../../scripts/lib/standalone.mjs';
import { MARKER_OPEN, parseWebvtt } from '../../scripts/lib/share.mjs';
import { mm, readJson, solidPng } from './cli-helpers.mjs';

// the pieces sit at pieces/<id> (their imports climb two folders to the kit); what the verb writes goes to a scratch folder
const TMP = join(ROOT, `.tmp-cli-share-${process.pid}`);
const film = join(ROOT, 'pieces', `.tmp-share-${process.pid}-film`), deck = join(ROOT, 'pieces', `.tmp-share-${process.pid}-deck`);
const share = (piece, ...args) => mm(['share', piece, ...args]);
const files = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1)])).sort();
let browser;

before(async () => {
  for (const d of [TMP, film, deck]) rmSync(d, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const skip = (src) => !/[\\/]out$/.test(src);
  cpSync(join(ROOT, 'pieces', 'golden-film-editorial'), film, { recursive: true, filter: skip });
  cpSync(join(ROOT, 'pieces', 'golden-deck-editorial'), deck, { recursive: true, filter: skip });
  // a caption beat in the film: the second scene's headline is a karaoke line
  const story = readJson(join(film, 'story.json'));
  const beat = story.scenes[1].beats[0];
  Object.assign(beat, { fx: 'text/caption-karaoke', text: 'Nobody checks it before you post it, and nothing measures what goes out.', params: { breaks: 'count', group: 4 } });
  writeFileSync(join(film, 'story.json'), JSON.stringify(story, null, 2));
  // a short film with H.264 and AAC, and its poster, where `mm export` would leave them
  mkdirSync(join(film, 'out'), { recursive: true });
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=10:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '5', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', join(film, 'out', 'golden-film-editorial-9x16.mp4')]);
  assert.equal(r.status, 0, String(r.stderr));
  writeFileSync(join(film, 'out', 'poster.png'), solidPng(64, 36, [30, 30, 30]));
  // the standalone deck, where `mm export` would build it
  const dstory = readJson(join(deck, 'story.json')), dstyle = readJson(join(deck, 'style.json'));
  buildStandalone(deck, join(deck, 'out', 'deck'), { story: dstory, style: dstyle });
  browser = await launchBrowser();
});
after(async () => { await browser?.close(); for (const d of [TMP, film, deck]) rmSync(d, { recursive: true, force: true }); });

test('a film: the folder holds the page, the media, the poster, the captions, the transcript, the context and the share block', () => {
  const out = join(TMP, 'film-share');
  const r = share(film, '--out', out, '--url', 'https://example.com/films/launch');
  assert.equal(r.status, 0, r.out);
  const got = files(out);
  for (const f of ['index.html', 'golden-film-editorial-9x16.mp4', 'poster.png', 'captions.vtt', 'transcript.json', 'context.md', 'share-block.md', 'mm-share.json']) assert.ok(got.includes(f), `${f} in ${got.join(', ')}`);
  assert.ok(got.some((f) => /^fonts\/.+\.woff2$/.test(f)) && got.some((f) => /^fonts\/.+LICENSE\.txt$/.test(f)), 'the fonts travel with their licence');
  assert.match(r.stdout, /static host/i);
  assert.match(r.stdout, /nothing was uploaded/i);
  const transcript = readJson(join(out, 'transcript.json'));
  assert.equal(transcript.kind, 'film');
  assert.equal(transcript.scenes.length, 8);
  assert.equal(transcript.scenes[0].start, 0);
  assert.match(transcript.scenes[1].say, /./);
  const block = readFileSync(join(out, 'share-block.md'), 'utf8');
  assert.ok(block.startsWith(MARKER_OPEN));
  assert.match(block, /https:\/\/example\.com\/films\/launch\/poster\.png/);
  assert.match(readFileSync(join(out, 'context.md'), 'utf8'), /f1: A 30-second film/);
  const manifest = readJson(join(out, 'mm-share.json'));
  assert.equal(manifest.kind, 'film');
  assert.ok(manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256) && f.bytes > 0), 'each file listed with its size and sha-256');
  assert.ok(manifest.files.some((f) => f.path === 'index.html'));
});

test('captions.vtt parses, one group at a time, in the second scene, and is wired as a <track>', () => {
  const out = join(TMP, 'film-share');
  const cues = parseWebvtt(readFileSync(join(out, 'captions.vtt'), 'utf8'));
  assert.equal(cues.length, 3, 'a 13-word line in runs of four: 4 + 4 + 4 + 1, the lone last word joined to the run before it');
  const scene = readJson(join(out, 'transcript.json')).scenes[1];
  for (let i = 0; i < cues.length; i++) {
    assert.ok(cues[i].end > cues[i].start);
    if (i) assert.ok(cues[i].start >= cues[i - 1].end - 1e-9, 'no two groups at once');
  }
  assert.ok(cues[0].start >= scene.start - 1e-9, 'the line starts with its scene');
  assert.ok(Math.abs(cues.at(-1).end - scene.end) < 1e-6, 'and the last group stands until the scene ends');
  assert.equal(cues.map((c) => c.text).join(' '), 'Nobody checks it before you post it, and nothing measures what goes out.');
  assert.match(readFileSync(join(out, 'index.html'), 'utf8'), /<track kind="captions" src="captions\.vtt"/);
});

test('the page asks for nothing outside its folder, from http and from file://, and shows no CSP violation', async () => {
  const out = join(TMP, 'film-share');
  const server = await serveRoot(out);
  try {
    for (const url of [`${server.url}/index.html`, `file://${join(out, 'index.html')}`]) {
      const page = await browser.newPage();
      const asked = [], problems = [];
      page.on('request', (rq) => asked.push(rq.url()));
      page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(m.text()); });
      page.on('pageerror', (e) => problems.push(String(e)));
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      const home = url.slice(0, url.lastIndexOf('/') + 1);
      const elsewhere = asked.filter((u) => !u.startsWith(home) && !u.startsWith('data:'));
      assert.deepEqual(elsewhere, [], `${url}: every request stays in the folder`);
      assert.deepEqual(problems.filter((p) => /Content Security Policy|Refused/i.test(p)), [], `${url}: no CSP violation`);
      await page.close();
    }
  } finally { await server.close(); }
});

test('?t= opens the film at that second, a chapter button seeks, and the captions track has its cues', async (t) => {
  const out = join(TMP, 'film-share');
  const server = await serveRoot(out);
  const page = await browser.newPage();
  try {
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    const playable = await page.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"'));
    if (!playable) return t.skip('this Chromium cannot play H.264: the seek is not exercised');
    await page.goto(`${server.url}/index.html?t=2.5`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('video').readyState > 0 && Math.abs(document.querySelector('video').currentTime - 2.5) < 0.2, null, { timeout: 15000 });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('video').readyState > 0);
    const second = page.locator('[data-start]').nth(1);
    const start = Number(await second.getAttribute('data-start'));
    await second.click();
    await page.waitForFunction((s) => Math.abs(document.querySelector('video').currentTime - Math.min(s, 3.9)) < 0.4, start, { timeout: 15000 });
    const cues = await page.evaluate(async () => { const tr = document.querySelector('video').textTracks[0]; tr.mode = 'hidden'; await new Promise((r) => setTimeout(r, 300)); return tr.cues ? tr.cues.length : -1; });
    assert.equal(cues, 3, 'the browser read captions.vtt');
  } finally { await page.close(); await server.close(); }
});

test('a deck: the standalone deck travels inside the folder and ?press= opens it at that rest', async () => {
  const out = join(TMP, 'deck-share');
  const r = share(deck, '--out', out);
  assert.equal(r.status, 0, r.out);
  const got = files(out);
  for (const f of ['index.html', 'deck/index.html', 'deck/story.json', 'transcript.json', 'context.md', 'share-block.md', 'poster.png']) assert.ok(got.includes(f), `${f} in ${got.join(', ')}`);
  assert.ok(!got.includes('captions.vtt'));
  assert.equal(readJson(join(out, 'transcript.json')).unit, 'press');
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`file://${join(out, 'index.html')}?press=3`, { waitUntil: 'load' });
    const frame = await (async () => { for (let i = 0; i < 100; i++) { const f = page.frames().find((x) => x !== page.mainFrame()); if (f && (await f.evaluate(() => Boolean(window.mm?.ready)).catch(() => false))) return f; await page.waitForTimeout(150); } throw new Error('the deck never mounted'); })();
    assert.equal(await frame.evaluate(() => window.mm.position()), 3);
    await page.locator('[data-start]').nth(0).click();
    await page.waitForFunction(() => true);
    await page.waitForTimeout(300);
    assert.equal(await frame.evaluate(() => window.mm.position()), 0, 'a chapter button takes the deck to that scene\'s first rest');
  } finally { await page.close(); }
});

test('a link in the deck folder is not copied and is named; a second run replaces the folder and changes nothing', () => {
  const out = join(TMP, 'deck-share-2');
  const planted = join(deck, 'out', 'deck', 'leak.txt');
  symlinkSync(join(ROOT, 'LICENSE'), planted);
  try {
    const first = share(deck, '--out', out);
    assert.equal(first.status, 0, first.out);
    assert.ok(!existsSync(join(out, 'deck', 'leak.txt')));
    assert.match(first.out, /leak\.txt/);
    assert.match(first.out, /link/i);
    const before = readFileSync(join(out, 'share-block.md'), 'utf8');
    const second = share(deck, '--out', out);
    assert.equal(second.status, 0, second.out);
    assert.equal(readFileSync(join(out, 'share-block.md'), 'utf8'), before);
  } finally { rmSync(planted, { force: true }); }
});

test('it refuses a folder that holds other files, and a stranger\'s folder is left as it was', () => {
  const other = join(TMP, 'not-mine');
  mkdirSync(other, { recursive: true });
  writeFileSync(join(other, 'keep.txt'), 'mine');
  const r = share(film, '--out', other);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /not empty|not a share folder/i);
  assert.equal(readFileSync(join(other, 'keep.txt'), 'utf8'), 'mine');
});

test('another format takes its poster from its own MP4, at the film\'s first rest, not from the first format\'s poster', () => {
  const second = join(film, 'out', 'golden-film-editorial-16x9.mp4');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=10:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', second]);
  assert.equal(r.status, 0, String(r.stderr));
  const out = join(TMP, 'film-16x9');
  const run = share(film, '--out', out, '--format', '16x9');
  assert.equal(run.status, 0, run.out);
  assert.ok(existsSync(join(out, 'golden-film-editorial-16x9.mp4')) && !existsSync(join(out, 'golden-film-editorial-9x16.mp4')));
  const poster = readFileSync(join(out, 'poster.png'));
  assert.equal(poster.readUInt32BE(16), 320, 'a 320 px wide picture: drawn from the 16x9 test file, not the 64 px stand-in poster of the first format');
  assert.equal(readJson(join(out, 'mm-share.json')).format, '16x9');
  rmSync(second, { force: true });
});

test('it needs the export first, a good --url and a piece', () => {
  const bare = join(ROOT, 'pieces', `.tmp-share-${process.pid}-bare`);
  cpSync(join(ROOT, 'pieces', 'golden-deck-editorial'), bare, { recursive: true, filter: (s) => !/[\\/]out$/.test(s) });
  const none = share(bare, '--out', join(TMP, 'x1'));
  assert.equal(none.status, 2, none.out);
  assert.match(none.out, /mm export/);
  const bad = share(film, '--out', join(TMP, 'x2'), '--url', 'javascript:alert(1)');
  assert.equal(bad.status, 2, bad.out);
  assert.match(bad.out, /--url/);
  assert.equal(mm(['share', join(TMP, 'does-not-exist')]).status, 2);
  rmSync(bare, { recursive: true, force: true });
});

test('the page is unlisted by default; --index lists it, unless a used asset has no licence on record', () => {
  const quiet = join(TMP, 'quiet');
  assert.equal(share(film, '--out', quiet).status, 0);
  assert.match(readFileSync(join(quiet, 'index.html'), 'utf8'), /name="robots" content="noindex, nofollow"/);
  const open = join(TMP, 'open');
  assert.equal(share(film, '--out', open, '--index').status, 0);
  assert.ok(!/name="robots"/.test(readFileSync(join(open, 'index.html'), 'utf8')));
  // a picture the story uses, with no licence record beside it
  const story = readJson(join(film, 'story.json'));
  mkdirSync(join(film, 'assets'), { recursive: true });
  writeFileSync(join(film, 'assets', 'photo.png'), solidPng(8, 8, [1, 2, 3]));
  story.scenes[0].beats[0].asset = 'assets/photo.png';
  const text = readFileSync(join(film, 'story.json'), 'utf8');
  writeFileSync(join(film, 'story.json'), JSON.stringify(story, null, 2));
  try {
    const refused = share(film, '--out', join(TMP, 'refused'), '--index');
    assert.equal(refused.status, 2, refused.out);
    assert.match(refused.out, /photo\.png/);
    assert.equal(share(film, '--out', join(TMP, 'unlisted')).status, 0, 'unlisted is always allowed');
  } finally { writeFileSync(join(film, 'story.json'), text); rmSync(join(film, 'assets', 'photo.png'), { force: true }); }
});
