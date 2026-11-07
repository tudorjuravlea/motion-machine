// Speaker frames and the face-safe zone in Chromium, on the matte fixture (a red disc for a head over a
// red bar for a torso, with supplied masks and so a face box read from the matte): the footage stands
// where each scene's mode puts it; the move starts 0.15 s before the scene lands and is the same in any
// seek order; the mask follows a resized box; --mm-face-* names the head; graphics marked data-face-safe
// stand clear of it, and a caption that spans a cut moves to the new shot's place; the panel fills the
// rest of the frame. A brand's knobs change the default mode and the card.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPiece, serveRoot, framePng } from '../../scripts/lib/browser.mjs';
import { cutoutPiece } from '../../fixtures/footage/piece.mjs';

const story = (edit, layout = 'layouts/talking-full') => ({
  id: 'speaker-frame', kind: 'film', formats: ['9x16', '16x9'], title: 'speaker frame', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, footage: { asset: 'assets/shape/' },
  scenes: [
    { id: 'a', layout, duration: 1.2, cut: 'transitions/hard-cut', move: null, say: '', frame: 'hero',
      beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'A headline over the face', params: { instant: true } },
        { at: 0.2, slot: 'caption', fx: 'entrances/fade', text: 'A caption that stays' }] },
    { id: 'b', layout, duration: 1.2, cut: 'transitions/hard-cut', move: null, say: '', frame: { mode: 'side', side: 'left' },
      beats: [{ at: 0.1, slot: 'panel', fx: 'data/stat-tile', params: { size: 'body', label: 'Views' }, value: 42, text: '42' }, { at: 0, slot: 'caption', fx: 'entrances/fade', text: 'Beside the column' }] },
    { id: 'c', layout, duration: Math.round((edit.duration - 2.4) * 1000) / 1000, cut: 'transitions/hard-cut', move: null, say: '', frame: { mode: 'inset', corner: 'tr' },
      beats: [{ at: 0, slot: 'caption', fx: 'entrances/fade', text: 'In the corner' }] },
  ],
  cta: { text: 'test', url: 'example.org' },
});

let piece, server, browser, o;
before(async () => {
  piece = cutoutPiece('speaker', story);
  server = await serveRoot(); browser = await launchBrowser();
  o = await openPiece(piece.dir, { server, browser, format: '9x16' });
});
after(async () => { await o?.close(); await browser?.close(); await server?.close(); piece?.cleanup(); });

const seek = async (page, t) => { await page.evaluate((x) => window.mm.seek(x), t); await page.evaluate(() => window.mm.settle()); };
const speaker = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('img[data-footage]')].filter((i) => i.closest('[data-scene]').style.visibility !== 'hidden').at(-1);
  const st = el.closest('.mm-stage').getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height, o: Number(getComputedStyle(el).opacity) };
});
const near = (a, b, e, msg) => assert.ok(Math.abs(a - b) <= e, `${msg}: ${a} vs ${b}`);

test('each scene\'s mode puts the footage in its place: hero is the frame, side a column, inset a corner card', async () => {
  await seek(o.page, 0.6);
  const hero = await speaker(o.page);
  near(hero.w, 1080, 40, 'hero width (a held box breathes a little)'); near(hero.h, 1920, 70, 'hero height');
  await seek(o.page, 2.0);
  const side = await speaker(o.page);
  near(side.x, 0, 2, 'column left'); near(side.w, 1080 * 0.42, 14, 'column width'); near(side.h, 1920, 70, 'column height');
  await seek(o.page, 3.3);
  const card = await speaker(o.page);
  const right = card.x + card.w, top = card.y;
  near(right, 1080 - 72, 14, 'the card stands at the safe right edge'); near(top, 72, 14, 'and the safe top');
  near(card.w, 1080 * 0.42, 14, 'inset width, a share of the shorter side');
});

