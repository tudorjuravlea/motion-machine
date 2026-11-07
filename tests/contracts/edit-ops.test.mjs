// The edit-ops contract. Every op shape the studio, the
// CLI and agents speak validates; five malformed ops are refused on the named field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validators, ROOT } from '../../scripts/lib/validate.mjs';
import { validateEdit } from '../../scripts/studio/ops.js';

const { editOps, story } = validators();
const explain = (v) => (v.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

const SAMPLES = [
  { op: 'scene.duration', scene: 'hook', value: 4.5 },
  { op: 'scene.order', scene: 'hook', index: 2 },
  { op: 'scene.cut', scene: 'hook', pattern: 'transitions/push', params: { direction: 'left' } },
  { op: 'scene.cut', scene: 'hook', pattern: 'transitions/push', params: null, before: 'move' },
  { op: 'scene.cut', scene: 'hook', pattern: null },
  { op: 'scene.move', scene: 'hook', pattern: 'moves/push-in', params: { target: 'media' }, format: '9x16' },
  { op: 'scene.move', scene: 'hook', pattern: null },
  { op: 'scene.say', scene: 'hook', value: 'Narration.', format: '16x9' },
  { op: 'beat.at', scene: 'hook', beat: 0, value: 1.25 },
  { op: 'beat.at', scene: 'hook', beat: 1, value: 0, format: '9x16' },
  { op: 'beat.out', scene: 'hook', beat: 0, value: 3 },
  { op: 'beat.out', scene: 'hook', beat: 0, value: null, before: 'exit' },
  { op: 'beat.set', scene: 'hook', beat: 0, key: 'text', value: 'Hello' },
  { op: 'beat.set', scene: 'hook', beat: 0, key: 'value', value: 42, format: '1x1' },
  { op: 'beat.set', scene: 'hook', beat: 0, key: 'cue', value: null, before: 'emphasis' },
  { op: 'beat.param', scene: 'hook', beat: 0, key: 'side', value: 'left' },
  { op: 'beat.param', scene: 'hook', beat: 0, key: 'instant', value: true },
  { op: 'beat.param', scene: 'hook', beat: 0, key: 'exit', value: { d: 20 } },
  { op: 'beat.param', scene: 'hook', beat: 0, key: 'd', value: null, before: 'side' },
  { op: 'beat.add', scene: 'hook', beat: { at: 0.5, slot: 'sub', fx: 'entrances/rise', text: 'x', params: { side: 'up' } } },
  { op: 'beat.add', scene: 'hook', beat: { at: 0, slot: 'sub', fx: 'style:body' }, index: 0, format: '9x16' },
  { op: 'beat.remove', scene: 'hook', beat: 2 },
  { op: 'story.formats', value: ['9x16', '1x1', '4x5', '16x9'] },
  { op: 'story.formats', value: ['16x9'], raw: '[ "16x9" ]' },
  { op: 'audio.sample', cue: 'tick', value: 'assets/sounds/door-slam.wav' },
  { op: 'audio.sample', cue: 'tick', value: null },
];

test('the edit-ops schema accepts every op shape, alone and as a batch', () => {
  for (const op of SAMPLES) assert.ok(editOps([op]), `${JSON.stringify(op)}: ${explain(editOps)}`);
  assert.ok(editOps(SAMPLES), explain(editOps));
  assert.ok(editOps([]));
});

test('the edit-ops schema refuses malformed ops on the named field', () => {
  const cases = [
    [{ op: 'scene.rename', scene: 'hook', value: 'x' }, '/0'],                       // not an op
    [{ op: 'beat.at', scene: 'hook', beat: 0, value: 1, extra: true }, '/0'],         // an unknown member
    [{ op: 'beat.at', beat: 0, value: 1 }, '/0'],                                      // no scene
    [{ op: 'beat.at', scene: 'hook', beat: 0, value: -1 }, '/0/value'],                // a negative time
    [{ op: 'beat.set', scene: 'hook', beat: 0, key: 'at', value: 1 }, '/0/key'],       // at has its own op
    [{ op: 'scene.duration', scene: 'hook', value: 0 }, '/0/value'],                   // zero length
    [{ op: 'beat.add', scene: 'hook', beat: { at: 0, slot: 'sub' } }, '/0/beat'],      // a beat without fx
    [{ op: 'scene.order', scene: 'Hook!', index: 0 }, '/0/scene'],                     // not a scene id
  ];
  for (const [op, at] of cases) {
    assert.equal(editOps([op]), false, `${JSON.stringify(op)} must be refused`);
    const paths = editOps.errors.map((e) => e.instancePath);
    assert.ok(paths.some((p) => p.startsWith(at)), `${JSON.stringify(op)}: errors at ${paths.join(', ')}, expected ${at}`);
  }
  assert.equal(editOps({ op: 'beat.at' }), false, 'the root is an array');
});

// the contract and ops.js agree both ways. On a story where every story-dependent rule holds
// (the scene exists, the beat and index are in range, times sit inside the scene, the fact exists),
// an edit passes the schema exactly when the ops accept it (with the story schema as ctx.validate).
// Not expressible in JSON Schema, so left out: times against the scene's duration, beats in range,
// and `raw` matching the value it spells.
test('the edit-ops schema and ops.js accept and refuse the same edits', () => {
  const st = JSON.parse(readFileSync(join(ROOT, 'pieces/golden-film-kinetic/story.json'), 'utf8'));
  const ctx = { validate: (s) => (story(s) ? null : story.errors) };
  const H = (o) => ({ scene: 'hook', ...o }), B = (o) => H({ beat: 1, ...o }), add = (beat, o = {}) => H({ op: 'beat.add', beat: { at: 1, slot: 'x', fx: 'entrances/fade', ...beat }, ...o });
  const accept = [
    H({ op: 'scene.duration', value: 4.5 }), H({ op: 'scene.duration', value: 60 }), H({ op: 'scene.order', index: 0 }),
    H({ op: 'scene.cut', pattern: 'transitions/push', params: { direction: 'left' } }), H({ op: 'scene.cut', pattern: 'transitions/push', params: null, before: 'move' }), H({ op: 'scene.cut', pattern: null }),
    H({ op: 'scene.move', pattern: 'moves/pan', params: { target: 'camera' }, format: '9x16' }), H({ op: 'scene.move', pattern: null, params: null }),
    H({ op: 'scene.say', value: 'x', format: '16x9' }),
    B({ op: 'beat.at', value: 0 }), B({ op: 'beat.at', value: 3.99, format: '1x1' }),
    B({ op: 'beat.out', value: 3 }), B({ op: 'beat.out', value: null, before: 'slot' }),
    B({ op: 'beat.set', key: 'text', value: 'hi' }), B({ op: 'beat.set', key: 'text', value: null }), B({ op: 'beat.set', key: 'fx', value: 'entrances/fade' }),
    B({ op: 'beat.set', key: 'fx', value: 'style:figure' }), B({ op: 'beat.set', key: 'cue', value: 'press' }), B({ op: 'beat.set', key: 'emphasis', value: 'emphasis/pulse' }),
    B({ op: 'beat.set', key: 'slot', value: 'zz' }), B({ op: 'beat.set', key: 'fact', value: 'f2' }), B({ op: 'beat.set', key: 'value', value: 3 }),
    B({ op: 'beat.set', key: 'asset', value: 'assets/a.png', before: 'slot' }),
    B({ op: 'beat.param', key: 'side', value: 'left' }), B({ op: 'beat.param', key: 'instant', value: true }), B({ op: 'beat.param', key: 'exit', value: { d: 1 } }),
    B({ op: 'beat.param', key: 'emphasis', value: null }), B({ op: 'beat.param', key: 'd', value: 3, before: 'side' }),
    add({}), add({ text: 't', cue: 'tick', out: 3, exit: 'exits/fade', emphasis: 'emphasis/pulse', fact: 'f1', value: 2, asset: 'assets/x.png', params: { side: 'up', instant: true, exit: { d: 2 } } }),
    add({}, { index: 0, format: '9x16' }), add({ screen: [{ do: 'screen/tap', at: 0.2 }] }),
    add({}, { raw: '{ "at": 1, "slot": "x", "fx": "entrances/fade" }' }), B({ op: 'beat.at', value: 1, raw: '1.0' }),
    B({ op: 'beat.remove' }), B({ op: 'beat.remove', format: '16x9' }),
    { op: 'story.formats', value: ['9x16'] }, { op: 'story.formats', value: ['16x9', '4x5', '1x1', '9x16'] }, { op: 'story.formats', value: ['4x5', '16x9'], raw: '["4x5","16x9"]' },
    { op: 'audio.sample', cue: 'tick', value: 'assets/sounds/a.wav' }, { op: 'audio.sample', cue: 'tick', value: 'assets/sounds/a.ogg' }, { op: 'audio.sample', cue: 'tick', value: null },
  ];
  const refuse = [
    H({ op: 'scene.rename' }), H({ op: 'scene.say', value: 'x', foo: 1 }), B({ op: 'beat.at', value: 1, formats: '9x16' }),
    H({ op: 'scene.say', value: 'q', before: 'id' }), H({ op: 'scene.cut', pattern: 'transitions/push', format: '9x16' }), H({ op: 'scene.duration', value: 3, format: '9x16' }),
    H({ op: 'scene.duration', value: 0 }), H({ op: 'scene.duration', value: 0.004 }), H({ op: 'scene.duration', value: 60.004 }), H({ op: 'scene.duration', value: '5' }),
    H({ op: 'scene.order', index: 1.5 }), H({ op: 'scene.order', index: -1 }),
    H({ op: 'scene.cut', pattern: 'moves/pan' }), H({ op: 'scene.cut' }), H({ op: 'scene.cut', pattern: 'transitions/push', params: { a: {} } }), H({ op: 'scene.cut', pattern: 'transitions/push', params: [] }),
    H({ op: 'scene.move', pattern: 'transitions/push' }),
    H({ op: 'scene.say', value: 5 }), H({ op: 'scene.say', value: null }), H({ op: 'scene.say', value: 'x'.repeat(1201) }),
    B({ op: 'beat.at', value: -0.004 }), B({ op: 'beat.at', value: '1' }), B({ op: 'beat.at', value: 61 }), B({ op: 'beat.out', value: '2' }),
    B({ op: 'beat.set', key: 'at', value: 1 }), B({ op: 'beat.set', key: 'toString', value: 'x' }), B({ op: 'beat.set', key: 'text', value: 5 }),
    B({ op: 'beat.set', key: 'text', value: 'x'.repeat(401) }), B({ op: 'beat.set', key: 'fx', value: null }), B({ op: 'beat.set', key: 'fx', value: 'exits/fade' }),
    B({ op: 'beat.set', key: 'slot', value: null }), B({ op: 'beat.set', key: 'cue', value: 'Boom!' }), B({ op: 'beat.set', key: 'value', value: '3' }),
    B({ op: 'beat.set', key: 'asset', value: 'https://x.org/a.png' }), B({ op: 'beat.set', key: 'fact', value: 'x1' }), B({ op: 'beat.set', key: 'emphasis', value: 'moves/x' }),
    B({ op: 'beat.param', key: 'side', value: { a: 1 } }), B({ op: 'beat.param', key: 'exit', value: 1 }), B({ op: 'beat.param', key: 'instant', value: 'true' }),
    B({ op: 'beat.param', key: 'bad key', value: 1 }), B({ op: 'beat.param', key: 'side', value: [1] }),
    H({ op: 'beat.add', beat: { at: 1, slot: 'x' } }), add({ text: 5 }), add({ cue: 'Boom!' }), add({ exit: 'moves/pan' }), add({ out: 'x' }), add({ params: 'x' }),
    add({ params: { side: {} } }), add({ params: { 'bad key': 1 } }), add({ params: { instant: 1 } }), add({ screen: [{ do: 'nope' }] }), add({ step: 1.5 }), add({ zz: 1 }),
    add({}, { raw: 5 }), B({ op: 'beat.remove', before: 'x' }),
    { op: 'story.formats', value: [] }, { op: 'story.formats', value: ['9x16', '9x16'] }, { op: 'story.formats', value: ['3x2'] }, { op: 'story.formats', value: '9x16' },
    { op: 'story.formats' }, { op: 'story.formats', value: ['9x16'], scene: 'hook' }, { op: 'story.formats', value: ['9x16'], format: '9x16' }, { op: 'story.formats', value: ['9x16'], raw: 5 },
    { op: 'audio.sample', cue: 'Tick!', value: 'assets/sounds/a.wav' }, { op: 'audio.sample', value: 'assets/sounds/a.wav' }, { op: 'audio.sample', cue: 'tick', value: 'https://x.org/a.wav' },
    { op: 'audio.sample', cue: 'tick', value: 'assets/sounds/a.txt' }, { op: 'audio.sample', cue: 'tick', value: 5 }, { op: 'audio.sample', cue: 'tick' },
    { op: 'audio.sample', cue: 'tick', value: 'assets/sounds/a.wav', scene: 'hook' },
  ];
  for (const [edits, want] of [[accept, true], [refuse, false]]) {
    for (const e of edits) {
      const ops = validateEdit(st, e, ctx);
      assert.equal(editOps([e]), want, `schema on ${JSON.stringify(e)}: ${explain(editOps)}`);
      assert.equal(ops === null, want, `ops on ${JSON.stringify(e)}: ${JSON.stringify(ops)}`);
    }
  }
});
