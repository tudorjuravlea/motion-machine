// scripts/lib/webm.mjs: ingest hygiene for a recording. A WebM that a recorder wrote while streaming
// carries no duration, or a wrong one, so the duration is scanned from the packets; the first frame
// is checked not black before a recording is cut into a film.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './cli-helpers.mjs';
import { scanDuration, chooseDuration, firstFrame, findFlashes, TOLERANCE_S } from '../../scripts/lib/webm.mjs';

const work = join(ROOT, `.tmp-webm-${process.pid}`);
const ff = (args, out) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 26 }); assert.equal(r.status, 0, String(r.stderr)); if (out) writeFileSync(out.file, r.stdout); };
// streamed to a pipe, so the muxer cannot seek back and write the duration: how Playwright's recorder leaves a file
const streamed = (src, file) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...src, '-c:v', 'libvpx', '-b:v', '300k', '-f', 'webm', '-'], { maxBuffer: 1 << 26 }); assert.equal(r.status, 0, String(r.stderr)); writeFileSync(file, r.stdout); };

before(() => {
  rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  streamed(['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=25:duration=3'], join(work, 'streamed.webm'));
  ff(['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=25:duration=3', '-c:v', 'libvpx', '-b:v', '300k', join(work, 'seekable.webm')]);
  ff(['-f', 'lavfi', '-i', 'color=c=black:size=160x120:rate=25:duration=2', '-c:v', 'libvpx', join(work, 'black.webm')]);
  // a page that flashes red three times, 120 ms each, from 0.5 s
  ff(['-f', 'lavfi', '-i', 'color=c=white:size=160x120:rate=25:duration=3', '-vf', "drawbox=x=0:y=0:w=160:h=120:color=red:t=fill:enable='between(t,0.5,0.62)+between(t,1.0,1.12)+between(t,1.5,1.62)'", '-c:v', 'libvpx', '-b:v', '300k', join(work, 'flashes.webm')]);
  // a recording that opens on black and then shows the page
  ff(['-f', 'lavfi', '-i', 'color=c=black:size=160x120:rate=25:duration=1', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=25:duration=2', '-filter_complex', '[0][1]concat=n=2:v=1:a=0', '-c:v', 'libvpx', join(work, 'black-then-page.webm')]);
});
after(() => rmSync(work, { recursive: true, force: true }));

test('the duration of a file with none is scanned from its packets', () => {
  const d = scanDuration(join(work, 'streamed.webm'));
  assert.ok(Math.abs(d.seconds - 3) < 0.1, `3 s expected, got ${d.seconds}`);
  assert.ok(Math.abs(d.scanned - 3) < 0.05, `the packets end at 3 s, got ${d.scanned}`);
  assert.equal(d.packets, 75);
});

test('a sound container duration is kept when the scan agrees with it', () => {
  const d = scanDuration(join(work, 'seekable.webm'));
  assert.equal(d.source, 'container');
  assert.ok(Math.abs(d.seconds - 3) < 0.1);
});

test('which duration to trust: the scan when the container is missing, not positive, or more than 1.5 s off', () => {
  assert.equal(TOLERANCE_S, 1.5);
  assert.deepEqual(chooseDuration(NaN, 3), { seconds: 3, source: 'scan' });
  assert.deepEqual(chooseDuration(undefined, 3), { seconds: 3, source: 'scan' });
  assert.deepEqual(chooseDuration(0, 3), { seconds: 3, source: 'scan' });
  assert.deepEqual(chooseDuration(-2, 3), { seconds: 3, source: 'scan' });
  assert.deepEqual(chooseDuration(Infinity, 3), { seconds: 3, source: 'scan' });
  assert.deepEqual(chooseDuration(10, 3), { seconds: 3, source: 'scan' });
  assert.deepEqual(chooseDuration(4.6, 3), { seconds: 3, source: 'scan' });
  assert.deepEqual(chooseDuration(3.4, 3), { seconds: 3.4, source: 'container' });
  assert.deepEqual(chooseDuration(3, 0), { seconds: 3, source: 'container' }, 'a scan that found nothing proves nothing');
});

test('a file with no video is an error that names the file', () => {
  writeFileSync(join(work, 'junk.webm'), 'not a video');
  assert.throws(() => scanDuration(join(work, 'junk.webm')), /junk\.webm/);
});

test('the first frame: a black one is named black; one with a page on it is not', () => {
  const black = firstFrame(join(work, 'black.webm'));
  assert.equal(black.black, true);
  assert.ok(black.max <= 24 && black.mean <= 4);
  const page = firstFrame(join(work, 'seekable.webm'));
  assert.equal(page.black, false);
  assert.ok(page.max > 24 || page.mean > 4);
  assert.equal(firstFrame(join(work, 'black-then-page.webm')).black, true, 'only the first frame is judged');
});

test('the sync flashes of a recording are found: the first frame of each red run', () => {
  const f = findFlashes(join(work, 'flashes.webm'), 3);
  assert.equal(f.length, 3);
  [0.5, 1.0, 1.5].forEach((t, i) => assert.ok(f[i] >= t - 0.001 && f[i] <= t + 0.08, `flash ${i + 1} expected near ${t} s, found ${f[i]}`));
  assert.deepEqual(findFlashes(join(work, 'seekable.webm'), 3), [], 'a recording with no flash has none');
  assert.deepEqual(findFlashes(join(work, 'flashes.webm'), 0.8).length, 1, 'only those before the limit');
});
