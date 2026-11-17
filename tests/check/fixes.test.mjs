// The gate's findings say how to fix them (SPEC §7): every rule has a fix line, a FAIL or WARN row carries
// `fix` and `see`, a rule's own fix wins, and a misspelt pattern, cue or param names the nearest real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXES, withFix, seeOf } from '../../scripts/check/_fixes.mjs';
import { didYouMean, editDistance } from '../../scripts/lib/suggest.mjs';
import { misspeltParams } from '../../scripts/check/G-PATTERN-REF.mjs';
import { ROOT } from '../../scripts/lib/browser.mjs';

const ids = readdirSync(join(ROOT, 'scripts', 'check')).filter((f) => /^[GW]-[A-Z0-9-]+\.mjs$/.test(f)).map((f) => f.replace(/\.mjs$/, ''));

test('every rule file has a fix line, and every fix line has its rule file', () => {
  assert.deepEqual(ids.filter((id) => !FIXES[id]), []);
  assert.deepEqual(Object.keys(FIXES).filter((id) => !ids.includes(id)), []);
});

test('a FAIL or WARN row gets fix and see; PASS and SKIP rows are untouched; a rule\'s own fix wins', () => {
  const warn = withFix({ id: 'W-HOOK', status: 'WARN', evidence: {} });
  assert.equal(warn.fix, FIXES['W-HOOK']); assert.equal(warn.see, seeOf('W-HOOK'));
  assert.match(warn.see, /SPEC\.md §7 \(W-HOOK\), scripts\/check\/W-HOOK\.mjs/);
  assert.equal(withFix({ id: 'G-TIME', status: 'FAIL', evidence: { fix: 'remove Date.now() at line 3' } }).fix, 'remove Date.now() at line 3');
  const pass = { id: 'G-TIME', status: 'PASS', evidence: {} };
  assert.equal(withFix(pass), pass);
});

test('did you mean: a typo, a pattern in the wrong group and an alias are suggested; a far name is not', () => {
  const known = ['entrances/fade', 'entrances/rise', 'moves/push-in', 'transitions/crossfade'];
  assert.equal(didYouMean('entrances/fdae', known), 'entrances/fade');
  assert.equal(didYouMean('moves/rise', known), 'entrances/rise');
  assert.equal(didYouMean('zoom-in', known), 'moves/push-in');
  assert.equal(didYouMean('cross-fade', known), 'transitions/crossfade');
  assert.equal(didYouMean('entrances/kaleidoscope', known), null);
  assert.equal(didYouMean('entrances/fade', known), null);   // an exact name needs no suggestion
  assert.equal(editDistance('tone', 'tnoe'), 1);
});

test('a beat param that is a likely typo of one its patterns or the kit read is named with its fix; an unrelated one is left alone', () => {
  const story = { scenes: [{ id: 's', beats: [{ slot: 'headline', fx: 'entrances/rise', emphasis: 'emphasis/stamp', params: { instnat: true, tilt: 'left', tlit: 'none', mood: 'x' } }] }] };
  const patterns = { 'entrances/rise': { params: { distance: {} } }, 'emphasis/stamp': { params: { tilt: {}, tone: {} } } };
  assert.deepEqual(misspeltParams(story, patterns).map((t) => [t.key, t.guess]), [['instnat', 'instant'], ['tlit', 'tilt']]);
});

test('G-PATTERN-REF names the nearest pattern in its fix', async () => {
  const { default: refRule } = await import('../../scripts/check/G-PATTERN-REF.mjs');
  const dir = join(ROOT, 'patterns', 'emphasis', 'marker-circle', 'demo');
  const story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  story.scenes[0].beats[0].fx = 'entrances/rsie';
  const r = await refRule({ dir, story, style: {}, patternsBase: join(ROOT, 'patterns'), patterns: {}, schedule: { warnings: [] }, meta: { warnings: [] } });
  assert.equal(r.status, 'FAIL');
  assert.equal(r.evidence.suggest, 'entrances/rise');
  assert.match(r.evidence.fix, /^Did you mean entrances\/rise\?/);
});
