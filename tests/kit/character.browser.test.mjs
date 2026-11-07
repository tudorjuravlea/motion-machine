// entrances/character and emphasis/act: the brand's mascot hops into its slot, idles on the beat
// grid of the piece's time, and acts a mood change as an emphasis (eyes shut into the key, the face
// swaps while they are shut, a take, a settle), after which it keeps the new mood. The piece is
// scaffolded here from the shipped paper brand (a round mascot) over the calm motion (90 bpm).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { compose } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';
import { ACT, MOODS, VIEWS } from '../../runtime/kit/rig.js';

const BPM = 90;
const story = (brand) => ({
  id: 'character-test', title: 'character test', kind: 'film', formats: ['16x9', '9x16'], language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null },
  cta: { text: 'Say hello', url: 'example.org' },
  scenes: [
    {
      id: 'meet', layout: 'layouts/split', duration: 7, cut: 'transitions/hard-cut', move: null,
      beats: [
        { at: 0.2, slot: 'headline', fx: 'entrances/rise', text: `Meet the ${brand} helper` },
        { at: 0.6, slot: 'figure', fx: 'entrances/character', params: { mood: 'calm', to: 'happy' }, emphasis: 'emphasis/act' },
        { at: 1.0, slot: 'body', fx: 'entrances/fade', text: 'It reacts, then keeps the beat' },
      ],
    },
    {
      id: 'sheet', layout: 'layouts/split', duration: 3, cut: 'transitions/hard-cut', move: null,
      beats: [
        { at: 0.2, slot: 'headline', fx: 'entrances/rise', text: 'Every view, every mood' },
        { at: 0.4, slot: 'figure', fx: 'entrances/character', params: { sheet: 'all' } },
      ],
    },
  ],
});

let server, browser, base;
before(async () => {
  server = await serveRoot(ROOT); browser = await launchBrowser();
  base = mkdtempSync(join(ROOT, '.tmp-character-'));
  for (const brand of ['paper', 'nocturne']) {
    const styleFile = join(base, `${brand}.json`);
    writeFileSync(styleFile, JSON.stringify(compose({ brand, motion: 'calm' })));
    const dir = newPiece({ kind: 'film', style: styleFile, dir: join(base, brand) });
    writeFileSync(join(dir, 'story.json'), JSON.stringify(story(brand)));
  }
});
after(async () => { await browser?.close(); await server?.close(); if (base) rmSync(base, { recursive: true, force: true }); });
const open = (brand = 'paper', format = '16x9') => openPiece(join(base, brand), { server, browser, format });
const itemOf = (sched, scene, slot) => sched.items.find((it) => it.scene === scene && !it.parent && it.beat?.slot === slot);

// what the rig in a slot shows now
const RIG = (sc) => {
  const el = document.querySelector(`[data-scene="${sc}"] [data-slot="figure"]`);
  const svgs = el.querySelectorAll(':scope > svg.mm-rig');
  const svg = svgs[0];
  const painted = svg ? [...svg.querySelectorAll('path, ellipse, circle, rect')].filter((n) => !n.closest('clipPath')).flatMap((n) => { const cs = getComputedStyle(n); return [cs.fill, cs.stroke].filter((c) => c && c !== 'none'); }) : [];
  return {
    rigs: svgs.length, faces: svg ? svg.querySelectorAll('.mm-rig__face').length : 0, cells: svg ? svg.querySelectorAll('.mm-rig__cell').length : 0,
    mood: svg?.dataset.mood ?? null, face: svg?.querySelector('.mm-rig__face')?.dataset.face ?? null, sq: Number(svg?.dataset.sq), squint: Number(svg?.dataset.squint),
    eyes: svg?.dataset.eyes ?? null, html: svg?.outerHTML ?? '', painted, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height,
  };
};
const look = async (o, t, sc = 'meet') => { await o.mm.seek(t); return o.page.evaluate(RIG, sc); };

