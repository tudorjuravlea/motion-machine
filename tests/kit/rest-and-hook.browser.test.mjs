// Kit behaviours at rest and on the hook, the browser half: style roles reach the page, a film's
// frame 0 and a deck's rest 0 show the hook finished, an end-anchored cue resolves on
// its landing, type never overshoots (SPEC §15), and every golden rest is a
// finished picture in every preset. Fixtures: fixtures/kit-smoke/roles, roles-deck.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT, serveRoot, openPiece } from '../../scripts/lib/browser.mjs';
import { validators } from '../../scripts/lib/validate.mjs';

const ROLES = join(ROOT, 'fixtures/kit-smoke/roles');
const ROLES_DECK = join(ROOT, 'fixtures/kit-smoke/roles-deck');
const GOLDEN = join(ROOT, 'fixtures/kit-smoke/golden-smoke');
const UNKNOWN = /did not load|unknown pattern|unknown slot|has no slot/;
let server, browser;

before(async () => { server = await serveRoot(ROOT); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (dir, opts = {}) => openPiece(dir, { server, browser, ...opts });

// What a viewer sees of a slot: the kit's report entry plus the computed opacity.
const slotAt = (page, t, scene, slot) => page.evaluate(([x, sel]) => {
  window.mm.seek(x);
  const r = window.mm.report().elements.find((e) => e.selector === sel);
  return { ...r, opacity: getComputedStyle(document.querySelector(sel)).opacity };
}, [t, `[data-scene="${scene}"] [data-slot="${slot}"]`]);

test('roles fixtures validate against the story schema', () => {
  const v = validators();
  for (const dir of [ROLES, ROLES_DECK]) assert.ok(v.story(JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'))), JSON.stringify(v.story.errors));
});

test('the kit mounts style roles as the style\'s patterns, and agrees with schedule()', async () => {
  const o = await open(ROLES);
  try {
    const meta = await o.mm.meta();
    assert.deepEqual(meta.warnings.filter((w) => UNKNOWN.test(w)), []);
    const fx = await o.page.evaluate(() => [...document.querySelectorAll('[data-slot][data-fx]')].map((e) => e.dataset.fx));
    assert.deepEqual(fx, ['entrances/spy', 'entrances/fade', 'entrances/spy', 'entrances/spy']);
    assert.deepEqual(meta.schedule.scenes.map((s) => [s.cut.pattern, s.position]), [['transitions/hard-cut', 'opening'], ['transitions/probe', 'topic']]);
    // the probe transition really runs in the cut (it adds an overlay)
    const overlays = await o.page.evaluate(() => { window.mm.seek(3.2); return document.querySelectorAll('[data-mm-overlay]').length; });
    assert.ok(overlays > 0);
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});

test('a film beat at 0 with params.instant is finished on frame 0', async () => {
  const o = await open(ROLES);
  try {
    const h = await slotAt(o.page, 0, 'hook', 'headline');
    assert.equal(h.visible, true);
    assert.equal(h.progress, 1);
    assert.equal(h.opacity, '1');
    const sub = await slotAt(o.page, 0, 'hook', 'sub');
    assert.equal(sub.visible, false, 'the rest still arrives on its own time');
  } finally { await o.close(); }
});

test('a deck beat with step 0 is finished at rest 0, and at a later scene\'s cut', async () => {
  const o = await open(ROLES_DECK);
  try {
    const h = await slotAt(o.page, 0, 'hook', 'headline');
    assert.deepEqual([h.visible, h.progress, h.opacity], [true, 1, '1']);
    const sub = await slotAt(o.page, 0, 'hook', 'sub');
    assert.equal(sub.visible, false);
    const later = await slotAt(o.page, 2.5, 'two', 'headline');   // mid-cut into scene two
    assert.deepEqual([later.visible, later.progress, later.opacity], [true, 1, '1']);
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});

test('the kit reads the sound pattern\'s anchor; the riser ends on its beat\'s landing', async () => {
  const o = await open(ROLES);
  try {
    const { schedule } = await o.mm.meta();
    const cue = schedule.events.find((e) => e.kind === 'cue');
    const land = schedule.events.find((e) => e.kind === 'arrive' && e.selector === cue.selector);
    assert.equal(cue.anchor, 'end');
    assert.equal(cue.d, 0.8);
    assert.ok(Math.abs(cue.t + cue.d - (land.t + land.d)) < 1e-9, `${cue.t} + ${cue.d} vs ${land.t} + ${land.d}`);
  } finally { await o.close(); }
});

test('a text entrance never passes p = 1 on a bouncy spring; a textless one may', async () => {
  const o = await open(ROLES);
  try {
    const peak = await o.page.evaluate(() => {
      window.__spy = {};
      for (let t = 3; t <= 5; t += 0.01) window.mm.seek(t);
      return window.__spy;
    });
    assert.ok(peak['two/sub'] > 1.05, `the shape overshoots: ${peak['two/sub']}`);
    assert.ok(peak['two/headline'] <= 1, `type is clamped: ${peak['two/headline']}`);
    const r = await slotAt(o.page, 3.6, 'two', 'headline');
    assert.equal(r.overshoot, 0, 'and reports no overshoot');
    // the shape reports its analytic overshoot once settled: heavy is {bounce 0.6, period 0.5}, ζ = 0.4
    const shape = await slotAt(o.page, 5.9, 'two', 'sub');
    const z = 0.4;
    assert.ok(Math.abs(shape.overshoot - Math.exp(-z * Math.PI / Math.sqrt(1 - z * z))) < 1e-9, `overshoot ${shape.overshoot}`);
  } finally { await o.close(); }
});

// at every rest of both golden stories, in every preset, everything on screen is finished.
for (const kind of ['film', 'deck']) {
  for (const preset of ['editorial', 'kinetic', 'calm-product']) {
    test(`golden ${kind} · ${preset}: every rest draws every visible element at p = 1, opacity 1`, async () => {
      const o = await open(GOLDEN, { query: { story: kind, preset } });
      try {
        const { schedule } = await o.mm.meta();
        const bad = await o.page.evaluate((rests) => {
          const out = [];
          for (const t of rests) {
            window.mm.seek(t);
            for (const e of window.mm.report().elements) {
              if (!e.visible) continue;
              const op = getComputedStyle(document.querySelector(e.selector)).opacity;
              if (e.progress !== 1 || op !== '1') out.push(`${t} ${e.selector} p=${e.progress} opacity=${op}`);
            }
          }
          return out;
        }, schedule.rests);
        assert.deepEqual(bad, []);
      } finally { await o.close(); }
    });
  }
}
