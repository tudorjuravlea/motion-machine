// W-FACE: text over the speaker's face warns. On the matte fixture (a red disc for a head, with a face box
// read from the matte): a headline that sits over the head warns; the same headline with the layout's
// face-safe placement stands clear and passes; a story with no footage and a speaker who is never on
// screen are SKIP, each with its reason. The pure half (the share of the face a box covers) is pinned too.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, launchBrowser, serveRoot } from '../../scripts/lib/browser.mjs';
import { runCheck } from '../../scripts/check.mjs';
import { cutoutPiece } from '../../fixtures/footage/piece.mjs';
import { faceCover, FACE_COVER } from '../../scripts/check/W-FACE.mjs';

const story = (edit, frame = 'hero') => ({
  id: 'w-face', kind: 'film', formats: ['9x16'], title: 'w face', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, footage: { asset: 'assets/shape/' },
  scenes: [{ id: 'a', layout: 'layouts/talking-full', duration: edit.duration, cut: 'transitions/hard-cut', move: null, say: '', frame,
    beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'A headline over the face', params: { instant: true } }] }],
  cta: { text: 'test', url: 'example.org' },
});

let piece, server, browser;
before(async () => {
  piece = cutoutPiece('w-face', story);
  // the gate reads the piece's own style.json: the preset the page mounts, its font files named from the piece
  const style = JSON.parse(readFileSync(join(ROOT, 'styles/presets/nocturne-kinetic.json'), 'utf8'));
  for (const face of Object.values(style.type)) for (const f of face.files) f.src = `../../${f.src}`;
  writeFileSync(join(piece.dir, 'style.json'), JSON.stringify(style, null, 2));
  server = await serveRoot(); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); piece?.cleanup(); });

const check = async () => (await runCheck(piece.dir, { browser, server, only: ['W-FACE'] })).rules.find((r) => r.id === 'W-FACE');

test('the share of the face a box covers', () => {
  const face = { x: 100, y: 100, w: 200, h: 200 };
  assert.equal(faceCover({ x: 0, y: 0, w: 50, h: 50 }, face), 0);
  assert.equal(faceCover({ x: 0, y: 0, w: 1000, h: 1000 }, face), 1);
  assert.equal(faceCover({ x: 200, y: 100, w: 200, h: 200 }, face), 0.5);
  assert.equal(FACE_COVER, 0.1);
});

test('text over the face warns; the same headline placed clear of the face passes', async () => {
  const html = readFileSync(join(piece.dir, 'index.html'), 'utf8');
  try {
    // an overlay that does not know about the face: the layout's face-safe marks are taken off after mount
    writeFileSync(join(piece.dir, 'index.html'), html.replace('await mount(', 'window.__m = mount('). replace('</script>', 'await window.__m; document.querySelectorAll("[data-face-safe]").forEach((e) => e.removeAttribute("data-face-safe"));\n  </script>'));
    const bad = await check();
    assert.equal(bad.status, 'WARN', JSON.stringify(bad.evidence));
    assert.match(bad.evidence.selector, /data-slot="headline"/);
    assert.ok(bad.evidence.measured > FACE_COVER);
    assert.equal(bad.evidence.face.source, 'matte');
    assert.match(bad.evidence.reason, /face box/);
  } finally { writeFileSync(join(piece.dir, 'index.html'), html); }
  const good = await check();
  assert.equal(good.status, 'PASS', JSON.stringify(good.evidence));
  assert.ok(good.evidence.instants >= 1);
});

test('a speaker who is never on screen: SKIP with the reason', async () => {
  const file = join(piece.dir, 'story.json'), st = JSON.parse(readFileSync(file, 'utf8'));
  try {
    writeFileSync(file, JSON.stringify({ ...st, scenes: [{ ...st.scenes[0], frame: 'hidden' }] }));
    const r = await check();
    assert.equal(r.status, 'SKIP');
    assert.match(r.evidence.reason, /not on screen/);
  } finally { writeFileSync(file, JSON.stringify(st, null, 2)); }
});

test('a story with no footage: SKIP with the reason', async () => {
  const file = join(piece.dir, 'story.json'), st = JSON.parse(readFileSync(file, 'utf8'));
  try {
    const { footage, ...rest } = st;
    writeFileSync(file, JSON.stringify({ ...rest, scenes: [{ ...st.scenes[0], layout: 'layouts/title-stack', frame: undefined, beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'No speaker here', params: { instant: true } }] }] }));
    const r = await check();
    assert.equal(r.status, 'SKIP');
    assert.match(r.evidence.reason, /no footage/);
  } finally { writeFileSync(file, JSON.stringify(st, null, 2)); }
});
