// Parallel capture is proved, not trusted. A 3 s copy of fixtures/kit-smoke's
// film is exported with --workers 1 and --workers 3. What must be identical, and is compared:
//   - the per-frame SHA-256 list of the PNGs (collected through the exporter's MM_EXPORT_HASHES hook);
//   - the encoded streams (ffmpeg's streamhash of every stream, video and the silent audio);
//   - the MP4's bytes. These follow from the frames only because the encoder's mux does not depend
//     on when frames arrive (-max_interleave_delta 0); that property is proved on its own, on a
//     film longer than x264's lookahead fed at two speeds, in export-robust.test.mjs.
// A worker forced to throw (MM_EXPORT_FAIL_FRAME) stops the export non-zero and leaves no MP4.
// Every export is spawned straight from scripts/export.mjs under a timeout and killed in after().
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readJson, workCopy } from './cli-helpers.mjs';

const EXPORT = join(ROOT, 'scripts', 'export.mjs');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const live = new Set();

/** Spawns scripts/export.mjs; resolves { status, stdout, stderr, out }; SIGTERM then SIGKILL past `timeout`. */
function runExport(args, { env, timeout = 170_000 } = {}) {
  const child = spawn(process.execPath, [EXPORT, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  live.add(child);
  let stdout = '', stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });
  const term = setTimeout(() => child.kill('SIGTERM'), timeout);
  const kill = setTimeout(() => child.kill('SIGKILL'), timeout + 5000);
  return new Promise((r) => child.on('close', (status) => {
    clearTimeout(term); clearTimeout(kill); live.delete(child);
    r({ status, stdout, stderr, out: stdout + stderr });
  }));
}

/** ffmpeg's SHA-256 of each stream's packets: "0,v,SHA256=…\n1,a,SHA256=…". */
const streamHash = (file) => spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0', '-f', 'streamhash', '-hash', 'sha256', '-'], { encoding: 'utf8' }).stdout.trim();

let w;
before(() => {
  w = workCopy('export-workers');
  // the fixture's film is 6 s; two 1.5 s scenes keep it under 3 s with every beat still inside
  const file = join(w.film, 'story.json');
  const story = JSON.parse(readFileSync(file, 'utf8'));
  for (const sc of story.scenes) sc.duration = 1.5;
  writeFileSync(file, JSON.stringify(story, null, 2));
});
after(() => {
  for (const c of live) { try { process.kill(c.pid, 'SIGKILL'); } catch { /* gone */ } }
  w?.cleanup();
});

const mp4 = (format) => join(w.film, 'out', `kit-smoke-film-${format}.mp4`);

/** Exports with `args` and the hash hook on; returns { hashes: {format: [sha]}, mp4: {format: sha}, streams: {format: hash}, manifest }. */
async function exportWith(args, formats = ['1x1']) {
  const hashFile = join(w.dir, `hashes-${Math.random().toString(36).slice(2)}.json`);
  const r = await runExport([w.film, '--fps', '10', '--formats', formats.join(','), '--force', ...args], { env: { MM_EXPORT_HASHES: hashFile } });
  assert.equal(r.status, 0, r.out);
  const hashes = readJson(hashFile);
  rmSync(hashFile);
  return { hashes, mp4: Object.fromEntries(formats.map((f) => [f, sha(readFileSync(mp4(f)))])), streams: Object.fromEntries(formats.map((f) => [f, streamHash(mp4(f))])),
    manifest: readJson(join(w.film, 'out', 'export.json')), r };
}

test('--workers 1 and --workers 3 draw the same frames, in order, and encode the same streams and MP4', async () => {
  const one = await exportWith(['--workers', '1']);
  const three = await exportWith(['--workers', '3']);
  assert.equal(one.hashes['1x1'].length, 30, '3 s at 10 fps');
  assert.equal(new Set(one.hashes['1x1']).size > 1, true, 'the film moves');
  assert.deepEqual(three.hashes['1x1'], one.hashes['1x1']);
  assert.match(one.streams['1x1'], /0,v,SHA256=\w+\n1,a,SHA256=\w+/);
  assert.equal(three.streams['1x1'], one.streams['1x1']);
  assert.equal(three.mp4['1x1'], one.mp4['1x1']);
  assert.equal(one.manifest.workers, 1);
  assert.equal(three.manifest.workers, 3);
  assert.equal(one.manifest.files[0].pages, 1, 'the pages that drew are recorded');
  assert.equal(three.manifest.files[0].pages, 3);
  assert.ok(three.manifest.captureS > 0, 'capture seconds are recorded');
  assert.ok(three.manifest.files[0].captureS > 0);
});

