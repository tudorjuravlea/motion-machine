// G-PATTERN-CARD · G-PROVENANCE (SPEC §5, contracts/pattern-card.md): the lint lists the complete
// positive and fails each negative folder with exactly its id. Independent of patterns/ content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from '../scripts/lib/browser.mjs';
import { list, lintRoot, listComplete, parseCard, provenanceSources, resolveTarget, SECTIONS } from '../scripts/pattern-lint.mjs';

const LP = join(ROOT, 'fixtures/negatives/patterns');

test('the positive pattern is complete and listed', () => {
  const res = lintRoot(join(LP, 'positive'));
  assert.deepEqual(res.complete, ['entrances/snap-in']);
  assert.ok(res.patterns[0].rules.every((r) => r.status === 'PASS'));
});

const CASES = {
  'G-PATTERN-CARD/missing-section': ['G-PATTERN-CARD', /missing "Known limits"/],
  'G-PATTERN-CARD/empty-section': ['G-PATTERN-CARD', /"Purpose" is empty/],
  'G-PATTERN-CARD/out-of-order': ['G-PATTERN-CARD', /out of order/],
  'G-PATTERN-CARD/missing-file': ['G-PATTERN-CARD', /missing pattern\.js/],
  'G-PATTERN-CARD/demo-unused': ['G-PATTERN-CARD', /never uses entrances\/snap-in/],
  'G-PROVENANCE/unknown-source': ['G-PROVENANCE', /"Acme Motion Kit" has no row in PROVENANCE\.md/],
  'G-PROVENANCE/pattern-credit': ['G-PROVENANCE', /"entrances\/words" has no row/],   // a credits-table row is not a source row
  'G-PROVENANCE/substring': ['G-PROVENANCE', /"hyperframes" has no row/],             // a substring of a row is not the row
  'G-LITERAL': ['G-LITERAL', /hex colour/],
  'G-TIME': ['G-TIME', /Math\.random/],
};

for (const [dir, [id, why]] of Object.entries(CASES)) {
  test(`patterns/${dir} fails ${id} only and is not listed`, () => {
    const res = lintRoot(join(LP, dir));
    assert.equal(res.patterns.length, 1);
    const fails = res.patterns[0].rules.filter((r) => r.status === 'FAIL');
    assert.deepEqual(fails.map((r) => r.id), [id]);
    assert.match(fails[0].evidence.reason, why);
    assert.deepEqual(listComplete(join(LP, dir)), []);
  });
}

test('second positive set: every pattern in the library (patterns/) is complete', () => {
  const res = lintRoot(join(ROOT, 'patterns'));
  const incomplete = res.patterns.filter((p) => !p.complete).map((p) => `${p.ref}: ${p.rules.filter((r) => r.status === 'FAIL').map((r) => `${r.id} ${r.evidence.reason}`).join('; ')}`);
  assert.ok(res.patterns.length > 0);
  assert.deepEqual(incomplete, []);
});

test('the card parser reads the seven sections of contracts/pattern-card.md in order', () => {
  const md = `# entrances/x\n\n${SECTIONS.map((s) => `## ${s}\ntext\n`).join('\n')}`;
  assert.deepEqual(parseCard(md).sections.map((s) => s.title), SECTIONS);
  assert.equal(parseCard(md).title, 'entrances/x');
});

test('provenance rows: only the source tables, each name of a row, parenthetical notes removed', () => {
  const rows = provenanceSources();
  for (const n of ['heygen-com/hyperframes', 'showcase', 'manimcommunity/manim', 'motion canvas', 'emilkowalski/skills']) assert.ok(rows.includes(n), n);
  assert.ok(!rows.some((r) => r.startsWith('entrances/') || r === 'pattern'), 'the pattern-level credits table is not a source table');
});

test('lint <name>: group/name or a unique bare name is one pattern; an ambiguous or unknown name is a usage error', () => {
  assert.deepEqual(resolveTarget('entrances/rise'), { pattern: join(ROOT, 'patterns/entrances/rise') });
  assert.deepEqual(resolveTarget('rise'), { pattern: join(ROOT, 'patterns/entrances/rise') });
  assert.match(resolveTarget('split').error, /ambiguous/);
  assert.match(resolveTarget('no-such-pattern').error, /no pattern named/);
  assert.deepEqual(resolveTarget(join(LP, 'positive')), { root: join(LP, 'positive') });
  assert.deepEqual(resolveTarget(join(LP, 'positive/entrances/snap-in')), { pattern: join(LP, 'positive/entrances/snap-in') });
  const cli = (...a) => spawnSync(process.execPath, [join(ROOT, 'scripts/pattern-lint.mjs'), ...a], { cwd: ROOT, encoding: 'utf8' });
  for (const name of ['rise', 'entrances/rise']) {
    const r = cli('lint', name, '--json');
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).patterns.map((p) => p.ref), ['entrances/rise']);
  }
  assert.equal(cli('lint', 'split').status, 2);
});

test('list(): the export mm pattern list calls, the lint\'s own judgement', () => {
  assert.deepEqual(list(join(LP, 'positive')), ['entrances/snap-in']);
  assert.deepEqual(list(join(LP, 'G-PATTERN-CARD/empty-section')), []);
  assert.equal(list().length, lintRoot(join(ROOT, 'patterns')).complete.length);
});

test('CLI: list prints complete patterns as JSON; lint exits 1 on a negative and 0 on the positive', () => {
  const cli = (...a) => spawnSync(process.execPath, [join(ROOT, 'scripts/pattern-lint.mjs'), ...a], { cwd: ROOT, encoding: 'utf8' });
  const list = cli('list', join(LP, 'positive'), '--json');
  assert.equal(list.status, 0);
  assert.deepEqual(JSON.parse(list.stdout).complete, ['entrances/snap-in']);
  assert.equal(cli('lint', join(LP, 'positive')).status, 0);
  assert.equal(cli('lint', join(LP, 'G-PROVENANCE/unknown-source')).status, 1);
  assert.equal(cli('lint', join(LP, 'nope')).status, 2);
});
