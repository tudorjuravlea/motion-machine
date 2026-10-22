// layouts/talking-cutout and the footage matte in Chromium, on the matte fixture (a red disc travelling
// over grey, with supplied masks): inside the disc the frame shows the footage, outside it the frame is
// exactly the frame with the speaker hidden (the brand's canvas, ground and backdrop); the mask names
// the matte of the frame the picture shows at every seek, and the same t gives the same pixels in any
// seek order; the backdrop stands behind the speaker and in front of nothing else, fitted to the safe
// width or to its two-line cap, inside the safe area; a matte that is missing is a kit warning.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPiece, serveRoot, framePng } from '../../scripts/lib/browser.mjs';
import { cutoutPiece } from '../../fixtures/footage/piece.mjs';

const SPLIT = 1.8;
const story = (edit) => ({
  id: 'talking-cutout', kind: 'film', formats: ['9x16', '1x1', '16x9'], title: 'talking cutout', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, footage: { asset: 'assets/shape/' },
  scenes: [
    { id: 'a', layout: 'layouts/talking-cutout', duration: SPLIT, cut: 'transitions/hard-cut', move: null, say: '',
      beats: [{ at: 0, slot: 'backdrop', fx: 'entrances/fade', text: 'BACKDROP', params: { instant: true } },
        { at: 0.2, slot: 'caption', fx: 'entrances/fade', text: 'A test caption' }] },
    { id: 'b', layout: 'layouts/talking-cutout', duration: Math.round((edit.duration - SPLIT) * 1000) / 1000, cut: 'transitions/hard-cut', move: null, say: '',
      beats: [{ at: 0, slot: 'backdrop', fx: 'entrances/rise', text: 'CUT IN', params: { lines: 2 } }] },
  ],
  cta: { text: 'test', url: 'example.org' },
});

let piece, server, browser, o;
before(async () => {
  piece = cutoutPiece('layout', story);
  server = await serveRoot(); browser = await launchBrowser();
  o = await openPiece(piece.dir, { server, browser, format: '9x16' });
});
after(async () => { await o?.close(); await browser?.close(); await server?.close(); piece?.cleanup(); });

/** RGB of a PNG screenshot, through ffmpeg. */
function rgb(png, w, h) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { input: png, maxBuffer: 64 << 20 });
  assert.equal(r.status, 0, String(r.stderr));
  return (x, y) => { const i = (Math.round(y) * w + Math.round(x)) * 3; return [r.stdout[i], r.stdout[i + 1], r.stdout[i + 2]]; };
}

/** In the page: the visible speaker's frame index, its matte url, and where a source point lands in the frame (cover fit, object-position). */
function speakerAt(points) {
  const el = [...document.querySelectorAll('img[data-footage]')].find((i) => i.closest('[data-scene]').style.visibility !== 'hidden');
  const stage = el.closest('.mm-stage').getBoundingClientRect(), r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const k = Math.max(r.width / el.naturalWidth, r.height / el.naturalHeight);
  const [px, py] = cs.objectPosition.split(' ').map((v) => parseFloat(v) / 100);
  const ox = r.left - stage.left + (r.width - el.naturalWidth * k) * px, oy = r.top - stage.top + (r.height - el.naturalHeight * k) * py;
  const id = /^url\("?#([^")]+)"?\)$/.exec(el.style.maskImage)?.[1], mask = id ? document.getElementById(id) : null;
  return { frame: Number(/f(\d+)\.jpg$/.exec(el.getAttribute('src'))[1]) - 1, mask: mask?.querySelector('image')?.getAttribute('href') ?? null,
    maskType: mask ? getComputedStyle(mask).maskType : null, at: points.map(([x, y]) => [ox + x * k, oy + y * k]) };
}

