// Reduced motion for decks (SPEC §10): under prefers-reduced-motion, or a style whose motion.reduceMotion is
// "always", a deck drops movement and keeps opacity: an entrance is a fade of the finished element, an exit a
// fade out, a cut a cross-fade. Every rest is the same picture as without it; frames are still a function of the
// instant alone (the same instants give the same pixels in any seek order); a film is not touched.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { framePng, launchBrowser, openPiece, serveRoot, ROOT } from '../../scripts/lib/browser.mjs';
import { workCopy } from '../cli/cli-helpers.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
let w, browser, server;
before(async () => { w = workCopy('deck-reduced'); browser = await launchBrowser(); server = await serveRoot(ROOT); });
after(async () => { await browser?.close(); await server?.close(); w?.cleanup(); });

/** The piece opened with the reader's preference set before the page loads. */
async function open(dir, { reduced = false, format } = {}) {
  const piece = await openPiece(dir, { browser, server, format });
  await piece.page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await piece.page.reload({ waitUntil: 'load' });
  await piece.page.waitForFunction(() => window.mm && window.mm.ready !== undefined);
  await piece.page.evaluate(() => document.fonts.ready);
  return piece;
}

const probe = (page, x) => page.evaluate(async (at) => {
  window.mm.seek(at);
  await window.mm.settle?.();
  // movement is any of the four ways a pattern places an element: transform, translate, rotate, scale
  const still = (v) => !v || v === 'none' || v === 'matrix(1, 0, 0, 1, 0, 0)' || v === '0px' || v === '1';
  const rows = [...document.querySelectorAll('[data-fx], [data-scene], .mm-camera')].map((el) => {
    const cs = getComputedStyle(el);
    return { id: el.dataset.slot ? `${el.closest('[data-scene]').dataset.scene}/${el.dataset.slot}` : el.classList.contains('mm-camera') ? `camera/${el.closest('[data-scene]').dataset.scene}` : `scene/${el.dataset.scene}`, opacity: Number(cs.opacity), visible: cs.visibility !== 'hidden', moving: ![cs.transform, cs.translate, cs.rotate, cs.scale].every(still) };
  });
  return rows;
}, x);

test('without the preference an entrance moves: the headline is translated while it fades in', async () => {
  const p = await open(w.deck);
  try {
    const rows = await probe(p.page, 0.4);
    assert.ok(rows.some((r) => r.id.endsWith('/headline') && r.moving && r.opacity < 1), JSON.stringify(rows));
  } finally { await p.close(); }
});

test('with the preference nothing moves between rests: no transform anywhere, opacity carries the entrance', async () => {
  const p = await open(w.deck, { reduced: true });
  try {
    let fades = 0;
    for (const x of [0.2, 0.4, 0.6, 0.8, 1.3, 1.6, 2.2, 2.5, 2.8]) {
      const rows = await probe(p.page, x);
      assert.deepEqual(rows.filter((r) => r.moving).map((r) => r.id), [], `press ${x}`);
      fades += rows.filter((r) => r.visible && r.opacity > 0 && r.opacity < 1 && r.id.includes('/')).length;
    }
    assert.ok(fades > 0, 'something fades in or out between rests');
  } finally { await p.close(); }
});

test('every rest is the same picture with and without the preference', async () => {
  const plain = await open(w.deck), reduced = await open(w.deck, { reduced: true });
  try {
    const n = await plain.page.evaluate(() => window.mm.presses);
    for (let x = 0; x <= n; x++) assert.equal(sha(await framePng(reduced.page, x)), sha(await framePng(plain.page, x)), `rest ${x}`);
  } finally { await plain.close(); await reduced.close(); }
});

test('reduced frames are a function of the instant: forward and reverse seeks give the same pixels', async () => {
  const p = await open(w.deck, { reduced: true });
  try {
    const at = [0.3, 0.7, 1.4, 2.2, 2.6];
    const forward = [];
    for (const x of at) forward.push(sha(await framePng(p.page, x)));
    const back = [];
    for (const x of [...at].reverse()) back.push(sha(await framePng(p.page, x)));
    assert.deepEqual(back.reverse(), forward);
    assert.ok(new Set(forward).size > 1, 'the instants differ');
  } finally { await p.close(); }
});

test('a style can force it: motion.reduceMotion "always" reduces without the reader asking', async () => {
  const file = join(w.deck, 'style.json');
  const style = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...style, motion: { ...style.motion, reduceMotion: 'always' } }, null, 2));
  const p = await open(w.deck);
  try {
    const rows = await probe(p.page, 0.4);
    assert.deepEqual(rows.filter((r) => r.moving), []);
    assert.ok(rows.some((r) => r.opacity > 0 && r.opacity < 1 && r.id.includes('/')));
  } finally { await p.close(); writeFileSync(file, JSON.stringify(style, null, 2)); }
});

test('a film is not touched by the preference: the same frames with and without it', async () => {
  const plain = await open(w.film), reduced = await open(w.film, { reduced: true });
  try {
    for (const t of [0.3, 1.1, 2.9, 3.4]) assert.equal(sha(await framePng(reduced.page, t)), sha(await framePng(plain.page, t)), `t ${t}`);
    const rows = await probe(reduced.page, 0.3);
    assert.ok(rows.some((r) => r.moving), 'a film still moves');
  } finally { await plain.close(); await reduced.close(); }
});

test('a real deck with cuts, cascades and exits: no movement at any instant between rests, and every rest is unchanged', async () => {
  const dir = join(ROOT, 'pieces', 'golden-deck-editorial');
  const plain = await open(dir), reduced = await open(dir, { reduced: true });
  try {
    const n = await reduced.page.evaluate(() => window.mm.presses);
    const moved = [];
    for (let x = 0; x < n; x++) for (const f of [0.1, 0.35, 0.6, 0.9]) {
      const rows = await probe(reduced.page, x + f);
      moved.push(...rows.filter((r) => r.moving).map((r) => `${(x + f).toFixed(2)} ${r.id}`));
    }
    assert.deepEqual(moved, []);
    for (let x = 0; x <= n; x++) assert.equal(sha(await framePng(reduced.page, x)), sha(await framePng(plain.page, x)), `rest ${x}`);
  } finally { await plain.close(); await reduced.close(); }
});
