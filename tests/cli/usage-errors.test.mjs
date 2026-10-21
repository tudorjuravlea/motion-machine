// A usage mistake is one line on stderr and exit 2 (SPEC §8): never a stack, never a wrong exit code.
// `mm --version` names the release. `npx mm` is not advice this repository gives.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { USAGE, resolvePiece } from '../../scripts/lib/cli.mjs';
import { ROOT, mm, workCopy } from './cli-helpers.mjs';

let w;
before(() => { w = workCopy('usage'); });
after(() => w.cleanup());

const noStack = (text) => assert.doesNotMatch(text, /^\s+at |ERR_SOCKET|ERR_PARSE_ARGS|TypeError|RangeError|node:internal/m);

test('mm serve: a port that is not a port number, and a format that is not a format, are usage errors', () => {
  for (const args of [['--port', 'abc'], ['--port', '99999'], ['--port', '-1'], ['--format', '2x2']]) {
    const r = mm(['serve', w.film, ...args], { timeout: 20_000 });
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.out}`);
    noStack(r.stderr);
    assert.equal(r.stderr.trim().split('\n').filter((l) => l.startsWith('mm:')).length, 1, r.stderr);
  }
});

test('mm beats: a missing or undecodable input is a setup error (2), with a one-line message', () => {
  const missing = mm(['beats', join(w.dir, 'nofile.wav')]);
  assert.equal(missing.status, 2, missing.out);
  assert.match(missing.stderr, /^beats: /);
  noStack(missing.stderr);
  const junk = join(w.dir, 'junk.wav');
  writeFileSync(junk, 'this is not audio');
  const bad = mm(['beats', junk]);
  assert.equal(bad.status, 2, bad.out);
  noStack(bad.stderr);
});

test('mm sound: a format the story does not ship, or --formats with no value, exits 2 with a usable line', () => {
  const unknown = mm(['sound', w.film, '--formats', '2x2']);
  assert.equal(unknown.status, 2, unknown.out);
  assert.match(unknown.stderr, /2x2/);
  assert.match(unknown.stderr, /ships/);
  noStack(unknown.stderr);
  const novalue = mm(['sound', w.film, '--formats']);
  assert.equal(novalue.status, 2, novalue.out);
  assert.doesNotMatch(novalue.stderr, /Cannot read properties/);
  noStack(novalue.stderr);
});

test('mm sound and mm check resolve a piece the way every verb does: a moved piece gets the one-line import error', () => {
  const r = mm(['sound', '/nonexistent-piece']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no piece at "\/nonexistent-piece"/);
});

test('mm check with no piece prints the same usage line as `mm check --help`, and exits 2', () => {
  const r = mm(['check']);
  assert.equal(r.status, 2, r.out);
  assert.ok(r.stderr.includes(`usage: ${USAGE.check[0]}`), r.stderr);
  assert.match(USAGE.check[0], /^mm check <piece>/, 'the piece is required');
});

test('a piece that is not found lists each place it looked once', () => {
  assert.throws(() => resolvePiece('pieces/nope'), (e) => {
    const looked = e.message.match(/in (.*)\)$/)[1].split(', ');
    assert.equal(new Set(looked).size, looked.length, e.message);
    assert.ok(!looked.some((p) => p.includes('pieces/pieces/')), e.message);
    return true;
  });
});

test('an unexpected failure prints one line (MM_DEBUG=1 adds the stack)', () => {
  const file = join(w.dir, 'boom.mjs');
  writeFileSync(file, `import { runMain } from ${JSON.stringify(join(ROOT, 'scripts/lib/cli.mjs'))};\nrunMain(import.meta, async () => { throw new TypeError('boom'); });\n`);
  const run = (env) => {
    const r = spawnSync(process.execPath, [file], { encoding: 'utf8', env: { ...process.env, ...env } });
    return { status: r.status, stderr: r.stderr };
  };
  const plain = run({});
  assert.equal(plain.status, 2);
  assert.equal(plain.stderr.trim(), 'mm: boom');
  const debug = run({ MM_DEBUG: '1' });
  assert.match(debug.stderr, /^\s+at /m);
});

test('mm --version and mm -v print the release from package.json', () => {
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  for (const flag of ['--version', '-v']) {
    const r = mm([flag]);
    assert.equal(r.status, 0, r.out);
    assert.equal(r.stdout.trim(), version);
  }
});

test('mm new lists --id once', () => {
  assert.equal([...USAGE.new[0].matchAll(/--id\b/g)].length, 1, USAGE.new[0]);
});

test('no script help or header tells the reader to run `npx mm`', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const hits = walk(join(ROOT, 'scripts')).filter((f) => /npx mm\b/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
  assert.doesNotMatch(mm(['--help']).stdout, /npx mm/);
});
