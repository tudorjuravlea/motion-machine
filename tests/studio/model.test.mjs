// The timeline model is the kit's schedule plus lanes, source paths and
// editability. Every film and loop in pieces/ and the loop and variant fixtures, in every
// format: one beat clip per scheduled beat item, at the schedule's times, whose path resolves in the
// raw story to the beat the item came from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schedule, forFormat, resolveStory, addImplicitPlays, eachParts } from '../../runtime/kit/schedule.js';
import { loadPatterns, patternsBaseOf } from '../../scripts/check.mjs';
import { timelineModel, pathForSelector } from '../../scripts/studio/model.js';
import { importGraph } from '../check/_import-graph.mjs';
import { trackedPieces } from '../check/_tracked.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const editorial = json('styles/presets/editorial.json');
const ptr = (doc, path) => path.split('/').slice(1).reduce((o, k) => o?.[k.replace(/~1/g, '/').replace(/~0/g, '~')], doc);
const ms = (x) => Math.round(x * 1000) / 1000;

// The schedule exactly as scripts/check.mjs builds it in Node (forFormat → resolveStory → addImplicitPlays).
async function built(dir, format) {
  const raw = json(join(dir, 'story.json')), style = json(join(dir, 'style.json'));
  const metaOf = (asset) => { try { return JSON.parse(readFileSync(join(ROOT, dir, asset, 'media.json'), 'utf8')); } catch { return null; } };
  const s = resolveStory(forFormat(structuredClone(raw), format), style);
  addImplicitPlays(s, metaOf);
  const patterns = await loadPatterns(s, patternsBaseOf(join(ROOT, dir)));
  const grid = raw.audio?.beats && existsSync(join(ROOT, dir, raw.audio.beats)) ? json(join(dir, raw.audio.beats)) : undefined;
  return { raw, style, sch: schedule(s, style, { patterns }), grid };
}

const pieceDirs = () => [
  ...trackedPieces(),
  'fixtures/negatives/G-LOOP/auto', 'fixtures/negatives/G-LOOP/ok', 'fixtures/negatives/_base/variants',
].filter((d) => existsSync(join(ROOT, d, 'story.json')) && existsSync(join(ROOT, d, 'style.json')));

const beatClips = (m) => m.lanes.flatMap((l) => l.clips).filter((c) => c.kind === 'beat');

test('every film and loop, every format: one beat clip per item, at its times, with a path to its source beat', async () => {
  let pieces = 0, formats = 0, clips = 0;
  const kinds = new Set();
  for (const dir of pieceDirs()) {
    const story = json(join(dir, 'story.json'));
    if (story.kind === 'deck') continue;
    pieces++; kinds.add(story.kind);
    for (const format of story.formats) {
      formats++;
      const { raw, style, sch, grid } = await built(dir, format);
      const m = timelineModel(sch, raw, { format, grid });
      const where = `${dir} ${format}`;
      assert.equal(m.kind, story.kind, where);
      assert.equal(m.duration, sch.duration, where);
      assert.deepEqual(m.scenes.map((s) => [s.id, s.start, s.end]), sch.scenes.map((s) => [s.id, s.start, s.end]), where);
      const bc = beatClips(m);
      assert.equal(bc.length, sch.items.length, `${where}: one clip per scheduled beat item`);
      // clips are listed per lane; pair them with items by id order of the schedule
      const byItem = new Map(bc.map((c) => [c.id, c]));
      assert.equal(byItem.size, bc.length, `${where}: clip ids are unique`);
      for (const [n, it] of sch.items.entries()) {
        const c = bc.find((x) => x.itemIndex === n);
        assert.ok(c, `${where}: item ${n} has a clip`);
        assert.equal(c.start, it.start, `${where} ${c.id} start`);
        assert.equal(c.selector, it.selector, `${where} ${c.id} selector`);
        assert.deepEqual(c.segments.enter, [it.start, ms(it.start + it.d)], `${where} ${c.id} entrance`);
        const sceneEnd = sch.scenes.find((s) => s.id === it.scene).end;
        const exit = it.parent ? it.parent.exit : it.exit;
        if (exit) {
          assert.deepEqual(c.segments.exit, [exit.start, ms(exit.start + exit.d)], `${where} ${c.id} exit`);
          assert.equal(c.end, ms(exit.start + exit.d), `${where} ${c.id} ends where its exit ends`);
        } else assert.equal(c.end, sceneEnd, `${where} ${c.id} ends at its scene's end`);
        if (it.emphasis) assert.deepEqual(c.segments.emphasis, [it.emphasis.start, ms(it.emphasis.start + it.emphasis.d)], `${where} ${c.id} emphasis`);
        // the path resolves in the raw story to the beat the item came from
        const src = ptr(raw, c.path);
        assert.ok(src, `${where} ${c.id}: ${c.path} resolves`);
        const fx = String(src.fx).startsWith('style:') ? style.entrances[src.fx.slice(6)] : src.fx;
        assert.deepEqual([src.slot, src.at, src.text, fx], [it.beat.slot, it.beat.at, it.beat.text, it.beat.fx], `${where} ${c.id}: ${c.path} is the item's beat`);
        assert.ok(m.lanes.find((l) => l.id === `slot:${it.slot}`).clips.includes(c), `${where} ${c.id} sits in its slot lane`);
        assert.equal(pathForSelector(m, it.selector) != null, true, `${where}: ${it.selector} maps to a path`);
        clips++;
      }
    }
  }
  assert.ok(pieces >= 30 && kinds.has('loop') && kinds.has('film'), `covered ${pieces} pieces (${[...kinds]})`);
  assert.ok(formats > pieces && clips > 500, `${formats} formats, ${clips} clips`);
});

