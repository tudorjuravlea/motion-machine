// The finished MP4 is read back with proofs of its own (scripts/lib/export-qa.mjs, SPEC §8): the decoded frame
// count is exactly round(duration x fps) (QA-FRAMES), the frame rate is recognised exactly, 29.97 being
// 30000/1001 and not 30 (QA-FPS), the bitrate is sane for the picture's size (QA-BITRATE), and a frame decoded
// from the file is the frame the page draws cold, within a stated tolerance (QA-DECODE). Real exports of
// fixtures/kit-smoke/film; the broken files are made from the exported MP4 or from ffmpeg's test sources.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, launchBrowser } from '../../scripts/lib/browser.mjs';
import { exportPiece } from '../../scripts/export.mjs';
import { BITRATE_BPP, DECODE_MAE_MAX, bitrateBand, bitrateVerdict, verifyFile } from '../../scripts/lib/export-qa.mjs';

const COPY = join(ROOT, 'fixtures', `.tmp-export-proofs-${process.pid}`);
const PIECE = join(COPY, 'film');
const FPS = 10;
let tmp, browser, good;
const ff = (...args) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const named = (name) => { const dir = join(tmp, name); mkdirSync(dir, { recursive: true }); return join(dir, 'kit-smoke-film-16x9.mp4'); };
const row = (file, id) => file.checks.find((c) => c.id === id);
const check = (file, o = {}) => verifyFile(file, { dir: PIECE, fps: FPS, phase: 'export', sheetBase: join(tmp, `sheet-${Math.random().toString(36).slice(2)}`), browser, ...o });

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'mm-proofs-'));
  cpSync(join(ROOT, 'fixtures', 'kit-smoke'), COPY, { recursive: true, filter: (p) => !p.includes('/out') });
  browser = await launchBrowser();
  const { manifest } = await exportPiece(PIECE, { fps: FPS, formats: ['16x9'], force: true });
  good = manifest.files[0].file;
});
after(async () => { await browser?.close(); rmSync(tmp, { recursive: true, force: true }); rmSync(COPY, { recursive: true, force: true }); });

// ---- the bitrate band ----

test('the bitrate band scales with the picture and the rate, and a verdict names which side it missed', () => {
  const hd = bitrateBand({ width: 1920, height: 1080, fps: 30 });
  const half = bitrateBand({ width: 1920, height: 1080, fps: 15 });
  assert.ok(Math.abs(half.lo * 2 - hd.lo) <= 1 && Math.abs(half.hi * 2 - hd.hi) <= 1, 'half the rate, half the band');
  const tall = bitrateBand({ width: 1080, height: 1920, fps: 30 });
  assert.equal(tall.lo, hd.lo, 'the same number of pixels, the same band');
  assert.ok(bitrateBand({ width: 540, height: 960, fps: 30 }).hi < hd.hi);
  assert.equal(hd.hi, Math.round(1920 * 1080 * 30 * BITRATE_BPP.hi));
  assert.equal(bitrateVerdict((hd.lo + hd.hi) / 2, hd).side, null);
  assert.equal(bitrateVerdict(hd.lo - 1, hd).side, 'low');
  assert.equal(bitrateVerdict(hd.hi + 1, hd).side, 'high');
});

// ---- the real export passes ----

test('a real export passes QA-FRAMES, QA-FPS, QA-BITRATE and QA-DECODE', async () => {
  const r = await check(good);
  for (const id of ['QA-FRAMES', 'QA-FPS', 'QA-BITRATE', 'QA-DECODE']) assert.equal(row(r, id)?.status, 'PASS', `${id}: ${JSON.stringify(row(r, id))}`);
  const frames = row(r, 'QA-FRAMES').evidence;
  assert.equal(frames.decoded, frames.expected);
  assert.equal(frames.declared, frames.decoded, 'the container declares what the decoder finds');
  assert.equal(row(r, 'QA-FPS').evidence.rate, '10/1');
  assert.ok(row(r, 'QA-DECODE').evidence.frames.length >= 2);
  for (const f of row(r, 'QA-DECODE').evidence.frames) assert.ok(f.mae <= DECODE_MAE_MAX, `frame ${f.frame}: ${f.mae}`);
});

// ---- QA-FRAMES ----

