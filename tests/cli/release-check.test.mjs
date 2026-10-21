// `mm release-check` (SPEC §8, AXIOM 3): one fixture per sweep under fixtures/release/ makes it
// fail with that sweep named; the clean fixture passes once its golden piece has a passing check.json;
// the private list is read when present; matching is whole-word; the repository's own run reports every sweep;
// R-DUP refuses tracked Finder and iCloud duplicates; R-EMAIL refuses any address outside the example and no-reply domains.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SWEEPS, duplicateName, listFiles, releaseCheck, wordRegex } from '../../scripts/release-check.mjs';
import { ROOT, mm } from './cli-helpers.mjs';

const FIX = join(ROOT, 'fixtures', 'release');
const tmp = mkdtempSync(join(tmpdir(), 'mm-release-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const run = (fixture, only) => mm(['release-check', '--root', rootOf(fixture), ...(only ? ['--only', only] : [])], { timeout: 60_000 });
// R-GOLDEN fails only on a report that failed: its fixture is golden-unchecked with a failing
// out/check.json written here (out/ is never tracked)
const goldenFailed = join(tmp, 'golden-failed');
cpSync(join(FIX, 'golden-unchecked'), goldenFailed, { recursive: true });
mkdirSync(join(goldenFailed, 'pieces/golden-x/out'), { recursive: true });
writeFileSync(join(goldenFailed, 'pieces/golden-x/out/check.json'), JSON.stringify({ rules: [{ id: 'G-EDGE', status: 'FAIL', evidence: {} }] }));
const rootOf = (fixture) => (fixture === 'golden-failed' ? goldenFailed : join(FIX, fixture));

const CASES = [
  ['brand-word', 'R-BRAND', /notes\.md:1\s+"Zorblax"/],
  ['secret', 'R-SECRET', /AWS access key[\s\S]*\.env\s+a file that holds credentials|\.env\s+a file that holds credentials[\s\S]*AWS access key/],
  ['abs-path', 'R-PATH', new RegExp(`notes\\.md:1\\s+macOS home path: /${'Us' + 'ers'}/jane`)],
  ['email', 'R-EMAIL', /notes\.md:1\s+e-mail address: jane\.roe.acme-widgets\.io/],
  ['cdn-url', 'R-URL', /runtime\/kit\/net\.js:1\s+https:\/\/cdn\.example\.org/],
  ['no-licence', 'R-LICENSE', /is not the Apache-2\.0 text/],
  ['font-no-licence', 'R-FONT-LICENSE', /styles\/fonts\/acme\s+font files with no LICENSE/],
  ['bad-pattern', 'R-PATTERNS', /patterns\/entrances\/broken\s+W-PATTERN-CARD/],
  ['golden-failed', 'R-GOLDEN', /pieces\/golden-x\/out\/check\.json\s+last check failed: G-EDGE/],
  ['strategy-file', 'R-STRATEGY', /DECISIONS\.md\s+planning and decision records are not kept in this repository[\s\S]*docs\/evals\/E1\.md/],
  ['history', 'R-HISTORY', new RegExp(`decision-id\\.md:1\\s+decision id: ${'DE' + 'C'}-999`)],
  ['finder-dup', 'R-DUP', /notes copy\.md\s+"notes copy\.md" is named like a Finder or iCloud duplicate/],
];

test('every sweep has a fixture that makes it fail, with the sweep named and the file pointed at', () => {
  assert.deepEqual(CASES.map((c) => c[1]).sort(), [...SWEEPS].sort());
  for (const [fixture, sweep, finding] of CASES) {
    const r = run(fixture, sweep);
    assert.equal(r.status, 1, `${fixture}: ${r.out}`);
    assert.match(r.stdout, new RegExp(`^FAIL  ${sweep}`, 'm'), `${fixture} names ${sweep}`);
    assert.match(r.stdout, finding, `${fixture}: ${r.stdout}`);
    assert.match(r.stdout, new RegExp(`release-check: 1 sweep failed: ${sweep}`));
  }
});

test('R-PATTERNS holds the library to literal values: a hex colour in a pattern fails, where a piece only warns', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mm-literal-'));
  try {
    cpSync(join(ROOT, 'fixtures/negatives/patterns/W-LITERAL'), join(root, 'patterns'), { recursive: true });
    cpSync(join(ROOT, 'PROVENANCE.md'), join(root, 'PROVENANCE.md'));
    const r = await releaseCheck({ root, only: ['R-PATTERNS'] });
    assert.equal(r.code, 1);
    const text = r.sweeps[0].findings.map((f) => f.text).join('\n');
    assert.match(text, /W-LITERAL: hex colour/);
    assert.doesNotMatch(text, /W-PATTERN-CARD|W-PROVENANCE|G-TIME/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('near misses pass: a short word inside longer words, the SVG namespace, a licensed font folder beside an unlicensed one', async () => {
  const brand = await releaseCheck({ root: join(FIX, 'brand-word'), only: ['R-BRAND'] });
  assert.deepEqual(brand.sweeps[0].findings.map((f) => f.file), ['notes.md'], 'near-miss.md ("zetabyte zetas") is not a hit for "zeta"');
  const url = await releaseCheck({ root: join(FIX, 'cdn-url'), only: ['R-URL'] });
  assert.deepEqual(url.sweeps[0].findings.map((f) => f.file), ['runtime/kit/net.js']);
  const fonts = await releaseCheck({ root: join(FIX, 'font-no-licence'), only: ['R-FONT-LICENSE'] });
  assert.deepEqual(fonts.sweeps[0].findings.map((f) => f.file), ['styles/fonts/acme']);
  const dup = await releaseCheck({ root: join(FIX, 'finder-dup'), only: ['R-DUP'] });
  assert.deepEqual(dup.sweeps[0].findings.map((f) => f.file), ['notes copy.md', 'patterns/entrances/rise 2/pattern.js', 'story 2.json'], 'chapter-2.md and notes-v2.md are not duplicates');
});

test('R-DUP names: Finder "copy", "copy N" and "keep both" numbers, on a file or a folder; hyphens, dots and suffixed numbers pass', () => {
  for (const p of ['a 2.png', 'a copy.md', 'a copy 3.md', 'README 2', 'patterns/G-TIME 2/pattern.js', 'deck Copy.json']) assert.ok(duplicateName(p), p);
  for (const p of ['a-2.md', 'v 2b.md', 'x.copy.md', 'notes-v2.md', 'patterns/G-TIME/pattern.js', 'copy.md']) assert.equal(duplicateName(p), null, p);
});

test('clean passes every sweep once its golden piece has a passing check.json; a FAIL row in it fails R-GOLDEN only', () => {
  const root = join(tmp, 'clean');
  cpSync(join(FIX, 'clean'), root, { recursive: true });
  mkdirSync(join(root, 'pieces/golden-ok/out'), { recursive: true });
  writeFileSync(join(root, 'pieces/golden-ok/out/check.json'), JSON.stringify({ rules: [{ id: 'G-TEST', status: 'PASS', evidence: {} }] }));
  let r = mm(['release-check', '--root', root], { timeout: 60_000 });
  assert.equal(r.status, 0, r.out);
  for (const id of SWEEPS) assert.match(r.stdout, new RegExp(`^PASS  ${id}`, 'm'), id);
  assert.match(r.stdout, /every sweep passed/);

  writeFileSync(join(root, 'pieces/golden-ok/out/check.json'), JSON.stringify({ rules: [{ id: 'G-REST', status: 'FAIL', evidence: {} }] }));
  r = mm(['release-check', '--root', root], { timeout: 60_000 });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /1 sweep failed: R-GOLDEN/);
  assert.match(r.stdout, /last check failed: G-REST/);
});

test('the private list is read when present (and reported absent when not); both lists match whole words, case-insensitively', async () => {
  const root = join(tmp, 'private');
  cpSync(join(FIX, 'clean'), root, { recursive: true });
  writeFileSync(join(root, 'story.md'), 'Made with the Quuxbar toolkit, QUUXBAR in capitals, and Quuxbarista as a different word.\n');
  let r = await releaseCheck({ root, only: ['R-BRAND'] });
  assert.equal(r.code, 0);
  assert.match(r.sweeps[0].notes.join(), /docs\/private\/brand-words\.txt is absent/);
  mkdirSync(join(root, 'docs/private'), { recursive: true });
  writeFileSync(join(root, 'docs/private/brand-words.txt'), '# private\nQuuxbar\n');
  r = await releaseCheck({ root, only: ['R-BRAND'] });
  assert.equal(r.code, 1);
  assert.deepEqual(r.sweeps[0].findings.map((f) => f.text), ['"Quuxbar"', '"QUUXBAR"'], 'whole word, either case; Quuxbarista is another word');
  assert.match(r.sweeps[0].notes.join(), /private list read/);
});

test('word list syntax: plain line is a whole word; regex syntax, `re:` and /slashes/ are patterns; @runtime lines apply under runtime paths only', async () => {
  assert.ok(wordRegex('Acme-Machine').test('see acme-machine here'));
  assert.ok(!wordRegex('zeta').test('zetabyte zetas'));
  assert.ok(wordRegex('\\bZETA\\b').test('the ZETA deck') && !wordRegex('\\bZETA\\b').test('zetabyte'));
  assert.ok(wordRegex('re:AKIA[0-9A-Z]{4}').test('akia1234') && wordRegex('/token_\\d+/').test('TOKEN_42'));
  const root = join(tmp, 'runtime-lines');
  mkdirSync(join(root, 'runtime'), { recursive: true });
  mkdirSync(join(root, 'contracts'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'contracts/brand-words.txt'), '@runtime https?://\n');
  writeFileSync(join(root, 'runtime/a.js'), "fetch('http://example.org/x');\nconst ns = 'http://www.w3.org/2000/svg';\n");
  writeFileSync(join(root, 'docs/a.md'), 'see http://example.org/docs\n');
  const r = await releaseCheck({ root, only: ['R-BRAND'] });
  assert.deepEqual(r.sweeps[0].findings.map((f) => `${f.file}:${f.line}`), ['runtime/a.js:1']);
});

test('binary files are skipped, and fixtures/release is never swept from a repository root', () => {
  const root = join(tmp, 'binary');
  mkdirSync(join(root, 'contracts'), { recursive: true });
  writeFileSync(join(root, 'contracts/brand-words.txt'), 'Zorblax\n');
  writeFileSync(join(root, 'font.woff2'), Buffer.concat([Buffer.from('Zorblax'), Buffer.from([0, 1, 2])]));
  writeFileSync(join(root, 'pic.png'), 'Zorblax');
  mkdirSync(join(root, 'fixtures/release/x'), { recursive: true });
  writeFileSync(join(root, 'fixtures/release/x/n.md'), 'Zorblax');
  return releaseCheck({ root, only: ['R-BRAND'] }).then((r) => {
    assert.equal(r.code, 0, JSON.stringify(r.sweeps[0].findings));
    assert.ok(!listFiles(root).some((f) => f.startsWith('fixtures/release/')));
  });
});

test('usage: an unknown sweep or a missing root exits 2; --json is parseable; the repository run reports every sweep', () => {
  let r = mm(['release-check', '--only', 'R-NOPE']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown sweep "R-NOPE"/);
  r = mm(['release-check', '--root', join(tmp, 'no-such-folder')]);
  assert.equal(r.status, 2);
  r = mm(['release-check', '--json', '--root', join(FIX, 'abs-path'), '--only', 'R-PATH']);
  assert.equal(r.status, 1);
  assert.ok(JSON.parse(r.stdout).sweeps[0].findings.some((f) => f.file === 'notes.md'));
  // The repository itself: every sweep runs and the report names each one. The golden check files are
  // local, so the code is 0 or 1 and R-GOLDEN is SKIP in a fresh clone that has none.
  r = mm(['release-check'], { timeout: 120_000 });
  assert.ok([0, 1].includes(r.status), r.out);
  for (const id of SWEEPS) assert.match(r.stdout, new RegExp(`^(PASS|FAIL${id === 'R-GOLDEN' ? '|SKIP' : ''})  ${id}`, 'm'), id);
});

test('R-GOLDEN says nothing about a golden piece that has no report: a fresh copy (out/ is not in git) skips, it does not fail', () => {
  const r = run('golden-unchecked', 'R-GOLDEN');
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /^SKIP  R-GOLDEN/m);
  assert.doesNotMatch(r.stdout, /missing|check\.json/, 'no finding for a report that is not there');
  assert.match(r.stdout, /every sweep passed/);
});

test('what R-STRATEGY tells a user says nothing of vaults or maintainers', () => {
  const r = run('strategy-file', 'R-STRATEGY');
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.out, /vault|maintainer/i);
});

const HOME = '~' + '/';   // built, so this file holds no home-relative path itself
test('R-PATH also catches home-relative personal folders and lets JSON-pointer escapes, regex literals and the shared tool cache through', async () => {
  const root = join(tmp, 'home-rel');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'notes.md'), `Skills came from (\`${HOME}Downloads\`) and ${HOME}.claude/skills.\n`);
  writeFileSync(join(root, 'ok.js'), "const esc = (s) => s.replace(/~/g, '~0').replace(/\\//g, '~1'); const p = path.replace(/~/.test(x));\n// ~1 and ~0 are pointer escapes; ~ alone is fine\n");
  writeFileSync(join(root, 'ci.yml'), `path: ${HOME}.cache/ms-playwright\n`);
  const r = await releaseCheck({ root, only: ['R-PATH'] });
  assert.deepEqual(r.sweeps[0].findings.map((f) => `${f.file}:${f.line} ${f.text}`), [`notes.md:1 home-relative path: ${HOME}Downloads`, `notes.md:1 home-relative path: ${HOME}.claude`]);
});

