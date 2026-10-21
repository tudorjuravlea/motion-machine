// `skill-new --brand paper` scaffolds a self-contained thin skill: frontmatter
// fields, loads the engine skill by relative path, pins a composed style that validates, carries
// facts and fonts, lists lifted bans, and names no absolute path anywhere.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validators, ROOT } from '../../scripts/lib/validate.mjs';
import { parseYaml } from '../../scripts/export-designmd.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'mm-skill-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const run = (...args) => spawnSync('node', [join(ROOT, 'scripts', 'skill-new.mjs'), ...args], { encoding: 'utf8' });
const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const { style: validateStyle } = validators();

const dir = join(tmp, 'paper-motion');
const r = run('--brand', 'paper', '--out', dir);

test('skill new --brand paper succeeds and writes the expected folder', () => {
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['SKILL.md', 'facts.md', 'style/brand.json', 'style/motion.json', 'style/style.json', 'fonts/fraunces/LICENSE.txt']) assert.ok(existsSync(join(dir, f)), f);
});

test('SKILL.md has the frontmatter fields and loads the engine skill by relative path', () => {
  const text = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  const fm = parseYaml(text.match(/^---\n([\s\S]*?)\n---/)[1]);
  assert.equal(fm.name, 'paper-motion');
  assert.match(fm.description, /Motion Machine/);
  assert.ok(fm.description.length > 40 && fm.description.length <= 1024);
  assert.ok(fm.compatibility && fm.license);
  assert.match(fm.metadata.version, /^\d+\.\d+\.\d+$/);
  assert.ok(text.includes('skill/motion-machine/SKILL.md'));
  assert.ok(text.includes('`motion-machine`'), 'the installed name is given too');
  assert.ok(text.includes('style/style.json'));
  assert.doesNotMatch(text, /\{\{/);
});

test('no file names an absolute path', () => {
  for (const f of files(dir).filter((x) => /\.(md|json)$/.test(x))) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /(^|[\s"'`(=])\/(Users|home|tmp|private|var|opt|etc|usr)\//, f);
    assert.doesNotMatch(t, /[A-Za-z]:\\\\|~\//, f);
    assert.ok(!t.includes(tmp) && !t.includes(ROOT), f);
  }
});

test('the pinned style validates, records skill-relative from, and its fonts resolve inside the skill', () => {
  const style = JSON.parse(readFileSync(join(dir, 'style/style.json'), 'utf8'));
  assert.ok(validateStyle(style), JSON.stringify(validateStyle.errors));
  assert.deepEqual(style.from, { brand: 'style/brand.json', motion: 'style/motion.json' });
  assert.equal(style.fictional, true);
  let n = 0;
  // font srcs are relative to the style file's own folder (style/), so they reach <skill>/fonts/
  for (const face of Object.values(style.type)) for (const f of face.files) { n++; assert.ok(f.src.startsWith('../fonts/'), f.src); assert.ok(existsSync(resolve(dir, 'style', f.src)), f.src); }
  assert.ok(n >= 3);
  assert.ok(!existsSync(join(dir, 'fonts/archivo')), 'only the fonts the brand uses are copied');
});

test('facts.md carries an empty table', () => {
  const t = readFileSync(join(dir, 'facts.md'), 'utf8');
  assert.match(t, /\| id \| text \| source \| checked \|/);
  assert.doesNotMatch(t, /\{\{/);
});

test('bans in force and lifted are listed', () => {
  const lift = JSON.parse(readFileSync(join(ROOT, 'styles/brands/paper.json'), 'utf8'));
  lift.name = 'paperlift'; lift.allow = ['glow-on-ui']; lift.bans = lift.bans.filter((b) => b !== 'glow-on-ui');
  const p = join(tmp, 'paperlift.json'); writeFileSync(p, JSON.stringify(lift));
  const out = join(tmp, 'paperlift-motion');
  const res = run('--brand', p, '--motion', 'kinetic', '--out', out);
  assert.equal(res.status, 0, res.stderr);
  const t = readFileSync(join(out, 'SKILL.md'), 'utf8');
  assert.match(t, /Bans this brand lifts[^\n]*: glow-on-ui\./);
  assert.match(t, /Bans in force[^\n]*fade-only/);
  assert.match(t, /name: paperlift-motion/);
  const plain = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  assert.match(plain, /Bans this brand lifts[^\n]*: none\./);
});

test('a non-empty folder is refused without --force; an unknown brand is a usage error', () => {
  assert.equal(run('--brand', 'paper', '--out', dir).status, 2);
  assert.equal(run('--brand', 'paper', '--out', dir, '--force').status, 0);
  assert.equal(run('--brand', 'nope', '--out', join(tmp, 'x')).status, 2);
});

test('--brand takes the path to a captured brand half, and a bare name that is ./<name>.json', async () => {
  const { captureBrand } = await import('../../scripts/capture-brand.mjs');
  const half = join(tmp, 'harbour-pine.json');
  await captureBrand({ from: join(ROOT, 'fixtures/capture/site/index.html'), out: half });
  const out = join(tmp, 'harbour-skill');
  const res = run('--brand', half, '--out', out);
  assert.equal(res.status, 0, res.stderr);
  assert.match(readFileSync(join(out, 'SKILL.md'), 'utf8'), /name: harbour-pine-motion/);
  const bare = join(tmp, 'bare-skill');
  const viaName = spawnSync('node', [join(ROOT, 'scripts', 'skill-new.mjs'), '--brand', 'harbour-pine', '--out', bare], { encoding: 'utf8', cwd: tmp });
  assert.equal(viaName.status, 0, viaName.stderr);
  const miss = run('--brand', 'no-such-brand', '--out', join(tmp, 'never'));
  assert.equal(miss.status, 2);
  assert.match(miss.stderr, /brand half not found: no-such-brand .*captured half is passed as its \.json path/);
});

test('mm new --style <skill>/style/style.json works: the scaffold and mm new agree on where fonts are', () => {
  const piece = join(ROOT, `.tmp-cli-skill-new-${process.pid}`, 'piece');
  try {
    const r = spawnSync('node', [join(ROOT, 'scripts', 'mm.mjs'), 'new', '--kind', 'film', '--style', join(dir, 'style', 'style.json'), '--dir', piece], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const style = JSON.parse(readFileSync(join(piece, 'style.json'), 'utf8'));
    for (const face of Object.values(style.type)) for (const f of face.files) { assert.match(f.src, /^assets\/fonts\//); assert.ok(existsSync(join(piece, f.src)), f.src); }
  } finally { rmSync(join(ROOT, `.tmp-cli-skill-new-${process.pid}`), { recursive: true, force: true }); }
});
