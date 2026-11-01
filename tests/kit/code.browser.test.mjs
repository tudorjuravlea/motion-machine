// text/code in a page: the morph windows as drawn (old text out over the first 0.4, new in over the last 0.4),
// kept tokens that stay, a selection that dims to 0.2, a call-out box on the exact range, syntax colours
// that resolve only to palette roles, tabs expanded, the block inside the frame at every format, and the
// same pixels at the same instants in any seek order.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { buildModel, stepTimes } from '../../runtime/kit/code.js';
import { ease } from '../../runtime/kit/ease.js';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = (format = '16x9', query = {}) => openPiece(PAGE, { server, browser, format, query: { story: 'code', preset: 'editorial', ...query } });
const STORY = JSON.parse(readFileSync(join(PAGE, 'code.json'), 'utf8'));
const STYLE = JSON.parse(readFileSync(join(ROOT, 'styles/presets/editorial.json'), 'utf8'));
const STANDARD = STYLE.motion.durations.standard / 1000;
const SLOT = (scene) => `[data-scene="${scene}"] [data-slot="stage"]`;

// the beat's own timeline, as the pattern computes it: the same model, the same intro and morph
const timeline = async (o, scene) => {
  const it = (await o.mm.meta()).schedule.items.find((x) => x.scene === scene);
  const beat = STORY.scenes.find((s) => s.id === scene).beats[0];
  const model = buildModel(beat.text, beat.params.steps ?? '', { lang: beat.params.lang ?? 'js', tab: 2 });
  const times = stepTimes(model, it.d, { intro: Math.min(STANDARD, it.d * 0.3), morph: STANDARD });
  return { it, model, times };
};
const spans = (o, scene) => o.page.evaluate((s) => [...document.querySelectorAll(`${s} .mm-code__t`)].map((e) => ({ t: e.textContent, o: e.style.opacity === '' ? 1 : Number(e.style.opacity), x: e.getBoundingClientRect().left, r: e.getBoundingClientRect().right, y: e.getBoundingClientRect().top, c: e.style.color })), SLOT(scene));

test('at the end of the beat every token of the last code is drawn once, and it rests', async () => {
  const o = await open();
  try {
    const { it, model } = await timeline(o, 'api');
    await o.mm.seek(it.start + it.d + 0.1);
    const s = await spans(o, 'api');
    const ink = s.map((x) => x.t).join('').replace(/\s/g, '');
    assert.equal(ink, model.states.at(-1).code.replace(/\s/g, ''));
    assert.ok(s.every((x) => x.o === 1), 'nothing is faded or dimmed at rest');
    assert.equal(await o.page.evaluate((sel) => document.querySelectorAll(`${sel} .mm-code__box`).length, SLOT('api')), 0);
  } finally { await o.close(); }
});

// the raw share of a morph whose eased value (the style's move curve) is q, so a window is read at the instant it is meant for
const rawFor = (q) => { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (ease('move', m, STYLE) < q) lo = m; else hi = m; } return (lo + hi) / 2; };
const nowShowing = (o, scene, text) => o.page.evaluate(([s, t]) => [...document.querySelectorAll(`${s} .mm-code__t`)].filter((e) => e.textContent === t).map((e) => (e.style.opacity === '' ? 1 : Number(e.style.opacity))), [SLOT(scene), text]);

test('a replaced token fades out over the first 0.4 of the morph, is gone from 0.4 to 0.6, and the new one fades in over the last 0.4', async () => {
  const o = await open();
  try {
    const { it, times } = await timeline(o, 'rows');
    const t = times[1];   // replace "return sum(items)" => "return round(acc)"
    const at = async (q) => { await o.mm.seek(it.start + t.start + t.len * rawFor(q)); };
    const alpha = async (text) => (await nowShowing(o, 'rows', text)).reduce((m, x) => Math.max(m, x), 0);
    const near = (v, want) => Math.abs(v - want) < 0.02;
    await at(0.02); assert.ok(near(await alpha('sum'), 0.95), 'sum' + await alpha('sum'));
    await at(0.2); assert.ok(near(await alpha('sum'), 0.5), 'sum at 0.2: ' + await alpha('sum'));
    assert.equal(await alpha('round'), 0, 'the new text is not there yet');
    await at(0.4); assert.ok(near(await alpha('sum'), 0));
    await at(0.5); assert.equal(await alpha('sum'), 0); assert.equal(await alpha('round'), 0);
    await at(0.6); assert.ok(near(await alpha('round'), 0));
    await at(0.8); assert.ok(near(await alpha('round'), 0.5), 'total at 0.8: ' + await alpha('round'));
    assert.equal(await alpha('sum'), 0);
    await o.mm.seek(it.start + t.start + t.len + 0.01);
    assert.equal(await alpha('round'), 1); assert.equal(await alpha('sum'), 0);
    // what the edit kept is never faded
    await at(0.5); assert.equal(await alpha('return'), 1);
  } finally { await o.close(); }
});

