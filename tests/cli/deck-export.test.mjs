// Deck export. out/deck/index.html has no `../` and opens from file:// at rest 0,
// painting the same pixels as the piece served from the repo; handout.pdf has presses + 1 pages and
// is set in the style's bundled faces, one note per scene; walkthrough.mp4 starts on rest 0
// and plays every press's transition before holding its rest.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { framePng, launchBrowser, openPiece } from '../../scripts/lib/browser.mjs';
import { ssim } from '../../scripts/lib/ffmpeg.mjs';
import { WALK_HOLD_S } from '../../scripts/export.mjs';
import { spawnSync } from 'node:child_process';
import { mm, probeVideo, readJson, stampChecked, workCopy } from './cli-helpers.mjs';

let w, manifest;
const sha = (b) => createHash('sha256').update(b).digest('hex');
before(() => {
  w = workCopy('deck-export');
  stampChecked(w.deck);
  const r = mm(['export', w.deck, '--fps', '5', '--prove']);
  assert.equal(r.status, 0, r.out);
  manifest = readJson(join(w.deck, 'out', 'export.json'));
});
after(() => w.cleanup());

test('out/deck/index.html has no ../ and links nothing outside the folder', () => {
  const html = readFileSync(join(w.deck, 'out', 'deck', 'index.html'), 'utf8');
  assert.ok(!html.includes('../'), 'no ../ anywhere in index.html');
  assert.ok(!/https?:\/\//.test(html.replace(/xmlns="http:\/\/www\.w3\.org[^"]*"/g, '')), 'no http(s) URL');
  assert.deepEqual(manifest.deck.warnings, []);
  for (const f of ['fonts', 'patterns', 'story.json', 'style.json']) assert.ok(existsSync(join(w.deck, 'out', 'deck', f)), f);
  const style = readJson(join(w.deck, 'out', 'deck', 'style.json'));
  for (const face of Object.values(style.type)) for (const f of face.files) {
    assert.match(f.src, /^fonts\//);
    assert.ok(existsSync(join(w.deck, 'out', 'deck', f.src)), f.src);
  }
});

test('it opens from file:// at rest 0 and paints what the served piece paints', async () => {
  // The same launch flags as the served side (openPiece): without --disable-lcd-text, Chromium on
  // Linux sets settled text on an opaque background with subpixel antialiasing and rest 3 differs.
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`file://${join(w.deck, 'out', 'deck', 'index.html')}?render=1`);
    await page.waitForFunction(() => window.mm && window.mm.ready !== undefined, null, { timeout: 30_000 });
    const state = await page.evaluate(async () => { await document.fonts.ready; return { ready: window.mm.ready, presses: window.mm.presses, at: window.mm.position(), warnings: window.mm.warnings, fonts: window.mm.fonts.map((f) => f.status) }; });
    assert.equal(state.ready, true);
    assert.equal(state.presses, 3);
    assert.equal(state.at, 0, 'opens at rest 0');
    assert.deepEqual(state.warnings, []);
    assert.ok(state.fonts.every((s) => s === 'loaded'), `fonts ${state.fonts}`);
    assert.deepEqual(errors, []);
    const standalone = [];
    for (const n of [0, 1, 3]) standalone.push(sha(await framePng(page, n)));
    // The same rests from the piece served over http.
    const served = await openPiece(w.deck, { format: '16x9' });
    try {
      const same = [];
      for (const n of [0, 1, 3]) same.push(sha(await framePng(served.page, n)));
      assert.deepEqual(standalone, same);
    } finally { await served.close(); }
  } finally { await browser.close(); }
});

