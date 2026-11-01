// text/scramble in a page: the same pixels at the same instants in any seek order, glyphs that hold for a
// 20 Hz step, a pool the brand names, noise and resolved glyphs in palette roles, a version edit that
// steps only what changed, and the plain text at rest.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (query = {}) => openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'scramble', preset: 'editorial', ...query } });
const item = async (o, scene) => (await o.mm.meta()).schedule.items.find((x) => x.scene === scene);
const SLOT = (scene) => `[data-scene="${scene}"] [data-slot="headline"]`;
const at = async (o, it, u) => { await o.mm.seek(it.start + u); };
const text = (o, scene) => o.page.evaluate((s) => document.querySelector(s).textContent, SLOT(scene));
const cells = (o, scene) => o.page.evaluate((s) => [...document.querySelectorAll(`${s} .mm-scramble__c`)].map((c) => ({ t: c.textContent, color: getComputedStyle(c).color })), SLOT(scene));

test('at rest the plain text is back and nothing of the effect is left in the slot', async () => {
  const o = await open();
  try {
    for (const [scene, want] of [['decode', 'Decoded from noise'], ['version', 'Release v1.3'], ['shrink', 'Simple']]) {
      const it = await item(o, scene);
      await at(o, it, it.d + 0.2);
      assert.equal(await o.page.evaluate((s) => document.querySelector(s).innerHTML, SLOT(scene)), want);
    }
  } finally { await o.close(); }
});

test('the same instants give the same pixels in forward and reverse seek order', async () => {
  const o = await open();
  try {
    const it = await item(o, 'decode');
    const us = [0.05, 0.4, 0.9, 1.3, 1.6];
    const shot = async (u) => { await at(o, it, u); return (await o.page.screenshot({ type: 'png' })).toString('base64'); };
    const fwd = []; for (const u of us) fwd.push(await shot(u));
    const rev = []; for (const u of [...us].reverse()) rev.push(await shot(u));
    assert.deepEqual(rev.reverse(), fwd);
  } finally { await o.close(); }
});

test('glyphs hold still for one 20 Hz step and change at the next', async () => {
  const o = await open();
  try {
    const it = await item(o, 'decode');
    const glyphs = async (u) => { await at(o, it, u); return (await cells(o, 'decode')).map((c) => c.t).join(''); };
    // inside the entrance (2 s) steps are 0.05 s: 0.61 and 0.64 share step 12, 0.66 is step 13
    const a = await glyphs(0.61), b = await glyphs(0.64), c = await glyphs(0.66);
    assert.equal(a, b);
    assert.notEqual(b, c);
  } finally { await o.close(); }
});

test('noise glyphs are in the muted role and the glyphs that settled keep the slot colour', async () => {
  const o = await open();
  try {
    const it = await item(o, 'decode');
    await at(o, it, 0.8);
    const roles = await o.page.evaluate(() => { const role = (r) => { const d = document.createElement('i'); d.style.color = `var(--mm-color-${r})`; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; }; return { muted: role('muted'), ink: role('ink') }; });
    const cs = await cells(o, 'decode');
    const noisy = cs.filter((c) => c.color === roles.muted);
    const settled = cs.filter((c) => c.color === roles.ink);
    assert.ok(noisy.length >= 2 && settled.length >= 2, `${noisy.length} muted, ${settled.length} ink of ${cs.length}`);
    assert.equal(noisy.length + settled.length, cs.length, 'every glyph is one of the two roles');
  } finally { await o.close(); }
});

test('a brand pool is the only noise: braille glyphs and nothing else', async () => {
  const o = await open();
  try {
    const it = await item(o, 'braille');
    await at(o, it, 0.5);
    const final = 'Braille noise';
    const cs = await cells(o, 'braille');
    const noisy = cs.filter((c, i) => c.t !== final.replace(' ', '')[i]);
    assert.ok(noisy.length >= 3);
    assert.ok(noisy.every((c) => /^[⠀-⣿]$/u.test(c.t)), noisy.map((c) => c.t).join(''));
  } finally { await o.close(); }
});

test('a version edit steps only the changed glyphs: "Release v1.2" to "v1.3"', async () => {
  const o = await open();
  try {
    const it = await item(o, 'version');
    for (const u of [0.05, 0.5, 0.9, 1.3, 1.6]) {
      await at(o, it, u);
      const t = await text(o, 'version');
      assert.ok(t.startsWith('Release v1.'), `${u}: ${t}`);
      assert.equal(t.length, 'Release v1.3'.length);
    }
    await at(o, it, 0);
    assert.equal(await text(o, 'version'), 'Release v1.2');
  } finally { await o.close(); }
});

test('with no noise a value steps from its old glyph to its new one and nothing else shows', async () => {
  const o = await open();
  try {
    const it = await item(o, 'steps');
    const seen = new Set();
    for (let k = 0; k <= 24; k++) { await at(o, it, (k / 24) * it.d * 0.99); seen.add(await text(o, 'steps')); }
    for (const t of seen) assert.match(t, /^Uptime 99\.[59]%$/, t);
    assert.ok(seen.size >= 2);
  } finally { await o.close(); }
});

test('a text that shrinks gets shorter while it decodes and ends at its own length', async () => {
  const o = await open();
  try {
    const it = await item(o, 'shrink');
    const lens = [];
    for (const k of [0.01, 0.3, 0.5, 0.7, 0.9]) { await at(o, it, it.d * k); lens.push((await text(o, 'shrink')).length); }
    assert.equal(lens[0], 'Lemon Banana'.length);
    assert.ok(lens.every((n, i) => i === 0 || n <= lens[i - 1]), lens.join());
    assert.ok(lens.at(-1) <= 12 && lens.at(-1) >= 6);
  } finally { await o.close(); }
});
