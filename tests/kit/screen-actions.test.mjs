// The device-film open items, the Node half: the screen checks the
// kit and the gate share (schedule.js screenIssues), a play's default length, unknown marks that no
// longer throw, and a deck screen step past its scene.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schedule, addImplicitPlays, screenIssues } from '../../runtime/kit/schedule.js';
import { initialState, locate } from '../../runtime/kit/screen.js';
import { targetY } from '../../patterns/screen/scroll/pattern.js';

const style = JSON.parse(readFileSync(new URL('../../styles/presets/editorial.json', import.meta.url)));
const page = { kind: 'page', viewport: { w: 390, h: 844 }, height: 2000, tiles: [{ file: 'page-1.jpg', y: 0, h: 2000 }], marks: { Price: { x: 20, y: 1125, w: 350, h: 64 } } };
const seq = { kind: 'sequence', fps: 30, frames: 90 };
const metas = { 'assets/site/': page, 'assets/rec/': seq };
const metaOf = (a) => metas[a] ?? null;
const beat = (extra) => ({ at: 0.2, slot: 'stage', fx: 'devices/phone', asset: 'assets/site/', ...extra });
const film = (...beats) => ({ id: 'f', kind: 'film', formats: ['9x16'], title: 't', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null }, cta: { text: '', url: '' },
  scenes: [{ id: 'a', layout: 'layouts/caption-bar', duration: 8, cut: 'transitions/hard-cut', move: null, beats, say: '' }] });

test('screen/play with rate 0 or less is a screen warning, not a silent 1', () => {
  const { warn } = screenIssues(film(beat({ asset: 'assets/rec/', screen: [{ do: 'screen/play', params: { rate: 0 } }] })), metaOf);
  assert.equal(warn.length, 1);
  assert.match(warn[0], /^screen: .*\[data-slot="stage"\].*rate 0/);
  assert.deepEqual(screenIssues(film(beat({ asset: 'assets/rec/', screen: [{ do: 'screen/play', params: { rate: 0.5 } }] })), metaOf).warn, []);
});

test('screen/play without d lasts the rest of the clip from `from`, at its rate', () => {
  const story = film(beat({ asset: 'assets/rec/', screen: [{ do: 'screen/play', at: 0.5, params: { from: 1 } }, { do: 'screen/play', at: 3, params: { rate: 2 } }] }));
  addImplicitPlays(story, metaOf);
  const [a, b] = story.scenes[0].beats[0].screen;
  assert.equal(a.d, 2);     // 3 s clip, from 1
  assert.equal(b.d, 1.5);   // 3 s at double speed
  const s = schedule(story, style, { patterns: { 'screen/play': { dur: 'hold' } } });
  assert.ok(s.events.some((e) => e.screen && e.d === 2));
});

