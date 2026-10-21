// `mm doctor` exits 0 here and exits 2 naming ffmpeg when PATH is emptied.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mm } from './cli-helpers.mjs';

test('doctor passes on this machine', () => {
  const r = mm(['doctor']);
  assert.equal(r.status, 0, r.out);
  for (const tool of ['node', 'chromium', 'ffmpeg', 'ffprobe']) assert.match(r.stdout, new RegExp(`ok\\s+${tool}`));
});

test('doctor exits 2 naming ffmpeg when PATH is empty, and installs nothing', () => {
  const r = mm(['doctor'], { env: { PATH: '' } });
  assert.equal(r.status, 2, r.out);
  assert.match(r.stderr, /missing .*ffmpeg/);
  assert.match(r.stdout, /MISSING\s+ffmpeg/);
});

test('verbs that need ffmpeg exit 2 naming it when PATH is empty', () => {
  const r = mm(['export', 'fixtures/kit-smoke/film', '--force'], { env: { PATH: '' } });
  assert.equal(r.status, 2, r.out);
  assert.match(r.stderr, /ffmpeg not found/);
});
