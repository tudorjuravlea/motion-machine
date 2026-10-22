// The shipped mascots draw exactly what they drew before the rig learned extra parts, floating,
// screen faces and casts: the markup of paper's, nocturne's and the default character over every
// mood and view, the idle across four seconds, the hop from each side, every act and the three
// model sheets hashes to the values in fixtures/mascot/shipped-markup.json.
// MM_WRITE_BASELINE=1 rewrites that file from the rig as it is (only when the change is meant).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveMascot, characterPose, markup, MOODS, VIEWS } from '../../runtime/kit/rig.js';

const url = (f) => new URL(`../../${f}`, import.meta.url);
const read = (f) => JSON.parse(readFileSync(url(f), 'utf8'));
const FIXTURE = 'fixtures/mascot/shipped-markup.json';
const color = read('styles/brands/paper.json').color;

function digests() {
  const out = {};
  const brands = { paper: read('styles/brands/paper.json'), nocturne: read('styles/brands/nocturne.json'), plain: { color } };
  for (const [name, b] of Object.entries(brands)) {
    const m = resolveMascot({ mascot: b.mascot, color: b.color });
    const h = (key, list) => { out[`${name}/${key}`] = createHash('sha1').update(list.join('\n')).digest('hex'); };
    for (const mood of MOODS) for (const view of VIEWS) {
      const svgs = [];
      for (let t = 0; t < 4; t += 0.1) svgs.push(markup(m, characterPose({ mascot: m, mood, view, t, bpm: 120, seed: 0.3 }), { id: 'x' }));
      h(`idle/${mood}/${view}`, svgs);
    }
    for (const from of ['place', 'left', 'right']) {
      const svgs = [];
      for (let q = 0; q <= 1; q += 1 / 30) svgs.push(markup(m, characterPose({ mascot: m, q, from, mood: 'happy', facing: from === 'right' ? 'left' : 'right' }), { id: 'x' }));
      h(`hop/${from}`, svgs);
    }
    for (const to of MOODS) {
      const svgs = [];
      for (let a = -0.3; a < 0.9; a += 1 / 30) svgs.push(markup(m, characterPose({ mascot: m, mood: 'calm', t: 2 + a, act: { from: 'calm', to, a, amt: 1 } }), { id: 'x' }));
      h(`act/${to}`, svgs);
    }
    for (const sheet of ['moods', 'views', 'all']) for (const aspect of [0.5, 2]) h(`sheet/${sheet}/${aspect}`, [markup(m, characterPose({ mascot: m, mood: 'proud' }), { id: 'x', sheet, aspect })]);
  }
  return out;
}

test('the shipped mascots and the default character draw exactly as before', () => {
  const now = digests();
  if (process.env.MM_WRITE_BASELINE === '1') writeFileSync(url(FIXTURE), `${JSON.stringify(now, null, 1)}\n`);
  const was = read(FIXTURE);
  const changed = Object.keys(was).filter((k) => was[k] !== now[k]);
  assert.deepEqual(changed, [], `markup changed for ${changed.length} cases`);
  assert.equal(Object.keys(now).length, Object.keys(was).length);
});
