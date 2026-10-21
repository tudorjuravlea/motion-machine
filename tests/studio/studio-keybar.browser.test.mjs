// The key legend: a bar under the timeline that always shows the keys that work right now. Nothing in
// the timeline focused: the playback keys. A beat focused: its nudge, trim, navigation and edit keys.
// A scene focused: its keys. While dragging: Alt and Esc. A read-only story: no editing keys. Each set
// ends with "? all keys", which opens the full list.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser } from '../../scripts/lib/browser.mjs';
import { startStudio } from '../../scripts/studio/server.mjs';
import { workCopy } from '../cli/cli-helpers.mjs';
import { boxOf, openStudio, settledOf, stateOf, versionOf } from './studio-bench-lib.mjs';

let browser, w, s, page, storyFile, original;

before(async () => {
  browser = await launchBrowser();
  w = workCopy('studio-keybar');
  storyFile = join(w.film, 'story.json');
  original = readFileSync(storyFile, 'utf8');
  s = await startStudio({ piece: w.film });
  page = await openStudio(browser, s);
});

after(async () => { await browser?.close(); await s?.close(); w?.cleanup(); });

const legend = (p = page) => p.locator('#keybar').innerText();
const contextOf = (p = page) => p.locator('#keybar').getAttribute('data-context');

test('the legend is visible under the timeline and shows the playback keys when nothing is focused', async () => {
  await page.evaluate(() => { window.studio.select(null); document.activeElement?.blur?.(); });
  assert.ok(await page.locator('#keybar').isVisible(), 'the legend is on screen');
  const bar = await boxOf(page, '#keybar'), tl = await boxOf(page, '#timeline');
  assert.ok(bar.y >= tl.y + tl.height - 1, 'it sits under the timeline');
  assert.ok(bar.y + bar.height <= 900 + 0.5, 'inside the window');
  assert.equal(await contextOf(), 'play');
  const text = await legend();
  for (const k of ['Space', 'J K L', 'I O', 'Tab']) assert.ok(text.includes(k), `play keys name ${k}: ${text}`);
  assert.ok(!/nudge/i.test(text), 'no beat keys without a focused beat');
});

test('a focused beat shows its keys: nudge, trim the exit, next item, lane, edit, remove, undo', async () => {
  await page.locator('[data-clip="beat:0.0"]').click();
  assert.equal(await contextOf(), 'beat');
  const text = await legend();
  for (const k of ['← →', 'nudge', '[ ]', 'Alt ← →', '↑ ↓', 'Enter', 'Delete']) assert.ok(text.includes(k), `beat keys name ${k}: ${text}`);
  assert.match(text, /⌘Z|Ctrl Z/, 'undo, with this platform\'s modifier');
});

test('a focused scene shows its keys: move it, trim its end', async () => {
  await page.locator('[data-clip="beat:0.0"]').click();
  await page.keyboard.press('ArrowUp');
  assert.equal(await contextOf(), 'scene');
  const text = await legend();
  assert.match(text, /← →\s*move the scene/);
  assert.match(text, /\[ \]\s*scene end/);
});

test('while dragging the legend says Alt skips snapping and Esc cancels', async () => {
  const st = await stateOf(page);
  const b = await boxOf(page, '[data-clip="beat:0.0"]');
  await page.mouse.move(b.x + 24, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 24 + 0.3 * st.view.pxPerS, b.y + b.height / 2, { steps: 6 });
  assert.equal(await contextOf(), 'drag');
  const text = await legend();
  assert.ok(text.includes('Alt') && text.includes('Esc'), text);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.equal(readFileSync(storyFile, 'utf8'), original, 'the cancelled drag wrote nothing');
  assert.notEqual(await contextOf(), 'drag');
});

test('"? all keys" in the legend opens the full list', async () => {
  await page.locator('#keybar [data-all-keys]').click();
  assert.ok(await page.locator('#keys').isVisible());
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#keys').isVisible(), false);
});

test('a read-only story shows no editing keys on a focused beat', async () => {
  const c = workCopy('studio-keybar-ro');
  const file = join(c.film, 'story.json');
  writeFileSync(file, readFileSync(file, 'utf8').replace('"kind": "film",', '"kind": "film",\n  "generator": "pieces/catalogue/build.mjs",'));
  const sv = await startStudio({ piece: c.film });
  const p = await openStudio(browser, sv);
  try {
    await settledOf(p, { version: versionOf(readFileSync(file, 'utf8')) });
    await p.locator('[data-clip="beat:0.0"]').click();
    const text = await legend(p);
    assert.ok(!/nudge|Delete|\[ \]/.test(text), `no editing keys: ${text}`);
    assert.match(text, /read-only/i);
    assert.ok(text.includes('Alt ← →'), 'navigation still listed');
  } finally { await p.close(); await sv.close(); c.cleanup(); }
});
