// transitions/shared-element in the browser, on a hand-made pair of scenes: a card holding a logo and a
// line of type travels from one box to another. With a non-uniform scale the logo keeps its proportions,
// the corner radius looks the same size on the page all the way, the shadow keeps its offsets, the two
// scenes cross-fade without a dip, a pair whose shape differs is cropped or moved without scaling, an
// arc bows the travel, and a frame is the same in either seek order.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, launchBrowser } from '../../scripts/lib/browser.mjs';

const OUT = join(ROOT, 'out', 'shared-element-test');
const PAGE = `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; }
  section { position: absolute; left: 0; top: 0; width: 1200px; height: 800px; }
  .card { position: absolute; box-sizing: border-box; background: #ddd; display: flex; align-items: center; justify-content: center; gap: 10px; }
  .card svg { width: 100px; height: 50px; flex: none; }
  .card p { margin: 0; font: 20px sans-serif; }
  #a { border-radius: 8px; box-shadow: 12px 10px 20px 0 rgba(0,0,0,.3); }
  #b { border-radius: 40px; box-shadow: 12px 10px 20px 0 rgba(0,0,0,.3); }
</style>
<section id="out">
  <div id="a" class="card" data-slot data-shared="k" style="left:50px;top:50px;width:300px;height:200px">
    <svg viewBox="0 0 100 50"><rect width="100" height="50" fill="#444"/></svg><p>Card</p>
  </div>
  <div class="plain" style="position:absolute;left:600px;top:600px">outgoing only</div>
</section>
<section id="in">
  <div id="b" class="card" data-slot data-shared="k" style="left:400px;top:300px;width:600px;height:200px">
    <svg viewBox="0 0 100 50"><rect width="100" height="50" fill="#444"/></svg><p>Card</p>
  </div>
</section>
<script type="module">
  import pattern from '/patterns/transitions/shared-element/pattern.js';
  window.go = (p, params) => pattern.at(document.getElementById('in'), p, { from: document.getElementById('out'), to: document.getElementById('in'), params });
  window.ready = true;
</script>`;

