// The studio page, one bench test per behaviour: real Playwright pointer and keyboard gestures on
// temp copies, against the real studio server. Each reads story.json from disk and the page's own state.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser } from '../../scripts/lib/browser.mjs';
import { startStudio } from '../../scripts/studio/server.mjs';
import { editStory, readStory } from '../../scripts/lib/story-edit.mjs';
import { workCopy } from '../cli/cli-helpers.mjs';
import { boxOf, dragBy, exampleCopy, openStudio, settledOf, sleep, stateOf, undoKey, versionOf, waitMs } from './studio-bench-lib.mjs';

let browser, w, s, page, storyFile, original;
const writes = [];

before(async () => {
  browser = await launchBrowser();
  w = workCopy('studio-page');
  storyFile = join(w.film, 'story.json');
  original = readFileSync(storyFile, 'utf8');
  const rise = join(w.patterns, 'entrances', 'rise', 'pattern.js');
  writeFileSync(rise, readFileSync(rise, 'utf8').replace("params: { d:", "params: { side: { type: 'enum(up|down|left|right)', default: 'up', meaning: 'direction of travel' }, d:"));
  s = await startStudio({ piece: w.film });
  page = await openStudio(browser, s, { watch: writes });
});

after(async () => { await browser?.close(); await s?.close(); w?.cleanup(); });

const read = () => readFileSync(storyFile, 'utf8');
const beat0 = () => JSON.parse(read()).scenes[0].beats[0];

/** Puts `text` (the original by default) back as an outside write and waits until the page shows it. */
async function reset(p = page, text = original) {
  if (read() !== text) writeFileSync(storyFile, text);
  await settledOf(p, { version: versionOf(text) });
  await p.evaluate(() => { window.studio.select(null); document.activeElement?.blur?.(); });
}

const clip = (st, id) => st.model.clips.find((c) => c.id === id);

/** A fresh work copy with its own server and page; `edit(text)` may rewrite the story first. */
async function scratch(tag, { edit, open = {} } = {}) {
  const c = workCopy(tag);
  const file = join(c.film, 'story.json');
  if (edit) writeFileSync(file, edit(readFileSync(file, 'utf8')));
  const sv = await startStudio({ piece: c.film });
  const mine = [];
  const p = await openStudio(browser, sv, { watch: mine, ...open });
  return { c, file, sv, p, mine, async close() { await p.close(); await sv.close(); c.cleanup(); } };
}

test('zoom in, out, Fit and ⌘-wheel keep the page at the window width; the toolbar and inspector stay in view; the timeline scrolls', async () => {
  await reset();
  const fits = async () => page.evaluate(() => {
    const vw = innerWidth, de = document.documentElement;
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    return { docW: de.scrollWidth, vw, copyRight: r('#copy').right, sideRight: r('.side').right, sideLeft: r('.side').left };
  });
  const st0 = await stateOf(page);
  for (let i = 0; i < 3; i++) await page.locator('[data-zoom="in"]').click();
  const zin = await stateOf(page);
  assert.ok(zin.view.pxPerS > st0.view.pxPerS * 3, `zoomed in: ${st0.view.pxPerS} → ${zin.view.pxPerS}`);
  const f = await fits();
  assert.ok(f.docW <= f.vw, `the page stays at the window width (${f.docW} ≤ ${f.vw})`);
  assert.ok(f.copyRight <= f.vw && f.sideRight <= f.vw && f.sideLeft < f.vw - 200, 'the toolbar and the inspector are in view');
  const sc = await page.evaluate(() => { const e = document.querySelector('.tl-scroll'); return { sw: e.scrollWidth, cw: e.clientWidth }; });
  assert.ok(sc.sw > sc.cw + 100, 'the timeline scrolls horizontally');
  await page.locator('[data-zoom="out"]').click();
  const zout = await stateOf(page);
  assert.ok(zout.view.pxPerS < zin.view.pxPerS - 1, `zoom out works: ${zin.view.pxPerS} → ${zout.view.pxPerS}`);
  // ⌘/Ctrl + wheel over the timeline, both ways
  const tb = await boxOf(page, '.tl-scroll');
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 60);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 200);
  await page.keyboard.up('Control');
  const wout = await stateOf(page);
  assert.ok(wout.view.pxPerS < zout.view.pxPerS - 1, 'ctrl-wheel zooms out');
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  assert.ok((await stateOf(page)).view.pxPerS > wout.view.pxPerS + 1, 'ctrl-wheel zooms in');
  await page.locator('[data-zoom="fit"]').click();
  const fit = await stateOf(page);
  assert.ok(Math.abs(fit.view.pxPerS - st0.view.pxPerS) < 0.5, `Fit returns to the fitted zoom (${fit.view.pxPerS} vs ${st0.view.pxPerS})`);
  const f2 = await fits();
  assert.ok(f2.docW <= f2.vw);
});

