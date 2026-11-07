// `skill-new --brand paper` scaffolds a self-contained thin skill: frontmatter
// fields, loads the engine skill by relative path, pins a composed style that validates, carries
// facts and fonts, lists lifted bans, and names no absolute path anywhere.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

test('SKILL.md has a gate section: it says how to tune the warnings, and names what a motion half\'s gate block tunes', () => {
  const plain = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  assert.match(plain, /## The gate/);
  assert.match(plain, /`gate` block in `style\/motion\.json`/);
  assert.match(plain, /hard rules.*cannot be tuned/i);
  const half = JSON.parse(readFileSync(join(ROOT, 'styles', 'motion', 'calm.json'), 'utf8'));
  const halfPath = join(tmp, 'calm-tuned.json');
  writeFileSync(halfPath, JSON.stringify({ ...half, name: 'calm-tuned', gate: { length: { filmS: [10, 90] }, liftBans: ['frame-borders'] } }));
  const out = join(tmp, 'tuned-skill');
  const res = run('--brand', 'paper', '--motion', halfPath, '--out', out);
  assert.equal(res.status, 0, res.stderr);
  const text = readFileSync(join(out, 'SKILL.md'), 'utf8');
  assert.match(text, /This studio tunes the engine's warnings/);
  assert.ok(text.includes('"filmS":[10,90]') && text.includes('frame-borders'));
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'style/style.json'), 'utf8')).gate, { length: { filmS: [10, 90] }, liftBans: ['frame-borders'] });
  assert.doesNotMatch(text, /\{\{/);
});

test('a brand with a ground mark carries it: ground/<name> exists, the style points at ../ground/<name>, and mm new from that style finds it', () => {
  const sk = join(tmp, 'draftline-motion');
  const res = run('--brand', 'draftline', '--out', sk);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(existsSync(join(sk, 'ground', 'draftline-grid.svg')), 'the mark file is copied into the skill');
  const style = JSON.parse(readFileSync(join(sk, 'style', 'style.json'), 'utf8'));
  assert.equal(style.ground.mark.src, '../ground/draftline-grid.svg');
  assert.equal(JSON.parse(readFileSync(join(sk, 'style', 'brand.json'), 'utf8')).ground.mark.src, '../ground/draftline-grid.svg');
  assert.ok(validateStyle(style), JSON.stringify(validateStyle.errors));
  const work = join(ROOT, `.tmp-cli-skill-mark-${process.pid}`);
  try {
    const n = spawnSync('node', [join(ROOT, 'scripts', 'mm.mjs'), 'new', '--kind', 'film', '--style', join(sk, 'style', 'style.json'), '--dir', join(work, 'piece')], { encoding: 'utf8' });
    assert.equal(n.status, 0, n.stdout + n.stderr);
    const piece = JSON.parse(readFileSync(join(work, 'piece', 'style.json'), 'utf8'));
    assert.ok(existsSync(join(work, 'piece', piece.ground.mark.src)), `the piece's mark ${piece.ground.mark.src} exists`);
  } finally { rmSync(work, { recursive: true, force: true }); }
});

test('a brand with no ground mark writes no ground/ folder', () => {
  assert.equal(existsSync(join(dir, 'ground')), false);
});

test('SKILL.md lists each font family with the licence read from its licence file', () => {
  const t = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  const style = JSON.parse(readFileSync(join(dir, 'style/style.json'), 'utf8'));
  const families = [...new Set(Object.values(style.type).map((f) => f.family))];
  assert.ok(families.length >= 2);
  for (const fam of families) assert.match(t, new RegExp(`^- ${fam}: SIL OFL 1\\.1$`, 'm'), fam);
  assert.doesNotMatch(t, /\(SIL OFL, licence files/);
});

test('a family whose licence file is not a known one, or is missing, lists the warning', () => {
  const half = JSON.parse(readFileSync(join(ROOT, 'styles/brands/paper.json'), 'utf8'));
  half.name = 'oddfont';
  const base = join(tmp, 'odd'); mkdirSync(join(base, 'fonts', 'plain'), { recursive: true }); mkdirSync(join(base, 'fonts', 'bare'), { recursive: true });
  const src = join(ROOT, 'styles/fonts/manrope/manrope-latin-400-normal.woff2');
  copyFileSync(src, join(base, 'fonts/plain/plain-400.woff2')); copyFileSync(src, join(base, 'fonts/bare/bare-400.woff2'));
  writeFileSync(join(base, 'fonts/plain/LICENSE.txt'), 'All rights reserved. Not for redistribution.');
  const face = (family, d) => ({ family, weight: 400, tracking: 0, files: [{ weight: 400, src: `fonts/${d}/${d}-400.woff2`, unicodeRange: 'U+0000-00FF' }] });
  half.type = { display: face('Plain Sans', 'plain'), text: face('Bare Sans', 'bare'), mono: half.type.mono };
  const p = join(base, 'oddfont.json'); writeFileSync(p, JSON.stringify(half));
  const out = join(tmp, 'oddfont-motion');
  const res = run('--brand', p, '--out', out);
  assert.equal(res.status, 0, res.stderr);
  const t = readFileSync(join(out, 'SKILL.md'), 'utf8');
  assert.match(t, /^- Plain Sans: licence not recognised: check before sharing this skill$/m);
  assert.match(t, /^- Bare Sans: licence not recognised: check before sharing this skill$/m);
  assert.match(t, /^- IBM Plex Mono: SIL OFL 1\.1$/m);
});

test('engine.json records the engine version and commit, and SKILL.md says so', () => {
  const e = JSON.parse(readFileSync(join(dir, 'engine.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(e), ['engine', 'version', 'commit']);
  assert.equal(e.engine, 'motion-machine');
  assert.equal(e.version, pkg.version);
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  if (head.status === 0) { assert.match(e.commit, /^[0-9a-f]{40}$/); assert.equal(e.commit, head.stdout.trim()); } else assert.equal(e.commit, null);
  const t = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  assert.ok(t.includes(`made with Motion Machine ${pkg.version}`));
  if (e.commit) assert.ok(t.includes(`(${e.commit.slice(0, 7)})`));
  assert.match(t, /G-PATTERN-REF/);
  assert.doesNotMatch(t, /\{\{/);
});
