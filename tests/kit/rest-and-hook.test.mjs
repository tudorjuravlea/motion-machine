// Kit behaviours at rest and on the hook, the Node half.
// The browser half is rest-and-hook.browser.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { schedule, resolveStory } from '../../runtime/kit/schedule.js';
import { spring } from '../../runtime/kit/springs.js';

const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const editorial = json('styles/presets/editorial.json');
const goldenFilm = json('fixtures/schedule/named-patterns.film.json');
const goldenDeck = json('fixtures/schedule/named-patterns.deck.json');
const smokeFilm = json('fixtures/kit-smoke/film/story.json');
const smokeDeck = json('fixtures/kit-smoke/deck/story.json');
const v = validators();
const explain = (fn) => JSON.stringify(fn.errors);
const close = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${msg ?? ''} ${a} ≠ ${b}`);

// ---------------------------------------------------------------------------------------------
// the motion style speaks through roles

function roleFilm() {
  const s = structuredClone(smokeFilm);
  s.scenes[0].beats[0].fx = 'style:headline';
  s.scenes[0].beats[1].fx = 'style:body';
  delete s.scenes[1].cut;
  s.scenes[1].position = 'topic';
  return s;
}

test('fx "style:<role>" resolves to style.entrances.<role>; position without cut to style.transitions.<position>', () => {
  const s = schedule(roleFilm(), editorial);
  const arrivals = s.events.filter((e) => e.kind === 'arrive');
  assert.equal(arrivals[0].fx, editorial.entrances.headline);
  assert.equal(arrivals[1].fx, editorial.entrances.body);
  assert.equal(s.scenes[1].cut.pattern, editorial.transitions.topic);
  assert.equal(s.events.filter((e) => e.kind === 'cut')[1].pattern, editorial.transitions.topic);
  assert.ok(s.items.every((it) => !String(it.fx).startsWith('style:')));
});

test('an explicit cut wins over position; resolveStory is pure and idempotent', () => {
  const story = roleFilm();
  story.scenes[1].cut = 'transitions/hard-cut';
  const before = JSON.stringify(story);
  const r = resolveStory(story, editorial);
  assert.equal(JSON.stringify(story), before, 'the input story is not mutated');
  assert.equal(r.scenes[1].cut, 'transitions/hard-cut');
  assert.equal(r.scenes[0].beats[0].fx, editorial.entrances.headline);
  assert.deepEqual(resolveStory(r, editorial), r);
});

test('an unknown role or a scene with neither cut nor position throws', () => {
  const a = roleFilm();
  a.scenes[0].beats[0].fx = 'style:hero';
  assert.throws(() => schedule(a, editorial), /style:hero/);
  const b = roleFilm();
  delete b.scenes[1].position;
  assert.throws(() => schedule(b, editorial), /neither cut nor position/);
});

test('the story schema takes roles and positions and still closes every object', () => {
  assert.ok(v.story(roleFilm()), explain(v.story));
  const none = roleFilm();
  delete none.scenes[1].position;
  assert.equal(v.story(none), false, 'a scene needs a cut or a position');
  const badPos = roleFilm();
  badPos.scenes[1].position = 'middle';
  assert.equal(v.story(badPos), false);
  const badRole = roleFilm();
  badRole.scenes[0].beats[0].fx = 'style:hero';
  assert.equal(v.story(badRole), false);
  const extra = roleFilm();
  extra.scenes[1].role = 'topic';
  assert.equal(v.story(extra), false, 'additionalProperties stays false');
});

// ---------------------------------------------------------------------------------------------
// the first frame is the hook

test('a deck beat with step 0 is present at rest 0 with no animation', () => {
  const story = structuredClone(smokeDeck);
  story.scenes[0].beats[0].step = 0;
  assert.ok(v.story(story), explain(v.story));
  const s = schedule(story, editorial);
  const it = s.items.find((x) => x.slot === story.scenes[0].beats[0].slot && x.scene === story.scenes[0].id);
  assert.equal(it.press, 0);
  assert.equal(it.d, 0);
  assert.equal(s.pressLengths[0], 0, 'rest 0 is never animated');
  const ev = s.events.find((e) => e.kind === 'arrive' && e.selector === it.selector);
  assert.deepEqual([ev.press, ev.from, ev.to, ev.d], [0, 0, 0, 0]);
});

test('a film beat with params.instant arrives finished at its at (d = 0)', () => {
  const story = structuredClone(smokeFilm);
  story.scenes[0].beats[0].at = 0;
  story.scenes[0].beats[0].params = { instant: true };
  assert.ok(v.story(story), explain(v.story));
  const s = schedule(story, editorial);
  const ev = s.events.find((e) => e.kind === 'arrive');
  assert.deepEqual([ev.t, ev.d], [0, 0]);
  // the scene's rest still waits for its other arrival
  close(s.rests[0], 1.0 + editorial.motion.durations.standard / 1000);
});

// ---------------------------------------------------------------------------------------------
// a cue can anchor to its end

test('a sound pattern with anchor "end" ends on its beat\'s landing; others start on its arrival', () => {
  const story = structuredClone(smokeFilm);
  story.scenes[1].beats[1].cue = 'riser';   // outro sub at 3 + 0.8, lands 0.52 s later
  story.scenes[0].beats[0].cue = 'tick';
  const patterns = { 'sound/riser': { group: 'sound', anchor: 'end', durationS: 1.2 }, 'sound/tick': { group: 'sound', durationS: 0.06 } };
  const s = schedule(story, editorial, { patterns });
  const [tick, riser] = s.events.filter((e) => e.kind === 'cue');
  close(tick.t, 0.2, 'start-anchored cue sits on the arrival');
  close(riser.t, 3.8 + 0.52 - 1.2, 'end-anchored cue starts durationS before the landing');
  close(riser.t + riser.d, 3.8 + 0.52, 'and resolves on the landing');
  assert.equal(riser.anchor, 'end');
  // never before the film starts
  const early = structuredClone(smokeFilm);
  early.scenes[0].beats[0].cue = 'riser';
  assert.equal(schedule(early, editorial, { patterns }).events.find((e) => e.kind === 'cue').t, 0);
});

test('on a deck an end-anchored cue resolves on the landing inside its press', () => {
  const story = structuredClone(smokeDeck);
  story.scenes[0].beats[0].cue = 'riser';
  story.scenes[0].beats[0].at = 0.9;
  const s = schedule(story, editorial, { patterns: { 'sound/riser': { group: 'sound', anchor: 'end', durationS: 1.2 } } });
  const cue = s.events.find((e) => e.kind === 'cue');
  close(cue.at, 0.9 + 0.52 - 1.2);
});

// ---------------------------------------------------------------------------------------------
// springs always settle

const quick = (fn) => { const t0 = process.hrtime.bigint(); const r = fn(); return { r, ms: Number(process.hrtime.bigint() - t0) / 1e6 }; };

test('spring.settle terminates for undamped and near-undamped springs', () => {
  for (const p of [{ bounce: 1, period: 0.4 }, { bounce: 0.9999999, period: 0.4 }, { bounce: 0.99, period: 5 },
    { k: 2000, c: 1e-12, m: 1 }, { k: 2000, c: 1e-9, m: 0.001 }, { bounce: -1, period: 0.4 }]) {
    const { r, ms } = quick(() => spring.settle(p));
    assert.ok(Number.isFinite(r) && r > 0, `${JSON.stringify(p)} → ${r}`);
    assert.ok(ms < 200, `${JSON.stringify(p)} took ${ms} ms`);
    // the settle time is honest: settled for good after it
    for (let t = r; t < r + 2; t += 0.01) assert.ok(Math.abs(1 - spring(t, p)) < 0.005 + 1e-9, `${JSON.stringify(p)} at ${t}`);
  }
});

test('the motion schema rejects bounce 1, and schedule() terminates on the stiffest valid bounce', () => {
  const m = json('styles/motion/calm.json');
  m.motion.spring.ui = { bounce: 1, period: 0.4 };
  assert.equal(v.motion(m), false, 'bounce 1 is undamped: rejected');
  m.motion.spring.ui = { bounce: 0.999, period: 0.4 };
  assert.ok(v.motion(m), explain(v.motion));
  const style = structuredClone(editorial);
  style.motion.spring.ui = { bounce: 0.999, period: 0.4 };
  const story = structuredClone(smokeFilm);
  story.scenes[0].beats[0].params = { spring: 'ui' };
  const { r, ms } = quick(() => schedule(story, style));
  assert.ok(ms < 500 && Number.isFinite(r.items[0].d), `took ${ms} ms`);
});

// ---------------------------------------------------------------------------------------------
// the output shape and the rest that waits for emphasis

test('schedule() output has the frozen shape for both golden stories', () => {
  const f = schedule(goldenFilm, editorial);
  assert.deepEqual(Object.keys(f).sort(), ['duration', 'events', 'holds', 'items', 'kind', 'rests', 'scenes', 'timeline', 'warnings'].sort());
  for (const sc of f.scenes) assert.deepEqual(Object.keys(sc).sort(), ['cut', 'end', 'id', 'move', 'position', 'start']);
  assert.equal(f.holds.length, f.rests.length);
  f.holds.forEach((h, i) => { assert.deepEqual(Object.keys(h).sort(), ['from', 'scene', 'to']); assert.equal(h.from, f.rests[i]); });
  assert.deepEqual(f.scenes.filter((s) => s.move).map((s) => [s.id, s.move]), [['problem', 'moves/push-in'], ['patterns', 'moves/hero-drift']]);
  const d = schedule(goldenDeck, editorial);
  assert.deepEqual(Object.keys(d).sort(), ['events', 'items', 'kind', 'pressLengths', 'presses', 'rests', 'scenes', 'timeline', 'warnings'].sort());
  for (const sc of d.scenes) assert.deepEqual(Object.keys(sc).sort(), ['cut', 'end', 'id', 'move', 'position', 'start']);
});

test('a film scene\'s rest waits for its emphasis; its hold runs from the rest to the scene end', () => {
  const s = schedule(goldenFilm, editorial);
  assert.equal(s.rests[3], 13.92);
  assert.deepEqual(s.holds[3], { scene: 'style', from: 13.92, to: 15 });
  for (const h of s.holds) {
    for (const e of s.events.filter((x) => x.scene === h.scene && x.kind !== 'cue' && !(x.kind === 'move' && String(x.pattern).startsWith('moves/')) && x.kind !== 'depart')) {
      assert.ok(e.t + e.d <= h.from + 1e-9, `${e.kind} ${e.selector} ends after the rest of ${h.scene}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// times are whole milliseconds

