// The scored cut evals (evals/footage-cuts/): the scorer on hand-made cuts, the gold fixtures themselves
// (spans inside the clip, no mustCut over a mustKeep), and the score of `mm footage review` on them, pinned:
// a rule change that loses recall or precision, or cuts into a protected span, fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { FIXTURES, evaluate, evaluateDir, loadFixtures, score, KEEP_TOLERANCE_S } from '../../scripts/footage-eval.mjs';

const ROOT = join(FIXTURES, '..', '..');
const cut = (id, start, end, kind = 'long-pause') => ({ id, kind, start, end });

test('score: recall counts the mustCut spans covered by half or more, precision the cuts lying in what may be cut', () => {
  const gold = { mustCut: [{ start: 1, end: 3 }, { start: 5, end: 6 }], optionalCut: [{ start: 8, end: 9 }], mustKeep: [{ start: 3.5, end: 4.5, note: 'the answer' }] };
  const s = score([cut('c1', 1.2, 2.8), cut('c2', 8.1, 8.9), cut('c3', 5.0, 5.3), cut('c4', 10, 11)], gold);
  assert.equal(s.found, 1, 'c3 covers 0.3 of the 1 s span at 5-6');
  assert.equal(s.recall, 0.5);
  assert.deepEqual(s.missed, ['5-6']);
  assert.equal(s.justified, 3, 'c1, c2 and the 0.3 s cut inside a mustCut span; c4 is nowhere');
  assert.equal(s.precision, 0.75);
  assert.deepEqual(s.unjustified, ['c4 long-pause 10-11']);
  assert.deepEqual(s.violations, []);
});

test('score: a cut into a mustKeep span is a violation naming the cut and the span; a graze within tolerance is not', () => {
  const gold = { mustCut: [], mustKeep: [{ start: 4, end: 5, note: 'the answer' }] };
  const s = score([cut('c1', 4.5, 6), cut('c2', 5.0, 5.5), cut('c3', 3, 4 + KEEP_TOLERANCE_S / 2)], gold);
  assert.deepEqual(s.violations.map((v) => [v.cut, v.keep, v.overlapS]), [['c1', 'the answer', 0.5]]);
});

test('score: nothing to cut is recall 1, nothing proposed is precision 1; overlapping cuts count once', () => {
  assert.deepEqual([score([], { mustCut: [{ start: 1, end: 2 }] }).recall, score([], { mustCut: [{ start: 1, end: 2 }] }).precision], [0, 1]);
  assert.deepEqual([score([cut('c', 1, 2)], { mustCut: [] }).recall, score([cut('c', 1, 2)], { mustCut: [] }).precision], [1, 0]);
  const twice = score([cut('a', 1, 1.6), cut('b', 1.4, 2)], { mustCut: [{ start: 1, end: 3 }] });
  assert.equal(twice.found, 1, 'the union covers 1 of 2 s, which is half');
});

test('the gold fixtures: every gold has its words, spans sit inside the clip, no mustCut or optionalCut touches a mustKeep span', () => {
  const fixtures = loadFixtures(FIXTURES);
  assert.ok(fixtures.length >= 6, `${fixtures.length} fixtures`);
  for (const f of fixtures) {
    assert.ok(f.words.length && f.about && f.duration > 0, f.name);
    for (const span of [...f.mustCut, ...f.optionalCut, ...f.mustKeep]) {
      assert.ok(span.start >= 0 && span.end <= f.duration && span.end > span.start, `${f.name}: ${JSON.stringify(span)}`);
    }
    for (const c of [...f.mustCut, ...f.optionalCut]) for (const k of f.mustKeep) {
      assert.ok(Math.min(c.end, k.end) - Math.max(c.start, k.start) <= 0, `${f.name}: cut span ${c.start}-${c.end} overlaps keep span ${k.start}-${k.end}`);
    }
    assert.ok(f.words.every((w) => w.end <= f.duration), `${f.name}: words end inside the clip`);
  }
});

// The score of review on the fixtures as of this commit. Raise the pins when a rule gets better; never lower them to pass.
const PIN = { recall: 0.933, precision: 1, violations: 0 };
const FOUND_BY_FIXTURE = { 'clean-take': 0, 'dead-air-by-sound': 5, fillers: 3, 'paraphrased-restart': 1, retakes: 2, 'stutter-and-emphasis': 3, 'words-over-silence': 0 };

test('pinned: review keeps its recall and precision on the gold fixtures and never cuts into a mustKeep span', () => {
  const r = evaluateDir(FIXTURES);
  assert.equal(r.violations, PIN.violations, JSON.stringify(r.fixtures.flatMap((f) => f.violations)));
  assert.ok(r.recall >= PIN.recall, `recall ${r.recall} fell under the pinned ${PIN.recall}: ${JSON.stringify(r.fixtures.filter((f) => f.missed.length).map((f) => [f.name, f.missed]))}`);
  assert.ok(r.precision >= PIN.precision, `precision ${r.precision} fell under the pinned ${PIN.precision}: ${JSON.stringify(r.fixtures.filter((f) => f.unjustified.length).map((f) => [f.name, f.unjustified]))}`);
  for (const f of r.fixtures) {
    assert.ok(f.name in FOUND_BY_FIXTURE, `${f.name} has no pin: add it to FOUND_BY_FIXTURE`);
    assert.ok(f.found >= FOUND_BY_FIXTURE[f.name], `${f.name}: found ${f.found} of ${f.mustCut}, pinned ${FOUND_BY_FIXTURE[f.name]}`);
    assert.deepEqual(f.unjustified, [], `${f.name}: cuts nobody asked for`);
    assert.deepEqual(f.violations, [], f.name);
  }
});

test('the eval sees a worse rule: proposing from the words alone cuts into the laugh and into the invented words', () => {
  const words = evaluateDir(FIXTURES, { hear: false });
  assert.ok(words.violations >= 3, `${words.violations} violations without sound`);
  assert.ok(words.precision < 1);
  const byName = Object.fromEntries(words.fixtures.map((f) => [f.name, f]));
  assert.ok(byName['dead-air-by-sound'].violations.some((v) => /laugh/.test(v.keep)));
  assert.equal(byName['words-over-silence'].violations.length, 2);
});

test('evaluate takes one fixture, with or without sound', () => {
  const f = loadFixtures(FIXTURES).find((x) => x.name === 'words-over-silence');
  assert.deepEqual(evaluate(f).violations, []);
  assert.equal(evaluate(f, { hear: false }).violations.length, 2);
});

test('the script: exit 0 on the pinned score, 1 on a hard failure or a score under --min-recall, 2 on a bad flag; --json prints the scores', () => {
  const run = (...args) => spawnSync(process.execPath, [join(ROOT, 'scripts/footage-eval.mjs'), ...args], { encoding: 'utf8' });
  let r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /total: recall 0\.933, precision 1, 0 hard failures/);
  assert.match(r.stdout, /paraphrased-restart: recall 1\/2/);
  assert.match(r.stdout, /missed: the first take, said again in other words/);
  r = run('--words-only');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /HARD: c\d+ \(long-pause, [\d.]+-[\d.]+ s\) cuts into "a laugh/);
  assert.equal(run('--min-recall', '0.99').status, 1);
  assert.equal(run('--min-recall', '2').status, 2);
  assert.equal(run('--bogus').status, 2);
  assert.equal(run('--dir', join(ROOT, 'evals')).status, 2);
  r = run('--json');
  assert.equal(JSON.parse(r.stdout).violations, 0);
});