let server, browser, page;
before(async () => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'page.html'), PAGE);
  server = await serveRoot(ROOT); browser = await launchBrowser();
  page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${server.url}/out/shared-element-test/page.html`);
  await page.waitForFunction(() => window.ready === true);
  assert.deepEqual(errors, []);
});
after(async () => { await page?.close(); await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const at = (p, params = {}) => page.evaluate(({ p, params }) => {
  window.go(p, params);
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const matrix = (el) => { const t = getComputedStyle(el).transform; const m = t === 'none' ? [1, 0, 0, 1, 0, 0] : t.match(/matrix\(([^)]*)\)/)[1].split(',').map(Number); return { a: m[0], d: m[3] }; };
  const side = (id) => {
    const el = document.getElementById(id), cs = getComputedStyle(el), mx = matrix(el);
    const r = cs.borderTopLeftRadius.split(' ').map(parseFloat);
    return {
      box: rect(el), logo: rect(el.querySelector('svg')), mx, shadow: cs.boxShadow, clip: cs.clipPath, style: el.getAttribute('style'),
      radiusX: r[0] * mx.a, radiusY: (r[1] ?? r[0]) * mx.d,
      kid: el.querySelector('svg').getAttribute('style'), kidAttr: el.querySelector('svg').hasAttribute('data-mm-counter'),
    };
  };
  return { a: side('a'), b: side('b'), outOpacity: document.getElementById('out').style.opacity, inOpacity: document.getElementById('in').style.opacity,
    outStyle: document.getElementById('out').getAttribute('style'), inStyle: document.getElementById('in').getAttribute('style') };
}, { p, params });

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);

test('stretch: the logo keeps its proportions to within 1 % all the way, on both copies', async () => {
  for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const s = await at(p, { fit: 'stretch' });
    for (const side of [s.a, s.b]) near(side.logo.w / side.logo.h, 2, 0.02, `logo aspect at ${p}`);
    near(s.a.box.w, s.b.box.w, 0.5, `both copies cover the same width at ${p}`);
    near(s.a.box.h, s.b.box.h, 0.5, `and the same height at ${p}`);
    near(s.a.box.x, s.b.box.x, 0.5, `and the same place at ${p}`);
  }
  const mid = await at(0.5, { fit: 'stretch' });
  near(mid.a.box.w, 450, 0.5);
  assert.ok(mid.a.kidAttr && mid.b.kidAttr, 'the children are marked while they are scaled back');
});

test('width: a uniform scale needs no counter, the logo is just scaled with the card', async () => {
  const s = await at(0.5, { fit: 'width' });
  assert.equal(s.a.kidAttr, false);
  near(s.a.logo.w / s.a.logo.h, 2, 0.02);
});

test('the corner radius looks the same size on the page: the one box\'s to the other\'s, mixed', async () => {
  for (const fit of ['width', 'stretch']) for (const p of [0.25, 0.5, 0.75]) {
    const s = await at(p, { fit });
    const want = 8 + (40 - 8) * p;
    for (const side of [s.a, s.b]) { near(side.radiusX, want, 0.6, `${fit} radius x at ${p}`); near(side.radiusY, want, 0.6, `${fit} radius y at ${p}`); }
  }
});

test('the shadow keeps its offsets on the page while the card scales', async () => {
  const s = await at(0.5, { fit: 'stretch' });
  // the card is scaled 1.5 across and 1 down: written offsets are divided by those, so on the page they stay 12 and 10
  const [, ox, oy, blur] = s.a.shadow.match(/\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/);
  near(Number(ox) * s.a.mx.a, 12, 0.05); near(Number(oy) * s.a.mx.d, 10, 0.05);
  near(Number(blur) * ((s.a.mx.a + s.a.mx.d) / 2), 20, 0.05);
});

test('the scenes cross-fade: the incoming is whole by the middle, the outgoing goes after, never a dip', async () => {
  const s0 = await at(0);
  assert.equal(Number(s0.inOpacity), 0); assert.equal(Number(s0.outOpacity), 1);
  const q = await at(0.25);
  near(Number(q.inOpacity), Math.sqrt(1 - 0.25), 0.002, 'circular ease-out over the first half');
  assert.equal(Number(q.outOpacity), 1);
  const h = await at(0.725);
  assert.equal(Number(h.inOpacity), 1); near(Number(h.outOpacity), 0.5, 0.002);
});

test('rest: at p = 1 every write is gone, on the cards, their children and both scenes', async () => {
  await at(0.4, { fit: 'stretch' });
  const r = await at(1, { fit: 'stretch' });
  assert.equal(r.a.style, 'left: 50px; top: 50px; width: 300px; height: 200px;');
  assert.equal(r.a.kid, null); assert.equal(r.a.kidAttr, false); assert.equal(r.b.kidAttr, false);
  assert.equal(r.outStyle, null); assert.equal(r.inStyle, null);
});

test('pure in p: a frame is the same whichever order the instants are asked in', async () => {
  const strip = (s) => JSON.stringify([s.a.style, s.b.style, s.a.kid, s.b.kid, s.outOpacity, s.inOpacity]);
  const fwd = {};
  for (const p of [0.2, 0.5, 0.8]) fwd[p] = strip(await at(p, { fit: 'stretch', arc: 0.5 }));
  for (const p of [0.8, 0.2, 0.5, 1, 0.2]) {
    const again = strip(await at(p, { fit: 'stretch', arc: 0.5 }));
    if (fwd[p]) assert.equal(again, fwd[p], `p ${p}`);
  }
});

test('box fit with proportions that differ: crop shows a window over evenly scaled content, with the radius on the window', async () => {
  // the first card is 300 x 200, so make the second tall by way of a stylesheet override on the fly
  await page.evaluate(() => { const b = document.getElementById('b'); b.dataset.keep = b.getAttribute('style'); b.style.width = '200px'; b.style.height = '300px'; });
  try {
    const s = await at(0.5, { fit: 'box', mismatch: 'crop' });
    assert.notEqual(s.a.clip, 'none'); assert.notEqual(s.b.clip, 'none');
    near(s.a.mx.a, s.a.mx.d, 1e-6, 'one scale for both axes: nothing stretches');
    near(s.b.mx.a, s.b.mx.d, 1e-6);
    const pos = await at(0.5, { fit: 'box', mismatch: 'position' });
    near(pos.a.mx.a, 1, 1e-9); near(pos.a.mx.d, 1, 1e-9); near(pos.b.mx.a, 1, 1e-9);
    assert.equal(pos.a.clip, 'none');
  } finally {
    await page.evaluate(() => { const b = document.getElementById('b'); b.setAttribute('style', b.dataset.keep); });
  }
});

test('an arc bows the travel by half of 0.5 of the distance, up the page for travel across', async () => {
  const straight = await at(0.5, { fit: 'width' });
  const bowed = await at(0.5, { fit: 'width', arc: 0.5 });
  const dx = bowed.a.box.x + bowed.a.box.w / 2 - (straight.a.box.x + straight.a.box.w / 2);
  const dy = bowed.a.box.y + bowed.a.box.h / 2 - (straight.a.box.y + straight.a.box.h / 2);
  const dist = Math.hypot(500, 250);
  near(Math.hypot(dx, dy), 0.25 * dist, 0.6, 'the apex is a quarter of the distance away from the straight line');
  assert.ok(dy < 0, 'the bow is up the page');
  near(dx * 500 + dy * 250, 0, 1, 'and square to the line of travel');
});