const close = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test('inside the person the frame shows the footage; outside it the frame is the frame without the speaker', async () => {
  for (const t of [0.4, 1.2, 2.6]) {
    const png = await framePng(o.page, t);
    const { frame } = await o.page.evaluate(speakerAt, []);
    const cx = 230 + 45 * frame / 30;
    const { at } = await o.page.evaluate(speakerAt, [[cx, 110], [cx, 240], [320, 230], [200, 340]]);
    const shot = rgb(png, 1080, 1920);
    const [r, g, b] = shot(...at[0]);
    assert.ok(r > 170 && g < 90 && b < 90, `t ${t}: the disc's centre shows the footage's red, got ${[r, g, b]}`);
    await o.page.evaluate(() => { for (const i of document.querySelectorAll('img[data-footage]')) i.style.visibility = 'hidden'; });
    const bare = rgb(await o.page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' }), 1080, 1920);
    await o.page.evaluate(() => { for (const i of document.querySelectorAll('img[data-footage]')) i.style.visibility = ''; });
    for (const p of at.slice(1)) assert.ok(close(shot(...p), bare(...p), 2), `t ${t}: at ${p.map(Math.round)} the grey recording is masked away: ${shot(...p)} vs ${bare(...p)}`);
  }
});

test('the mask is the matte of the frame the picture shows, as a luminance mask, at every seek', async () => {
  for (const t of [3.1, 0.05, 1.79, 1.81, 2.2, 0.9]) {
    await o.mm.seek(t); await o.page.evaluate(() => window.mm.settle());
    const s = await o.page.evaluate(speakerAt, []);
    assert.equal(s.mask, `assets/shape/matte/f${String(s.frame + 1).padStart(5, '0')}.png`, `t ${t}`);
    assert.equal(s.maskType, 'luminance');
  }
});

test('the same t gives the same pixels in forward and reverse seek order', async () => {
  const ts = [0.1, 0.6, 1.79, 1.81, 2.4, 3.3];
  const fwd = [];
  for (const t of ts) fwd.push(await framePng(o.page, t));
  for (let i = ts.length - 1; i >= 0; i--) assert.ok((await framePng(o.page, ts[i])).equals(fwd[i]), `t = ${ts[i]}`);
});

test('two fresh pages, one seeking forward and one in reverse, paint the same frames (the mask is never still loading)', async () => {
  const ts = [0.1, 0.5, 0.9, 1.3, 1.7, 1.81, 2.2, 2.6, 3.0, 3.4];
  const a = await openPiece(piece.dir, { server, browser, format: '9x16' });
  const fwd = [];
  try { for (const t of ts) fwd.push(await framePng(a.page, t)); } finally { await a.close(); }
  const b = await openPiece(piece.dir, { server, browser, format: '9x16' });
  try {
    for (let i = ts.length - 1; i >= 0; i--) {
      assert.ok((await framePng(b.page, ts[i])).equals(fwd[i]), `t = ${ts[i]}`);
    }
  } finally { await b.close(); }
});

test('backdrop behind the speaker, plates in front; the backdrop is decoration, fitted, inside the safe area', async () => {
  await o.mm.seek(1.5); await o.page.evaluate(() => window.mm.settle());
  const m = await o.page.evaluate(() => {
    const sc = document.querySelector('[data-scene="a"]');
    const z = (sel) => Number(getComputedStyle(sc.querySelector(sel)).zIndex);
    const bd = sc.querySelector('[data-slot="backdrop"]');
    const stage = bd.closest('.mm-stage').getBoundingClientRect();
    const rg = document.createRange(); rg.selectNodeContents(bd);
    const lines = [...rg.getClientRects()].filter((q) => q.width > 1);
    const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mm-safe'));
    return { zb: z('[data-slot="backdrop"]'), zs: z('img[data-footage]'), zf: z('.talking-cutout__front'),
      decor: bd.hasAttribute('data-decor'), over: bd.hasAttribute('data-over'), safe,
      lines: new Set(lines.map((q) => Math.round(q.top))).size, widest: Math.max(...lines.map((q) => q.width)),
      top: Math.min(...lines.map((q) => q.top)) - stage.top, left: Math.min(...lines.map((q) => q.left)) - stage.left, right: Math.max(...lines.map((q) => q.right)) - stage.left };
  });
  assert.ok(m.zb < m.zs && m.zs < m.zf, `z order ${m.zb} < ${m.zs} < ${m.zf}`);
  assert.ok(m.decor && m.over);
  assert.equal(m.lines, 1);
  const room = 1080 - 2 * m.safe;
  assert.ok(m.widest <= room + 0.5 && m.widest >= room * 0.95, `one long word fills the safe width: ${m.widest} of ${room}`);
  assert.ok(m.top >= m.safe - 0.5 && m.left >= m.safe - 0.5 && m.right <= 1080 - m.safe + 0.5, JSON.stringify(m));
  assert.deepEqual((await o.mm.meta()).warnings, []);
});

const FRAME = { '9x16': [1080, 1920], '1x1': [1080, 1080], '16x9': [1920, 1080] };

test('in every format the person leaves through the frame\'s bottom edge, as it leaves the recording\'s', async () => {
  for (const fmt of ['9x16', '1x1', '16x9']) {
    const w = await openPiece(piece.dir, { server, browser, format: fmt });
    try {
      const [W, H] = FRAME[fmt];
      const png = await framePng(w.page, 1.0);
      const s = await w.page.evaluate(speakerAt, [[320, 359], [200, 359]]);
      const box = await w.page.evaluate(() => { const el = [...document.querySelectorAll('img[data-footage]')].find((i) => i.closest('[data-scene]').style.visibility !== 'hidden'); const st = el.closest('.mm-stage').getBoundingClientRect(), r = el.getBoundingClientRect(); return { bottom: r.bottom - st.top }; });
      assert.ok(Math.abs(box.bottom - H) <= 0.5, `${fmt}: the speaker's box ends at the frame's foot (${box.bottom} of ${H})`);
      assert.ok(Math.abs(s.at[0][1] - H) <= 4, `${fmt}: the recording's last row lands on the frame's last row (${s.at[0][1]})`);
      const shot = rgb(png, W, H);
      const [r, g, b] = shot(s.at[0][0], H - 2);
      assert.ok(r > 170 && g < 90 && b < 90, `${fmt}: the torso reaches the bottom edge, got ${[r, g, b]}`);
    } finally { await w.close(); }
  }
});

test('the backdrop is big and stands behind the head: a long word fills the safe width and the head covers only its lower part', async () => {
  for (const fmt of ['9x16', '16x9']) {
    const w = await openPiece(piece.dir, { server, browser, format: fmt });
    try {
      await w.mm.seek(1.5); await w.page.evaluate(() => window.mm.settle());
      const m = await w.page.evaluate(() => {
        const bd = document.querySelector('[data-scene="a"] [data-slot="backdrop"]');
        const stage = bd.closest('.mm-stage').getBoundingClientRect();
        const rg = document.createRange(); rg.selectNodeContents(bd);
        const lines = [...rg.getClientRects()].filter((q) => q.width > 1);
        const css = (el, v) => parseFloat(getComputedStyle(el).getPropertyValue(v));
        const lay = bd.closest('.talking-cutout');
        const cap = document.querySelector('[data-scene="a"] [data-slot="caption"]');
        return { widest: Math.max(...lines.map((q) => q.width)), top: Math.min(...lines.map((q) => q.top)) - stage.top, bottom: Math.max(...lines.map((q) => q.bottom)) - stage.top,
          head: (() => { const q = document.createElement('div'); q.style.cssText = 'position: absolute; height: var(--cutout-head)'; lay.append(q); const v = q.offsetHeight; q.remove(); return v; })(), safe: css(document.documentElement, '--mm-safe'), body: css(document.documentElement, '--mm-size-body'), caption: parseFloat(getComputedStyle(cap).fontSize) };
      });
      const room = FRAME[fmt][0] - 2 * m.safe;
      assert.ok(m.widest >= room * 0.95 && m.widest <= room + 0.5, `${fmt}: the word fills the safe width (${m.widest} of ${room})`);
      const h = m.bottom - m.top, under = m.bottom - m.head;
      assert.ok(under > 0 && under <= 0.45 * h, `${fmt}: the head covers ${under.toFixed(1)} px of a ${h.toFixed(1)} px word: only its lower part`);
      assert.ok(m.top >= m.safe - 0.5, `${fmt}: inside the safe top (${m.top})`);
      assert.ok(m.caption >= m.body * 1.25 - 0.01, `${fmt}: the caption is a step over body (${m.caption} vs ${m.body})`);
    } finally { await w.close(); }
  }
});

test('in 16x9 two words stay inside the safe top: the size cap holds two lines over the speaker', async () => {
  const w = await openPiece(piece.dir, { server, browser, format: '16x9' });
  try {
    await w.mm.seek(3.4); await w.page.evaluate(() => window.mm.settle());
    const m = await w.page.evaluate(() => {
      const bd = document.querySelector('[data-scene="b"] [data-slot="backdrop"]');
      bd.style.maxWidth = '30%';   // force the two words onto two lines
      const stage = bd.closest('.mm-stage').getBoundingClientRect();
      const rg = document.createRange(); rg.selectNodeContents(bd);
      const lines = [...rg.getClientRects()].filter((q) => q.width > 1);
      return { lines: new Set(lines.map((q) => Math.round(q.top))).size, top: Math.min(...lines.map((q) => q.top)) - stage.top,
        safe: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mm-safe')) };
    });
    assert.equal(m.lines, 2);
    assert.ok(m.top >= m.safe - 0.5, `the first line's glyph box starts at ${m.top}, safe ${m.safe}`);
  } finally { await w.close(); }
});

test('a cut-out picture with no matte for its frames shows whole and the kit warns', async () => {
  const file = join(piece.dir, 'assets/shape/media.json');
  const meta = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...meta, matte: undefined }, null, 2));
  const w = await openPiece(piece.dir, { server, browser, format: '9x16' });
  try {
    const warnings = (await w.mm.meta()).warnings;
    assert.ok(warnings.some((x) => /^footage: .*data-footage-matte.*mm footage matte --name shape/.test(x)), warnings.join('\n'));
    assert.equal(await w.page.evaluate(() => document.querySelector('img[data-footage]').style.maskImage), '');
  } finally { await w.close(); writeFileSync(file, JSON.stringify(meta, null, 2)); }
});
