// ui/component in a browser, on its demo (a toast stack, then a menu, in calm-product): a toast is out of sight
// before it arrives and gone after it leaves; a motion runs for its spec's length and ends exactly on the
// state's look; a change starts from where the property is, so nothing jumps; no CSS transition is ever live; a
// frame is the same whichever order the instants are drawn in; the menu opens from its trigger, lights the
// items the script names, shuts after the press, and the pointer stays above it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import { demoPiece } from '../../scripts/pattern-stills.mjs';
import { framePng, launchBrowser, openPiece, serveRoot } from '../../scripts/lib/browser.mjs';

let server, browser, o, pieceDir;
before(async () => {
  ({ pieceDir } = demoPiece('ui/component', 'calm-product'));
  server = await serveRoot(); browser = await launchBrowser();
  o = await openPiece(pieceDir, { server, browser, format: '16x9' });
});
after(async () => { await o?.close(); await browser?.close(); await server?.close(); if (pieceDir) rmSync(pieceDir, { recursive: true, force: true }); });

const STANDARD = 0.42, QUICK = 0.2;   // calm-product's duration roles
/** Each toast at t: its title, whether it shows, its attributes, and its moving properties as written. */
const toasts = (t) => o.page.evaluate((x) => {
  window.mm.seek(x);
  return [...document.querySelectorAll('.mm-uc-toast')].map((e) => ({
    title: e.querySelector('.mm-uc-toast__title').textContent, shown: e.style.display !== 'none',
    front: e.hasAttribute('data-front'), expanded: e.hasAttribute('data-expanded'), leaving: e.hasAttribute('data-ending-style'),
    y: parseFloat(e.style.translate.split(' ')[1] ?? '0'), scale: Number(e.style.scale || 1), opacity: Number(e.style.opacity || 1),
    transition: getComputedStyle(e).transitionDuration,
  }));
}, t);

test('a toast is out of sight before it arrives and gone once it has left', async () => {
  assert.deepEqual((await toasts(0.3)).map((x) => x.shown), [false, false, false]);
  assert.deepEqual((await toasts(1.7)).map((x) => x.shown), [true, true, false]);
  const leaving = (await toasts(4.8 + QUICK / 2))[2];
  assert.ok(leaving.shown && leaving.leaving, 'the dismissed toast plays its way out');
  assert.equal((await toasts(4.8 + QUICK + 0.01))[2].shown, false, 'and is gone when its longest motion ends');
});

test('the newest slides in from the edge over the standard duration and ends exactly on its place', async () => {
  const ys = [];
  for (const t of [0.6, 0.6 + STANDARD * 0.25, 0.6 + STANDARD * 0.5, 0.6 + STANDARD * 0.75, 0.6 + STANDARD + 0.001]) ys.push((await toasts(t))[0].y);
  assert.ok(ys[0] > 0, `it starts below its place: ${ys}`);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] < ys[i - 1], `it rises the whole way: ${ys}`);
  assert.equal(ys.at(-1), 0, 'on its place once the motion has run');
});

test('the stack behind the front: each older toast one step up and 5 % smaller, its words covered', async () => {
  const [a, b, c] = await toasts(3.5);
  assert.ok(c.front && !b.front && !a.front);
  assert.ok(b.y < c.y && a.y < b.y, `${a.y} < ${b.y} < ${c.y}`);
  assert.equal(b.scale, 0.95);
  assert.equal(a.scale, 0.9);
  const cover = await o.page.evaluate(() => [...document.querySelectorAll('.mm-uc-toast__cover')].map((e) => Number(e.style.opacity)));
  assert.deepEqual(cover, [1, 1, 0]);
  const open = await toasts(3.6 + QUICK + 0.01);
  assert.ok(open.every((x) => x.expanded && x.scale === 1), 'fanned out, every toast whole');
});

test('a change starts from where a property is: no toast jumps at any step', async () => {
  for (const at of [1.6, 2.6, 3.6, 4.8, 5.6]) {
    const [pre, post] = [await toasts(at - 1e-4), await toasts(at + 1e-4)];
    pre.forEach((x, i) => { if (x.shown && post[i].shown) assert.ok(Math.abs(x.y - post[i].y) < 2, `${x.title} at ${at}: ${x.y} then ${post[i].y}`); });
  }
});

test('no CSS transition is live at any instant', async () => {
  for (const t of [0.7, 1.7, 3.7, 4.9, 6.8]) for (const x of await toasts(t)) assert.equal(x.transition, '0s', `${x.title} at ${t}`);
});

test('a frame is the same whichever order the instants are drawn in', async () => {
  const ts = [0.7, 1.75, 2.9, 3.7, 4.85, 5.7, 6.8];
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const fwd = [];
  for (const t of ts) fwd.push(sha(await framePng(o.page, t)));
  const rev = [];
  for (const t of [...ts].reverse()) rev.unshift(sha(await framePng(o.page, t)));
  assert.deepEqual(rev, fwd);
});

