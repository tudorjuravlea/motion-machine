// A launch film on the desktop stage, with an opening
// line written by hand, a notch that opens into a widget, closes, and reopens mid-close without a
// jump, a phone island, and a morph, passes the gate in both formats and survives export --prove.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PIECE = join(ROOT, 'fixtures/launch-film');
const mm = (args) => spawnSync(process.execPath, [join(ROOT, 'scripts/mm.mjs'), ...args], { encoding: 'utf8', timeout: 900_000, maxBuffer: 64 << 20 });

for (const format of ['9x16', '16x9', '4x5']) {
  test(`the launch film passes mm check in ${format}`, () => {
    const r = mm(['check', PIECE, '--format', format, '--quiet']);
    const report = JSON.parse(readFileSync(join(PIECE, 'out/check.json'), 'utf8'));
    const failed = report.rules.filter((x) => x.status === 'FAIL').map((x) => `${x.id}: ${JSON.stringify(x.evidence).slice(0, 240)}`);
    assert.equal(r.status, 0, failed.join('\n') || r.stdout + r.stderr);
    // device chrome (menu bar, status bar) is not a corner label (W-BAN exempts data-chrome)
    assert.equal(report.rules.find((x) => x.id === 'W-BAN').status, 'PASS', JSON.stringify(report.rules.find((x) => x.id === 'W-BAN').evidence).slice(0, 300));
  });
}

test('export --prove renders every frame twice, identically (9x16)', () => {
  const r = mm(['export', PIECE, '--formats', '9x16', '--prove', '--force']);
  assert.equal(r.status, 0, r.stdout.slice(-2000) + r.stderr.slice(-2000));
});

test('the notch never jumps at the start of each island action (Review Focus 1)', async () => {
  const server = await serveRoot(ROOT), browser = await launchBrowser();
  try {
    const o = await openPiece(PIECE, { server, browser, format: '16x9' });
    const sched = (await o.mm.meta()).schedule;
    const starts = sched.events.filter((e) => e.screen && e.pattern === 'screen/island' && e.scene === 'notch').map((e) => e.t);
    assert.ok(starts.length >= 3, 'open, close and reopen');
    const size = async (t) => { await o.mm.seek(t); return o.page.evaluate(() => { const n = document.querySelector('[data-scene="notch"] [data-island]'); return [n.offsetWidth, n.offsetHeight]; }); };
    for (const t of starts) {
      const [a, b] = [await size(t - 0.001), await size(t + 0.001)];
      assert.ok(Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1, `jump at ${t}: ${a} -> ${b}`);
    }
    await o.close();
  } finally { await browser.close(); await server.close(); }
});
