// The studio page as an edit-accuracy bench. Real
// Playwright pointer and keyboard gestures on temp copies of the kit-smoke film, against the real
// studio server; every check reads story.json from disk, byte for byte, and the stage's own schedule.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, launchBrowser } from '../../scripts/lib/browser.mjs';
import { startStudio } from '../../scripts/studio/server.mjs';
import { workCopy } from '../cli/cli-helpers.mjs';
import { boxOf, dragBy, openStudio, settledOf, stateOf, undoKey, versionOf, waitMs } from './studio-bench-lib.mjs';

const SHOTS = join(ROOT, 'out', 'studio-bench');   // git-ignored (out/): screenshots for the lead's review

let browser, w, s, page, storyFile, original;
const writes = [];   // every POST /api/edit and /api/undo the bench page sent

before(async () => {
  browser = await launchBrowser();
  w = workCopy('studio-bench');
  storyFile = join(w.film, 'story.json');
  original = readFileSync(storyFile, 'utf8');
  // the fixture's rise stub has only a number param: give the temp copy's an enum too, as the real
  // entrances/rise has (side), so the inspector's enum control is exercised
  const rise = join(w.patterns, 'entrances', 'rise', 'pattern.js');
  writeFileSync(rise, readFileSync(rise, 'utf8').replace("params: { d:", "params: { side: { type: 'enum(up|down|left|right)', default: 'up', meaning: 'direction of travel' }, d:"));
  s = await startStudio({ piece: w.film });
  page = await open(s);
});

after(async () => { await browser?.close(); await s?.close(); w?.cleanup(); });

const open = (server, { watch = writes, setup } = {}) => openStudio(browser, server, { watch, setup });
const state = (p = page) => stateOf(p);
const settled = (p, opts) => settledOf(p, opts);
const box = boxOf;
const drag = dragBy;
/** Nothing focused: the keys go to the page, not to a timeline item. */
const unfocus = (p = page) => p.evaluate(() => document.activeElement?.blur?.());

/** Puts the original story back (an outside write) and waits until the page shows it. */
async function reset(p = page) {
  // the server reports its own writes at once, so an outside revert right after one is still heard
  if (readFileSync(storyFile, 'utf8') !== original) writeFileSync(storyFile, original);
  await settled(p, { version: versionOf(original) });
  await p.evaluate(() => window.studio.select(null));
  await unfocus(p);
}

const stageItem = (p, i) => p.evaluate((n) => document.querySelector('#stage iframe').contentWindow.mm.schedule.items[n].start, i);

test('drag a beat 0.5 s right: only its `at` changes on disk, the stage moves it, and undo restores the bytes', async () => {
  await reset();
  const st = await state();
  const clip = st.model.clips.find((c) => c.id === 'beat:0.0');
  assert.equal(clip.start, 0.2);
  assert.equal(await stageItem(page, 0), 0.2);
  const b = await box(page, '[data-clip="beat:0.0"]');
  await drag(page, b.x + 24, b.y + b.height / 2, 0.5 * st.view.pxPerS);
  const after = await settled(page, { not: st.version });
  const text = readFileSync(storyFile, 'utf8');
  assert.equal(text, original.replace('{ "at": 0.2, "slot": "headline", "fx": "entrances/rise", "text": "Only', '{ "at": 0.7, "slot": "headline", "fx": "entrances/rise", "text": "Only'));
  assert.equal(after.model.clips.find((c) => c.id === 'beat:0.0').start, 0.7);
  await page.waitForFunction((v) => window.studio.state().stageVersion === v, after.version);
  assert.equal(await stageItem(page, 0), 0.7, "the iframe's mm.schedule places the item 0.5 s later");

  await unfocus();
  await page.keyboard.press(undoKey);
  await settled(page, { not: after.version });
  assert.equal(readFileSync(storyFile, 'utf8'), original, 'undo restores the file byte for byte');
});

test("drag a scene's end: only that scene's duration changes, and every later scene moves by the same amount", async () => {
  await reset();
  const st = await state();
  const b = await box(page, '[data-scene-end="0"]');
  await drag(page, b.x + b.width / 2, b.y + b.height / 2, 0.5 * st.view.pxPerS);
  const after = await settled(page, { not: st.version });
  const text = readFileSync(storyFile, 'utf8');
  assert.equal(text, original.replace('"id": "intro", "layout": "layouts/title-stack", "duration": 3,', '"id": "intro", "layout": "layouts/title-stack", "duration": 3.5,'));
  assert.equal(after.model.scenes[0].duration, 3.5);
  for (let i = 1; i < st.model.scenes.length; i++) {
    assert.equal(after.model.scenes[i].start, st.model.scenes[i].start + 0.5, `scene ${i} starts 0.5 s later`);
  }
  for (const c of st.model.clips.filter((x) => x.sceneIndex > 0)) {
    assert.equal(after.model.clips.find((x) => x.id === c.id).start, c.start + 0.5, `${c.id} moves with its scene`);
  }
});

