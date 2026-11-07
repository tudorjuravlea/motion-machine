// The composition in the page: the kit exposes the brand's composition as --mm-align, --mm-headline-scale
// and --mm-density; every layout takes its default alignment, headline size and spacing from them;
// a beat's align param still overrides; and the hook (the first scene's headline) is the largest
// headline in every format and preset, with every golden rest inside the safe area.
// Fixture: fixtures/kit-smoke/composition (layouts.json); the golden stories via golden-smoke.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'fixtures/kit-smoke/composition');
const GOLDEN = join(ROOT, 'fixtures/kit-smoke/golden-smoke');
const PRESETS = ['editorial', 'kinetic', 'calm-product'];
const LAYOUT_SCENES = ['hook', 'title', 'split', 'compare', 'bento', 'stat', 'list', 'quote', 'end'];
let server, browser;

before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (query, format = '9x16', page = PAGE) => openPiece(page, { server, browser, format, query: { story: 'layouts', ...query } });

// The first rest inside each scene, by id.
const restOf = (sched) => Object.fromEntries(sched.scenes.map((s) => [s.id, sched.rests.find((r) => r >= s.start && r < s.end)]));

// Per scene, at its rest: the headline's computed alignment and size, and the layout root's gap.
async function headlines(o, ids) {
  const rest = restOf((await o.mm.meta()).schedule);
  const out = {};
  for (const id of ids) {
    out[id] = await o.page.evaluate(([t, id]) => {
      window.mm.seek(t);
      const h = document.querySelector(`[data-scene="${id}"] [data-slot="headline"]`);
      const root = document.querySelector(`[data-scene="${id}"] .mm-camera > *`);
      const cs = getComputedStyle(h), rs = getComputedStyle(root);
      const align = rs.display === 'grid' ? rs.justifyItems : rs.alignItems;
      return { textAlign: cs.textAlign, align, fontPx: parseFloat(cs.fontSize), gap: parseFloat(rs.rowGap) || 0 };
    }, [rest[id], id]);
  }
  return out;
}
// A stretch layout (bento-3, comparison) aligns by its text; the others by their root too.
const isCentre = (h) => h.textAlign === 'center' && /^(center|stretch)$/.test(h.align);
const isLeft = (h) => /^(start|left)$/.test(h.textAlign) && /^(start|flex-start|normal|left|stretch)$/.test(h.align);

