// The standalone deck's player (scripts/lib/deck-player.js, SPEC §10): opened from file://, with no server and
// no request for the sound, the deck unlocks audio on the first gesture (a one-sample buffer, resume), decodes
// its embedded sprite, and plays each press's cues as that press runs. A jump (a hash, ?press=, goto, Back) plays
// nothing; a mute toggle silences it; Enter and Space advance, except on a control; a parent page can steer the deck.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, launchBrowser } from '../../scripts/lib/browser.mjs';
import { buildDeckSprite } from '../../scripts/lib/deck-sound.mjs';
import { buildStandalone } from '../../scripts/lib/standalone.mjs';

const dir = join(ROOT, 'pieces', `.tmp-deck-player-${process.pid}`);
let browser, sprite, url;

// records the audio calls the page makes; patched before any page script runs
const SPY = `(() => {
  const log = window.__audio = { contexts: 0, resumes: 0, decodes: 0, starts: [], unlocks: 0 };
  const AC = window.AudioContext;
  window.AudioContext = class extends AC { constructor(...a) { super(...a); log.contexts++; } };
  const resume = AC.prototype.resume; AC.prototype.resume = function () { log.resumes++; return resume.call(this); };
  const decode = AC.prototype.decodeAudioData; AC.prototype.decodeAudioData = function (...a) { log.decodes++; return decode.apply(this, a); };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { if (this.buffer && this.buffer.length === 1) log.unlocks++; else log.starts.push({ offset: a[1], duration: a[2], at: Math.round(performance.now()) }); return start.apply(this, a); };
})();`;

before(async () => {
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(ROOT, 'pieces', 'golden-deck-editorial'), dir, { recursive: true, filter: (s) => !/[\\/]out$/.test(s) });
  sprite = await buildDeckSprite(dir);
  const story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8')), style = JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8'));
  buildStandalone(dir, join(dir, 'out', 'deck'), { story, style, sound: sprite });
  url = `file://${join(dir, 'out', 'deck', 'index.html')}`;
  browser = await launchBrowser();
});
after(async () => { await browser?.close(); rmSync(dir, { recursive: true, force: true }); });

