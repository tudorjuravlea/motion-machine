// SPEC §8 lists every verb with its flags; `USAGE` in scripts/lib/cli.mjs is what `mm <verb> --help`
// prints. They describe the same command line, so their flags, and whether the piece is required,
// must agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USAGE } from '../../scripts/lib/cli.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const spec = readFileSync(join(ROOT, 'SPEC.md'), 'utf8');
const section = spec.slice(spec.indexOf('\n## 8. CLI'), spec.indexOf('\n## 9.'));

/** The verb words of a command line: the leading words up to the first flag or argument. */
function verbOf(line) {
  const words = [];
  for (const w of line.split(/\s+/)) {
    if (/^[-<\[(]/.test(w)) break;
    words.push(w);
  }
  return words.join(' ');
}

/** Every command line in the first cell of a §8 table row, as { key: 'pattern lint', line: '…' }. */
const commands = [];
for (const row of section.split('\n').filter((l) => l.startsWith('| `'))) {
  const cell = row.slice(1, row.indexOf(' | ', 2)).trim();
  for (const m of cell.matchAll(/`((?:[^`\\]|\\.)+)`/g)) {
    const line = m[1].replace(/\\\|/g, '|');
    commands.push({ key: verbOf(line), line });
  }
}
const flags = (line) => [...new Set(line.match(/--[a-z][a-z-]*/g) ?? [])].sort();
const pieceArg = (line) => (/(?:^|\s)<piece>/.test(line) ? 'required' : /\[piece\]/.test(line) ? 'optional' : 'none');

test('SPEC §8 lists the commands', () => {
  assert.ok(commands.length >= 15, `found ${commands.length}`);
});

test('every command in SPEC §8 has the same flags and the same piece argument as its usage line', () => {
  const problems = [];
  for (const { key, line } of commands) {
    const known = USAGE[key];
    if (!known) {
      if (flags(line).length) problems.push(`SPEC §8 has "${key}", which USAGE does not know`);
      continue;
    }
    const usage = known[0];
    // A row that lists verbs without flags (the capture modes) is described in full in §13.
    if (flags(line).length && flags(usage).join() !== flags(line).join()) problems.push(`${key}: SPEC has ${flags(line).join(' ')}; USAGE has ${flags(usage).join(' ')}`);
    if (pieceArg(usage) !== pieceArg(line)) problems.push(`${key}: SPEC says the piece is ${pieceArg(line)}; USAGE says ${pieceArg(usage)}`);
  }
  assert.deepEqual(problems, []);
});

test('every verb in USAGE that takes flags is described in SPEC §8', () => {
  const listed = new Set(commands.map((c) => c.key));
  const missing = Object.keys(USAGE).filter((k) => flags(USAGE[k][0]).length && !listed.has(k));
  assert.deepEqual(missing, []);
});
