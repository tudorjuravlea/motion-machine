// A brand's .cube grade on the pictures it brings: the reader (scripts/lib/cube.mjs), stills through
// `mm media grade` and footage through `mm media prep --cube`. The grades are written here: an identity,
// and a swap of red and blue that no rounding can hide.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, mm } from './cli-helpers.mjs';
import { readCube, cubeStrength } from '../../scripts/lib/cube.mjs';

const work = join(ROOT, `.tmp-cli-grade-${process.pid}`);
const N = 9;
function cubeText(f, size = N) {
  const rows = [];
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) rows.push(f(r / (size - 1), g / (size - 1), b / (size - 1)).map((x) => x.toFixed(6)).join(' '));
  return `# written by the test\nTITLE "t"\nLUT_3D_SIZE ${size}\n${rows.join('\n')}\n`;
}
const ff = (args) => spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
/** The RGBA of the pixel at (x, y) of a picture or a frame, as ffmpeg decodes it. */
function pixel(file, x = 10, y = 10) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `format=rgba,crop=2:2:${x}:${y}`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
  return [...r.stdout.subarray(0, 4)];
}
const near = (a, b, tol, what) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= tol, `${what}: ${a} against ${b}`));
const graded = (args) => mm(['media', 'grade', ...args]);

before(() => {
  rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  writeFileSync(join(work, 'identity.cube'), cubeText((r, g, b) => [r, g, b]));
  writeFileSync(join(work, 'swap.cube'), cubeText((r, g, b) => [b, g, r]));
  assert.equal(ff(['-f', 'lavfi', '-i', 'color=c=0xC83232@0.5:size=64x48,format=rgba', '-frames:v', '1', '-update', '1', join(work, 'red.png')]).status, 0);
  assert.equal(ff(['-f', 'lavfi', '-i', 'color=c=0xC83232:size=320x240:rate=30:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', join(work, 'red.mp4')]).status, 0);
});
after(() => rmSync(work, { recursive: true, force: true }));

test('the reader takes a 3D table, its title and its size; the identity moves nothing and the swap moves a channel the whole way', () => {
  const id = readCube(cubeText((r, g, b) => [r, g, b]));
  assert.equal(id.size, N); assert.equal(id.title, 't'); assert.equal(id.table.length, N ** 3);
  assert.deepEqual(cubeStrength(id), { max: 0, mean: 0 });
  assert.equal(cubeStrength(readCube(cubeText((r, g, b) => [b, g, r]))).max, 1);
});

test('the reader names the line of a broken grade', () => {
  assert.throws(() => readCube('LUT_1D_SIZE 4\n'), /:1: a 1D table/);
  assert.throws(() => readCube('LUT_3D_SIZE 99\n'), /LUT_3D_SIZE must be a whole number from 2 to 65/);
  assert.throws(() => readCube('LUT_3D_SIZE 2\n0 0 0\n1 x 0\n'), /:3: a table row must be three numbers/);
  assert.throws(() => readCube('LUT_3D_SIZE 2\n0 0 0\n'), /needs 8 rows, found 1/);
  assert.throws(() => readCube('0 0 0\n'), /a table row before LUT_3D_SIZE/);
  assert.throws(() => readCube(`DOMAIN_MIN 1 0 0\nDOMAIN_MAX 0 1 1\n${cubeText((r, g, b) => [r, g, b], 2)}`), /DOMAIN_MIN must lie below DOMAIN_MAX/);
});

test('media grade: the identity writes the still back unchanged, transparency kept, with its record', () => {
  const r = graded([join(work, 'red.png'), '--name', 'same', '--cube', join(work, 'identity.cube'), '--piece', work]);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(pixel(join(work, 'assets', 'same.png')), [200, 50, 50, 127]);
  const rec = JSON.parse(readFileSync(join(work, 'assets', 'same.grade.json'), 'utf8'));
  assert.equal(rec.kind, 'graded still'); assert.equal(rec.w, 64); assert.equal(rec.h, 48);
  assert.equal(rec.source.file, 'red.png'); assert.match(rec.source.sha1, /^[0-9a-f]{40}$/);
  assert.equal(rec.grade.file, 'identity.cube'); assert.equal(rec.grade.size, N); assert.deepEqual(rec.grade.strength, { max: 0, mean: 0 });
  assert.match(r.out, /no licence record beside the source/);
});