test('an inserted token is absent until the last 0.4 of the morph and a kept one slides on the cursor', async () => {
  const o = await open();
  try {
    const { it, times } = await timeline(o, 'api');
    const t = times[2];   // get(url); => get(url, {...}); an insert
    const alpha = async (text) => (await nowShowing(o, 'api', text)).reduce((m, x) => Math.max(m, x), 0);
    await o.mm.seek(it.start + t.start + t.len * rawFor(0.5));
    assert.equal(await alpha('retry'), 0);
    assert.equal(await alpha('get'), 1);
    await o.mm.seek(it.start + t.start + t.len * rawFor(0.8));
    assert.ok(Math.abs((await alpha('retry')) - 0.5) < 0.02);
    // the closing parenthesis was pushed down two rows by the insert: it slides, it is not redrawn
    const col = async (q) => { await o.mm.seek(it.start + t.start + t.len * rawFor(q)); const s = await spans(o, 'api'); return s.find((x) => x.t === ')').y; };
    const x0 = await col(0.01), x5 = await col(0.5), x1 = await col(0.99);
    assert.ok(x0 < x5 && x5 < x1, `${x0} < ${x5} < ${x1}`);
  } finally { await o.close(); }
});

test('a select step dims what it leaves out to 0.2 and keeps the range at 1', async () => {
  const o = await open();
  try {
    const { it, times } = await timeline(o, 'api');
    const t = times[0];   // select "fetch(url)"
    await o.mm.seek(it.start + t.start + t.len + 0.01);
    const s = await spans(o, 'api');
    const alpha = (w) => s.find((x) => x.t === w).o;
    assert.ok(Math.abs(alpha('res') - 0.2) < 0.01, `res ${alpha('res')}`);
    assert.ok(Math.abs(alpha('json') - 0.2) < 0.01);
    assert.equal(alpha('get'), 1);
    assert.equal(alpha('url'), 1);
  } finally { await o.close(); }
});

test('a call puts a box on the exact range, from its first character to its last, and shows its label', async () => {
  const o = await open();
  try {
    const { it, times } = await timeline(o, 'api');
    const t = times[4];   // call "retry: 3" | Retries three times
    await o.mm.seek(it.start + t.start + t.len + 0.01);
    const r = await o.page.evaluate((sel) => {
      const root = document.querySelector(sel);
      const box = root.querySelector('.mm-code__box').getBoundingClientRect();
      const ts = [...root.querySelectorAll('.mm-code__t')];
      const first = ts.find((e) => e.textContent === 'retry').getBoundingClientRect();
      const last = ts.filter((e) => e.textContent === '3').at(-1).getBoundingClientRect();
      return { box: [box.left, box.right, box.top, box.bottom], first: [first.left, first.top, first.bottom], last: last.right, label: root.querySelector('.mm-code__label')?.textContent };
    }, SLOT('api'));
    assert.ok(Math.abs(r.box[0] - r.first[0]) < 1.5, `left edge ${r.box[0]} vs ${r.first[0]}`);
    assert.ok(Math.abs(r.box[1] - r.last) < 1.5, `right edge ${r.box[1]} vs ${r.last}`);
    assert.ok(r.box[2] <= r.first[1] + 1 && r.box[3] >= r.first[2] - 1, 'the box is on the row of the range');
    assert.equal(r.label, 'Retries three times');
  } finally { await o.close(); }
});