async function open(query = '') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(String(e)));
  const asked = [];
  page.on('request', (r) => asked.push(r.url()));
  await page.addInitScript(SPY);
  await page.goto(`${url}${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.mm?.player);
  return { page, problems, asked };
}
const position = (page) => page.evaluate(() => window.mm.position());
const audio = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__audio)));
const arrived = (page, n) => page.waitForFunction((x) => window.mm.position() === x, n, { timeout: 20000 });
const spanOf = (key) => { const [a, b] = sprite.cues[key]; return { offset: a / 1000, duration: (b - a) / 1000 }; };
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('the player says when it has started (window.mm.player): the kit is ready before it, so a test or a parent page waits for the player', async () => {
  const { page } = await open();
  try {
    assert.equal(await page.evaluate(() => typeof window.mm.player?.mute), 'function');
  } finally { await page.close(); }
});

test('the sprite travels inside index.html as a data URI, and nothing is requested for it', async () => {
  const html = readFileSync(join(dir, 'out', 'deck', 'index.html'), 'utf8');
  assert.match(html, /data:audio\/wav;base64,/);
  const { page, asked, problems } = await open();
  try {
    assert.ok(asked.every((u) => u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')), asked.join('\n'));
    assert.ok(!asked.some((u) => /\.(wav|mp3|m4a)$/.test(u)), 'no request for a sound file');
    assert.deepEqual(problems, []);
  } finally { await page.close(); }
});

test('no audio is started before a gesture; the first key unlocks it (a one-sample buffer, resume) and decodes the sprite', async () => {
  const { page } = await open();
  try {
    assert.equal((await audio(page)).contexts, 0, 'no AudioContext before a gesture');
    await page.keyboard.press('ArrowRight');
    await arrived(page, 1);
    await page.waitForFunction(() => window.__audio.decodes > 0);
    const a = await audio(page);
    assert.equal(a.contexts, 1);
    assert.ok(a.resumes >= 1);
    assert.equal(a.unlocks, 1, 'the one-sample buffer played once');
    assert.equal(a.decodes, 1);
  } finally { await page.close(); }
});

test('each press plays the cues of its press, as the sprite says, and no press plays another\'s', async () => {
  const { page } = await open();
  try {
    await page.keyboard.press('ArrowRight');
    await arrived(page, 1);
    const presses = await page.evaluate(() => window.mm.presses);
    for (let n = 2; n <= presses; n++) { await page.keyboard.press('Space'); await arrived(page, n); }
    await page.waitForTimeout(300);
    const played = (await audio(page)).starts;
    assert.equal(played.length, sprite.events.length, 'one start per cue event');
    played.forEach((s, i) => {
      const want = spanOf(sprite.events[i].key);
      assert.ok(near(s.offset, want.offset) && near(s.duration, want.duration), `cue ${i}: played ${s.offset}+${s.duration}, the sprite has ${want.offset}+${want.duration}`);
    });
  } finally { await page.close(); }
});

test('a jump is silent: goto, a hash change, Back and a ?press= link play nothing', async () => {
  const { page } = await open();
  try {
    await page.keyboard.press('ArrowRight');
    await arrived(page, 1);
    await page.waitForTimeout(400);
    const before = (await audio(page)).starts.length;
    await page.evaluate(() => window.mm.goto(3));
    await page.evaluate(() => { location.hash = '#2'; });
    await arrived(page, 2);
    await page.keyboard.press('ArrowLeft');
    await arrived(page, 1);
    await page.waitForTimeout(400);
    assert.equal((await audio(page)).starts.length, before, 'nothing played for the jumps');
  } finally { await page.close(); }
  const linked = await open('?press=2');
  try {
    assert.equal(await position(linked.page), 2);
    await linked.page.waitForTimeout(300);
    const a = await audio(linked.page);
    assert.equal(a.starts.length, 0);
    assert.equal(a.contexts, 0, 'a deep link makes no sound and no AudioContext');
  } finally { await linked.page.close(); }
});

test('the mute button and the m key silence the deck and bring it back; the button says which', async () => {
  const { page } = await open();
  try {
    const mute = page.locator('button.mm-deck-mute');
    assert.equal(await mute.getAttribute('aria-pressed'), 'false');
    await page.keyboard.press('ArrowRight');
    await arrived(page, 1);
    await page.waitForTimeout(300);
    const first = (await audio(page)).starts.length;
    assert.ok(first > 0, 'press 1 sounds');
    await page.keyboard.press('m');
    assert.equal(await mute.getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => window.mm.goto(1));
    await page.keyboard.press('ArrowRight');
    await arrived(page, 2);
    await page.waitForTimeout(300);
    assert.equal((await audio(page)).starts.length, first, 'muted: press 2 is silent');
    await mute.click();
    assert.equal(await mute.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => window.mm.position()), 2, 'the button is a control: a click on it is not a press');
    await page.keyboard.press('ArrowRight');
    await arrived(page, 3);
    await page.waitForTimeout(300);
    assert.ok((await audio(page)).starts.length > first, 'unmuted: press 3 sounds');
  } finally { await page.close(); }
});

test('Enter advances the deck, but not while a control has the focus', async () => {
  const { page } = await open();
  try {
    await page.keyboard.press('Enter');
    await arrived(page, 1);
    await page.locator('button.mm-deck-mute').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    assert.equal(await position(page), 1, 'Enter on the mute button toggles it and does not press');
    assert.equal(await page.locator('button.mm-deck-mute').getAttribute('aria-pressed'), 'true');
  } finally { await page.close(); }
});

test('a parent page can steer the deck: goto, next and prev arrive as messages', async () => {
  const { page } = await open();
  try {
    await page.evaluate(() => window.postMessage({ mm: 'goto', press: 2 }, '*'));
    await arrived(page, 2);
    await page.evaluate(() => window.postMessage({ mm: 'prev' }, '*'));
    await arrived(page, 1);
    await page.evaluate(() => window.postMessage({ mm: 'next' }, '*'));
    await arrived(page, 2);
    await page.evaluate(() => window.postMessage({ mm: 'goto', press: 'x' }, '*'));
    await page.evaluate(() => window.postMessage('not an object', '*'));
    assert.equal(await position(page), 2);
  } finally { await page.close(); }
});

test('a deck with no sound has no mute button and no player cost', async () => {
  const bare = join(ROOT, 'pieces', `.tmp-deck-player-bare-${process.pid}`);
  cpSync(join(ROOT, 'pieces', 'golden-deck-editorial'), bare, { recursive: true, filter: (s) => !/[\\/]out$/.test(s) });
  try {
    const story = JSON.parse(readFileSync(join(bare, 'story.json'), 'utf8')), style = JSON.parse(readFileSync(join(bare, 'style.json'), 'utf8'));
    buildStandalone(bare, join(bare, 'out', 'deck'), { story, style });
    const page = await browser.newPage();
    await page.addInitScript(SPY);
    await page.goto(`file://${join(bare, 'out', 'deck', 'index.html')}`);
    await page.waitForFunction(() => window.mm?.player);
    assert.equal(await page.locator('button.mm-deck-mute').count(), 0);
    await page.keyboard.press('ArrowRight');
    await arrived(page, 1);
    assert.equal((await audio(page)).contexts, 0);
    await page.close();
  } finally { rmSync(bare, { recursive: true, force: true }); }
});

test('in render mode (?render=1) the player adds nothing: no button, no sound, a press is a jump', async () => {
  const { page } = await open('?render=1');
  try {
    assert.equal(await page.locator('button.mm-deck-mute').count(), 0);
    await page.keyboard.press('ArrowRight');
    assert.equal(await position(page), 1, 'a press lands at once');
    const a = await audio(page);
    assert.deepEqual([a.contexts, a.starts.length], [0, 0]);
  } finally { await page.close(); }
});

test('the stage is scaled to fit the window, whole and centred, whatever the window is', async () => {
  for (const [w, h] of [[1280, 720], [600, 900], [2560, 1300]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    try {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.mm?.player);
      const r = await page.evaluate(() => { const b = document.querySelector('.mm-stage').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight }; });
      assert.ok(r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5, `${w}x${h}: inside the window ${JSON.stringify(r)}`);
      assert.ok(Math.abs(r.w / r.h - 16 / 9) < 0.01, 'the frame keeps its shape');
      assert.ok(Math.abs(r.w - w) < 1 || Math.abs(r.h - h) < 1, 'and fills one side');
      assert.ok(r.scrollW <= w && r.scrollH <= h, 'no scrollbars');
    } finally { await page.close(); }
  }
});
