// scripts/lib/path-safe.mjs: a path named by a story, a manifest or a flag is read or written only
// inside the folder it was named against, and never through a symbolic link (mm share copies files
// into a folder meant to be published, so a link must not carry anything else along).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyInside, insideDir, listInside, readInside, writeInside } from '../../scripts/lib/path-safe.mjs';

let dir, outside;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'mm-safe-'));
  outside = mkdtempSync(join(tmpdir(), 'mm-outside-'));
  mkdirSync(join(dir, 'a', 'b'), { recursive: true });
  writeFileSync(join(dir, 'a', 'b', 'one.txt'), 'one');
  writeFileSync(join(outside, 'secret.txt'), 'secret');
  symlinkSync(join(outside, 'secret.txt'), join(dir, 'link-file'));
  symlinkSync(outside, join(dir, 'link-dir'));
  symlinkSync(join(dir, 'missing-target'), join(dir, 'dangling'));
});
after(() => { rmSync(dir, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });

test('insideDir resolves a relative path inside the folder', () => {
  assert.equal(insideDir(dir, 'a/b/one.txt'), join(dir, 'a', 'b', 'one.txt'));
  assert.equal(insideDir(dir, './a/../a/b'), join(dir, 'a', 'b'));
});

test('insideDir refuses an absolute path, a path that climbs out, an empty name and a NUL byte', () => {
  for (const bad of ['/etc/passwd', '../x', 'a/../../x', '', 'a\0b', '..']) assert.throws(() => insideDir(dir, bad), /outside|empty|absolute|NUL/i, JSON.stringify(bad));
});

test('readInside reads a regular file and refuses a link to a file, a path through a linked folder and a dangling link', () => {
  assert.equal(readInside(dir, 'a/b/one.txt').toString(), 'one');
  for (const bad of ['link-file', 'link-dir/secret.txt', 'dangling']) assert.throws(() => readInside(dir, bad), /link/i, bad);
  assert.throws(() => readInside(dir, 'a/b'), /not a regular file/i);
  assert.throws(() => readInside(dir, 'a/b/none.txt'), /no such|not found|ENOENT/i);
});

test('writeInside writes under the folder, makes the folders it needs, and refuses to write through a link', () => {
  const out = join(dir, 'made');
  writeInside(out, 'x/y/z.txt', 'hello');
  assert.equal(readFileSync(join(out, 'x', 'y', 'z.txt'), 'utf8'), 'hello');
  mkdirSync(out, { recursive: true });
  symlinkSync(join(outside, 'secret.txt'), join(out, 'planted'));
  assert.throws(() => writeInside(out, 'planted', 'overwritten'), /link/i);
  assert.equal(readFileSync(join(outside, 'secret.txt'), 'utf8'), 'secret');
  symlinkSync(outside, join(out, 'dirlink'));
  assert.throws(() => writeInside(out, 'dirlink/new.txt', 'x'), /link/i);
  assert.ok(!existsSync(join(outside, 'new.txt')));
});

test('copyInside copies a file between two folders by relative paths and refuses a linked source', () => {
  const to = join(dir, 'copied');
  copyInside(dir, 'a/b/one.txt', to, 'deep/one.txt');
  assert.equal(readFileSync(join(to, 'deep', 'one.txt'), 'utf8'), 'one');
  assert.throws(() => copyInside(dir, 'link-file', to, 'link-file'), /link/i);
});

test('listInside lists regular files, relative and sorted, and reports the links it skipped', () => {
  const r = listInside(dir, { skip: (rel) => rel.startsWith('made') || rel.startsWith('copied') });
  assert.deepEqual(r.files, ['a/b/one.txt']);
  assert.deepEqual(r.links.sort(), ['dangling', 'link-dir', 'link-file']);
});
