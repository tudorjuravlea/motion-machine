// The openers and effects in a real page (their demo stories, composed with paper and nocturne):
// - transitions/beam: every variant draws nothing at p = 0, hands the frame back exactly at p = 1
//   (no overlay, no clip, no hidden scene), differs from both scenes between, and draws the same
//   pixels forward and in reverse; a brand's `patterns` choose the variant, and a scene's cutParams
//   win over the brand;
// - entrances/power-on: held steps (two instants in one step are the same picture), nothing left at
//   rest, a brand that turns the split and the flicker off;
// - text/cross-out: every claim struck and dimmed and the survivor landed at rest, strokes drawn
//   part-way in between, the stroke style a brand knob;
// - text/verdict: no stamp before the landing, the stamp's own look at rest (its stylesheet reaches
//   the winner), the others dimmed, a brand that picks the winner and the stamp's ink;
// - emphasis/countdown-clock: a clock and stripes only while the window runs, nothing at rest;
// - the gate: G-BRAND, G-LEGIBLE, G-REST, G-TIME and G-EDGE pass on every demo on both brands.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { runCheck } from '../../scripts/check.mjs';

const OUT = join(ROOT, 'out', 'openers-effects-test');
const demo = (ref) => JSON.parse(readFileSync(join(ROOT, 'patterns', ref, 'demo/story.json'), 'utf8'));
let server, browser;
const styles = {}, dirs = {};

function piece(name, brand, story, patterns) {
  const dir = join(OUT, name);
  const key = `${brand}${patterns ? `-${name}` : ''}`;
  if (!styles[key]) {
    const file = join(OUT, `${key}.style.json`);
    composeToFile({ brand, motion: 'calm', out: file });
    if (patterns) { const s = JSON.parse(readFileSync(file, 'utf8')); s.patterns = patterns; writeFileSync(file, JSON.stringify(s, null, 2)); }
    styles[key] = file;
  }
  newPiece({ kind: 'film', style: styles[key], dir });
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
  return dir;
}