test('entrances/character: the mascot hops into a slot with room for it, and at rest the kit reports it finished', async () => {
  const o = await open();
  try {
    const { schedule } = await o.mm.meta();
    const it = itemOf(schedule, 'meet', 'figure');
    const mid = await look(o, it.start + 0.45 * it.d);
    assert.equal(mid.rigs, 1, 'one rig in the slot');
    assert.ok(mid.w > 200 && mid.h > 200, `the slot has room: ${mid.w} x ${mid.h}`);
    const hold = schedule.holds.find((h) => h.scene === 'meet');
    assert.ok(hold, 'the scene rests');
    await o.mm.seek(hold.from + 0.5);
    const rep = (await o.mm.report()).elements.find((e) => e.selector.includes('figure') && e.scene === 'meet');
    assert.equal(rep.progress, 1, 'the mascot reports progress 1 at rest, though it idles');
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});

test('emphasis/act: one face on every frame, swapped under shut eyes at the key; the new mood stays after the act', async () => {
  const o = await open();
  try {
    const { schedule } = await o.mm.meta();
    const it = itemOf(schedule, 'meet', 'figure');
    const key = it.emphasis.start + ACT.key;
    assert.equal(it.emphasis.d, ACT.dur, 'the act lasts its own window');
    assert.equal((await look(o, it.emphasis.start - 0.05)).mood, 'calm', 'before the act: the first mood');
    for (let t = it.emphasis.start; t < it.emphasis.start + it.emphasis.d; t += 1 / 30) {
      const s = await look(o, t);
      assert.equal(s.rigs, 1, `one rig at ${t.toFixed(3)}`);
      assert.equal(s.faces, 1, `one face at ${t.toFixed(3)}`);
      assert.equal(s.face, t < key - 1e-6 ? 'calm' : 'happy', `face at ${t.toFixed(3)}`);
      if (Math.abs(t - key) <= 0.05) assert.ok(s.squint >= 0.8 && s.eyes === 'line', `eyes shut near the key at ${t.toFixed(3)}: ${s.squint}`);
    }
    const later = await look(o, it.emphasis.start + it.emphasis.d + 1.5);
    assert.equal(later.mood, 'happy', 'after the act the mascot keeps the new mood');
  } finally { await o.close(); }
});

test('the idle at rest is locked to the beat grid of the piece\'s time: squash peaks within one frame of every beat', async () => {
  const o = await open();
  try {
    const { schedule } = await o.mm.meta();
    const hold = schedule.holds.find((h) => h.scene === 'meet');
    const from = hold.from + 0.5, to = hold.to - 0.1, fps = 30, beat = 60 / BPM;
    const sq = [];
    for (let t = from; t <= to; t += 1 / fps) sq.push([t, (await look(o, t)).sq]);
    const peaks = sq.filter(([, v], i) => i > 0 && i < sq.length - 1 && v > sq[i - 1][1] && v >= sq[i + 1][1]).map(([t]) => t);
    const grid = [];
    for (let b = Math.ceil(from / beat) * beat; b <= to; b += beat) grid.push(b);
    assert.ok(peaks.length >= grid.length - 1, `peaks ${peaks.length}, beats ${grid.length}`);
    for (const t of peaks) assert.ok(grid.some((b) => Math.abs(t - b) <= 1 / fps + 1e-6) || t - from < 1 / fps || to - t < 1 / fps, `peak at ${t.toFixed(3)} s is off the ${BPM} bpm grid`);
  } finally { await o.close(); }
});

test('the rig is the same at the same instant in either seek order, and paints only resolved colours', async () => {
  const o = await open('nocturne', '9x16');
  try {
    const ts = [0.7, 1.1, 1.9, 2.2, 3.4, 5.1, 8.6];
    const fwd = [];
    for (const t of ts) fwd.push((await look(o, t, t > 7 ? 'sheet' : 'meet')).html);
    for (let i = ts.length - 1; i >= 0; i--) assert.equal((await look(o, ts[i], ts[i] > 7 ? 'sheet' : 'meet')).html, fwd[i], `t=${ts[i]}`);
    const shot = async (t) => { await o.mm.seek(t); return o.page.screenshot(); };
    const a = await shot(3.4), b = await shot(1.9), c = await shot(3.4);
    assert.ok(a.equals(c) && !a.equals(b), 'pixels depend on t alone');
    const s = await look(o, 3.4);
    assert.ok(s.painted.length > 10);
    for (const col of s.painted) assert.notEqual(col, 'rgb(0, 0, 0)', 'an unresolved colour falls back to black');
  } finally { await o.close(); }
});

test('a model sheet draws every view in every mood in one slot', async () => {
  const o = await open('paper', '16x9');
  try {
    const s = await look(o, 9.5, 'sheet');
    assert.equal(s.cells, VIEWS.length * MOODS.length);
    assert.equal(s.faces, (VIEWS.length - 1) * MOODS.length, 'the back views show no face');
  } finally { await o.close(); }
});
