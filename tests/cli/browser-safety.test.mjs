// What a page can reach and what a failed run leaves behind:
//  - a page captured from the network opens in a Chromium with its sandbox on (MM_NO_SANDBOX=1 opts out);
//  - every verb that starts a server and a browser closes both on every error path, so the process exits.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { capture } from '../../scripts/capture-site.mjs';
import { captureBrand } from '../../scripts/capture-brand.mjs';
import { launchBrowser, openPiece, readyMs, timeoutScale } from '../../scripts/lib/browser.mjs';
import { defaultWorkers } from '../../scripts/export.mjs';
import { mm, workCopy } from './cli-helpers.mjs';

/** Replaces chromium.launch with a recorder; `restore()` puts it back. */
function spyLaunch() {
  const real = chromium.launch;
  const calls = [];
  chromium.launch = async (opts) => {
    calls.push(opts);
    return { closed: false, async close() { this.closed = true; }, async newContext() { throw new Error('stub browser'); }, async newPage() { throw new Error('stub browser'); } };
  };
  return { calls, restore: () => { chromium.launch = real; } };
}
const withEnv = async (key, value, fn) => {
  const old = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return await fn(); } finally { if (old === undefined) delete process.env[key]; else process.env[key] = old; }
};

test('an untrusted launch turns the Chromium sandbox on; MM_NO_SANDBOX=1 is the one way off', async () => {
  const spy = spyLaunch();
  try {
    await withEnv('MM_NO_SANDBOX', undefined, async () => {
      await launchBrowser({ untrusted: true });
      await launchBrowser();
    });
    await withEnv('MM_NO_SANDBOX', '1', () => launchBrowser({ untrusted: true }));
  } finally { spy.restore(); }
  assert.equal(spy.calls[0].chromiumSandbox, true);
  assert.notEqual(spy.calls[1].chromiumSandbox, true, 'a trusted launch (the piece is local code) keeps the default');
  assert.equal(spy.calls[2].chromiumSandbox, false);
  assert.ok(!('untrusted' in spy.calls[0]), 'the flag is ours, not Playwright\'s');
  assert.ok(spy.calls[0].args.includes('--force-color-profile=srgb'), 'the stable-raster flags stay');
});

test('capture site and brand capture open a remote URL with the sandbox on; a saved page is sandboxed too, a file:// site capture as before', async () => {
  const spy = spyLaunch();
  try {
    await withEnv('MM_NO_SANDBOX', undefined, async () => {
      await assert.rejects(capture({ url: 'https://example.invalid/', name: 'x', piece: '.' }), /stub browser/);
      await assert.rejects(captureBrand({ from: 'https://example.invalid/', name: 'quill-site', out: join(process.cwd(), '.tmp-never-written.json') }), /stub browser/);
      await assert.rejects(capture({ url: 'file:///nonexistent/index.html', name: 'x', piece: '.' }), /stub browser/);
      await assert.rejects(captureBrand({ from: 'fixtures/capture/site/index.html', name: 'quill-file', out: join(process.cwd(), '.tmp-never-written.json') }), /stub browser/);
    });
  } finally { spy.restore(); }
  assert.equal(spy.calls.length, 4);
  assert.equal(spy.calls[3].chromiumSandbox, true, 'brand capture, a saved page is as untrusted as a site');
  assert.equal(spy.calls[0].chromiumSandbox, true, 'capture site, https');
  assert.equal(spy.calls[1].chromiumSandbox, true, 'brand capture, https');
  assert.notEqual(spy.calls[2].chromiumSandbox, true, 'capture site, file');
});

test('MM_TIMEOUT_SCALE stretches the page-ready wait; MM_WORKERS caps the default export workers', async () => {
  await withEnv('MM_TIMEOUT_SCALE', undefined, () => { assert.equal(timeoutScale(), 1); assert.equal(readyMs(), 30_000); });
  await withEnv('MM_TIMEOUT_SCALE', '2', () => assert.equal(readyMs(), 60_000));
  await withEnv('MM_TIMEOUT_SCALE', 'nonsense', () => assert.equal(timeoutScale(), 1));
  await withEnv('MM_WORKERS', undefined, () => assert.ok(defaultWorkers() >= 1));
  await withEnv('MM_WORKERS', '1', () => assert.equal(defaultWorkers(), 1));
  await withEnv('MM_WORKERS', '0', () => assert.ok(defaultWorkers() >= 1));
});

test('openPiece closes the browser it started when the page fails to open', async () => {
  const closed = [];
  const real = chromium.launch;
  chromium.launch = async () => ({ async newPage() { throw new Error('no page'); }, async close() { closed.push('browser'); } });
  try { await assert.rejects(openPiece('fixtures/kit-smoke/film', {}), /no page/); } finally { chromium.launch = real; }
  assert.deepEqual(closed, ['browser']);
});

test('openPiece refuses a format it does not know before it starts anything', async () => {
  const spy = spyLaunch();
  try { await assert.rejects(openPiece('fixtures/kit-smoke/film', { format: '2x2' }), /unknown format 2x2/); } finally { spy.restore(); }
  assert.equal(spy.calls.length, 0);
});

let w;
after(() => w?.cleanup());

test('a bad --format ends mm stills and mm serve with exit 2, one line, no stack, and the process exits', () => {
  w = workCopy('safety');
  for (const verb of [['stills'], ['serve']]) {
    const t0 = Date.now();
    const r = mm([...verb, w.film, '--format', '2x2'], { timeout: 20_000 });
    assert.equal(r.status, 2, `${verb[0]}: ${r.out}`);
    assert.ok(Date.now() - t0 < 15_000, `${verb[0]} exited in ${Date.now() - t0} ms`);
    assert.match(r.stderr, /^mm: unknown format 2x2/m);
    assert.doesNotMatch(r.stderr, /^\s+at /m, 'no stack');
  }
});

test('a piece whose page never mounts ends mm stills with a one-line error and the process exits', () => {
  w ??= workCopy('safety');
  const empty = join(w.dir, 'empty-piece');   // a story and a page that never defines window.mm
  mkdirSync(empty, { recursive: true });
  writeFileSync(join(empty, 'story.json'), readFileSync(join(w.film, 'story.json')));
  writeFileSync(join(empty, 'index.html'), '<!doctype html><meta charset="utf-8"><title>empty</title><p>no kit here</p>\n');
  const t0 = Date.now();
  const r = mm(['stills', empty], { timeout: 30_000, env: { MM_TIMEOUT_SCALE: '0.1' } });
  assert.equal(r.status, 2, r.out);
  assert.ok(Date.now() - t0 < 25_000, `exited in ${Date.now() - t0} ms`);
  assert.match(r.stderr, /^mm: piece did not open: window\.mm never appeared/m);
  assert.doesNotMatch(r.stderr, /^\s+at /m, 'no stack');
});