before(async () => {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  server = await serveRoot(ROOT); browser = await launchBrowser();
  dirs.beam = piece('beam', 'paper', demo('transitions/beam'));
  dirs.beamBrand = piece('beam-brand', 'paper', (() => { const s = demo('transitions/beam'); s.scenes = s.scenes.slice(0, 3); delete s.scenes[1].cutParams; return s; })(), { 'transitions/beam': { variant: 'portal', light: 'ink' } });
  dirs.power = piece('power', 'paper', demo('entrances/power-on'));
  dirs.powerBrand = piece('power-brand', 'paper', demo('entrances/power-on'), { 'entrances/power-on': { split: 0, flicker: 0 } });
  dirs.cross = piece('cross', 'paper', demo('text/cross-out'));
  dirs.crossBrand = piece('cross-brand', 'paper', demo('text/cross-out'), { 'text/cross-out': { stroke: 'diagonal', tone: 'ink' } });
  dirs.verdict = piece('verdict', 'paper', demo('text/verdict'));
  dirs.verdictBrand = piece('verdict-brand', 'paper', (() => { const s = demo('text/verdict'); delete s.scenes[0].beats[1].params; return s; })(), { 'text/verdict': { winner: 1, tone: 'ink', tilt: 'none' } });
  dirs.clock = piece('clock', 'paper', demo('emphasis/countdown-clock'));
  dirs.clockBrand = piece('clock-brand', 'paper', demo('emphasis/countdown-clock'), { 'emphasis/countdown-clock': { stripes: false, place: 'below' } });
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const open = (which, format = '16x9') => openPiece(dirs[which], { server, browser, format });
const items = async (o) => (await o.mm.meta()).schedule.items.filter((it) => !it.parent);
const slotItem = async (o, scene, slot) => (await items(o)).find((it) => it.scene === scene && it.beat?.slot === slot);

// ---- transitions/beam ----

const sceneStyles = (page) => page.evaluate(() => [...document.querySelectorAll('.mm-scene')].map((s) => s.getAttribute('style') ?? ''));

for (const [i, variant] of [[1, 'beam'], [2, 'curtain'], [3, 'portal'], [4, 'streak']]) {
  test(`beam · ${variant}: nothing at p = 0, the frame handed back at p = 1, light between, the same pixels in any order`, async () => {
    const o = await open('beam');
    try {
      const sc = (await o.mm.meta()).schedule.scenes[i];
      const start = sc.start, d = sc.cut.d;
      assert.ok(d > 0.5, `the cut takes time (${d} s)`);
      const before = await framePng(o.page, start - 0.1), at0 = await framePng(o.page, start);
      assert.ok(before.equals(at0), 'p = 0 draws the outgoing scene alone: no light yet');
      const rest = await framePng(o.page, start + d + 0.5), at1 = await framePng(o.page, start + d);
      assert.ok(rest.equals(at1), 'p = 1 is the incoming scene as laid out');
      assert.equal(await o.page.evaluate(() => document.querySelectorAll('[data-mm-overlay]').length), 0, 'no overlay at rest');
      assert.ok((await sceneStyles(o.page)).every((s) => !/clip-path/.test(s)), 'no clip left on a section');
      const mids = [0.25, 0.5, 0.75].map((f) => start + f * d);
      const forward = [];
      for (const t of mids) forward.push(await framePng(o.page, t));
      assert.ok(forward.every((f) => !f.equals(before) && !f.equals(rest)), 'light between: no mid frame is either scene');
      const reverse = [];
      for (const t of [...mids].reverse()) reverse.push(await framePng(o.page, t));
      reverse.reverse();
      forward.forEach((f, k) => assert.ok(f.equals(reverse[k]), `${variant} at ${mids[k]}: forward and reverse agree`));
      for (const t of mids) {
        await o.mm.seek(t);
        const n = await o.page.evaluate(() => document.querySelectorAll('[data-mm-overlay]').length);
        assert.ok(n <= 1, `${variant}: at most one overlay (${n})`);
      }
    } finally { await o.close(); }
  });
}

test('beam: no scene is ever drawn part-transparent, so no type is double-exposed', async () => {
  const o = await open('beam');
  try {
    const sc = (await o.mm.meta()).schedule.scenes;
    for (const i of [1, 2, 3, 4]) for (let k = 1; k < 10; k++) {
      await o.mm.seek(sc[i].start + (k / 10) * sc[i].cut.d);
      const bad = await o.page.evaluate(() => [...document.querySelectorAll('.mm-scene')].filter((s) => { const op = getComputedStyle(s).opacity; return op !== '1' && op !== '0'; }).length);
      assert.equal(bad, 0, `cut ${i} at ${k / 10}`);
    }
  } finally { await o.close(); }
});

test('beam: a brand\'s `patterns` choose the variant and the light; a scene\'s cutParams win over the brand', async () => {
  const o = await open('beamBrand');
  try {
    const sc = (await o.mm.meta()).schedule.scenes;
    await o.mm.seek(sc[1].start + 0.5 * sc[1].cut.d);
    assert.equal(await o.page.evaluate(() => document.querySelector('[data-mm-overlay]').className), 'mm-tx-beam mm-tx-beam--portal', 'the brand\'s variant');
    assert.match(await o.page.evaluate(() => document.querySelector('[data-mm-overlay]').firstElementChild.style.cssText), /--mm-color-ink/, 'the brand\'s light role');
    await o.mm.seek(sc[2].start + 0.5 * sc[2].cut.d);
    assert.equal(await o.page.evaluate(() => document.querySelector('[data-mm-overlay]').className), 'mm-tx-beam mm-tx-beam--curtain', 'the scene\'s cutParams win');
  } finally { await o.close(); }
});

// ---- entrances/power-on ----

const slotState = (page, scene, slot) => page.evaluate(([sc, sl]) => {
  const el = document.querySelector(`[data-scene="${sc}"] [data-slot="${sl}"]`);
  return { style: el.getAttribute('style') ?? '', line: !!el.querySelector('.mm-power-on__line'), kids: el.children.length };
}, [scene, slot]);

test('power-on: the line first, held steps, nothing left at rest', async () => {
  const o = await open('power');
  try {
    const it = await slotItem(o, 'on', 'headline');
    const at = (q) => it.start + q * it.d;
    await o.mm.seek(at(0.1));
    const lineOnly = await slotState(o.page, 'on', 'headline');
    assert.ok(lineOnly.line && /visibility: hidden/.test(lineOnly.style), 'while the line crosses only the line shows');
    await o.mm.seek(at(0.3));
    assert.match((await slotState(o.page, 'on', 'headline')).style, /clip-path/, 'the content opens through a band');
    // held steps: the flicker runs over [0.45, 1) in 7 steps (flicker 3)
    const w = 0.55 / 7, step = (k, f) => at(0.45 + (k + f) * w);
    const a = await framePng(o.page, step(3, 0.2)), b = await framePng(o.page, step(3, 0.7)), c = await framePng(o.page, step(4, 0.3));
    assert.ok(a.equals(b), 'two instants inside one step are the same picture');
    assert.ok(!a.equals(c), 'the next step is another');
    await o.mm.seek(it.start + it.d + 0.2);
    const rest = await slotState(o.page, 'on', 'headline');
    assert.deepEqual([rest.line, /visibility|clip-path|filter|opacity|position/.test(rest.style)], [false, false], `nothing left at rest: ${rest.style}`);
    assert.ok((await framePng(o.page, it.start + it.d + 0.05)).equals(await framePng(o.page, it.start + it.d + 0.2)), 'rest holds still');
    // the second beat turns the split off
    const sub = await slotItem(o, 'on', 'sub');
    for (let k = 0; k < 40; k++) { await o.mm.seek(sub.start + (k / 40) * sub.d); assert.doesNotMatch((await slotState(o.page, 'on', 'sub')).style, /drop-shadow/, `sub at ${k / 40}`); }
    const split = [];
    for (let k = 0; k < 40; k++) { await o.mm.seek(it.start + (0.2 + (0.8 * k) / 40) * it.d); split.push(/drop-shadow/.test((await slotState(o.page, 'on', 'headline')).style)); }
    assert.ok(split.some(Boolean), 'the headline\'s split shows while it settles');
    assert.equal(split.at(-1), false, 'and is gone before the end');
  } finally { await o.close(); }
});

test('power-on: a brand turns the split and the flicker off', async () => {
  const o = await open('powerBrand');
  try {
    const it = await slotItem(o, 'on', 'headline');
    for (let k = 0; k < 50; k++) {
      await o.mm.seek(it.start + (k / 50) * it.d);
      const s = await slotState(o.page, 'on', 'headline');
      assert.doesNotMatch(s.style, /drop-shadow/, `split at ${k / 50}`);
      if (k / 50 > 0.47) assert.doesNotMatch(s.style, /opacity/, `flicker at ${k / 50}`);
    }
  } finally { await o.close(); }
});

// ---- text/cross-out ----

const crossState = (page, scene) => page.evaluate((sc) => {
  const el = document.querySelector(`[data-scene="${sc}"] [data-slot="headline"]`);
  const css = (name) => { const d = document.createElement('i'); d.style.color = `var(${name})`; el.append(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  const items = [...el.querySelectorAll('.mm-cross-out__item')];
  return {
    muted: css('--mm-color-muted'), lead: css('--mm-accent-text'), ink: css('--mm-color-ink'),
    items: items.map((it) => ({
      text: it.textContent, color: getComputedStyle(it.querySelector('.mm-cross-out__text')).color, style: it.getAttribute('style') ?? '',
      paths: [...it.querySelectorAll('svg path')].map((p) => ({ d: p.getAttribute('d'), off: Number(p.style.strokeDashoffset), w: p.getAttribute('stroke-width') })),
    })),
  };
}, scene);

test('cross-out: every claim struck whole and dimmed, the survivor landed, at rest; strokes part-way between', async () => {
  const o = await open('cross');
  try {
    const it = await slotItem(o, 'myths', 'headline');
    await o.mm.seek(it.start + it.d + 0.3);
    const rest = await crossState(o.page, 'myths');
    assert.equal(rest.items.length, 4);
    for (const x of rest.items.slice(0, 3)) {
      assert.ok(x.paths.length >= 1 && x.paths.every((p) => p.off === 0), `${x.text}: stroke whole`);
      assert.equal(x.color, rest.muted, `${x.text}: dimmed to muted`);
    }
    const last = rest.items[3];
    assert.deepEqual([last.paths.length, last.color, last.style], [0, rest.lead, ''], 'the survivor: no stroke, accent text, nothing inline');
    await o.mm.seek(it.start + 0.3 * it.d);
    const mid = await crossState(o.page, 'myths');
    assert.ok(mid.items[0].paths[0].off > 0 && mid.items[0].paths[0].off < 1, 'the first claim is part struck');
    assert.equal(mid.items[2].paths.length, 0, 'the third is not struck yet');
    await o.mm.seek(it.start + 0.2 * it.d);
    assert.equal((await crossState(o.page, 'myths')).items[3].style.includes('opacity: 0'), true, 'the survivor waits, hidden');
    assert.ok((await framePng(o.page, it.start + it.d + 0.3)).equals(await framePng(o.page, it.start + it.d + 1.2)), 'rest holds still');
  } finally { await o.close(); }
});

test('cross-out: the scribble is rough.js\'s, the same at every seek; the survivor of `grow` scales into place', async () => {
  const o = await open('cross');
  try {
    const it = await slotItem(o, 'scribble', 'headline');
    const pick = async (t) => { await o.mm.seek(t); return crossState(o.page, 'scribble'); };
    const a = await pick(it.start + 0.5 * it.d), z = await pick(it.start + it.d + 0.3), b = await pick(it.start + 0.5 * it.d);
    assert.deepEqual(a, b, 'a seek back draws the same scribble');
    assert.ok(z.items[0].paths.length === 2 && /[QL]/.test(z.items[0].paths[0].d) && z.items[0].paths[0].d.length > 200, 'two passes of a long rough path');
    assert.ok(Number(z.items[0].paths[1].w) < Number(z.items[0].paths[0].w), 'the ghost pass is thinner');
    const land = await pick(it.start + 0.8 * it.d);
    assert.match(land.items[2].style, /scale: 0\./, 'the survivor grows into its own size');
    assert.equal(z.items[2].style, '', 'and has it at rest');
    const f1 = [], f2 = [];
    for (const f of [0.35, 0.5, 0.65]) f1.push(await framePng(o.page, it.start + f * it.d));
    for (const f of [0.65, 0.5, 0.35]) f2.unshift(await framePng(o.page, it.start + f * it.d));
    f1.forEach((p, k) => assert.ok(p.equals(f2[k]), `frame ${k}`));
  } finally { await o.close(); }
});

test('cross-out: a brand picks the stroke and its role', async () => {
  const o = await open('crossBrand');
  try {
    const it = await slotItem(o, 'myths', 'headline');
    await o.mm.seek(it.start + it.d + 0.3);
    const s = await crossState(o.page, 'myths');
    const m = /^M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)$/.exec(s.items[0].paths[0].d);
    assert.ok(m && Number(m[2]) > Number(m[4]) + 10, `a diagonal: ${s.items[0].paths[0].d}`);
    assert.equal(await o.page.evaluate(() => document.querySelector('.mm-cross-out').className), 'mm-cross-out mm-cross-out--ink');
    assert.equal(s.items[3].color, s.ink, 'with ink strokes the survivor is ink');
  } finally { await o.close(); }
});

// ---- text/verdict ----

const verdictState = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-scene="verdict"] [data-slot="sub"]');
  const muted = (() => { const d = document.createElement('i'); d.style.color = 'var(--mm-color-muted)'; el.append(d); const c = getComputedStyle(d).color; d.remove(); return c; })();
  return {
    muted,
    names: [...el.querySelectorAll('.mm-verdict__name')].map((n) => ({
      text: n.textContent, stamped: n.getAttribute('data-emphasis'), tone: n.getAttribute('data-p-tone'), tilt: n.getAttribute('data-p-tilt'), style: n.getAttribute('style') ?? '', color: getComputedStyle(n).color,
      plate: getComputedStyle(n, '::before').content,
    })),
  };
});

