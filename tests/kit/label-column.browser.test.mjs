// layouts/label-column: an object with up to six labels in a column, each joined to its point on
// the object by a leader. Labels sit in the column's flow, so six of them never overlap; each point
// is the label's x and y as shares of the picture; each leader runs from the point to the label's
// name. A label still moving in on its entrance shows no dot or leader until it lands.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { FLOORS } from '../../scripts/check/_lib.mjs';

const OUT = join(ROOT, 'out', 'label-column-test');
const DEMO_DIR = join(ROOT, 'patterns', 'layouts', 'label-column', 'demo');
const demo = JSON.parse(readFileSync(join(DEMO_DIR, 'story.json'), 'utf8'));
// a second scene: the same labels, the third one rising in (a moving entrance)
const lc = demo.scenes.find((s) => s.layout === 'layouts/label-column');
const moving = structuredClone(lc);
moving.id = 'moving';
for (const b of moving.beats) if (b.slot === 'label-3') b.fx = 'entrances/rise';
const story = { ...demo, scenes: [...demo.scenes, moving] };
// the same teardown with longer labels and specs, as the second scene
const LONG = [['Cover glass assembly', '0.6 mm rated'], ['Display assembly', '6.1 in rated'], ['Camera assembly', '12 MP rated'],
  ['Logic board assembly', '8 layers rated'], ['Battery assembly', '3200 mAh rated'], ['Frame assembly', 'Recycled rated']];