test('lanes: one slot lane per slot name in first-appearance order, then cues, then moves', async () => {
  const { raw, sch, grid } = await built('pieces/golden-film-kinetic', '16x9');
  const m = timelineModel(sch, raw, { format: '16x9', grid });
  const order = [];
  for (const it of sch.items) if (!order.includes(it.slot)) order.push(it.slot);
  assert.deepEqual(m.lanes.map((l) => l.id), [...order.map((s) => `slot:${s}`), 'cues', 'moves']);
  assert.deepEqual(m.lanes.map((l) => l.kind), [...order.map(() => 'slot'), 'cues', 'moves']);
  assert.equal(m.lanes[0].label, order[0]);
  const cues = m.lanes.find((l) => l.id === 'cues').clips;
  assert.equal(cues.length, sch.events.filter((e) => e.kind === 'cue').length);
  assert.ok(cues.length > 0 && cues.every((c) => c.kind === 'cue'));
  assert.ok(cues.every((c) => c.path === null && c.editable.at === false && c.reason));
  // the grid: bpm, beats, and the strong ones (downbeats when beats.json has no strong[])
  assert.equal(m.grid.bpm, grid.bpm);
  assert.deepEqual(m.grid.beats, grid.beats);
  assert.deepEqual(m.grid.strong, grid.downbeats);
});

test('grid: strong[] of objects becomes times; no grid gives empty arrays', async () => {
  const { raw, sch, grid } = await built('pieces/catalogue-music-1', '16x9');
  const m = timelineModel(sch, raw, { format: '16x9', grid });
  assert.deepEqual(m.grid.strong, grid.strong.map((s) => s.t));
  const bare = timelineModel(sch, raw, { format: '16x9' });
  assert.deepEqual([bare.grid.beats, bare.grid.strong], [[], []]);
});

test('scenes: index, path, layout, cut, move, editable', async () => {
  const { raw, sch } = await built('pieces/golden-film-kinetic', '16x9');
  const m = timelineModel(sch, raw, { format: '16x9' });
  m.scenes.forEach((s, i) => {
    assert.equal(s.index, i);
    assert.equal(s.path, `/scenes/${i}`);
    assert.equal(s.layout, raw.scenes[i].layout);
    assert.equal(s.duration, raw.scenes[i].duration);
    assert.deepEqual(s.cut, sch.scenes[i].cut);
    assert.equal(s.move, sch.scenes[i].move);
    assert.deepEqual(s.editable, { duration: true, order: true });
    assert.equal(s.reason, undefined);
  });
});

// ---- review focus 2: a variant with its own beats -------------------------------------------------

test('a variant with beats: clips in that format point into the variant, in another format into the base', async () => {
  const dir = 'fixtures/negatives/_base/variants';
  for (const [format, prefix] of [['9x16', '/scenes/1/variants/9x16/beats/'], ['16x9', '/scenes/1/beats/']]) {
    const { raw, sch } = await built(dir, format);
    const m = timelineModel(sch, raw, { format });
    const style = beatClips(m).filter((c) => c.scene === 'style');
    assert.deepEqual(style.map((c) => c.path), [`${prefix}0`, `${prefix}1`], format);
    assert.equal(ptr(raw, style[0].path).text, format === '9x16' ? 'Two halves, one style.' : 'Two halves make one style.');
    assert.equal(beatClips(m).find((c) => c.scene === 'open').path, '/scenes/0/beats/0', `${format}: a scene with no variant stays in the base`);
  }
});

