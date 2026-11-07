// `mm sound clone` with the evolution-strategy search and the model-free score (scripts/lib/sound-score.mjs, sound-search.mjs): a
// seeded search with a prescreen, the top three confirmed on two more seeds, a clone that lands nearer the sound it is shaped toward
// (or the profile's balance) than the same budget of random draws did, a clone that passes the artifact gate, and variant sets that
// are neither copies nor strangers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mm } from '../cli/cli-helpers.mjs';
import { SR, render, writeSet } from './_synthetic.mjs';
import { mineSounds } from '../../scripts/sound-mine.mjs';
import { cloneCue } from '../../scripts/sound-clone.mjs';
import { calibratedGain } from '../../scripts/sound-listen.mjs';
import { CANDIDATES, cloneRecipe, cloneVariants, likeOf, variantBand } from '../../scripts/lib/sound-clone.mjs';
import { prepareTarget, scoreAgainst } from '../../scripts/lib/sound-score.mjs';
import { findArtifacts } from '../../scripts/lib/sound-artifacts.mjs';
import { loadProfile, loadRecipe } from '../../scripts/lib/sound-profile.mjs';
import { loudestBalance } from '../../scripts/lib/audio-measure.mjs';
import { renderRecipe } from '../../runtime/kit/synth.js';
import { lintPattern } from '../../scripts/pattern-lint.mjs';

let tmp, profile;
before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'mm-clone-search-'));
  await mineSounds({ input: writeSet(join(tmp, 'set')), out: join(tmp, 'mined'), name: 'bars', licence: 'CC0-1.0', source: 'synthetic test set', author: 'the test' });
  profile = loadProfile(join(tmp, 'mined', 'bars.profile.json'));
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const clone = (cue, meaning, o = {}) => cloneRecipe({ profile, cue, meaning, calibrate: calibratedGain, ...o });
const drawn = (res) => renderRecipe(res.recipe, { sampleRate: SR, profile }).channels;

test('the search is an evolution strategy: a budget of candidates scored in full; with a --like sound more are built than scored', () => {
  const r = clone('es-x', 'a task finished and saved');
  assert.equal(r.search.strategy, 'es');
  assert.equal(r.tried, CANDIDATES);
  assert.equal(r.search.generations, 4);
  assert.equal(r.search.prescreened, r.tried, 'without a --like sound the cheap score is the score: every candidate built is scored');
  assert.ok(r.search.sigmas[0] > r.search.sigmas.at(-1));
  assert.equal(r.search.confirmed.length, 3);
  const withLike = clone('es-like', 'a task finished and saved', { like: likeOf(render('mallet'), SR), family: 'outcome' });
  assert.ok(withLike.search.prescreened > withLike.tried, `${withLike.search.prescreened} built, ${withLike.tried} scored`);
});

test('the top three are confirmed on two more seeds and the one whose worst seed scores best is kept', () => {
  const r = clone('seed-x', 'a button tap');
  for (const c of r.search.confirmed) {
    assert.equal(c.seeds.length, 3);
    assert.equal(c.scores.length, 3);
    assert.equal(c.worst, Math.max(...c.scores));
  }
  const best = r.search.confirmed.reduce((a, b) => (b.worst < a.worst ? b : a));
  assert.equal(best.picked, true);
  assert.equal(r.search.confirmed.filter((c) => c.picked).length, 1);
  assert.equal(r.score, Math.round(best.worst * 1000) / 1000);
});

test('the same inputs give the same recipe, and the legacy random search is still reachable to compare against', () => {
  const a = clone('same-es', 'a task finished'), b = clone('same-es', 'a task finished');
  assert.deepEqual(a.recipe, b.recipe);
  const legacy = clone('same-es', 'a task finished', { search: 'random' });
  assert.equal(legacy.search.strategy, 'random');
  assert.equal(legacy.tried, CANDIDATES);
});

test('with a --like sound the clone lands nearer it than the same budget of random draws did', () => {
  let nearer = 0, sumNew = 0, sumOld = 0;
  const names = ['bar-a', 'mallet', 'string', 'knock'];
  for (const name of names) {
    const sound = render(name), like = likeOf(sound, SR), target = prepareTarget(sound, SR);
    const meaning = like.family === 'input' ? 'a button tap' : like.family === 'surface' ? 'a side panel opens' : 'a task finished and saved';
    const fresh = scoreAgainst(target, drawn(clone(`like-${name}`, meaning, { like, family: like.family }))).total;
    const old = scoreAgainst(target, drawn(clone(`like-${name}`, meaning, { like, family: like.family, search: 'random' }))).total;
    sumNew += fresh; sumOld += old;
    if (fresh < old) nearer++;
    console.log(`  like ${name}: score ${fresh.toFixed(2)} with the search, ${old.toFixed(2)} with random draws`);
  }
  assert.ok(nearer >= 3, `nearer on ${nearer} of ${names.length}`);
  assert.ok(sumNew < sumOld, `${sumNew.toFixed(2)} against ${sumOld.toFixed(2)}`);
});

