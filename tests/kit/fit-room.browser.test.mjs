// A layout headline that carries mm-fit is sized to its room: on the dark display brand in 4x5, a
// long hook and a long content headline shrink until their text is inside the safe area and off
// every other slot; the size is the same at every seek, in any order; a headline with room keeps
// its authored size and no inline size at all; and no later headline is drawn larger than the
// hook's size over 1.25, so the hook stays the largest. A deck is fitted the same way, at each
// scene's rest.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { newPiece } from '../../scripts/new.mjs';

const LONG = 'A library of patterns for every brand and format';
const LONGER = 'A library of patterns for every brand, every format and every screen';
const scene = (id, layout, beats) => ({ id, layout, duration: 4, cut: 'transitions/hard-cut', move: null, beats });
const story = (kind, scenes) => ({
  id: `fit-${kind}`, title: 'fit', kind, formats: kind === 'deck' ? ['16x9'] : ['4x5', '9x16', '1x1', '16x9'], language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, scenes,
});
const SCENES = [
  scene('hook', 'layouts/media', [{ at: 0, slot: 'headline', fx: 'entrances/rise', text: LONG, params: { instant: true } }, { at: 0.4, slot: 'caption', fx: 'entrances/fade', text: 'A caption under the picture' }]),
  scene('grid', 'layouts/bento-3', [
    { at: 0.2, slot: 'headline', fx: 'entrances/rise', text: LONG },
    { at: 0.6, slot: 'tile-1', fx: 'entrances/fade', text: 'entrances' },
    { at: 0.8, slot: 'tile-2', fx: 'entrances/fade', text: 'transitions' },
    { at: 1.0, slot: 'tile-3', fx: 'entrances/fade', text: 'sound' },
  ]),
  scene('short', 'layouts/split', [{ at: 0.2, slot: 'headline', fx: 'entrances/rise', text: 'Time.' }, { at: 0.6, slot: 'body', fx: 'entrances/fade', text: 'each frame drawn from t alone' }]),
];

let server, browser, base, film, deck, roomy;
before(async () => {
  server = await serveRoot(ROOT); browser = await launchBrowser();
  base = mkdtempSync(join(ROOT, '.tmp-fit-room-'));
  film = newPiece({ kind: 'film', style: 'nocturne-kinetic', dir: join(base, 'film') });
  writeFileSync(join(film, 'story.json'), JSON.stringify(story('film', SCENES)));
  roomy = newPiece({ kind: 'film', style: 'nocturne-kinetic', dir: join(base, 'roomy') });
  writeFileSync(join(roomy, 'story.json'), JSON.stringify(story('film', [scene('hook', 'layouts/statement', [{ at: 0, slot: 'headline', fx: 'entrances/rise', text: 'Time.', params: { instant: true } }]), SCENES[2]])));
  deck = newPiece({ kind: 'deck', style: 'nocturne-kinetic', dir: join(base, 'deck') });
  // the same scenes as a deck, one press each, the hook's headline at rest 0; the hook is a
  // statement (a 16x9 media frame keeps one headline line, which no fit of this copy reaches)
  const hook = scene('hook', 'layouts/statement', [{ at: 0, slot: 'headline', fx: 'entrances/rise', text: LONG, params: { instant: true } }, { at: 0, slot: 'sub', fx: 'entrances/fade', text: 'A line under the claim' }]);
  const grid = { ...SCENES[1], beats: SCENES[1].beats.map((b) => (b.slot === 'headline' ? { ...b, text: LONGER } : b)) };
  const pressed = [hook, grid, SCENES[2]].map(({ duration, ...s }) => ({ ...s, presses: 1, beats: s.beats.map(({ params, ...b }) => ({ ...b, at: 0, step: params ? 0 : 1 })) }));
  writeFileSync(join(deck, 'story.json'), JSON.stringify(story('deck', pressed)));
});
after(async () => { await browser?.close(); await server?.close(); if (base) rmSync(base, { recursive: true, force: true }); });