test('syntax colours are palette roles only: a role or a tint of one, and a spec that is not a role falls back', async () => {
  const o = await open('16x9');
  try {
    const { it } = await timeline(o, 'brand');
    await o.mm.seek(it.start + it.d + 0.1);
    const r = await o.page.evaluate((sel) => {
      const root = document.querySelector(sel);
      const ts = [...root.querySelectorAll('.mm-code__t')];
      const wrap = root.querySelector('.mm-code');
      const colour = (c) => { const d = document.createElement('i'); d.style.color = c; wrap.append(d); const v = getComputedStyle(d).color; d.remove(); return v; };
      return { inline: ts.map((e) => ({ t: e.textContent, c: e.style.color })), computed: ts.map((e) => ({ t: e.textContent, c: getComputedStyle(e).color })), ink: colour('var(--mm-color-ink)'), muted: colour('var(--mm-color-muted)'), accent: colour('var(--mm-color-accent)') };
    }, SLOT('brand'));
    for (const x of r.inline) assert.match(x.c, /^(var\(--c-(ink|muted|accent|line)\)|color-mix\(in srgb, var\(--c-(ink|muted|accent|line)\) [\d.]+%, transparent\))$/, `${x.t}: ${x.c}`);
    const by = Object.fromEntries(r.computed.map((x) => [x.t, x.c]));
    assert.equal(by.const, r.muted, 'the brand set keywords to muted');
    assert.notEqual(by.true, r.muted);
    // the specs "#ff0000" and "red" are not roles: punctuation and strings keep the library's roles, no red anywhere
    for (const x of r.computed) { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(x.c); if (m) assert.ok(!(Number(m[1]) > 200 && Number(m[2]) < 60 && Number(m[3]) < 60), `${x.t} is red: ${x.c}`); }
  } finally { await o.close(); }
});

test('tabs are expanded: no tab reaches the page, and indented code keeps its columns', async () => {
  const o = await open();
  try {
    const { it } = await timeline(o, 'rows');
    await o.mm.seek(it.start + it.d + 0.1);
    const s = await spans(o, 'rows');
    assert.ok(s.every((x) => !x.t.includes('\t')));
    const ys = [...new Set(s.map((x) => Math.round(x.y)))];
    assert.ok(ys.length >= 3, 'the inserted lines moved the rest down');
  } finally { await o.close(); }
});

for (const format of ['16x9', '9x16', '1x1']) {
  test(`${format}: the block is inside the safe area at every instant`, async () => {
    const o = await open(format);
    try {
      const { it } = await timeline(o, 'api');
      const sa = await o.page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { m: parseFloat(cs.getPropertyValue('--mm-safe')), w: parseFloat(cs.getPropertyValue('--mm-frame-w')), h: parseFloat(cs.getPropertyValue('--mm-frame-h')) }; });
      for (const k of [0.1, 0.35, 0.6, 0.9, 1.05]) {
        await o.mm.seek(it.start + it.d * k);
        const b = await o.page.evaluate((sel) => { const r = document.querySelector(`${sel} .mm-code`).getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }, SLOT('api'));
        assert.ok(b[0] >= sa.m - 1 && b[2] <= sa.w - sa.m + 1 && b[1] >= sa.m - 1 && b[3] <= sa.h - sa.m + 1, `${format} at ${k}: ${b} vs safe ${sa.m}`);
      }
    } finally { await o.close(); }
  });
}

test('the same instants give the same pixels in forward and reverse seek order', async () => {
  const o = await open();
  try {
    const { it, times } = await timeline(o, 'api');
    const us = [0.2, times[0].start + times[0].len * 0.5, times[2].start + times[2].len * 0.3, times[2].start + times[2].len * 0.8, times[4].start + times[4].len + 0.2];
    const shot = async (u) => { await o.mm.seek(it.start + u); return (await o.page.screenshot({ type: 'png' })).toString('base64'); };
    const fwd = []; for (const u of us) fwd.push(await shot(u));
    const rev = []; for (const u of [...us].reverse()) rev.push(await shot(u));
    assert.deepEqual(rev.reverse(), fwd);
  } finally { await o.close(); }
});

test('a brand sets the roles once, in style.patterns, and every code beat takes them', async () => {
  const o = await open('16x9', { patternsJson: JSON.stringify({ 'text/code': { keyword: 'muted', frame: 'bare' } }) });
  try {
    const { it } = await timeline(o, 'api');
    await o.mm.seek(it.start + it.d + 0.1);
    const r = await o.page.evaluate((sel) => {
      const root = document.querySelector(sel);
      const kw = [...root.querySelectorAll('.mm-code__t')].find((e) => e.textContent === 'const');
      const probe = (c) => { const d = document.createElement('i'); d.style.color = c; root.append(d); const v = getComputedStyle(d).color; d.remove(); return v; };
      return { kw: getComputedStyle(kw).color, muted: probe('var(--mm-color-muted)'), accent: probe('var(--mm-color-accent)'), bare: root.querySelector('.mm-code').classList.contains('mm-code--bare') };
    }, SLOT('api'));
    assert.equal(r.kw, r.muted, 'keywords took the brand\'s role');
    assert.notEqual(r.kw, r.accent);
    assert.ok(r.bare, 'and its frame');
  } finally { await o.close(); }
});
