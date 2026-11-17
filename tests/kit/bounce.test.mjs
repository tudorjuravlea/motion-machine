// A dropped object's bounce in closed form (runtime/kit/bounce.js, entrances/bounce): a heavier object
// bounces less and an elastic one more, the contacts are a geometric series known before a frame is drawn,
// the schedule sounds the beat's cue on every contact, each quieter, and type never bounces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bounceOf, contacts, bounceAt, bounceLength, contactLevelDb, MIN_HOP_S } from '../../runtime/kit/bounce.js';
import { schedule as buildSchedule } from '../../runtime/kit/schedule.js';
import { cueEvents } from '../../scripts/lib/cues.mjs';
import bounce from '../../patterns/entrances/bounce/pattern.js';

test('a heavier object keeps less of its bounce, an elastic one more', () => {
  const e = (material, weight) => bounceOf({ material, weight }).e;
  assert.ok(e('rubber', 'light') > e('rubber', 'heavy'));
  assert.ok(e('rubber', 'medium') > e('plastic', 'medium') && e('plastic', 'medium') > e('wood', 'medium') && e('wood', 'medium') > e('rigid', 'medium'));
  assert.ok(contacts(bounceOf({ material: 'rubber', weight: 'light' })).length > contacts(bounceOf({ material: 'wood', weight: 'heavy' })).length);
  assert.equal(bounceOf({ material: 'rigid' }).squash, 0);
});

test('contacts are a geometric series: hop k lasts 2·eᵏ·fall, and none is shorter than the floor', () => {
  const b = bounceOf({ material: 'rubber', weight: 'light', fall: 0.5 });
  const cs = contacts(b);
  assert.equal(cs[0].t, 0.5);
  for (let k = 1; k < cs.length; k++) {
    assert.ok(Math.abs(cs[k].t - cs[k - 1].t - 2 * b.e ** k * 0.5) < 1e-9);
    assert.ok(cs[k].t - cs[k - 1].t >= MIN_HOP_S);
    assert.ok(cs[k].speed < cs[k - 1].speed);
  }
  assert.ok(Math.abs(bounceLength(b) - (cs.at(-1).t + 0.05)) < 1e-9);
});

test('the object starts at the top, lands on each contact, peaks at e^2k between them, and rests on the floor', () => {
  const b = bounceOf({ material: 'plastic', weight: 'light', fall: 0.4 });
  const cs = contacts(b);
  assert.equal(bounceAt(0, b).lift, 1);
  for (const c of cs) assert.ok(bounceAt(c.t, b).lift < 1e-9);
  const mid = (cs[0].t + cs[1].t) / 2;
  assert.ok(Math.abs(bounceAt(mid, b).lift - b.e ** 2) < 1e-9);
  assert.equal(bounceAt(cs.at(-1).t + 1, b).lift, 0);
  assert.ok(bounceAt(cs[0].t, b).squash > 0 && bounceAt(cs[0].t + 0.2, b).squash === 0);
});

test('each later contact sounds a little quieter, never under -12 dB', () => {
  const levels = bounce.contactsOf({ material: 'rubber', weight: 'light' }).map((c) => c.levelDb);
  assert.equal(levels[0], 0);
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] < levels[i - 1] && levels[i] >= -12);
  assert.equal(contactLevelDb(1e-9), -12);
});

test('the schedule gives the entrance its physics as its length, a contact event and a cue on every contact', () => {
  const style = { motion: { durations: { quick: 240, standard: 520, slow: 1000, hold: 1800 }, easings: {}, travel: 1 } };
  const story = { kind: 'film', scenes: [{ id: 's', duration: 5, layout: 'layouts/title-stack', cut: 'transitions/hard-cut', beats: [
    { at: 0.5, slot: 'image', fx: 'entrances/bounce', asset: 'assets/a.png', cue: 'tap', params: { material: 'rubber', weight: 'light' } }] }] };
  const sched = buildSchedule(story, style, { patterns: { 'entrances/bounce': bounce } });
  const arrive = sched.events.find((e) => e.kind === 'arrive');
  assert.ok(Math.abs(arrive.d - bounce.durationOf({ material: 'rubber', weight: 'light' })) < 0.002);
  const touches = bounce.contactsOf({ material: 'rubber', weight: 'light' });
  assert.equal(sched.events.filter((e) => e.kind === 'contact').length, touches.length);
  const cues = cueEvents(sched);
  assert.equal(cues.length, touches.length);
  assert.ok(Math.abs(cues[0].t - (0.5 + touches[0].t)) < 0.002);
  assert.deepEqual(cues.map((c) => c.contact), touches.map((c) => c.n));
  assert.ok(cues[1].levelDb < 0 && cues[0].levelDb === undefined);
});
