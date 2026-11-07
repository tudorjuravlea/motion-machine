// entrances/sketch's opt-in voices: `fill` (none, a watercolour wash or a hatch in one palette role,
// under the label) and `pen` (plain, or a pencil, marker or charcoal preset whose second pass is a
// thinner, fainter ghost). Without them the sketch is the one it always was (one path, no fill).
// Proved on two brands of opposite polarity (paper, nocturne): G-BRAND's pixel half is 0 % off.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { runCheck } from '../../scripts/check.mjs';

const OUT = join(ROOT, 'out', 'sketch-fill-test');
const tile = (slot, at, text, params) => ({ at, slot, fx: 'entrances/sketch', text, ...(params ? { params } : {}) });
const scene = (id, p1, p2, p3) => ({
  id, layout: 'layouts/bento-3', duration: 4, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
  beats: [
    { at: 0.1, slot: 'headline', fx: 'entrances/rise', text: 'Drawn by hand' },
    tile('tile-1', 0.4, 'Plan the week', p1), tile('tile-2', 0.9, 'Track the work', p2), tile('tile-3', 1.4, 'Ship it', p3),
  ],
});
const SCENES = [
  scene('plain'),
  scene('fills', { fill: 'wash' }, { fill: 'hatch', tint: 'ink' }, { fill: 'wash', tint: 'muted', shape: 'pill' }),
  scene('pens', { pen: 'pencil' }, { pen: 'marker', fill: 'wash' }, { pen: 'charcoal', fill: 'hatch' }),
];
const story = (kind, scenes) => ({
  id: 'sketch-fill-test', kind, formats: ['16x9', '9x16'], title: 'sketch fill test', language: 'en', facts: [],
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
  const pen = el.querySelector(':scope > svg.mm-sketch'), fill = el.querySelector(':scope > svg.mm-sketch-fill');
  const paths = pen ? [...pen.querySelectorAll('path')] : [];
  const fp = fill ? [...fill.querySelectorAll('path')] : [];
  const cs = (n) => getComputedStyle(n);
  const role = (r) => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.style.fill = `var(--mm-color-${r})`; (pen ?? el).append(p); const c = getComputedStyle(p).fill; p.remove(); return c; };
  return {
    pens: paths.map((p) => ({ cls: p.getAttribute('class'), width: parseFloat(cs(p).strokeWidth), opacity: Number(cs(p).opacity) * Number(cs(p).strokeOpacity), dash: p.style.strokeDashoffset, d: p.getAttribute('d') })),
    fill: fill ? { z: cs(fill).zIndex, isolation: cs(el).isolation, opacity: fill.style.opacity, kind: fill.getAttribute('data-fill'),
      paths: fp.map((p) => ({ fill: cs(p).fill, fillOpacity: Number(cs(p).fillOpacity), stroke: cs(p).stroke, clip: p.getAttribute('clip-path'), dash: p.style.strokeDashoffset })) } : null,
    clips: fill ? fill.querySelectorAll('clipPath').length : 0,
    roles: Object.fromEntries(['accent', 'ink', 'muted'].map((r) => [r, role(r)])),
  };
};
async function look(o, t, scene, slot) {
  await o.mm.seek(t);
  return o.page.evaluate(([sc, sl, src]) => (0, eval)(`(${src})`)(document.querySelector(`[data-scene="${sc}"] [data-slot="${sl}"]`)), [scene, slot, LOOK.toString()]);
}

test('sketch without the new params draws one pen path and no fill', async () => {
  const o = await open('paper');
  try {
    const it = await itemOf(o, 'plain', 'tile-1');
    const a = await look(o, it.start + it.d + 0.2, 'plain', 'tile-1');
    assert.equal(a.pens.length, 1);
    assert.equal(a.pens[0].cls, 'mm-sketch__pen');
    assert.equal(a.fill, null);
  } finally { await o.close(); }
});

test('fill: wash sits under the label in its palette role, layers fainter outward; it waits for the pen, then stays', async () => {
  const o = await open('paper');
  try {
    const it = await itemOf(o, 'fills', 'tile-1');
    const mid = await look(o, it.start + 0.3 * it.d, 'fills', 'tile-1');
    assert.ok(!mid.fill || Number(mid.fill.opacity) === 0, `the wash waits for the outline: ${JSON.stringify(mid.fill)}`);
    const rest = await look(o, it.start + it.d + 0.2, 'fills', 'tile-1');
    assert.equal(rest.fill.kind, 'wash');
    assert.equal(rest.fill.z, '-1', 'under the label');
    assert.equal(rest.fill.isolation, 'isolate', 'the slot keeps the wash above the scene');
    assert.ok(rest.fill.opacity === '' || Number(rest.fill.opacity) === 1);
    assert.ok(rest.fill.paths.length >= 2);
    for (const p of rest.fill.paths) assert.equal(p.fill, rest.roles.accent, 'accent by default');
    for (let i = 1; i < rest.fill.paths.length; i++) assert.ok(rest.fill.paths[i].fillOpacity < rest.fill.paths[i - 1].fillOpacity);
    const again = await look(o, it.start + it.d + 0.2, 'fills', 'tile-1');
    assert.deepEqual(again.fill, rest.fill, 'the same at every seek');
    const pill = await look(o, it.start + it.d + 2, 'fills', 'tile-3');
    for (const p of pill.fill.paths) assert.equal(p.fill, pill.roles.muted, 'tint picks the role');
  } finally { await o.close(); }
});