test('--sub 3 with three workers keeps every instant in order: same frames, same streams, same MP4', async () => {
  const one = await exportWith(['--workers', '1', '--sub', '3']);
  const three = await exportWith(['--workers', '3', '--sub', '3']);
  assert.equal(one.hashes['1x1'].length, 30);
  assert.deepEqual(three.hashes['1x1'], one.hashes['1x1']);
  assert.equal(three.streams['1x1'], one.streams['1x1']);
  assert.equal(three.mp4['1x1'], one.mp4['1x1']);
});

test('three workers with two formats, --gif and --prove: every format proved, every GIF written', async () => {
  const { manifest, r } = await exportWith(['--workers', '3', '--gif', '--prove'], ['16x9', '1x1']);
  assert.match(r.stdout, /prove ok \(16x9\)/);
  assert.match(r.stdout, /prove ok \(1x1\)/);
  assert.equal(manifest.proved, true);
  assert.equal(manifest.gifs.length, 2);
  assert.ok(existsSync(join(w.film, 'out', 'poster.png')));
  assert.deepEqual(readdirSync(join(w.film, 'out')).filter((f) => f.includes('.partial')), [], 'nothing staged is left');
});

test('the default is max(1, min(4, floor(cpus / 2))) workers', async () => {
  const { manifest } = await exportWith([]);
  const cap = Number(process.env.MM_WORKERS) || Infinity;   // a suite run may cap the default (MM_WORKERS)
  assert.equal(manifest.workers, Math.min(cap, Math.max(1, Math.min(4, Math.floor(cpus().length / 2)))));
  const bad = await runExport([w.film, '--workers', '0', '--force']);
  assert.equal(bad.status, 2, bad.out);
  assert.match(bad.stderr, /--workers/);
});

test('--workers above 16 draws in 16 pages at most, and export.json says what was asked', async () => {
  const { manifest, r } = await exportWith(['--workers', '200']);
  assert.equal(manifest.workers, 16);
  assert.equal(manifest.workersRequested, 200);
  assert.ok(manifest.files[0].pages <= 16, `${manifest.files[0].pages} pages`);
  assert.match(r.stderr, /at most/);
});

for (const workers of ['3', '1']) {
  test(`a worker that throws stops the export non-zero and leaves no MP4 (--workers ${workers})`, async () => {
    // the fixture's own 6 s film at 30 fps, failing on its last frame: by then the encoder has written
    // to disk (x264's lookahead holds about 50 frames), so a file left behind would be seen
    const copy = workCopy(`export-workers-fail-${workers}`);
    try {
      const r = await runExport([copy.film, '--fps', '30', '--formats', '1x1', '--force', '--workers', workers], { env: { MM_EXPORT_FAIL_FRAME: '179' } });
      assert.notEqual(r.status, 0, r.out);
      assert.match(r.stderr, /frame 179/);
      const out = join(copy.film, 'out');
      const left = existsSync(out) ? readdirSync(out).filter((f) => /\.mp4/.test(f)) : [];
      assert.deepEqual(left, [], 'no MP4, partial or temporary, is left');
    } finally { copy.cleanup(); }
  });
}

test('chunked capture meets recordings and device screens on any runner (device film, 3 pages, --prove)', async () => {
  // the golden --prove tests use the default worker count, which is 1 on a 2-core runner; this forces
  // three pages, each seeking into the middle of the film, against --prove's fresh page drawing in reverse
  const piece = join(ROOT, 'fixtures/device-film');
  if (!existsSync(join(piece, 'assets/site-laptop/media.json'))) assert.equal(spawnSync('sh', [join(piece, 'make-assets.sh')], { encoding: 'utf8' }).status, 0, 'make-assets.sh failed');
  const copy = join(ROOT, 'fixtures', `.tmp-workers-device-${process.pid}`);   // same depth as the piece, so its kit import resolves
  rmSync(copy, { recursive: true, force: true });
  cpSync(piece, copy, { recursive: true, filter: (p) => !p.includes('/out') });
  try {
    const r = await runExport([copy, '--fps', '1', '--formats', '9x16', '--workers', '3', '--prove', '--force']);
    assert.equal(r.status, 0, r.out.slice(-3000));
    assert.match(r.stdout, /prove ok \(9x16\)/);
    const manifest = readJson(join(copy, 'out', 'export.json'));
    assert.equal(manifest.files[0].pages, 3);
  } finally { rmSync(copy, { recursive: true, force: true }); }
});
