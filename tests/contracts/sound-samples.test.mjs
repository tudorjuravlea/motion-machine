// The sample contracts (SPEC §9): a record beside every sound file (contracts/sound-sample.schema.json), the
// style's `sound.samples` and the story's `audio.samples`, and the shape of a mined profile's `sources`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { validators } from '../../scripts/lib/validate.mjs';

const { soundSample, soundProfile, motion, story } = validators();
const read = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const explain = (fn) => JSON.stringify(fn.errors);

test('a sample record names its source, licence and author, and nothing else without being asked', () => {
  const ok = { source: 'a sample pack', licence: 'CC0-1.0', author: 'someone' };
  assert.ok(soundSample(ok), explain(soundSample));
  assert.ok(soundSample({ ...ok, notes: 'trimmed by hand' }));
  for (const key of ['source', 'licence', 'author']) assert.equal(soundSample({ ...ok, [key]: undefined }), false, `without ${key}`);
  assert.equal(soundSample({ ...ok, licence: '' }), false, 'an empty licence is no licence');
  assert.ok(soundSample({ ...ok, lufs100ms: -30, pitchHz: 440 }), 'a mined record, which carries measurements, is a sample record');
});

test('the motion half maps cues to files; a URL, a path with a space or a bad cue name is refused', () => {
  const m = read('styles/motion/calm.json');
  const withSamples = (samples) => motion({ ...m, sound: { ...m.sound, samples } });
  assert.ok(withSamples({ success: 'assets/sounds/chime.wav', tap: 'assets/sounds/tap.mp3' }), explain(motion));
  assert.equal(withSamples({ success: 'https://example.com/chime.wav' }), false);
  assert.equal(withSamples({ success: 'assets/sounds/my chime.wav' }), false);
  assert.equal(withSamples({ success: 'assets/sounds/chime.txt' }), false);
  assert.equal(withSamples({ 'Bad Cue': 'assets/sounds/x.wav' }), false);
});

test('a story maps cues to files in audio.samples', () => {
  const s = read('fixtures/golden/story.film.json');
  const withSamples = (samples) => story({ ...s, audio: { ...s.audio, samples } });
  assert.ok(withSamples({ success: 'assets/sounds/chime.wav' }), explain(story));
  assert.equal(withSamples({ success: 'http://example.com/chime.wav' }), false);
});

test('a profile carries its sources, each with a source and a licence', () => {
  const p = read('styles/sound/glass.json');
  assert.ok(soundProfile({ ...p, sources: [{ source: 'a pack', licence: 'CC0-1.0' }, { source: 'a recording', licence: 'own recording', author: 'me' }] }), explain(soundProfile));
  assert.equal(soundProfile({ ...p, sources: [{ source: 'a pack' }] }), false, 'a source with no licence');
});