test('a CLI edit that lands while the studio save is in flight is never overwritten by ⌘Z', async () => {
  const t = await scratch('studio-page-02', {
    open: {
      setup: (pg) => pg.route('**/api/edit', async (route) => {
        const resp = await route.fetch();   // the server writes the studio's edit now
        const dir = pg.__dir;
        const cur = readStory(dir);
        await editStory(dir, { edits: [{ op: 'beat.at', scene: 'intro', beat: 0, value: 2 }], version: cur.version, who: 'cli' });
        await sleep(150);
        await route.fulfill({ response: resp });
      }),
    },
  });
  try {
    t.p.__dir = t.c.film;
    const st = await stateOf(t.p);
    const b = await boxOf(t.p, '[data-clip="beat:0.0"]');
    await dragBy(t.p, b.x + 24, b.y + b.height / 2, 0.5 * st.view.pxPerS);
    await t.p.waitForFunction(() => window.studio.state().model.clips.find((c) => c.id === 'beat:0.0').start === 2 && !window.studio.state().busy, null, { timeout: waitMs(10_000) });
    await sleep(300);
    await t.p.evaluate(() => document.activeElement?.blur?.());
    await t.p.keyboard.press(undoKey);
    await sleep(600);
    await settledOf(t.p);
    assert.equal(JSON.parse(readFileSync(t.file, 'utf8')).scenes[0].beats[0].at, 2, "the CLI's value stays");
    assert.match(await t.p.locator('#toast').textContent(), /changed|another|nothing to undo/i, 'the page says why it did not undo');
  } finally { await t.close(); }
});

test('undo puts back a value the param check and rounding would refuse, exactly', async () => {
  const odd = original.replace('{ "at": 0.2, "slot": "headline", "fx": "entrances/rise", "text": "Only time moves things." }', '{ "at": 0.205, "slot": "headline", "fx": "entrances/rise", "text": "Only time moves things.", "params": { "side": "sideways" } }');
  assert.notEqual(odd, original);
  await reset(page, odd);
  await page.locator('[data-clip="beat:0.0"]').click();
  await page.locator('#inspector [data-param="side"]').waitFor();
  let st = await stateOf(page);
  await page.locator('#inspector [data-param="side"]').selectOption('left');
  st = await settledOf(page, { not: st.version });
  const b = await boxOf(page, '[data-clip="beat:0.0"]');
  await dragBy(page, b.x + 24, b.y + b.height / 2, 0.5 * st.view.pxPerS);
  st = await settledOf(page, { not: st.version });
  assert.notEqual(beat0().at, 0.205);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press(undoKey);
  st = await settledOf(page, { not: st.version });
  assert.equal(beat0().at, 0.205, 'the exact old at, unrounded');
  await page.keyboard.press(undoKey);
  await settledOf(page, { not: st.version });
  assert.equal(read(), odd, 'and the old param the checker would refuse, byte for byte');
  await reset();
});

