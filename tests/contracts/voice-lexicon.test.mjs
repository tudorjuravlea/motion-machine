// A brand sets how its names are said once: `voice.lexicon` in the brand half is a map of word → how it is spoken
// (scripts/lib/say.mjs applies it to every voice-over, mm gen voice sends it, W-SAY does not flag it). And a story may
// carry a `date` (YYYY-MM-DD), the creation time mm export writes into the media instead of the clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validators, ROOT } from '../../scripts/lib/validate.mjs';

const DAY = new Date(0).toISOString().slice(0, 10);   // a fixed day built, not written: the repository keeps no dated notes

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const { brand, story } = validators();
const explain = (v) => (v.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

const withVoice = (voice) => ({ ...read('styles/brands/linen.json'), voice });
const BRAND = 'styles/brands/linen.json';

test('voice.lexicon takes words and how they are said', () => {
  const b = withVoice({ provider: 'elevenlabs', id: 'v1', lexicon: { Zalo: 'ZAH-lo', API: 'ay pee eye' } });
  assert.ok(brand(b), explain(brand));
});

test('voice.lexicon refuses a value that is not text, an empty one and a name too long', () => {
  for (const lexicon of [{ Zalo: 3 }, { Zalo: '' }, { [`${'x'.repeat(61)}`]: 'a' }, ['Zalo']]) {
    assert.equal(brand(withVoice({ provider: 'elevenlabs', id: 'v1', lexicon })), false, JSON.stringify(lexicon));
  }
  assert.ok(brand(read(BRAND)), 'the shipped brand still validates');
});

test('a story\'s date is YYYY-MM-DD', () => {
  const base = read('fixtures/kit-smoke/film/story.json');
  assert.ok(story({ ...base, date: DAY }), explain(story));
  assert.equal(story({ ...base, date: '1 November 2026' }), false);
  assert.equal(story({ ...base, date: `${DAY}T00:00:00Z` }), false);
});
