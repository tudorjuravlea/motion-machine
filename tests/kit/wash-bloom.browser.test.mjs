// emphasis/wash-bloom: colour blooms open behind a sketched slot's ink once its pen has closed, slot
// after slot in the order the pens drew them, each in the next palette role, and stays: after the
// window entrances/sketch keeps the whole wash. The ink line and the label stay as they were.
// Proved on paper and nocturne: G-BRAND's pixel half is 0 % off at every rest.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { runCheck } from '../../scripts/check.mjs';

const OUT = join(ROOT, 'out', 'wash-bloom-test');
const tile = (slot, at, text, params) => ({ at, slot, fx: 'entrances/sketch', text, emphasis: 'emphasis/wash-bloom', ...(params ? { params } : {}) });
const SCENES = [
  { id: 'bloom', layout: 'layouts/bento-3', duration: 6, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [
      { at: 0.1, slot: 'headline', fx: 'entrances/rise', text: 'Then add colour' },
      tile('tile-1', 0.4, 'Plan the week'), tile('tile-2', 1.0, 'Track the work'), tile('tile-3', 1.6, 'Ship it', { shape: 'pill' }),
    ] },
  { id: 'plain', layout: 'layouts/bento-3', duration: 3, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [
      { at: 0.1, slot: 'headline', fx: 'entrances/rise', text: 'No sketch here' },
      { at: 0.4, slot: 'tile-1', fx: 'entrances/fade', text: 'A plain tile', emphasis: 'emphasis/wash-bloom' },
      tile('tile-2', 0.6, 'Fixed role', { bloom: 'accent' }),
    ] },
];
const story = (kind, scenes) => ({
  id: 'wash-bloom-test', kind, formats: ['16x9', '9x16'], title: 'wash bloom test', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, scenes, cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
});
function piece(name, brand, kind = 'film') {
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  const style = join(OUT, `${brand}.style.json`);
  composeToFile({ brand, motion: 'calm', out: style });
  newPiece({ kind, style, dir });
  const scenes = kind === 'deck' ? SCENES.map(({ duration, ...s }) => ({ ...s, presses: 3, beats: s.beats.map((b, i) => ({ ...b, at: 0, step: i })) })) : SCENES;
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story(kind, scenes), null, 2));
  return dir;
}

let server, browser;
const dirs = {};
before(async () => {
  mkdirSync(OUT, { recursive: true });
  dirs.paper = piece('paper', 'paper');
  dirs.nocturne = piece('nocturne', 'nocturne');
  dirs.deck = piece('deck', 'paper', 'deck');
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const open = (which, format = '16x9') => openPiece(dirs[which], { server, browser, format });
const itemOf = async (o, scene, slot) => (await o.mm.meta()).schedule.items.find((it) => it.scene === scene && !it.parent && it.beat?.slot === slot);
const LOOK = (el) => {
  const g = el.querySelector(':scope > svg.mm-sketch-fill .mm-bloom');
  const pen = el.querySelector(':scope > svg.mm-sketch path.mm-sketch__pen');
  const role = (r) => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.style.fill = `var(--mm-color-${r})`; el.querySelector(':scope > svg') ? el.querySelector(':scope > svg').append(p) : el.append(p); const c = getComputedStyle(p).fill; p.remove(); return c; };
  const label = el.querySelector('[data-text]') ?? el;
  const b = g?.getBBox();
  return {
    svgs: el.querySelectorAll(':scope > svg').length,
    bloom: g ? { paths: [...g.querySelectorAll('path')].map((p) => ({ d: p.getAttribute('d'), fill: getComputedStyle(p).fill, alpha: Number(getComputedStyle(p).fillOpacity) })), area: b.width * b.height } : null,
    pen: pen?.getAttribute('d') ?? null,
    labelAlpha: (() => { const c = getComputedStyle(label).color; const m = /rgba?\(([^)]+)\)/.exec(c) ?? /color\(srgb ([^)]+)\)/.exec(c); const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return v.length > 3 ? v[3] : 1; })(),
    roles: Object.fromEntries(['accent', 'muted', 'line', 'surface'].map((r) => [r, role(r)])),
  };
};
async function look(o, t, scene, slot) {
  await o.mm.seek(t);
  return o.page.evaluate(([sc, sl, src]) => (0, eval)(`(${src})`)(document.querySelector(`[data-scene="${sc}"] [data-slot="${sl}"]`)), [scene, slot, LOOK.toString()]);
}