test('verdict: no stamp while the names hold, a slam at the landing, the stamp\'s own look and the others dimmed at rest', async () => {
  const o = await open('verdict');
  try {
    const it = await slotItem(o, 'verdict', 'sub');
    const at = (q) => it.start + q * it.d;
    await o.mm.seek(at(0.4));
    const held = await verdictState(o.page);
    assert.deepEqual(held.names.map((n) => n.stamped), [null, null], 'no stamp before the landing');
    assert.ok(held.names.every((n) => n.color === held.names[0].color), 'both names are in the same ink');
    await o.mm.seek(at(0.55) + 0.03);
    const slam = await verdictState(o.page);
    assert.equal(slam.names[1].stamped, 'emphasis/stamp');
    assert.match(slam.names[1].style, /scale: [\d.]+/, 'the stamp is coming down');
    assert.ok(Number(/scale: ([\d.]+)/.exec(slam.names[1].style)[1]) > 1);
    await o.mm.seek(it.start + it.d + 0.3);
    const rest = await verdictState(o.page);
    assert.deepEqual([rest.names[0].stamped, rest.names[1].stamped], [null, 'emphasis/stamp']);
    assert.equal(rest.names[1].style, '', 'nothing inline on the stamped name at rest');
    assert.equal(rest.names[0].color, rest.muted, 'the other is dimmed to muted');
    assert.notEqual(rest.names[1].plate, 'none', 'the stamp\'s stylesheet reaches the winner: its plate is drawn');
    assert.ok((await framePng(o.page, it.start + it.d + 0.3)).equals(await framePng(o.page, it.start + it.d + 1.2)), 'rest holds still');
  } finally { await o.close(); }
});

