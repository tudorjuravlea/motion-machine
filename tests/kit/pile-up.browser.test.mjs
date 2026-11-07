// layouts/pile-up: cards land one at a time with hard cuts, overlapping, until the pile is the
// message; an opaque panel sits over it with the line to read. Stacking follows the slot order, so
// a story that brings the cards in slot order always has its newest card on top. The demo deals the
// cards on whole frames, gathering pace as the pile grows (never a metronome). The first cards land
// clear of the panel, so a short pile still shows. Card type is level; only the card backings tilt.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';

const OUT = join(ROOT, 'out', 'pile-up-test');
const DEMO = JSON.parse(readFileSync(join(ROOT, 'patterns', 'layouts', 'pile-up', 'demo', 'story.json'), 'utf8'));
const FRAME = 1 / 30;
const pile = DEMO.scenes.find((s) => s.layout === 'layouts/pile-up');
const cards = pile.beats.filter((b) => /^card-\d+$/.test(b.slot));
// the demo's scene with only its first n cards (and its panel)
const firstCards = (n) => {
  const s = structuredClone(DEMO);
  const sc = s.scenes.find((x) => x.layout === 'layouts/pile-up');
  sc.beats = sc.beats.filter((b) => !/^card-/.test(b.slot) || Number(b.slot.slice(5)) <= n);
  return s;
};

test('the demo deals the cards in slot order on whole frames, gathering pace as the pile grows', () => {
  assert.ok(cards.length >= 12, `a pile: ${cards.length} cards`);
  const nums = cards.map((b) => Number(b.slot.slice(5)));
  assert.deepEqual(nums, [...nums].sort((a, b) => a - b), 'in slot order, so the newest is on top');
  for (const b of cards) assert.equal(b.params?.instant, true, `${b.slot} lands with a cut`);
  for (const b of cards) assert.ok(Math.abs(b.at / FRAME - Math.round(b.at / FRAME)) < 0.03, `${b.slot} lands on a whole frame at 30 fps (to the millisecond the schedule keeps): ${b.at}`);
  const gaps = cards.slice(1).map((b, i) => Math.round((b.at - cards[i].at) / FRAME));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(gaps.slice(0, 4)) >= 1.5 * mean(gaps.slice(-4)), `the deal gathers pace: ${gaps.join(',')}`);
  assert.ok(new Set(gaps).size >= 3, `the gaps vary: ${gaps.join(',')}`);
  const panel = pile.beats.filter((b) => !/^card-/.test(b.slot)).map((b) => b.at);
  assert.ok(Math.min(...panel) - cards.at(-1).at >= 0.4, 'a pause before the panel, so it lands as the answer');
});

let server, browser;
const dirs = {};
before(async () => {
  mkdirSync(OUT, { recursive: true });
  const pieces = [['paper', 'paper', DEMO], ['nocturne', 'nocturne', DEMO]];
  for (const n of [1, 2, 3, 4]) for (const brand of ['paper', 'nocturne']) pieces.push([`${brand}-${n}`, brand, firstCards(n)]);
  for (const [name, brand, st] of pieces) {
    const dir = join(OUT, name), style = join(OUT, `${name}.style.json`);
    rmSync(dir, { recursive: true, force: true });
    composeToFile({ brand, motion: 'kinetic', out: style });
    newPiece({ kind: 'film', style, dir });
    writeFileSync(join(dir, 'story.json'), JSON.stringify(st, null, 2));
    dirs[name] = dir;
  }
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });


