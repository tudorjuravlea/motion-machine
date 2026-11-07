// SPEC §5's table of a pattern folder's files names the same groups the lint requires them for:
// an author who follows SPEC writes every file `mm pattern lint` asks for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lint = readFileSync(join(ROOT, 'scripts', 'pattern-lint.mjs'), 'utf8');
const spec = readFileSync(join(ROOT, 'SPEC.md'), 'utf8');

const lintSet = (name) => new Set(lint.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]`))[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1)));
const specSet = (file) => {
  const row = spec.split('\n').find((l) => l.startsWith(`| \`${file}\` |`));
  assert.ok(row, `SPEC §5 has a row for ${file}`);
  return new Set(row.split('|')[2].split(',').map((s) => s.trim()).filter(Boolean));
};

for (const [file, set] of [['pattern.js', 'NEEDS_JS'], ['pattern.html', 'NEEDS_HTML']]) {
  test(`SPEC §5 requires ${file} for exactly the groups the lint does`, () => {
    assert.deepEqual([...specSet(file)].sort(), [...lintSet(set)].sort());
  });
}
