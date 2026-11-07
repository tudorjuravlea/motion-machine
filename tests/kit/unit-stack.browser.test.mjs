// data/unit-stack in the page: the figure on screen is always the plates that have landed times the
// unit, the fact's value exactly at rest, with the unit shown only on the finished stack; every plate
// is a box in palette roles; the beat cites a fact like data/counter.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';

const OUT = join(ROOT, 'out', 'unit-stack-test');
const DEMO = join(ROOT, 'patterns', 'data', 'unit-stack', 'demo', 'story.json');
const story = {
  id: 'unit-stack-test', kind: 'film', formats: ['9x16', '16x9'], title: 'unit-stack test', language: 'en',
  facts: [{ id: 'f', text: 'Tonnes of packaging saved', source: 'test fixture, an invented figure' }],
  audio: { track: null, bpm: null, beats: null },
  scenes: [{
    id: 's', layout: 'layouts/stat-hero', duration: 5, cut: 'transitions/hard-cut', move: null, say: 'A test scene.',
    beats: [
      { at: 0.3, slot: 'figure', fx: 'data/unit-stack', value: 37.5, fact: 'f', params: { unit: 2.5, suffix: ' t', fix: 1 } },
      { at: 0.4, slot: 'headline', fx: 'entrances/fade', text: 'Less packaging' },
    ],
  }],
  cta: { text: 'motion-machine', url: 'github.com/tudorjuravlea/motion-machine' },
};
// the same scene with another value and no fix, for the precision, huge and zero cases
const storyOf = (value, params = {}) => {
  const s = structuredClone(story);
  s.scenes[0].beats[0] = { ...s.scenes[0].beats[0], value, params: { suffix: ' t', ...params } };
  return s;
};
const VALUES = { frac: [7.3], half: [100.5, { unit: 2 }], huge: [1234567890], zero: [0], neg: [-5] };
let server, browser;
const dirs = {};
before(async () => {
  mkdirSync(OUT, { recursive: true });
  const pieces = [['paper', 'paper', story], ['nocturne', 'nocturne', story], ...Object.entries(VALUES).map(([k, [v, prm]]) => [k, 'paper', storyOf(v, prm)])];
  for (const [name, brand, st] of pieces) {
    const dir = join(OUT, name), style = join(OUT, `${name}.style.json`);
    rmSync(dir, { recursive: true, force: true });
    composeToFile({ brand, motion: 'calm', out: style });
    newPiece({ kind: 'film', style, dir });
    writeFileSync(join(dir, 'story.json'), JSON.stringify(st, null, 2));
    dirs[name] = dir;
  }
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

const SEL = '[data-scene="s"] [data-slot="figure"]';
const state = (o) => o.page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const fig = el.querySelector('.mm-unit-stack__figure');
  const vis = [...fig.childNodes].filter((n) => n.nodeType === 3 || getComputedStyle(n).visibility !== 'hidden').map((n) => n.textContent).join('');
  const plates = [...el.querySelectorAll('.mm-unit-stack__plate')];
  return { landed: plates.filter((p) => p.hasAttribute('data-landed')).length, drawn: plates.length, attr: Number(el.dataset.landed), n: Number(el.dataset.plates),
    figure: vis, full: fig.textContent, rule: el.querySelector('.mm-unit-stack__rule')?.textContent ?? '',
    faces: plates.flatMap((p) => [null, '::before', '::after'].map((w) => { const c = getComputedStyle(p, w); return { color: c.backgroundColor, image: c.backgroundImage, ruler: p.hasAttribute('data-ruler') }; })),
    roles: Object.fromEntries(['muted', 'accent', 'ink', 'canvas'].map((r) => { const d = document.createElement('i'); d.style.color = `var(--mm-color-${r})`; el.append(d); const v = getComputedStyle(d).color; d.remove(); return [r, v]; })) };
}, SEL);

