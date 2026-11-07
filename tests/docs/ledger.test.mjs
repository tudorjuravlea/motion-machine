// The rule ledger (SPEC §14) names, for every gate rule, its rule file, its test and its negative
// fixtures. This test keeps the ledger honest: every rule file has a row, and every path a row names
// exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const spec = readFileSync(join(ROOT, 'SPEC.md'), 'utf8');

const section = spec.slice(spec.indexOf('## 14. Rule ledger'), spec.indexOf('## 15.'));
const rows = section.split('\n').filter((l) => /^\| [GW]-[A-Z-]+ \|/.test(l)).map((l) => l.split(/(?<!\\)\|/).map((c) => c.trim()).slice(1, -1));

/** `tests/sound/{cues,gate}.test.mjs` becomes two paths. */
function expand(path) {
  const m = /^(.*)\{([^}]*)\}(.*)$/.exec(path);
  return m ? m[2].split(',').flatMap((alt) => expand(m[1] + alt + m[3])) : [path];
}
const codeSpans = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

test('every rule file in scripts/check/ has a ledger row, and every row has its rule file', () => {
  const files = readdirSync(join(ROOT, 'scripts/check')).filter((f) => /^[GW]-.+\.mjs$/.test(f)).map((f) => f.slice(0, -4)).sort();
  const ids = rows.map((r) => r[0]).flatMap((id) => id.split(' · ')).sort();
  assert.deepEqual(ids, files);
});

test('every ledger row names a rule file, tests and a negatives folder that exist', () => {
  assert.ok(rows.length > 30, 'the ledger table was not found');
  const problems = [];
  for (const [id, ruleFile, tests, negatives] of rows) {
    for (const f of codeSpans(ruleFile).filter((c) => c.endsWith('.mjs') && !c.includes('/'))) {
      if (!existsSync(join(ROOT, 'scripts/check', f))) problems.push(`${id}: scripts/check/${f} is missing`);
    }
    for (const t of codeSpans(tests).filter((c) => c.startsWith('tests/')).flatMap(expand)) {
      if (!existsSync(join(ROOT, t))) problems.push(`${id}: ${t} is missing`);
    }
    const first = codeSpans(negatives).find((c) => /^[GW]-/.test(c));
    if (first && !existsSync(join(ROOT, 'fixtures/negatives', first.split('/')[0]))) problems.push(`${id}: fixtures/negatives/${first.split('/')[0]} is missing`);
  }
  assert.deepEqual(problems, []);
});
