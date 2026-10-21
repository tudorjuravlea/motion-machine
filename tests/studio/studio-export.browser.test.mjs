// The format picker and Export. Real clicks on the studio page against the real server and a temp copy of the
// kit-smoke film. Every film format is in the switch, side by side, whatever the piece ships; previewing one writes nothing. Export
// lists every format, the piece's own ticked; ticking another adds it to the piece through
// story.formats (one undoable edit, bytes checked on disk) as Export starts. Export runs the real gate
// and the real export and plays the MP4 it made; a read-only story may export what it ships.
// Edits pause while an export runs, a format added after the panel was first
// opened is ticked, a failing row names its format and switches to it, the page shows
// the server's last export and drops a run a restarted server does not know.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser } from '../../scripts/lib/browser.mjs';
import { startStudio } from '../../scripts/studio/server.mjs';
import { workCopy } from '../cli/cli-helpers.mjs';
import { openStudio, settledOf, stateOf, undoKey, versionOf, waitMs } from './studio-bench-lib.mjs';

let browser, w, s, page, storyFile, original;

before(async () => {
  browser = await launchBrowser();
  w = workCopy('studio-export-ui');
  storyFile = join(w.film, 'story.json');
  // a placeholder in the first headline fails G-PLACEHOLDER at 1.52 s: a failing row that seeks (the film's length and hook only warn)
  writeFileSync(storyFile, readFileSync(storyFile, 'utf8').replace('"Only time moves things."', '"TODO: only time moves things."'));
  original = readFileSync(storyFile, 'utf8');
  s = await startStudio({ piece: w.film, exportFps: 4 });
  page = await openStudio(browser, s);
});
after(async () => { await browser?.close(); await s?.close(); w?.cleanup(); });

const formatsOnDisk = () => JSON.parse(readFileSync(storyFile, 'utf8')).formats;
const switchFormats = () => page.locator('#formats .seg-btn').evaluateAll((bs) => bs.map((b) => b.textContent));
async function settledAt(text) { return settledOf(page, { version: versionOf(text) }); }

const boxesOf = (p = page) => p.locator('#export input[name="format"]').evaluateAll((els) => els.map((e) => [e.value, e.checked]));

test('the switch shows every film format side by side, whatever the piece ships; there is no Formats button; each names its platforms', async () => {
  assert.deepEqual(formatsOnDisk(), ['16x9', '9x16', '1x1'], 'the piece ships three');
  assert.deepEqual(await switchFormats(), ['9×16', '1×1', '4×5', '16×9'], 'the switch shows all four, in the order a story writes them');
  assert.equal(await page.locator('#formats-add').count(), 0, 'no Formats button');
  const titles = await page.locator('#formats .seg-btn').evaluateAll((bs) => bs.map((b) => b.title));
  assert.match(titles[0], /Vertical.*Instagram Reels & Stories, TikTok, YouTube Shorts, LinkedIn vertical/);
  assert.match(titles[1], /Square.*Instagram & LinkedIn post \(square\)/);
  assert.match(titles[2], /Portrait.*Instagram & LinkedIn post \(best on phones\)/);
  assert.match(titles[2], /not exported yet/i, 'a format the piece does not ship says so');
  assert.match(titles[3], /Landscape.*YouTube, LinkedIn, presentations/);
});

test('previewing a format the piece does not ship shows it on the stage and writes nothing', async () => {
  await page.locator('#formats .seg-btn', { hasText: '4×5' }).click();
  await page.waitForFunction(() => window.studio.state().format === '4x5');
  await page.waitForFunction(() => document.querySelector('#stage iframe')?.contentWindow?.mm?.format === '4x5', null, { timeout: waitMs(30_000) });
  assert.equal(readFileSync(storyFile, 'utf8'), original, 'nothing written');
  // an edit made while previewing it lands in the story (ops route a known format to the base story)
  const st = await stateOf(page);
  await page.locator('[data-clip="beat:0.0"]').click();
  await page.keyboard.press('ArrowRight');
  await settledOf(page, { not: st.version });
  assert.equal(JSON.parse(readFileSync(storyFile, 'utf8')).scenes[0].beats[0].at, 0.23, 'nudged one frame in the base story');
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press(undoKey);
  await settledAt(original);
  await page.locator('#formats .seg-btn', { hasText: '16×9' }).click();
  await page.waitForFunction(() => window.studio.state().format === '16x9');
});