// At an instant: per scene on screen, the headline's size, its authored size (with the inline size
// taken off), whether an inline size is written, and every slot's text past the safe area or on the headline.
const PROBE = () => {
  const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mm-safe'));
  const W = innerWidth, H = innerHeight, out = {};
  const ink = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
  for (const s of document.querySelectorAll('[data-scene]')) {
    if (getComputedStyle(s).visibility === 'hidden') continue;
    const h = s.querySelector('.mm-fit[data-slot="headline"]:not([data-empty])');
    if (!h) continue;
    const px = parseFloat(getComputedStyle(h).fontSize), inline = h.style.fontSize;
    h.style.fontSize = '';
    const authored = parseFloat(getComputedStyle(h).fontSize);
    h.style.fontSize = inline;
    const a = ink(h), bad = [];
    for (const el of s.querySelectorAll('[data-slot]:not([data-empty])')) {
      if (!el.textContent.trim() || getComputedStyle(el).visibility === 'hidden') continue;
      const b = ink(el);
      if (b.width && (b.left < safe - 1 || b.right > W - safe + 1 || b.top < safe - 1 || b.bottom > H - safe + 1)) bad.push(`${el.dataset.slot} outside`);
      if (el !== h && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push(`${el.dataset.slot} on the headline`);
    }
    out[s.dataset.scene] = { px, authored, inline: !!inline, bad };
  }
  return out;
};

async function atRests(o) {
  const { schedule } = await o.mm.meta();
  const res = {};
  for (const t of schedule.rests) { await o.mm.seek(t); Object.assign(res, await o.page.evaluate(PROBE)); }
  return { res, rests: schedule.rests };
}

test('film, dark display brand, 4x5: long headlines fit their room; a short one keeps its size; the hook stays the largest', async () => {
  const o = await openPiece(film, { server, browser, format: '4x5' });
  try {
    const { res } = await atRests(o);
    for (const id of ['hook', 'grid']) {
      assert.deepEqual(res[id].bad, [], `${id}: text inside the safe area and off the headline`);
      assert.ok(res[id].px < res[id].authored, `${id}: ${res[id].px} shrunk from ${res[id].authored}`);
      assert.ok(res[id].px >= res[id].authored * 0.6 - 0.01, `${id}: not under the floor`);
    }
    assert.ok(res.hook.px >= res.grid.px * 1.15 && res.hook.px >= res.short.px * 1.15, `the hook ${res.hook.px} is the largest (grid ${res.grid.px}, short ${res.short.px})`);
    for (const id of ['grid', 'short']) assert.ok(res[id].px <= res.hook.px / 1.25 + 0.01, `${id} ${res[id].px} is at most the hook's ${res.hook.px} over 1.25`);
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});

test('a headline with room keeps its authored size and gets no inline size', async () => {
  const o = await openPiece(roomy, { server, browser, format: '16x9' });
  try {
    const { res } = await atRests(o);
    for (const id of ['hook', 'short']) {
      assert.equal(res[id].inline, false, `${id}: no inline size`);
      assert.equal(res[id].px, res[id].authored, `${id}: authored size`);
      assert.deepEqual(res[id].bad, [], id);
    }
  } finally { await o.close(); }
});

test('the fitted size is the same at every seek, forward or backward, and in a second mount', async () => {
  const hashes = async (order) => {
    const o = await openPiece(film, { server, browser, format: '4x5' });
    try {
      const { duration } = await o.mm.meta();
      const ts = Array.from({ length: 13 }, (_, i) => Math.round((duration * i / 12) * 1000) / 1000);
      const out = {};
      for (const t of order === 'back' ? [...ts].reverse() : ts) out[t] = createHash('sha256').update(await framePng(o.page, t)).digest('hex');
      return out;
    } finally { await o.close(); }
  };
  const fwd = await hashes('fwd'), back = await hashes('back');
  assert.deepEqual(back, fwd);
});

test('a deck is fitted at each scene\'s rest: every rest inside the safe area', async () => {
  const o = await openPiece(deck, { server, browser, format: '16x9' });
  try {
    const { res } = await atRests(o);
    for (const id of ['hook', 'grid', 'short']) assert.deepEqual(res[id]?.bad, [], `${id}`);
    assert.ok(res.hook.px >= res.grid.px * 1.15, `the hook ${res.hook.px} is the largest (grid ${res.grid.px})`);
  } finally { await o.close(); }
});