test('the kit exposes the composition as --mm-align, --mm-headline-scale and --mm-density', async () => {
  const want = { editorial: ['start', '1', '1'], kinetic: ['center', '1.2', '0.6'], 'calm-product': ['start', '1', '1'] };
  for (const preset of [...PRESETS, 'none']) {
    const o = await open(preset === 'none' ? { preset: 'kinetic', composition: 'none' } : { preset });
    try {
      const v = await o.page.evaluate(() => ['--mm-align', '--mm-headline-scale', '--mm-density'].map((k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim()));
      assert.deepEqual(v, want[preset] ?? ['start', '1', '1'], preset === 'none' ? 'a style with no composition reads as left, 1, airy' : preset);
      assert.deepEqual(o.errors, []);
    } finally { await o.close(); }
  }
});

test('every layout takes its default alignment from the brand (paper left, signal centred)', async () => {
  for (const [preset, ok, word] of [['editorial', isLeft, 'left'], ['kinetic', isCentre, 'centred'], ['calm-product', isLeft, 'left']]) {
    const o = await open({ preset });
    try {
      const h = await headlines(o, LAYOUT_SCENES);
      for (const id of LAYOUT_SCENES) assert.ok(ok(h[id]), `${preset} · ${id}: expected ${word}, got ${JSON.stringify(h[id])}`);
    } finally { await o.close(); }
  }
});

test('a beat\'s align param still overrides the brand, both ways', async () => {
  for (const preset of ['editorial', 'kinetic']) {
    const o = await open({ preset });
    try {
      const h = await headlines(o, ['force-center', 'force-left']);
      assert.ok(isCentre(h['force-center']), `${preset}: align center wins: ${JSON.stringify(h['force-center'])}`);
      assert.ok(isLeft(h['force-left']), `${preset}: align left wins: ${JSON.stringify(h['force-left'])}`);
    } finally { await o.close(); }
  }
});

test('every layout headline scales with --mm-headline-scale; density tightens the gaps', async () => {
  for (const format of ['9x16', '16x9']) {
    const base = await open({ preset: 'kinetic', scale: '1', density: 'airy' }, format);
    const big = await open({ preset: 'kinetic', density: 'airy' }, format);
    const tight = await open({ preset: 'kinetic', scale: '1' }, format);
    try {
      const [a, b, c] = await Promise.all([base, big, tight].map((o) => headlines(o, LAYOUT_SCENES)));
      for (const id of LAYOUT_SCENES) {
        assert.ok(Math.abs(b[id].fontPx / a[id].fontPx - 1.2) < 0.01, `${format} · ${id}: ${b[id].fontPx} / ${a[id].fontPx} should be 1.2`);
        assert.equal(c[id].fontPx, a[id].fontPx, `${format} · ${id}: density does not change type`);
        assert.ok(c[id].gap < a[id].gap, `${format} · ${id}: compact gap ${c[id].gap} < airy gap ${a[id].gap}`);
      }
    } finally { await Promise.all([base, big, tight].map((o) => o.close())); }
  }
});

// in the golden stories, the hook's headline is the largest headline of the piece in every
// format, by a clear step, and every text box at every rest sits inside the safe area: on every
// shipped preset (styles/presets) and in every format, 4x5 included.
async function goldenSizes(kind, preset, format) {
  const o = await openPiece(GOLDEN, { server, browser, format, query: { story: kind, preset } });
  try {
    const { schedule } = await o.mm.meta();
    const sizes = {}, outside = [];
    for (const t of schedule.rests) {
      const r = await o.page.evaluate((x) => {
        window.mm.seek(x);
        const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mm-safe'));
        const W = innerWidth, H = innerHeight, out = [], hs = {};
        for (const s of document.querySelectorAll('[data-scene]')) {
          if (getComputedStyle(s).visibility === 'hidden') continue;
          const h = s.querySelector('[data-slot="headline"]:not([data-empty])');
          if (h && h.textContent.trim()) hs[s.dataset.scene] = parseFloat(getComputedStyle(h).fontSize);
          for (const el of s.querySelectorAll('[data-slot]:not([data-empty])')) {
            if (!el.textContent.trim() || getComputedStyle(el).visibility === 'hidden') continue;
            const range = document.createRange(); range.selectNodeContents(el);
            const b = range.getBoundingClientRect();
            if (b.width && (b.left < safe - 1 || b.right > W - safe + 1 || b.top < safe - 1 || b.bottom > H - safe + 1)) out.push(`${s.dataset.scene}/${el.dataset.slot} ${Math.round(b.left)},${Math.round(b.top)}-${Math.round(b.right)},${Math.round(b.bottom)}`);
          }
        }
        return { hs, out };
      }, t);
      Object.assign(sizes, r.hs);
      outside.push(...r.out.map((x) => `t=${t} ${x}`));
    }
    return { sizes, outside, first: schedule.scenes[0].id };
  } finally { await o.close(); }
}

const SHIPPED = readdirSync(join(ROOT, 'styles/presets')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
for (const preset of SHIPPED) {
  test(`golden film and deck · ${preset}: the hook is the largest headline in every format; every rest inside the safe area`, async () => {
    for (const [kind, format] of [['film', '9x16'], ['film', '1x1'], ['film', '4x5'], ['film', '16x9'], ['deck', '16x9']]) {
      const { sizes, outside, first } = await goldenSizes(kind, preset, format);
      const hook = sizes[first];
      const others = Object.entries(sizes).filter(([id]) => id !== first);
      assert.ok(hook && others.length, `${kind} ${format}: sizes measured`);
      for (const [id, px] of others) assert.ok(hook >= px * 1.15, `${kind} ${format} · ${preset}: hook ${hook}px vs ${id} ${px}px`);
      assert.deepEqual(outside, [], `${kind} ${format} · ${preset}: text outside the safe area`);
    }
  });
}
