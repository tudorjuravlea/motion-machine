// Brand text rules: text on a surface takes the brand's surfaceInk (ink when the brand
// gives none), and a brand with composition.accentText false never tints text with the accent:
// a stat-hero or split figure is drawn in ink. Accent fills stay accent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (query) => openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'brand-rules', preset: 'kinetic', ...query } });
const colours = (page) => page.evaluate(() => {
  const c = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).color : null; };
  const role = (r) => { const d = document.createElement('i'); d.style.color = `var(--mm-color-${r})`; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; };
  return {
    ink: role('ink'), accent: role('accent'),
    stat: c('[data-scene="stat"] .stat-hero__figure'), split: c('[data-scene="split"] [data-slot="figure"]'),
    side: c('[data-scene="cmp"] .comparison__side'), caption: c('[data-scene="bar"] .caption-bar__caption'),
    flap: c('[data-scene="bar"] .mm-split-flap__c'),
    accentBorder: getComputedStyle(document.querySelector('[data-scene="cmp"] .comparison__side--right')).borderTopColor,
  };
});

test('without the new brand fields nothing changes: surface text is ink, figures are accent', async () => {
  const o = await open({});
  try {
    await o.mm.seek(10.5);   // inside the caption-bar scene, so the split-flap tiles exist
    const k = await colours(o.page);
    for (const x of ['side', 'caption', 'flap']) assert.equal(k[x], k.ink, x);
    assert.equal(k.stat, k.accent); assert.equal(k.split, k.accent);
  } finally { await o.close(); }
});

test('surfaceInk colours the text on every surface: comparison sides, the caption bar, split-flap tiles', async () => {
  const o = await open({ surfaceInk: '#123456' });
  try {
    await o.mm.seek(10.5);   // inside the caption-bar scene, so the split-flap tiles exist
    const k = await colours(o.page);
    for (const x of ['side', 'caption', 'flap']) assert.equal(k[x], 'rgb(18, 52, 86)', x);
  } finally { await o.close(); }
});

test('accentText false draws figures in ink and leaves accent fills alone', async () => {
  const o = await open({ accentText: '0' });
  try {
    await o.mm.seek(10.5);   // inside the caption-bar scene, so the split-flap tiles exist
    const k = await colours(o.page);
    assert.equal(k.stat, k.ink, 'stat-hero figure'); assert.equal(k.split, k.ink, 'split figure');
    assert.equal(k.accentBorder, k.accent, 'the comparison\'s accent rule is a fill, not text');
  } finally { await o.close(); }
});
