// The kit-smoke fixture and the skeletons honour the contracts, and runtime/ stays pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { schedule } from '../../runtime/kit/schedule.js';

const v = validators();
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const errs = (fn) => JSON.stringify(fn.errors);
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

for (const kind of ['film', 'deck']) {
  test(`kit-smoke ${kind}: story and style validate, and every font src resolves from the piece`, () => {
    const story = json(`fixtures/kit-smoke/${kind}/story.json`);
    const style = json(`fixtures/kit-smoke/${kind}/style.json`);
    assert.ok(v.story(story), errs(v.story));
    assert.ok(v.style(style), errs(v.style));
    for (const face of Object.values(style.type)) for (const f of face.files) {
      const file = join(ROOT, 'fixtures/kit-smoke', kind, f.src);
      assert.ok(existsSync(file), f.src);
      assert.ok(existsSync(join(dirname(file), 'LICENSE.txt')), `${f.src}: licence travels with the font`);
    }
    // the fixture's stub patterns cover every reference
    for (const sc of story.scenes) for (const ref of [sc.layout, sc.cut, ...sc.beats.map((b) => b.fx)]) {
      assert.ok(existsSync(join(ROOT, 'fixtures/kit-smoke/patterns', ref)), ref);
    }
  });
}

test('kit-smoke shapes: a 6 s film with two scenes and one hard cut; a 3-press deck', () => {
  const style = json('fixtures/kit-smoke/film/style.json');
  const film = schedule(json('fixtures/kit-smoke/film/story.json'), style);
  assert.equal(film.duration, 6);
  assert.equal(film.scenes.length, 2);
  assert.deepEqual(film.events.filter((e) => e.kind === 'cut').map((e) => [e.t, e.pattern]), [[0, 'transitions/hard-cut'], [3, 'transitions/hard-cut']]);
  const deck = schedule(json('fixtures/kit-smoke/deck/story.json'), style);
  assert.equal(deck.presses, 3);
  assert.deepEqual(deck.rests, [0, 1, 2, 3]);
});

test('skeleton stories validate', () => {
  for (const kind of ['film', 'deck']) {
    const s = json(`runtime/skeletons/${kind}/story.json`);
    assert.ok(v.story(s), errs(v.story));
    assert.equal(s.kind, kind);
  }
});

test('runtime/ uses no timer, frame loop, clock or unseeded random (AXIOM 1, SPEC §2.4)', () => {
  // vendored libraries (runtime/vendor) are held to this at run time by the time trap, not by their source
  const files = walk(join(ROOT, 'runtime')).filter((f) => /\.(js|html)$/.test(f) && !f.includes('/runtime/vendor/'));
  assert.ok(files.length >= 10);
  for (const f of files) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /\b(setTimeout|setInterval|requestAnimationFrame|Date|performance\.now|Math\.random)\b|autoplay/, f);
  }
});

test('runtime/ and the fixture carry no http(s) URL (SPEC §2.6)', () => {
  const files = [...walk(join(ROOT, 'runtime')), ...walk(join(ROOT, 'fixtures/kit-smoke'))].filter((f) => /\.(js|html|css|json)$/.test(f) && !f.includes('/runtime/vendor/'));
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /https?:\/\//, f);
});
