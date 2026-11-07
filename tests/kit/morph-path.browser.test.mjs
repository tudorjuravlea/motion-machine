// moves/morph in path mode, in the browser. A piece whose two slots name SVG assets (a ring, a block with a
// triangular counter): the overlay draws the first at rest, becomes the second, and rests on it; every frame
// is the same in either seek order. And a hand-made page with inline SVG in the slots, where the overlay
// starts exactly over the drawing the slot shows, so the hand-over is not seen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';

const OUT = join(ROOT, 'out', 'morph-path-test');
let server, browser, dir;
before(async () => {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  dir = join(OUT, 'piece');
  const style = join(OUT, 'paper.style.json');
  composeToFile({ brand: 'paper', motion: 'calm', out: style });
  newPiece({ kind: 'film', style, dir });
  writeFileSync(join(dir, 'story.json'), readFileSync(join(ROOT, 'fixtures/morph/path-story.json'), 'utf8'));
  cpSync(join(ROOT, 'fixtures/morph/assets'), join(dir, 'assets'), { recursive: true });
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);
const overlay = (o) => o.page.evaluate(() => {
  const p = document.querySelector('.mm-morph path');
  if (!p) return null;
  const b = p.getBBox(), c = document.querySelector('.mm-camera').getBoundingClientRect(), r = p.getBoundingClientRect();
  return { d: p.getAttribute('d'), x: r.left, y: r.top, w: r.width, h: r.height, bx: b.x, by: b.y, opacity: p.parentElement.style.opacity, cam: { x: c.left, y: c.top } };
});
const slotBox = (o, name) => o.page.evaluate((n) => { const r = document.querySelector(`[data-slot="${n}"]`).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, name);

for (const format of ['16x9', '9x16']) {
  test(`${format}: the first mark is drawn at rest inside its slot, the second after the morph inside its own`, async () => {
    const o = await openPiece(dir, { server, browser, format });
    try {
      const L = await slotBox(o, 'left'), R = await slotBox(o, 'right');
      await o.mm.seek(0.5);
      const a = await overlay(o);
      assert.ok(a, 'the overlay draws the first mark before the morph');
      assert.ok(a.x >= L.x - 1 && a.x + a.w <= L.x + L.w + 1 && a.y >= L.y - 1 && a.y + a.h <= L.y + L.h + 1, `the ring sits inside the left slot: ${JSON.stringify(a)} in ${JSON.stringify(L)}`);
      near(a.x + a.w / 2, L.x + L.w / 2, 1.5, 'and is centred in it');
      await o.mm.seek(4.5);
      const z = await overlay(o);
      assert.ok(z.x >= R.x - 1 && z.x + z.w <= R.x + R.w + 1 && z.y >= R.y - 1 && z.y + z.h <= R.y + R.h + 1, 'the block sits inside the right slot');
      near(z.x + z.w / 2, R.x + R.w / 2, 1.5);
      assert.notEqual(z.d, a.d);
      // mid-morph the shape is on its way: between the two slots
      await o.mm.seek(2.0);
      const m = await overlay(o);
      const lx = L.x + L.w / 2, ly = L.y + L.h / 2, vx = R.x + R.w / 2 - lx, vy = R.y + R.h / 2 - ly;
      const along = ((m.x + m.w / 2 - lx) * vx + (m.y + m.h / 2 - ly) * vy) / (vx * vx + vy * vy);
      assert.ok(along > 0.2 && along < 0.8, `half way between the marks (${along})`);
      assert.deepEqual(o.errors, []);
      assert.deepEqual((await o.mm.meta()).warnings, []);
    } finally { await o.close(); }
  });
}

test('a frame is the same in either seek order, and the morph rests on exactly the second mark', async () => {
  const o = await openPiece(dir, { server, browser, format: '16x9' });
  try {
    const ts = [0.5, 1.4, 1.9, 2.3, 2.7, 4.5];
    const fwd = {};
    for (const t of ts) { await o.mm.seek(t); fwd[t] = (await overlay(o))?.d; }
    for (const t of ts.slice().reverse()) { await o.mm.seek(t); assert.equal((await overlay(o))?.d, fwd[t], `t ${t}`); }
    // every morph frame between the ends is a finite path
    for (let t = 1.2; t <= 2.8; t += 0.1) { await o.mm.seek(t); const d = (await overlay(o)).d; assert.ok(!/NaN|Infinity/.test(d), `t ${t}`); }
    // at the end the path is the second mark itself (the plan's last sample), the same on a fresh seek past the end
    await o.mm.seek(2.9);
    const end = (await overlay(o)).d;
    await o.mm.seek(4.9);
    assert.equal((await overlay(o)).d, end);
  } finally { await o.close(); }
});

test('inline SVG in the slots: the overlay starts exactly over the drawing the slot shows', async () => {
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0} #cam{position:absolute;left:0;top:0;width:900px;height:500px}
    .s{position:absolute;box-sizing:border-box;width:200px;height:200px;top:100px} svg{display:block;width:100%;height:100%}</style>
    <div id="cam"><div class="s" data-slot="a" style="left:60px"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30"/></svg></div>
    <div class="s" data-slot="b" style="left:600px"><svg viewBox="0 0 100 100"><rect x="20" y="20" width="60" height="60"/></svg></div></div>
    <script type="module">import m from '/patterns/moves/morph/pattern.js';
      window.go = (u) => { const cam = document.getElementById('cam'); cam.querySelectorAll('.mm-morph').forEach((n) => n.remove());
        m.at(cam, 0, { u, params: { mode: 'path', from: 'a', to: 'b', start: 1, dur: 2, smoothing: 0.04 }, ease: (n, p) => p, afterSettle: (f) => f() }); };
      window.ready = true;</script>`;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'inline.html'), html);
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  try {
    await page.goto(`${server.url}/out/morph-path-test/inline.html`);
    await page.waitForFunction(() => window.ready === true);
    const probe = (u) => page.evaluate((u) => {
      window.go(u);
      const p = document.querySelector('.mm-morph path'), r = p?.getBoundingClientRect();
      return { shown: !!p, x: r?.left, y: r?.top, w: r?.width, h: r?.height, slotAOpacity: document.querySelector('[data-slot="a"]').style.opacity };
    }, u);
    const seen = await page.evaluate(() => { const r = document.querySelector('[data-slot="a"] circle').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const before = await probe(0.5);
    assert.equal(before.shown, false, 'before the morph the slot draws the shape alone');
    assert.equal(before.slotAOpacity, '1');
    const start = await probe(1.0 + 2 * 0.001);
    assert.equal(start.shown, true);
    near(start.x, seen.x, 1.5); near(start.y, seen.y, 1.5); near(start.w, seen.w, 2); near(start.h, seen.h, 2);
    const done = await probe(3.5);
    assert.equal(done.shown, false, 'after it the second slot draws the shape alone');
  } finally { await page.close(); }
});