test('verdict: a brand picks the winner, the stamp\'s ink and tilt', async () => {
  const o = await open('verdictBrand');
  try {
    const it = await slotItem(o, 'verdict', 'sub');
    await o.mm.seek(it.start + it.d + 0.3);
    const s = await verdictState(o.page);
    assert.deepEqual(s.names.map((n) => n.stamped), ['emphasis/stamp', null], 'the first name wins');
    assert.deepEqual([s.names[0].tone, s.names[0].tilt], ['ink', 'none']);
    assert.equal(s.names[1].color, s.muted);
  } finally { await o.close(); }
});

// ---- emphasis/countdown-clock ----

const clockState = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-scene="urgent"] [data-slot="headline"]');
  const hand = el.querySelector('.mm-countdown__hand');
  return {
    clock: !!el.querySelector('.mm-countdown__clock'), band: !!el.querySelector('.mm-countdown__band'), place: el.querySelector('.mm-countdown__clock')?.getAttribute('data-place') ?? null,
    angle: hand ? ((Math.atan2(Number(hand.getAttribute('x2')) - 50, 50 - Number(hand.getAttribute('y2'))) * 180) / Math.PI + 360) % 360 : null,
    style: el.getAttribute('style') ?? '',
  };
});

test('countdown-clock: a clock and stripes only while the window runs; the hand sweeps a turn; nothing at rest', async () => {
  const o = await open('clock');
  try {
    const it = (await items(o)).find((x) => x.emphasis);
    const e = it.emphasis, at = (q) => e.start + q * e.d;
    await o.mm.seek(e.start - 0.05);
    assert.deepEqual((await clockState(o.page)).clock, false, 'nothing before the window');
    const angles = [];
    for (const q of [0.2, 0.35, 0.5, 0.65, 0.8]) { await o.mm.seek(at(q)); const s = await clockState(o.page); assert.ok(s.clock && s.band && s.place === 'above', `q ${q}`); angles.push(s.angle); }
    assert.deepEqual(angles, [...angles].sort((a, b) => a - b), 'the hand only turns clockwise');
    assert.ok(angles[4] - angles[0] > 150, `a good part of a turn: ${angles}`);
    await o.mm.seek(e.start + e.d + 0.2);
    const rest = await clockState(o.page);
    assert.deepEqual([rest.clock, rest.band, /position|isolation/.test(rest.style)], [false, false, false], `nothing at rest: ${rest.style}`);
    assert.ok((await framePng(o.page, at(0.5))).equals(await framePng(o.page, at(0.5))));
  } finally { await o.close(); }
});

