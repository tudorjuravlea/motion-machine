// One scene per effect, none of them on a device,
// passes the gate in 9x16, 16x9 and 4x5. The one warning allowed is W-AMBIENT on the exploded-layers
// scene, whose move is the scene's subject and happens during its rest (moves/explode-layers card).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';

const PIECE = join(ROOT, 'fixtures/effects-reel');
const mm = (args) => spawnSync(process.execPath, [join(ROOT, 'scripts/mm.mjs'), ...args], { encoding: 'utf8', timeout: 900_000, maxBuffer: 64 << 20 });

for (const format of ['9x16', '16x9', '4x5']) {
  test(`the effects reel passes mm check in ${format}, warning only where the explode move is the subject`, () => {
    const r = mm(['check', PIECE, '--format', format, '--quiet']);
    const report = JSON.parse(readFileSync(join(PIECE, 'out/check.json'), 'utf8'));
    const failed = report.rules.filter((x) => x.status === 'FAIL').map((x) => `${x.id}: ${JSON.stringify(x.evidence).slice(0, 240)}`);
    assert.equal(r.status, 0, failed.join('\n') || r.stdout + r.stderr);
    const warned = report.rules.filter((x) => x.status === 'WARN').map((x) => x.id);
    // W-TOKENS: the 16x9 layouts draw six font sizes for a reel of looks; the narrow formats draw five
    assert.deepEqual(warned, format === '16x9' ? ['W-AMBIENT', 'W-TOKENS'] : ['W-AMBIENT'], JSON.stringify(report.rules.filter((x) => x.status === 'WARN').map((x) => [x.id, x.evidence?.reason])));
    assert.equal(report.rules.find((x) => x.id === 'W-AMBIENT').evidence.scenes.map((s) => s.scene).join(), 'layers');
  });
}

test('no scene of the reel uses a device, a screen or a 3D stage', () => {
  const story = JSON.parse(readFileSync(join(PIECE, 'story.json'), 'utf8'));
  const used = story.scenes.flatMap((s) => [s.layout, s.move, ...s.beats.flatMap((b) => [b.fx, b.emphasis])]).filter(Boolean);
  assert.deepEqual(used.filter((id) => /^(devices|screen|3d)\//.test(id) || id === 'layouts/desktop' || id === 'layouts/caption-bar'), []);
});