test('a variant with only a layout keeps its beats in the base', () => {
  const story = mini([{ id: 'a', duration: 3, beats: [beat(0, 'headline')], variants: { '9x16': { layout: 'layouts/split' } } }]);
  const m = timelineModel(schedule(forFormat(story, '9x16'), editorial), story, { format: '9x16' });
  assert.equal(beatClips(m)[0].path, '/scenes/0/beats/0');
  assert.equal(m.scenes[0].layout, 'layouts/split');
});

// ---- review focus 3: cascades and instant beats ---------------------------------------------------

function mini(scenes, extra = {}) {
  return { id: 't', kind: 'film', formats: ['16x9', '9x16'], title: 't', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null },
    scenes: scenes.map((s) => ({ layout: 'layouts/title-stack', cut: 'transitions/hard-cut', move: null, ...s })), ...extra };
}
const beat = (at, slot, extra = {}) => ({ at, slot, fx: 'entrances/fade', text: `${slot} text`, ...extra });

test('a cascade: the parent is draggable; each child is a clip with parent set, not draggable alone, path of the source beat', () => {
  const story = mini([{ id: 'a', duration: 4, beats: [beat(0, 'headline'), beat(0.5, 'list', { text: 'one|two|three', params: { each: true }, out: 3 })] }]);
  const sch = schedule(story, editorial);
  const m = timelineModel(sch, story, { format: '16x9' });
  const lane = m.lanes.find((l) => l.id === 'slot:list');
  assert.equal(lane.clips.length, 4);
  const [parent, ...kids] = lane.clips;
  assert.equal(parent.parent, undefined);
  assert.deepEqual(parent.editable, { at: true, out: true });
  assert.equal(parent.path, '/scenes/0/beats/1');
  assert.deepEqual(kids.map((k) => k.label), eachParts('one|two|three'));
  for (const [k, kid] of kids.entries()) {
    assert.equal(kid.parent, parent.id);
    assert.equal(kid.path, parent.path);
    assert.deepEqual(kid.editable, { at: false, out: false });
    assert.match(kid.reason, /cascade/);
    assert.equal(kid.selector, `${parent.selector} > :nth-child(${k + 1})`);
    assert.deepEqual(kid.segments.exit, parent.segments.exit, 'children leave with their parent');
  }
  assert.equal(kids[1].start, ms(0.5 + 0.07));
  assert.equal(pathForSelector(m, kids[2].selector), parent.path, 'a click on a child selects the cascade beat');
});

test('an instant beat has a zero-width entrance and is still editable', () => {
  const story = mini([{ id: 'a', duration: 3, beats: [beat(1, 'headline', { params: { instant: true } }), beat(0, 'sub')] }]);
  const m = timelineModel(schedule(story, editorial), story, { format: '16x9' });
  const [c] = m.lanes[0].clips;
  assert.deepEqual(c.segments.enter, [1, 1]);
  assert.deepEqual(c.segments.rest, [1, 3]);
  assert.deepEqual(c.editable, { at: true, out: true });
  assert.equal(m.lanes[1].clips[0].segments.enter[1] > 0, true);
});

test('segments: rest runs from the landing to the exit; emphasis follows the landing', () => {
  const story = mini([{ id: 'a', duration: 5, beats: [beat(0.5, 'headline', { out: 4, exit: 'exits/fade', emphasis: 'emphasis/pulse' })] }]);
  const sch = schedule(story, editorial);
  const m = timelineModel(sch, story, { format: '16x9' });
  const [c] = m.lanes[0].clips;
  assert.deepEqual(c.segments.enter, [0.5, 1.02]);
  assert.deepEqual(c.segments.rest, [1.02, 4]);
  assert.deepEqual(c.segments.emphasis, [1.02, 2.02]);
  assert.deepEqual(c.segments.exit, [4, ms(4 + 0.7 * 0.52)]);
  assert.equal(c.end, ms(4 + 0.7 * 0.52));
  assert.equal(c.fx, 'entrances/fade');
  assert.equal(c.sceneStart, 0);
});

test('labels: the text trimmed to 24 characters, else the pattern name', () => {
  const story = mini([{ id: 'a', duration: 3, beats: [beat(0, 'headline', { text: '  A   very long headline that keeps going  ' }), { at: 0, slot: 'pic', fx: 'devices/phone' }] }]);
  const m = timelineModel(schedule(story, editorial), story, { format: '16x9' });
  const [a, b] = beatClips(m);
  assert.ok(a.label.length <= 24 && a.label.startsWith('A very long headline'), a.label);
  assert.equal(b.label, 'phone');
});

