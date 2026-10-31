// Ground kinds drawn by the kit (SPEC §3): a bloom that rises on each scene, a graph-paper that drifts
// and loops, a dot grid. Each is a function of the instant alone (any seek order draws the same
// pixels), drawn in palette roles with sizes as shares of the frame, and a deck draws it still.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { firstBeatWindow } from '../../runtime/kit/ground.js';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (query = {}, format = '16x9', story = 'ground-glass') => openPiece(PAGE, { server, browser, format, query: { story, preset: 'obsidian-premium', ...query } });
const ground = (g) => ({ groundJson: JSON.stringify(g) });
const PAPER = { kind: 'graph-paper', grid: { spacing: 0.02, every: 5, strength: 0.7, drift: 0.012, cycle: 8, scan: { role: 'accent', size: 0.2, strength: 0.14 } } };
// only the ground: the camera and the finish (whose grain is seeded from t) are out of the picture
const groundOnly = (page) => page.addStyleTag({ content: '.mm-camera, .mm-finish { visibility: hidden !important; }' });
const scaleOf = (page, scene) => page.evaluate((i) => {
  const b = document.querySelectorAll('.mm-scene')[i].querySelector(':scope > .mm-ground > .mm-ground__bloom');
  return new DOMMatrix(getComputedStyle(b).transform).a;
}, scene);

test('the bloom is the first thing in every scene, drawn in a palette role, at the frame\'s shares, from its bottom centre', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await open({}, format);
    try {
      const r = [];
      for (const [i, t] of [3.5, 7.5, 11.5].entries()) {   // each scene at rest: the bloom is full size
        await o.mm.seek(t);
        r.push(await o.page.evaluate((k) => {
          const sc = document.querySelectorAll('.mm-scene')[k];
          const g = sc.querySelector(':scope > .mm-ground'), b = g.querySelector('.mm-ground__bloom'), d = g.querySelector('.mm-ground__dots');
          const box = b.getBoundingClientRect();
          return { first: sc.firstElementChild === g, kind: g.dataset.kind, chrome: g.hasAttribute('data-chrome') && g.hasAttribute('data-keep') && g.getAttribute('aria-hidden') === 'true',
            box: { x: box.x, y: box.y, w: box.width, h: box.height }, bloomCss: b.getAttribute('style'), dotsCss: d.getAttribute('style'), frame: { w: innerWidth, h: innerHeight } };
        }, i));
      }
      assert.equal(r.length, 3);
      for (const s of r) {
        const { w, h } = s.frame;
        assert.ok(s.first && s.chrome && s.kind === 'bloom');
        assert.ok(Math.abs(s.box.w - 1.4 * w) <= 2 && Math.abs(s.box.h - 2 * 0.9 * h) <= 2, `${format}: the light is 1.4 wide and 0.9 high (twice that, half of it below the frame): ${JSON.stringify(s.box)}`);
        assert.ok(Math.abs(s.box.x + s.box.w / 2 - w / 2) <= 2 && Math.abs(s.box.y + s.box.h / 2 - h) <= 2, `${format}: centred on the bottom edge`);
        for (const css of [s.bloomCss, s.dotsCss]) {
          assert.match(css, /var\(--mm-color-(accent|line)\)/, 'a palette role');
          assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsl/i, 'no literal colour');
        }
      }
    } finally { await o.close(); }
  }
});

test('on each scene the bloom scales from 0.9 to 1 with the enter ease over the scene\'s first beat, and from then on stays at 1', async () => {
  const o = await open();
  try {
    const sched = await o.page.evaluate(() => ({ scenes: window.mm.schedule.scenes.map(({ id, start }) => ({ id, start })), items: window.mm.schedule.items.filter((it) => !it.parent).map(({ scene, start, d }) => ({ scene, start, d })) }));
    for (const [i, sc] of sched.scenes.entries()) {
      const win = firstBeatWindow(sched.items.filter((it) => it.scene === sc.id), sc.start, 0.42);   // premium's standard duration is 420 ms
      await o.mm.seek(sc.start);
      assert.equal(await scaleOf(o.page, i), 0.9, `${sc.id}: it starts at 0.9`);
      let last = 0.9;
      for (const k of [0.1, 0.25, 0.5, 0.75, 0.95]) {
        await o.mm.seek(sc.start + win * k);
        const s = await scaleOf(o.page, i);
        assert.ok(s > last && s < 1, `${sc.id}: rising at ${k} of the window: ${s}`);
        last = s;
      }
      await o.mm.seek(sc.start + win);
      assert.equal(await scaleOf(o.page, i), 1, `${sc.id}: full size at the end of the first beat`);
      await o.mm.seek(sc.start + win + 1.1);
      assert.equal(await scaleOf(o.page, i), 1, `${sc.id}: and it stays`);
    }
  } finally { await o.close(); }
});

test('the ground is pure in t: the same instant draws the same pixels after any seek order', async () => {
  for (const g of [undefined, PAPER, { kind: 'dots' }]) {
    const o = await open(g ? ground(g) : {});
    try {
      const fresh = await framePng(o.page, 2.4);
      await framePng(o.page, 11);
      await framePng(o.page, 0.2);
      const again = await framePng(o.page, 2.4);
      assert.ok(fresh.equals(again), `${g?.kind ?? 'bloom'}: 2.4 s drawn twice`);
      await o.mm.seek(2.4);
      const html = await o.page.evaluate(() => [...document.querySelectorAll('.mm-ground')].map((e) => e.outerHTML).join('\n'));
      await o.mm.seek(9.5);
      await o.mm.seek(2.4);
      assert.equal(await o.page.evaluate(() => [...document.querySelectorAll('.mm-ground')].map((e) => e.outerHTML).join('\n')), html);
    } finally { await o.close(); }
  }
});