test('Export lists every film format with none ticked (only the sound is pre-checked) and Export waits for a pick; ticking one the piece does not ship adds it to the piece as Export starts, in canonical order, one undoable edit', async () => {
  await page.locator('#export-btn').click();
  assert.deepEqual(await boxesOf(), [['9x16', false], ['1x1', false], ['4x5', false], ['16x9', false]], 'no format is pre-ticked');
  const sound = page.locator('#export input[name="sound"]');
  if (await sound.count()) assert.equal(await sound.isChecked(), true, 'the sound mix is the one thing pre-checked');
  assert.equal(await page.locator('[data-export-run]').isDisabled(), true, 'Export waits until a format is ticked');
  assert.match(await page.locator('#export').innerText(), /added to the piece/i, 'the panel says a new format is added when exported');
  await page.locator('#export input[name="format"][value="4x5"]').check();
  assert.equal(await page.locator('[data-export-run]').isDisabled(), false);
  const sent = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/export'));
  await page.locator('[data-export-run]').click();
  assert.deepEqual(JSON.parse((await sent).postData()).formats, ['4x5'], 'only what was ticked');
  const want = original.replace('"formats": ["16x9", "9x16", "1x1"]', '"formats": ["9x16", "1x1", "4x5", "16x9"]');
  assert.equal(readFileSync(storyFile, 'utf8'), want, 'the piece ships 4x5 now');
  await page.locator('[data-export-cancel]').click();
  await page.locator('#export .ex-status', { hasText: 'cancelled' }).waitFor({ timeout: 60_000 });
  await page.locator('#export button', { hasText: 'Back' }).click();   // dismissed: the next opening shows the form
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.studio.state().readOnly == null && !window.studio.state().busy);
  await page.keyboard.press(undoKey);
  await settledAt(original);
  assert.equal(readFileSync(storyFile, 'utf8'), original, 'undo takes the format out byte for byte');
});

test('Export: the dialog lists the formats with sizes; a failing gate lists its rules (a row seeks), Export anyway renders, and the MP4 plays inline', async () => {
  const btn = page.locator('#export-btn');
  assert.match(await btn.getAttribute('class'), /btn-primary/);
  await btn.click();
  const dlg = page.locator('#export');
  assert.ok(await dlg.isVisible());
  const box = await dlg.boundingBox(), vp = page.viewportSize();
  assert.ok(box.y >= 0 && box.y + box.height <= vp.height && box.x >= 0 && box.x + box.width <= vp.width, `the panel opens inside the window: ${JSON.stringify(box)}`);
  assert.deepEqual(await boxesOf(), [['9x16', false], ['1x1', false], ['4x5', false], ['16x9', false]]);
  const text = await dlg.innerText();
  assert.ok(text.includes('1920×1080') && text.includes('1080×1920') && text.includes('1080×1080') && text.includes('1080×1350'), text);
  await dlg.locator('input[name="format"][value="16x9"]').check();
  await dlg.locator('[data-export-run]').click();
  await page.waitForFunction(() => /paused while the export runs/.test(window.studio.state().readOnly ?? ''));
  assert.ok(await page.locator('#paused').isVisible(), 'a banner says edits are paused');
  await dlg.locator('[data-rule="G-PLACEHOLDER"]').waitFor({ timeout: 90_000 });
  assert.equal((await stateOf(page)).readOnly, null, 'edits are back once the run ends');
  assert.equal(await page.locator('#paused').isVisible(), false);
  await page.evaluate(() => window.studio.seek(2));
  await dlg.locator('[data-rule="G-PLACEHOLDER"]').click();
  await page.waitForFunction(() => window.studio.state().t === 1.52);
  await dlg.locator('[data-export-force]').click();
  const video = dlg.locator('video');
  await video.waitFor({ timeout: 180_000 });
  assert.equal(await video.getAttribute('src'), `/${s.piece}/out/kit-smoke-film-16x9.mp4`);
  await page.waitForFunction(() => { const v = document.querySelector('#export video'); return v && v.readyState >= 1 && v.duration > 5; }, null, { timeout: waitMs(30_000) });
  const done = await dlg.innerText();
  assert.ok(done.includes(`${s.piece}/out/kit-smoke-film-16x9.mp4`), done);
  assert.match(done, /UNCHECKED/);
  assert.ok(await dlg.locator('[data-copy-path]').isVisible());
  await page.keyboard.press('Escape');
  assert.equal(await dlg.isVisible(), false);
});