test('the move starts 0.15 s before the scene lands and takes the style\'s standard duration', async () => {
  const at = async (t) => { await seek(o.page, t); return speaker(o.page); };
  const before = await at(1.2 - 0.15 - 0.02), start = await at(1.2 - 0.15 + 0.12), landed = await at(1.2 + 0.9);
  near(before.w, 1080, 40, 'still a hero just before the lead');
  assert.ok(start.w < before.w - 20 && start.w > landed.w, `under way: ${before.w} > ${start.w} > ${landed.w}`);
  near(landed.w, 1080 * 0.42, 14, 'landed');
});

test('the same t gives the same pixels in forward and reverse seek order, across the seams', async () => {
  const ts = [0.1, 1.0, 1.1, 1.2, 1.4, 1.9, 2.3, 2.45, 2.9, 3.4];
  const fwd = [];
  for (const t of ts) fwd.push(await framePng(o.page, t));
  for (let i = ts.length - 1; i >= 0; i--) assert.ok((await framePng(o.page, ts[i])).equals(fwd[i]), `t = ${ts[i]}`);
});

test('the face box is the matte\'s head: --mm-face-* names it, padded, in frame px, and mm.faceBox() agrees', async () => {
  await seek(o.page, 0.05);
  const f = await o.page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('[data-scene="a"]'));
    const g = (n) => parseFloat(cs.getPropertyValue(`--mm-face-${n}`));
    return { vars: { x: g('x'), y: g('y'), w: g('w'), h: g('h'), cx: g('cx'), cy: g('cy') }, box: window.mm.faceBox() };
  });
  // the disc (radius 60 of 640x360) is the head: in the 9x16 cover fit the recording is scaled by 1920/360
  const k = 1920 / 360, ox = (1080 - 640 * k) / 2, d = 120 * k * 1.03, pad = d * 0.12;   // the zone is measured at the widest of the drift
  near(f.vars.w, d + 2 * pad, 14, 'width'); near(f.vars.h, d + 2 * pad, 14, 'height');
  near(f.vars.y, 50 * k - 120 * k * 0.015 - pad, 16, 'top');
  near(f.vars.x, ox + 260 * k - pad, 160, 'left (the disc travels; the shot\'s median stands for it)');
  near(f.vars.cx, f.vars.x + f.vars.w / 2, 0.01, 'centre'); near(f.vars.cy, f.vars.y + f.vars.h / 2, 0.01, 'centre');
  assert.equal(f.box.source, 'matte');
  near(f.box.x, f.vars.x, 0.01, 'faceBox'); near(f.box.h, f.vars.h, 0.01, 'faceBox');
});

test('a plate marked data-face-safe stands clear of the face', async () => {
  await seek(o.page, 0.9);
  const m = await o.page.evaluate(() => {
    const st = document.querySelector('.mm-stage').getBoundingClientRect();
    const rect = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height }; };
    return { head: rect('[data-scene="a"] [data-slot="headline"]'), face: window.mm.faceBox(), tr: document.querySelector('[data-scene="a"] [data-slot="headline"]').style.top };
  });
  const apart = (a, b) => a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5;
  assert.ok(apart(m.head, m.face), `the headline ${JSON.stringify(m.head)} is clear of the face ${JSON.stringify(m.face)}`);
  assert.notEqual(m.tr, '', 'it had to move');
  assert.ok(m.head.y >= 72 - 0.5 && m.head.y + m.head.h <= 1920 - 72 + 0.5 && m.head.x >= 72 - 0.5, 'inside the safe area');
});

test('the panel fills the rest of the frame beside the column, and the tile in it stands there', async () => {
  await seek(o.page, 2.1);
  const m = await o.page.evaluate(() => {
    const st = document.querySelector('.mm-stage').getBoundingClientRect();
    const rect = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height }; };
    return { panel: rect('[data-scene="b"] .talking-full__panel'), tile: rect('[data-scene="b"] [data-slot="panel"]'), cap: rect('[data-scene="b"] [data-slot="caption"]') };
  });
  const col = 1080 * 0.42;
  assert.ok(m.panel.x >= col, `the panel starts right of the column (${m.panel.x} vs ${col})`);
  near(m.panel.x + m.panel.w, 1080 - 72, 1, 'to the safe right');
  assert.ok(m.tile.x >= col && m.tile.x + m.tile.w <= 1080 - 72 + 0.5, `the tile stands in the panel ${JSON.stringify(m)}`);
  assert.ok(m.cap.x >= col - 0.5, 'the caption keeps to the panel\'s column too');
});

