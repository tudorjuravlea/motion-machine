// scripts/lib/brand-prompt.mjs: brand steering of a generation prompt (pure), colour words from hex,
// and the hash a sidecar records so the gate can tell a stale generation from a current one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandHash, colorWord, paletteSentence, soundPaletteHint, steer, SteerError } from '../../scripts/lib/brand-prompt.mjs';

const style = {
  color: { canvas: '#FAFAF7', ink: '#23262B', accent: '#2F6F5E', muted: '#6B7280', surface: '#FFFFFF', line: '#E5E7EB', accentInk: '#FFFFFF' },
  imagery: { style: 'soft studio photography, matte surfaces', mood: 'calm, unhurried', avoid: 'stock-photo smiles, neon', references: ['refs/a.png', 'refs/b.png'], tone: 'palette' },
  music: { style: 'warm minimal piano, light percussion', avoid: 'vocals, big drops' },
  voice: { provider: 'elevenlabs', id: 'voice123', model: 'eleven_multilingual_v2', language: 'en', stability: 0.4, similarity: 0.8, style: 0.1, speed: 1 },
  sound: { palette: 'soft-ui', bpm: 96, loudnessLufs: -14 },
};

test('colour words come from hex by a fixed table of hue and lightness names', () => {
  assert.equal(colorWord('#2F6F5E'), 'deep green');
  assert.equal(colorWord('#FAFAF7'), 'warm off-white');
  assert.equal(colorWord('#23262B'), 'near-black');
  assert.equal(colorWord('#FFFFFF'), 'white');
  assert.equal(colorWord('#000000'), 'black');
  assert.equal(colorWord('#808080'), 'mid grey');
  assert.equal(colorWord('#FF0000'), 'vivid red');
  assert.equal(colorWord('#1E3A8A'), 'deep blue');
  assert.equal(colorWord('#F4B400'), 'vivid yellow');
  assert.equal(colorWord('#cfe3f7'), 'pale blue');
  assert.equal(colorWord('not a colour'), null);
});

test('the palette sentence names accent, ground and ink with words and hex', () => {
  assert.equal(paletteSentence(style.color), 'Palette: deep green #2F6F5E as the accent, warm off-white #FAFAF7 as the ground, near-black #23262B for ink.');
  assert.equal(paletteSentence({}), '');
});

