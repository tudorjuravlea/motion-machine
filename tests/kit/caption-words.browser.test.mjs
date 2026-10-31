// text/caption-karaoke mode words in Chromium, on the synthetic recording cut with its word list:
// stepping through every frame of the film, each caption group appears at or before its first word
// on the edit's clock and at most 3 frames early, and the caption shows one group at a time. Run for
// both ways of breaking: `count` (runs of the group size) and `score` (the default: break points chosen
// by runtime/kit/captions.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, openPiece, serveRoot } from '../../scripts/lib/browser.mjs';
import { footagePiece } from '../../fixtures/footage/piece.mjs';
import { captionGroups, countGroups } from '../../runtime/kit/captions.js';

const GROUP = 3;
const MODES = ['count', 'score'];
const story = (breaks) => (edit) => ({
  id: 'footage-captions', kind: 'film', formats: ['9x16'], title: 'footage captions', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, footage: { asset: 'assets/talk/' },
  scenes: [{ id: 'talk', layout: 'layouts/talking-full', duration: edit.duration, cut: 'transitions/hard-cut', move: null, say: '',
    beats: [
      { at: 0, slot: 'headline', fx: 'entrances/fade', text: 'A test line', params: { instant: true } },
      { at: 0, slot: 'caption', fx: 'text/caption-karaoke', params: { mode: 'words', group: GROUP, ...(breaks === 'score' ? {} : { breaks }) } },
    ] }],
  cta: { text: 'test', url: 'example.org' },
});

const pieces = {};
let server, browser;
before(async () => {
  server = await serveRoot(); browser = await launchBrowser();
  for (const mode of MODES) {
    const piece = footagePiece(`captions-${mode}`, story(mode));
    pieces[mode] = { piece, o: await openPiece(piece.dir, { server, browser, format: '9x16' }) };
  }
});
after(async () => {
  for (const { piece, o } of Object.values(pieces)) { await o?.close(); piece?.cleanup(); }
  await browser?.close(); await server?.close();
});

for (const mode of MODES) {
  test(`breaks ${mode}: every group appears at or before its first word and at most 3 frames early, one group at a time`, async (t) => {
    const { piece, o } = pieces[mode];
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
    // the groups as the pattern cuts them
    const groups = mode === 'count' ? countGroups(words, GROUP) : captionGroups(words, { group: GROUP, chars: 30 });
    assert.ok(groups.every((g) => g.length >= 2), 'no group is one word alone');
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
}