test('a save to a stopped server rolls back to the file, says the studio is disconnected, refuses edits, and reconciles when the server is back', async () => {
  const c = workCopy('studio-page-03');
  const file = join(c.film, 'story.json');
  const text = readFileSync(file, 'utf8');
  let sv = await startStudio({ piece: c.film });
  const port = sv.port, mine = [];
  const p = await openStudio(browser, sv, { watch: mine });
  try {
    const st = await stateOf(p);
    // a save whose request fails (the server is up, the request is not): the page rolls back to the file
    await p.route('**/api/edit', (r) => r.abort('connectionrefused'));
    const b0 = await boxOf(p, '[data-clip="beat:0.0"]');
    await dragBy(p, b0.x + 24, b0.y + b0.height / 2, 0.5 * st.view.pxPerS);
    await p.waitForFunction(() => /not saved/i.test(document.querySelector('#toast').textContent));
    await p.waitForFunction(() => !window.studio.state().busy && window.studio.state().model.clips.find((x) => x.id === 'beat:0.0').start === 0.2, null, { timeout: waitMs(10_000) });
    assert.doesNotMatch(await p.locator('#toast').textContent(), /failed to fetch/i, 'no raw error string');
    await p.unroute('**/api/edit');
    await p.waitForFunction(() => window.studio.state().offline === false, null, { timeout: waitMs(10_000) });
    // the server stops
    await sv.close();
    const b = await boxOf(p, '[data-clip="beat:0.0"]');
    await dragBy(p, b.x + 24, b.y + b.height / 2, 0.5 * st.view.pxPerS);
    await p.waitForFunction(() => window.studio.state().offline === true, null, { timeout: waitMs(10_000) });
    await p.waitForFunction(() => !window.studio.state().busy && window.studio.state().model.clips.find((x) => x.id === 'beat:0.0').start === 0.2, null, { timeout: waitMs(10_000) });
    assert.ok(await p.locator('#offline').isVisible(), 'a persistent disconnected banner');
    assert.match(await p.locator('#offline').textContent(), /not saved/i);
    assert.doesNotMatch(await p.locator('#toast').textContent(), /failed to fetch/i, 'no raw error string');
    await sleep(6500);
    assert.ok(await p.locator('#offline').isVisible(), 'still there after the toast would have gone');
    const n = mine.length;
    const b2 = await boxOf(p, '[data-clip="beat:0.0"]');
    await dragBy(p, b2.x + 24, b2.y + b2.height / 2, 0.5 * st.view.pxPerS);
    await sleep(300);
    assert.equal(mine.length, n, 'no edit is attempted while disconnected');
    writeFileSync(file, text.replace('"duration": 3, "cut"', '"duration": 4, "cut"'));   // changed while the server was down
    sv = await startStudio({ piece: c.film, port });
    await p.waitForFunction(() => window.studio.state().offline === false, null, { timeout: waitMs(15_000) });
    await p.waitForFunction(() => window.studio.state().model.scenes[1].start === 4, null, { timeout: waitMs(10_000) });
    assert.equal(await p.locator('#offline').isVisible(), false);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).scenes[0].beats[0].at, 0.2, 'nothing was written');
  } finally { await p.close(); await sv.close(); c.cleanup(); }
});

test('the timeline is one Tab stop; Alt+arrows move between clips, Up and Down between lanes, with the selection; Enter reaches the inspector, Escape returns', async () => {
  await reset();
  await page.locator('[data-clip="beat:0.0"]').click();
  const stops = () => page.evaluate(() => [...document.querySelectorAll('.tl-content [data-clip], .tl-content [data-scene-block]')].filter((e) => e.tabIndex === 0).map((e) => e.dataset.clip ?? `scene:${e.dataset.sceneBlock}`));
  assert.deepEqual(await stops(), ['beat:0.0'], 'one roving tab stop');
  const focused = () => page.evaluate(() => { const e = document.activeElement; return e?.dataset.clip ?? (e?.dataset.sceneBlock != null ? `scene:${e.dataset.sceneBlock}` : e?.id || e?.tagName); });
  await page.keyboard.press('Alt+ArrowRight');
  assert.equal(await focused(), 'beat:1.0');
  assert.equal((await stateOf(page)).selection.path, '/scenes/1/beats/0', 'the selection follows');
  await page.keyboard.press('ArrowDown');
  assert.equal(await focused(), 'beat:1.1');
  await page.keyboard.press('Alt+ArrowLeft');
  assert.equal(await focused(), 'beat:0.1');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  assert.equal(await focused(), 'scene:0');
  assert.equal((await stateOf(page)).selection.path, '/scenes/0');
  assert.deepEqual(await stops(), ['scene:0']);
  assert.equal(read(), original, 'navigation writes nothing');
  await page.keyboard.press('Tab');
  assert.ok(!/^(beat|scene):/.test(String(await focused())), 'one Tab leaves the timeline');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await focused(), 'scene:0', 'Shift+Tab comes back to the same item');

  await page.keyboard.press('ArrowDown');
  assert.equal(await focused(), 'beat:0.0');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#inspector')?.contains(document.activeElement));
  await page.keyboard.press('Escape');
  assert.equal(await focused(), 'beat:0.0', 'Escape returns to the clip');
  // Enter in a field commits and keeps the focus in the field
  await page.keyboard.press('Enter');
  await page.locator('#f-at').focus();
  const st = await stateOf(page);
  await page.locator('#f-at').fill('0.5');
  await page.keyboard.press('Enter');
  await settledOf(page, { not: st.version });
  assert.equal(beat0().at, 0.5);
  assert.equal(await focused(), 'f-at', 'the field keeps the focus after the save');
  await reset();
});

