// motion.frameHold 3 (stop-motion on a 10 fps grid): during entrances an element changes only on
// frames n with n mod 3 = 0, counted at 30 fps from the start of the piece, so every element steps
// together; an element that would finish inside its last step is drawn finished from that step, and
// every rest is byte-identical with and without the hold. Story: tests/kit/media/effects.json.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
// a camera move stays smooth and may restyle its scene's slots every frame (moves/explode-layers)
const MOVING = new Set(JSON.parse(readFileSync(join(PAGE, 'effects.json'), 'utf8')).scenes.filter((s) => s.move).map((s) => s.id));
const FPS = 30;
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (frameHold) => openPiece(PAGE, { server, browser, format: '9x16', query: { story: 'effects', ...(frameHold ? { frameHold } : {}) } });

// what an element draws: its markup (styles of it and its children) and the progress the kit reports
const states = (o, t, selectors) => o.page.evaluate(async ([x, sels]) => {
  window.mm.seek(x); await window.mm.settle?.();
  const prog = new Map(window.mm.report().elements.map((e) => [e.selector, e.progress]));
  return sels.map((s) => `${document.querySelector(s)?.outerHTML ?? ''}|${prog.get(s)}`);
}, [t, selectors]);

test('on threes, entrances change only on frames n mod 3 = 0 of the shared 10 fps grid', async () => {
  const o = await open(3);
  try {
    const items = (await o.mm.meta()).schedule.items.filter((it) => it.d > 0 && it.selector && !MOVING.has(it.scene));
    const selectors = items.map((it) => it.selector);
    const frames = new Set();
    for (const it of items) {
      for (let n = Math.floor(it.start * FPS); n <= Math.ceil((it.start + it.d) * FPS) + 3; n++) { frames.add(n); frames.add(n - 1); }
    }
    const sorted = [...frames].filter((n) => n >= 0).sort((a, b) => a - b);
    const sig = new Map();
    for (const n of sorted) sig.set(n, await states(o, n / FPS, selectors));
    const off = [];
    for (const n of sorted) {
      if (!sig.has(n - 1)) continue;
      items.forEach((it, k) => {
        const inEntrance = n / FPS >= it.start && n / FPS <= it.start + it.d + 3 / FPS;
        if (inEntrance && sig.get(n)[k] !== sig.get(n - 1)[k] && n % 3 !== 0) off.push(`${it.selector} at frame ${n}`);
      });
    }
    assert.ok(sorted.length > 60, `frames inside entrances: ${sorted.length}`);
    assert.deepEqual(off.slice(0, 8), [], `${off.length} changes off the grid`);
  } finally { await o.close(); }
});

test('on threes, every rest is byte-identical to the same rest drawn without the hold', async () => {
  const held = await open(3), plain = await open(0);
  try {
    const { holds } = (await held.mm.meta()).schedule;
    assert.ok(holds.length > 5, 'the story has rests');
    for (const h of holds) {
      const t = h.from + 0.05;
      await held.mm.seek(t); await plain.mm.seek(t);
      const [a, b] = await Promise.all([held.page.screenshot({ type: 'png' }), plain.page.screenshot({ type: 'png' })]);
      assert.ok(a.equals(b), `the rest of ${h.scene} at ${t} s differs`);
    }
  } finally { await held.close(); await plain.close(); }
});
