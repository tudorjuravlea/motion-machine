// `compose` writes a valid composed style with `from` recorded, paper x calm is the
// shipped editorial preset, paper x kinetic differs from it only in the motion half, and an
// invalid half is refused with nothing written.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validators, ROOT } from '../../scripts/lib/validate.mjs';

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'mm-compose-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const run = (...args) => spawnSync('node', [join(ROOT, 'scripts', 'compose.mjs'), ...args], { encoding: 'utf8' });
const { style } = validators();

test('paper x kinetic validates, records from, and differs from editorial in the motion half only', () => {
  const out = join(tmp, 'paper-kinetic.json');
  const r = run('--brand', 'paper', '--motion', 'kinetic', '--out', out);
  assert.equal(r.status, 0, r.stderr);
  const got = JSON.parse(readFileSync(out, 'utf8'));
  assert.ok(style(got), JSON.stringify(style.errors));
  assert.deepEqual(got.from, { brand: 'styles/brands/paper.json', motion: 'styles/motion/kinetic.json' });
  const editorial = read('styles/presets/editorial.json');
  const differing = Object.keys(got).filter((k) => !['name', 'from'].includes(k) && JSON.stringify(got[k]) !== JSON.stringify(editorial[k])).sort();
  assert.deepEqual(differing, ['entrances', 'motion', 'pacing', 'sound', 'transitions']);
});

test('paper x calm named editorial is the shipped editorial preset', () => {
  const out = join(tmp, 'editorial.json');
  assert.equal(run('--brand', 'paper', '--motion', 'calm', '--name', 'editorial', '--out', out).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), read('styles/presets/editorial.json'));
});

test('halves can be given as repo paths, and from stays relative', () => {
  const out = join(tmp, 'by-path.json');
  assert.equal(run('--brand', 'styles/brands/linen.json', '--motion', join(ROOT, 'styles/motion/premium.json'), '--out', out).status, 0);
  const got = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(got.from, { brand: 'styles/brands/linen.json', motion: 'styles/motion/premium.json' });
  assert.equal(got.name, 'linen-premium');
});

test('an invalid half is refused (exit 1) and nothing is written', () => {
  const bad = read('styles/brands/paper.json');
  bad.color.ink = 'not-a-colour';
  const brand = join(tmp, 'bad-brand.json'); writeFileSync(brand, JSON.stringify(bad));
  const out = join(tmp, 'never.json');
  const r = run('--brand', brand, '--motion', 'calm', '--out', out);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /invalid/);
  assert.ok(!existsSync(out));
});

test('a missing half or missing flags is a usage error (exit 2)', () => {
  assert.equal(run('--brand', 'nope', '--motion', 'calm', '--out', join(tmp, 'x.json')).status, 2);
  assert.equal(run('--brand', 'paper').status, 2);
});

test('the composed file names no absolute path', () => {
  const out = join(tmp, 'abs.json');
  execFileSync('node', [join(ROOT, 'scripts', 'compose.mjs'), '--brand', 'signal', '--motion', 'kinetic', '--out', out]);
  assert.doesNotMatch(readFileSync(out, 'utf8'), /"\/|[A-Za-z]:\\|\/Users\//);
});

test('a brand half whose family name could end a style rule is refused, naming the family, and nothing is written', () => {
  const half = read('styles/brands/paper.json');
  half.name = 'hostile';
  half.type.display.family = 'x"</style><script>1</script>';
  const p = join(tmp, 'hostile.json'); writeFileSync(p, JSON.stringify(half));
  const out = join(tmp, 'hostile-style.json');
  const r = run('--brand', p, '--motion', 'calm', '--out', out);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /type\.display/);
  assert.ok(r.stderr.includes('x"</style><script>1</script>') || /unsafe|not allowed/.test(r.stderr), r.stderr);
  assert.equal(existsSync(out), false);
});