test('media grade: the swap turns red to blue, and the source\'s licence record travels', () => {
  writeFileSync(join(work, 'red.licence.json'), '{"licence":"own"}\n');
  const r = graded([join(work, 'red.png'), '--name', 'blue', '--cube', join(work, 'swap.cube'), '--piece', work]);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(pixel(join(work, 'assets', 'blue.png')), [50, 50, 200, 127]);
  assert.equal(readFileSync(join(work, 'assets', 'blue.licence.json'), 'utf8'), '{"licence":"own"}\n');
  rmSync(join(work, 'red.licence.json'));
});

test('media grade refuses a moving picture, a missing --cube, a file that is not a .cube, and a broken grade, writing nothing', () => {
  let r = graded([join(work, 'red.mp4'), '--name', 'moving', '--cube', join(work, 'swap.cube'), '--piece', work]);
  assert.equal(r.status, 2); assert.match(r.out, /moving picture: grade footage with mm media prep --cube/);
  r = graded([join(work, 'red.png'), '--name', 'x', '--piece', work]);
  assert.equal(r.status, 2); assert.match(r.out, /mm media grade/);
  r = graded([join(work, 'red.png'), '--name', 'x', '--cube', join(work, 'red.png'), '--piece', work]);
  assert.equal(r.status, 2); assert.match(r.out, /a grade is a \.cube file/);
  writeFileSync(join(work, 'broken.cube'), 'LUT_3D_SIZE 3\n0 0 0\n');
  r = graded([join(work, 'red.png'), '--name', 'x', '--cube', join(work, 'broken.cube'), '--piece', work]);
  assert.equal(r.status, 2); assert.match(r.out, /broken\.cube: LUT_3D_SIZE 3 needs 27 rows, found 1/);
  assert.ok(!existsSync(join(work, 'assets', 'x.png')) && !existsSync(join(work, 'assets', 'moving.png')));
});

test('media prep keeps a BT.709 recording\'s red, graded with the identity or not, and --cube swaps it on every frame', () => {
  const prep = (name, extra) => mm(['media', 'prep', join(work, 'red.mp4'), '--name', name, '--piece', work, ...extra]);
  for (const [name, extra] of [['plain', []], ['ident', ['--cube', join(work, 'identity.cube')]], ['swap', ['--cube', join(work, 'swap.cube')]]]) {
    const r = prep(name, extra);
    assert.equal(r.status, 0, r.out);
  }
  near(pixel(join(work, 'assets', 'plain', 'f00001.jpg'), 100, 100).slice(0, 3), [200, 50, 50], 4, 'plain prep');
  near(pixel(join(work, 'assets', 'ident', 'f00001.jpg'), 100, 100).slice(0, 3), [200, 50, 50], 4, 'identity grade');
  near(pixel(join(work, 'assets', 'swap', 'f00030.jpg'), 100, 100).slice(0, 3), [50, 50, 200], 4, 'swap grade');
  const m = JSON.parse(readFileSync(join(work, 'assets', 'swap', 'media.json'), 'utf8'));
  assert.equal(m.grade.file, 'swap.cube'); assert.equal(m.grade.strength.max, 1);
  assert.equal(JSON.parse(readFileSync(join(work, 'assets', 'plain', 'media.json'), 'utf8')).grade, undefined);
});

test('media prep with a broken grade exits 2 before the old asset is touched', () => {
  writeFileSync(join(work, 'bad.cube'), 'LUT_1D_SIZE 2\n');
  const r = mm(['media', 'prep', join(work, 'red.mp4'), '--name', 'plain', '--piece', work, '--cube', join(work, 'bad.cube')]);
  assert.equal(r.status, 2); assert.match(r.out, /a 1D table/);
  assert.ok(existsSync(join(work, 'assets', 'plain', 'f00001.jpg')));
});