test('Escape mid-drag sends nothing and leaves the file and the timeline as they were; the snap guide shows the target', async () => {
  await reset();
  await page.evaluate(() => window.studio.seek(1.5));
  const st = await state();
  const before = writes.length;
  const b = await box(page, '[data-clip="beat:0.0"]');
  // aim 3 px past the playhead at 1.5 s: the playhead target (priority 0) wins and its guide shows
  const dx = (1.5 - 0.2) * st.view.pxPerS + 3;
  let guide = null, mid = null;
  await drag(page, b.x + 24, b.y + b.height / 2, dx, {
    escape: true,
    during: async () => {
      await page.waitForFunction(() => window.studio.state().model.clips.find((c) => c.id === 'beat:0.0').start !== 0.2);
      guide = await page.evaluate(() => { const g = document.querySelector('[data-snap-guide]'); return g && !g.hidden ? g.dataset.source : null; });
      mid = await state();
    },
  });
  assert.equal(guide, 'playhead', 'the guide line is drawn at the snap target');
  assert.equal(mid.model.clips.find((c) => c.id === 'beat:0.0').start, 1.5, 'the preview snapped to the playhead');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(writes.length, before, 'no edit request was sent');
  assert.equal(readFileSync(storyFile, 'utf8'), original);
  const end = await state();
  assert.equal(end.model.clips.find((c) => c.id === 'beat:0.0').start, 0.2, 'the preview is gone');
  assert.equal(await page.evaluate(() => document.querySelector('[data-snap-guide]').hidden), true);
});

test('inspector: an enum param is written, then its reset removes the key', async () => {
  await reset();
  await page.locator('[data-clip="beat:0.0"]').click();
  const st = await state();
  assert.equal(st.selection.path, '/scenes/0/beats/0');
  await page.locator('#inspector [data-param="side"]').waitFor();
  const control = page.locator('#inspector [data-param="side"]');
  assert.equal(await control.inputValue(), 'up', 'shows the default');
  await control.selectOption('left');
  const a = await settled(page, { not: st.version });
  assert.deepEqual(JSON.parse(readFileSync(storyFile, 'utf8')).scenes[0].beats[0].params, { side: 'left' });
  await page.locator('#inspector [data-reset="side"]').click();
  await settled(page, { not: a.version });
  const text = readFileSync(storyFile, 'utf8');
  assert.equal(JSON.parse(text).scenes[0].beats[0].params, undefined, 'the key is removed');
  assert.equal(text, original, 'and the bytes are the original ones');
});

test('keyboard: a focused clip nudges by whole frames (arrows, Shift: 0.1 s), a held key undoes in one step, Delete removes the beat', async () => {
  await reset();
  await page.locator('[data-clip="beat:0.0"]').focus();
  let st = await state();
  // a held key: → down three times (the second and third are repeats), each frame from the last (frame 6 → 9)
  for (let k = 0; k < 3; k++) await page.keyboard.down('ArrowRight');
  await page.keyboard.up('ArrowRight');
  st = await settled(page, { version: versionOf(original.replace('"at": 0.2, "slot": "headline"', '"at": 0.3, "slot": "headline"')) });
  assert.equal(JSON.parse(readFileSync(storyFile, 'utf8')).scenes[0].beats[0].at, 0.3);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.clip), 'beat:0.0', 'the clip keeps the focus');
  await page.keyboard.press(undoKey);
  st = await settled(page, { not: st.version });
  assert.equal(readFileSync(storyFile, 'utf8'), original, 'the held key merged into one undo step');
  await page.keyboard.press('Shift+ArrowRight');
  st = await settled(page, { not: st.version });
  assert.equal(JSON.parse(readFileSync(storyFile, 'utf8')).scenes[0].beats[0].at, 0.3, 'Shift: three frames, 0.1 s');
  await page.keyboard.press(undoKey);
  st = await settled(page, { not: st.version });
  assert.equal(readFileSync(storyFile, 'utf8'), original);

  await page.locator('[data-clip="beat:0.1"]').focus();
  await page.keyboard.press('Delete');
  st = await settled(page, { not: st.version });
  assert.equal(JSON.parse(readFileSync(storyFile, 'utf8')).scenes[0].beats.length, 1);
  await unfocus();
  await page.keyboard.press(undoKey);
  await settled(page, { not: st.version });
  assert.deepEqual(JSON.parse(readFileSync(storyFile, 'utf8')), JSON.parse(original), 'undo puts the beat back');
});

test('transport: L plays, K pauses, Home and End, I/O marks', async () => {
  await reset();
  await page.keyboard.press('Home');
  await page.keyboard.press('l');
  await page.waitForFunction(() => window.studio.state().t > 0.3);
  await page.keyboard.press('k');
  const t = (await state()).t;
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await state()).t, t, 'paused');
  await page.keyboard.press('End');
  assert.equal((await state()).t, (await state()).model.duration);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowRight');
  assert.equal((await state()).t, 1);
  await page.keyboard.press('i');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('o');
  const st = await state();
  assert.equal(st.marks.in, 1);
  assert.ok(Math.abs(st.marks.out - (2 + 1 / 30)) < 1e-9);
  const stageT = await page.evaluate(() => document.querySelector('#stage iframe').contentWindow.mm.report().t);
  assert.ok(Math.abs(stageT - st.t) < 1e-9, 'the stage is seeked to the studio clock');
});

