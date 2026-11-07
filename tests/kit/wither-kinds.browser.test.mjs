// exits/wither on every organic kind of text/garden: the garden recedes (fewer parts mid-exit than
// at rest, none come back) and, with `type: keep`, the last frame of the exit is exactly the bare
// slot, whatever grew: leaves, fronds, twigs, roots, coral, kelp, moss, grass or a mix.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'wither-kinds-test');
const KINDS = ['leaves', 'ferns', 'branches', 'roots', 'coral', 'seaweed', 'moss', 'grass', 'mix'];
const scene = (kind) => ({
  id: kind, layout: 'layouts/statement', duration: 5, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
  beats: [{ at: 0.2, slot: 'headline', fx: 'text/garden', text: 'Grow slowly', params: { dur: 2.4, kind, seed: 2, exit: { type: 'keep' } }, out: 3.2, exit: 'exits/wither' }],
});
const story = {
  id: 'wither-kinds-test', kind: 'film', formats: ['16x9'], title: 'wither kinds test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null },
  scenes: [
    { id: 'intro', layout: 'layouts/statement', duration: 2, cut: 'transitions/hard-cut', move: null, say: 'A test scene.', beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'Hook' }] },
    ...KINDS.map(scene),
  ],
  cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
};
let server, browser, dir;
before(async () => {
  mkdirSync(OUT, { recursive: true });
  dir = join(OUT, 'nocturne');
  const style = join(OUT, 'nocturne.style.json');
  rmSync(dir, { recursive: true, force: true });
  composeToFile({ brand: 'nocturne', motion: 'calm', out: style });
  newPiece({ kind: 'film', style, dir });
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const sel = (id) => `[data-scene="${id}"] [data-slot="headline"]`;
const itemOf = async (o, id) => (await o.mm.meta()).schedule.items.find((it) => it.scene === id && !it.parent && it.beat?.slot === 'headline');
async function picture(o, t, id, hide = false) {
  await o.mm.seek(t);
  if (hide) await o.page.evaluate((s) => { for (const g of document.querySelectorAll(`${s} svg.mm-garden`)) g.style.visibility = 'hidden'; }, sel(id));
  const clip = await o.page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.max(0, r.left - 300), y: Math.max(0, r.top - 400), width: r.width + 600, height: r.height + 700 }; }, sel(id));
  return Buffer.from(decodePng(await o.page.screenshot({ type: 'png', clip, animations: 'disabled' })).data);
}
const parts = (o, id) => o.page.evaluate((s) => document.querySelectorAll(`${s} svg.mm-garden *`).length, sel(id));

test('every organic kind withers to the bare slot, receding without anything coming back', async () => {
  const o = await openPiece(dir, { server, browser, format: '16x9' });
  try {
    for (const k of KINDS) {
      const it = await itemOf(o, k);
      assert.ok(it.exit && it.exit.d > 0, `${k}: the beat has an exit`);
      const rest = it.start + it.d + 0.2;
      const bare = await picture(o, rest, k, true);
      await o.mm.seek(rest);
      const full = await parts(o, k);
      assert.ok(full > 5, `${k}: the garden is there at rest (${full} parts)`);
      const seen = [];
      for (const f of [0.2, 0.45, 0.7, 0.9]) { await o.mm.seek(it.exit.start + f * it.exit.d); seen.push(await parts(o, k)); }
      assert.ok(seen[0] <= full && seen[2] < full && seen[3] < seen[0], `${k}: recedes ${full} → ${seen.join(', ')}`);
      for (let i = 1; i < seen.length; i++) assert.ok(seen[i] <= seen[i - 1], `${k}: nothing comes back (${seen.join(', ')})`);
      const last = it.exit.start + it.exit.d - 1 / 30;
      assert.ok(Buffer.compare(await picture(o, last, k), bare) === 0, `${k}: the last frame of the exit equals the bare slot`);
    }
  } finally { await o.close(); }
});
