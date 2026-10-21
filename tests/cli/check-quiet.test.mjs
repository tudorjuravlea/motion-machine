// `mm check --quiet` drops the per-rule lines, not the verdict: a failing gate still ends with one
// line on stderr naming the failed rules and the report; a passing gate prints nothing; --json keeps
// stdout for the JSON alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, mm } from './cli-helpers.mjs';

const NEG = join(ROOT, 'fixtures', 'negatives');

test('--quiet on a failing piece prints one summary line naming the failed rules and the report', () => {
  const r = mm(['check', join(NEG, 'G-LEGIBLE', 'size'), '--format', '16x9', '--quiet']);
  assert.equal(r.status, 1, r.out);
  assert.equal(r.stdout, '', 'no per-rule lines');
  assert.match(r.stderr.trim(), /^mm check: \d+ rules? failed: G-LEGIBLE.*check\.json$/);
  assert.equal(r.stderr.trim().split('\n').length, 1, r.stderr);
});

test('--quiet --json keeps stdout for the JSON and adds no summary line', () => {
  const r = mm(['check', join(NEG, 'G-LEGIBLE', 'size'), '--format', '16x9', '--quiet', '--json']);
  assert.equal(r.status, 1, r.out);
  assert.ok(JSON.parse(r.stdout).rules.length > 30);
  assert.doesNotMatch(r.stderr, /rules? failed/);
});
