// W-EASE (SPEC §7), the rule itself, without a browser: it reads the style and the story, so a fake context is enough.
// tests/check/ease.test.mjs runs it through the whole gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import run, { easeSpecs } from '../../scripts/check/W-EASE.mjs';
import { IDS } from '../../scripts/check.mjs';

const editorial = JSON.parse(readFileSync(new URL('../../styles/presets/editorial.json', import.meta.url), 'utf8'));
const story = (params = {}, extra = {}) => ({
  id: 's', kind: 'film', scenes: [{ id: 'one', layout: 'layouts/statement', duration: 4, cut: 'transitions/hard-cut', beats: [{ at: 0, slot: 'headline', fx: 'entrances/fade', text: 'a | b', params }], ...extra }],
});
const style = (easings = {}, stagger = {}) => ({ ...editorial, motion: { ...editorial.motion, easings: { ...editorial.motion.easings, ...easings }, stagger: { ...editorial.motion.stagger, ...stagger } } });
const check = async (st, sy) => run({ story: st, style: sy });

test('W-EASE is a gate rule, a warning, listed with the others', () => {
  assert.ok(IDS.includes('W-EASE'));
  assert.ok(IDS.indexOf('W-EASE') > IDS.indexOf('W-HOOK'), 'a W- rule comes after the G- rules');
});

test('the shipped style and a plain story pass, naming how many eases it read', async () => {
  const r = await check(story(), style());
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.measured, 3);
});

test('a brand that names eases from the families passes', async () => {
  const r = await check(story({ stagger: { ease: 'quad.out' } }), style({ enter: 'back.out(1.4)', exit: 'expo.in', move: 'steps(4)', pop: 'elastic.out(1, .4)' }, { ease: 'sine.inOut' }));
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.measured, 6);
});

test('an unknown ease name warns where it is spelt, and says what falls back', async () => {
  const r = await check(story({ stagger: { ease: 'bak.out' } }), style());
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.all.length, 1);
  assert.equal(r.evidence.all[0].kind, 'unknown');
  assert.equal(r.evidence.selector, '[data-scene="one"] [data-slot="headline"] params.stagger.ease');
  assert.match(r.evidence.reason, /unknown easing "bak\.out"; what asked for it falls back/);
  const s = await check(story(), style({ enter: 'bak.out' }));
  assert.equal(s.status, 'WARN');
  assert.equal(s.evidence.selector, 'style.motion.easings.enter');
  assert.match(s.evidence.reason, /the kit stops when it draws it/);
});

test('a steps ease that is not a whole number of steps warns: the last step is partial', async () => {
  const r = await check(story(), style({ move: 'steps(2.5)' }));
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.all[0].kind, 'steps');
  assert.match(r.evidence.reason, /steps\(2\.5\) is not a whole number of steps/);
  assert.equal((await check(story(), style({ move: 'steps(8)' }))).status, 'PASS');
});

test('a custom curve that is not a function of x warns; a clean one passes', async () => {
  const r = await check(story(), style({ enter: 'curve(M0,0 C1.2,0.2 -0.1,0.8 1,1)' }));
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.all[0].kind, 'curve');
  assert.match(r.evidence.reason, /runs backwards in x/);
  assert.equal((await check(story(), style({ enter: 'curve(M0,0 C0.25,0.1 0.25,1 1,1)' }))).status, 'PASS');
});

test('linear() stops that do not run from 0 to 1 warn', async () => {
  const r = await check(story(), style({ exit: 'linear(0.2, 0.6, 1)' }));
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.all[0].kind, 'ends');
});

test('it reads eases wherever a beat spells one: params, exit and emphasis bags, screen actions, variants, the brand\'s pattern defaults', () => {
  const st = story({ ease: 'quad', exit: { ease: 'sine' }, emphasis: { punchEase: 'back.out' }, stagger: { ease: 'expo' } }, {
    cutParams: { ease: 'circ' },
    variants: { '9x16': { beats: [{ at: 0, slot: 'sub', fx: 'entrances/fade', params: { ease: 'cubic.in' } }] } },
  });
  st.scenes[0].beats[0].screen = [{ do: 'screen/scroll', at: 0, params: { ease: 'bounce' } }];
  const sy = style();
  sy.patterns = { 'entrances/pop': { settleEase: 'elastic.out' } };
  const where = easeSpecs(sy, st).map((s) => s.where);
  for (const w of ['params.ease', 'params.exit.ease', 'params.emphasis.punchEase', 'params.stagger.ease', 'cutParams.ease', 'screen/scroll params.ease', 'style.patterns.entrances/pop.settleEase']) {
    assert.ok(where.some((x) => x.endsWith(w)), `${w}\n${where.join('\n')}`);
  }
  assert.ok(where.some((x) => x.includes('[data-slot="sub"] params.ease')), 'a format variant');
});

test('SKIP when the piece spells no ease at all', async () => {
  const sy = style();
  sy.motion.easings = {};
  const r = await check(story(), sy);
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /spells no ease/);
});
