// text/garden's `text: type` in the browser: a centred line is typed letter by letter while the
// botanical flowers grow out of each letter once it is there. Mid-typing only the typed letters show
// ink and no ornament has started on a letter still to come; the slot keeps its own text node, so
// the rest is the `text: present` line pixel for pixel; seeks in either order draw the same frames.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { decodePng } from '../../scripts/check/_pixels.mjs';

const OUT = join(ROOT, 'out', 'garden-type-test');
const LINE = 'Ideas grow here.';
const N = Array.from(LINE).length;
const SHARE = 0.5;
const garden = (text, extra = {}) => ({ at: 0.2, slot: 'headline', fx: 'text/garden', text: LINE, params: { dur: 4, kind: 'botanical', seed: 3, text, align: 'center', ...extra } });
const scene = (id, b) => ({ id, layout: 'layouts/statement', duration: 6.5, cut: 'transitions/hard-cut', move: null, say: 'A test scene.', beats: [b] });
const SCENES = [
  scene('hook', { at: 0.2, slot: 'headline', fx: 'entrances/fade', text: 'Hook' }),
  scene('present', garden('present')),
  scene('typed', garden('type')),
];
const story = { id: 'garden-type-test', kind: 'film', formats: ['16x9', '9x16'], title: 'garden type test', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null }, scenes: SCENES, cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' } };

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

const open = (format) => openPiece(dir, { server, browser, format });
const sel = (id) => `[data-scene="${id}"] [data-slot="headline"]`;
const itemOf = async (o, id) => (await o.mm.meta()).schedule.items.find((it) => it.scene === id && !it.parent && it.beat?.slot === 'headline');
const frameOf = (o) => o.page.evaluate(() => { const r = document.querySelector('.mm-stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const boxOf = (o, s) => o.page.evaluate((q) => { const st = document.querySelector('.mm-stage').getBoundingClientRect(), r = document.querySelector(q).getBoundingClientRect(); return { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height }; }, s);
const canvasOf = (o) => o.page.evaluate(() => { const c = getComputedStyle(document.documentElement).getPropertyValue('--mm-color-canvas').trim(); const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
// each character of the slot's text where it is laid out, in stage pixels (the garden's svg skipped)
const charsOf = (o, s) => o.page.evaluate((q) => {
  const el = document.querySelector(q), st = document.querySelector('.mm-stage').getBoundingClientRect();
  const walk = document.createTreeWalker(el, 4), r = document.createRange(), out = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.parentElement.closest('svg')) continue;
    const t = n.textContent;
    for (let i = 0; i < t.length;) {
      const len = t.codePointAt(i) > 0xffff ? 2 : 1;
      r.setStart(n, i); r.setEnd(n, i + len);
      const b = r.getBoundingClientRect();
      out.push({ ch: t.slice(i, i + len), x: b.left - st.left, y: b.top - st.top, w: b.width, h: b.height });
      i += len;
    }
  }
  return out;
}, s);
async function shot(o, t, tweak, clip = null) {
  await o.mm.seek(t);
  if (tweak) await o.page.evaluate(tweak.fn, tweak.arg);
  const f = await frameOf(o);
  const c = clip ? { x: f.x + Math.max(0, clip.x), y: f.y + Math.max(0, clip.y), width: Math.max(1, clip.w), height: Math.max(1, clip.h) } : { x: f.x, y: f.y, width: f.w, height: f.h };
  return decodePng(await o.page.screenshot({ type: 'png', clip: c, animations: 'disabled' }));
}
const bare = (s) => ({ fn: (q) => { for (const g of document.querySelectorAll(`${q} svg.mm-garden, ${q} .mm-garden__caret`)) g.style.visibility = 'hidden'; }, arg: s });
const inkIn = (img, canvas, r) => {
  let n = 0;
  for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(img.height, Math.ceil(r.y + r.h)); y++) for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(img.width, Math.ceil(r.x + r.w)); x++) {
    const k = (y * img.width + x) * 4;
    if (Math.abs(img.data[k] - canvas[0]) + Math.abs(img.data[k + 1] - canvas[1]) + Math.abs(img.data[k + 2] - canvas[2]) > 30) n++;
  }
  return n;
};
// the instant (in seconds) mid-typing where the first k characters are whole and the next has not begun
const typingAt = (it, k) => it.start + ((k - 0.3) * SHARE / N) * it.d;

test('mid-typing only the typed letters show ink, and no ornament has started on a letter still to come', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await open(format);
    try {
      const it = await itemOf(o, 'typed'), canvas = await canvasOf(o);
      await o.mm.seek(it.start + it.d + 0.3);
      const rest = await charsOf(o, sel('typed'));
      for (const k of [3, 9]) {
        const t = typingAt(it, k);
        const img = await shot(o, t, bare(sel('typed')));
        const chars = await charsOf(o, sel('typed'));
        assert.equal(chars.map((c) => c.ch).join(''), LINE, `${format}: the slot keeps its text`);
        chars.forEach((c, j) => assert.ok(Math.abs(c.x - rest[j].x) < 0.01 && Math.abs(c.y - rest[j].y) < 0.01, `${format} k=${k}: "${c.ch}" is set at ${c.x},${c.y} while typing and at ${rest[j].x},${rest[j].y} at rest`));
        chars.forEach((c, j) => {
          if (c.ch === ' ' || c.ch === '.') return;
          const core = { x: c.x + c.w * 0.18, y: c.y, w: c.w * 0.64, h: c.h };
          const ink = inkIn(img, canvas, core);
          if (j < k) assert.ok(ink > 20, `${format} k=${k}: letter ${j} "${c.ch}" is typed but shows ${ink} px of ink`);
          else assert.equal(ink, 0, `${format} k=${k}: letter ${j} "${c.ch}" is still to come but shows ${ink} px of ink`);
        });
        const m = await o.page.evaluate(async ({ s, q }) => {
          const mod = await import(new URL('/patterns/text/garden/pattern.js', location.origin).href);
          const model = mod.modelOf(document.querySelector(s));
          const started = model.elements.filter((e) => e.s < q);
          return { started: started.length, late: started.filter((e) => e.letter == null || model.reveal[e.letter].done > e.s + 1e-9).length, chars: started.map((e) => model.letters[e.letter].ci) };
        }, { s: sel('typed'), q: (t - it.start) / it.d });
        assert.equal(m.late, 0, `${format} k=${k}: ${m.late} parts started before their letter`);
        assert.ok(m.chars.every((ci) => ci < k), `${format} k=${k}: a part grows on character ${Math.max(...m.chars)}`);
        const caret = await o.page.evaluate((s) => { const c = document.querySelector(`${s} .mm-garden__caret`); return c ? getComputedStyle(c).backgroundColor : null; }, sel('typed'));
        assert.ok(caret, `${format} k=${k}: a caret while typing`);
      }
      await o.mm.seek(it.start + it.d + 0.3);
      assert.equal(await o.page.evaluate((s) => document.querySelectorAll(`${s} .mm-garden__caret`).length, sel('typed')), 0, `${format}: no caret at rest`);
    } finally { await o.close(); }
  }
});