test('the figure is the landed plates times the unit at every instant, and the fact\'s value at rest', async () => {
  const o = await openPiece(dirs.paper, { server, browser, format: '9x16' });
  try {
    const it = (await o.mm.meta()).schedule.items.find((x) => x.selector === SEL);
    assert.ok(it && Math.abs(it.d - 2.4) < 1e-6, 'the entrance lasts 2.4 s by default');
    let seen = new Set();
    for (let t = it.start; t <= it.start + it.d + 0.3; t += 0.07) {
      await o.mm.seek(t);
      const s = await state(o);
      assert.equal(s.n, 15, '37.5 at 2.5 a plate is 15 plates');
      assert.equal(s.attr, s.landed, 'the readout matches the plates marked landed');
      const want = Math.min(s.landed * 2.5, 37.5).toFixed(1);
      assert.equal(s.figure, s.landed === 15 ? `${want} t` : want, `at ${t.toFixed(2)}: ${s.landed} landed`);
      seen.add(s.landed);
    }
    assert.ok(seen.size > 8, `the count climbs plate by plate: ${[...seen].join(',')}`);
    await o.mm.seek(it.start + it.d);
    const rest = await state(o);
    assert.equal(rest.landed, 15);
    assert.equal(rest.figure, '37.5 t', 'the value exactly, with its unit, at rest');
    assert.equal(rest.rule, '2.5 t each', 'the rule line states what a plate is');
  } finally { await o.close(); }
});

test('every plate face is a palette role or a blend of roles, in both polarities', async () => {
  for (const brand of ['paper', 'nocturne']) {
    const o = await openPiece(dirs[brand], { server, browser, format: '16x9' });
    try {
      await o.mm.seek(4);
      const s = await state(o);
      assert.equal(s.drawn, 15);
      for (const f of s.faces) {
        assert.equal(f.color, f.ruler ? s.roles.accent : s.roles.muted, `${brand}: each face is the series role (accent on a ruler plate)`);
        assert.match(f.image, /^linear-gradient\(/, `${brand}: lit or shaded by an alpha of a role laid over it`);
      }
      assert.equal(s.faces.filter((f) => f.ruler).length, 3, 'the tenth plate is the ruler');
      assert.ok(new Set(s.faces.map((f) => f.image)).size >= 3, `${brand}: lit, front and shaded faces differ`);
    } finally { await o.close(); }
  }
});

test('the demo cites a fact for the figure, as data/counter does', () => {
  const demo = JSON.parse(readFileSync(DEMO, 'utf8'));
  const beat = demo.scenes.flatMap((s) => s.beats).find((b) => b.fx === 'data/unit-stack');
  assert.ok(beat && beat.value != null && beat.fact, 'the unit-stack beat has a value and a fact');
  assert.ok(demo.facts.some((f) => f.id === beat.fact && f.source), 'the fact exists and has a source');
});

const restOf = async (name, format = '9x16') => {
  const o = await openPiece(dirs[name], { server, browser, format });
  try {
    const it = (await o.mm.meta()).schedule.items.find((x) => x.selector === SEL);
    const before = [];
    for (const dt of [0.6, 1.2, 1.8]) { await o.mm.seek(it.start + dt); before.push((await state(o)).figure); }
    await o.mm.seek(it.start + it.d + 0.2);
    return { ...(await state(o)), before, warnings: (await o.mm.meta()).warnings.filter((w) => /unit-stack/.test(w)) };
  } finally { await o.close(); }
};
const G = ' ';

test('a value with decimals rests on its exact figure, with no fix given', async () => {
  const a = await restOf('frac');
  assert.equal(a.n, 8, '7.3 at 1 a plate is eight plates, the last a part');
  assert.equal(a.figure, '7.3 t', 'rests on 7.3, not 7');
  assert.equal(a.rule, '1 t each');
  for (const f of a.before) assert.match(f, /^\d\.\d$/, `the climbing figure keeps the value's one decimal: ${f}`);
  const b = await restOf('half');
  assert.equal(b.figure, '100.5 t', 'rests on 100.5, not 101');
  assert.equal(b.rule, '2 t each');
  assert.deepEqual([...a.warnings, ...b.warnings], [], 'nothing to say about a positive value');
});

test('a huge value rests on its exact figure, grouped so it can be read, with the coarser unit stated the same way', async () => {
  const h = await restOf('huge');
  assert.ok(h.n <= 100, `countable plates: ${h.n}`);
  assert.equal(h.figure, `1${G}234${G}567${G}890 t`);
  assert.equal(h.rule, `20${G}000${G}000 t each`);
});

test('zero and below: no plates, the value as the figure, and a note in mm.warnings', async () => {
  const z = await restOf('zero');
  assert.equal(z.drawn, 0);
  assert.equal(z.figure, '0 t');
  assert.equal(z.warnings.length, 1, `one note: ${JSON.stringify(z.warnings)}`);
  assert.match(z.warnings[0], /nothing to stack/);
  const n = await restOf('neg');
  assert.equal(n.drawn, 0);
  assert.equal(n.figure, '-5 t');
  assert.equal(n.warnings.length, 1);
});