test('the mask follows the resized box: the cut-out speaker in a side column is masked at the column\'s size', async () => {
  const dir = piece.dir, storyFile = join(dir, 'story.json');
  const st = JSON.parse(readFileSync(storyFile, 'utf8'));
  try {
    const cut = { ...st, scenes: [{ ...st.scenes[0], layout: 'layouts/talking-cutout', duration: st.scenes.reduce((t, sc) => t + sc.duration, 0), frame: { mode: 'side', side: 'right' }, beats: [{ at: 0, slot: 'caption', fx: 'entrances/fade', text: 'Cut out', params: { instant: true } }] }] };
    writeFileSync(storyFile, JSON.stringify(cut));
    const w = await openPiece(dir, { server, browser, format: '9x16' });
    try {
      await seek(w.page, 2.0);
      const m = await w.page.evaluate(() => {
        const el = document.querySelector('img[data-footage]');
        const id = /^url\("?#([^")]+)"?\)$/.exec(el.style.maskImage)?.[1], mask = document.getElementById(id);
        return { w: el.offsetWidth, h: el.offsetHeight, mw: mask.getAttribute('width'), mh: mask.getAttribute('height'), iw: mask.querySelector('image').getAttribute('width'), ih: mask.querySelector('image').getAttribute('height'), backdrop: getComputedStyle(document.querySelector('[data-slot="backdrop"]')).display };
      });
      near(m.w, 1080 * 0.42, 14, 'the column'); assert.equal(m.mw, String(m.w)); assert.equal(m.mh, String(m.h)); assert.equal(m.iw, String(m.w)); assert.equal(m.ih, String(m.h));
      assert.equal(m.backdrop, 'none', 'the backdrop words step aside from a column');
    } finally { await w.close(); }
  } finally { writeFileSync(storyFile, JSON.stringify(st, null, 2)); }
});

test('a caption that spans a cut moves to the new shot\'s place, and is steady inside a shot', async () => {
  // two shots with different heads: the first with the head high, the second low
  const dir = piece.dir;
  const editFile = join(dir, 'assets/shape/edit.json'), faceFile = join(dir, 'assets/shape/face.json');
  const edit = JSON.parse(readFileSync(editFile, 'utf8')), face = JSON.parse(readFileSync(faceFile, 'utf8'));
  const saved = [JSON.stringify(edit), JSON.stringify(face)];
  try {
    const half = Math.floor(edit.frames / 2);
    writeFileSync(editFile, JSON.stringify({ ...edit, picture: [{ start: 0, from: 0, length: half }, { start: half, from: half, length: edit.frames - half }] }));
    writeFileSync(faceFile, JSON.stringify({ ...face, boxes: face.boxes.map((_, i) => (i < half ? [0.35, 0.02, 0.65, 0.5] : [0.35, 0.5, 0.65, 0.98])) }));
    const st = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
    const one = { ...st, scenes: [{ ...st.scenes[0], duration: edit.duration, frame: 'hero', beats: [{ at: 0, slot: 'caption', fx: 'entrances/fade', text: 'Stays across the cut', params: { instant: true } }] }] };
    writeFileSync(join(dir, 'story.json'), JSON.stringify(one));
    const w = await openPiece(dir, { server, browser, format: '9x16' });
    try {
      const capAt = async (t) => {
        await seek(w.page, t);
        return w.page.evaluate(() => {
          const st = document.querySelector('.mm-stage').getBoundingClientRect(), r = document.querySelector('[data-slot="caption"]').getBoundingClientRect();
          return { y: r.top - st.top, h: r.height, tr: document.querySelector('[data-slot="caption"]').style.top, face: window.mm.faceBox() };
        });
      };
      const cut = half / edit.fps;
      const a1 = await capAt(cut * 0.3), a2 = await capAt(cut * 0.9), b1 = await capAt(cut + 0.2), b2 = await capAt(edit.duration - 0.1);
      assert.equal(a1.tr, a2.tr, 'steady inside the first shot');
      assert.equal(b1.tr, b2.tr, 'steady inside the second shot');
      assert.notEqual(a1.tr, b1.tr, 'it moved at the cut');
      for (const x of [a1, b1]) assert.ok(x.y + x.h <= x.face.y + 0.5 || x.y >= x.face.y + x.face.h - 0.5, `clear of its shot's face: ${x.y}..${x.y + x.h} vs ${x.face.y}..${x.face.y + x.face.h}`);
    } finally { await w.close(); }
  } finally { writeFileSync(editFile, saved[0]); writeFileSync(faceFile, saved[1]); writeFileSync(join(dir, 'story.json'), JSON.stringify(story(edit), null, 2)); }
});