test('graph-paper loops: the frame at t equals the frame at t + cycle, and drifts in between', async () => {
  const o = await open(ground(PAPER));
  try {
    await groundOnly(o.page);
    const at = async (t) => framePng(o.page, t);
    for (const t of [1.3, 2.9, 3.7]) assert.ok((await at(t)).equals(await at(t + 8)), `${t} s and ${t + 8} s`);
    assert.ok(!(await at(1.3)).equals(await at(4.3)), 'it moves within a cycle');
    assert.ok(!(await at(1.3)).equals(await at(1.3 + 4)), 'half a cycle on is not the same frame');
    // the grid is back at the origin at the cycle's ends, and the scan band is off the frame there
    await o.mm.seek(8);
    const pos = await o.page.evaluate(() => getComputedStyle(document.querySelector('.mm-scene:last-child .mm-ground__grid')).backgroundPosition);
    assert.match(pos, /^0px 0px, 0px 0px, 0px 0px, 0px 0px$/);
  } finally { await o.close(); }
});

test('the scan band sweeps down the frame once per cycle, from above it to below it', async () => {
  const o = await open(ground(PAPER));
  try {
    const top = (t) => o.mm.seek(t).then(() => o.page.evaluate(() => { const s = document.querySelector('.mm-scene .mm-ground__scan').getBoundingClientRect(); return { top: s.top, h: s.height, H: innerHeight }; }));
    const a = await top(0.0), b = await top(2), c = await top(4), d = await top(6), e = await top(7.99);
    assert.ok(a.top + a.h <= 0.5, 'above the frame at the start');
    assert.ok(Math.abs(a.h - 0.2 * a.H) <= 1, 'its height is a share of the frame\'s');
    assert.ok(b.top < c.top && c.top < d.top, 'moving down');
    assert.ok(c.top > 0 && c.top < c.H, 'inside the frame halfway');
    assert.ok(e.top >= e.H * 0.97, 'below the frame at the end');
  } finally { await o.close(); }
});

test('dots alone: a still grid of dots at a share of the frame width, in a role, drawn once', async () => {
  const o = await open(ground({ kind: 'dots', dots: { role: 'muted', spacing: 0.03, size: 0.14, strength: 0.5 } }));
  try {
    await o.mm.seek(1);
    const r = await o.page.evaluate(() => { const g = document.querySelector('.mm-ground'), d = g.querySelector('.mm-ground__dots'); return { kind: g.dataset.kind, kids: [...g.children].map((c) => c.className), size: getComputedStyle(d).backgroundSize, css: d.getAttribute('style') }; });
    assert.equal(r.kind, 'dots');
    assert.deepEqual(r.kids, ['mm-ground__dots']);
    assert.equal(r.size, `${Math.round(0.03 * 1920)}px ${Math.round(0.03 * 1920)}px`);
    assert.match(r.css, /var\(--mm-color-muted\)/);
    await groundOnly(o.page);
    assert.ok((await framePng(o.page, 1)).equals(await framePng(o.page, 2.5)), 'a dot grid does not move');
  } finally { await o.close(); }
});

test('the fine and the heavy grid are drawn in the role, heavy every Nth line', async () => {
  const o = await open(ground({ kind: 'graph-paper', grid: { role: 'muted', spacing: 0.02, every: 4, drift: 0 } }));
  try {
    await o.mm.seek(1);
    const r = await o.page.evaluate(() => { const g = document.querySelector('.mm-ground__grid'); return { size: getComputedStyle(g).backgroundSize, css: g.getAttribute('style'), kids: [...g.parentElement.children].map((c) => c.className) }; });
    const sp = Math.round(0.02 * 1920);
    assert.equal(r.size, `${sp * 4}px ${sp * 4}px, ${sp * 4}px ${sp * 4}px, ${sp}px ${sp}px, ${sp}px ${sp}px`, 'two layers of the heavy cell, two of the fine');
    assert.match(r.css, /var\(--mm-color-muted\)/);
    assert.deepEqual(r.kids, ['mm-ground__grid'], 'no scan band unless the brand asks for one');
  } finally { await o.close(); }
});

test('a deck draws a still ground: the bloom full size, the grid at its origin, the scan band off the frame', async () => {
  for (const [g, check] of [
    [undefined, async (o) => assert.equal(await o.page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('.mm-ground__bloom')).transform).a), 1)],
    [PAPER, async (o) => assert.equal(await o.page.evaluate(() => getComputedStyle(document.querySelector('.mm-ground__grid')).backgroundPosition), '0px 0px, 0px 0px, 0px 0px, 0px 0px')],
  ]) {
    const o = await open(g ? ground(g) : {}, '16x9', 'deck');
    try {
      for (const n of [0, 1, 2, 3]) { await o.mm.seek(n); await check(o); }
      if (g) {
        await o.mm.seek(2);
        assert.ok(await o.page.evaluate(() => { const s = document.querySelector('.mm-ground__scan').getBoundingClientRect(); return s.bottom <= 1; }), 'the band waits above the frame');
      }
    } finally { await o.close(); }
  }
});

test('a style animating on threes steps the grid\'s drift on its 10 fps grid', async () => {
  const o = await open({ ...ground({ kind: 'graph-paper', grid: { drift: 0.02, cycle: 8 } }), frameHold: '3' });
  try {
    const pos = async (t) => { await o.mm.seek(t); return o.page.evaluate(() => getComputedStyle(document.querySelector('.mm-ground__grid')).backgroundPosition); };
    assert.equal(await pos(1.01), await pos(1.09), 'the same step');
    assert.notEqual(await pos(1.09), await pos(1.11), 'the next step');
  } finally { await o.close(); }
});
