// A layer pack travels with its piece: the gate's G-LOCAL passes a piece whose picture drifts with
// moves/depth-parallax, and fails it, naming the file, once one part of the pack is missing (the move
// requests every file media.json names, and G-LOCAL fails any request that does not succeed).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, mm } from './cli-helpers.mjs';
import { relativiseFonts } from '../../scripts/lib/cli.mjs';
import { layerFiles } from '../../scripts/lib/layers.mjs';

const work = join(ROOT, `.tmp-cli-layers-local-${process.pid}`), PIECE = join(work, 'layers', 'piece');
const FIX = join(ROOT, 'fixtures', 'layers');
const ruleOf = (id) => JSON.parse(readFileSync(join(PIECE, 'out', 'check.json'), 'utf8')).rules.find((r) => r.id === id);

before(() => {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, 'layers'), { recursive: true });
  cpSync(join(FIX, 'piece'), PIECE, { recursive: true });
  const story = JSON.parse(readFileSync(join(PIECE, 'parallax.json'), 'utf8'));
  writeFileSync(join(PIECE, 'story.json'), `${JSON.stringify({ ...story, formats: ['16x9'] }, null, 2)}\n`);
  const styleFile = join(ROOT, 'styles', 'presets', 'editorial.json');
  writeFileSync(join(PIECE, 'style.json'), JSON.stringify(relativiseFonts(JSON.parse(readFileSync(styleFile, 'utf8')), styleFile, PIECE), null, 2));
  const r = mm(['media', 'layers', join(FIX, 'scene.png'), '--name', 'scene', '--piece', PIECE, '--mask', `sun=${join(FIX, 'sun-mask.png')}`,
    '--mask', `box=${join(FIX, 'box-cutout.png')}`, '--poly', join(FIX, 'hill.json'), '--depth', join(FIX, 'depth.png')]);
  assert.equal(r.status, 0, r.out);
});
after(() => rmSync(work, { recursive: true, force: true }));

test('G-LOCAL passes a piece whose layer pack is whole, and fails it naming a missing part', () => {
  const meta = JSON.parse(readFileSync(join(PIECE, 'assets', 'scene', 'media.json'), 'utf8'));
  assert.deepEqual(layerFiles(meta).sort(), ['depth.png', 'part-box.png', 'part-hill.png', 'part-sun.png', 'plate.png', 'source.png']);
  const whole = mm(['check', PIECE, '--format', '16x9'], { env: { MM_TIMEOUT_SCALE: process.env.MM_TIMEOUT_SCALE ?? '2' }, timeout: 600_000 });
  assert.ok(whole.status === 0 || whole.status === 1, whole.out);
  assert.equal(ruleOf('G-LOCAL').status, 'PASS', JSON.stringify(ruleOf('G-LOCAL')));
  assert.equal(ruleOf('G-BRAND').status, 'PASS', JSON.stringify(ruleOf('G-BRAND')));
  assert.equal(ruleOf('G-DETERMINISM').status, 'PASS', JSON.stringify(ruleOf('G-DETERMINISM')));
  rmSync(join(PIECE, 'assets', 'scene', 'part-box.png'));
  const broken = mm(['check', PIECE, '--format', '16x9'], { env: { MM_TIMEOUT_SCALE: process.env.MM_TIMEOUT_SCALE ?? '2' }, timeout: 600_000 });
  assert.equal(broken.status, 1, broken.out);
  const local = ruleOf('G-LOCAL');
  assert.equal(local.status, 'FAIL');
  assert.match(JSON.stringify(local.evidence), /part-box\.png/);
});
