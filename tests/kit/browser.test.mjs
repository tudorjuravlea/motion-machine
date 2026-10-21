// The kit in Chromium (SPEC §2, §10). Serves the repo root on 127.0.0.1 so fonts,
// the kit and the fixture's stub patterns resolve exactly as they would under `mm serve`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { staticFiles } from '../../scripts/lib/static.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const VIEWPORT = { '9x16': { width: 1080, height: 1920 }, '1x1': { width: 1080, height: 1080 }, '16x9': { width: 1920, height: 1080 } };
const story = (kind) => JSON.parse(readFileSync(join(ROOT, `fixtures/kit-smoke/${kind}/story.json`), 'utf8'));

let server, base, browser;

before(async () => {
  // The same file handler as `mm serve`, so types, headers and refusals are the real ones.
  const serve = staticFiles(ROOT);
  server = createServer((req, res) => serve(req, res, new URL(req.url, 'http://x').pathname));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await new Promise((r) => server.close(r));
});

// A fresh page load in its own context: nothing survives from a previous load.
async function open(kind, query = '', hash = '') {
  const s = story(kind);
  const context = await browser.newContext({ viewport: VIEWPORT[s.formats[0]], deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/fixtures/kit-smoke/${kind}/index.html?render=1${query}${hash}`);
  await page.waitForFunction(() => window.mm && (window.mm.ready || window.mm.error));
  const err = await page.evaluate(() => window.mm.error);
  assert.equal(err, undefined, `mount failed: ${err}`);
  return { page, errors, close: () => context.close() };
}

const shot = (page) => page.screenshot({ type: 'png' });
const at = async (page, t) => { await page.evaluate((t) => window.mm.seek(t), t); return shot(page); };

test('film: t ∈ {0, 1.2, 5.9} renders byte-identical PNGs across two fresh page loads', async () => {
  const instants = [0, 1.2, 5.9];
  const a = await open('film');
  const first = {};
  for (const t of instants) first[t] = await at(a.page, t);
  assert.deepEqual(a.errors, []);
  // render mode is on and the render stylesheet won
  const rm = await a.page.evaluate(() => ({
    attr: document.documentElement.hasAttribute('data-render'),
    td: getComputedStyle(document.querySelector('[data-slot="headline"]')).transitionDuration,
    an: getComputedStyle(document.querySelector('[data-slot="headline"]')).animationName,
    fonts: window.mm.fonts.map((f) => f.status),
  }));
  assert.deepEqual(rm.attr, true);
  assert.equal(rm.td, '0s');
  assert.equal(rm.an, 'none');
  assert.ok(rm.fonts.length > 0 && rm.fonts.every((s) => s === 'loaded'), `fonts: ${rm.fonts}`);
  await a.close();

  // second load visits the instants in reverse: no state may survive between seeks
  const b = await open('film');
  for (const t of [...instants].reverse()) {
    const png = await at(b.page, t);
    assert.ok(png.equals(first[t]), `t=${t} differs between loads`);
  }
  await b.close();
  assert.ok(!first[0].equals(first[1.2]) && !first[1.2].equals(first[5.9]), 'the instants show different pictures');
});

test('film: report() at 1.2 shows exactly one element mid-entrance', async () => {
  const { page, close } = await open('film');
  const r = await page.evaluate(() => { window.mm.seek(1.2); return window.mm.report(); });
  assert.equal(r.t, 1.2);
  assert.equal(r.format, story('film').formats[0]);
  const mid = r.elements.filter((e) => e.progress > 0 && e.progress < 1);
  assert.equal(mid.length, 1, JSON.stringify(mid));
  assert.equal(mid[0].selector, '[data-scene="intro"] [data-slot="sub"]');
  for (const e of r.elements) {
    for (const k of ['selector', 'progress', 'box', 'fontPx', 'color', 'bg', 'overshoot']) assert.ok(k in e, `${k} missing`);
    for (const k of ['x', 'y', 'w', 'h']) assert.equal(typeof e.box[k], 'number');
  }
  // the headline is at rest and visible, with its font size from the style
  const head = r.elements.find((e) => e.selector === '[data-scene="intro"] [data-slot="headline"]');
  assert.equal(head.progress, 1);
  assert.ok(head.fontPx > 40 && head.box.w > 0);
  assert.match(head.color, /^rgb/);
  // a spring-driven headline is type, which never overshoots (SPEC §15): it reports 0
  // (a textless spring entrance reports its analytic overshoot: rest-and-hook.browser.test.mjs)
  const r2 = await page.evaluate(() => { window.mm.seek(5.9); return window.mm.report(); });
  const sprung = r2.elements.find((e) => e.selector === '[data-scene="outro"] [data-slot="headline"]');
  assert.equal(sprung.progress, 1);
  assert.equal(sprung.overshoot, 0);
  // a [data-keep] element is audited too
  assert.ok(r2.elements.some((e) => e.selector.includes('data-keep') || e.keep), 'data-keep element reported');
  await close();
});

test('film: ?t= opens at that instant', async () => {
  const a = await open('film', '&t=1.2');
  const direct = await shot(a.page);
  await a.close();
  const b = await open('film');
  assert.ok((await at(b.page, 1.2)).equals(direct));
  await b.close();
});

test('deck: goto(4) on 3 presses equals goto(3); next on the final press does nothing', async () => {
  const { page, close } = await open('deck');
  assert.equal(await page.evaluate(() => window.mm.presses), 3);
  await page.evaluate(() => window.mm.goto(3));
  const three = await shot(page);
  assert.equal(await page.evaluate(() => location.hash), '#3');
  await page.evaluate(() => window.mm.goto(4));
  const four = await shot(page);
  assert.ok(four.equals(three));
  assert.equal(await page.evaluate(() => location.hash), '#3');
  await page.keyboard.press('ArrowRight');
  assert.ok((await shot(page)).equals(three));
  assert.equal(await page.evaluate(() => window.mm.position()), 3);
  await close();
});

test('deck: ← from mid-press lands on the previous integer; mid-press next snaps to the end of the press', async () => {
  const { page, close } = await open('deck');
  await page.evaluate(() => window.mm.goto(2));
  const two = await shot(page);
  await page.evaluate(() => window.mm.seek(2.5));
  const mid = await shot(page);
  assert.ok(!mid.equals(two), '2.5 is mid-entrance');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => window.mm.position()), 2);
  assert.equal(await page.evaluate(() => location.hash), '#2');
  assert.ok((await shot(page)).equals(two));
  // from a rest, ← goes one rest back; Backspace and PageUp are synonyms
  await page.keyboard.press('Backspace');
  assert.equal(await page.evaluate(() => window.mm.position()), 1);
  // mid-press next snaps to the end of the current press
  await page.evaluate(() => window.mm.seek(1.4));
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => window.mm.position()), 2);
  assert.ok((await shot(page)).equals(two));
  await close();
});

test('deck: arriving by hash draws the rest', async () => {
  const a = await open('deck', '', '#2');
  assert.equal(await a.page.evaluate(() => window.mm.position()), 2);
  const byHash = await shot(a.page);
  await a.close();
  const b = await open('deck');
  await b.page.evaluate(() => window.mm.goto(2));
  assert.ok((await shot(b.page)).equals(byHash));
  await b.close();
});

test('kit: fit and count work on loaded fonts', async () => {
  const { page, close } = await open('film');
  const r = await page.evaluate(async () => {
    const { fit } = await import('/runtime/kit/fit.js');
    const { count } = await import('/runtime/kit/count.js');
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;width:600px;font-family:var(--mm-font-display);white-space:nowrap';
    el.textContent = 'Only time moves things';
    document.body.appendChild(el);
    const px = fit(el, 600);
    const span = document.createElement('span');
    span.textContent = el.textContent;
    span.style.cssText = `font-family:var(--mm-font-display);font-size:${px}px;white-space:pre;position:absolute`;
    document.body.appendChild(span);
    const w = span.getBoundingClientRect().width;
    const n = document.createElement('span');
    const text = count(n, 0, 32, 0.5, { pad: 3, suffix: ' rules' });
    return { px, w, text, tab: n.style.fontVariantNumeric };
  });
  assert.ok(Math.abs(r.w - 600) < 3, `widest line ${r.w}px for target 600px`);
  assert.equal(r.text, '016 rules');
  assert.equal(r.tab, 'tabular-nums');
  await close();
});
