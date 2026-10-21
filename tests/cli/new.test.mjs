// `mm new`: scaffolds a piece from the skeleton, copies the style in as style.json and its font
// files into assets/fonts/ with relative srcs; `--dir` places it anywhere under the repo and
// writes the right kit import there. Everything is written under a temporary folder inside the
// repo (git-ignored `.tmp-cli-*`) and removed afterwards: nothing lands in pieces/.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { openPiece } from '../../scripts/lib/browser.mjs';
import { kitSpecifier, newPiece } from '../../scripts/new.mjs';
import { ROOT, mm, readJson } from './cli-helpers.mjs';

const work = join(ROOT, `.tmp-cli-new-${process.pid}`);
const piecesBefore = new Set(readdirSync(join(ROOT, 'pieces')));
mkdirSync(work, { recursive: true });
after(() => rmSync(work, { recursive: true, force: true }));
const kitImport = (dir) => /from\s*['"]([^'"]*runtime\/kit\/kit\.js)['"]/.exec(readFileSync(join(dir, 'piece.js'), 'utf8'))[1];

test('new film in --dir: skeleton files, style copied in, fonts copied with relative srcs, piece mounts with every font loaded', async () => {
  const dir = join(work, 'film');
  const r = mm(['new', '--kind', 'film', '--style', 'editorial', '--dir', dir]);
  assert.equal(r.status, 0, r.out);
  for (const f of ['index.html', 'piece.css', 'piece.js', 'story.json', 'style.json']) assert.ok(existsSync(join(dir, f)), f);
  assert.equal(readJson(join(dir, 'story.json')).id, 'film', 'id defaults to the folder name');
  const style = readJson(join(dir, 'style.json'));
  assert.deepEqual(style.from, readJson(join(ROOT, 'styles/presets/editorial.json')).from, 'from is kept');
  const srcs = Object.values(style.type).flatMap((f) => f.files.map((x) => x.src));
  assert.ok(srcs.length >= 6);
  for (const src of srcs) {
    assert.match(src, /^assets\/fonts\/[a-z0-9-]+\/[^/]+\.woff2$/, src);
    assert.ok(existsSync(join(dir, src)), `${src} was copied`);
  }
  assert.ok(existsSync(join(dir, 'assets/fonts/fraunces/LICENSE.txt')), 'the licence travels with the font');
  assert.ok(!readFileSync(join(dir, 'style.json'), 'utf8').includes('styles/fonts'), 'no path back into the repo');
  const opened = await openPiece(dir, {});
  try {
    const meta = await opened.mm.meta();
    assert.deepEqual(meta.warnings, []);
    assert.ok(meta.fonts.length >= 6 && meta.fonts.every((f) => f.status === 'loaded'), JSON.stringify(meta.fonts.map((f) => f.status)));
    assert.deepEqual(opened.errors, []);
  } finally { await opened.close(); }
});

test('a piece four folders deep gets a kit import that reaches the kit, and opens', async () => {
  const dir = join(work, 'a', 'b', 'c', 'deep-deck');
  const r = mm(['new', '--kind', 'deck', '--style', 'styles/presets/kinetic.json', '--dir', dir]);
  assert.equal(r.status, 0, r.out);
  assert.equal(readJson(join(dir, 'story.json')).kind, 'deck');
  const spec = kitImport(dir);
  assert.equal(spec, `${'../'.repeat(relative(ROOT, dir).split('/').length)}runtime/kit/kit.js`);
  assert.ok(existsSync(resolve(dir, spec)), `${spec} resolves to the kit`);
  assert.doesNotMatch(readFileSync(join(dir, 'piece.js'), 'utf8'), /pieces\/<id>/, 'the stale "lives at pieces/<id>/" note is gone');
  const opened = await openPiece(dir, {});
  try { assert.ok((await opened.mm.meta()).presses > 0); assert.deepEqual(opened.errors, []); } finally { await opened.close(); }
});

