// Screen actions in the schedule: each is a `move` event on its beat's
// slot (so dead-time, ambient and stills see it), a film scene's rest waits for the last one to end,
// and a deck press is at least as long as the screen action it plays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schedule } from '../../runtime/kit/schedule.js';

const style = JSON.parse(readFileSync(new URL('../../styles/presets/editorial.json', import.meta.url)));
const patterns = { 'screen/scroll': { dur: 'slow' }, 'screen/tap': { dur: 'standard' } };
const beat = (extra) => ({ at: 0.2, slot: 'stage', fx: 'entrances/fade', asset: 'assets/site/', ...extra });
const film = (screen) => ({ id: 'f', kind: 'film', formats: ['9x16'], title: 't', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null }, cta: { text: '', url: '' },
  scenes: [{ id: 'a', layout: 'layouts/caption-bar', duration: 8, cut: 'transitions/hard-cut', move: null, beats: [beat({ screen })], say: '' }] });

test('a screen action is a move event at the beat start plus at, lasting d or its module duration', () => {
  const s = schedule(film([{ do: 'screen/scroll', at: 1 }, { do: 'screen/tap', at: 3, d: 0.5 }]), style, { patterns });
  const ev = s.events.filter((e) => e.screen);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].kind, 'move'); assert.equal(ev[0].pattern, 'screen/scroll');
  assert.equal(ev[0].t, 1.2); assert.equal(ev[0].d, style.motion.durations.slow / 1000);
  assert.equal(ev[1].t, 3.2); assert.equal(ev[1].d, 0.5);
});

test("a film scene's rest waits for its last screen action", () => {
  const s = schedule(film([{ do: 'screen/tap', at: 4, d: 1 }]), style, { patterns });
  assert.equal(s.rests[0], 5.2);
});

test('a deck press is at least as long as the screen action it plays', () => {
  const deck = { ...film([{ do: 'screen/scroll', step: 1 }]), kind: 'deck' };
  deck.scenes[0] = { ...deck.scenes[0], presses: 2, beats: [beat({ step: 1, screen: [{ do: 'screen/scroll', step: 1 }] })] };
  delete deck.scenes[0].duration;
  const s = schedule(deck, style, { patterns });
  assert.ok(s.pressLengths[2] >= style.motion.durations.slow / 1000, `press 2 lasts ${s.pressLengths[2]}`);
});

test('addImplicitPlays gives a recording with no screen/play an explicit one lasting the clip, for kit and gate alike', async () => {
  const { addImplicitPlays } = await import('../../runtime/kit/schedule.js');
  const story = film([]);
  story.scenes[0].beats[0].asset = 'assets/rec/';
  addImplicitPlays(story, (a) => (a === 'assets/rec/' ? { kind: 'sequence', fps: 30, frames: 90 } : null));
  assert.deepEqual(story.scenes[0].beats[0].screen, [{ do: 'screen/play', at: 0, d: 3 }]);
  const s = schedule(story, style, { patterns: { ...patterns, 'screen/play': { dur: 'hold' } } });
  assert.ok(s.events.some((e) => e.screen && e.pattern === 'screen/play' && e.d === 3));
});

test("an ambient pattern's beat is a move until its scene ends, without moving the rest", () => {
  const story = film(undefined);
  story.scenes[0].beats[0] = { at: 0.2, slot: 'stage', fx: '3d/phone' };
  const s = schedule(story, style, { patterns: { '3d/phone': { dur: 'slow', ambient: true } } });
  const amb = s.events.find((e) => e.ambient);
  assert.ok(amb && amb.kind === 'move' && Math.abs(amb.t + amb.d - 8) < 1e-6, JSON.stringify(amb));
  assert.ok(s.rests[0] < 8);
});