const MENU = 8.4;   // the menu scene starts after the toast scene
const menu = (t) => o.page.evaluate((x) => {
  window.mm.seek(x);
  const sc = document.querySelector('[data-scene="menu"]'), pop = sc.querySelector('.mm-uc-menu__popup'), cur = sc.querySelector('.mm-ui__cursor');
  return { shown: pop.style.display !== 'none', opacity: Number(pop.style.opacity || 1), scale: Number(pop.style.scale || 1),
    lit: [...sc.querySelectorAll('.mm-uc-menu__item')].map((e) => e.hasAttribute('data-highlighted')),
    open: sc.querySelector('.mm-uc-menu__trigger').hasAttribute('data-open'),
    cursorOnTop: !!cur && Number(getComputedStyle(cur).zIndex) > Number(getComputedStyle(pop).zIndex) };
}, t);

test('the menu opens from its trigger, lights what the script names, and shuts after the press', async () => {
  const before = await menu(MENU + 0.7);
  assert.equal(before.shown, false, 'closed before open');
  assert.equal(before.open, false);
  const opening = await menu(MENU + 0.8 + QUICK / 2);
  assert.ok(opening.shown && opening.open && opening.opacity < 1 && opening.scale < 1, `it grows in: ${JSON.stringify(opening)}`);
  assert.deepEqual((await menu(MENU + 1.5)).lit, [true, false, false, false]);
  assert.deepEqual((await menu(MENU + 2.3)).lit, [false, false, true, false]);
  const pressed = await menu(MENU + 2.75);
  assert.ok(pressed.shown && pressed.lit[2], 'the pressed item shows its press');
  assert.ok(pressed.cursorOnTop, 'the pointer is drawn above the menu');
  const gone = await menu(MENU + 2.7 + 0.1 + QUICK + 0.01);
  assert.ok(!gone.shown && !gone.open, 'gone once its leaving has run, and the trigger is closed');
});

const TABS = 13.6, SHEET = 19.6;
test('tabs: the underline takes the pressed tab\'s place, and the old panel is gone before the new one comes', async () => {
  const read = (t) => o.page.evaluate((x) => {
    window.mm.seek(x);
    const sc = document.querySelector('[data-scene="tabs"]');
    const tabs = [...sc.querySelectorAll('.mm-uc-tabs__tab')], line = sc.querySelector('.mm-uc-tabs__indicator');
    return { active: tabs.findIndex((e) => e.hasAttribute('data-active')), x: parseFloat(line.style.translate), w: parseFloat(line.style.width),
      tabs: tabs.map((e) => ({ x: e.offsetLeft, w: e.offsetWidth })), panes: [...sc.querySelectorAll('.mm-uc-tabs__panel')].map((e) => Number(e.style.opacity || 1)) };
  }, t);
  const rest = await read(TABS + 0.9);
  assert.equal(rest.active, 0);
  assert.equal(rest.x, rest.tabs[0].x);
  const after = await read(TABS + 1.0 + 0.7);
  assert.equal(after.active, 1);
  assert.equal(after.x, after.tabs[1].x, 'the underline sits under the second tab');
  assert.equal(after.w, after.tabs[1].w);
  assert.deepEqual(after.panes, [0, 1, 0]);
  for (const dt of [0.05, 0.1, 0.15, 0.2, 0.3]) {
    const mid = await read(TABS + 1.0 + dt);
    assert.ok(!(mid.panes[0] > 0.02 && mid.panes[1] > 0.02), `at +${dt} s two panels show: ${mid.panes}`);
  }
});

test('the sheet: hidden until it opens, the screen behind scales back and dims with it, and it is gone once flicked shut', async () => {
  const read = (t) => o.page.evaluate((x) => {
    window.mm.seek(x);
    const sc = document.querySelector('[data-scene="sheet"]');
    const sheet = sc.querySelector('.mm-uc-sheet');   // a translate of `0 0px` reads back as `0px`: no y means 0
    return { shown: sheet.style.display !== 'none', y: parseFloat(sheet.style.translate.split(' ')[1] ?? '0'), dim: Number(sc.querySelector('.mm-uc-sheet__dim').style.opacity),
      scale: Number(sc.querySelector('.mm-uc__app').style.scale), cursor: !!sc.querySelector('.mm-ui__cursor') };
  }, t);
  assert.equal((await read(SHEET + 0.5)).shown, false);
  const half = await read(SHEET + 1.9), full = await read(SHEET + 3.3);
  assert.ok(half.shown && full.shown);
  assert.ok(full.y < half.y, 'a drag up raises it');
  assert.ok(half.dim > 0.3 && half.scale < 0.95, `the screen behind recedes: ${JSON.stringify(half)}`);
  assert.ok(half.cursor, 'the pointer is drawn to grab it');
  const shut = await read(SHEET + 6.4);
  assert.ok(!shut.shown && shut.dim === 0 && shut.scale === 1, `shut: ${JSON.stringify(shut)}`);
});