test('keyboard edits: arrows move a beat by whole frames and a scene by one place; [ ] trim a beat\'s out and a scene\'s end; ? lists the keys', async () => {
  await reset();
  await page.locator('[data-clip="beat:0.0"]').click();
  let st = await stateOf(page);
  await page.keyboard.press('ArrowRight');
  st = await settledOf(page, { not: st.version });
  assert.equal(beat0().at, 0.23, 'one frame: frame 7 of 30');
  await page.keyboard.press('Shift+ArrowRight');
  st = await settledOf(page, { not: st.version });
  assert.equal(beat0().at, 0.33, 'three frames more: frame 10');
  await page.keyboard.press('ArrowLeft');
  st = await settledOf(page, { not: st.version });
  assert.equal(beat0().at, 0.3, 'back one frame: frame 9');
  await page.keyboard.press('[');
  st = await settledOf(page, { not: st.version });
  assert.equal(beat0().out, 2.97, 'out one frame before the scene end');
  await page.keyboard.press(']');
  st = await settledOf(page, { not: st.version });
  assert.equal(beat0().out, 3, 'and back to the end');
  await page.keyboard.press('ArrowUp');   // the scene block
  await page.keyboard.press(']');
  st = await settledOf(page, { not: st.version });
  assert.equal(JSON.parse(read()).scenes[0].duration, 3.03, 'the scene one frame longer');
  await page.keyboard.press('ArrowRight');
  st = await settledOf(page, { not: st.version });
  assert.deepEqual(JSON.parse(read()).scenes.map((x) => x.id), ['outro', 'intro'], 'the scene moved one place later');
  assert.equal(st.selection.path, '/scenes/1', 'the selection follows the scene');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.sceneBlock), '1', 'and so does the focus');
  await page.keyboard.press('?');
  assert.ok(await page.locator('#keys').isVisible(), '? opens the shortcuts');
  assert.match(await page.locator('#keys').textContent(), /Alt/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#keys').isVisible(), false);
  await reset();
});

test('a cut wedge draws at each incoming scene, as long as its cut, labelled with the transition', async () => {
  const g = exampleCopy('pieces/golden-film-kinetic', 'studio-page-05');
  const sg = await startStudio({ piece: g.piece });
  const p = await openStudio(browser, sg);
  try {
    const st = await stateOf(p);
    const cuts = st.model.scenes.filter((x) => x.index > 0 && x.cut?.d > 0);
    assert.ok(cuts.length > 0, 'the golden film has timed cuts');
    for (const sc of cuts) {
      const wd = await p.evaluate((i) => { const e = document.querySelector(`.wedge[data-cut="${i}"]`); return e && { left: parseFloat(e.style.left), width: e.getBoundingClientRect().width, title: e.title }; }, sc.index);
      assert.ok(wd, `a wedge at ${sc.id}`);
      assert.ok(Math.abs(wd.width - sc.cut.d * st.view.pxPerS) < 1.5, `${sc.id}: as wide as the cut`);
      assert.ok(wd.title.includes(sc.cut.pattern.split('/').pop()), `${sc.id}: named ${wd.title}`);
    }
  } finally { await p.close(); await sg.close(); g.cleanup(); }
});

test('trim handles show without hovering on editable clips and scene ends', async () => {
  await reset();
  await page.mouse.move(5, 5);
  const op = await page.evaluate(() => ({
    tail: Number(getComputedStyle(document.querySelector('[data-tail="beat:0.0"]'), '::after').opacity),
    end: Number(getComputedStyle(document.querySelector('[data-scene-end="0"]'), '::after').opacity),
    cursor: getComputedStyle(document.querySelector('[data-tail="beat:0.0"]')).cursor,
  }));
  assert.ok(op.tail >= 0.3, `tail grip visible: ${op.tail}`);
  assert.ok(op.end >= 0.3, `scene-end grip visible: ${op.end}`);
  assert.equal(op.cursor, 'ew-resize');
});

