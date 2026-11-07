// The tone pass after a generation: duotone maps luma from the palette's ink to its canvas, palette
// pulls gently toward it, none leaves the picture. Run through the real ffmpeg on a generated test card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finishArgs, toneGraph, toneRecord } from '../../scripts/lib/gen/post.mjs';
import { runFfmpeg } from '../../scripts/lib/ffmpeg.mjs';

const color = { ink: '#23262B', canvas: '#FAFAF7' };
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('toneGraph: none and a style without ink and canvas build nothing; duotone and palette build a graph to [v]', () => {
  assert.equal(toneGraph('none', color), null);
  assert.equal(toneGraph(undefined, color), null);
  assert.equal(toneGraph('duotone', {}), null);
  assert.match(toneGraph('duotone', color), /lutrgb=r='35\+\(250-35\)\*val\/maxval'.*\[v\]$/);
  assert.match(toneGraph('palette', color), /blend=all_mode=normal:all_opacity=0\.25/);
  assert.deepEqual(toneRecord('palette', color), { tone: 'palette', from: '#23262B', to: '#FAFAF7', pull: 0.25 });
  assert.equal(toneRecord('none', color), null);
});

test('finishArgs: a picture is one PNG frame, a clip one H.264 pass that keeps the sound', () => {
  const img = finishArgs({ input: 'a.partial', output: 'a.png', mediaKind: 'image', tone: 'duotone', color });
  assert.ok(img.includes('-frames:v') && img.includes('png') && img.includes('-filter_complex'));
  const vid = finishArgs({ input: 'a.partial', output: 'a.mp4', mediaKind: 'video', tone: 'none', color });
  assert.ok(vid.includes('libx264') && vid.includes('yuv420p') && !vid.includes('-filter_complex'));
});

async function pixels(file) {
  const raw = join(mkdtempSync(join(tmpdir(), 'mm-post-')), 'p.rgb');
  await runFfmpeg(['-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw]);
  return readFileSync(raw);
}

test('duotone through ffmpeg: every pixel lies between ink and canvas; palette keeps more of the original', { skip: !hasFfmpeg }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-post-'));
  const src = join(dir, 'src.png');
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=s=64x64:d=1', '-frames:v', '1', src]);
  const lo = [35, 38, 43], hi = [250, 250, 247];
  const duo = join(dir, 'duo.png');
  await runFfmpeg(finishArgs({ input: src, output: duo, mediaKind: 'image', tone: 'duotone', color }));
  const d = await pixels(duo);
  for (let i = 0; i < d.length; i += 3) {
    for (let c = 0; c < 3; c++) assert.ok(d[i + c] >= lo[c] - 3 && d[i + c] <= hi[c] + 3, `pixel ${i / 3} channel ${c} = ${d[i + c]}`);
  }
  const pal = join(dir, 'pal.png');
  await runFfmpeg(finishArgs({ input: src, output: pal, mediaKind: 'image', tone: 'palette', color }));
  const s = await pixels(src), p = await pixels(pal);
  const spread = (b) => { let max = 0; for (let i = 0; i < b.length; i += 3) max = Math.max(max, Math.abs(b[i] - b[i + 1]), Math.abs(b[i + 1] - b[i + 2])); return max; };
  assert.ok(spread(d) < 12, 'duotone is nearly neutral between two near-neutral colours');
  assert.ok(spread(p) > spread(d), 'palette keeps the picture\'s colours');
  assert.ok(spread(p) < spread(s), 'palette pulls them');
});

test('a clip goes through the tone pass to H.264 yuv420p and keeps its sound', { skip: !hasFfmpeg }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-post-'));
  const src = join(dir, 'src.mp4'), out = join(dir, 'out.mp4');
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=s=64x64:d=1:r=10', '-f', 'lavfi', '-i', 'sine=d=1', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', src]);
  await runFfmpeg(finishArgs({ input: src, output: out, mediaKind: 'video', tone: 'palette', color }));
  const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,pix_fmt', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout;
  assert.match(p, /h264,yuv420p/);
  assert.match(p, /aac/);
});

test('none on a PNG converts only: the picture is the same size', { skip: !hasFfmpeg }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-post-'));
  const src = join(dir, 'src.jpg'), out = join(dir, 'out.png');
  await runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=s=64x48:d=1', '-frames:v', '1', src]);
  await runFfmpeg(finishArgs({ input: src, output: out, mediaKind: 'image', tone: 'none', color }));
  assert.equal(readFileSync(out).subarray(1, 4).toString(), 'PNG');
  writeFileSync(join(dir, 'ok'), '');
});
