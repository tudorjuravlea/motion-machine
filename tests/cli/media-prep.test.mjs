// mm media prep: a screen recording becomes a frame sequence the kit
// can seek frame-exactly: assets/<name>/f00001.jpg … plus media.json. Clips come from
// fixtures/media/make.sh (generated, never committed).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, mm } from './cli-helpers.mjs';

const CLIPS = join(ROOT, 'fixtures', 'media');
const work = join(ROOT, `.tmp-cli-media-${process.pid}`);
const frames = (dir) => readdirSync(dir).filter((f) => /^f\d{5}\.jpg$/.test(f)).sort();
const prep = (clip, name, extra = []) => mm(['media', 'prep', join(CLIPS, clip), '--name', name, '--piece', work, ...extra]);
const meta = (name) => JSON.parse(readFileSync(join(work, 'assets', name, 'media.json'), 'utf8'));

before(() => {
  if (!existsSync(join(CLIPS, 'clip-rot.mov'))) assert.equal(spawnSync('sh', [join(CLIPS, 'make.sh')]).status, 0, 'make.sh failed');
  rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
});
after(() => rmSync(work, { recursive: true, force: true }));

test('prep writes 60 frames for 2 s at 30 fps, fitted to the phone box, aspect kept', () => {
  const r = prep('clip-2s.mp4', 'two', ['--fit', 'phone']);
  assert.equal(r.status, 0, r.out);
  const m = meta('two');
  assert.equal(m.kind, 'sequence'); assert.equal(m.fps, 30);
  assert.equal(m.frames, 60); assert.equal(frames(join(work, 'assets', 'two')).length, 60);
  assert.ok(m.w <= 660 && m.h <= 1430, `${m.w}x${m.h}`);
  assert.ok(Math.abs(m.w / m.h - 1170 / 2532) / (1170 / 2532) < 0.005, `aspect ${m.w / m.h}`);
  assert.equal(m.source.file, 'clip-2s.mp4'); assert.match(m.source.sha1, /^[0-9a-f]{40}$/);
  assert.ok(!Number.isNaN(Date.parse(m.prepared)));
});

test('prep honours display rotation: a landscape-stored portrait clip comes out portrait', () => {
  const r = prep('clip-rot.mov', 'rot');
  assert.equal(r.status, 0, r.out);
  const m = meta('rot');
  assert.ok(m.h > m.w, `${m.w}x${m.h}`);
});

test('prep makes a variable-rate clip constant: frames = duration x fps (±1)', () => {
  const m = meta('rot');
  assert.ok(Math.abs(m.frames - Math.round(m.duration * 30)) <= 1, `${m.frames} frames for ${m.duration} s`);
  assert.equal(frames(join(work, 'assets', 'rot')).length, m.frames);
});

test('--trim 0.5-1.5 gives 30 frames', () => {
  const r = prep('clip-2s.mp4', 'trim', ['--trim', '0.5-1.5']);
  assert.equal(r.status, 0, r.out);
  assert.equal(meta('trim').frames, 30);
});

test('a missing --name exits 2 with the usage', () => {
  const r = mm(['media', 'prep', join(CLIPS, 'clip-2s.mp4'), '--piece', work]);
  assert.equal(r.status, 2); assert.match(r.out, /mm media prep/);
});

test('a file that is not a video exits 1 and says ffmpeg could not read it', () => {
  const bad = join(work, 'not-a-video.mp4'); writeFileSync(bad, 'hello');
  const r = mm(['media', 'prep', bad, '--name', 'bad', '--piece', work]);
  assert.equal(r.status, 1, r.out); assert.match(r.out, /ffmpeg/i);
});

// media prep edge cases
test('a trim that starts past the clip end exits 2 before it touches the existing asset', () => {
  assert.equal(prep('clip-2s.mp4', 'keep', ['--fit', 'phone']).status, 0);
  const before = frames(join(work, 'assets', 'keep')).length;
  const r = prep('clip-2s.mp4', 'keep', ['--trim', '5-6']);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /past the end/);
  assert.equal(frames(join(work, 'assets', 'keep')).length, before);
});