const long = structuredClone(lc);
long.id = 'long';
for (const b of long.beats) { const k = /^label-(\d)$/.exec(b.slot); if (k) { const [name, spec] = LONG[k[1] - 1]; b.text = name; b.params = { ...b.params, spec }; } }
const longStory = { ...demo, scenes: [demo.scenes[0], long] };
const longDirs = {};
let server, browser, dir;
before(async () => {
  for (const brand of ['paper', 'nocturne']) {
    const d = join(OUT, `long-${brand}`), style = join(OUT, `long-${brand}.style.json`);
    rmSync(d, { recursive: true, force: true });
    composeToFile({ brand, motion: 'kinetic', out: style });
    newPiece({ kind: 'film', style, dir: d });
    cpSync(join(DEMO_DIR, 'assets'), join(d, 'assets'), { recursive: true });
    writeFileSync(join(d, 'story.json'), JSON.stringify(longStory, null, 2));
    longDirs[brand] = d;
  }
  mkdirSync(OUT, { recursive: true });
  dir = join(OUT, 'paper');
  const style = join(OUT, 'paper.style.json');
  rmSync(dir, { recursive: true, force: true });
  composeToFile({ brand: 'paper', motion: 'calm', out: style });
  newPiece({ kind: 'film', style, dir });
  cpSync(join(DEMO_DIR, 'assets'), join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const read = (o, id) => o.page.evaluate((id) => {
  const sc = document.querySelector(`[data-scene="${id}"]`);
  const box = (el) => { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
  const pic = box(sc.querySelector('.label-column__picture'));
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mm-space-2'));
  const labels = [...sc.querySelectorAll('.label-column__label:not([data-empty])')].map((li) => {
    const name = li.querySelector('.label-column__name'), dot = li.querySelector('.label-column__dot');
    const d = box(dot), n = box(name);
    const leads = [...li.querySelectorAll('.label-column__lead')].map((l) => ({ kind: l.classList.contains('label-column__lead--down') ? 'down' : 'up', ...box(l) }));
    return { slot: li.dataset.slot, x: Number(li.dataset.pX), y: Number(li.dataset.pY), box: box(li), name: n, dot: { x: (d.x0 + d.x1) / 2, y: (d.y0 + d.y1) / 2 },
      dotVisible: getComputedStyle(dot).visibility === 'visible', leads, index: getComputedStyle(name, '::before').content, spec: getComputedStyle(li, '::after').content };
  });
  return { pic, gap, labels };
}, id);
const start = async (o, id) => (await o.mm.meta()).scenes.find((s) => s.id === id).start;
const near = (a, b, tol = 2.5) => Math.abs(a - b) <= tol;

test('six labels at rest: no two overlap, each point is its share of the picture, each leader joins point and name', async () => {
  for (const format of ['9x16', '1x1', '16x9']) {
    const o = await openPiece(dir, { server, browser, format });
    try {
      await o.mm.seek((await start(o, lc.id)) + 7.5);
      const s = await read(o, lc.id);
      assert.equal(s.labels.length, 6);
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
        const a = s.labels[i].box, b = s.labels[j].box;
        const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        assert.ok(!(w > 0.5 && h > 0.5), `${format}: ${s.labels[i].slot} and ${s.labels[j].slot} do not overlap`);
      }
      const W = s.pic.x1 - s.pic.x0, H = s.pic.y1 - s.pic.y0;
      assert.ok(W > 50 && H > 50, `${format}: the picture is shown`);
      for (const [k, l] of s.labels.entries()) {
        assert.equal(l.index, `"0${k + 1}"`, 'the index is the slot number');
        assert.match(l.spec, /^".+"$/, 'the spec line is shown');
        assert.ok(l.dotVisible);
        assert.ok(near(l.dot.x, s.pic.x0 + l.x * W) && near(l.dot.y, s.pic.y0 + l.y * H), `${format} ${l.slot}: the dot is at its share of the picture: ${JSON.stringify(l.dot)}`);
        const nameY = (l.name.y0 + l.name.y1) / 2;
        const shown = l.leads.filter((b) => b.y1 - b.y0 > 0.5);
        assert.equal(shown.length, 1, `${format} ${l.slot}: one leader is drawn`);
        const b = shown[0];
        assert.ok(near(b.x0, l.dot.x) && near(b.x1, l.name.x0 - s.gap), `${format} ${l.slot}: the leader runs from the point to the name`);
        const [top, bottom] = b.kind === 'down' ? [l.dot.y, nameY] : [nameY, l.dot.y];
        assert.equal(b.kind, nameY >= l.dot.y ? 'down' : 'up', `${format} ${l.slot}: the leader goes the right way`);
        assert.ok(near(b.y0, top, 3) && near(b.y1, bottom, 3), `${format} ${l.slot}: its ends sit on the point and the name: ${JSON.stringify({ b, top, bottom })}`);
      }
    } finally { await o.close(); }
  }
});

test('a label still moving in shows no dot or leader; they appear when it lands', async () => {
  const o = await openPiece(dir, { server, browser, format: '9x16' });
  try {
    const it = (await o.mm.meta()).schedule.items.find((x) => x.selector === '[data-scene="moving"] [data-slot="label-3"]');
    await o.mm.seek(it.start + it.d * 0.4);
    let s = await read(o, 'moving');
    assert.equal(s.labels[2].dotVisible, false, 'hidden mid-entrance');
    await o.mm.seek(it.start + it.d + 0.05);
    s = await read(o, 'moving');
    assert.equal(s.labels[2].dotVisible, true, 'shown once landed');
  } finally { await o.close(); }
});

test('longer labels stay in the frame: they wrap and shrink toward the body floor, never below it, in every format', async () => {
  for (const brand of ['paper', 'nocturne']) {
    for (const format of ['1x1', '4x5', '9x16', '16x9']) {
      const o = await openPiece(longDirs[brand], { server, browser, format });
      try {
        await o.mm.seek((await start(o, 'long')) + 7.5);
        const g = await o.page.evaluate(() => {
          const sc = document.querySelector('[data-scene="long"]');
          const root = getComputedStyle(document.documentElement);
          const m = parseFloat(root.getPropertyValue('--mm-safe'));
          return { m, w: innerWidth, h: innerHeight, labels: [...sc.querySelectorAll('.label-column__label:not([data-empty])')].map((li) => {
            const r = li.getBoundingClientRect();
            return { slot: li.dataset.slot, x0: r.left, x1: r.right, y0: r.top, y1: r.bottom, font: parseFloat(getComputedStyle(li).fontSize), spec: parseFloat(getComputedStyle(li, '::after').fontSize) };
          }) };
        });
        assert.equal(g.labels.length, 6);
        for (const l of g.labels) {
          assert.ok(l.y1 <= g.h - g.m + 1 && l.y0 >= g.m - 1 && l.x1 <= g.w - g.m + 1, `${brand} ${format}: ${l.slot} is inside the safe area: ${JSON.stringify(l)} (safe ${g.m})`);
          assert.ok(l.font >= FLOORS.film[format].body - 0.01 && l.spec >= FLOORS.film[format].body - 0.01, `${brand} ${format}: ${l.slot} stays at or above the body floor: ${l.font}`);
        }
        for (let i = 1; i < 6; i++) assert.ok(g.labels[i].y0 >= g.labels[i - 1].y1 - 0.5, `${brand} ${format}: ${g.labels[i].slot} sits under ${g.labels[i - 1].slot}`);
      } finally { await o.close(); }
    }
  }
});
