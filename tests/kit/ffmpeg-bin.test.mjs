// ffmpeg and ffprobe are found by name on PATH, or at the paths MM_FFMPEG and MM_FFPROBE give, so a
// tool that ships its own static build (a skill's setup, a sandbox) needs no PATH change. Every
// verb asks lib/ffmpeg.mjs for the binary; none spawns the bare name itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { bin } from '../../scripts/lib/ffmpeg.mjs';

const ROOT = resolve(import.meta.dirname, '../..');

test('bin names the tool when no override is set', () => {
  assert.equal(bin('ffmpeg', {}), 'ffmpeg');
  assert.equal(bin('ffprobe', {}), 'ffprobe');
});

test('MM_FFMPEG and MM_FFPROBE override each tool on its own', () => {
  const env = { MM_FFMPEG: '/opt/tools/ffmpeg', MM_FFPROBE: '/opt/tools/ffprobe' };
  assert.equal(bin('ffmpeg', env), '/opt/tools/ffmpeg');
  assert.equal(bin('ffprobe', env), '/opt/tools/ffprobe');
  assert.equal(bin('ffprobe', { MM_FFMPEG: '/opt/tools/ffmpeg' }), 'ffprobe');
  assert.equal(bin('ffmpeg', { MM_FFMPEG: '' }), 'ffmpeg', 'an empty override is no override');
});

const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.m?js$/.test(f) ? [p] : [];
});

test('no script spawns ffmpeg or ffprobe by its bare name', () => {
  const bare = /\b(?:spawn|spawnSync|execFile|execFileSync|run)\(\s*['"]ff(?:mpeg|probe)['"]/;
  const hits = files(join(ROOT, 'scripts'))
    .flatMap((f) => readFileSync(f, 'utf8').split('\n').map((line, i) => [f, i + 1, line]))
    .filter(([, , line]) => bare.test(line))
    .map(([f, n]) => `${relative(ROOT, f)}:${n}`);
  assert.deepEqual(hits, []);
});