test('a brand sets the default mode, the card\'s corner and size and the drift; a scene that names a frame wins', async () => {
  const dir = piece.dir;
  const storyFile = join(dir, 'story.json'), indexFile = join(dir, 'index.html');
  const st = JSON.parse(readFileSync(storyFile, 'utf8')), html = readFileSync(indexFile, 'utf8');
  try {
    const bare = { ...st, scenes: st.scenes.map(({ frame, ...sc }) => sc) };
    bare.scenes[2] = { ...bare.scenes[2], frame: 'hero' };
    writeFileSync(storyFile, JSON.stringify(bare));
    writeFileSync(indexFile, html.replace("for (const face of", "style.patterns = { 'layouts/talking-full': { frame: 'inset', corner: 'bl', insetSize: 0.3, drift: 0 } };\n    for (const face of"));
    const w = await openPiece(dir, { server, browser, format: '9x16' });
    try {
      await seek(w.page, 0.9);
      const card = await speaker(w.page);
      near(card.w, 1080 * 0.3, 1, 'the brand\'s size');
      near(card.x, 72, 1, 'the brand\'s corner: left'); near(card.y + card.h, 1920 - 72, 1, 'and bottom');
      await seek(w.page, 3.3);
      const hero = await speaker(w.page);
      near(hero.w, 1080, 1, 'a scene that names hero is hero (drift 0: not breathing)');
    } finally { await w.close(); }
  } finally { writeFileSync(storyFile, JSON.stringify(st, null, 2)); writeFileSync(indexFile, html); }
});

test('with no frame named anywhere the footage is left to the layout and no custom property moves it', async () => {
  const dir = piece.dir;
  const storyFile = join(dir, 'story.json');
  const st = JSON.parse(readFileSync(storyFile, 'utf8'));
  try {
    writeFileSync(storyFile, JSON.stringify({ ...st, scenes: st.scenes.map(({ frame, ...sc }) => sc) }));
    const w = await openPiece(dir, { server, browser, format: '9x16' });
    try {
      await seek(w.page, 2.0);
      const s = await w.page.evaluate(() => { const el = [...document.querySelectorAll('img[data-footage]')].find((i) => i.closest('[data-scene]').style.visibility !== 'hidden'); return { style: el.getAttribute('style'), frame: el.closest('[data-scene]').dataset.frame ?? null, face: window.mm.faceBox() }; });
      assert.ok(!/left|width/.test(s.style ?? ''), `no inline box: ${s.style}`);
      assert.equal(s.frame, null);
      assert.ok(s.face && s.face.source === 'matte', 'the face box is still exposed');
    } finally { await w.close(); }
  } finally { writeFileSync(storyFile, JSON.stringify(st, null, 2)); }
});
