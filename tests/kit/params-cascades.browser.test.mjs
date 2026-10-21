// Params and cascades, the browser half: params reach exits, emphasis, transitions and
// moves; data-each cascades; pattern.html fragments with nested slots; assets; overlay cleanup;
// ctx.unit; deck camera moves. Fixtures: fixtures/kit-smoke/follow (film), follow-deck (deck).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT, serveRoot, openPiece } from '../../scripts/lib/browser.mjs';
import { validators } from '../../scripts/lib/validate.mjs';

const FOLLOW = join(ROOT, 'fixtures/kit-smoke/follow');
const DECK = join(ROOT, 'fixtures/kit-smoke/follow-deck');
const style = JSON.parse(readFileSync(join(ROOT, 'fixtures/kit-smoke/film/style.json'), 'utf8'));
let server, browser;

before(async () => { server = await serveRoot(ROOT); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const open = (dir, opts = {}) => openPiece(dir, { server, browser, ...opts });
const probe = (page, t) => page.evaluate((x) => { window.__probe = {}; window.mm.seek(x); return window.__probe; }, t);

test('params-and-cascades fixtures validate against the story schema', () => {
  const v = validators();
  for (const dir of [FOLLOW, DECK]) {
    const s = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
    assert.ok(v.story(s), JSON.stringify(v.story.errors));
  }
});

test('params: entrance, exit (params.exit, else the bag), emphasis, transition (with policy) and move', async () => {
  const o = await open(FOLLOW);
  try {
    // emphasis window of the headline (0.62..1.62) and of the sub (0.72..1.72)
    const mid = await probe(o.page, 1.0);
    assert.deepEqual(mid.entrance.headline.params, { d: 0.5 }, 'the entrance gets the bag without the exit sub-bag');
    assert.equal(mid.emphasis.headline.strength, 0.2, 'emphasis keeps its default where the bag says nothing');
    assert.equal(mid.emphasis.headline.d, 0.5, 'emphasis gets the shared bag');
    assert.equal(mid.emphasis.sub.strength, 0.4);
    assert.deepEqual(mid.move.one.params, { k: 'mv' });
    // exits at 3.2 (+0.364)
    const ex = await probe(o.page, 3.3);
    assert.equal(ex.exit.headline.side, 'left', 'params.exit wins for the exit');
    assert.equal(ex.exit.headline.d, undefined, 'params.exit replaces the bag');
    assert.equal(ex.exit.sub.side, 'left', 'without params.exit the exit gets the same bag');
    assert.equal(ex.exit.sub.strength, 0.4);
    // the cut into scene two (4.0 .. 4.52)
    const cut = await probe(o.page, 4.2);
    assert.deepEqual(cut.transition.two.params, { shape: 'circle' });
    assert.equal(cut.transition.two.policy, style.transitions.policy);
    // no data-p-* attribute is written for a sub-bag
    assert.equal(await o.page.evaluate(() => document.querySelector('[data-scene="one"] [data-slot="headline"]').hasAttribute('data-p-exit')), false);
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});

test('each: a beat cascade and a layout data-each list arrive child by child, capped at capS', async () => {
  const o = await open(FOLLOW);
  try {
    const read = (t) => o.page.evaluate((x) => {
      window.mm.seek(x);
      const kids = (slot) => [...document.querySelector(`[data-scene="one"] [data-slot="${slot}"]`).children].map((c) => getComputedStyle(c).visibility === 'hidden' ? 0 : Number(getComputedStyle(c).opacity));
      const list = document.querySelector('[data-scene="one"] [data-slot="list"]');
      return { list: kids('list'), steps: kids('steps'), each: list.hasAttribute('data-each'), stagger: Number(list.dataset.stagger),
        text: [...list.children].map((c) => c.textContent), report: window.mm.report().elements.map((e) => e.selector) };
    }, t);
    const early = await read(0.3 + 0.15);
    assert.equal(early.list.length, 10);
    assert.deepEqual(early.text, ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']);
    assert.ok(early.list[0] > 0 && early.list[9] === 0, `list ${early.list}`);
    assert.ok(early.steps[0] > 0 && early.steps[1] > 0 && early.steps[2] === 0, `steps ${early.steps}`);
    assert.ok(early.each);
    assert.ok(9 * early.stagger <= style.motion.stagger.capS + 1e-9, `the cascade spans ${9 * early.stagger}s`);
    const rest = await read(2.5);
    assert.ok(rest.list.every((x) => x === 1) && rest.steps.every((x) => x === 1), JSON.stringify(rest));
    assert.ok(!rest.report.some((s) => s.includes(':nth-child')), 'children are audited through their parent');
    const sched = await o.page.evaluate(() => window.mm.schedule.events.filter((e) => e.kind === 'arrive' && e.scene === 'one').map((e) => e.selector));
    assert.equal(sched.filter((s) => s.includes('[data-slot="list"] > :nth-child')).length, 10);
    assert.equal(sched.filter((s) => s.includes('[data-slot="steps"] > :nth-child')).length, 3);
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});

test('fragments and assets: text and device pattern.html instantiate with nested slots filled', async () => {
  const o = await open(FOLLOW);
  try {
    const r = await o.page.evaluate(() => {
      window.mm.seek(2.5);
      const media = document.querySelector('[data-scene="one"] [data-slot="media"]');
      const tag = document.querySelector('[data-scene="one"] [data-slot="tag"]');
      const img = media.querySelector('img');
      return {
        device: !!media.querySelector(':scope > .frame[data-device="frame"]'),
        screen: media.querySelector('[data-part="screen"]')?.textContent,
        value: media.querySelector('[data-part="value"]')?.textContent,
        asset: media.dataset.asset, src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth === 8,
        resolved: img.src.endsWith('/fixtures/kit-smoke/follow/assets/img/dot.png'),
        label: tag.querySelector('.label [data-part="text"]')?.textContent, tone: tag.querySelector('.label [data-part="tone"]')?.textContent,
        nested: document.querySelectorAll('[data-slot] [data-slot]').length,
        warnings: window.mm.warnings,
      };
    });
    assert.equal(r.device, true);
    assert.equal(r.screen, 'Screen');
    assert.equal(r.value, '42');
    assert.equal(r.asset, 'assets/img/dot.png');
    assert.equal(r.src, 'assets/img/dot.png');
    assert.ok(r.loaded && r.resolved, 'the picture resolved relative to the piece and loaded before ready');
    assert.equal(r.label, 'Label');
    assert.equal(r.tone, 'warm');
    assert.equal(r.nested, 0, 'nested slots become data-part, so no selector can hit them');
    assert.deepEqual(r.warnings.filter((w) => /did not load|no slot/.test(w)), []);
    // the fragment is restored on every seek: an early seek and back gives the same markup
    const html = (t) => o.page.evaluate((x) => { window.mm.seek(x); return document.querySelector('[data-scene="one"] [data-slot="media"]').innerHTML; }, t);
    const a = await html(2.5);
    await html(0.6);
    assert.equal(await html(2.5), a);
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});

test('overlays: data-mm-overlay nodes and --mm-tx-* properties never outlive their transition', async () => {
  const o = await open(FOLLOW);
  try {
    const state = (t) => o.page.evaluate((x) => {
      window.mm.seek(x);
      return { overlays: document.querySelectorAll('[data-mm-overlay]').length,
        tx: [...document.querySelectorAll('[data-scene]')].filter((s) => /--mm-tx-/.test(s.getAttribute('style') ?? '')).length };
    }, t);
    const inside = await state(4.2);
    assert.equal(inside.overlays, 1, 'one overlay while the cut plays (not one per seek)');
    assert.equal(inside.tx, 2);
    await state(4.3);
    assert.equal((await state(4.25)).overlays, 1);
    assert.deepEqual(await state(6), { overlays: 0, tx: 0 });
    await state(4.2);
    assert.deepEqual(await state(1.0), { overlays: 0, tx: 0 });
  } finally { await o.close(); }
});

test('ctx.unit is the format base size (SPEC §12)', async () => {
  for (const [format, unit] of [['16x9', 136], ['9x16', 168], ['1x1', 152]]) {
    const o = await open(FOLLOW, { format });
    try {
      const p = await probe(o.page, 0.3);
      assert.equal(p.entrance.headline.unit, unit, format);
    } finally { await o.close(); }
  }
});

test('deck: a scene move runs across its presses; every rest is a finished picture', async () => {
  const o = await open(DECK);
  try {
    const p = async (x) => (await probe(o.page, x)).move?.moving;
    assert.equal(await p(1), undefined, 'the moving scene is not on screen at rest 1');
    const r2 = await p(2), r3 = await p(3), r4 = await p(4), mid = await p(3.5);
    assert.deepEqual(r2.params, { k: 'deck' });
    assert.ok(r2.p > 0 && r2.p < r3.p && r3.p < r4.p, `${r2.p} ${r3.p} ${r4.p}`);
    assert.equal(r4.p, 1);
    assert.ok(mid.p > r3.p && mid.p < r4.p);
    // a rest is the same picture however it is reached
    const shot = async (x) => { await o.page.evaluate((y) => window.mm.seek(y), x); return o.page.screenshot({ type: 'png' }); };
    const a = await shot(3);
    await shot(3.7);
    assert.ok((await shot(3)).equals(a));
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});