test('a word-list line that is not a valid pattern is a usage error naming the file and line, not a stack', () => {
  const root = join(tmp, 'bad-list');
  mkdirSync(join(root, 'contracts'), { recursive: true });
  writeFileSync(join(root, 'contracts/brand-words.txt'), 'fine\n(unclosed[\n');
  const r = mm(['release-check', '--root', root, '--only', 'R-BRAND']);
  assert.equal(r.status, 2, r.out);
  assert.match(r.stderr, /contracts\/brand-words\.txt:2: not a valid pattern/);
  assert.doesNotMatch(r.stderr, /^\s+at /m);
});

// ---- R-HISTORY: public files state rules, not how they were decided -----------------------------
// Sample markers are assembled from pieces so that this file holds none itself.
const DATE = ['2031', '01', '02'].join('-');
const MARKERS = ['DEC', '-999 Go', 'al 9b super', 'seded les', 'son 9'].join('');
// The negative corpus is fixtures/release/history/ (one file per kind of marker); the near misses are
// written here, from pieces, so this file is not itself a finding.
const HISTORY_EXPECT = {
  'decision-id.md': [[1, 'decision id'], [2, 'decision id']],
  'finding-id.md': [[1, 'finding id'], [2, 'finding id'], [3, 'finding id'], [3, 'finding id'], [4, 'finding id'], [5, 'finding id']],
  'milestone.md': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => [n, 'milestone or plan id']),
  'dated.md': [[1, 'dated note']],
  'version-narrative.md': [[1, 'version narrative'], [2, 'version narrative']],
  'round.md': [1, 2, 3, 4, 5].map((n) => [n, 'round narrative']),
  'private-pointer.md': [[1, 'private-record pointer'], [2, 'private-record pointer'], [3, 'private-record pointer'], [3, 'private-record pointer']],
  'philosophy.md': [[1, 'philosophy framing']],
};
test('R-HISTORY: one finding per marker, with the file, the line and the kind named', async () => {
  const r = await releaseCheck({ root: join(FIX, 'history'), only: ['R-HISTORY'] });
  const got = {};
  for (const f of r.sweeps[0].findings) (got[f.file] ??= []).push([f.line, f.text.split(':')[0]]);
  assert.deepEqual(got, HISTORY_EXPECT);
  assert.equal(r.code, 1);
});