test('the ruler and the gate row stay in view while the lanes scroll (1280×800, the longest piece)', async () => {
  const g = exampleCopy('fixtures/effects-reel', 'studio-page-07');
  const sg = await startStudio({ piece: g.piece });
  const p = await openStudio(browser, sg, { viewport: { width: 1280, height: 800 } });
  try {
    for (const where of ['top', 'middle', 'bottom']) {
      const r = await p.evaluate((where) => {
        const sc = document.querySelector('.tl-scroll');
        sc.scrollTop = where === 'top' ? 0 : where === 'middle' ? (sc.scrollHeight - sc.clientHeight) / 2 : sc.scrollHeight;
        const box = sc.getBoundingClientRect(), bar = sc.offsetHeight - sc.clientHeight;
        const ruler = document.querySelector('.row-ruler').getBoundingClientRect();
        const gate = document.querySelector('.row-gate').getBoundingClientRect();
        return { scrolls: sc.scrollHeight > sc.clientHeight, top: box.top, bottom: box.bottom - bar, ruler: ruler.top, gate: gate.bottom };
      }, where);
      assert.ok(r.scrolls, 'the lanes scroll at this size');
      assert.ok(Math.abs(r.ruler - r.top) < 1.5, `${where}: the ruler is at the top (${r.ruler} vs ${r.top})`);
      assert.ok(Math.abs(r.gate - r.bottom) < 1.5, `${where}: the gate row is at the bottom (${r.gate} vs ${r.bottom})`);
    }
  } finally { await p.close(); await sg.close(); g.cleanup(); }
});

test('a drag past the scene end is clamped so the entrance completes, and the guide says so', async () => {
  await reset();
  const st = await stateOf(page);
  const b = await boxOf(page, '[data-clip="beat:0.0"]');
  let tag = null;
  await dragBy(page, b.x + 24, b.y + b.height / 2, 5 * st.view.pxPerS, {
    during: async () => { tag = await page.evaluate(() => { const g = document.querySelector('[data-snap-guide]'); return g && !g.hidden ? g.textContent : null; }); },
  });
  assert.match(String(tag), /scene end/i, `the guide names the clamp (${tag})`);
  const after = await settledOf(page, { not: st.version });
  const c = clip(after, 'beat:0.0');
  assert.ok(c.enterEnd <= after.model.scenes[0].end + 1e-9, `the entrance completes in the scene (${c.enterEnd})`);
  // a scene end dragged far left stops at its floor, with a tag
  const e = await boxOf(page, '[data-scene-end="0"]');
  tag = null;
  await dragBy(page, e.x + e.width / 2, e.y + e.height / 2, -2.8 * st.view.pxPerS, {
    during: async () => { tag = await page.evaluate(() => { const g = document.querySelector('[data-snap-guide]'); return g && !g.hidden ? g.textContent : null; }); },
  });
  assert.match(String(tag), /last beat|floor/i, `the guide names the floor (${tag})`);
  await settledOf(page);
  await reset();
});

test('an Alt-drag lands on the 30 fps frame grid', async () => {
  await reset();
  const st = await stateOf(page);
  const b = await boxOf(page, '[data-clip="beat:0.0"]');
  await dragBy(page, b.x + 24, b.y + b.height / 2, 0.37 * st.view.pxPerS, { alt: true });
  await settledOf(page, { not: st.version });
  const at = beat0().at;
  assert.ok(Math.abs(at * 30 - Math.round(at * 30)) <= 0.15 + 1e-9, `${at} s is a frame (to 0.01 s)`);
  assert.notEqual(at, 0.2);
  await reset();
});

test('a reload keeps the undo history (from the journal)', async () => {
  await reset();
  const st = await stateOf(page);
  const b = await boxOf(page, '[data-clip="beat:0.0"]');
  await dragBy(page, b.x + 24, b.y + b.height / 2, 0.5 * st.view.pxPerS);
  const a = await settledOf(page, { not: st.version });
  await page.reload();
  await page.waitForFunction(() => window.studio?.ready === true);
  assert.equal((await stateOf(page)).undo, true, 'undo is available after the reload');
  await page.keyboard.press(undoKey);
  await settledOf(page, { not: a.version });
  assert.equal(read(), original);
  await reset();
});

