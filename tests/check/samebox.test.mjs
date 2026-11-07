// W-SAMEBOX (SPEC §7): the anti-template check. fixtures/negatives/W-SAMEBOX is five scenes of one layout
// (kicker, headline, line, note), so every scene puts its content in the same four boxes. The variants
// change the layouts and beats of some scenes; the pure functions are tested without a browser.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { gate, warnsOnly, row } from './_harness.mjs';
import { variant, cleanup, scene } from './_variant.mjs';
import { MAX_AREA, MIN_AREA, MIN_BOXES, MIN_SCENES, QUANT, SHARE, boxKey, judge, signatureOf } from '../../scripts/check/W-SAMEBOX.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-SAMEBOX'] };
const check = async (dir) => row(await run(dir, only), 'W-SAMEBOX');

/** The W-SAMEBOX negative with `edit(story, style)` applied. */
const samebox = (edit) => variant('W-SAMEBOX', ({ story, style }) => edit(story, style));
/** Drops the beat in `slot` from the scene `id`. */
const drop = (story, id, slot) => { const sc = scene(story, id); sc.beats = sc.beats.filter((b) => b.slot !== slot); };

test('the limits are half the scenes, from four scenes, three boxes, on a 5 % grid', () => {
  assert.deepEqual([SHARE, MIN_SCENES, MIN_BOXES, QUANT], [0.5, 4, 3, 0.05]);
  assert.ok(MAX_AREA > 0.5 && MIN_AREA < 0.01);
});

test('boxKey snaps a box to the grid as a share of the frame', () => {
  const frame = { w: 1000, h: 500 };
  assert.equal(boxKey({ x: 100, y: 50, w: 400, h: 100 }, frame), '2,2,8,4');
  assert.equal(boxKey({ x: 110, y: 60, w: 410, h: 110 }, frame), '2,2,8,4', 'a few pixels apart is the same box');
  assert.notEqual(boxKey({ x: 100, y: 50, w: 500, h: 100 }, frame), '2,2,8,4', 'a tenth of the frame wider is another box');
  assert.equal(boxKey({ x: 100, y: 50, w: 400, h: 100 }, frame, 0.1), '1,1,4,2', 'the grid is a parameter');
});

test('signatureOf keeps the content the viewer reads and leaves out scenery, hairlines, decoration and what is still arriving', () => {
  const frame = { w: 1000, h: 500 };
  const el = (over) => ({ scene: 's', text: 'words', box: { x: 100, y: 100, w: 400, h: 100 }, ...over });
  const elements = [
    el({}),
    el({ box: { x: 100, y: 250, w: 400, h: 100 } }),
    el({ text: '', painted: true, box: { x: 600, y: 100, w: 300, h: 300 } }),   // a card
    el({ box: { x: 0, y: 0, w: 1000, h: 500 } }),                              // the stage: over MAX_AREA
    el({ text: '', painted: true, box: { x: 100, y: 400, w: 400, h: 2 } }),   // a hairline
    el({ decor: true, box: { x: 10, y: 10, w: 200, h: 200 } }),
    el({ chrome: true, box: { x: 20, y: 20, w: 200, h: 200 } }),
    el({ caption: true, box: { x: 30, y: 30, w: 200, h: 200 } }),
    el({ moving: true, box: { x: 40, y: 40, w: 200, h: 200 } }),
    el({ pseudo: 'before', box: { x: 50, y: 50, w: 200, h: 200 } }),
    el({ scene: 'other', box: { x: 60, y: 60, w: 200, h: 200 } }),
    el({ text: '', painted: false, box: { x: 70, y: 70, w: 200, h: 200 } }),    // a wrapper: no text, no paint
  ];
  assert.deepEqual(signatureOf(elements, 's', frame), ['12,4,6,12', '2,10,8,4', '2,4,8,4']);
  assert.deepEqual(signatureOf([el({}), el({})], 's', frame), ['2,4,8,4'], 'one box once, however many elements fill it');
});

const sc = (scene, layout, ...boxes) => ({ scene, layout, signature: boxes.sort() });
const A = ['1,1,5,2', '1,4,5,2', '1,7,5,2'];

test('judge: more than half of four or more scenes on one signature is a template', () => {
  const j = judge([sc('a', 'l1', ...A), sc('b', 'l2', '1,1,2,2', '3,3,2,2', '5,5,2,2'), sc('c', 'l3', ...A), sc('d', 'l4', ...A)]);
  assert.deepEqual(j.shared.scenes, ['a', 'c', 'd']);
  assert.equal(j.shared.of, 4);
  const half = judge([sc('a', 'l1', ...A), sc('b', 'l2', '1,1,2,2', '3,3,2,2', '5,5,2,2'), sc('c', 'l3', ...A), sc('d', 'l4', '2,2,2,2', '4,4,2,2', '6,6,2,2')]);
  assert.equal(half.shared, null, 'exactly half is not more than half');
});

test('judge: fewer than four scenes cannot be a template, and a title of two boxes is not a card', () => {
  assert.equal(judge([sc('a', 'l', ...A), sc('b', 'l', ...A), sc('c', 'l', ...A)]).shared, null);
  const titles = [1, 2, 3, 4, 5].map((i) => sc(`t${i}`, `l${i}`, '1,1,5,2', '1,4,5,2'));
  const j = judge(titles);
  assert.equal(j.shared, null);
  assert.equal(j.counted, 0);
});