test('times follow the scene: a beat in the second scene starts at the scene start plus its at; cut wedges come from the schedule', () => {
  const story = mini([{ id: 'a', duration: 3, beats: [beat(0, 'headline')] }, { id: 'b', duration: 3, cut: 'transitions/fade', beats: [beat(0.4, 'headline')] }]);
  const sch = schedule(story, editorial);
  const m = timelineModel(sch, story, { format: '16x9' });
  const c = beatClips(m)[1];
  assert.equal(c.sceneStart, sch.scenes[1].start);
  assert.equal(c.start, ms(sch.scenes[1].start + 0.4));
  assert.equal(c.scene, 'b');
  assert.deepEqual(m.scenes[1].cut, { pattern: 'transitions/fade', d: 0.52 });
  assert.equal(m.scenes[1].start, m.scenes[0].end, 'a scene starts where the one before ends; the outgoing scene lingers through the cut');
});

test('moves lane: camera moves, ambient moves and screen actions; emphasis stays on its beat', () => {
  const story = mini([{ id: 'a', duration: 4, move: 'moves/push-in', beats: [
    beat(0, 'headline', { emphasis: 'emphasis/pulse' }),
    { at: 0.5, slot: 'media', fx: 'devices/phone3d', screen: [{ do: 'screen/tap', at: 1, params: { at: '50%,50%' } }] },
  ] }]);
  const sch = schedule(story, editorial, { patterns: { 'devices/phone3d': { ambient: true } } });
  const m = timelineModel(sch, story, { format: '16x9' });
  const moves = m.lanes.find((l) => l.id === 'moves').clips;
  assert.deepEqual(moves.map((c) => [c.kind, c.fx, c.start, c.end]), [
    ['move', 'moves/push-in', 0, 4], ['move', 'devices/phone3d', 0.5, 4], ['screen', 'screen/tap', 1.5, 2.02]]);
  assert.ok(moves.every((c) => c.path === null && c.editable.at === false && c.editable.out === false && c.reason));
  assert.equal(new Set(m.lanes.flatMap((l) => l.clips).map((c) => c.id)).size, m.lanes.flatMap((l) => l.clips).length, 'ids are unique');
});

test('an implicit play shows as a screen clip on the moves lane', () => {
  const story = mini([{ id: 'a', duration: 4, beats: [{ at: 0, slot: 'media', fx: 'devices/phone', asset: 'assets/rec/' }] }]);
  const s = addImplicitPlays(structuredClone(story), () => ({ kind: 'sequence', fps: 30, frames: 60 }));
  const m = timelineModel(schedule(s, editorial), story, { format: '16x9' });
  const [play] = m.lanes.find((l) => l.id === 'moves').clips;
  assert.deepEqual([play.kind, play.fx, play.start, play.end], ['screen', 'screen/play', 0, 2]);
  assert.equal(beatClips(m)[0].path, '/scenes/0/beats/0');
});

test('a loop with autoReturn: the return is its own segment', async () => {
  const { raw, sch } = await built('fixtures/negatives/G-LOOP/auto', '16x9');
  const m = timelineModel(sch, raw, { format: '16x9' });
  const sub = beatClips(m).find((c) => c.selector.endsWith('"sub"]'));
  const it = sch.items.find((x) => x.slot === 'sub');
  assert.deepEqual(sub.segments.ret, [it.ret.start, ms(it.ret.start + it.ret.d)]);
  assert.deepEqual(sub.segments.rest, [ms(it.start + it.d), it.ret.start], 'the rest ends where the return starts');
  assert.equal(beatClips(m).find((c) => c.selector.endsWith('"headline"]')).segments.ret, undefined, 'an instant beat stays');
});

// ---- read-only ------------------------------------------------------------------------------------

test('a deck: every editable false with the reason; times in presses', async () => {
  const { raw, sch } = await built('pieces/golden-deck-kinetic', '16x9');
  const m = timelineModel(sch, raw, { format: '16x9' });
  assert.equal(m.kind, 'deck');
  assert.equal(m.duration, sch.presses);
  const all = [...m.scenes, ...m.lanes.flatMap((l) => l.clips)];
  assert.ok(all.length > 20);
  for (const x of all) {
    assert.ok(Object.values(x.editable).every((v) => v === false), x.id);
    assert.equal(x.reason, 'decks are read-only in the studio');
  }
  assert.equal(beatClips(m).length, sch.items.length);
  for (const c of beatClips(m)) {
    assert.ok(c.start >= 0 && c.end <= sch.presses && c.start <= c.end, `${c.id} ${c.start}..${c.end}`);
    assert.equal(ptr(raw, c.path).slot, sch.items[c.itemIndex].slot);
  }
});

