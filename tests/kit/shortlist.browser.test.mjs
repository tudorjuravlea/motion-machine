// layouts/shortlist: up to six candidates, one marked `pick`. When the result card arrives the
// field collapses to the pick: every other candidate dims, blurs and steps back, the pick takes an
// accent ring, and the result card sits under it. At rest the pick is the only candidate at full
// opacity, in every format.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';

const OUT = join(ROOT, 'out', 'shortlist-test');
const NAMES = ['Northwind', 'Harbor', 'Juniper', 'Quarry', 'Lantern', 'Meridian'];
const scene = (id, pick, result = true) => ({
  id, layout: 'layouts/shortlist', duration: 5, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
  beats: [
    { at: 0.2, slot: 'headline', fx: 'entrances/fade', text: 'Six offices, one choice' },
    ...NAMES.map((text, i) => ({ at: 0.5 + i * 0.15, slot: `item-${i + 1}`, fx: 'entrances/rise', text, ...([pick].flat().includes(i + 1) ? { params: { pick: true } } : {}) })),
    ...(result ? [{ at: 2.6, slot: 'result', fx: 'entrances/drop', text: 'Closest to the team' }] : []),
  ],
});
const story = {
  id: 'shortlist-test', kind: 'film', formats: ['9x16', '1x1', '16x9'], title: 'shortlist test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null },
  scenes: [scene('mid', 3), scene('last', 6), scene('none', 2, false), scene('nopick', 0), scene('twopick', [2, 5])],
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

// effective opacity of each candidate's text (its own and every ancestor's), the pick's ring, the result's box
const read = (o, id) => o.page.evaluate((id) => {
  const sc = document.querySelector(`[data-scene="${id}"]`);
  const eff = (el) => { let a = 1; for (let n = el; n && n !== document.body; n = n.parentElement) a *= Number(getComputedStyle(n).opacity); return a; };
  const textOf = (slot) => { const w = document.createTreeWalker(slot, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.textContent.trim()) return n.parentElement; return slot; };
  const box = (el) => { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
  const items = [...sc.querySelectorAll('[data-slot^="item-"]:not([data-empty])')].map((s) => {
    const t = textOf(s), cs = getComputedStyle(t);
    return { slot: s.dataset.slot, pick: s.dataset.pPick === 'true', opacity: eff(t), filter: cs.filter, outline: cs.outlineStyle, outlineColor: cs.outlineColor, box: box(t) };
  });
  const res = sc.querySelector('[data-slot="result"]');
  const root = getComputedStyle(document.documentElement);
  const rgb = (v) => { const d = document.createElement('i'); d.style.color = v; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  return { items, result: res && !res.hasAttribute('data-empty') ? { box: box(textOf(res).closest('[data-slot]')), visible: getComputedStyle(res).visibility } : null,
    accent: rgb(root.getPropertyValue('--mm-color-accent').trim()), safe: parseFloat(root.getPropertyValue('--mm-safe')), w: innerWidth, h: innerHeight };
}, id);
const sceneStart = async (o, id) => (await o.mm.meta()).scenes.find((s) => s.id === id).start;

test('at rest the pick is the only candidate at full opacity; the others are at most 0.4 and blurred', async () => {
  for (const format of ['9x16', '1x1', '16x9']) {
    const o = await openPiece(dir, { server, browser, format });
    try {
      for (const id of ['mid', 'last']) {
        await o.mm.seek((await sceneStart(o, id)) + 4.5);
        const s = await read(o, id);
        assert.equal(s.items.length, 6);
        const full = s.items.filter((i) => i.opacity > 0.999);
        assert.deepEqual(full.map((i) => i.slot), [s.items.find((i) => i.pick).slot], `${format} ${id}: only the pick is at full opacity`);
        for (const i of s.items.filter((x) => !x.pick)) {
          assert.ok(i.opacity <= 0.4 + 1e-6, `${format} ${id} ${i.slot}: dimmed to ${i.opacity}`);
          assert.match(i.filter, /blur/, `${format} ${id} ${i.slot}: blurred`);
        }
        const pick = s.items.find((i) => i.pick);
        assert.notEqual(pick.outline, 'none', 'the pick has a ring');
        assert.equal(pick.outlineColor, s.accent, 'the ring is the accent');
      }
    } finally { await o.close(); }
  }
});

test('before the result arrives nothing collapses; without a result the field never collapses', async () => {
  const o = await openPiece(dir, { server, browser, format: '9x16' });
  try {
    await o.mm.seek((await sceneStart(o, 'mid')) + 2.5);
    let s = await read(o, 'mid');
    for (const i of s.items) assert.ok(i.opacity > 0.999 && !/blur/.test(i.filter), `${i.slot} still whole before the result`);
    await o.mm.seek((await sceneStart(o, 'none')) + 4.5);
    s = await read(o, 'none');
    for (const i of s.items) assert.ok(i.opacity > 0.999, `${i.slot}: no result, no collapse`);
  } finally { await o.close(); }
});

test('the result card sits under the pick, or over it when the pick is on the last row, inside the safe area', async () => {
  for (const format of ['9x16', '1x1', '16x9']) {
    const o = await openPiece(dir, { server, browser, format });
    try {
      for (const id of ['mid', 'last']) {
        await o.mm.seek((await sceneStart(o, id)) + 4.5);
        const s = await read(o, id);
        const pick = s.items.find((i) => i.pick).box, r = s.result.box;
        assert.equal(s.result.visible, 'visible');
        const overlapX = Math.min(pick.x1, r.x1) - Math.max(pick.x0, r.x0);
        assert.ok(overlapX > (pick.x1 - pick.x0) * 0.5, `${format} ${id}: the result is in the pick's column`);
        assert.ok(r.y0 >= pick.y1 - 1 || r.y1 <= pick.y0 + 1, `${format} ${id}: the result is under or over the pick, never on it: ${JSON.stringify({ pick, r })}`);
        assert.ok(r.x0 >= s.safe - 1 && r.x1 <= s.w - s.safe + 1 && r.y0 >= s.safe - 1 && r.y1 <= s.h - s.safe + 1, `${format} ${id}: inside the safe area: ${JSON.stringify(r)}`);
      }
    } finally { await o.close(); }
  }
});

const overlaps = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5;

test('no pick: nothing dims and the result card sits under the grid, inside the safe area, over no candidate', async () => {
  for (const format of ['9x16', '1x1', '16x9']) {
    const o = await openPiece(dir, { server, browser, format });
    try {
      await o.mm.seek((await sceneStart(o, 'nopick')) + 4.5);
      const s = await read(o, 'nopick');
      for (const i of s.items) assert.ok(i.opacity > 0.999 && !/blur/.test(i.filter), `${format} ${i.slot}: with no pick nothing is passed over`);
      const r = s.result.box;
      assert.equal(s.result.visible, 'visible');
      for (const i of s.items) assert.ok(!overlaps(i.box, r), `${format}: the result covers no candidate (${i.slot}): ${JSON.stringify({ r, i: i.box })}`);
      assert.ok(r.y0 >= Math.max(...s.items.map((i) => i.box.y1)) - 1, `${format}: the result sits under the grid`);
      assert.ok(r.x0 >= s.safe - 1 && r.x1 <= s.w - s.safe + 1 && r.y0 >= s.safe - 1 && r.y1 <= s.h - s.safe + 1, `${format}: inside the safe area: ${JSON.stringify(r)}`);
    } finally { await o.close(); }
  }
});

test('two picks: the first one is the choice; the second is passed over like any other candidate', async () => {
  for (const format of ['9x16', '1x1', '16x9']) {
    const o = await openPiece(dir, { server, browser, format });
    try {
      await o.mm.seek((await sceneStart(o, 'twopick')) + 4.5);
      const s = await read(o, 'twopick');
      const full = s.items.filter((i) => i.opacity > 0.999);
      assert.deepEqual(full.map((i) => i.slot), ['item-2'], `${format}: only the first pick is whole`);
      assert.deepEqual(s.items.filter((i) => i.outline !== 'none').map((i) => i.slot), ['item-2'], `${format}: one ring`);
      const pick = s.items.find((i) => i.slot === 'item-2').box, r = s.result.box;
      assert.ok(Math.min(pick.x1, r.x1) - Math.max(pick.x0, r.x0) > (pick.x1 - pick.x0) * 0.5 && r.y0 >= pick.y1 - 1, `${format}: the result is under the first pick: ${JSON.stringify({ pick, r })}`);
    } finally { await o.close(); }
  }
});