test('judge: two neighbours of one layout and one signature differ in text only; another layout does not count', () => {
  const j = judge([sc('a', 'l1', ...A), sc('b', 'l1', ...A), sc('c', 'l2', '1,1,2,2', '3,3,2,2', '5,5,2,2'), sc('d', 'l3', '2,2,2,2', '4,4,2,2', '6,6,2,2')]);
  assert.deepEqual(j.pairs, [{ a: 'a', b: 'b', layout: 'l1' }]);
  const other = judge([sc('a', 'l1', ...A), sc('b', 'l2', ...A), sc('c', 'l3', '1,1,2,2', '3,3,2,2', '5,5,2,2'), sc('d', 'l4', '2,2,2,2', '4,4,2,2', '6,6,2,2')]);
  assert.deepEqual(other.pairs, [], 'the same boxes by another layout are a choice, not a copy');
});

test('fixtures/negatives/W-SAMEBOX warns W-SAMEBOX and nothing else: five scenes in the same four boxes', async () => {
  const r = warnsOnly(await run('W-SAMEBOX'), 'W-SAMEBOX');
  assert.deepEqual(r.evidence.scenes, ['open', 'style', 'rests', 'sizes', 'close']);
  assert.equal(r.evidence.measured, 1);
  assert.equal(r.evidence.signature.length, 4);
  assert.match(r.evidence.reason, /5 of 5 scenes \(open, style, rests, sizes, close\) put their content in the same boxes/);
  assert.match(r.evidence.threshold, /more than 50 % of 4\+ scenes/);
});

test('three scenes of five in the same boxes are still more than half; two are not', async () => {
  // two scenes lose their note, so they carry one three-box signature; the other three keep four boxes
  const three = await check(samebox((story) => { drop(story, 'open', 'note'); drop(story, 'rests', 'note'); }));
  assert.equal(three.status, 'WARN');
  assert.deepEqual(three.evidence.scenes, ['style', 'sizes', 'close']);
  // four boxes, two (no kicker, no note: a title, which counts for nothing), no note, no kicker, no note: at most two scenes
  // share a signature (the two without a note) and no neighbours match
  const varied = await check(samebox((story) => {
    drop(story, 'rests', 'note'); drop(story, 'sizes', 'kicker'); drop(story, 'close', 'note');
    drop(story, 'style', 'kicker'); drop(story, 'style', 'note');
  }));
  assert.equal(varied.status, 'PASS', JSON.stringify(varied.evidence));
  assert.equal(varied.evidence.measured, 0.4);
});

test('two neighbours of one layout that differ in text only warn, even when the piece as a whole varies', async () => {
  const r = await check(samebox((story) => {
    // open and style stay as they are; the three after them each take a different set of boxes
    drop(story, 'rests', 'note');
    drop(story, 'sizes', 'kicker');
    drop(story, 'close', 'kicker'); drop(story, 'close', 'note');
  }));
  assert.equal(r.status, 'WARN');
  assert.deepEqual(r.evidence.scenes, ['open', 'style']);
  assert.match(r.evidence.reason, /open and style use layouts\/title-stack with every box in the same place and differ only in text/);
});

test('a style\'s gate.sameBox sets the share and the evidence says so', async () => {
  // four boxes, three, four, three, four: three of five share one signature (60 %), and no neighbours match
  const alternate = (story, style) => { drop(story, 'style', 'note'); drop(story, 'sizes', 'note'); if (style) style.gate = { sameBox: { share: 0.7 } }; };
  assert.equal((await check(samebox((story) => alternate(story)))).status, 'WARN');
  const wide = await check(samebox((story, style) => alternate(story, style)));
  assert.equal(wide.status, 'PASS', JSON.stringify(wide.evidence));
  assert.match(wide.evidence.threshold, /more than 70 % of/);
  const lenient = await check(samebox((story, style) => { style.gate = { sameBox: { share: 1 } }; }));
  assert.equal(lenient.status, 'WARN', 'the share does not silence the neighbours test');
  assert.deepEqual(lenient.evidence.scenes, ['open', 'style']);
  const minScenes = await check(samebox((story, style) => { style.gate = { sameBox: { minScenes: 6 } }; }));
  assert.equal(minScenes.status, 'SKIP');
  assert.match(minScenes.evidence.reason, /5 scenes at a rest; the check reads 6 or more/);
});

test('a short film and a piece of titles are SKIP, never PASS', async () => {
  const short = await check(samebox((story) => { story.scenes = story.scenes.slice(0, 3); }));
  assert.equal(short.status, 'SKIP');
  assert.match(short.evidence.reason, /3 scenes at a rest; the check reads 4 or more/);
  const titles = await check(samebox((story) => { for (const s of story.scenes) { drop(story, s.id, 'kicker'); drop(story, s.id, 'note'); } }));
  assert.equal(titles.status, 'SKIP');
  assert.match(titles.evidence.reason, /no scene has 3 or more content boxes/);
});

test('a deck is read at the last rest of each scene, and the golden deck and film pass', async () => {
  const deck = await check(join(ROOT, 'pieces', 'golden-deck-kinetic'));
  assert.equal(deck.status, 'PASS', JSON.stringify(deck.evidence));
  assert.equal(deck.evidence.scenes, 8);
  assert.deepEqual(deck.evidence.signatures.map((s) => s.boxes), [2, 1, 3, 3, 6, 3, 2, 2]);
  const film = await check(join(ROOT, 'pieces', 'golden-film-kinetic'));
  assert.equal(film.status, 'PASS', JSON.stringify(film.evidence));
  assert.ok(film.evidence.measured <= 0.5, 'no signature on more than half of the scenes');
});