test('QA-FRAMES fails a file that is one frame short, and names the count', async () => {
  const short = named('short');
  ff('-i', good, '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-vf', 'select=lt(n\\,' + (Math.round(manifestFrames()) - 1) + ')', '-fps_mode', 'passthrough', short);
  const r = await check(short);
  assert.equal(row(r, 'QA-FRAMES').status, 'FAIL');
  assert.equal(row(r, 'QA-FRAMES').evidence.decoded, row(r, 'QA-FRAMES').evidence.expected - 1);
  assert.match(row(r, 'QA-FRAMES').evidence.reason, /round\(duration/);
});
const manifestFrames = () => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', good], { encoding: 'utf8' });
  return Number(r.stdout.trim());
};

// ---- QA-FPS ----

test('QA-FPS recognises 29.97 as 30000/1001, tells it from 30 and from a rounded 2997/100', async () => {
  const ntsc = named('ntsc');
  ff('-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30000/1001', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30000/1001', ntsc);
  const asked = await check(ntsc, { fps: 29.97 });
  assert.equal(row(asked, 'QA-FPS').status, 'PASS', JSON.stringify(row(asked, 'QA-FPS')));
  assert.equal(row(asked, 'QA-FPS').evidence.name, '29.97');
  assert.equal(row(asked, 'QA-FPS').evidence.rate, '30000/1001');
  const wrong = await check(ntsc, { fps: 30 });
  assert.equal(row(wrong, 'QA-FPS').status, 'FAIL');
  assert.match(row(wrong, 'QA-FPS').evidence.reason, /29\.97/);

  const rounded = named('rounded');
  ff('-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=2997/100', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '2997/100', rounded);
  const r = await check(rounded, { fps: 29.97 });
  assert.equal(row(r, 'QA-FPS').status, 'FAIL', 'a file at 2997/100 is not at the broadcast rate');
});

test('QA-FPS recognises 23.976 and 60, and fails a stream that drops a frame', async () => {
  const f24 = named('f24');
  ff('-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24000/1001', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '24000/1001', f24);
  assert.equal(row(await check(f24, { fps: 23.976 }), 'QA-FPS').status, 'PASS');
  const f60 = named('f60');
  ff('-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=60', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '60', f60);
  const r60 = await check(f60, { fps: 60 });
  assert.equal(row(r60, 'QA-FPS').status, 'PASS');
  assert.equal(row(r60, 'QA-FPS').evidence.name, '60');
  const gap = named('gap');
  ff('-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30', '-t', '3', '-vf', 'select=not(eq(n\\,40))', '-fps_mode', 'passthrough', '-enc_time_base', '1/30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', gap);
  const rg = await check(gap, { fps: 30 });
  assert.equal(row(rg, 'QA-FPS').status, 'FAIL', JSON.stringify(row(rg, 'QA-FPS')));
});

// ---- QA-BITRATE ----

test('QA-BITRATE fails a starved stream and a runaway one', async () => {
  const starved = named('starved');
  ff('-f', 'lavfi', '-i', `color=c=gray:s=1920x1080:r=${FPS}`, '-t', '6', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p', starved);   // one flat grey: next to no bits
  const lo = row(await check(starved), 'QA-BITRATE');
  assert.equal(lo.status, 'FAIL', JSON.stringify(lo));
  assert.match(lo.evidence.reason, /below/);
  const runaway = named('runaway');
  ff('-i', good, '-an', '-vf', 'noise=alls=100:allf=t', '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', '-pix_fmt', 'yuv420p', '-r', String(FPS), runaway);
  const hi = row(await check(runaway), 'QA-BITRATE');
  assert.equal(hi.status, 'FAIL', JSON.stringify(hi));
  assert.match(hi.evidence.reason, /above/);
});

// ---- QA-DECODE ----

test('QA-DECODE fails a file whose frames are not the frames the page draws', async () => {
  const late = named('late');
  ff('-i', good, '-an', '-vf', 'tpad=start=15:color=black', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), late);
  const r = await check(late);
  assert.equal(row(r, 'QA-DECODE').status, 'FAIL', JSON.stringify(row(r, 'QA-DECODE')));
  assert.match(row(r, 'QA-DECODE').evidence.reason, /frame \d+ decoded from the file differs/);
});

test('QA-DECODE is skipped, with its reason, for an export of blended instants and for a file with no piece', async () => {
  const r = await check(good, { sub: 2 });
  assert.equal(row(r, 'QA-DECODE').status, 'SKIP');
  assert.match(row(r, 'QA-DECODE').evidence.reason, /--sub/);
  const alone = await verifyFile(good, { fps: FPS, phase: 'export' });
  assert.equal(row(alone, 'QA-DECODE').status, 'SKIP');
});