test('numbers show and parse with a decimal point in a comma locale; the out placeholder fits', async () => {
  const t = await scratch('studio-page-11', { open: { locale: 'ro-RO' } });
  try {
    await t.p.locator('[data-clip="beat:0.0"]').click();
    await t.p.locator('#f-at').waitFor();
    assert.equal(await t.p.locator('#f-at').inputValue(), '0.2');
    assert.equal(await t.p.locator('#f-out').getAttribute('placeholder'), 'end');
    const st = await stateOf(t.p);
    await t.p.locator('#f-at').fill('0,8');
    await t.p.keyboard.press('Enter');
    await settledOf(t.p, { not: st.version });
    assert.equal(JSON.parse(readFileSync(t.file, 'utf8')).scenes[0].beats[0].at, 0.8);
    assert.equal(await t.p.locator('#f-at').inputValue(), '0.8');
  } finally { await t.close(); }
});

test('a gate row without an instant seeks where its mark sits on the timeline', async () => {
  await reset();
  await page.evaluate(() => window.studio.seek(0));
  const row = page.locator('#gate .gate-live [data-rule="W-READ"]').first();
  await row.click();
  const st = await stateOf(page);
  const ends = st.model.scenes.map((x) => x.end);
  assert.ok(ends.includes(st.t), `seeked to a scene end (${st.t})`);
});

test('a story that parses but fails the schema is named in the problem banner', async () => {
  const t = await scratch('studio-page-13', { edit: (x) => x.replace('"say": "The kit draws every frame from one number."', '"say": 42') });
  try {
    assert.ok(await t.p.locator('#problem').isVisible());
    assert.match(await t.p.locator('#problem').textContent(), /schema/i);
    assert.match(await t.p.locator('#problem').textContent(), /say/);
  } finally { await t.close(); }
});

test('a missing style.json is named, never a raw JavaScript error', async () => {
  const c = workCopy('studio-page-14');
  rmSync(join(c.film, 'style.json'));
  const sv = await startStudio({ piece: c.film });
  const p = await browser.newPage();
  try {
    await p.goto(`${sv.url}/scripts/studio/ui/index.html?piece=${encodeURI(sv.piece)}`);
    await p.waitForFunction(() => /style\.json/.test(document.body.innerText));
    assert.doesNotMatch(await p.evaluate(() => document.body.innerText), /Cannot read properties/);
  } finally { await p.close(); await sv.close(); c.cleanup(); }
});

test('a style.json change reloads the stage and keeps the undo history', async () => {
  await reset();
  const st = await stateOf(page);
  const b = await boxOf(page, '[data-clip="beat:0.0"]');
  await dragBy(page, b.x + 24, b.y + b.height / 2, 0.5 * st.view.pxPerS);
  await settledOf(page, { not: st.version });
  const styleFile = join(w.film, 'style.json');
  const style = readFileSync(styleFile, 'utf8');
  const frames = await page.evaluate(() => { window.__frame = document.querySelector('#stage iframe'); return true; });
  assert.ok(frames);
  writeFileSync(styleFile, `${style}\n`);
  try {
    await page.waitForFunction(() => document.querySelector('#stage iframe') !== window.__frame && !window.studio.state().busy, null, { timeout: waitMs(10_000) });
    assert.equal((await stateOf(page)).undo, true, 'the undo history is kept');
  } finally { writeFileSync(styleFile, style); }
  await sleep(300);
  await reset();
});

test('read-only pages read as read-only: no drag wording, no warning flags, locked clips look locked; a deck has no bar readout', async () => {
  const t = await scratch('studio-page-16', { edit: (x) => x.replace('"kind": "film",', '"kind": "film",\n  "generator": "scripts/example-generator.mjs",') });
  try {
    const empty = await t.p.locator('#inspector').textContent();
    assert.doesNotMatch(empty, /drag/i);
    assert.match(empty, /read-only/i);
    assert.equal(await t.p.locator('.clip.flagged').count(), 0, 'no warning flags for the read-only reason');
    const cursor = await t.p.evaluate(() => getComputedStyle(document.querySelector('[data-clip="beat:0.0"]')).cursor);
    assert.equal(cursor, 'default');
  } finally { await t.close(); }
  const g = exampleCopy('pieces/golden-deck-kinetic', 'studio-page-16d');
  const sg = await startStudio({ piece: g.piece });
  const p = await openStudio(browser, sg);
  try {
    await p.evaluate(() => window.studio.seek(1.5));
    assert.equal(await p.locator('#bar').isVisible(), false, 'no bar readout on a deck');
    const labels = await p.evaluate(() => [...document.querySelectorAll('.tick-label')].map((e) => e.textContent));
    assert.ok(labels.length && labels.every((x) => !/s$/.test(x)), `a deck is drawn in presses: ${labels.join(' ')}`);
  } finally { await p.close(); await sg.close(); g.cleanup(); }
});