test('media.json duration is frames / fps of what was written', () => {
  assert.equal(prep('clip-short.mp4', 'odd', ['--fps', '7']).status, 0);   // 0.5 s at 7 fps: not a whole number of frames
  for (const name of ['two', 'rot', 'trim', 'odd']) { const m = meta(name); assert.equal(m.duration, Math.round((m.frames / m.fps) * 1000) / 1000, name); }
});

test('without --fit the long side is capped at 1600 px (SPEC §8)', () => {
  const r = prep('clip-2s.mp4', 'full');
  assert.equal(r.status, 0, r.out);
  const m = meta('full');
  assert.equal(Math.max(m.w, m.h), 1600, `${m.w}x${m.h}`);
  assert.ok(Math.abs(m.w / m.h - 1170 / 2532) / (1170 / 2532) < 0.005, `aspect ${m.w / m.h}`);
});

// rotation variants. The mean colour of a frame's top half, as rgb bytes.
const topMean = (jpg) => [...spawnSync('ffmpeg', ['-v', 'error', '-i', jpg, '-vf', 'crop=iw:ih/2:0:0,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 }).stdout];
const bottomMean = (jpg) => [...spawnSync('ffmpeg', ['-v', 'error', '-i', jpg, '-vf', 'crop=iw:ih/2:0:ih/2,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 }).stdout];
const rotated = (deg) => {
  const out = join(work, `rot${deg}.mp4`);
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-display_rotation:v:0', String(deg), '-i', join(CLIPS, 'clip-2s.mp4'), '-c', 'copy', out]).status, 0);
  return out;
};

test('prep honours a -90 display rotation: a portrait clip comes out landscape', () => {
  const r = mm(['media', 'prep', rotated(-90), '--name', 'rotm90', '--piece', work, '--fit', '1430x660']);
  assert.equal(r.status, 0, r.out);
  const m = meta('rotm90');
  assert.ok(m.w > m.h, `${m.w}x${m.h}`);
});

test('prep honours a 180 display rotation: the top half is the upright clip\'s bottom half', () => {
  const r = mm(['media', 'prep', rotated(180), '--name', 'rot180', '--piece', work, '--fit', 'phone']);
  assert.equal(r.status, 0, r.out);
  const m = meta('rot180'), up = meta('two');
  assert.deepEqual([m.w, m.h], [up.w, up.h]);
  const a = topMean(join(work, 'assets', 'rot180', 'f00001.jpg')), b = bottomMean(join(work, 'assets', 'two', 'f00001.jpg')), c = topMean(join(work, 'assets', 'two', 'f00001.jpg'));
  const dist = (p, q) => Math.max(...p.map((v, i) => Math.abs(v - q[i])));
  assert.ok(dist(a, b) < dist(a, c), `rotated top ${a} vs upright bottom ${b}, upright top ${c}`);
});

test('prep makes an HDR (PQ) recording SDR: media.json says so and a PQ white stays white', () => {
  const src = join(work, 'pq.mp4');
  // a white field tagged as PQ BT.2020, as a phone writes its screen recording
  const r0 = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=320x640:d=0.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-bsf:v', 'h264_metadata=colour_primaries=9:transfer_characteristics=16:matrix_coefficients=9', src]);
  assert.equal(r0.status, 0, String(r0.stderr));
  const r = mm(['media', 'prep', src, '--name', 'pq', '--piece', work]);
  assert.equal(r.status, 0, r.out);
  assert.equal(meta('pq').hdr, 'pq to bt709');
  const px = spawnSync('ffmpeg', ['-v', 'error', '-i', join(work, 'assets', 'pq', 'f00001.jpg'), '-vf', 'scale=1:1,format=rgb24', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
  assert.ok(px.stdout[0] > 240, `white came out ${px.stdout[0]}`);
});
