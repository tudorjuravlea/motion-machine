// A sparse, peaky cue mix (three short cues over 20 s of silence, no track, no bed)
// cannot reach -14 LUFS by linear gain under a -1.5 dBTP ceiling; the second stage (an oversampled
// limiter, then a measured linear gain) must bring the shipped MP4 to -14 ± 1 LUFS with true peak
// ≤ -1 dBTP, and out/cues.json must say which stage did it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATTERNS, ctxFor, ensureSilentMp4, variant } from '../../fixtures/sound/setup.mjs';
import { buildSound, measureLoudness } from '../../scripts/sound.mjs';
import gLoud from '../../scripts/check/G-LOUD.mjs';

test('three short cues over 20 s of silence: the muxed MP4 lands at -14 ± 1 LUFS and ≤ -1 dBTP; the stage is recorded', async () => {
  const dir = await variant('sparse', {
    track: null, beats: null, cues: ['hit', 'tick', null, 'tick'],
    edit: (s) => { s.scenes[0].duration = 10; s.scenes[1].duration = 10; },
  });
  const picture = await ensureSilentMp4(dir, 'picture-sparse-20s', { seconds: 20 });
  mkdirSync(join(dir, 'out'), { recursive: true });
  const mp4 = join(dir, 'out', 'kit-smoke-cues-16x9.mp4');
  copyFileSync(picture, mp4);

  const r = await buildSound(dir, { patterns: PATTERNS });
  assert.equal(r.cues.length, 3, 'three cues');
  const file = JSON.parse(readFileSync(join(dir, 'out', 'cues.json'), 'utf8'));
  assert.deepEqual(file.cues, r.cues);
  assert.equal(file.loudness.stage, 'limiter', JSON.stringify(file.loudness));
  assert.ok(file.loudness.attempts.length >= 2, 'the linear attempt is kept in the record');
  assert.equal(file.loudness.attempts[0].stage, 'loudnorm');

  const shipped = await measureLoudness(mp4);
  assert.ok(Math.abs(shipped.lufs + 14) <= 1, `MP4 ${shipped.lufs} LUFS`);
  assert.ok(shipped.truePeak <= -1, `MP4 ${shipped.truePeak} dBTP`);
  const g = await gLoud(await ctxFor(dir));
  assert.equal(g.status, 'PASS', JSON.stringify(g.evidence));
});
