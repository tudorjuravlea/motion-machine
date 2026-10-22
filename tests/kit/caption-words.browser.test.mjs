// text/caption-karaoke mode words in Chromium, on the synthetic recording cut with its word list:
// stepping through every frame of the film, each caption group appears at or before its first word
// on the edit's clock and at most 3 frames early, and the caption shows one group at a time.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPiece, serveRoot } from '../../scripts/lib/browser.mjs';
import { footagePiece } from '../../fixtures/footage/piece.mjs';

const GROUP = 3;
const story = (edit) => ({
  id: 'footage-captions', kind: 'film', formats: ['9x16'], title: 'footage captions', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, footage: { asset: 'assets/talk/' },
  scenes: [{ id: 'talk', layout: 'layouts/talking-full', duration: edit.duration, cut: 'transitions/hard-cut', move: null, say: '',
    beats: [
      { at: 0, slot: 'headline', fx: 'entrances/fade', text: 'A test line', params: { instant: true } },
      { at: 0, slot: 'caption', fx: 'text/caption-karaoke', params: { mode: 'words', group: GROUP } },
    ] }],
  cta: { text: 'test', url: 'example.org' },
});

let piece, server, browser, o;
before(async () => {
  piece = footagePiece('captions', story);
  server = await serveRoot(); browser = await launchBrowser();
  o = await openPiece(piece.dir, { server, browser, format: '9x16' });
});
after(async () => { await o?.close(); await browser?.close(); await server?.close(); piece?.cleanup(); });

test('every group appears at or before its first word and at most 3 frames early, one group at a time', async (t) => {
  const { words, fps, frames } = piece.edit;
  const seen = await o.page.evaluate(({ frames, fps }) => {
    const out = [];
    for (let n = 0; n < frames; n++) {
      window.mm.seek(n / fps);
      const el = document.querySelector('[data-slot="caption"]');
      const cs = getComputedStyle(el);
      out.push(cs.visibility !== 'hidden' && cs.opacity !== '0' ? el.textContent.trim() : '');
    }
    return out;
  }, { frames, fps });
  const groups = [];
  for (let i = 0; i < words.length; i += GROUP) groups.push(words.slice(i, i + GROUP));
  if (groups.length > 1 && groups.at(-1).length === 1) groups.at(-2).push(groups.pop()[0]);
  const texts = new Set(groups.map((g) => g.map((w) => w.text).join(' ')));
  for (const s of seen) assert.ok(s === '' || texts.has(s), `"${s}" is one whole group`);
  let worst = 0;
  for (const g of groups) {
    const text = g.map((w) => w.text).join(' ');
    const n = seen.indexOf(text);
    assert.ok(n >= 0, `"${text}" never shown`);
    const early = g[0].at - n / fps;
    worst = Math.max(worst, early * fps);
    assert.ok(early >= -1e-9, `"${text}" first shown at ${n / fps} s, after its first word at ${g[0].at} s`);
    assert.ok(early <= 3 / fps + 1e-9, `"${text}" first shown ${early} s before its first word`);
  }
  t.diagnostic(`${groups.length} groups over ${frames} frames; earliest appearance ${worst.toFixed(2)} frames before its word`);
});
