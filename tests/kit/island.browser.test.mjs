// screen/island in Chromium: a phone's island and a laptop's camera notch grow into a
// widget with text and back, drawn on every seek by the module's paint(); the shape never jumps
// when a new action starts mid-way through the last.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (format = '9x16') => openPiece(PAGE, { server, browser, format, query: { story: 'island' } });
const startOf = (sched, scene) => sched.items.find((it) => it.scene === scene && !it.parent && it.beat?.slot === 'stage').start;
const islandAt = async (o, scene, t) => { await o.mm.seek(t); return o.page.evaluate((id) => {
  const sc = document.querySelector(`[data-scene="${id}"]`);
  const i = sc.querySelector('[data-island]'), s = sc.querySelector('[data-screen]'), tx = i.querySelector('.island__text');
  const r = i.getBoundingClientRect();
  return { w: i.offsetWidth, h: i.offsetHeight, sw: s.clientWidth, sh: s.clientHeight, text: tx.textContent, opacity: Number(getComputedStyle(tx).opacity), micro: tx.hasAttribute('data-micro'), cx: r.x + r.width / 2 };
}, scene); };

test('the phone island grows to 0.86 x 0.12 of the screen with its text at the end of its action', async () => {
  const o = await open();
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'phone');
    const a = await islandAt(o, 'phone', t0 + 1.6);
    assert.ok(Math.abs(a.w / a.sw - 0.86) < 0.01 && Math.abs(a.h / a.sh - 0.12) < 0.01, JSON.stringify(a));
    assert.equal(a.text, 'Timer 04:12'); assert.equal(a.opacity, 1); assert.ok(a.micro);
  } finally { await o.close(); }
});

test('the laptop camera notch grows the same way', async () => {
  const o = await open('16x9');
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'laptop');
    const a = await islandAt(o, 'laptop', t0 + 1.6);
    assert.ok(Math.abs(a.w / a.sw - 0.5) < 0.01 && Math.abs(a.h / a.sh - 0.1) < 0.01, JSON.stringify(a));
    assert.equal(a.text, 'Recording');
  } finally { await o.close(); }
});

test('the island never jumps when a close or a reopen starts mid-way', async () => {
  const o = await open();
  try {
    const t0 = startOf((await o.mm.meta()).schedule, 'reopen');
    for (const at of [1.5, 2.0]) {
      const before = await islandAt(o, 'reopen', t0 + at - 0.001), after = await islandAt(o, 'reopen', t0 + at + 0.001);
      assert.ok(Math.abs(before.w - after.w) <= 1 && Math.abs(before.h - after.h) <= 1, `jump at ${at}: ${before.w}x${before.h} -> ${after.w}x${after.h}`);
    }
    const closed = await islandAt(o, 'reopen', t0 + 1.9);
    assert.ok(closed.w > 0.31 * closed.sw + 2, 'the reopen test needs the close to be under way');
  } finally { await o.close(); }
});

test('screen actions on a phone with no asset keep its own screen and load nothing', async () => {
  const o = await open();
  try {
    const sched = (await o.mm.meta()).schedule;
    await o.mm.seek(sched.scenes.find((s) => s.id === 'bare').end - 0.1);
    const r = await o.page.evaluate(() => {
      const sc = document.querySelector('[data-scene="bare"]');
      const label = sc.querySelector('.phone__label');
      return { srcs: [...sc.querySelectorAll('.mm-screen img')].map((i) => i.getAttribute('src')), label: getComputedStyle(label).display !== 'none' && label.textContent };
    });
    assert.deepEqual(r.srcs, []); assert.equal(r.label, 'Today');
    assert.deepEqual((await o.mm.meta()).warnings.filter((w) => /null/.test(w)), []);
  } finally { await o.close(); }
});
