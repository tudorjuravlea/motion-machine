// The demo pieces state numbers about the machine: how many patterns, in how many groups, how many
// rules the gate has. They are counted from the tree here, so a pattern or a rule added later makes
// this test name the story that has to be regenerated (demo-film/capture/build-story.mjs writes the
// film and the deck; the three swap stories are written by hand).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { list } from '../../scripts/pattern-lint.mjs';

const patterns = list();
const groups = new Set(patterns.map((p) => p.split('/')[0])).size;
const rules = readdirSync(join(ROOT, 'scripts/check')).filter((f) => /^[GW]-.+\.mjs$/.test(f)).length;
const PIECES = ['demo-film', 'demo-deck', 'demo-swap-editorial', 'demo-swap-kinetic', 'demo-swap-calm-product'];

const strings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
  return out;
};

for (const piece of PIECES) {
  test(`${piece} states the pattern and rule counts of the tree`, () => {
    const story = JSON.parse(readFileSync(join(ROOT, 'pieces', piece, 'story.json'), 'utf8'));
    const text = strings(story).join('\n');
    for (const [, n] of text.matchAll(/\b(\d+) patterns\b/g)) assert.equal(Number(n), patterns.length, `"${n} patterns" in ${piece}; the tree has ${patterns.length}`);
    for (const [, n] of text.matchAll(/\b(\d+) rules\b/g)) assert.equal(Number(n), rules, `"${n} rules" in ${piece}; the gate has ${rules}`);
    for (const [, n] of text.matchAll(/\bin (\d+) groups\b/g)) assert.equal(Number(n), groups, `"in ${n} groups" in ${piece}; the library has ${groups}`);
  });
}

test('the swap stories count the patterns in their figure', () => {
  for (const piece of PIECES.filter((p) => p.startsWith('demo-swap-'))) {
    const story = JSON.parse(readFileSync(join(ROOT, 'pieces', piece, 'story.json'), 'utf8'));
    const figure = story.scenes.flatMap((s) => s.beats).find((b) => b.fx === 'style:figure');
    assert.equal(figure.value, patterns.length, piece);
    assert.equal(figure.text, String(patterns.length), piece);
  }
});