const isMs = (x) => typeof x === 'number' && x === Math.round(x * 1000) / 1000;

test('every time in schedule output is rounded to the millisecond; duration is the sum of scenes', () => {
  const style = structuredClone(editorial);
  const story = structuredClone(goldenFilm);
  story.scenes[0].beats[0].params = { spring: 'ui' };       // a settle time that is not a whole ms
  const f = schedule(story, style);
  assert.equal(f.duration, 30);
  const bad = [];
  for (const e of f.events) for (const k of ['t', 'd']) if (!isMs(e[k])) bad.push(`${e.kind} ${k}=${e[k]}`);
  for (const s of f.scenes) for (const k of ['start', 'end']) if (!isMs(s[k])) bad.push(`scene ${k}=${s[k]}`);
  for (const r of f.rests) if (!isMs(r)) bad.push(`rest ${r}`);
  for (const h of f.holds) if (!isMs(h.from) || !isMs(h.to)) bad.push(`hold ${h.from}-${h.to}`);
  for (const it of f.items) for (const k of ['start', 'd']) if (!isMs(it[k])) bad.push(`item ${it.selector} ${k}=${it[k]}`);
  const d = schedule(goldenDeck, style);
  d.pressLengths.forEach((L, i) => { if (!isMs(L)) bad.push(`pressLengths[${i}]=${L}`); });
  for (const e of d.events) for (const k of ['at', 'd']) if (e[k] != null && !isMs(e[k])) bad.push(`deck ${e.kind} ${k}=${e[k]}`);
  assert.deepEqual(bad, []);
});

// ---------------------------------------------------------------------------------------------
// contract ids are URNs nobody can register

test('every contract $id is urn:motion-machine:contracts:<name>, and cross-file refs resolve', () => {
  for (const name of ['brand', 'motion', 'style', 'story']) {
    const s = json(`contracts/${name}.schema.json`);
    assert.equal(s.$id, `urn:motion-machine:contracts:${name}`);
    assert.doesNotMatch(JSON.stringify(s), /motion-machine\.dev/);
  }
  assert.ok(v.style(editorial), explain(v.style));
});