const probe = (o, id) => o.page.evaluate((id) => {
  const sc = document.querySelector(`[data-scene="${id}"]`);
  const shown = [...sc.querySelectorAll('[data-slot^="card-"]:not([data-empty])')].filter((c) => getComputedStyle(c).visibility === 'visible');
  const newest = shown.at(-1);
  const top = (x, y) => document.elementsFromPoint(x, y).map((e) => e.closest('[data-slot^="card-"], .pile-up__panel')).filter(Boolean);
  const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const panel = sc.querySelector('.pile-up__panel');
  const underPanel = shown.filter((c) => { const a = c.getBoundingClientRect(), b = panel.getBoundingClientRect(); return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom; }).length;
  const hit = newest ? top(...centre(newest)).filter((e) => e !== panel)[0] : null;
  return {
    shown: shown.length, newest: newest?.dataset.slot ?? null, newestOnTop: hit === newest,
    z: shown.map((c) => Number(getComputedStyle(c).zIndex)),
    panelTop: top(...centre(panel))[0] === panel, panelShown: getComputedStyle(panel).visibility === 'visible' && getComputedStyle(panel).display !== 'none', underPanel,
    level: shown.map((c) => [getComputedStyle(c).rotate, getComputedStyle(c).transform]).every(([r, t]) => r === 'none' && t === 'none'),
    tilted: shown.filter((c) => getComputedStyle(c, '::before').rotate !== 'none').length,
    over: shown.every((c) => c.hasAttribute('data-over')),
  };
}, id);

test('at every landing the newest card is on top of the older ones, the panel above them all', async () => {
  for (const brand of ['paper', 'nocturne']) {
    for (const format of ['9x16', '16x9']) {
      const o = await openPiece(dirs[brand], { server, browser, format });
      try {
        const start = (await o.mm.meta()).scenes.find((s) => s.id === pile.id).start;
        for (const [i, b] of cards.entries()) {
          await o.mm.seek(start + b.at + 0.01);
          const s = await probe(o, pile.id);
          assert.equal(s.shown, i + 1, `${brand} ${format}: ${i + 1} cards after ${b.slot} lands`);
          assert.equal(s.newest, b.slot);
          assert.ok(s.newestOnTop, `${brand} ${format}: ${b.slot}'s centre is not covered by an older card`);
          assert.deepEqual(s.z, [...s.z].sort((x, y) => x - y), 'stacking rises with arrival');
          assert.ok(!s.panelShown || s.panelTop, 'once shown, the panel stays on top');
        }
        await o.mm.seek(start + pile.duration - 0.05);
        const s = await probe(o, pile.id);
        assert.ok(s.panelShown && s.panelTop, 'the panel is shown, above the pile');
        assert.ok(s.underPanel > 0, `cards sit under the panel: ${s.underPanel}`);
        assert.ok(s.level, 'card type is level: no rotate or transform on a card');
        assert.equal(s.tilted, s.shown, 'every card backing tilts');
        assert.ok(s.over, 'cards overlap by design and say so (data-over)');
      } finally { await o.close(); }
    }
  }
});

test('a short pile shows: each of the first four cards sits mostly clear of the panel, in every format', async () => {
  for (const n of [1, 2, 3, 4]) {
    for (const brand of ['paper', 'nocturne']) {
      for (const format of ['9x16', '1x1', '4x5', '16x9']) {
        const o = await openPiece(dirs[`${brand}-${n}`], { server, browser, format });
        try {
          const start = (await o.mm.meta()).scenes.find((s) => s.id === pile.id).start;
          await o.mm.seek(start + pile.duration - 0.05);
          const under = await o.page.evaluate((id) => {
            const sc = document.querySelector(`[data-scene="${id}"]`);
            const p = sc.querySelector('.pile-up__panel').getBoundingClientRect();
            return [...sc.querySelectorAll('.pile-up__card:not([data-empty])')].map((c) => {
              const b = c.getBoundingClientRect();
              const ix = Math.max(0, Math.min(b.right, p.right) - Math.max(b.left, p.left)), iy = Math.max(0, Math.min(b.bottom, p.bottom) - Math.max(b.top, p.top));
              return [c.dataset.slot, ix * iy / (b.width * b.height)];
            });
          }, pile.id);
          assert.equal(under.length, n);
          for (const [slot, share] of under) assert.ok(share <= 0.4, `${brand} ${format}, ${n} card(s): ${slot} is ${Math.round(share * 100)} % under the panel`);
        } finally { await o.close(); }
      }
    }
  }
});
