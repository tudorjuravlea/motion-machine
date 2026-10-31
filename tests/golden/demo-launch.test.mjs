// The launch demo: a launch film for a fictional planner, built from the Launch archetype
// (skill/motion-machine/references/archetypes.md). It passes the gate with no warning in 9x16, 16x9
// and 4x5, and keeps the skill's ground rule 9: one device scene in seven.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';

const PIECE = join(ROOT, 'pieces/demo-launch');
// W-TOKENS counts the corner radii of the phone's frame, its screen and the plates around them: four values against three.
// The device is the subject of the demo, so that one finding stands and nothing else may.
const STANDS = ['W-TOKENS'];
const mm = (args) => spawnSync(process.execPath, [join(ROOT, 'scripts/mm.mjs'), ...args], { encoding: 'utf8', timeout: 900_000, maxBuffer: 64 << 20 });

for (const format of ['9x16', '16x9', '4x5']) {
  test(`the launch demo passes mm check in ${format} with no warning but the device's radii`, () => {
    const r = mm(['check', PIECE, '--format', format, '--quiet']);
    const report = JSON.parse(readFileSync(join(PIECE, 'out/check.json'), 'utf8'));
    const findings = report.rules.filter((x) => (x.status === 'FAIL' || x.status === 'WARN') && !STANDS.includes(x.id)).map((x) => `${x.id} ${x.status}: ${x.evidence?.reason ?? ''}`);
    assert.equal(r.status, 0, findings.join('\n'));
    assert.deepEqual(findings, []);
  });
}

test('a device appears in at most a third of the scenes (ground rule 9)', () => {
  const story = JSON.parse(readFileSync(join(PIECE, 'story.json'), 'utf8'));
  const device = story.scenes.filter((s) => [s.layout, ...s.beats.map((b) => b.fx)].some((id) => /^(devices|3d\/phone)|^layouts\/desktop$/.test(id)));
  assert.ok(device.length >= 1 && device.length <= Math.floor(story.scenes.length / 3), `${device.length} of ${story.scenes.length}`);
});
