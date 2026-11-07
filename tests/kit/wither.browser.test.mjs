// exits/wither: a text/garden recedes in reverse growth order (last grown first: blossoms close
// before their stems undraw, tip to root) to the bare type. With `type: keep` the last frame of the
// exit is exactly the bare slot; with the default `type: fade` the bare slot shows once the garden
// has gone, and then the type fades. A slot without a garden only fades.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'wither-test');
const scene = (id, fx, params) => ({
  id, layout: 'layouts/statement', duration: 5, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
  beats: [{ at: 0.2, slot: 'headline', fx, text: 'Grow slowly', params: { dur: 2.4, ...params }, out: 3.2, exit: 'exits/wither' }],
});
const story = {
  id: 'wither-test', kind: 'film', formats: ['9x16', '16x9'], title: 'wither test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null },
  scenes: [
    { id: 'intro', layout: 'layouts/statement', duration: 2, cut: 'transitions/hard-cut', move: null, say: 'A test scene.', beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'Hook' }] },
    scene('fade', 'text/garden', { kind: 'vines', seed: 3 }),
    scene('keep', 'text/garden', { kind: 'flowers', seed: 3, exit: { type: 'keep' } }),
    scene('plain', 'entrances/fade', {}),
  ],
  cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
};
let server, browser, dir;
before(async () => {
  mkdirSync(OUT, { recursive: true });
  dir = join(OUT, 'paper');
  const style = join(OUT, 'paper.style.json');
  rmSync(dir, { recursive: true, force: true });
  composeToFile({ brand: 'paper', motion: 'calm', out: style });
  newPiece({ kind: 'film', style, dir });
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const sel = (id) => `[data-scene="${id}"] [data-slot="headline"]`;
const itemOf = async (o, id) => (await o.mm.meta()).schedule.items.find((it) => it.scene === id && !it.parent && it.beat?.slot === 'headline');
// the slot's picture (stage px box around it) after an optional tweak
async function picture(o, t, id, hide = false) {
  await o.mm.seek(t);
  if (hide) await o.page.evaluate((s) => { for (const g of document.querySelectorAll(`${s} svg.mm-garden`)) g.style.visibility = 'hidden'; }, sel(id));
  const clip = await o.page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.max(0, r.left - 300), y: Math.max(0, r.top - 500), width: r.width + 600, height: r.height + 800 }; }, sel(id));
  return Buffer.from(decodePng(await o.page.screenshot({ type: 'png', clip, animations: 'disabled' })).data);
}
const state = (o, id) => o.page.evaluate((s) => {
  const el = document.querySelector(s), c = {};
  for (const e of el.querySelectorAll('svg.mm-garden *')) for (const n of e.classList) c[n] = (c[n] ?? 0) + 1;
  return { parts: el.querySelectorAll('svg.mm-garden *').length, petals: c['mm-garden__petal'] ?? 0, stems: c['mm-garden__stem'] ?? 0, opacity: Number(getComputedStyle(el).opacity), visible: getComputedStyle(el).visibility !== 'hidden' };
}, sel(id));

for (const format of ['9x16', '16x9']) {
  test(`${format}: with type keep, the last frame of the exit is exactly the bare slot`, async () => {
    const o = await openPiece(dir, { server, browser, format });
    try {
      const it = await itemOf(o, 'keep');
      assert.ok(it.exit && it.exit.d > 0, 'the beat has an exit');
      const rest = it.start + it.d + 0.2;
      const bare = await picture(o, rest, 'keep', true);
      const grown = await picture(o, rest, 'keep');
      assert.ok(Buffer.compare(bare, grown) !== 0, 'the garden is there at rest');
      const last = it.exit.start + it.exit.d - 1 / 30;
      await o.mm.seek(last);
      const s = await state(o, 'keep');
      assert.ok(s.visible && s.opacity === 1, `the type is still whole: ${JSON.stringify(s)}`);
      assert.ok(Buffer.compare(await picture(o, last, 'keep'), bare) === 0, 'the last frame equals the bare slot');
    } finally { await o.close(); }
  });
}

test('with type fade, the bare slot shows once the garden has gone, then the type fades', async () => {
  const o = await openPiece(dir, { server, browser, format: '9x16' });
  try {
    const it = await itemOf(o, 'fade');
    const bare = await picture(o, it.start + it.d + 0.2, 'fade', true);
    let found = null;
    for (let k = 0; k <= 60; k++) {
      const t = it.exit.start + (k / 60) * it.exit.d;
      await o.mm.seek(t);
      const s = await state(o, 'fade');
      if (s.parts === 0 && s.opacity === 1) { found = t; break; }
    }
    assert.ok(found != null, 'an instant with no garden and the type whole');
    assert.ok(Buffer.compare(await picture(o, found, 'fade'), bare) === 0, 'that instant equals the bare slot');
    await o.mm.seek(it.exit.start + it.exit.d - 1 / 30);
    const end = await state(o, 'fade');
    assert.ok(end.parts === 0 && end.opacity < 0.5, `the type fades at the end: ${JSON.stringify(end)}`);
  } finally { await o.close(); }
});

test('the garden recedes in reverse growth order: blossoms close before the stems undraw, nothing comes back', async () => {
  const o = await openPiece(dir, { server, browser, format: '9x16' });
  try {
    const it = await itemOf(o, 'keep');
    const seq = [];
    for (let k = 0; k <= 30; k++) { await o.mm.seek(it.exit.start + (k / 30) * (it.exit.d - 1 / 30)); seq.push(await state(o, 'keep')); }
    assert.ok(seq[0].petals > 0 && seq[0].stems > 0, `the full garden at the exit's start: ${JSON.stringify(seq[0])}`);
    const lastPetal = seq.findLastIndex((s) => s.petals > 0), lastStem = seq.findLastIndex((s) => s.stems > 0);
    assert.ok(lastPetal < lastStem, `petals gone at step ${lastPetal + 1}, stems at ${lastStem + 1}`);
    for (let k = 1; k < seq.length; k++) assert.ok(seq[k].parts <= seq[k - 1].parts, `parts never return (step ${k}: ${seq[k - 1].parts} -> ${seq[k].parts})`);
  } finally { await o.close(); }
});

test('a slot without a garden only fades', async () => {
  const o = await openPiece(dir, { server, browser, format: '9x16' });
  try {
    const it = await itemOf(o, 'plain');
    await o.mm.seek(it.exit.start + 0.5 * it.exit.d);
    const mid = await state(o, 'plain');
    assert.equal(mid.parts, 0);
    await o.mm.seek(it.exit.start + it.exit.d - 1 / 30);
    const end = await state(o, 'plain');
    assert.ok(end.opacity < 0.5, `faded: ${end.opacity}`);
  } finally { await o.close(); }
});
