// The one static handler behind `mm serve`, the gate, the exporter and the capture verbs
// (scripts/lib/static.mjs): loopback bind, a Host allowlist, no .git, no escape from the root,
// malformed percent-encoding answered with 400, frame protection headers, errors that never
// take the server down.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveRoot } from '../../scripts/lib/browser.mjs';
import { isGitSegment } from '../../scripts/lib/static.mjs';

let base, secretDir, server, port;
before(async () => {
  base = mkdtempSync(join(tmpdir(), 'mm-static-'));
  const root = join(base, 'root');
  secretDir = join(base, 'outside');
  mkdirSync(join(root, '.git'), { recursive: true });
  mkdirSync(join(root, 'sub'), { recursive: true });
  mkdirSync(secretDir);
  writeFileSync(join(root, '.git', 'config'), '[core]\n');
  writeFileSync(join(root, 'package.json'), '{}\n');
  writeFileSync(join(root, 'sub', 'index.html'), '<p>sub</p>\n');
  writeFileSync(join(root, 'locked.txt'), 'locked\n');
  writeFileSync(join(secretDir, 'secret.txt'), 'secret\n');
  symlinkSync(secretDir, join(root, 'link'));
  symlinkSync(join(root, '.git'), join(root, 'gitlink'));   // a link to the folder itself, not to a file in it
  server = await serveRoot(root);
  port = server.port;
});
after(async () => { await server?.close(); rmSync(base, { recursive: true, force: true }); });

/** A raw request: Node's client keeps the path and the Host header exactly as given. */
const get = (path, { host = `127.0.0.1:${port}`, method = 'GET' } = {}) => new Promise((ok, fail) => {
  const req = http.request({ host: '127.0.0.1', port, path, method, headers: { host } }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
  });
  req.on('error', fail);
  req.end();
});

test('binds the loopback address only', () => {
  assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+$/);
});

test('Host: localhost, 127.0.0.1 and [::1] with the server port are served; any other Host is 403', async () => {
  for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, `LOCALHOST:${port}`]) assert.equal((await get('/package.json', { host })).status, 200, host);
  for (const host of [`evil.example:${port}`, 'evil.example', `127.0.0.1.evil.example:${port}`, '127.0.0.1:1']) assert.equal((await get('/package.json', { host })).status, 403, host);
});

test('a .git folder is never served, in any case, plain or percent-encoded', async () => {
  for (const p of ['/.git/config', '/.GIT/config', '/.Git/config', '/%2egit/config', '/sub/../.git/config']) assert.equal((await get(p)).status, 403, p);
});

test('.git is refused in the spellings Windows resolves to it: trailing dots or spaces, an NTFS stream, the short name', async () => {
  const spellings = ['.git.', '.git..', '.git%20', '.git%20%20', '.git.%20.', '.git::$INDEX_ALLOCATION', '.git:stream', '.GIT.', 'GIT~1', 'git~2'];
  for (const seg of spellings) assert.equal((await get(`/${seg}/config`)).status, 403, seg);
  for (const seg of ['.git.', '.git ', '.git::$INDEX_ALLOCATION', 'GIT~1', '.git', '.GiT']) assert.ok(isGitSegment(seg), seg);
  for (const seg of ['.gitignore', '.github', 'git', 'digit', 'sub', '.gitx.', 'a.git', 'GIT~', 'GIT~x']) assert.ok(!isGitSegment(seg), seg);
});

test('a symlink to the .git folder is 403 as a folder and as a path into it, never 404', async () => {
  for (const p of ['/gitlink', '/gitlink/', '/gitlink/config']) assert.equal((await get(p)).status, 403, p);
});

test('a path that leaves the root is 403, and so is a symlink that leaves it', async () => {
  for (const p of ['/../outside/secret.txt', '/%2e%2e/outside/secret.txt', '/sub/../../outside/secret.txt', '/link/secret.txt']) assert.equal((await get(p)).status, 403, p);
});

test('malformed percent-encoding answers 400 and the server keeps serving', async () => {
  for (const p of ['/%E0%A4%A', '/%', '/%zz', '/a%00b']) assert.equal((await get(p)).status, 400, p);
  assert.equal((await get('/package.json')).status, 200);
});

test('a file that cannot be read answers an error and the server keeps serving', { skip: process.getuid?.() === 0 }, async () => {
  chmodSync(join(base, 'root', 'locked.txt'), 0o000);
  try {
    const r = await get('/locked.txt');
    assert.ok([403, 404, 500].includes(r.status), String(r.status));
  } finally { chmodSync(join(base, 'root', 'locked.txt'), 0o644); }
  assert.equal((await get('/package.json')).status, 200);
});

test('a folder serves its index.html; a missing file is 404; other methods are 405', async () => {
  const r = await get('/sub/');
  assert.equal(r.status, 200);
  assert.match(r.body, /sub/);
  assert.equal((await get('/nope.txt')).status, 404);
  assert.equal((await get('/package.json', { method: 'POST' })).status, 405);
});

test('responses forbid framing by another origin and sniffing', async () => {
  const r = await get('/package.json');
  assert.equal(r.headers['x-frame-options'], 'SAMEORIGIN');
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'self'/);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['cache-control'], 'no-store');
});
