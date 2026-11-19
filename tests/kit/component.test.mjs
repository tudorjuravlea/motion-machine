// runtime/kit/component.js and ui/component without a browser: the motion spec read from `--mm-motion`, the
// value a share of the way between two computed values, the toast script read and checked, the beat's length,
// and the schedule's step events for a script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { motionOf, mix, stateAt } from '../../runtime/kit/component.js';
import component, { stepsOf, durationOf, sheetMotion } from '../../patterns/ui/component/pattern.js';
import { SNAP } from '../../runtime/kit/inertia.js';
import { schedule } from '../../runtime/kit/schedule.js';

test('motionOf reads the grammar of transition: a property, a duration, an easing and a delay', () => {
  const m = motionOf('translate 250ms cubic-bezier(0.2, 0, 0, 1), opacity 0.4s ease-out 50ms, height 120ms');
  assert.deepEqual(m.get('translate'), { d: 0.25, delay: 0, ease: 'cubic-bezier(0.2, 0, 0, 1)' });
  assert.deepEqual(m.get('opacity'), { d: 0.4, delay: 0.05, ease: 'ease-out' });
  assert.deepEqual(m.get('height'), { d: 0.12, delay: 0, ease: 'ease' }, 'the easing defaults to ease, as in CSS');
  assert.equal(motionOf('none').size, 0);
  assert.equal(motionOf('').size, 0);
  assert.equal(motionOf(undefined).size, 0);
  assert.deepEqual(motionOf('scale 300ms linear(0, 0.5 40%, 1)').get('scale').ease, 'linear(0, 0.5 40%, 1)', 'commas inside an easing stay in it');
});

