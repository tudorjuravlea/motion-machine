// W-SEAM (SPEC §7): across a cut, an element that exits and the one that arrives after it should travel
// the same way at about the same speed. fixtures/negatives/W-SEAM has the style headline leave to the
// left (exits/slide-out, t = 4.5 s of its scene) and the next scene's headline travel right
// (entrances/slide-in): opposed. The variants here change the sides and the exit's distance.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { gate, warnsOnly, row } from './_harness.mjs';
import { variant, cleanup, beat } from './_variant.mjs';
import { SEAM_PCT, declaredDirection, dominant } from '../../scripts/check/W-SEAM.mjs';

const run = gate();
after(cleanup);
const only = { only: ['W-SEAM'] };

/** The W-SEAM negative with the exit and the arrival changed by `edit(exitBeat, enterBeat)`. */
const seam = (edit, style) => variant('W-SEAM', ({ story, style: st }) => { edit(beat(story, 'style', 'headline'), beat(story, 'rests', 'headline')); if (style) st.gate = style; });
const check = async (dir) => row(await run(dir, only), 'W-SEAM');

test('the limit is 5 percent', () => assert.equal(SEAM_PCT, 5));

test('fixtures/negatives/W-SEAM warns W-SEAM and nothing else: left against right', async () => {
  const r = warnsOnly(await run('W-SEAM'), 'W-SEAM');
  assert.match(r.evidence.reason, /leaves left and .*rests.* arrives travelling right: opposed across the cut/);
  assert.equal(r.evidence.seams[0].opposed, true);
  assert.equal(r.evidence.instant, 10, 'the cut into the third scene');
});

test('the same direction at a different speed warns with both speeds; matched, it passes', async () => {
  const same = await check(seam((out, inn) => { inn.params = { side: 'left' }; }));
  assert.equal(same.status, 'WARN');
  assert.equal(same.evidence.seams[0].opposed, false);
  assert.equal(same.evidence.seams[0].measuredSpeed, true);
  assert.match(same.evidence.reason, /px\/s and .* apart across the cut; match them to within 5 %/);
  const { exitSpeed, enterSpeed } = same.evidence.seams[0];
  // travel is linear in the exit's distance: scale it until the speeds meet, then step off by 3 % and by 8 %
  const at = async (k) => (await check(seam((out, inn) => { inn.params = { side: 'left' }; out.params = { side: 'left', exit: { side: 'left', d: Math.round(120 * (enterSpeed / exitSpeed) * k * 100) / 100 } }; })));
  const matched = await at(1);
  assert.equal(matched.status, 'PASS', JSON.stringify(matched.evidence.seams));
  assert.ok(matched.evidence.measured < 1, `${matched.evidence.measured} % apart`);
  assert.equal((await at(1.03)).status, 'PASS', '3 % apart');
  assert.equal((await at(1.08)).status, 'WARN', '8 % apart');
  assert.equal((await at(0.92)).status, 'WARN');
});

test('a direction the pattern does not declare is read from where the element goes', async () => {
  // entrances/rise (no side param in the stub) rises from below: it travels up
  const up = await check(seam((out, inn) => { out.params = { side: 'up' }; inn.fx = 'entrances/rise'; inn.params = {}; }));
  assert.equal(up.evidence.seams[0].exitDirection, 'up');
  assert.equal(up.evidence.seams[0].enterDirection, 'up');
  assert.equal(up.evidence.seams[0].opposed, false);
  const down = await check(seam((out, inn) => { out.params = { side: 'down' }; inn.fx = 'entrances/rise'; inn.params = {}; }));
  assert.equal(down.status, 'WARN');
  assert.equal(down.evidence.seams[0].opposed, true);
  assert.match(down.evidence.reason, /leaves down and .* arrives travelling up/);
});

test('a style\'s gate.seamPct sets the tolerance and the evidence says so', async () => {
  const wide = await check(seam((out, inn) => { inn.params = { side: 'left' }; }, { seamPct: 90 }));
  assert.equal(wide.status, 'PASS');
  assert.equal(wide.evidence.threshold, 'same direction, speeds within 90 %');
  const opposed = await check(seam((out, inn) => { inn.params = { side: 'right' }; }, { seamPct: 90 }));
  assert.equal(opposed.status, 'WARN', 'opposed directions warn whatever the speed');
});

test('an exit that is not near a cut, or an arrival that does not travel, is no seam: SKIP with a reason', async () => {
  const early = await check(seam((out) => { out.out = 1; }));
  assert.equal(early.status, 'SKIP');
  assert.match(early.evidence.reason, /no element exits into/);
  const still = await check(seam((out, inn) => { inn.fx = 'entrances/fade'; inn.params = {}; }));
  assert.equal(still.status, 'SKIP');
  assert.match(still.evidence.reason, /nothing to match/);
});

test('a film with no exits and a deck are SKIP with a reason', async () => {
  assert.match(row(await run('_base/film', only), 'W-SEAM').evidence.reason, /no element exits/);
  assert.match(row(await run('_base/deck', only), 'W-SEAM').evidence.reason, /deck/);
});

test('declaredDirection reads side, direction or dir from the beat\'s bag, else the pattern\'s default', () => {
  const mod = { params: { side: { default: 'up' } } };
  assert.equal(declaredDirection({}, mod), 'up');
  assert.equal(declaredDirection({ side: 'left' }, mod), 'left');
  assert.equal(declaredDirection({ direction: 'down' }, undefined), 'down');
  assert.equal(declaredDirection({ dir: 'right' }, undefined), 'right');
  assert.equal(declaredDirection({ side: 'sideways' }, undefined), null);
  assert.equal(declaredDirection({}, { params: { side: { default: 'place' } } }), null);
});

test('dominant takes the larger axis and ignores travel under the minimum', () => {
  assert.equal(dominant([-30, 10], 5), 'left');
  assert.equal(dominant([10, 30], 5), 'down');
  assert.equal(dominant([0, -30], 5), 'up');
  assert.equal(dominant([4, 3], 5), null);
});
