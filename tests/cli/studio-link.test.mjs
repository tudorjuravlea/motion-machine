// The studio link: a serving `mm studio` notes its address in out/studio/server.json and removes it
// when stopped; `mm export` ends with the live link, or with the command that starts a studio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { MM, workCopy } from './cli-helpers.mjs';
import { forgetStudio, liveStudio, noteStudio, serverFile, studioLine } from '../../scripts/lib/studio-link.mjs';

const w = workCopy('studio-link');
const piece = w.film;
before(() => mkdirSync(join(piece, 'out', 'studio'), { recursive: true }));
after(() => w.cleanup());

const note = (o) => writeFileSync(serverFile(piece), JSON.stringify(o));

test('with no studio serving, the line is the command that starts one', async () => {
  forgetStudio(piece);
  assert.equal(await liveStudio(piece), null);
  assert.equal(await studioLine(piece), `studio: mm studio ${relative(process.cwd(), piece)} --open (the piece as a timeline; edit, then export from it)`);
});

test('a note left by a studio that is gone is ignored', async () => {
  note({ url: 'http://127.0.0.1:9/x', pid: 2 ** 22 + 12345 });   // no such process
  assert.equal(await liveStudio(piece), null);
  note({ url: 'http://127.0.0.1:9/x', pid: process.pid });       // a live process, but nothing answers
  assert.equal(await liveStudio(piece, { timeoutMs: 300 }), null);
});

test('a live studio is printed as its link, and only its own process removes the note', async () => {
  const server = createServer((req, res) => res.end('ok'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/scripts/studio/ui/index.html`;
  try {
    noteStudio(piece, url);
    assert.equal(await studioLine(piece), `studio: ${url}`);
    note({ url, pid: process.pid + 1 });
    forgetStudio(piece);
    assert.ok(existsSync(serverFile(piece)), 'another studio\'s note is left alone');
  } finally { await new Promise((r) => server.close(r)); }
});

test('mm studio notes its page while it serves and removes the note when stopped', async () => {
  forgetStudio(piece);
  note({ url: 'stale', pid: 1 });
  const child = spawn(process.execPath, [MM, 'studio', piece], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  const url = await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error(`no studio line: ${out}`)), 20_000);
    child.stdout.on('data', (d) => { out += d; const m = out.match(/^studio (\S+)/m); if (m) { clearTimeout(t); ok(m[1]); } });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => { clearTimeout(t); fail(new Error(`studio exited ${code}: ${out}`)); });
  });
  const noted = JSON.parse(readFileSync(serverFile(piece), 'utf8'));
  assert.equal(noted.url, url);
  assert.equal(await liveStudio(piece), url);
  const code = await new Promise((r) => { child.removeAllListeners('exit'); child.on('exit', (c, s) => r(c ?? s)); child.kill('SIGTERM'); });
  assert.ok(code === 143 || code === 'SIGTERM', `exit ${code}`);
  assert.equal(existsSync(serverFile(piece)), false);
});