test('the typed line at rest is the present line pixel for pixel, laid out in the same place', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await open(format);
    try {
      const a = await boxOf(o, sel('present')), b = await boxOf(o, sel('typed'));
      assert.deepEqual(b, a, `${format}: the typed headline is laid out where the present one is`);
      const pad = { x: a.x - 10, y: a.y - 10, w: a.w + 20, h: a.h + 20 };
      const rest = async (id) => { const it = await itemOf(o, id); return it.start + it.d + 0.3; };
      const p = await shot(o, await rest('present'), bare(sel('present')), pad);
      const q = await shot(o, await rest('typed'), bare(sel('typed')), pad);
      assert.ok(Buffer.compare(Buffer.from(p.data), Buffer.from(q.data)) === 0, `${format}: the rest text pixels differ`);
      const n = await o.page.evaluate((s) => { const el = document.querySelector(s); return { kids: [...el.childNodes].filter((c) => c.nodeType === 3).length, spans: el.querySelectorAll('span').length }; }, sel('typed'));
      assert.deepEqual(n, { kids: 1, spans: 0 }, `${format}: one plain text node at rest`);
    } finally { await o.close(); }
  }
});

test('the typed scene grows a lush garden from its letters under the budgets, complete at rest', async () => {
  const o = await open('16x9');
  try {
    const it = await itemOf(o, 'typed');
    await o.mm.seek(it.start + it.d + 0.3);
    const m = await o.page.evaluate(async (s) => {
      const mod = await import(new URL('/patterns/text/garden/pattern.js', location.origin).href);
      const model = mod.modelOf(document.querySelector(s));
      const blooms = model.elements.filter((e) => e.type === 'bloom' && e.botany);
      return { blooms: blooms.length, r: blooms.map((e) => e.r / model.em), boxShare: model.boxShare, front: model.front, ends: Math.max(...model.elements.map((e) => e.e)) };
    }, sel('typed'));
    assert.ok(m.blooms >= 5, `${m.blooms} illustrated blooms`);
    assert.ok(m.r.filter((r) => r >= 0.3).length >= 3, `bloom radii ${m.r.map((r) => r.toFixed(2)).join(' ')} em`);
    assert.ok(m.boxShare <= 0.045 + 1e-9, `box share ${m.boxShare}`);
    assert.ok(m.front <= 0.05 + 1e-9, `front ${m.front}`);
    assert.ok(m.ends <= 1 + 1e-9, `the last window ends at ${m.ends}`);
  } finally { await o.close(); }
});

test('typing frames are the same in forward and in reverse seek order', async () => {
  const o1 = await open('9x16'), o2 = await open('9x16');
  try {
    const it = await itemOf(o1, 'typed');
    const ts = [0.08, 0.2, 0.33, 0.47, 0.62, 0.85, 1.1].map((f) => it.start + f * it.d);
    const fwd = []; for (const t of ts) fwd.push(await framePng(o1.page, t));
    const rev = []; for (const t of [...ts].reverse()) rev.unshift(await framePng(o2.page, t));
    ts.forEach((t, i) => assert.ok(Buffer.compare(fwd[i], rev[i]) === 0, `t = ${t.toFixed(3)} differs between the two orders`));
  } finally { await o1.close(); await o2.close(); }
});
