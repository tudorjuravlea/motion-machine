// `mm stills`. The contact sheet holds one tile per rest plus one per mid-entrance
// the schedule reports; phone.png tiles are 378 px wide; a move gets a 12-frame strip.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from '../../runtime/kit/schedule.js';
import { pngSize } from '../../scripts/lib/sheet.mjs';
import { mm, readJson, workCopy } from './cli-helpers.mjs';

let w;
before(() => { w = workCopy('stills'); });
after(() => w.cleanup());

const r3 = (x) => Math.round(x * 1000) / 1000;
/** Rests plus distinct mid-entrance instants, computed here from the kit's pure schedule (no browser). */
function expected(piece) {
  const story = readJson(join(piece, 'story.json')), style = readJson(join(piece, 'style.json'));
  const s = schedule(story, style);
  const deck = s.kind === 'deck';
  const mids = new Set();
  for (const e of s.events) {
    const from = deck ? e.from : e.t, to = deck ? e.to : e.t + (e.d ?? 0);
    if ((e.kind === 'arrive' || (e.kind === 'cut' && e.d > 0)) && to > from) mids.add(r3((from + to) / 2));
  }
  return { rests: s.rests.length, mids: mids.size };
}
const pngs = (dir) => readdirSync(dir).filter((f) => /^\d\d-(rest|mid)-.*\.png$/.test(f));

for (const kind of ['film', 'deck']) {
  test(`${kind}: tile count equals rests plus mid-entrances; phone tiles are 378 px wide`, () => {
    const piece = w[kind];
    const r = mm(['stills', piece]);
    assert.equal(r.status, 0, r.out);
    const want = expected(piece);
    const s = readJson(join(piece, 'out', 'stills', 'stills.json'));
    assert.equal(s.rests, want.rests);
    assert.equal(s.midEntrances, want.mids);
    assert.equal(s.contact.tiles.length, want.rests + want.mids);
    assert.equal(s.phone.tiles.length, want.rests + want.mids);
    assert.equal(pngs(join(piece, 'out', 'stills')).length, want.rests + want.mids, 'one frame file per tile');
    if (kind === 'deck') assert.equal(want.rests, 4, 'presses + 1 rests');

    assert.ok(s.phone.tiles.every((t) => t.w === 378), 'every phone tile is 378 px wide');
    const phone = pngSize(readFileSync(join(piece, 'out', 'phone.png')));
    assert.equal(phone.width, s.phone.width);
    const cols = new Set(s.phone.tiles.map((t) => t.x)).size;
    assert.equal(phone.width, 8 * 2 + cols * 378 + (cols - 1) * 8, 'sheet width is margins + gaps + tiles of 378');
    const contact = pngSize(readFileSync(join(piece, 'out', 'contact.png')));
    assert.deepEqual([contact.width, contact.height], [s.contact.width, s.contact.height]);
  });
}

test('--format changes the frame size of every tile', () => {
  const r = mm(['stills', w.film, '--format', '9x16']);
  assert.equal(r.status, 0, r.out);
  const s = readJson(join(w.film, 'out', 'stills', 'stills.json'));
  assert.equal(s.format, '9x16');
  assert.ok(s.phone.tiles.every((t) => t.w === 378 && t.h === 672), '378 x 672 for a 1080 x 1920 frame');
});

test('a camera move gets a 12-frame strip', () => {
  const move = join(w.patterns, 'moves', 'push');
  mkdirSync(move, { recursive: true });
  writeFileSync(join(move, 'pattern.js'), "export default { name: 'push', group: 'moves', params: {}, at(el, p) { el.style.scale = String(1 + 0.1 * p); } };\n");
  writeFileSync(join(move, 'pattern.css'), '');
  const story = readJson(join(w.film, 'story.json'));
  story.scenes[0].move = 'moves/push';
  writeFileSync(join(w.film, 'story.json'), JSON.stringify(story));
  const r = mm(['stills', w.film, '--format', '16x9']);
  assert.equal(r.status, 0, r.out);
  const strips = readdirSync(join(w.film, 'out', 'stills')).filter((f) => f.startsWith('strip-'));
  assert.equal(strips.length, 1, strips.join(', '));
  const { width, height } = pngSize(readFileSync(join(w.film, 'out', 'stills', strips[0])));
  assert.equal(width, 12 * 2 + 6 * 320 + 5 * 12, 'six columns of 320 px');
  assert.equal(height, 12 * 2 + 2 * (180 + 26) + 12, 'two rows: 12 frames in six columns');
  assert.equal(readJson(join(w.film, 'out', 'stills', 'stills.json')).strips, 1);
  assert.ok(existsSync(join(w.film, 'out', 'contact.png')));
});