test('a read-only story may export what it ships (export does not edit the story); a format it does not ship cannot be ticked, and says why', async () => {
  const c = workCopy('studio-export-ro');
  const file = join(c.film, 'story.json');
  writeFileSync(file, readFileSync(file, 'utf8').replace('"kind": "film",', '"kind": "film",\n  "generator": "pieces/catalogue/build.mjs",'));
  const sv = await startStudio({ piece: c.film });
  const p = await openStudio(browser, sv);
  try {
    assert.deepEqual(await p.locator('#formats .seg-btn').evaluateAll((bs) => bs.map((b) => b.textContent)), ['9×16', '1×1', '4×5', '16×9'], 'previews every format');
    assert.equal(await p.locator('#export-btn').isDisabled(), false);
    await p.locator('#export-btn').click();
    const four = p.locator('#export input[name="format"][value="4x5"]');
    assert.equal(await four.isDisabled(), true);
    assert.match(await p.locator('#export label.ex-format', { has: p.locator('input[value="4x5"]') }).getAttribute('title'), /generated|read-only/i);
    assert.equal(await p.locator('#export input[name="format"][value="16x9"]').isDisabled(), false);
    await p.keyboard.press('Escape');
    assert.equal(await p.locator('#export').isVisible(), false);
    await p.evaluate(() => document.activeElement?.blur?.());
    assert.match(await p.locator('#keybar').innerText(), /(⌘E|Ctrl E)\s*export/, 'the legend names the export key');
    await p.keyboard.press(process.platform === 'darwin' ? 'Meta+e' : 'Control+e');
    assert.ok(await p.locator('#export').isVisible(), 'the export key opens the panel');
  } finally { await p.close(); await sv.close(); c.cleanup(); }
});

test('every opening of the Export panel starts with no format ticked; Export sends exactly what was ticked', async () => {
  const c = workCopy('studio-export-added');
  const sv = await startStudio({ piece: c.film, exportFps: 4 });
  const p = await openStudio(browser, sv);
  try {
    await p.locator('#export-btn').click();
    await p.locator('#export input[name="format"][value="9x16"]').check();
    await p.keyboard.press('Escape');
    await p.locator('#export-btn').click();
    assert.deepEqual(await boxesOf(p), [['9x16', false], ['1x1', false], ['4x5', false], ['16x9', false]], 'opened again: nothing ticked');
    await p.locator('#export input[name="format"][value="4x5"]').check();
    await p.locator('#export input[name="format"][value="16x9"]').check();
    const sent = p.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/export'));
    await p.locator('[data-export-run]').click();
    assert.deepEqual(JSON.parse((await sent).postData()).formats, ['4x5', '16x9']);
    await p.locator('[data-export-cancel]').click();
    await p.locator('#export .ex-status', { hasText: 'cancelled' }).waitFor({ timeout: 30_000 });
  } finally { await p.close(); await sv.close(); c.cleanup(); }
});

test('the page shows the server\'s last export; a failing row names its format and switches to it before seeking', async () => {
  const last = { id: 'r-1', state: 'failed', formats: ['16x9', '9x16', '1x1'], sound: false, force: false, version: 'x', failed: ['G-EDGE'],
    rules: [{ id: 'G-EDGE', status: 'FAIL', evidence: { reason: 'text crosses the safe margin', instant: 1.1, selector: null, format: '9x16' } }] };
  const p = await openStudio(browser, s, { setup: (pg) => pg.route('**/api/export', (route) => (route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(last) }) : route.continue())) });
  try {
    assert.equal((await stateOf(p)).format, '16x9');
    await p.locator('#export-btn').click();
    const row = p.locator('#export [data-rule="G-EDGE"]');
    await row.waitFor();
    assert.match(await row.innerText(), /G-EDGE · 9×16/);
    await row.click();
    await p.waitForFunction(() => window.studio.state().format === '9x16' && Math.abs(window.studio.state().t - 1.1) < 0.05);
    await p.locator('#export button', { hasText: 'Back' }).click();
    assert.ok(await p.locator('#export [data-export-run]').isVisible(), 'Back shows the form');
    await p.keyboard.press('Escape');
    await p.locator('#export-btn').click();
    assert.ok(await p.locator('#export [data-export-run]').isVisible(), 'a dismissed result is not shown again');
  } finally { await p.close(); }
});

test('a server restarted during an export: the panel says the run stopped, and edits come back', async () => {
  const c = workCopy('studio-export-restart');
  let sv = await startStudio({ piece: c.film, exportFps: 4 });
  const port = sv.port;
  const p = await openStudio(browser, sv, { errors: [] });
  try {
    await p.locator('#export-btn').click();
    await p.locator('#export input[name="format"][value="16x9"]').check();
    await p.locator('[data-export-run]').click();
    await p.locator('[data-export-cancel]').waitFor();
    await p.waitForFunction(() => /paused/.test(window.studio.state().readOnly ?? ''));
    await sv.close();
    sv = await startStudio({ piece: c.film, port, exportFps: 4 });
    await p.locator('#export .ex-line', { hasText: 'restarted' }).waitFor({ timeout: 30_000 });
    assert.equal((await stateOf(p)).readOnly, null, 'edits are back');
    assert.ok(!existsSync(join(c.film, 'out', 'export.lock')), 'the old server released its lock');
  } finally { await p.close(); await sv.close(); c.cleanup(); }
});