test('R-HISTORY: file and folder names that carry a marker are findings too', async () => {
  const r = await releaseCheck({ root: join(FIX, 'history-names'), only: ['R-HISTORY'] });
  assert.deepEqual(r.sweeps[0].findings.map((f) => `${f.file} ${f.text.split(':')[0]}`).sort(), [`${'DE' + 'C'}-999-notes.md decision id`, `sub/${'E' + '9'}-99.md finding id`]);
  assert.ok(r.sweeps[0].findings.every((f) => f.line === 0 && f.inPath));
});

test('R-HISTORY: a scratch-folder label in a folder name is a finding (the fixture cannot be tracked: .tmp-* is git-ignored)', async () => {
  const root = join(tmp, 'history-scratch-name');
  mkdirSync(join(root, '.tmp-' + 'm9-render'), { recursive: true });
  writeFileSync(join(root, '.tmp-' + 'm9-render', 'a.md'), 'fine\n');
  const r = await releaseCheck({ root, only: ['R-HISTORY'] });
  assert.deepEqual(r.sweeps[0].findings.map((f) => `${f.file} ${f.line}`), ['.tmp-' + 'm9-render/a.md 0']);
});

test('R-HISTORY: an svg is exempt only inside its path data; a comment or text in it is read', async () => {
  const root = join(tmp, 'history-svg');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'a.svg'), '<svg><path d="M1' + '-10 L5 5"/>\n<!-- ' + 'E9' + '-99 fixed -->\n<text>' + 'E9' + '-98</text></svg>\n');
  const r = await releaseCheck({ root, only: ['R-HISTORY'] });
  assert.deepEqual(r.sweeps[0].findings.map((f) => f.line), [2, 3]);
});