test('grid labels say bar; the last ruler label fits; a selected scene labels its W-READ floor', async () => {
  const g = exampleCopy('pieces/golden-film-kinetic', 'studio-page-17');
  const sg = await startStudio({ piece: g.piece });
  const p = await openStudio(browser, sg);
  try {
    assert.match(await p.locator('.bar-label').first().textContent(), /^bar \d+$/);
    const fit = await p.evaluate(() => {
      const labels = [...document.querySelectorAll('.tick-label')], last = labels[labels.length - 1];
      return { right: last.getBoundingClientRect().right, edge: document.querySelector('.tl-scroll').getBoundingClientRect().right };
    });
    assert.ok(fit.right <= fit.edge, `the last ruler label is not clipped (${fit.right} ≤ ${fit.edge})`);
    await p.evaluate(() => window.studio.select('/scenes/0'));
    const label = p.locator('.floor.sel .floor-label');
    assert.ok(await label.isVisible(), 'the selected scene shows its floor');
    assert.match(await label.textContent(), /\d/);
  } finally { await p.close(); await sg.close(); g.cleanup(); }
});

test('a layout fetch that failed is fetched again', async () => {
  let failed = 0;
  const t = await scratch('studio-page-18', {
    open: { setup: (pg) => pg.route('**/layouts/title-stack/pattern.html', (r) => (r.request().frame() === pg.mainFrame() && failed++ === 0 ? r.abort() : r.continue())) },
  });
  try {
    await t.p.locator('[data-clip="beat:0.0"]').click();
    await t.p.locator('#f-slot').waitFor();
    await t.p.waitForFunction(() => !window.studio.state().busy);
    await t.p.locator('[data-clip="beat:0.1"]').click();
    await t.p.waitForFunction(() => document.querySelector('#f-slot')?.closest('#inspector') && document.querySelector('.insp-sub')?.textContent.includes('Beat 2'));
    const options = await t.p.locator('#f-slot option').allTextContents();
    assert.deepEqual(options.sort(), ['headline', 'sub'], `the slots of the layout: ${options}`);
  } finally { await t.close(); }
});

test('Copy for agent describes the scene as drawn in the viewed format', async () => {
  const t = await scratch('studio-page-19', {
    edit: (x) => x.replace('"say": "The kit draws every frame from one number."', '"say": "The kit draws every frame from one number.",\n      "variants": { "9x16": { "move": "moves/probe" } }'),
    open: { format: '9x16' },
  });
  try {
    await t.p.evaluate(() => { window.__copied = null; navigator.clipboard.writeText = async (x) => { window.__copied = x; }; window.studio.select('/scenes/0'); });
    await t.p.locator('#copy').click();
    await t.p.waitForFunction(() => window.__copied);
    const payload = JSON.parse(await t.p.evaluate(() => window.__copied));
    assert.equal(payload.format, '9x16');
    assert.equal(payload.scene.move, 'moves/probe');
  } finally { await t.close(); }
});

test('the Cut select of a scene with a position can go back to it after an explicit cut', async () => {
  const withPos = original.replace('"id": "intro", "layout": "layouts/title-stack",', '"id": "intro", "position": "opening", "layout": "layouts/title-stack",');
  assert.notEqual(withPos, original);
  await reset(page, withPos);
  await page.evaluate(() => window.studio.select('/scenes/0'));
  await page.locator('#f-cut').waitFor();
  assert.equal(await page.locator('#f-cut option[value=""]').count(), 1);
  const st = await stateOf(page);
  await page.locator('#f-cut').selectOption('');
  await settledOf(page, { not: st.version });
  assert.equal(JSON.parse(read()).scenes[0].cut, undefined, 'the explicit cut is removed');
  await page.evaluate(() => window.studio.select('/scenes/1'));
  await page.waitForFunction(() => document.querySelector('.insp-title')?.textContent === 'Scene outro');
  assert.equal(await page.locator('#f-cut option[value=""]').count(), 0, 'a scene without a position must keep a cut');
  await reset();
});

