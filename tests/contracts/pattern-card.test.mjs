// contracts/pattern-card.md names every pattern group the library ships, so a pattern author sees
// which files the group needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const card = readFileSync(new URL('contracts/pattern-card.md', root), 'utf8');
const groups = readdirSync(new URL('patterns/', root)).filter((g) => statSync(new URL(`patterns/${g}`, root)).isDirectory());

for (const group of groups) {
  test(`pattern-card.md names the ${group} group`, () => {
    assert.match(card, new RegExp('`' + group + '`'));
  });
}