test('a mistyped mark fails statically, naming the beat and the mark; locate and scroll tolerate an unknown mark at runtime', () => {
  const story = film(beat({ screen: [{ do: 'screen/scroll', params: { to: 'Pricing' } }, { do: 'screen/tap', at: 2, params: { at: 'Prise' } }] }));
  const { fail } = screenIssues(story, metaOf);
  assert.equal(fail.length, 2);
  assert.match(fail[0], /\[data-scene="a"\] \[data-slot="stage"\].*screen\/scroll.*"Pricing"/);
  assert.match(fail[1], /screen\/tap.*"Prise".*assets\/site\//);
  assert.deepEqual(screenIssues(film(beat({ screen: [{ do: 'screen/tap', params: { at: 'Price' } }, { do: 'screen/tap', params: { at: '50%,20%' } }] })), metaOf).fail, []);
  // a mark on the screen a swap brings in is looked up there
  const swapped = film(beat({ asset: 'next.png', screen: [{ do: 'screen/swap', at: 0, params: { to: 'assets/site/' } }, { do: 'screen/tap', at: 2, params: { at: 'Price' } }] }));
  assert.deepEqual(screenIssues(swapped, metaOf).fail, []);
  const st = initialState('assets/site/', page);
  assert.doesNotThrow(() => locate(st, 'Prise', { w: 390, h: 844 }));
  assert.doesNotThrow(() => targetY(st, 'Prise', 'top', { w: 390, h: 844 }));
});

test('a deck screen step past its scene is a screen warning, and its clamped press is on the item', () => {
  const deck = { ...film(), kind: 'deck' };
  deck.scenes = [{ id: 'a', layout: 'layouts/caption-bar', presses: 2, cut: 'transitions/hard-cut', move: null, say: '',
    beats: [beat({ step: 1, screen: [{ do: 'screen/tap', step: 3, params: { at: 'Price' } }, { do: 'screen/tap', step: 1, params: { at: 'Price' } }] })] }];
  const s = schedule(deck, style, { patterns: { 'screen/tap': { dur: 'standard' } } });
  assert.ok(s.warnings.some((w) => /^screen: .*step 3.*beyond/.test(w)), s.warnings.join('\n'));
  assert.deepEqual(s.items[0].screenPresses, [2, 2]);
});

test('a laptop menu of more than 5 items is a screen warning naming what is dropped', () => {
  const { warn } = screenIssues(film(beat({ fx: 'devices/laptop', screen: undefined, params: { menu: 'A, B, C, D, E, F' } })), metaOf);
  assert.equal(warn.length, 1);
  assert.match(warn[0], /^screen: .*menu.*6 items.*F/);
});

test('W-PACE counts each screen action as an arrival', async () => {
  const { paceWindows } = await import('../../scripts/check/W-PACE.mjs');
  const story = film(beat({ at: 0.2, screen: [{ do: 'screen/scroll', at: 1 }, { do: 'screen/tap', at: 3 }] }));
  const s = schedule(story, style, { patterns: { 'screen/scroll': { dur: 'slow' }, 'screen/tap': { dur: 'standard' } } });
  s.duration = 10;
  assert.equal(paceWindows(s)[0].count, 3);   // the device, a scroll, a tap
});

test('deck stills get a mid frame for each screen action, halfway through its press', async () => {
  const { momentsOf } = await import('../../scripts/stills.mjs');
  const deck = { ...film(), kind: 'deck' };
  deck.scenes = [{ id: 'a', layout: 'layouts/caption-bar', presses: 3, cut: 'transitions/hard-cut', move: null, say: '',
    beats: [beat({ step: 1, screen: [{ do: 'screen/scroll', step: 1, params: { to: 'Price' } }, { do: 'screen/tap', step: 2, params: { at: 'Price' } }] })] }];
  const s = schedule(deck, style, { patterns: { 'screen/scroll': { dur: 'slow' }, 'screen/tap': { dur: 'standard' } } });
  const mids = momentsOf(s).mids.filter((m) => /scroll|tap/.test(m.label)).map((m) => m.t);
  assert.deepEqual(mids, [1.5, 2.5]);
});

test('a swap that starts while another is under way starts from the first one\'s state: nothing jumps', async () => {
  const { default: swap } = await import('../../patterns/screen/swap/pattern.js');
  const { fold } = await import('../../runtime/kit/screen.js');
  const metas2 = { 'a.png': null, 'b.png': null };
  const ctxOf = (e) => ({ params: e.action.params, ease: (_r, p) => p, kindOf: () => 'still', metaOf: (x) => metas2[x] ?? null });
  const timed = [
    { action: { do: 'screen/swap', params: { to: 'a.png', how: 'slide' } }, module: swap, start: 1, d: 1 },
    { action: { do: 'screen/swap', params: { to: 'b.png', how: 'slide' } }, module: swap, start: 1.5, d: 1 },
  ];
  const at = (t) => fold(initialState('base.png', null), timed, t, ctxOf).state;
  // just before and just after the second starts, the first keeps its progress
  const before = at(1.499), after = at(1.501);
  assert.equal(before.content.base, 'base.png'); assert.equal(after.content.base, 'base.png');
  const a0 = before.swapping.find((x) => x.to === 'a.png'), a1 = after.swapping.find((x) => x.to === 'a.png');
  assert.ok(a1 && Math.abs(a1.p - a0.p) < 0.01, JSON.stringify(after.swapping));
  assert.deepEqual(after.swapping.map((x) => x.to), ['a.png', 'b.png']);   // b slides in over a
  // when the first lands, a is the content and b keeps sliding in over it
  const land = at(2.001);
  assert.equal(land.content.base, 'a.png'); assert.deepEqual(land.swapping.map((x) => x.to), ['b.png']);
  assert.ok(Math.abs(land.swapping[0].p - at(1.999).swapping.find((x) => x.to === 'b.png').p) < 0.01);
  const end = at(2.6);
  assert.equal(end.content.base, 'b.png'); assert.deepEqual(end.swapping, []);
});

test('a mark inside a sticky or fixed overlay stays in viewport coordinates after any scroll', () => {
  const meta = { ...page, height: 5000, overlays: [{ file: 'overlay-1.jpg', x: 0, y: 0, w: 390, h: 56, position: 'sticky', top: 0 }, { file: 'overlay-2.jpg', x: 0, y: 788, w: 390, h: 56, position: 'fixed' }, { file: 'overlay-3.jpg', x: 0, y: 2000, w: 390, h: 40, position: 'sticky', top: 56 }],
    marks: { Header: { x: 0, y: 0, w: 390, h: 56, fixed: true, overlay: 0 }, Footer: { x: 0, y: 788, w: 390, h: 56, fixed: true, overlay: 1 }, Tabs: { x: 0, y: 2000, w: 390, h: 40, fixed: true, overlay: 2 } } };
  const box = { w: 390, h: 844 };
  const at = (scrollY, mark) => locate({ ...initialState('assets/site/', meta), scrollY }, mark, box).y * box.h;
  for (const y of [0, 1000, 4000]) { assert.ok(Math.abs(at(y, 'Header') - 28) < 1e-6, `Header at scroll ${y}`); assert.ok(Math.abs(at(y, 'Footer') - 816) < 1e-6); }
  assert.ok(Math.abs(at(0, 'Tabs') - 2020) < 1e-6);      // in the flow until it reaches its top
  assert.ok(Math.abs(at(3000, 'Tabs') - 76) < 1e-6);     // then stuck at 56
});

test('G-LOCAL checks that every overlay a captured page names exists', async () => {
  const { preparedMissing } = await import('../../scripts/check/G-LOCAL.mjs');
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'mm-ov-'));
  try {
    mkdirSync(join(dir, 'assets/site'), { recursive: true });
    writeFileSync(join(dir, 'assets/site/page-1.jpg'), 'x');
    writeFileSync(join(dir, 'assets/site/media.json'), JSON.stringify({ ...page, overlays: [{ file: 'overlay-1.jpg', x: 0, y: 0, w: 390, h: 56, position: 'fixed' }] }));
    const missing = preparedMissing(dir, film(beat({})));
    assert.equal(missing.length, 1); assert.match(missing[0], /overlay-1\.jpg$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a loop with autoReturn plays every arrived beat of its last scene back to p = 0, last arrival first, ending on the last frame', () => {
  const loop = { ...film(), kind: 'loop', autoReturn: true };
  loop.scenes = [{ id: 'a', layout: 'layouts/title-stack', duration: 6, cut: 'transitions/hard-cut', move: null, say: '',
    beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'Hook', params: { instant: true } }, { at: 0.8, slot: 'sub', fx: 'entrances/fade', text: 'One' }, { at: 1.2, slot: 'tag', fx: 'entrances/rise', text: 'Two' }] }];
  const s = schedule(loop, style, {});
  const by = Object.fromEntries(s.items.map((it) => [it.beat.slot, it]));
  assert.equal(by.headline.ret, undefined);          // instant: already there at frame 0
  const R = Math.min(1.2, 0.15 * 6), end = Math.round((6 - 1 / 30) * 1000) / 1000;
  assert.ok(by.tag.ret.start < by.sub.ret.start, 'the last arrival returns first');
  assert.ok(Math.abs(by.tag.ret.start - (end - R)) < 1e-3, JSON.stringify(by.tag.ret));
  assert.ok(Math.abs(by.sub.ret.start + by.sub.ret.d - end) < 2e-3, JSON.stringify(by.sub.ret));
  assert.equal(s.events.filter((e) => e.kind === 'depart' && e.ret).length, 2);
  assert.equal(schedule({ ...loop, autoReturn: false }, style, {}).items.some((it) => it.ret), false);
});