test('a generated story: read-only, the reason names the generator', () => {
  const story = mini([{ id: 'a', duration: 3, beats: [beat(0, 'headline')] }], { generator: 'pieces/catalogue/build.mjs' });
  const m = timelineModel(schedule(story, editorial), story, { format: '16x9' });
  for (const x of [...m.scenes, ...beatClips(m)]) {
    assert.ok(Object.values(x.editable).every((v) => v === false));
    assert.match(x.reason, /pieces\/catalogue\/build\.mjs/);
  }
});

// ---- pathForSelector ------------------------------------------------------------------------------

test('pathForSelector: a slot, a descendant of a slot, a bare scene, nothing', () => {
  const story = mini([{ id: 'a', duration: 3, beats: [beat(0, 'headline'), beat(0.5, 'sub')] }, { id: 'b', duration: 3, beats: [beat(0, 'headline')] }]);
  const m = timelineModel(schedule(story, editorial), story, { format: '16x9' });
  assert.equal(pathForSelector(m, '[data-scene="a"] [data-slot="sub"]'), '/scenes/0/beats/1');
  assert.equal(pathForSelector(m, '[data-scene="b"] [data-slot="headline"] .word:nth-child(2)'), '/scenes/1/beats/0');
  assert.equal(pathForSelector(m, '[data-scene="a"] [data-slot="subline"]'), '/scenes/0', 'a prefix that is not a boundary does not match the beat');
  assert.equal(pathForSelector(m, '[data-scene="b"]'), '/scenes/1');
  assert.equal(pathForSelector(m, '[data-scene="zz"] [data-slot="sub"]'), null);
  assert.equal(pathForSelector(m, null), null);
});

test('the model is pure: the schedule and the story are left as they were', () => {
  const story = mini([{ id: 'a', duration: 3, beats: [beat(0, 'list', { text: 'a|b', params: { each: true } })] }]);
  const before = JSON.stringify(story);
  const sch = schedule(story, editorial);
  const items = sch.items.length;
  timelineModel(sch, story, { format: '16x9' });
  assert.equal(JSON.stringify(story), before);
  assert.equal(sch.items.length, items);
});