test('fill: hatch is lines in its role clipped to the outline, drawn in after the pen, whole at rest', async () => {
  const o = await open('paper');
  try {
    const it = await itemOf(o, 'fills', 'tile-2');
    const rest = await look(o, it.start + it.d + 0.2, 'fills', 'tile-2');
    assert.equal(rest.fill.kind, 'hatch');
    assert.equal(rest.clips, 1);
    const h = rest.fill.paths.find((p) => p.clip);
    assert.ok(h && /^url\(#/.test(h.clip), JSON.stringify(rest.fill));
    assert.equal(h.stroke, rest.roles.ink);
    assert.equal(h.dash, '', 'whole at rest');
    const mid = await look(o, it.start + 0.85 * it.d, 'fills', 'tile-2');
    const m = mid.fill.paths.find((p) => p.clip);
    assert.ok(Number(m.dash) > 0 && Number(m.dash) < 1, `part-way: ${m.dash}`);
  } finally { await o.close(); }
});

test('pen presets: a ghost pass thinner and fainter than the line; the marker wider than the pencil; charcoal\'s ghost wilder', async () => {
  const o = await open('paper');
  try {
    const at = async (slot) => { const it = await itemOf(o, 'pens', slot); return look(o, it.start + it.d + 0.2, 'pens', slot); };
    const plain = await look(o, (await itemOf(o, 'plain', 'tile-1')).start + 1.5, 'plain', 'tile-1');
    const pencil = await at('tile-1'), marker = await at('tile-2'), charcoal = await at('tile-3');
    for (const [name, p] of Object.entries({ pencil, marker, charcoal })) {
      assert.deepEqual(p.pens.map((x) => x.cls), ['mm-sketch__pen', 'mm-sketch__ghost'], name);
      assert.ok(p.pens[1].width < p.pens[0].width, `${name}: ghost thinner`);
      assert.ok(p.pens[1].opacity < 1 && p.pens[0].opacity === 1, `${name}: ghost fainter`);
      assert.equal(p.pens[0].dash, '', `${name}: whole at rest`);
    }
    assert.ok(marker.pens[0].width > charcoal.pens[0].width && charcoal.pens[0].width > pencil.pens[0].width, 'marker, charcoal, pencil');
    assert.ok(Math.abs(pencil.pens[0].width - plain.pens[0].width * 0.8) < 0.05, `pencil is 0.8 of the plain pen: ${pencil.pens[0].width} vs ${plain.pens[0].width}`);
    assert.equal(marker.fill.kind, 'wash');
    assert.equal(charcoal.fill.kind, 'hatch');
  } finally { await o.close(); }
});

test('in a deck the voices never boil: every rest is the same picture whichever press', async () => {
  const o = await openPiece(dirs.deck, { server, browser, format: '16x9' });
  try {
    const presses = (await o.mm.meta()).presses;
    const last = await framePng(o.page, presses);
    // a later press of the same scene has nothing new for the pens scene's tiles; compare the tiles' paths across two looks
    const a = await look(o, presses, 'pens', 'tile-3'), b = await look(o, presses, 'pens', 'tile-3');
    assert.deepEqual(a.pens, b.pens);
    assert.ok(last.length > 0);
    const p1 = await look(o, presses - 1, 'pens', 'tile-1'), p2 = await look(o, presses, 'pens', 'tile-1');
    assert.equal(p2.pens.length, 2, 'the pencil draws its ghost in a deck too');
    assert.deepEqual(p1.pens.map((x) => x.d), p2.pens.map((x) => x.d), 'press after press, the same stroke');
  } finally { await o.close(); }
});

test('the washes and hatches are palette: G-BRAND passes with 0 % off on paper and nocturne', async () => {
  for (const brand of ['paper', 'nocturne']) {
    const r = await runCheck(dirs[brand], { format: '16x9', only: ['G-BRAND'], server, browser });
    const row = r.rules.find((x) => x.id === 'G-BRAND');
    assert.equal(row.status, 'PASS', `${brand}: ${JSON.stringify(row)}`);
    assert.equal(row.evidence.measured, '0 %', `${brand}: ${row.evidence.measured}`);
  }
});

test('a hatch keeps clear of the label: its clip has a hole round the words, so W-CONTRAST passes even with an ink hatch on a dark brand', async () => {
  const o = await open('nocturne');
  try {
    const it = await itemOf(o, 'fills', 'tile-2');
    await o.mm.seek(it.start + it.d + 0.2);
    const clip = await o.page.evaluate(() => {
      const el = document.querySelector('[data-scene="fills"] [data-slot="tile-2"]');
      const cp = el.querySelector('svg.mm-sketch-fill clipPath path');
      return { subpaths: (cp.getAttribute('d').match(/M/g) ?? []).length, rule: cp.getAttribute('clip-rule') };
    });
    assert.deepEqual(clip, { subpaths: 2, rule: 'evenodd' });
  } finally { await o.close(); }
  const r = await runCheck(dirs.nocturne, { format: '16x9', only: ['W-CONTRAST'], server, browser });
  const row = r.rules.find((x) => x.id === 'W-CONTRAST');
  assert.equal(row.status, 'PASS', JSON.stringify(row.evidence).slice(0, 400));
});
