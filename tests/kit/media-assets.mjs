// The generated inputs of the tests/kit/media page (git-ignored, made by the media CLIs): `rec`, a
// recording prepared from fixtures/media/clip-2s.mp4; `site`, a captured page with two marks;
// `short`, a captured page shorter than the screen. A test file that opens a story reading one of
// them asks for it here in before(), so no test depends on another file having run first (a fresh
// checkout, a CI shard). Test files run side by side: one lock across processes, the first file
// makes what is missing and the others find it made, never half-written or swapped out under them.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../../scripts/lib/browser.mjs';

export const PAGE = join(ROOT, 'tests/kit/media');
const LOCK = join(ROOT, 'tests/kit/media/assets/.making');
const STALE_MS = 10 * 60_000;   // a lock older than this was left by a killed run
const CLIP = join(ROOT, 'fixtures/media/clip-2s.mp4');
const site = (html, name, marks = []) => ['capture', 'site', '--url', pathToFileURL(join(ROOT, 'fixtures/site', html)).href, '--name', name, '--piece', PAGE, ...marks.flatMap((m) => ['--mark', m])];
const MAKE = {
  rec: () => {
    if (!existsSync(CLIP)) ok(spawnSync('sh', [join(ROOT, 'fixtures/media/make.sh')], { encoding: 'utf8' }), 'fixtures/media/make.sh');
    mm(['media', 'prep', CLIP, '--name', 'rec', '--piece', PAGE, '--fit', 'phone']);
  },
  site: () => mm(site('index.html', 'site', ['Pricing=#pricing', 'Signup=.cta'])),
  short: () => mm(site('short.html', 'short')),
};
const ok = (r, what) => assert.equal(r.status, 0, `${what} failed: ${r.stdout ?? ''}${r.stderr ?? ''}`);
const mm = (args) => ok(spawnSync(process.execPath, [join(ROOT, 'scripts/mm.mjs'), ...args], { encoding: 'utf8' }), `mm ${args.slice(0, 2).join(' ')}`);
const ready = (name) => existsSync(join(PAGE, 'assets', name, 'media.json'));
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Makes each named asset (`rec`, `site`, `short`) that is missing; returns once all of them are there. */
export function mediaAssets(...names) {
  for (const n of names) assert.ok(MAKE[n], `unknown media asset ${n}`);
  if (names.every(ready)) return;
  mkdirSync(join(PAGE, 'assets'), { recursive: true });
  for (;;) {
    try { mkdirSync(LOCK); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - statSync(LOCK).mtimeMs > STALE_MS) rmSync(LOCK, { recursive: true, force: true }); } catch { /* released meanwhile */ }
      sleep(200);
    }
  }
  try { for (const n of names) if (!ready(n)) MAKE[n](); } finally { rmSync(LOCK, { recursive: true, force: true }); }
}