test('R-HISTORY: product vocabulary and near misses pass; only runtime/vendor/ is exempt', async () => {
  const root = join(tmp, 'history-clean');
  const w = (f, text) => { mkdirSync(join(root, f, '..'), { recursive: true }); writeFileSync(join(root, f), text); };
  w('README.md', ['## Round 1: treatment', 'Math.round(x) and the director\'s note', '| D1 | open |', 'The ledger lives in docs/private/brand-words.txt.', 'A value of 1E-05 is small.', ''].join('\n'));
  w('.gitignore', 'docs/private/\n');
  w('icon.html', '<svg><path d="M1' + '-10 L5 5"/></svg>\n');
  w('pieces/x/story.json', JSON.stringify({ facts: [{ source: `internal test, ${DATE}` }] }) + '\n');
  w('pieces/x/capture/site.capture-notes.md', `Source: a page. Captured ${DATE}.\n`);
  w('docs/links.md', 'Our decisions guide and the lessons-learned notes are not private files.\n');
  w('docs/pin.md', `Pinned at commit \`069432c\` on ${DATE}.\n`);
  w('runtime/vendor/three.js', `// ${MARKERS}\n`);
  const r = await releaseCheck({ root, only: ['R-HISTORY'] });
  assert.deepEqual(r.sweeps[0].findings, []);
  w('runtime/kit/kit.js', '// ' + 'DEC' + '-044\n');
  const r2 = await releaseCheck({ root, only: ['R-HISTORY'] });
  assert.deepEqual(r2.sweeps[0].findings.map((f) => f.file), ['runtime/kit/kit.js']);
});