test('mix interpolates numbers token by token, fills in translate, scale and rotate, and switches halfway otherwise', () => {
  assert.equal(mix('opacity', '0', '1', 0.25), '0.25');
  assert.equal(mix('translate', '0px 120px', '0px -24px', 0.5), '0px 48px');
  assert.equal(mix('translate', 'none', '0px -24px', 0.5), '0px -12px', 'none is 0px 0px');
  assert.equal(mix('translate', '10px', '0px 20px', 0.5), '5px 10px', 'a lone x has a 0px y');
  assert.equal(mix('scale', 'none', '0.9', 0.5), '0.95');
  assert.equal(mix('height', '200px', '142px', 1), '142px');
  assert.equal(mix('height', '200px', '142px', 0), '200px');
  assert.equal(mix('translate', '0px 0px', '0px -100px', 1.1), '0px -110px', 'an easing that overshoots carries the value past');
  assert.equal(mix('display', 'block', 'none', 0.49), 'block');
  assert.equal(mix('display', 'block', 'none', 0.5), 'none');
  assert.equal(mix('background-color', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', 0.3), 'color-mix(in oklab, rgb(255, 255, 255) 30%, rgb(0, 0, 0))', 'colours mix in Oklab');
  assert.equal(mix('color', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', 1.2), 'rgb(255, 255, 255)', 'a colour never overshoots');
});

test('stateAt is the last state at or before t, the first before the part enters', () => {
  const states = [{ at: 1, n: 'a' }, { at: 2, n: 'b' }, { at: 4, n: 'c' }];
  assert.equal(stateAt(states, 0).n, 'a');
  assert.equal(stateAt(states, 2).n, 'b');
  assert.equal(stateAt(states, 3.9).n, 'b');
  assert.equal(stateAt(states, 9).n, 'c');
});

test('the toast script: one step a line, put in time order, each verb checked with its line', () => {
  const s = stepsOf({ steps: '2 expand\n0.5 add Saved | Two files\n\n  3.25 dismiss 1\n4 dismiss front\n5 close\n6 dismiss' });
  assert.deepEqual(s.map((x) => [x.at, x.verb, x.arg]), [[0.5, 'add', 'Saved | Two files'], [2, 'expand', ''], [3.25, 'dismiss', '1'], [4, 'dismiss', 'front'], [5, 'close', ''], [6, 'dismiss', '']]);
  assert.throws(() => stepsOf({ steps: '1 wave hello' }), /line 1: toast knows add, dismiss, expand, close, not "wave"/);
  assert.throws(() => stepsOf({ steps: '0.5 add Saved\nadd Later' }), /line 2 must read "<seconds> <verb> <argument>"/);
  assert.throws(() => stepsOf({ steps: '1 add' }), /line 1: add needs a title/);
  assert.throws(() => stepsOf({ steps: '1 dismiss last' }), /dismiss takes "front" or a number/);
  assert.throws(() => stepsOf({ kind: 'carousel', steps: '' }), /unknown kind "carousel"/);
  assert.deepEqual(stepsOf({}), []);
});

test('the beat lasts its last step plus hold (1.2 s unless set)', () => {
  assert.equal(durationOf({ steps: '0.6 add A\n3 close' }), 4.2);
  assert.equal(durationOf({ steps: '0.6 add A\n3 close', hold: 0.5 }), 3.5);
  assert.equal(durationOf({}), 1.2);
});

test('the schedule gives the beat its length and an event at every step of the script', () => {
  const story = JSON.parse(readFileSync(new URL('../../patterns/ui/component/demo/story.json', import.meta.url), 'utf8'));
  const style = JSON.parse(readFileSync(new URL('../../styles/presets/calm-product.json', import.meta.url), 'utf8'));
  const sch = schedule(story, style, { patterns: { 'ui/component': component } });
  // the toast scene, the menu from 8.4 s, the tabs from 13.6 s, the sheet from 19.6 s
  assert.deepEqual(sch.events.filter((e) => e.kind === 'step').map((e) => e.t), [0.6, 1.6, 2.6, 3.6, 4.8, 5.6, 9.2, 9.8, 10.2, 10.6, 11.1, 14.6, 15.8, 16.9, 20.2, 21.6, 23, 24.2]);
  assert.deepEqual(sch.rests, [6.8, 12.3, 18.1, 25.4]);
});

test('component.js is pure of clocks and randomness', () => {
  const src = readFileSync(new URL('../../runtime/kit/component.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /Date\.now|performance\.now|Math\.random|requestAnimationFrame|setTimeout|setInterval|\btransition\s*:/);
});

test('the menu script: open, highlight and press an item by its number, close', () => {
  const s = stepsOf({ kind: 'menu', steps: '0.8 open\n1.4 highlight 1\n2.7 press 3\n3 close' });
  assert.deepEqual(s.map((x) => [x.at, x.verb, x.arg]), [[0.8, 'open', ''], [1.4, 'highlight', '1'], [2.7, 'press', '3'], [3, 'close', '']]);
  assert.throws(() => stepsOf({ kind: 'menu', steps: '1 highlight' }), /highlight takes an item's number, from 1/);
  assert.throws(() => stepsOf({ kind: 'menu', steps: '1 press 0' }), /press takes an item's number/);
  assert.throws(() => stepsOf({ kind: 'menu', steps: '1 add Saved' }), /menu knows open, highlight, press, close, not "add"/);
  assert.equal(durationOf({ kind: 'menu', steps: '0.8 open\n2.7 press 3' }), 3.9);
});

test('the tabs and sheet scripts', () => {
  assert.deepEqual(stepsOf({ kind: 'tabs', steps: '1 select 2\n2 select 3' }).map((x) => x.arg), ['2', '3']);
  assert.throws(() => stepsOf({ kind: 'tabs', steps: '1 select' }), /select takes a tab's number/);
  assert.deepEqual(stepsOf({ kind: 'sheet', steps: '0.6 open\n1 open 2\n2 drag up\n3 drag down\n4 close' }).map((x) => [x.verb, x.arg]), [['open', ''], ['open', '2'], ['drag', 'up'], ['drag', 'down'], ['close', '']]);
  assert.throws(() => stepsOf({ kind: 'sheet', steps: '1 drag left' }), /drag takes up or down/);
  assert.throws(() => stepsOf({ kind: 'sheet', steps: '1 open 3' }), /open takes a detent, 1 or 2/);
});

test('the sheet: the spring to a detent, a drag flicked to the next and released at its own speed, down from the lowest closes', () => {
  const H = 800, m = sheetMotion(stepsOf({ kind: 'sheet', steps: '0.6 open\n2 drag up\n3.4 drag down\n4.6 drag down' }), H);
  const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} against ${b}`);
  assert.equal(m.at(0.5), 0);
  near(m.at(2), 0.5252 * H, 0.5, 'at rest on the medium detent');
  near(m.at(3.4), 0.9291 * H, 0.5, 'a drag up lands on the large detent');
  near(m.at(4.6), 0.5252 * H, 0.5, 'a drag down lands on the medium');
  near(m.at(6), 0, 0.5, 'and down from the lowest closes it');
  // a drag lets go at one and a half flicks, and the spring leaves at exactly that speed
  const flick = 1.5 * SNAP.minFlick * (H / 844);
  near(m.speed(2.25 - 1e-6), flick, 0.5, 'the finger at release');
  near(m.speed(2.25 + 1e-6), flick, 0.5, 'the sheet just after');
  near(m.at(2.25 - 1e-6), m.at(2.25 + 1e-6), 0.01, 'no jump at the release');
  assert.deepEqual(m.drags.map((d) => [d.t0, d.t1]), [[2, 2.25], [3.4, 3.65], [4.6, 4.85]]);
});