test('handout.pdf has presses + 1 pages, set in the style\'s own faces and not a system font', () => {
  const pdf = readFileSync(join(w.deck, 'out', 'handout.pdf')).toString('latin1');
  const pages = (pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  assert.equal(pages, manifest.handout.pages);
  assert.equal(pages, 3 + 1);
  assert.match(pdf, /^%PDF-/);
  const names = [...pdf.matchAll(/\/FontName\s*\/([A-Za-z0-9+_.-]+)/g)].map((m) => m[1].replace(/^[A-Z]{6}\+/, ''));
  assert.ok(names.length > 0, 'fonts are embedded');
  const family = (n) => ['Fraunces', 'Manrope', 'IBMPlexMono', 'IBM-Plex-Mono'].some((f) => n.startsWith(f) || n.includes(f));
  assert.ok(names.every(family), `every embedded face is one of the style's: ${names}`);
  assert.ok(!names.some((n) => /SFNS|SFPro|Helvetica|Arial|Times|Geneva/i.test(n)), `no system font: ${names}`);
});

test('handout: each scene\'s note appears once, later presses say the scene continues; one @font-face per bundled file', async () => {
  const { handoutFontFaces, handoutHtml } = await import('../../scripts/export.mjs');
  const style = readJson(join(w.deck, 'style.json')), story = readJson(join(w.deck, 'story.json'));
  const css = handoutFontFaces(style, w.deck);
  assert.equal((css.match(/@font-face/g) ?? []).length, 6);
  assert.ok(/font-family: "Manrope"/.test(css) && /data:font\/woff2;base64,/.test(css));
  const rests = [0, 1, 2, 3], pngs = rests.map(() => Buffer.from('x'));
  const sceneOf = (n) => (n <= 2 ? story.scenes[0] : story.scenes[1]);
  const html = handoutHtml({ story, style, dir: w.deck, pngs, rests, sceneOf, viewport: { width: 1920, height: 1080 } });
  for (const sc of story.scenes) assert.equal(html.split(sc.say).length - 1, 1, `"${sc.say}" once`);
  assert.equal(html.split('intro continues').length - 1, 2, 'presses 1 and 2 of intro say it continues');
  assert.doesNotMatch(html, /system-ui|-apple-system|Segoe/);
});

test('walkthrough.mp4 starts on rest 0, plays every press\'s transition, then holds the rest', async () => {
  const file = join(w.deck, 'out', 'walkthrough.mp4');
  const v = probeVideo(file);
  assert.deepEqual([v.width, v.height], [1920, 1080]);
  assert.equal(v.pix_fmt, 'yuv420p');
  assert.equal(v.color_space, 'bt709');
  assert.equal(v.color_range, 'tv');
  const wk = manifest.walkthrough;
  assert.equal(wk.transitions, 3);
  assert.equal(wk.holdS, WALK_HOLD_S);
  assert.ok(wk.seconds > (3 + 1) * WALK_HOLD_S, `holds plus transitions, not holds alone: ${wk.seconds} s`);
  assert.ok(Math.abs(Number(v.duration) - wk.seconds) < 0.25, `duration ${v.duration} vs ${wk.seconds}`);
  // the first frame is rest 0, not rest 1
  const frame0 = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'], { maxBuffer: 64 << 20 }).stdout;
  const opened = await openPiece(w.deck, { format: '16x9' });
  try {
    const rest0 = await framePng(opened.page, 0), rest1 = await framePng(opened.page, 1);
    assert.ok((await ssim(frame0, rest0)) > (await ssim(frame0, rest1)), 'frame 0 looks like rest 0');
  } finally { await opened.close(); }
  assert.equal(manifest.proved, true, '--prove over the rests and mid-entrances passed');
});

test('every font family in out/deck/fonts carries its licence; a family whose licence is missing stops the export, one line, exit 2', () => {
  const families = readdirSync(join(w.deck, 'out', 'deck', 'fonts'));
  assert.ok(families.length >= 2, families.join());
  for (const f of families) assert.match(readFileSync(join(w.deck, 'out', 'deck', 'fonts', f, 'LICENSE.txt'), 'utf8'), /SIL Open Font License/, f);
  const c = workCopy('deck-nolicence');
  try {
    rmSync(join(c.dir, 'kit-smoke', 'assets', 'fonts', 'fraunces', 'LICENSE.txt'));
    stampChecked(c.deck);
    const r = mm(['export', c.deck, '--fps', '5']);
    assert.equal(r.status, 2, r.out);
    assert.equal(r.stderr.trim().split('\n').length, 1, r.stderr);
    assert.match(r.stderr, /fraunces.*LICENSE\.txt/);
    assert.ok(!existsSync(join(c.deck, 'out', 'deck', 'fonts')), 'no deck folder is left half built');
  } finally { c.cleanup(); }
});
