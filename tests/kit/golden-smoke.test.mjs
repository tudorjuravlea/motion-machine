// Both golden stories mount and seek over the real pattern library in every shipped
// preset and every format they name, with no page error, no unknown pattern and no unknown slot,
// and no transition overlay left behind at a rest. Page: fixtures/kit-smoke/golden-smoke.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT, serveRoot, openPiece } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'fixtures/kit-smoke/golden-smoke');
const PRESETS = ['editorial', 'kinetic', 'calm-product'];
const UNKNOWN = /did not load|unknown pattern|unknown slot|has no slot/;
let server, browser;

before(async () => { server = await serveRoot(ROOT); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// Three mid-instants: the middle of the first timed cut, of the first arrival and of the emphasis.
function midInstants(s) {
  const key = s.kind === 'deck' ? (e) => (e.from + e.to) / 2 : (e) => e.t + e.d / 2;
  const first = (pred) => s.events.find(pred);
  return [
    first((e) => e.kind === 'cut' && e.d > 0),
    first((e) => e.kind === 'arrive' && e.d > 0),
    first((e) => e.kind === 'move' && String(e.pattern).startsWith('emphasis/')),
  ].filter(Boolean).map(key);
}

for (const kind of ['film', 'deck']) {
  const story = JSON.parse(readFileSync(join(ROOT, `fixtures/golden/story.${kind}.json`), 'utf8'));
  for (const preset of PRESETS) {
    for (const format of story.formats) {
      test(`golden ${kind} · ${preset} · ${format}: mounts, seeks every rest and three mid-instants cleanly`, async () => {
        const o = await openPiece(PAGE, { server, browser, format, query: { story: kind, preset } });
        try {
          const meta = await o.mm.meta();
          assert.deepEqual(meta.warnings.filter((w) => UNKNOWN.test(w)), []);
          assert.ok(meta.fonts.length && meta.fonts.every((f) => f.status === 'loaded'), JSON.stringify(meta.fonts));
          const mids = midInstants(meta.schedule);
          assert.equal(mids.length, 3);
          const leaks = [];
          for (const t of [...mids, ...meta.schedule.rests]) {
            const r = await o.page.evaluate((x) => {
              window.mm.seek(x);
              return { overlays: document.querySelectorAll('[data-mm-overlay], #mm-tx-whip-host').length,
                tx: [...document.querySelectorAll('[data-scene]')].filter((s) => /--mm-tx-/.test(s.getAttribute('style') ?? '')).length,
                elements: window.mm.report().elements.length };
            }, t);
            assert.ok(r.elements > 0);
            if (meta.schedule.rests.includes(t) && (r.overlays || r.tx)) leaks.push({ t, ...r });
          }
          assert.deepEqual(leaks, [], 'no overlay or --mm-tx-* survives into a rest');
          assert.deepEqual(o.errors, []);
        } finally { await o.close(); }
      });
    }
  }
}