test('the bloom waits for the pen to close, opens during its window, and then stays whole', async () => {
  const o = await open('paper');
  try {
    const it = await itemOf(o, 'bloom', 'tile-1');
    const e = it.emphasis;
    assert.ok(e && e.start >= it.start + it.d - 1e-6, 'the window opens as the entrance lands');
    assert.equal((await look(o, it.start + 0.5 * it.d, 'bloom', 'tile-1')).bloom, null, 'nothing while the pen draws');
    const early = await look(o, e.start + 0.2 * e.d, 'bloom', 'tile-1');
    const mid = await look(o, e.start + 0.5 * e.d, 'bloom', 'tile-1');
    const end = await look(o, e.start + e.d - 0.01, 'bloom', 'tile-1');
    const rest = await look(o, e.start + e.d + 0.3, 'bloom', 'tile-1');
    assert.ok(early.bloom && mid.bloom && rest.bloom, JSON.stringify({ early: !!early.bloom, mid: !!mid.bloom }));
    assert.ok(early.bloom.area < mid.bloom.area && mid.bloom.area < rest.bloom.area, `it opens: ${early.bloom.area} < ${mid.bloom.area} < ${rest.bloom.area}`);
    const total = (x) => x.bloom.paths.reduce((s, p) => s + p.alpha, 0);
    assert.ok(total(early) < total(rest));
    assert.ok(Math.abs(end.bloom.area - rest.bloom.area) / rest.bloom.area < 0.02, 'the window ends on the wash the sketch keeps');
    assert.deepEqual((await look(o, e.start + e.d + 2, 'bloom', 'tile-1')).bloom, rest.bloom, 'still at rest');
    assert.ok(rest.pen, 'the ink line stays');
    assert.equal(rest.labelAlpha, 1, 'the label stays ink');
    assert.deepEqual((await look(o, e.start + 0.5 * e.d, 'bloom', 'tile-1')).bloom, mid.bloom, 'a seek back draws the same bloom');
  } finally { await o.close(); }
});

test('slot after slot in pen order, each in the next palette role', async () => {
  const o = await open('paper');
  try {
    const items = await Promise.all(['tile-1', 'tile-2', 'tile-3'].map((s) => itemOf(o, 'bloom', s)));
    assert.ok(items[0].emphasis.start < items[1].emphasis.start && items[1].emphasis.start < items[2].emphasis.start);
    const t = items[2].emphasis.start + items[2].emphasis.d + 0.3;
    const looks = [];
    for (const s of ['tile-1', 'tile-2', 'tile-3']) looks.push(await look(o, t, 'bloom', s));
    const roles = looks.map((l) => Object.entries(l.roles).find(([, c]) => c === l.bloom.paths[0].fill)?.[0]);
    assert.deepEqual(roles, ['accent', 'muted', 'line']);
    for (const l of looks) assert.ok(l.bloom.paths.every((p) => p.fill === l.bloom.paths[0].fill), 'one role per slot');
    // a fixed role, and no bloom on a slot that is not a sketch
    const p = await itemOf(o, 'plain', 'tile-2');
    const fixed = await look(o, p.emphasis.start + p.emphasis.d + 0.2, 'plain', 'tile-2');
    assert.equal(fixed.bloom.paths[0].fill, fixed.roles.accent);
    const q = await itemOf(o, 'plain', 'tile-1');
    for (const f of [0.5, 1.2]) assert.equal((await look(o, q.emphasis.start + f * q.emphasis.d, 'plain', 'tile-1')).svgs, 0, 'a plain tile gets no bloom');
  } finally { await o.close(); }
});

test('in a deck every rest shows the whole bloom, the same press after press', async () => {
  const o = await openPiece(dirs.deck, { server, browser, format: '16x9' });
  try {
    const a = await look(o, 3, 'bloom', 'tile-1'), b = await look(o, 3, 'bloom', 'tile-3');
    assert.ok(a.bloom && b.bloom, 'whole at the scene\'s last rest');
    const p2 = await look(o, 2, 'bloom', 'tile-1');
    assert.deepEqual(p2.bloom, a.bloom, 'press 2 and press 3 show the same bloom on tile-1');
    assert.equal((await framePng(o.page, 3)).equals(await framePng(o.page, 3)), true);
  } finally { await o.close(); }
});

test('the bloom is palette: G-BRAND passes with 0 % off on paper and nocturne', async () => {
  for (const brand of ['paper', 'nocturne']) {
    const r = await runCheck(dirs[brand], { format: '16x9', only: ['G-BRAND'], server, browser });
    const row = r.rules.find((x) => x.id === 'G-BRAND');
    assert.equal(row.status, 'PASS', `${brand}: ${JSON.stringify(row)}`);
    assert.equal(row.evidence.measured, '0 %', `${brand}: ${row.evidence.measured}`);
  }
});