test('without a --like sound the clone lands nearer the profile\'s tonal balance than random draws did', () => {
  assert.equal(profile.balance.medianDb.length, 28);
  const dist = (res) => { const b = loudestBalance(drawn(res), SR); return Math.sqrt(b.reduce((s, v, i) => s + (v - profile.balance.medianDb[i]) ** 2, 0) / 28); };
  let sumNew = 0, sumOld = 0;
  for (const [cue, meaning] of [['bal-a', 'a task finished and saved'], ['bal-b', 'a side panel opens'], ['bal-c', 'a button tap']]) {
    const fresh = dist(clone(cue, meaning)), old = dist(clone(cue, meaning, { search: 'random' }));
    sumNew += fresh; sumOld += old;
    console.log(`  ${cue}: balance ${fresh.toFixed(2)} dB from the profile with the search, ${old.toFixed(2)} with random draws`);
  }
  assert.ok(sumNew < sumOld, `${sumNew.toFixed(2)} against ${sumOld.toFixed(2)}`);
});

test('a clone passes the artifact gate: no click, clip, cut tail, ring, rise or whip', () => {
  for (const [cue, meaning] of [['art-a', 'a task finished and saved'], ['art-b', 'a side panel opens'], ['art-c', 'a button tap']]) {
    const r = clone(cue, meaning);
    assert.deepEqual(r.artifacts, [], cue);
    assert.deepEqual(findArtifacts(drawn(r), SR, { cue }).map((f) => f.kind), [], cue);
  }
});

test('a tonal --like sound sets the clone\'s partials: the modes the modal fit found, not the profile\'s material', () => {
  const like = likeOf(render('mallet'), SR);
  assert.ok(like.modal && like.modal.partials.some(([r]) => Math.abs(r / 3.99 - 1) < 0.03));
  const r = clone('modal-x', 'a task finished and saved', { like, family: 'outcome' });
  const tone = r.recipe.layers.find((l) => l.kind === 'tone' && l.partials);
  assert.ok(tone.partials.some(([ratio]) => Math.abs(ratio / 3.99 - 1) < 0.03), JSON.stringify(tone.partials));
});

// ---- variants ----------------------------------------------------------------------------------------------------------
test('the variant band is measured on the shipped palette: takes of one cue below, other cues of its family above', () => {
  const b = variantBand({ profile: loadProfile('glass') });
  assert.ok(b.within.length > 10 && b.across.length > 10);
  assert.ok(b.lo > 0 && b.lo < b.hi, JSON.stringify({ lo: b.lo, hi: b.hi }));
  assert.ok(b.lo >= Math.max(...b.within.map((d) => d.total)) - 1e-9, 'a variant is farther than any two takes of one shipped cue');
  assert.ok(b.hi <= Math.max(...b.across.map((d) => d.total)) + 1e-9);
});

test('--variants N makes N recipes of one cue that are neither copies nor strangers, and reports the distances', () => {
  const v = cloneVariants({ profile, cue: 'var-x', meaning: 'a task finished and saved', calibrate: calibratedGain, count: 3 });
  assert.equal(v.variants.length, 3);
  assert.deepEqual(v.variants.map((x) => x.recipe.name), ['var-x', 'var-x-2', 'var-x-3']);
  assert.equal(v.pairs.length, 3);
  for (const p of v.pairs) {
    assert.ok(p.total >= v.band.lo - 1e-9 && p.total <= v.band.hi + 1e-9, `${p.a} ~ ${p.b}: ${p.total} outside ${v.band.lo}..${v.band.hi}`);
    assert.ok(Number.isFinite(p.toneDb) && Number.isFinite(p.envelope) && Number.isFinite(p.character));
  }
  assert.equal(v.inBand, true);
  assert.ok(v.distances.min <= v.distances.median && v.distances.median <= v.distances.max);
  const json = new Set(v.variants.map((x) => JSON.stringify(x.recipe.layers)));
  assert.equal(json.size, 3, 'no two variants are the same recipe');
});

test('mm sound clone --variants writes each variant as a cue of its own, with a card, and says how far apart they are', async () => {
  const out = join(tmp, 'variants');
  const r = await cloneCue({ profileRef: join(tmp, 'mined', 'bars.profile.json'), cue: 'chime-x', meaning: 'a task finished and saved', out, check: false, variants: 3 });
  assert.equal(r.variants.length, 3);
  for (const name of ['chime-x', 'chime-x-2', 'chime-x-3']) {
    const dir = join(out, 'sound', name);
    assert.ok(existsSync(join(dir, 'recipe.json')), name);
    loadRecipe(join(dir, 'recipe.json'));
    assert.equal(lintPattern(dir).complete, true, name);
    assert.match(readFileSync(join(dir, 'PATTERN.md'), 'utf8'), /variant/);
  }
  assert.ok(r.report.pairs.length === 3 && r.report.band.lo > 0);
  assert.deepEqual(readdirSync(join(out, 'sound')).sort(), ['chime-x', 'chime-x-2', 'chime-x-3']);
});

test('mm sound clone --variants through the CLI prints the distances; a cue name too long for the suffix is a usage error', () => {
  const out = join(tmp, 'cli-variants');
  const ok = mm(['sound', 'clone', '--profile', 'glass', '--cue', 'cli-var', '--meaning', 'a draft was saved', '--variants', '2', '--out', out]);
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.stdout, /variants/);
  assert.match(ok.stdout, /tone .* dB/);
  assert.ok(existsSync(join(out, 'sound', 'cli-var-2', 'recipe.json')));
  const long = mm(['sound', 'clone', '--profile', 'glass', '--cue', 'a-very-long-cue-name-indeed-xy', '--meaning', 'a draft was saved', '--variants', '2', '--out', out]);
  assert.equal(long.status, 2);
  assert.equal(mm(['sound', 'clone', '--profile', 'glass', '--cue', 'v-zero', '--meaning', 'a draft', '--variants', '0', '--out', out]).status, 2);
});