test('R-HISTORY: NOTICE may carry an upstream date, but not an id', async () => {
  const root = join(tmp, 'history-notice');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'NOTICE'), `Portions (c) ${DATE} Example, formerly ${'corrected' + ' from'} an older text.\n`);
  assert.deepEqual((await releaseCheck({ root, only: ['R-HISTORY'] })).sweeps[0].findings, []);
  writeFileSync(join(root, 'NOTICE'), 'Portions ' + 'DEC' + '-109 Example.\n');
  assert.equal((await releaseCheck({ root, only: ['R-HISTORY'] })).sweeps[0].findings.length, 1);
});

test('R-HISTORY holds on this repository (the regression lock)', async () => {
  const r = await releaseCheck({ only: ['R-HISTORY'] });
  assert.deepEqual(r.sweeps[0].findings.map((f) => `${f.file}:${f.line} ${f.text}`).slice(0, 20), []);
});

test('R-STRATEGY lets through a public doc whose name only mentions decisions', async () => {
  const r = await releaseCheck({ root: join(FIX, 'strategy-file'), only: ['R-STRATEGY'] });
  assert.deepEqual(r.sweeps[0].findings.map((f) => f.file), ['DECISIONS' + '.md', 'docs/evals/E1.md']);
});

// the expected texts are built from pieces so that this file holds no path or address itself
const U = 'Us' + 'ers';
const AT = '@';
test('R-PATH catches the dashed project path, git-bash and WSL drive paths, JSON-escaped slashes and a tilde with an escaped slash; near misses pass', async () => {
  const r = await releaseCheck({ root: join(FIX, 'abs-path'), only: ['R-PATH'] });
  const got = r.sweeps[0].findings.filter((f) => f.file === 'forms.md').map((f) => `${f.line} ${f.text}`).sort();
  assert.deepEqual(got, [
    `1 dashed project path: -${U}-jane-`,
    `2 drive path: /c/${U}/jane`,
    `2 drive path: /mnt/c/${U}/jane`,
    `3 JSON-escaped home path: \\/${U}\\/jane`,
    '3 JSON-escaped home path: \\/home\\/jane',
    `4 home-relative path: ~\\/Downloads`,
    `4 home-relative path: ~\\/Desktop`,
  ].sort());
});

