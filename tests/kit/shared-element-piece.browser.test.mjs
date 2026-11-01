// transitions/shared-element through the real kit, on two bento scenes that share a card: the same
// instants give the same pixels in forward and reverse seek order, and once the cut is over nothing the
// transition wrote is left on the card, its children or the scenes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { composeToFile } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';

const OUT = join(ROOT, 'out', 'shared-piece-test');
let server, browser, dir;
before(async () => {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  dir = join(OUT, 'piece');
  const style = join(OUT, 'paper.style.json');
  composeToFile({ brand: 'paper', motion: 'calm', out: style });
  newPiece({ kind: 'film', style, dir });
  writeFileSync(join(dir, 'story.json'), readFileSync(join(ROOT, 'fixtures/morph/shared-story.json'), 'utf8'));
  cpSync(join(ROOT, 'fixtures/morph/assets'), join(dir, 'assets'), { recursive: true });
  server = await serveRoot(ROOT); browser = await launchBrowser();
});
after(async () => { await browser?.close(); await server?.close(); rmSync(OUT, { recursive: true, force: true }); });

for (const format of ['16x9', '9x16']) {
  test(`${format}: the same instants give the same pixels in either seek order, and the card rests clean`, async () => {
    const o = await openPiece(dir, { server, browser, format });
    try {
      const ts = [2.9, 3.1, 3.25, 3.4, 3.8];
      const fwd = {};
      for (const t of ts) fwd[t] = (await framePng(o.page, t)).toString('base64');
      for (const t of ts.slice().reverse()) assert.equal((await framePng(o.page, t)).toString('base64'), fwd[t], `t ${t}`);
      assert.notEqual(fwd[3.1], fwd[3.25], 'the card is on the move between them');
      await o.mm.seek(5);
      const left = await o.page.evaluate(() => [...document.querySelectorAll('[data-slot="tile-3"], [data-slot="tile-3"] *')]
        .map((el) => [el.getAttribute('style') ?? '', el.hasAttribute('data-mm-counter')]).filter(([s, c]) => /transform|clip-path|border-radius|box-shadow/.test(s) || c));
      assert.deepEqual(left, [], 'nothing the transition wrote is left on the card at rest');
      assert.deepEqual(o.errors, []);
    } finally { await o.close(); }
  });
}