test('two separate drags of one clip are two undo steps; a held key is one', async () => {
  await reset();
  let st = await stateOf(page);
  let b = await boxOf(page, '[data-clip="beat:0.0"]');
  await dragBy(page, b.x + 24, b.y + b.height / 2, 0.5 * st.view.pxPerS);
  st = await settledOf(page, { not: st.version });
  b = await boxOf(page, '[data-clip="beat:0.0"]');
  await dragBy(page, b.x + 24, b.y + b.height / 2, 0.5 * st.view.pxPerS);
  st = await settledOf(page, { not: st.version });
  assert.equal(beat0().at, 1.2);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press(undoKey);
  st = await settledOf(page, { not: st.version });
  assert.equal(beat0().at, 0.7, 'one undo takes back the second drag only');
  await page.keyboard.press(undoKey);
  st = await settledOf(page, { not: st.version });
  assert.equal(read(), original);

  await page.locator('[data-clip="beat:0.0"]').click();
  for (let k = 0; k < 4; k++) await page.keyboard.down('ArrowRight');   // a held key: repeats after the first
  await page.keyboard.up('ArrowRight');
  st = await settledOf(page, { version: versionOf(original.replace('"at": 0.2, "slot": "headline"', '"at": 0.33, "slot": "headline"')) });
  await page.keyboard.press(undoKey);
  await settledOf(page, { not: st.version });
  assert.equal(read(), original, 'the held key undoes in one step');
  await reset();
});

// ---- the problem banners ----------------------------------------------------------------------
test('banners: an unreadable story shows and clears; an unwritable journal is refused and rolled back; a refused live connection is named', async () => {
  await reset();
  writeFileSync(storyFile, '{ "id": ');
  await page.waitForFunction(() => !document.querySelector('#problem').hidden, null, { timeout: waitMs(10_000) });
  assert.match(await page.locator('#problem').textContent(), /cannot be read/i);
  writeFileSync(storyFile, original);
  await page.waitForFunction(() => document.querySelector('#problem').hidden, null, { timeout: waitMs(10_000) });
  await settledOf(page, { version: versionOf(original) });

  const journal = join(w.film, 'out', 'studio', 'journal.jsonl');
  mkdirSync(join(w.film, 'out', 'studio'), { recursive: true });
  if (!existsSync(journal)) writeFileSync(journal, '');
  chmodSync(journal, 0o444);
  try {
    const st = await stateOf(page);
    const b = await boxOf(page, '[data-clip="beat:0.0"]');
    await dragBy(page, b.x + 24, b.y + b.height / 2, 0.5 * st.view.pxPerS);
    await page.waitForFunction(() => /could not write/i.test(document.querySelector('#toast').textContent));
    await page.waitForFunction(() => !window.studio.state().busy && window.studio.state().model.clips.find((c) => c.id === 'beat:0.0').start === 0.2);
    assert.equal(read(), original, 'nothing written');
  } finally { chmodSync(journal, 0o644); }

  const t = await scratch('studio-page-busy', {
    open: { setup: (pg) => pg.route('**/api/events', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'too-many-clients', reason: 'at most 32 event streams; close a studio tab' }) })) },
  });
  try {
    await t.p.waitForFunction(() => !document.querySelector('#live').hidden, null, { timeout: waitMs(10_000) });
    assert.match(await t.p.locator('#live').textContent(), /close a studio tab/);
    assert.equal((await stateOf(t.p)).offline, false, 'the server answers, so editing stays on');
  } finally { await t.close(); }
});

test('opening the studio on a piece with no edits requests nothing that fails: no journal file, no favicon', async () => {
  const failed = [], logged = [];
  const x = await scratch('studio-quiet', { open: { setup: async (p) => {
    p.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    p.on('console', (m) => { if (m.type() === 'error') logged.push(m.text()); });
  } } });
  try {
    assert.equal(existsSync(join(x.c.film, 'out', 'studio', 'journal.jsonl')), false, 'the piece has no journal');
    assert.ok(await x.p.evaluate(() => Boolean(document.querySelector('link[rel~="icon"]'))), 'the page declares its icon');
    assert.deepEqual(failed, []);
    assert.deepEqual(logged, []);
  } finally { await x.close(); }
});
