// Params and cascades, the pure half: the schedule expands data-each cascades, the
// story schema carries cutParams / moveParams / params.exit, and deck scenes list their move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schedule, selectorOf } from '../../runtime/kit/schedule.js';
import { validators } from '../../scripts/lib/validate.mjs';

const json = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const editorial = json('styles/presets/editorial.json');   // stagger eachS 0.07, capS 0.6
const close = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${msg ?? ''} ${a} ≠ ${b}`);
const v = validators();

const base = (kind, scenes) => ({
  id: 'follow-up', kind, formats: ['16x9'], title: 'follow-up', language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, scenes, cta: { text: 'x', url: 'x' },
});
const filmScene = (beats, extra = {}) => ({ id: 's1', layout: 'layouts/title-stack', duration: 5, cut: 'transitions/hard-cut', move: null, beats, say: '', ...extra });

test('each: a beat with params.each lists one arrival per child, staggered by stagger.eachS', () => {
  const story = base('film', [filmScene([{ at: 0.5, slot: 'list', fx: 'entrances/fade', text: 'one|two|three|four', params: { each: true } }])]);
  const s = schedule(story, editorial);
  const parent = selectorOf('s1', 'list');
  const arrivals = s.events.filter((e) => e.kind === 'arrive');
  assert.deepEqual(arrivals.map((e) => e.selector), [1, 2, 3, 4].map((k) => `${parent} > :nth-child(${k})`));
  arrivals.forEach((e, k) => close(e.t, 0.5 + k * 0.07, `child ${k}`));
  const d = editorial.motion.durations.standard / 1000;
  const it = s.items.find((x) => x.selector === parent);
  assert.equal(it.each.n, 4);
  close(it.each.step, 0.07);
  close(it.d, 3 * 0.07 + d, 'the parent lasts the whole cascade');
  assert.equal(s.items.filter((x) => x.parent === it).length, 4);
});

test('each: the whole cascade is capped at stagger.capS, and params.stagger overrides eachS', () => {
  const words = Array.from({ length: 11 }, (_, i) => `w${i}`).join('|');
  const story = base('film', [filmScene([
    { at: 0, slot: 'a', fx: 'entrances/fade', text: words, params: { each: true } },
    { at: 0, slot: 'b', fx: 'entrances/fade', text: 'x|y|z', params: { each: true, stagger: 0.15 } },
  ])]);
  const s = schedule(story, editorial);
  const a = s.events.filter((e) => e.kind === 'arrive' && e.selector.startsWith(selectorOf('s1', 'a')));
  assert.equal(a.length, 11);
  close(a.at(-1).t - a[0].t, 0.6, 'span capped at capS');
  const b = s.events.filter((e) => e.kind === 'arrive' && e.selector.startsWith(selectorOf('s1', 'b')));
  close(b[1].t - b[0].t, 0.15);
});

test('each: the kit can supply the child count (layout children, fragments) through opts.each', () => {
  const story = base('film', [filmScene([{ at: 0, slot: 'list', fx: 'entrances/fade' }])]);
  const s = schedule(story, editorial, { each: { [selectorOf('s1', 'list')]: { n: 3, stagger: 0.1 } } });
  const a = s.events.filter((e) => e.kind === 'arrive');
  assert.equal(a.length, 3);
  close(a[2].t, 0.2);
});

test('each: departures never stagger (one depart on the parent, exitRatio of one child entrance)', () => {
  const story = base('film', [filmScene([{ at: 0, slot: 'list', fx: 'entrances/fade', text: 'a|b|c', params: { each: true }, out: 4, exit: 'exits/fade-out' }])]);
  const s = schedule(story, editorial);
  const departs = s.events.filter((e) => e.kind === 'depart');
  assert.equal(departs.length, 1);
  assert.equal(departs[0].selector, selectorOf('s1', 'list'));
  close(departs[0].d, editorial.motion.exitRatio * editorial.motion.durations.standard / 1000);
});

test('each: in a deck the cascade lengthens its press and lists each child', () => {
  const story = base('deck', [{ id: 's1', layout: 'layouts/title-stack', presses: 1, cut: 'transitions/hard-cut', move: null, say: '',
    beats: [{ at: 0.2, step: 1, slot: 'list', fx: 'entrances/fade', text: 'a|b|c', params: { each: true } }] }]);
  const s = schedule(story, editorial);
  const a = s.events.filter((e) => e.kind === 'arrive');
  assert.equal(a.length, 3);
  const d = editorial.motion.durations.standard / 1000;
  close(s.pressLengths[1], 0.2 + 2 * 0.07 + d);
  close(a[2].at, 0.2 + 0.14);
});

test('deck: a scene move is listed across its presses', () => {
  const story = base('deck', [
    { id: 's1', layout: 'layouts/title-stack', presses: 1, cut: 'transitions/hard-cut', move: null, say: '', beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'a' }] },
    { id: 's2', layout: 'layouts/title-stack', presses: 3, cut: 'transitions/hard-cut', move: 'moves/push-in', say: '', beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'b' }] },
  ]);
  const s = schedule(story, editorial);
  const m = s.events.find((e) => e.kind === 'move' && e.scene === 's2');
  assert.ok(m, 'deck move event');
  assert.equal(m.pattern, 'moves/push-in');
  assert.equal(m.from, 1);
  assert.equal(m.to, 4);
});

test('schema: scenes take cutParams and moveParams (scalar values); params.exit / params.emphasis are bags', () => {
  const s = json('fixtures/golden/story.film.json');
  s.scenes[1].cutParams = { direction: 'up' };
  s.scenes[1].moveParams = { to: 1.1, focus: 'headline' };
  s.scenes[0].beats[0].params = { d: 0.4, exit: { side: 'left' }, emphasis: { strength: 0.3 }, each: true };
  assert.ok(v.story(s), JSON.stringify(v.story.errors));
  const bad = structuredClone(s);
  bad.scenes[1].cutParams = { direction: { nested: 1 } };
  assert.equal(v.story(bad), false);
  const bad2 = structuredClone(s);
  bad2.scenes[1].moveParam = {};
  assert.equal(v.story(bad2), false, 'scenes keep additionalProperties false');
  const bad3 = structuredClone(s);
  bad3.scenes[0].beats[0].params.exit = { side: { x: 1 } };
  assert.equal(v.story(bad3), false);
});

test('units: entrances/slam and entrances/drop travel in multiples of ctx.unit, not px', async () => {
  for (const ref of ['entrances/slam', 'entrances/drop']) {
    const mod = (await import(`../../patterns/${ref}/pattern.js`)).default;
    const dy = (unit) => {
      const el = { style: {} };
      mod.at(el, 0.5, { params: {}, style: editorial, unit, format: '9x16' });
      return Number(/^0 (-?[\d.]+)px$/.exec(el.style.translate)[1]);
    };
    const tall = dy(168), wide = dy(136);
    close(tall / wide, 168 / 136, ref, 1e-3);
    assert.ok(Math.abs(tall) < 168, `${ref} travels ${tall}px at p = 0.5 in 9x16`);
  }
});
