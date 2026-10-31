// `mm footage matte` on the synthetic fixture (fixtures/footage/make-matte.sh: a red disc travelling
// over grey, and supplied masks of the same disc with one frame planted empty): one grey mask per frame
// beside the frames, recorded in media.json; the planted drop-out is filled by the temporal median; the
// edge is feathered; two runs write the same bytes; missing masks, an unprepared folder and a machine
// without the Vision engine are usage errors that say what to do. The Vision path runs only on macOS
// with swiftc (it finds no person in the disc and still writes a mask for every frame).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, mm, readJson } from './cli-helpers.mjs';

const TMP = join(ROOT, `.tmp-footage-matte-${process.pid}`);
const VIDEO = join(TMP, 'shape.mp4');
const MASKS = join(TMP, 'masks');
const W = 640, H = 360, FRAMES = 120;
const swift = process.platform === 'darwin' && spawnSync('swiftc', ['--version']).status === 0;

function piece(name) {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  const r = mm(['media', 'prep', VIDEO, '--name', 'shape', '--piece', dir]);
  assert.equal(r.status, 0, r.out);
  return dir;
}
function grey(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 16 << 20 });
  assert.equal(r.status, 0, String(r.stderr));
  return r.stdout;
}
const centreX = (i) => Math.round(230 + 45 * i / 30);
const hashDir = (dir) => {
  const h = createHash('sha1');
  for (const f of readdirSync(dir).sort()) h.update(f).update(readFileSync(join(dir, f)));
  return h.digest('hex');
};

let dir;
before(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const r = spawnSync('sh', [join(ROOT, 'fixtures/footage/make-matte.sh'), TMP], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  dir = piece('masks');
  const m = mm(['footage', 'matte', '--name', 'shape', '--piece', dir, '--masks', MASKS]);
  assert.equal(m.status, 0, m.out);
});
after(() => rmSync(TMP, { recursive: true, force: true }));

test('supplied masks become one grey mask per frame in assets/<n>/matte/, recorded in media.json', () => {
  const matte = join(dir, 'assets/shape/matte');
  const files = readdirSync(matte).sort();
  assert.equal(files.length, FRAMES);
  assert.equal(files[0], 'f00001.png');
  assert.equal(files.at(-1), `f${String(FRAMES).padStart(5, '0')}.png`);
  const meta = readJson(join(dir, 'assets/shape/media.json'));
  assert.equal(meta.kind, 'sequence');
  assert.deepEqual(meta.matte, { dir: 'matte/', frames: FRAMES, from: 'masks', median: 3, feather: 3, face: 'face.json' });
  // the head of every frame, shares of the recording: the disc (radius 60 of 640x360, centre y 110) and not the torso bar
  const face = readJson(join(dir, 'assets/shape', meta.matte.face));
  assert.equal(face.boxes.length, FRAMES);
  const [x0, y0, x1, y1] = face.boxes[60];
  assert.ok(Math.abs(y0 - 50 / 360) < 0.02 && Math.abs(y1 - 170 / 360) < 0.03, `head rows ${y0}..${y1}`);
  assert.ok(Math.abs((x1 - x0) - 120 / 640) < 0.02, `head width ${x1 - x0}`);
  const px = grey(join(matte, 'f00061.png'));
  assert.equal(px.length, W * H, 'each mask is the frame size');
  assert.ok(px[110 * W + centreX(60)] >= 250, 'the disc is white');
  assert.equal(px[10 * W + 10], 0, 'a far corner is black');
});

test('the frame planted empty is filled by the median of its neighbours', () => {
  const px = grey(join(dir, 'assets/shape/matte/f00040.png'));
  assert.ok(px[110 * W + centreX(39)] >= 250, `centre ${px[110 * W + centreX(39)]}`);
});

test('the edge is a short ramp, not a step', () => {
  const px = grey(join(dir, 'assets/shape/matte/f00061.png'));
  const row = [...px.subarray(110 * W, 111 * W)];
  const right = centreX(60) + 60;
  const soft = row.slice(right - 15, right + 15).filter((v) => v > 0 && v < 255).length;
  assert.ok(soft >= 6 && soft <= 14, `${soft} soft pixels across the disc's right edge (feather 3)`);
});

test('two runs write the same masks, byte for byte', () => {
  const first = hashDir(join(dir, 'assets/shape/matte'));
  const r = mm(['footage', 'matte', '--name', 'shape', '--piece', dir, '--masks', MASKS]);
  assert.equal(r.status, 0, r.out);
  assert.equal(hashDir(join(dir, 'assets/shape/matte')), first);
});

test('usage: an unprepared folder, a missing mask, a bad flag, and no engine without --masks', () => {
  let r = mm(['footage', 'matte', '--name', 'none', '--piece', dir, '--masks', MASKS]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /mm media prep/);
  const holes = join(TMP, 'holes');
  cpSync(MASKS, holes, { recursive: true });
  unlinkSync(join(holes, 'f00057.png'));
  r = mm(['footage', 'matte', '--name', 'shape', '--piece', dir, '--masks', holes]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /f00057/);
  r = mm(['footage', 'matte', '--name', 'shape', '--piece', dir, '--masks', MASKS, '--quality', 'best']);
  assert.equal(r.status, 2, r.out);
  r = mm(['footage', 'matte', '--name', 'shape', '--piece', dir, '--masks', MASKS, '--feather', '-1']);
  assert.equal(r.status, 2, r.out);
  // a PATH that holds ffmpeg and ffprobe but no swiftc: the machine has no Vision engine
  const bin = join(TMP, 'bin');
  mkdirSync(bin, { recursive: true });
  for (const tool of ['ffmpeg', 'ffprobe']) {
    const where = spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).stdout.trim();
    if (!existsSync(join(bin, tool))) symlinkSync(where, join(bin, tool));
  }
  r = mm(['footage', 'matte', '--name', 'shape', '--piece', dir], { env: { PATH: bin } });
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /--masks <dir>/);
});

test('the Vision engine (macOS with swiftc): compiled once into the piece\'s out/, a mask for every frame, the same bytes twice', { skip: !swift && 'needs macOS with swiftc' }, () => {
  const v = piece('vision');
  let r = mm(['footage', 'matte', '--name', 'shape', '--piece', v, '--quality', 'balanced'], { timeout: 300_000 });
  assert.equal(r.status, 0, r.out);
  const bins = readdirSync(join(v, 'out')).filter((f) => f.startsWith('segment-'));
  assert.equal(bins.length, 1, `one compiled helper in out/: ${bins}`);
  const built = statSync(join(v, 'out', bins[0])).mtimeMs;
  const matte = join(v, 'assets/shape/matte');
  assert.equal(readdirSync(matte).length, FRAMES);
  const meta = readJson(join(v, 'assets/shape/media.json'));
  assert.equal(meta.matte.from, 'vision');
  assert.equal(meta.matte.quality, 'balanced');
  const px = grey(join(matte, 'f00061.png'));
  const mean = px.reduce((a, b) => a + b, 0) / px.length;
  assert.ok(mean < 20, `a disc is not a person: mean ${mean.toFixed(1)}`);
  const first = hashDir(matte);
  r = mm(['footage', 'matte', '--name', 'shape', '--piece', v, '--quality', 'balanced'], { timeout: 300_000 });
  assert.equal(r.status, 0, r.out);
  assert.equal(hashDir(matte), first);
  assert.equal(statSync(join(v, 'out', bins[0])).mtimeMs, built, 'the helper is not compiled again');
});