test('an outside write while open: the page shows the new timing without a reload', async () => {
  await reset();
  await page.evaluate(() => { window.__sameDocument = true; });
  writeFileSync(storyFile, original.replace('"duration": 3, "cut"', '"duration": 4, "cut"'));
  await page.waitForFunction(() => window.studio.state().model.scenes[1].start === 4, null, { timeout: waitMs(10_000) });
  await page.waitForFunction(() => document.querySelector('#stage iframe').contentWindow.mm?.duration === 7, null, { timeout: waitMs(10_000) });
  assert.equal(await page.evaluate(() => window.__sameDocument), true, 'no manual reload');
  await reset();
});

test('a stale save (the file changed and the page did not hear of it) gets 409: the page says so and reloads', async () => {
  const mine = [];
  const p = await open(s, { watch: mine, setup: (pg) => pg.route('**/api/events', (r) => r.abort()) });
  try {
    await reset(p);
    const st = await state(p);
    writeFileSync(storyFile, original.replace('"duration": 3, "cut"', '"duration": 4, "cut"'));
    const b = await box(p, '[data-clip="beat:0.0"]');
    await drag(p, b.x + 24, b.y + b.height / 2, 0.5 * st.view.pxPerS);
    await p.waitForFunction(() => /the file changed; your edit was not saved/i.test(document.querySelector('#toast')?.textContent ?? ''));
    await settled(p, { version: versionOf(readFileSync(storyFile, 'utf8')) });
    assert.equal((await state(p)).model.scenes[1].start, 4, 'reloaded from the file');
    assert.equal(JSON.parse(readFileSync(storyFile, 'utf8')).scenes[0].beats[0].at, 0.2, 'nothing overwritten');
    assert.equal(mine.length, 1);
  } finally {
    await p.close();
    writeFileSync(storyFile, original);
    await settled(page, { version: versionOf(original) });
  }
});

test('a generated story opens read-only: a banner names why, controls are disabled, no write is possible', async () => {
  const g = workCopy('studio-bench-gen');
  const file = join(g.film, 'story.json');
  const text = readFileSync(file, 'utf8').replace('"kind": "film",', '"kind": "film",\n  "generator": "scripts/example-generator.mjs",');
  writeFileSync(file, text);
  const sg = await startStudio({ piece: g.film });
  const mine = [];
  const p = await open(sg, { watch: mine });
  try {
    const banner = p.locator('#banner');
    assert.ok(await banner.isVisible());
    assert.match(await banner.textContent(), /scripts\/example-generator\.mjs/);
    const st = await state(p);
    assert.ok(st.readOnly);
    await p.locator('[data-clip="beat:0.0"]').click();
    await p.locator('#inspector [data-field="f-slot"]').waitFor();
    const controls = p.locator('#inspector input, #inspector select, #inspector textarea, #inspector button[data-reset]');
    assert.ok(await controls.count() > 0, 'the inspector shows the beat');
    for (const c of await controls.all()) assert.equal(await c.isDisabled(), true);
    const b = await box(p, '[data-clip="beat:0.0"]');
    await drag(p, b.x + 24, b.y + b.height / 2, 0.5 * st.view.pxPerS);
    assert.equal(await p.locator('[data-scene-end], [data-tail]').count(), 0, 'no drag handles are drawn');
    const e = await box(p, '[data-scene-block="0"]');
    await drag(p, e.x + e.width - 3, e.y + e.height / 2, 0.5 * st.view.pxPerS);
    await p.locator('[data-clip="beat:0.0"]').focus();
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('Delete');
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(mine.length, 0, 'no edit request');
    assert.equal(readFileSync(file, 'utf8'), text, 'the file is unchanged');
  } finally {
    await p.close(); await sg.close(); g.cleanup();
  }
});

test('a screenshot of the studio on pieces/golden-film-kinetic, for the review', async () => {
  const dir = join(ROOT, `.tmp-cli-studio-bench-golden-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(ROOT, 'pieces', 'golden-film-kinetic'), join(dir, 'golden-film-kinetic'), { recursive: true, filter: (src) => !src.includes(`${join('golden-film-kinetic', 'out')}`) });
  const sg = await startStudio({ piece: join(dir, 'golden-film-kinetic') });
  const p = await open(sg, { watch: [] });
  try {
    const st = await state(p);
    assert.ok(st.model.clips.length > 10);
    assert.ok(st.model.grid.beats > 0, 'the music grid is drawn');
    await p.evaluate(() => window.studio.seek(5.2));
    await p.evaluate(() => window.studio.select('/scenes/2/beats/0'));
    await p.waitForTimeout(300);
    mkdirSync(SHOTS, { recursive: true });
    await p.screenshot({ path: join(SHOTS, 'golden-film-kinetic.png') });
  } finally {
    await p.close(); await sg.close(); rmSync(dir, { recursive: true, force: true });
  }
});
