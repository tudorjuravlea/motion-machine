// mm media trim: a stream-copy cut that starts on the keyframe at or before --from, keeps every stream,
// writes a record, and refuses bad usage before writing anything.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, mm } from './cli-helpers.mjs';

const work = join(ROOT, `.tmp-cli-trim-${process.pid}`);
const clip = join(work, 'clip.mp4');
const piece = join(work, 'piece');
const trimmed = (args) => mm(['media', 'trim', clip, '--piece', piece, ...args]);
const streams = (f) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', f], { encoding: 'utf8' }).stdout).streams.map((s) => s.codec_type).sort();

before(() => {
  rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=30:duration=6',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
after(() => rmSync(work, { recursive: true, force: true }));

test('it cuts from the keyframe at or before --from, copies both streams and records the span', () => {
  const r = trimmed(['--from', '1.3', '--to', '3.5', '--name', 'cut']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /starts at 1\.000 s, the keyframe at or before 1\.300 s; for a frame-exact cut use mm media prep --trim/);
  const out = join(piece, 'assets', 'cut.mp4');
  assert.deepEqual(streams(out), ['audio', 'video']);
  const rec = JSON.parse(readFileSync(join(piece, 'assets', 'cut.trim.json'), 'utf8'));
  assert.equal(rec.source.file, 'clip.mp4');
  assert.match(rec.source.sha1, /^[0-9a-f]{40}$/);
  assert.deepEqual(rec.asked, { from: 1.3, to: 3.5 });
  assert.equal(rec.written.from, 1);
  assert.equal(rec.written.keyframe, 1);
  assert.ok(Math.abs(rec.written.duration - 2.5) < 0.2, `duration ${rec.written.duration}`);
  assert.match(rec.note, /keyframe at or before 1\.300 s/);
  assert.deepEqual(readdirSync(join(piece, 'assets')).sort(), ['cut.mp4', 'cut.trim.json']);
});

test('a --from on a keyframe starts there, and --to past the end is clamped', () => {
  const r = trimmed(['--from', '2', '--to', '99', '--name', 'tail']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /starts at 2\.000 s, on a keyframe/);
  const rec = JSON.parse(readFileSync(join(piece, 'assets', 'tail.trim.json'), 'utf8'));
  assert.ok(rec.written.duration > 3.5 && rec.written.duration < 4.3, `duration ${rec.written.duration}`);
});

test('usage errors exit 2 and write nothing', () => {
  rmSync(piece, { recursive: true, force: true });
  for (const args of [['--to', '2', '--name', 'x'], ['--from', '1', '--name', 'x'], ['--from', '1', '--to', '2'],
    ['--from', '2', '--to', '2', '--name', 'x'], ['--from', '3', '--to', '2', '--name', 'x'], ['--from', '9', '--to', '10', '--name', 'x'],
    ['--from', '1', '--to', '2', '--name', 'Bad_Name']]) {
    assert.equal(trimmed(args).status, 2, args.join(' '));
  }
  assert.equal(mm(['media', 'trim', join(work, 'missing.mp4'), '--from', '0', '--to', '1', '--name', 'x', '--piece', piece]).status, 2);
  assert.ok(!existsSync(piece), 'nothing written');
});

test('an unreadable file exits 1 and leaves no partial file', () => {
  const bad = join(work, 'bad.mp4');
  spawnSync('sh', ['-c', `echo not a video > ${bad}`]);
  const r = mm(['media', 'trim', bad, '--from', '0', '--to', '1', '--name', 'x', '--piece', piece]);
  assert.equal(r.status, 1, r.stderr);
  assert.ok(!existsSync(join(piece, 'assets', 'x.mp4')));
  assert.ok(!existsSync(piece) || readdirSync(join(piece, 'assets')).length === 0);
});