test('kitSpecifier is relative from any depth, and ./ at the repo root', () => {
  assert.equal(kitSpecifier(join(ROOT, 'pieces/x')), '../../runtime/kit/kit.js');
  assert.equal(kitSpecifier(join(ROOT, 'a/b/c/x')), '../../../../runtime/kit/kit.js');
  assert.equal(kitSpecifier(join(ROOT, 'runtime/skeletons/film')), '../../kit/kit.js');
  assert.equal(kitSpecifier(ROOT), './runtime/kit/kit.js');
});

test('default location pieces/<id>/ is the same scaffold (written to a throwaway root, not to pieces/)', () => {
  const root = join(tmpdir(), `mm-new-root-${process.pid}`);
  rmSync(root, { recursive: true, force: true });
  try {
    cpSync(join(ROOT, 'runtime/skeletons'), join(root, 'runtime/skeletons'), { recursive: true });
    const dir = newPiece({ kind: 'film', style: 'editorial', id: 'demo', root });
    assert.equal(dir, join(root, 'pieces', 'demo'));
    assert.equal(kitImport(dir), '../../runtime/kit/kit.js');
    assert.equal(readJson(join(dir, 'story.json')).id, 'demo');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an existing folder, a bad kind, an unknown style and a folder outside the repo exit 2 and write nothing', () => {
  const dir = join(work, 'taken');
  assert.equal(mm(['new', '--kind', 'film', '--style', 'kinetic', '--dir', dir]).status, 0);
  let r = mm(['new', '--kind', 'film', '--style', 'kinetic', '--dir', dir]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /already exists/);

  r = mm(['new', '--kind', 'poster', '--style', 'kinetic', '--dir', join(work, 'never')]);
  assert.equal(r.status, 2);
  r = mm(['new', '--kind', 'film', '--style', 'no-such-style', '--dir', join(work, 'never')]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /style not found/);
  const outside = join(tmpdir(), `mm-outside-${process.pid}`);
  r = mm(['new', '--kind', 'film', '--style', 'kinetic', '--dir', outside]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /inside the repo/);
  assert.ok(!existsSync(outside) && !existsSync(join(work, 'never')), 'nothing was created');
  assert.equal(mm(['new', '--kind', 'film', '--style', 'kinetic']).status, 2, 'neither --id nor --dir');
});

test('a piece moved without fixing its import fails fast, naming the import', () => {
  const src = join(work, 'film');
  const moved = join(work, 'moved', 'deeper', 'film');
  cpSync(src, moved, { recursive: true });
  const text = readFileSync(join(moved, 'piece.js'), 'utf8').replace(/from\s*'[^']*kit\.js'/, "from '../../runtime/kit/kit.js'");
  writeFileSync(join(moved, 'piece.js'), text);
  for (const verb of ['stills', 'export', 'review', 'serve']) {
    const r = mm([verb, moved], { timeout: 20_000 });
    assert.equal(r.status, 2, `${verb}: ${r.out}`);
    assert.match(r.stderr, /piece failed to load: .*piece\.js imports "\.\.\/\.\.\/runtime\/kit\/kit\.js", which resolves to .*runtime\/kit\/kit\.js and is not there/, `${verb}: ${r.stderr}`);
    assert.doesNotMatch(r.out, /Timeout|\n\s+at /);
  }
});

test('no scaffold test leaves anything in pieces/', () => {
  const added = readdirSync(join(ROOT, 'pieces')).filter((n) => !piecesBefore.has(n));
  assert.deepEqual(added, []);
  assert.deepEqual(readdirSync(join(ROOT, 'pieces')).filter((n) => n.startsWith('zz-')), []);
});

test('mm new with a style whose two roles share one font file (calm-product) scaffolds without error', async () => {
  const { execFileSync } = await import('node:child_process');
  const { rmSync, existsSync, readFileSync } = await import('node:fs');
  const dir = `.tmp-cli-calm-${process.pid}`;
  try {
    execFileSync(process.execPath, ['scripts/mm.mjs', 'new', '--kind', 'film', '--style', 'calm-product', '--dir', dir, '--id', 'calm-share'], { stdio: 'pipe' });
    const style = JSON.parse(readFileSync(`${dir}/style.json`, 'utf8'));
    for (const role of ['display', 'text']) for (const f of style.type[role].files) assert.ok(existsSync(`${dir}/${f.src}`), `${role}: ${f.src}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
