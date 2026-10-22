// transitions/re-ink into the scenes that draw their pictures on a canvas only once their pattern
// runs (a point cloud, a photo waking up, a depth parallax move): the cut reads what the incoming
// scene will hold from the story, not from the canvases present when it starts, so it is a plate
// wipe from its first frame to its last. No copy of the scene is ever drawn, both pulls show the
// plate, and once the outgoing scene is gone every pixel is the plate or the incoming scene exactly
// as it is drawn without the cut: no blink of a blank canvas, no flat slab where the picture is.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 're-ink-pictures-test');
const demo = (p) => JSON.parse(readFileSync(join(ROOT, 'patterns', p, 'demo/story.json'), 'utf8')).scenes[0];
const statement = (id, text) => ({ id, layout: 'layouts/statement', duration: 2.5, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
  beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text, params: { instant: true } }] });
const story = (id, incoming, formats) => ({
  id, kind: 'film', formats, title: 're-ink pictures', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null },
  scenes: [statement('before', 'The scene before'), incoming], cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
});
// the incoming scenes: each pattern's own demo scene, entered with re-ink (or, for the twin, a hard cut)
const CASES = [
  { name: 'point-cloud', pattern: '3d/point-cloud', scene: (cut) => ({ ...demo('3d/point-cloud'), id: 'in', duration: 4.5, cut, beats: demo('3d/point-cloud').beats.map((b) => ({ ...b, at: b.slot === 'stage' ? 0 : b.at })) }) },
  { name: 'point-cloud-late', pattern: '3d/point-cloud', scene: (cut) => ({ ...demo('3d/point-cloud'), id: 'in', duration: 4.5, cut }) },
  { name: 'photo-wake', pattern: 'entrances/photo-wake', scene: (cut) => ({ ...demo('entrances/photo-wake'), id: 'in', duration: 4, cut }) },
  { name: 'depth-parallax', pattern: 'moves/depth-parallax', scene: (cut) => ({ ...demo('moves/depth-parallax'), id: 'in', duration: 4, cut }) },
];
const FORMAT = '9x16';

let server, browser, style;
function piece(name, incoming, assets) {
  const dir = join(OUT, name);
  newPiece({ kind: 'film', style, dir });
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story(name, incoming, [FORMAT]), null, 2));
  cpSync(assets, join(dir, 'assets'), { recursive: true });
  return dir;
}
before(async () => {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  style = join(OUT, 'nocturne.style.json');
  composeToFile({ brand: 'nocturne', motion: 'kinetic', out: style });
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const pixel = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const ink = (page) => page.evaluate(() => {
  const d = document.createElement('div');
  d.style.background = 'var(--mm-color-ink)'; document.querySelector('.mm-stage').append(d);
  const c = getComputedStyle(d).backgroundColor; d.remove();
  return /rgba?\(([^)]+)\)/.exec(c)[1].split(',').slice(0, 3).map(Number);
});

for (const c of CASES) {
  test(`re-ink into ${c.name}: a plate wipe in both pulls, never a copy, never a frame without the picture`, async () => {
    const assets = join(ROOT, 'patterns', c.pattern, 'demo/assets');
    const o = await openPiece(piece(`${c.name}-reink`, c.scene('transitions/re-ink'), assets), { server, browser, format: FORMAT });
    const p = await openPiece(piece(`${c.name}-twin`, c.scene('transitions/hard-cut'), assets), { server, browser, format: FORMAT });
    try {
      const sc = (await o.mm.meta()).schedule.scenes[1];
      assert.equal((await p.mm.meta()).schedule.scenes[1].start, sc.start);
      const plateRgb = await ink(o.page);
      const bad = [], copies = [], plates = { first: 0, second: 0 };
      let shown = 0;
      for (let k = 0.05; k < 1; k += 0.05) {
        const t = sc.start + sc.cut.d * k;
        const img = decodePng(await framePng(o.page, t));
        const dom = await o.page.evaluate(() => ({
          copy: document.querySelectorAll('.mm-stage > .mm-scene[data-mm-overlay]').length,
          plate: document.querySelectorAll('.mm-tx-reink-plate').length,
        }));
        if (dom.copy) copies.push(k.toFixed(2));
        let inked = 0, off = 0, all = 0;
        const ref = k >= 0.5 ? decodePng(await framePng(p.page, t)) : null;
        for (let y = 0; y < img.height; y += 6) for (let x = 0; x < img.width; x += 6) {
          const a = pixel(img, x, y); all++;
          const isPlate = Math.hypot(...a.map((v, i) => v - plateRgb[i])) <= 6;
          if (isPlate) inked++;
          else if (ref && Math.hypot(...a.map((v, i) => v - pixel(ref, x, y)[i])) > 12) off++;
        }
        if (dom.plate && inked / all > 0.02) plates[k < 0.5 ? 'first' : 'second']++;
        if (ref && off / all > 0.01) bad.push(`l ${k.toFixed(2)}: ${(100 * off / all).toFixed(1)} % of the frame is neither the plate nor the scene as itself`);
        if (k > 0.85 && inked / all < 0.5) shown++;
      }
      assert.deepEqual(copies, [], 'no copy of a scene that will draw on a canvas is ever made');
      assert.ok(plates.first >= 3, `the first pull shows the plate (${plates.first} instants)`);
      assert.ok(plates.second >= 3, `the second pull shows the plate (${plates.second} instants)`);
      assert.deepEqual(bad, [], 'every pixel of the second pull is the plate or the incoming scene as itself');
      assert.ok(shown >= 1, 'the picture is uncovered by the end of the cut');
    } finally { await o.close(); await p.close(); }
  });
}
