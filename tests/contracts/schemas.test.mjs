// Every shipped style half, composed preset and golden story validates; eight
// deliberately wrong samples fail on the named field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validators, ROOT } from '../../scripts/lib/validate.mjs';

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const list = (dir) => readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
const { brand, motion, style, story } = validators();

const explain = (v) => (v.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

test('every brand half validates', () => {
  for (const p of list('styles/brands')) assert.ok(brand(read(p)), `${p}: ${explain(brand)}`);
});

test('every motion half validates', () => {
  for (const p of list('styles/motion')) assert.ok(motion(read(p)), `${p}: ${explain(motion)}`);
});

test('every composed preset validates and names its halves', () => {
  for (const p of list('styles/presets')) {
    const s = read(p);
    assert.ok(style(s), `${p}: ${explain(style)}`);
    assert.ok(s.from.brand.startsWith('styles/brands/') && s.from.motion.startsWith('styles/motion/'), `${p}: from`);
    assert.equal(s.fictional, true, `${p}: shipped presets are fictional (AXIOM 3)`);
  }
});

test('both golden stories validate', () => {
  for (const p of ['fixtures/golden/story.film.json', 'fixtures/golden/story.deck.json']) {
    assert.ok(story(read(p)), `${p}: ${explain(story)}`);
  }
});

test('the golden film is 30 s and the golden deck has 10 presses', () => {
  const film = read('fixtures/golden/story.film.json');
  const deck = read('fixtures/golden/story.deck.json');
  assert.equal(film.scenes.reduce((s, sc) => s + sc.duration, 0), 30);
  assert.equal(deck.scenes.reduce((s, sc) => s + sc.presses, 0), 10);
  const text = JSON.stringify(deck) + JSON.stringify(film);
  assert.match(text, /Ș|ș/, 'Latin Extended text present');
  for (const st of [film, deck]) {
    const ids = new Set(st.facts.map((f) => f.id));
    for (const sc of st.scenes) for (const b of sc.beats) if (b.fact) assert.ok(ids.has(b.fact), `${st.id}: fact ${b.fact} resolves`);
  }
});

// Eight invalid samples, each failing on the named field.
const paper = () => read('styles/brands/paper.json');
const calm = () => read('styles/motion/calm.json');
const editorial = () => read('styles/presets/editorial.json');
const filmStory = () => read('fixtures/golden/story.film.json');

const failsAt = (validate, doc, pathPart) => {
  const ok = validate(doc);
  assert.equal(ok, false, 'expected the sample to be rejected');
  const paths = validate.errors.map((e) => `${e.instancePath}:${e.params?.additionalProperty ?? e.params?.missingProperty ?? ''}`).join(' | ');
  assert.ok(paths.includes(pathPart), `expected an error at "${pathPart}", got: ${paths}`);
};

test('invalid: an eighth colour role', () => { const b = paper(); b.color.shadow = '#000000'; failsAt(brand, b, 'shadow'); });
test('invalid: missing accentInk', () => { const b = paper(); delete b.color.accentInk; failsAt(brand, b, 'accentInk'); });
test('invalid: presses 0 in a deck scene', () => { const s = read('fixtures/golden/story.deck.json'); s.scenes[0].presses = 0; failsAt(story, s, '/scenes/0/presses'); });
test('invalid: negative duration in a film scene', () => { const s = filmStory(); s.scenes[0].duration = -1; failsAt(story, s, '/scenes/0/duration'); });
test('invalid: unknown format', () => { const s = filmStory(); s.formats = ['4x3']; failsAt(story, s, '/formats/0'); });
test('invalid: a URL as a font file', () => { const b = paper(); b.type.text.files[0].src = 'https://fonts.example/x.woff2'; failsAt(brand, b, '/type/text/files/0/src'); });
test('a font or ground mark path may hold spaces (a brand folder is named by its owner) but not a quote, a backslash, an angle bracket or a line break', () => {
  const b = paper();
  b.type.text.files[0].src = '../Brand Folder/fonts/manrope/manrope latin 400.woff2';
  assert.ok(brand(b), explain(brand));
  b.ground = { blobs: [{ color: '#B5451B', x: 0, y: 0, w: 0.5, h: 0.5, alpha: 0.1 }], blur: 0.1, mark: { src: 'My Brand/ground/mark.svg', width: 1, alpha: 0.1 } };
  assert.ok(brand(b), explain(brand));
  for (const bad of ['a"b/x.woff2', 'a\\b/x.woff2', 'a<b/x.woff2', 'a\nb/x.woff2', '</style>/x.woff2']) {
    const c = paper(); c.type.text.files[0].src = bad; failsAt(brand, c, '/type/text/files/0/src');
  }
});
test('invalid: a composed style without from', () => { const s = editorial(); delete s.from; failsAt(style, s, 'from'); });
test('invalid: a spring with negative stiffness', () => { const m = calm(); m.motion.spring.ui.k = -5; failsAt(motion, m, '/motion/spring/ui'); });
test('a story may carry one share caption of up to 280 characters', () => {
  const s = filmStory(); s.share = 'Quillmere plans your week in one tap.';
  assert.ok(story(s), explain(story));
  s.share = 'x'.repeat(281); failsAt(story, s, '/share');
});
test('a story may name the script that generates it; the generated stories do', () => {
  const s = filmStory(); s.generator = 'pieces/catalogue/build.mjs';
  assert.ok(story(s), explain(story));
  for (const bad of ['/abs/build.mjs', 'C:/x/build.mjs', '../outside/build.mjs', 'pieces/x/notes.md', '']) { s.generator = bad; failsAt(story, s, '/generator'); }
  const stamped = [...readdirSync(join(ROOT, 'pieces')).filter((d) => d.startsWith('catalogue-')).map((d) => [`pieces/${d}/story.json`, 'pieces/catalogue/build.mjs']),
    ['pieces/demo-film/story.json', 'pieces/demo-film/capture/build-story.mjs'], ['pieces/demo-deck/story.json', 'pieces/demo-film/capture/build-story.mjs']];
  assert.ok(stamped.length >= 27, `${stamped.length} generated stories`);
  for (const [p, gen] of stamped) {
    const st = read(p);
    assert.equal(st.generator, gen, `${p} names its generator`);
    assert.ok(story(st), `${p}: ${explain(story)}`);
    assert.ok(readFileSync(join(ROOT, gen), 'utf8').includes('generator'), `${gen} stamps the field`);
  }
});