// Final review fixes
test('autoReturn never starts before the last scene rests; it shrinks to fit after the rest', () => {
  const loop = { ...film(), kind: 'loop', autoReturn: true };
  loop.scenes = [{ id: 'a', layout: 'layouts/title-stack', duration: 6, cut: 'transitions/hard-cut', move: null, say: '',
    beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'Hook', params: { instant: true } }, { at: 4, slot: 'sub', fx: 'entrances/fade', text: 'Late', emphasis: 'emphasis/indicate' }] }];
  const s = schedule(loop, style, {});
  const rest = s.holds.find((h) => h.scene === 'a').from;
  const sub = s.items.find((it) => it.beat.slot === 'sub');
  assert.ok(rest > 6 - 1 / 30 - 0.9, `the fixture rests late (${rest})`);
  assert.ok(sub.ret.start >= rest - 1e-9, `return ${sub.ret.start} before the rest ${rest}`);
  assert.ok(Math.abs(sub.ret.start + sub.ret.d - Math.round((6 - 1 / 30) * 1000) / 1000) < 1e-9);
});

test('a mark is looked up on the screen the kit shows, so an action during a swap acts on the outgoing screen', () => {
  const during = film(beat({ asset: 'next.png', screen: [{ do: 'screen/swap', at: 1, d: 0.6, params: { to: 'assets/site/' } }, { do: 'screen/tap', at: 1.2, params: { at: 'Price' } }] }));
  assert.equal(screenIssues(during, metaOf, style).fail.length, 1);
  const after = film(beat({ asset: 'next.png', screen: [{ do: 'screen/swap', at: 1, d: 0.6, params: { to: 'assets/site/' } }, { do: 'screen/tap', at: 1.6, params: { at: 'Price' } }] }));
  assert.deepEqual(screenIssues(after, metaOf, style).fail, []);
  const cut = film(beat({ asset: 'next.png', screen: [{ do: 'screen/swap', at: 1, params: { to: 'assets/site/', how: 'cut' } }, { do: 'screen/tap', at: 1, params: { at: 'Price' } }] }));
  assert.deepEqual(screenIssues(cut, metaOf, style).fail, []);
});