test('countdown-clock: a brand turns the stripes off and puts the clock below', async () => {
  const o = await open('clockBrand');
  try {
    const e = (await items(o)).find((x) => x.emphasis).emphasis;
    await o.mm.seek(e.start + 0.5 * e.d);
    const s = await clockState(o.page);
    assert.deepEqual([s.clock, s.band, s.place], [true, false, 'below']);
  } finally { await o.close(); }
});

// ---- the gate ----

for (const brand of ['paper', 'nocturne']) {
  test(`the gate on every demo · ${brand}: no FAIL, and the colour, legibility, rest and time rules pass`, async () => {
    for (const ref of ['transitions/beam', 'entrances/power-on', 'text/cross-out', 'text/verdict', 'emphasis/countdown-clock']) {
      const dir = piece(`gate-${ref.replace('/', '-')}-${brand}`, brand, demo(ref));
      const r = await runCheck(dir, { format: '16x9', only: ['G-BRAND', 'G-LEGIBLE', 'G-REST', 'G-TIME', 'G-EDGE', 'G-PATTERN-REF'], server, browser });
      for (const row of r.rules) assert.notEqual(row.status, 'FAIL', `${ref} ${brand} ${row.id}: ${JSON.stringify(row.evidence).slice(0, 400)}`);
      assert.equal(r.rules.find((x) => x.id === 'G-BRAND')?.status, 'PASS', `${ref} ${brand}: G-BRAND`);
    }
  });
}
