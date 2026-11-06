// Style lint for shipped styles: a motion half must carry essence, nativeMoves and variation; two presets that
// differ only in colour are a recolour, not a style.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintStyles, motionBriefFindings, recolourPairs } from '../../scripts/lib/style-lint.mjs';
import { ROOT } from './cli-helpers.mjs';

const preset = (name, over = {}) => ({ name, from: { motion: 'styles/motion/calm.json' }, color: { canvas: '#fff' }, type: { display: { family: 'A' } }, motion: { travel: 1 }, sound: { bpm: 90 }, transitions: {}, entrances: {}, pacing: {}, finish: { grain: 0.5 }, ground: { blur: 0 }, surface: { glass: 1 }, ...over });

test('a motion half missing essence, nativeMoves or variation fails, one with all three passes', () => {
  const full = JSON.parse(readFileSync(join(ROOT, 'styles/motion/calm.json'), 'utf8'));
  assert.deepEqual(motionBriefFindings('calm', full), []);
  for (const k of ['essence', 'nativeMoves', 'variation']) {
    const { [k]: _gone, ...rest } = full;
    const f = motionBriefFindings('calm', rest);
    assert.equal(f.length, 1, k);
    assert.match(f[0].message, new RegExp(k));
  }
  assert.equal(motionBriefFindings('calm', { name: 'calm' }).length, 3);
});

test('two presets that differ only in colour are named as a recolour', () => {
  const a = preset('one'), b = preset('two', { color: { canvas: '#000' } });
  assert.deepEqual(recolourPairs([a, b]).map((p) => p.pair), [['one', 'two']]);
});

test('a difference in the motion half, the finish, the ground or the surface clears the pair', () => {
  const a = preset('one');
  for (const over of [{ motion: { travel: 2 } }, { finish: { grain: 0.1 } }, { ground: { blur: 4 } }, { surface: { glass: 0 } }, { transitions: { topic: 'transitions/wipe' } }, { pacing: { energy: 'high' } }]) {
    assert.deepEqual(recolourPairs([a, preset('two', { color: { canvas: '#000' }, ...over })]), [], JSON.stringify(over));
  }
});

test('lintStyles reads a folder of halves and a folder of presets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'style-lint-'));
  try {
    mkdirSync(join(dir, 'styles/motion'), { recursive: true });
    mkdirSync(join(dir, 'styles/presets'), { recursive: true });
    writeFileSync(join(dir, 'styles/motion/bare.json'), JSON.stringify({ name: 'bare' }));
    writeFileSync(join(dir, 'styles/presets/a.json'), JSON.stringify(preset('a')));
    writeFileSync(join(dir, 'styles/presets/b.json'), JSON.stringify(preset('b', { color: { canvas: '#111' } })));
    const f = lintStyles(dir);
    assert.equal(f.filter((x) => x.rule === 'S-BRIEF').length, 3);
    assert.deepEqual(f.filter((x) => x.rule === 'S-RECOLOUR').map((x) => x.subject), ['a + b']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('on the shipped styles every motion half is complete', () => {
  assert.deepEqual(lintStyles(ROOT).filter((x) => x.rule === 'S-BRIEF'), []);
});
