// brand.finish: every scene gets one overlay above its camera, chrome and not content,
// with a layer per strength. The layers that can lie over text stay at or under 0.08 opacity; the
// grain is seeded from t at 12 Hz, so it changes like film and is the same at every seek. With no
// finish there is no overlay. Story: tests/kit/media/effects.json.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (look) => openPiece(PAGE, { server, browser, format: '9x16', query: { story: 'effects', ...(look ? { look: 1 } : {}) } });

test('a finish adds one chrome overlay per scene, above the camera, a layer per strength', async () => {
  const o = await open(true);
  try {
    await o.mm.seek(1);
    const r = await o.page.evaluate(() => [...document.querySelectorAll('.mm-scene')].map((s) => {
      const f = s.querySelector(':scope > .mm-finish');
      return f && { last: s.lastElementChild === f, chrome: f.hasAttribute('data-chrome') && f.hasAttribute('data-keep') && f.getAttribute('aria-hidden') === 'true',
        layers: [...f.children].map((c) => c.className.replace('mm-finish__', '')).sort() };
    }));
    assert.ok(r.every(Boolean), 'every scene has its overlay');
    assert.deepEqual(r[0], { last: true, chrome: true, layers: ['edge', 'grain', 'halftone', 'paper', 'vignette'] });
  } finally { await o.close(); }
});

test('grain and halftone stay at or under 0.08 opacity; the paper edge stays inside the safe margin', async () => {
  const o = await open(true);
  try {
    await o.mm.seek(1);
    const r = await o.page.evaluate(() => {
      const f = document.querySelector('.mm-scene .mm-finish');
      const op = (c) => Number(getComputedStyle(f.querySelector(`.mm-finish__${c}`)).opacity);
      const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mm-safe'));
      return { grain: op('grain'), halftone: op('halftone'), paper: parseFloat(getComputedStyle(f.querySelector('.mm-finish__paper')).borderTopWidth), safe };
    });
    assert.ok(r.grain > 0 && r.grain <= 0.08 && r.halftone > 0 && r.halftone <= 0.08, JSON.stringify(r));
    assert.ok(r.paper > 0 && r.paper < r.safe * 0.6, JSON.stringify(r));
  } finally { await o.close(); }
});

test('the grain is a function of t: it changes at 12 Hz and is the same after seeking away', async () => {
  const o = await open(true);
  try {
    const seed = async (t) => { await o.mm.seek(t); return o.page.evaluate(() => document.querySelector('#mm-finish-defs feTurbulence').getAttribute('seed')); };
    const a = await seed(1.01), b = await seed(1.02), c = await seed(1.1);
    assert.equal(a, b, 'inside one 1/12 s step'); assert.notEqual(a, c);
    await seed(3); assert.equal(await seed(1.01), a);
  } finally { await o.close(); }
});

test('no finish, no overlay', async () => {
  const o = await open(false);
  try { await o.mm.seek(1); assert.equal(await o.page.evaluate(() => document.querySelectorAll('.mm-finish, #mm-finish-defs').length), 0); } finally { await o.close(); }
});

test('the vignette darkens toward the darker of ink and canvas, so a dark style is not lit at its corners', async () => {
  for (const [preset, darker] of [['editorial', 'ink'], ['kinetic', 'canvas']]) {
    const o = await openPiece(PAGE, { server, browser, format: '9x16', query: { story: 'effects', look: 1, preset } });
    try {
      await o.mm.seek(1);
      const r = await o.page.evaluate(() => { const cs = getComputedStyle(document.documentElement);
        return { shade: getComputedStyle(document.querySelector('.mm-finish')).getPropertyValue('--mm-finish-shade').trim(), ink: cs.getPropertyValue('--mm-color-ink').trim(), canvas: cs.getPropertyValue('--mm-color-canvas').trim() }; });
      assert.equal(r.shade.toLowerCase(), r[darker].toLowerCase(), `${preset}: ${JSON.stringify(r)}`);
    } finally { await o.close(); }
  }
});
