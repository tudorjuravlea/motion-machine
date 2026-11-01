// `mm say-lint [piece] [--text "…" | --script <file>] [--scene <id>] [--json]`: the words in a film's voice-over that a
// voice may get wrong, read before a paid voice call. Exit 0 when nothing is flagged, 1 when something is, 2 on usage.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { mm } from './cli-helpers.mjs';

const dirs = [];
const COPY = join(ROOT, 'fixtures', 'negatives', `.tmp-say-lint-${process.pid}`);
after(() => { rmSync(COPY, { recursive: true, force: true }); for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function piece(say, style = null) {
  rmSync(COPY, { recursive: true, force: true });
  cpSync(join(ROOT, 'fixtures', 'negatives', 'W-SAY'), COPY, { recursive: true });
  const f = join(COPY, 'story.json');
  const story = JSON.parse(readFileSync(f, 'utf8'));
  story.scenes.forEach((sc, i) => { sc.say = say[i] ?? 'Plain words only.'; });
  writeFileSync(f, JSON.stringify(story, null, 2));
  if (style) {
    const g = join(COPY, 'style.json');
    writeFileSync(g, JSON.stringify({ ...JSON.parse(readFileSync(g, 'utf8')), ...style }, null, 2));
  }
  return COPY;
}

test('a piece with a risky word exits 1, names the scene, the word, why and the fix', () => {
  const dir = piece(['Use the SDK.', 'Open README.md next.']);
  const r = mm(['say-lint', dir]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.stdout, /open: .*"SDK".*acronym/);
  assert.match(r.stdout, /style: .*"README\.md".*file name/);
  assert.match(r.stdout, /\[SDK\]\(how it is said\)/);
  assert.match(r.stdout, /product words are not checked/);
});

test('a marker or a lexicon entry clears it: exit 0', () => {
  const marked = mm(['say-lint', piece(['Use the [SDK](ess dee kay).'])]);
  assert.equal(marked.status, 0, marked.out);
  assert.match(marked.stdout, /nothing a voice is likely to get wrong/);
  const lexed = mm(['say-lint', piece(['Use the SDK.'], { voice: { provider: 'elevenlabs', id: 'v1', lexicon: { SDK: 'ess dee kay' } } })]);
  assert.equal(lexed.status, 0, lexed.out);
});

test('--text and --script lint a text without a piece; --json prints the findings', () => {
  const t = mm(['say-lint', '--text', 'Call getUser at example.com.']);
  assert.equal(t.status, 1);
  assert.match(t.stdout, /"getUser".*camelCase/);
  assert.match(t.stdout, /"example\.com".*web address/);
  const dir = mkdtempSync(join(tmpdir(), 'say-lint-'));
  dirs.push(dir);
  const file = join(dir, 'vo.txt');
  writeFileSync(file, 'It runs at 24fps.');
  const s = mm(['say-lint', '--script', file, '--json']);
  assert.equal(s.status, 1);
  const j = JSON.parse(s.stdout);
  assert.deepEqual(j.findings.map((f) => `${f.word}:${f.kind}`), ['24fps:unit']);
  assert.equal(mm(['say-lint', '--text', 'All clear here.']).status, 0);
});

test('--scene reads one scene; a cue naming no beat exits 1 and says which slot', () => {
  const dir = piece(['Use the SDK.', 'Watch <<ghost>>this closely.']);
  const one = mm(['say-lint', dir, '--scene', 'style']);
  assert.equal(one.status, 1, one.out);
  assert.match(one.stdout, /ghost/);
  assert.doesNotMatch(one.stdout, /SDK/);
  const none = mm(['say-lint', dir, '--scene', 'nope']);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /no scene "nope"/);
});

test('usage mistakes exit 2: nothing to read, two sources', () => {
  assert.equal(mm(['say-lint']).status, 2);
  assert.equal(mm(['say-lint', '--text', 'a', '--script', 'b']).status, 2);
  assert.match(mm(['say-lint', '--help']).stdout, /mm say-lint/);
});