test('model.js and geometry.js import no node: module and no bare package, at any depth', () => {
  for (const f of ['scripts/studio/model.js', 'scripts/studio/geometry.js']) {
    assert.deepEqual(importGraph(join(ROOT, f)).bad, [], f);
    const src = readFileSync(join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /\bimport\s*\(/, `${f} has a dynamic import`);
  }
});

const VARIANTS = 'fixtures/negatives/_base/variants';
// The variant fixture through the gate's schedule path with `mutate` applied to the raw story first.
async function hostile(mutate, format = '16x9') {
  const raw = json(join(VARIANTS, 'story.json')), style = json(join(VARIANTS, 'style.json'));
  mutate(raw);
  const s = resolveStory(forFormat(structuredClone(raw), format), style);
  addImplicitPlays(s, () => null);
  const sch = schedule(s, style, { patterns: await loadPatterns(s, patternsBaseOf(join(ROOT, VARIANTS))) });
  return { raw, sch };
}
const misMapped = (raw, sch, m) => sch.items.flatMap((it, n) => {
  if (it.parent) return [];
  const c = beatClips(m).find((x) => x.itemIndex === n), src = ptr(raw, c.path);
  return src && src.slot === it.beat.slot && src.at === it.beat.at && src.text === it.beat.text ? [] : [`${c.id} ${c.path}`];
});

test('two scenes with one id: clips pair with scenes by position, and every path is the item\'s beat', async () => {
  const { raw, sch } = await hostile((r) => { r.scenes[1].id = r.scenes[0].id; });
  const m = timelineModel(sch, raw, { format: '16x9' });
  assert.deepEqual(m.scenes.slice(0, 2).map((s) => [s.id, s.index, s.path]), [['open', 0, '/scenes/0'], ['open', 1, '/scenes/1']]);
  assert.deepEqual(misMapped(raw, sch, m), []);
  const second = beatClips(m).filter((c) => c.path.startsWith('/scenes/1/'));
  assert.equal(second.length, raw.scenes[1].beats.length);
  assert.ok(second.every((c) => c.sceneStart === sch.scenes[1].start && c.id.startsWith('beat:1.')));
});

test('a schedule of another story is refused', async () => {
  const { raw, sch } = await hostile(() => {});
  assert.throws(() => timelineModel(sch, { ...raw, scenes: raw.scenes.slice(1) }, { format: '16x9' }), /schedule/);
  assert.throws(() => timelineModel(sch, { ...raw, scenes: [...raw.scenes].reverse() }, { format: '16x9' }), /schedule/);
});

test('format omitted on a story whose variant has beats is refused; without variant beats it defaults', async () => {
  const { raw, sch } = await hostile(() => {}, '9x16');
  assert.throws(() => timelineModel(sch, raw), /format/);
  const story = mini([{ id: 'a', duration: 3, beats: [beat(0, 'headline')] }]);
  assert.equal(beatClips(timelineModel(schedule(story, editorial), story))[0].path, '/scenes/0/beats/0');
});

test('an exit before the entrance: the clip ends no earlier than its landing, with the reason', async () => {
  const { raw, sch } = await hostile((r) => { const b = r.scenes[0].beats[1]; b.at = 3; b.out = 1; });
  const c = beatClips(timelineModel(sch, raw, { format: '16x9' })).find((x) => x.path === '/scenes/0/beats/1');
  assert.ok(c.end >= c.segments.enter[1] && c.end >= c.start, `${c.start}..${c.end}`);
  assert.ok(c.segments.rest[1] >= c.segments.rest[0]);
  assert.match(c.reason, /out before at/);
  assert.deepEqual(c.editable, { at: true, out: true }, 'still editable, so it can be fixed');
});

test('a bare-array beats.json gives its beats; strong: [] falls back to the downbeats', async () => {
  const { raw, sch } = await hostile(() => {});
  assert.deepEqual(timelineModel(sch, raw, { format: '16x9', grid: [1.5, 0, 0.5, 1] }).grid.beats, [0, 0.5, 1, 1.5]);
  const g = timelineModel(sch, raw, { format: '16x9', grid: { bpm: 120, beats: [0, 0.5, 1, 1.5, 2], downbeats: [0, 2], strong: [] } }).grid;
  assert.deepEqual([g.beats, g.strong, g.bpm], [[0, 0.5, 1, 1.5, 2], [0, 2], 120]);
  assert.deepEqual(timelineModel(sch, raw, { format: '16x9', grid: null }).grid.beats, []);
});

test('pathForSelector: a slot followed by a combinator, a pseudo-class, an attribute, a class or an id', () => {
  const story = mini([{ id: 'a', duration: 3, beats: [beat(0, 'headline'), beat(0.5, 'sub')] }]);
  const m = timelineModel(schedule(story, editorial), story, { format: '16x9' });
  const sel = '[data-scene="a"] [data-slot="sub"]';
  for (const tail of ['', ' span', '>span', ' > span', ':first-child', '[data-x]', '.word', '#w1']) assert.equal(pathForSelector(m, sel + tail), '/scenes/0/beats/1', JSON.stringify(tail));
  for (const tail of ['+span', '~span', 'x']) assert.equal(pathForSelector(m, sel + tail), '/scenes/0', `${JSON.stringify(tail)} is not inside the slot`);
});

test('cue, ambient move and screen clips carry the path of the beat they play on; a camera move carries null', () => {
  const story = mini([{ id: 'a', duration: 4, move: 'moves/push-in', beats: [
    beat(0, 'headline', { cue: 'sound/tick' }),
    { at: 0.5, slot: 'media', fx: 'devices/phone3d', screen: [{ do: 'screen/tap', at: 1 }] },
  ] }, { id: 'b', duration: 3, beats: [beat(0.2, 'headline', { cue: 'sound/tick' })] }]);
  const m = timelineModel(schedule(story, editorial, { patterns: { 'devices/phone3d': { ambient: true } } }), story, { format: '16x9' });
  assert.deepEqual(m.lanes.find((l) => l.id === 'cues').clips.map((c) => c.beat), ['/scenes/0/beats/0', '/scenes/1/beats/0']);
  assert.deepEqual(m.lanes.find((l) => l.id === 'moves').clips.map((c) => [c.kind, c.beat]), [['move', null], ['move', '/scenes/0/beats/1'], ['screen', '/scenes/0/beats/1']]);
});
