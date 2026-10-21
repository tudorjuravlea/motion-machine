// A film with a 3D phone that turns to face the viewer
// playing a recording, then turns slowly while a captured page scrolls and a tap lands, passes the
// gate in both formats and survives export --prove; the export time per frame is printed.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';

const PIECE = join(ROOT, 'fixtures/phone-3d');
const mm = (args) => spawnSync(process.execPath, [join(ROOT, 'scripts/mm.mjs'), ...args], { encoding: 'utf8', timeout: 1_800_000, maxBuffer: 64 << 20 });

before(() => {
  if (!existsSync(join(PIECE, 'assets/site-phone/media.json'))) assert.equal(spawnSync('sh', [join(PIECE, 'make-assets.sh')], { encoding: 'utf8' }).status, 0, 'make-assets.sh failed');
});

for (const format of ['9x16', '16x9', '4x5']) {
  test(`the 3D phone film passes mm check in ${format}`, () => {
    const r = mm(['check', PIECE, '--format', format, '--quiet']);
    const report = JSON.parse(readFileSync(join(PIECE, 'out/check.json'), 'utf8'));
    const failed = report.rules.filter((x) => x.status === 'FAIL').map((x) => `${x.id}: ${JSON.stringify(x.evidence).slice(0, 240)}`);
    assert.equal(r.status, 0, failed.join('\n') || r.stdout + r.stderr);
  });
}

test('export --prove renders every frame twice, identically (9x16), and reports seconds per frame', () => {
  const t0 = Date.now();
  const r = mm(['export', PIECE, '--formats', '9x16', '--prove', '--force']);
  assert.equal(r.status, 0, r.stdout.slice(-2000) + r.stderr.slice(-2000));
  const manifest = JSON.parse(readFileSync(join(PIECE, 'out/export.json'), 'utf8'));
  const frames = manifest.prove[0].frames;
  console.log(`phone-3d export: ${frames} frames twice in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${((Date.now() - t0) / 1000 / (2 * frames)).toFixed(3)} s per frame`);
});