test('image: the prompt gets the imagery style, mood and palette; the negative gets avoid and the fixed ban; refs resolve beside the style', () => {
  const r = steer('image', 'a hand holding a small plant', style, { styleDir: '/p/piece' });
  assert.match(r.prompt, /^a hand holding a small plant\./);
  assert.match(r.prompt, /soft studio photography, matte surfaces/);
  assert.match(r.prompt, /Mood: calm, unhurried/);
  assert.match(r.prompt, /deep green #2F6F5E as the accent, warm off-white #FAFAF7 as the ground, near-black #23262B for ink/);
  assert.equal(r.negative, 'stock-photo smiles, neon, no text, no logos, no watermarks');
  assert.deepEqual(r.refs, ['/p/piece/refs/a.png', '/p/piece/refs/b.png']);
  assert.equal(r.voice, null);
});

test('image: a prompt that asks for text does not get the no-text ban', () => {
  const r = steer('image', 'a poster with the headline "Open"', style);
  assert.equal(r.negative, 'stock-photo smiles, neon, no logos, no watermarks');
});

test('video and replace steer like an image', () => {
  for (const kind of ['video', 'replace']) {
    const r = steer(kind, 'slow push in', style);
    assert.match(r.prompt, /soft studio photography/);
    assert.match(r.negative, /no watermarks/);
  }
});

test('music: style words and the tempo steer the prompt; avoid becomes the negative', () => {
  const r = steer('music', 'a bed for a product film', style);
  assert.match(r.prompt, /warm minimal piano, light percussion/);
  assert.match(r.prompt, /about 96 bpm/);
  assert.equal(r.negative, 'vocals, big drops');
  assert.equal(r.parts.style, 'warm minimal piano, light percussion');
  assert.equal(r.parts.bpm, 96);
});

test('sfx: the motion half\'s sound palette is a timbre hint; "none" adds nothing', () => {
  assert.match(steer('sfx', 'a small click', style).prompt, /soft, rounded interface sounds/);
  assert.match(soundPaletteHint('percussive'), /percussive/);
  assert.match(soundPaletteHint('cinematic'), /cinematic/);
  assert.equal(soundPaletteHint('none'), '');
  assert.equal(steer('sfx', 'a small click', { ...style, sound: { palette: 'none' } }).prompt, 'a small click');
});

test('voice: the text is never altered; the voice comes from the style, --voice overrides the id', () => {
  const r = steer('voice', 'Hello there.', style);
  assert.equal(r.prompt, 'Hello there.');
  assert.deepEqual(r.voice, { provider: 'elevenlabs', id: 'voice123', model: 'eleven_multilingual_v2', language: 'en', stability: 0.4, similarity: 0.8, style: 0.1, speed: 1 });
  assert.equal(steer('voice', 'Hi', style, { voice: 'other' }).voice.id, 'other');
  assert.equal(steer('voice', 'Hi', style, { voice: 'other' }).voice.stability, 0.4);
});

test('voice without a brand voice and without --voice is a usage error that asks for one', () => {
  const { voice, ...bare } = style;
  assert.throws(() => steer('voice', 'Hi', bare), (e) => e instanceof SteerError && /--voice/.test(e.message) && /brand voice/.test(e.message));
  assert.equal(steer('voice', 'Hi', bare, { voice: 'abc' }).voice.id, 'abc');
  assert.equal(steer('voice', 'Hi', bare, { voice: 'abc' }).voice.provider, 'elevenlabs');
});

test('--brand off sends the prompt untouched and records that it did', () => {
  for (const kind of ['image', 'video', 'music', 'sfx']) {
    const r = steer(kind, 'plain words', style, { brand: false });
    assert.equal(r.prompt, 'plain words');
    assert.equal(r.negative, '');
    assert.deepEqual(r.refs, []);
    assert.ok(r.notes.some((n) => /brand off/.test(n)));
  }
  assert.equal(steer('voice', 'Hi', style, { brand: false, voice: 'x' }).voice.id, 'x');
  assert.equal(steer('voice', 'Hi', style, { brand: false, voice: 'x' }).voice.stability, undefined);
  assert.throws(() => steer('voice', 'Hi', style, { brand: false }), SteerError);
});

test('a style without imagery steers nothing and says so', () => {
  const r = steer('image', 'a plant', { color: style.color });
  assert.match(r.prompt, /^a plant\./);
  assert.match(r.prompt, /Palette:/);
  assert.ok(r.notes.some((n) => /no imagery/.test(n)));
});

test('transcribe and import are not steered', () => {
  assert.equal(steer('transcribe', 'x', style).prompt, 'x');
  assert.equal(steer('import', 'x', style).prompt, 'x');
});

test('brandHash: stable, kind-specific, and it moves when a steering field moves', () => {
  const a = brandHash('image', style);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(brandHash('image', JSON.parse(JSON.stringify(style))), a);
  assert.equal(brandHash('video', style), a);
  assert.notEqual(brandHash('image', { ...style, imagery: { ...style.imagery, mood: 'tense' } }), a);
  assert.notEqual(brandHash('image', { ...style, color: { ...style.color, accent: '#FF0000' } }), a);
  assert.equal(brandHash('image', { ...style, color: { ...style.color, surface: '#EEEEEE' } }), a, 'a role that does not steer does not stale it');
  assert.equal(brandHash('image', { ...style, music: { style: 'x' } }), a, 'music does not stale a picture');
  assert.notEqual(brandHash('music', { ...style, sound: { ...style.sound, bpm: 120 } }), brandHash('music', style));
  assert.notEqual(brandHash('sfx', { ...style, sound: { palette: 'cinematic' } }), brandHash('sfx', style));
  assert.notEqual(brandHash('voice', { ...style, voice: { ...style.voice, id: 'z' } }), brandHash('voice', style));
  assert.equal(brandHash('transcribe', style), null);
  assert.equal(brandHash('import', style), null);
});
