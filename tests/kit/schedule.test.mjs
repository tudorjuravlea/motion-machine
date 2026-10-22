// the timeline algebra and schedule() (SPEC §6, §10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clip, seq, par, delay, stagger, overlap, transition, schedule } from '../../runtime/kit/schedule.js';
import { spring } from '../../runtime/kit/springs.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const editorial = json('styles/presets/editorial.json');
const film = json('fixtures/schedule/named-patterns.film.json');
const deck = json('fixtures/schedule/named-patterns.deck.json');
const close = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${msg ?? ''} ${a} ≠ ${b}`);
const ms = (x) => Math.round(x * 1000) / 1000;   // schedule times are whole milliseconds

test('clip clamps local time to [0, d]', () => {
  const c = clip(2, (u) => u);
  assert.equal(c.d, 2);
  assert.equal(c.f(-1), 0);
  assert.equal(c.f(1.5), 1.5);
  assert.equal(c.f(9), 2);
});

test('seq has cumulative starts and the summed duration', () => {
  const s = seq(clip(1, (u) => u), clip(2, (u) => u), clip(0.5, (u) => u));
  assert.equal(s.d, 3.5);
  assert.deepEqual(s.starts, [0, 1, 3]);
  assert.deepEqual(s.f(2), [1, 1, 0]);
});

test('par lasts as long as its longest child', () => {
  const p = par(clip(1, (u) => u), clip(2.5, (u) => u));
  assert.equal(p.d, 2.5);
  assert.deepEqual(p.f(2), [1, 2]);
});

test('delay shifts a node and adds to its duration', () => {
  const x = delay(0.4, clip(1, (u) => u));
  assert.equal(x.d, 1.4);
  assert.equal(x.f(0.2), 0);
  close(x.f(0.9), 0.5);
});

test('stagger from center is a par of delays, symmetric about the middle', () => {
  const items = Array.from({ length: 5 }, () => clip(0.5, (u) => u));
  const s = stagger(0.1, items, { from: 'center' });
  close(s.d, 0.7);
  s.offsets.forEach((o, i) => close(o, [0.2, 0.1, 0, 0.1, 0.2][i], `offset ${i}`));
  const first = stagger(0.1, items, { from: 'first' });
  first.offsets.forEach((o, i) => close(o, i * 0.1));
  const last = stagger(0.1, items, { from: 'last' });
  last.offsets.forEach((o, i) => close(o, (4 - i) * 0.1));
  const idx = stagger(0.1, items, { from: 'index', index: 1 });
  idx.offsets.forEach((o, i) => close(o, Math.abs(i - 1) * 0.1));
  // a cap bounds the whole cascade (style.motion.stagger.capS)
  const capped = stagger(0.5, items, { from: 'first', cap: 0.6 });
  close(capped.offsets[4], 0.6);
  close(capped.d, 1.1);
});

test('overlap is a seq with a negative gap', () => {
  const o = overlap(clip(1, (u) => u), clip(2, (u) => u), 0.3);
  close(o.d, 2.7);
  close(o.starts[1], 0.7);
});

test('transition overlaps two nodes by d and its progress drives the pattern', () => {
  const t = transition(clip(3, (u) => u), clip(3, (u) => u), 'transitions/crossfade', 0.5);
  close(t.d, 5.5);
  close(t.starts[1], 2.5);
  assert.equal(t.pattern, 'transitions/crossfade');
  assert.equal(t.f(2).p, 0);
  close(t.f(2.75).p, 0.5);
  assert.equal(t.f(4).p, 1);
});

test('golden film: duration, scene starts, cuts and every arrival', () => {
  const s = schedule(film, editorial);
  assert.equal(s.duration, 30);
  close(s.timeline.d, 30, 'the algebra measures the same duration');
  assert.deepEqual(s.scenes.map((x) => x.start), [0, 3.5, 7, 11, 15, 19, 23, 26.5]);
  const std = editorial.motion.durations.standard / 1000;
  const cuts = s.events.filter((e) => e.kind === 'cut');
  assert.equal(cuts.length, 8);
  assert.equal(cuts[0].d, 0, 'hard cut has no duration');
  cuts.slice(1).forEach((c) => close(c.d, std, c.pattern));
  const arrivals = s.events.filter((e) => e.kind === 'arrive');
  const expected = [0.2, 1.3, 3.7, 7.2, 8.0, 8.2, 11.2, 12.0, 12.4, 15.2, 16.0, 16.2, 16.4, 19.2, 20.4, 21.0, 23.2, 24.4, 26.7, 27.3];
  // the golden film has 20 beats
  assert.equal(arrivals.length, film.scenes.reduce((n, sc) => n + sc.beats.length, 0));
  assert.equal(arrivals.length, expected.length);
  arrivals.forEach((a, i) => close(a.t, expected[i], `arrival ${i} (${a.selector})`, 1e-9));
  assert.equal(arrivals[0].selector, '[data-scene="hook"] [data-slot="headline"]');
  assert.equal(arrivals[0].scene, 'hook');
  arrivals.forEach((a) => close(a.d, std, a.selector));
  // cues ride on their beats
  const cues = s.events.filter((e) => e.kind === 'cue');
  assert.deepEqual(cues.map((c) => c.cue), ['hit', 'tick', 'tick', 'tick', 'tick', 'tick', 'tick', 'riser', 'complete']);
  close(cues[0].t, 0.2);
  // moves span their scene's slot
  const moves = s.events.filter((e) => e.kind === 'move' && e.pattern.startsWith('moves/'));
  assert.deepEqual(moves.map((m) => [m.scene, m.t, m.d]), [['problem', 3.5, 3.5], ['patterns', 15, 4]]);
  // events are in time order
  for (let i = 1; i < s.events.length; i++) assert.ok(s.events[i].t >= s.events[i - 1].t);
  // a rest per scene, at the instant its last arrival settles
  assert.equal(s.rests.length, 8);
  close(s.rests[0], 1.3 + std);
  close(s.rests.at(-1), 27.3 + std);
});

test('film: spring-driven entrances contribute their settle time; roles pick durations', () => {
  const story = structuredClone(film);
  story.scenes[0].beats[0].params = { spring: 'ui' };
  story.scenes[0].beats[1].params = { dur: 'slow' };
  const s = schedule(story, editorial);
  const [a, b] = s.events.filter((e) => e.kind === 'arrive');
  close(a.d, ms(spring.settle(editorial.motion.spring.ui)));
  assert.equal(a.spring.k, 420);
  close(b.d, editorial.motion.durations.slow / 1000);
  // pattern metadata supplies a default role or spring
  const s2 = schedule(film, editorial, { patterns: { 'entrances/slam': { spring: 'heavy' }, 'transitions/push': { dur: 'quick' } } });
  close(s2.events.find((e) => e.kind === 'arrive').d, ms(spring.settle(editorial.motion.spring.heavy)));
  close(s2.events.filter((e) => e.kind === 'cut')[1].d, editorial.motion.durations.quick / 1000);
});

test('film: an explicit out departs with exitRatio of its entrance', () => {
  const story = structuredClone(film);
  story.scenes[0].beats[1].out = 3.0;
  story.scenes[0].beats[1].exit = 'exits/fade-out';
  const s = schedule(story, editorial);
  const dep = s.events.find((e) => e.kind === 'depart');
  close(dep.t, 3.0);
  close(dep.d, 0.7 * 0.52);
  assert.equal(dep.pattern, 'exits/fade-out');
});

test('golden deck: presses, consecutive scene presses and integer rests', () => {
  const s = schedule(deck, editorial);
  assert.equal(s.presses, 10);
  assert.deepEqual(s.rests, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(s.scenes.map((x) => [x.id, x.start, x.end]),
    [['hook', 0, 1], ['problem', 1, 2], ['time', 2, 4], ['style', 4, 6], ['patterns', 6, 7], ['gate', 7, 8], ['both', 8, 9], ['cta', 9, 10]]);
  const arrivals = s.events.filter((e) => e.kind === 'arrive');
  assert.ok(arrivals.every((e) => Number.isInteger(e.press) && e.press >= 1 && e.press <= 10));
  // data-step maps to the press within the scene: "time" step 2 is global press 4
  const fig = arrivals.find((e) => e.selector === '[data-scene="time"] [data-slot="figure"]');
  assert.equal(fig.press, 4);
  // every arrival finishes inside its press, so every integer is a rest
  assert.ok(arrivals.every((e) => e.to <= e.press + 1e-12 && e.from >= e.press - 1));
  // a cut on the first press of every scene after the first
  const cuts = s.events.filter((e) => e.kind === 'cut');
  assert.deepEqual(cuts.map((c) => c.press), [0, 2, 3, 5, 7, 8, 9, 10]);
  assert.equal(s.pressLengths.length, 11);
  assert.ok(s.pressLengths.slice(1).every((L) => L > 0));
});

test('schedule.js is pure: no clock, no randomness, no DOM', () => {
  const src = readFileSync(new URL('../../runtime/kit/schedule.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Date|Math\.random|performance|setTimeout|setInterval|requestAnimationFrame|document|window/);
});

const cascadeStory = (stagger) => ({
  id: 'c', kind: 'film', formats: ['9x16'], title: 'c', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null },
  scenes: [{ id: 's', layout: 'layouts/statement', duration: 6, cut: 'transitions/hard-cut', move: null, say: '',
    beats: [{ at: 0.4, slot: 'headline', fx: 'entrances/fade', text: 'One | two | three', params: { each: true, stagger } }] }],
});

test('a cascade stagger that is not a finite number of seconds >= 0 falls back to the style spacing, with one warning', () => {
  const parentOf = (s) => s.items.find((i) => !i.parent);
  const good = schedule(cascadeStory(undefined), editorial);
  assert.equal(good.warnings.filter((w) => /stagger/.test(w)).length, 0);
  for (const bad of ['fast', -1, Infinity]) {
    const s = schedule(cascadeStory(bad), editorial);
    assert.ok(Number.isFinite(parentOf(s).d) && parentOf(s).d > 0, `d for stagger ${bad}`);
    assert.deepEqual(parentOf(s).each.offsets, parentOf(good).each.offsets, `offsets for stagger ${bad}`);
    assert.equal(s.rests.length, 1, `a rest for stagger ${bad}`);
    assert.equal(s.warnings.filter((w) => /stagger/.test(w)).length, 1, `one warning for stagger ${bad}`);
  }
});

// A cut whose module sizes itself by its params (`durOf(cutParams)`, e.g. a transition's `speed`).
const paced = { dur: 1.3, durOf: (p = {}) => 1.3 / Math.min(2, Math.max(0.5, Number(p.speed) || 1)) };

test('a cut module with durOf(params) takes its length from the scene\'s cutParams, in a film and a deck', () => {
  const story = structuredClone(film);
  story.scenes[1].cutParams = { speed: 2 };
  const s = schedule(story, editorial, { patterns: { 'transitions/push': paced } });
  const cut = s.events.filter((e) => e.kind === 'cut')[1];
  close(cut.d, 0.65, 'speed 2 halves the 1.3 s cut');
  close(s.scenes[1].start, 3.5, 'the scene still starts on its slot');
  const plain = schedule(film, editorial, { patterns: { 'transitions/push': paced } });
  close(plain.events.filter((e) => e.kind === 'cut')[1].d, 1.3, 'no speed: durOf gives the module\'s own length');
  const d = structuredClone(deck);
  const k = d.scenes.findIndex((sc, i) => i > 0 && sc.cut === 'transitions/push');
  assert.ok(k > 0, 'the golden deck has a push cut');
  d.scenes[k].cutParams = { speed: 0.5 };
  const sd = schedule(d, editorial, { patterns: { 'transitions/push': paced } });
  close(sd.scenes[k].cut.d, 2.6, 'speed 0.5 doubles it in a deck');
});

test('without durOf, cutParams leave every schedule exactly as it was', () => {
  for (const base of [film, deck]) {
    const story = structuredClone(base);
    story.scenes.forEach((sc) => { sc.cutParams = { speed: 2, dur: 'slow' }; });
    for (const patterns of [{}, { 'transitions/push': { dur: 'quick' } }, { 'transitions/push': { dur: 1.3 } }]) {
      assert.deepEqual(JSON.parse(JSON.stringify(schedule(story, editorial, { patterns }))), JSON.parse(JSON.stringify(schedule(base, editorial, { patterns }))));
    }
  }
});

test('transitions/flood: speed sets its cut, 1.3 s divided by it, and no speed keeps 1.3 s', async () => {
  const flood = (await import('../../patterns/transitions/flood/pattern.js')).default;
  const cutOf = (cutParams) => {
    const story = structuredClone(film);
    story.scenes[1].cut = 'transitions/flood';
    if (cutParams) story.scenes[1].cutParams = cutParams;
    return schedule(story, editorial, { patterns: { 'transitions/flood': flood } }).events.filter((e) => e.kind === 'cut')[1].d;
  };
  close(cutOf(null), 1.3, 'no cutParams');
  close(cutOf({ to: 'headline' }), 1.3, 'no speed');
  close(cutOf({ speed: 0.5 }), 2.6, 'speed 0.5');
  close(cutOf({ speed: 2 }), 0.67, 'speed 2 stops at the phases\' floors');
});
