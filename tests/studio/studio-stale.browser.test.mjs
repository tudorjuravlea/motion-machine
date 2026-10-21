// A studio left running across an update (a new control was refused by an old server): the page is
// read from disk at every reload but the server's code only once, so new controls met old code that
// refused them. The server fingerprints its own code; the page says plainly that the studio must be
// restarted, at load and after a refused edit.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser } from '../../scripts/lib/browser.mjs';
import { startStudio } from '../../scripts/studio/server.mjs';
import { workCopy } from '../cli/cli-helpers.mjs';
import { openStudio } from './studio-bench-lib.mjs';

let browser, w, s, code;
before(async () => {
  browser = await launchBrowser();
  w = workCopy('studio-stale');
  code = join(w.dir, 'fake-code');
  mkdirSync(code, { recursive: true });
  writeFileSync(join(code, 'ops.js'), 'export const v = 1;\n');
  s = await startStudio({ piece: w.film, codeRoots: [code] });
});
after(async () => { await browser?.close(); await s?.close(); w?.cleanup(); });

test('a fresh studio shows no restart banner', async () => {
  const p = await openStudio(browser, s);
  try { assert.equal(await p.locator('#stale').isVisible(), false); } finally { await p.close(); }
});

test('after the studio\'s code changed, a reload shows a banner that says to restart mm studio', async () => {
  writeFileSync(join(code, 'ops.js'), 'export const v = 2;\n');
  const p = await openStudio(browser, s);
  try {
    assert.ok(await p.locator('#stale').isVisible(), 'the banner is shown');
    assert.match(await p.locator('#stale').innerText(), /restart|start it again/i);
    assert.match(await p.locator("#stale").innerText(), /mm(\.mjs)? studio/, "it names the command");
  } finally { await p.close(); }
});
