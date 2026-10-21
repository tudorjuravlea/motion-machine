// Per-format scene variants: a scene may give `variants: { <format>: { layout?, beats?,
// move?, moveParams?, say? } }`. forFormat(story, format) swaps in that format's version and drops
// every variants field; duration, cut and id are shared, so every format runs the same length.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forFormat } from '../../runtime/kit/schedule.js';
import { validators } from '../../scripts/lib/validate.mjs';

const story = {
  id: 'variants', kind: 'film', formats: ['16x9', '9x16'], title: 't', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null },
  scenes: [
    { id: 'a', layout: 'layouts/statement', duration: 3, position: 'opening', move: null, beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'Hi', params: { instant: true } }], say: '.' },
    { id: 'laptop', layout: 'layouts/desktop', duration: 4, cut: 'transitions/hard-cut', move: null,
      beats: [{ at: 0, slot: 'desk', fx: 'entrances/fade', params: { instant: true } }], say: 'desk',
      variants: { '9x16': { layout: 'layouts/caption-bar', beats: [{ at: 0.2, slot: 'stage', fx: 'devices/phone' }], say: 'phone' } } },
  ],
  cta: { text: 'Hi', url: '' },
};

test('forFormat swaps in the variant for its format and keeps duration, cut and id', () => {
  const s = forFormat(story, '9x16');
  const sc = s.scenes[1];
  assert.equal(sc.layout, 'layouts/caption-bar'); assert.equal(sc.beats[0].fx, 'devices/phone'); assert.equal(sc.say, 'phone');
  assert.equal(sc.duration, 4); assert.equal(sc.cut, 'transitions/hard-cut'); assert.equal(sc.id, 'laptop');
  assert.equal('variants' in sc, false);
});

test('a format with no variant keeps the scene as written, without its variants field', () => {
  const sc = forFormat(story, '16x9').scenes[1];
  assert.equal(sc.layout, 'layouts/desktop'); assert.equal(sc.beats[0].slot, 'desk'); assert.equal('variants' in sc, false);
  assert.equal(story.scenes[1].variants['9x16'].layout, 'layouts/caption-bar', 'the input is not mutated');
});

test('the story schema accepts variants and refuses a variant that changes duration or names an unknown format', () => {
  const v = validators();
  assert.ok(v.story(story), JSON.stringify(v.story.errors));
  const bad = (variants) => ({ ...story, scenes: [story.scenes[0], { ...story.scenes[1], variants }] });
  assert.equal(v.story(bad({ '9x16': { duration: 2 } })), false);
  assert.equal(v.story(bad({ '21x9': { layout: 'layouts/statement' } })), false);
});

test('the kit draws each format\'s own version of a scene, with the same duration', async () => {
  const { join } = await import('node:path');
  const { ROOT, serveRoot, openPiece, launchBrowser } = await import('../../scripts/lib/browser.mjs');
  const server = await serveRoot(ROOT), browser = await launchBrowser();
  try {
    const seen = {};
    for (const format of ['16x9', '9x16']) {
      const o = await openPiece(join(ROOT, 'tests/kit/media'), { server, browser, format, query: { story: 'variants', preset: 'kinetic' } });
      try {
        await o.mm.seek(4.5);
        seen[format] = await o.page.evaluate(() => ({ layout: document.querySelector('[data-scene="b"]').dataset.layout, text: document.querySelector('[data-scene="b"] [data-slot="headline"]').textContent, duration: window.mm.duration }));
      } finally { await o.close(); }
    }
    assert.deepEqual(seen['16x9'], { layout: 'layouts/statement', text: 'Wide frame', duration: 6 });
    assert.deepEqual(seen['9x16'], { layout: 'layouts/title-stack', text: 'Tall frame', duration: 6 });
  } finally { await browser.close(); await server.close(); }
});

test('the standalone bundler packs patterns a variant alone uses', async () => {
  const { patternRefs } = await import('../../scripts/lib/standalone.mjs');
  const refs = patternRefs(story);
  assert.ok(refs.includes('layouts/caption-bar') && refs.includes('devices/phone'), refs.join(', '));
});
