// With ffmpeg off PATH, MM_FFMPEG and MM_FFPROBE are enough: doctor finds both and a film exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mm } from './cli-helpers.mjs';

const where = (name) => spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).stdout.trim();
const env = { PATH: '', MM_FFMPEG: where('ffmpeg'), MM_FFPROBE: where('ffprobe') };

test('doctor finds ffmpeg and ffprobe at MM_FFMPEG and MM_FFPROBE with an empty PATH', () => {
  const r = mm(['doctor'], { env });
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /ok\s+ffmpeg/);
  assert.match(r.stdout, /ok\s+ffprobe/);
});

test('a film exports with an empty PATH when MM_FFMPEG and MM_FFPROBE are set', () => {
  const r = mm(['export', 'fixtures/kit-smoke/film', '--force', '--formats', '16x9'], { env });
  assert.equal(r.status, 0, r.out);
});