test('R-PATH also reads file and folder names', async () => {
  const root = join(tmp, 'path-names');
  const folder = `-${U}-jane-Documents-x`;
  mkdirSync(join(root, folder), { recursive: true });
  writeFileSync(join(root, folder, 'a.md'), 'fine\n');
  const r = await releaseCheck({ root, only: ['R-PATH'] });
  assert.deepEqual(r.sweeps[0].findings.map((f) => `${f.file} ${f.line}`), [`${folder}/a.md 0`]);
});

test('R-EMAIL: any address is a finding except example domains, no-reply addresses and licence texts', async () => {
  const r = await releaseCheck({ root: join(FIX, 'email'), only: ['R-EMAIL'] });
  assert.deepEqual(r.sweeps[0].findings.map((f) => `${f.file}:${f.line} ${f.text}`), [
    `notes.md:1 e-mail address: jane.roe${AT}acme-widgets.io`,
    `notes.md:2 e-mail address: JANE${AT}Acme-Widgets.IO`,
  ]);
  assert.equal(r.code, 1);
});

test('R-EMAIL holds on this repository', async () => {
  const r = await releaseCheck({ only: ['R-EMAIL'] });
  assert.deepEqual(r.sweeps[0].findings.map((f) => `${f.file}:${f.line} ${f.text}`), []);
});

test('R-HISTORY reads a UTF-16 text file too', async () => {
  const root = join(tmp, 'utf16');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'n.md'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('See DEC' + '-999 here.\n', 'utf16le')]));
  const r = await releaseCheck({ root, only: ['R-HISTORY'] });
  assert.deepEqual(r.sweeps[0].findings.map((f) => f.text), ['decision id: ' + 'DEC' + '-999']);
});
