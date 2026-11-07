// A pattern that declares `fragment: true` has one source for its markup: pattern.html, which the
// kit instantiates. A second copy in pattern.js would drift from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = new URL('../../patterns/', import.meta.url).pathname;

const fragmentPatterns = [];
for (const group of readdirSync(PATTERNS)) {
  for (const name of readdirSync(join(PATTERNS, group))) {
    const js = join(PATTERNS, group, name, 'pattern.js');
    if (existsSync(js) && /\bfragment:\s*true\b/.test(readFileSync(js, 'utf8'))) fragmentPatterns.push(`${group}/${name}`);
  }
}

test('the fragment patterns are found', () => {
  assert.ok(fragmentPatterns.length >= 3, fragmentPatterns.join(', '));
});

for (const ref of fragmentPatterns) {
  test(`${ref} declares fragment: true and keeps no second copy of its markup in pattern.js`, () => {
    const src = readFileSync(join(PATTERNS, ref, 'pattern.js'), 'utf8');
    assert.ok(existsSync(join(PATTERNS, ref, 'pattern.html')), 'pattern.html exists');
    assert.doesNotMatch(src, /\bMARKUP\b/, 'no MARKUP constant');
    assert.doesNotMatch(src, /^\s*markup:/m, 'no markup module field');
  });
}
