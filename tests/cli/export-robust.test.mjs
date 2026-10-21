// The export around the frames. A dead ffmpeg fails the export at once
//, the MP4's bytes do not depend on when frames reach the encoder, an interrupted
// export leaves no MP4 and no process, a multi-format run replaces every file or none
//, and the ordered pool keeps order, bound and failure on its own.
// Every export here is spawned straight from scripts/export.mjs (not through the router, which does
// not forward signals), under a timeout, and killed in after() if it is still alive.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startEncoder } from '../../scripts/lib/ffmpeg.mjs';
import { orderedPool } from '../../scripts/export.mjs';
import { ROOT, stampChecked, workCopy } from './cli-helpers.mjs';

const EXPORT = join(ROOT, 'scripts', 'export.mjs');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const live = new Set();

/** Spawns scripts/export.mjs; resolves { status, signal, stdout, stderr, out }; SIGTERM then SIGKILL past `timeout`. */
function runExport(args, { env, timeout = 90_000, detached = false, onStderr } = {}) {
  const child = spawn(process.execPath, [EXPORT, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached });
  live.add(child);
  let stdout = '', stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; onStderr?.(stderr, child); });
  child.stdout.on('error', () => {}); child.stderr.on('error', () => {});
  const term = setTimeout(() => child.kill('SIGTERM'), timeout);
  const kill = setTimeout(() => child.kill('SIGKILL'), timeout + 5000);
  const started = Date.now();
  const done = new Promise((r) => child.on('exit', (status, signal) => {
    clearTimeout(term); clearTimeout(kill); live.delete(child);
    r({ status, signal, stdout, stderr, out: stdout + stderr, seconds: (Date.now() - started) / 1000 });
  }));
  return Object.assign(done, { child });
}

/** Every descendant pid of `pid`, now. */
function descendants(pid) {
  const kids = (spawnSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' }).stdout ?? '').split('\n').filter(Boolean).map(Number);
  return kids.flatMap((k) => [k, ...descendants(k)]);
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
/** The pids of `pids` still alive after up to `ms`. */
async function survivors(pids, ms = 10_000) {
  const until = Date.now() + ms;
  while (Date.now() < until && pids.some(alive)) await sleep(200);
  return pids.filter(alive);
}

let w;
const mp4sIn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => /\.mp4/.test(f)) : []);
/** { name: sha } of every file in `dir` (one level). */
const snapshot = (dir) => Object.fromEntries(readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => [d.name, sha(readFileSync(join(dir, d.name)))]));

before(() => { w = workCopy('export-robust'); stampChecked(w.deck); });
after(() => {
  for (const c of live) { try { process.kill(c.pid, 'SIGKILL'); } catch { /* gone */ } }
  w?.cleanup();
});

// ---- the encoder (scripts/lib/ffmpeg.mjs) ----

/** `n` frames of ffmpeg's moving test card, as PNG buffers. */
function testCard(n, size = '320x240') {
  const dir = mkdtempSync(join(tmpdir(), 'mm-card-'));
  try {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${size}:r=5`, '-frames:v', String(n), join(dir, 'f%04d.png')]);
    assert.equal(r.status, 0, String(r.stderr));
    return readdirSync(dir).sort().map((f) => readFileSync(join(dir, f)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
/** Runs `fn(encoderOf)` and always kills every encoder it started. */
async function withEncoders(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mm-enc-'));
  const started = [];
  try { return await fn(dir, (opts) => { const e = startEncoder(opts); started.push(e); return e; }); } finally {
    for (const e of started) { try { process.kill(e.pid, 'SIGKILL'); } catch { /* gone */ } }
    rmSync(dir, { recursive: true, force: true });
  }
}
const within = (p, ms) => Promise.race([p.then(() => 'resolved', (e) => e), sleep(ms).then(() => 'still waiting')]);

test('a write after ffmpeg has died rejects at once, and so does end()', () => withEncoders(async (dir, encoder) => {
    const [png] = testCard(1);
    const enc = encoder({ out: join(dir, 'x.mp4'), fps: 10 });
    await enc.write(png);
    process.kill(enc.pid, 'SIGKILL');
    await sleep(300);
    const r = await within(enc.write(png), 3000);
    assert.ok(r instanceof Error, `the write ${r}`);
    assert.match(r.message, /ffmpeg/);
    assert.ok((await within(enc.end(), 3000)) instanceof Error, 'end() rejects too');
}));

test('a write waiting for drain rejects when ffmpeg dies under it', () => withEncoders(async (dir, encoder) => {
    const enc = encoder({ out: join(dir, 'x.mp4'), fps: 10 });
    process.kill(enc.pid, 'SIGSTOP');   // ffmpeg reads nothing, so the pipe fills
    const big = Buffer.alloc(1 << 20, 7);
    let pending = null;
    for (let i = 0; i < 64 && !pending; i++) {
      const p = enc.write(big);
      if ((await within(p, 100)) === 'still waiting') pending = p;
    }
    assert.ok(pending, 'a write waits for drain');
    pending.catch(() => {});
    process.kill(enc.pid, 'SIGKILL');
    const r = await within(pending, 3000);
    assert.ok(r instanceof Error, `the pending write ${r}`);
}));

test('an encoder that cannot open its output fails the next write, carrying ffmpeg\'s error', () => withEncoders(async (dir, encoder) => {
    mkdirSync(join(dir, 'x.mp4'));   // a directory where the file should go
    const frames = testCard(60);
    const enc = encoder({ out: join(dir, 'x.mp4'), fps: 10 });
    const t = Date.now();
    let err = null;
    for (let i = 0; i < 600 && !err && Date.now() - t < 10_000; i++) {
      const r = await within(enc.write(frames[i % frames.length]), 5000);
      if (r instanceof Error) err = r; else assert.equal(r, 'resolved', 'no write hangs');
    }
    assert.ok(err, 'a write rejects');
    assert.match(err.message, /ffmpeg exited/);
}));

test('the MP4\'s bytes do not depend on when frames reach the encoder', async () => {
  // 80 frames is past x264's lookahead, so the muxer sees packets while frames still arrive; without
  // a fixed interleave the chunk tables (stsc/stco) follow the arrival timing even with one worker
  await withEncoders(async (dir, encoder) => {
    const frames = testCard(80);
    const encode = async (name, delay) => {
      const enc = encoder({ out: join(dir, name), fps: 5 });
      for (const [i, f] of frames.entries()) { await enc.write(f); if (delay(i)) await sleep(delay(i)); }
      await enc.end();
      return sha(readFileSync(join(dir, name)));
    };
    const fast = await encode('a.mp4', () => 0);
    const slow = await encode('b.mp4', (i) => (i % 4 === 0 ? 60 : 15));
    assert.equal(slow, fast);
  });
});

// ---- the ordered pool (scripts/export.mjs) ----

test('the ordered pool hands results over in order, holding at most workers + 1', async () => {
  for (const workers of [1, 3, 8]) {
    const taken = [];
    let held = 0, maxHeld = 0;
    await orderedPool({ count: 20, workers,
      run: async (wk, c) => { await sleep(Math.random() * 15); held++; maxHeld = Math.max(maxHeld, held); return `r${c}`; },
      take: async (c, r) => { held--; assert.equal(r, `r${c}`); taken.push(c); await sleep(Math.random() * 5); } });
    assert.deepEqual(taken, Array.from({ length: 20 }, (_, i) => i));
    assert.ok(maxHeld <= workers + 1, `held ${maxHeld} with ${workers} workers`);
  }
  const few = [];
  await orderedPool({ count: 2, workers: 8, run: async (wk, c) => c, take: async (c) => few.push(c) });
  assert.deepEqual(few, [0, 1], 'more workers than jobs');
});

test('a run that throws, or a take that throws, stops every worker and rejects', async () => {
  const started = [];
  await assert.rejects(orderedPool({ count: 30, workers: 3,
    run: async (wk, c) => { started.push(c); await sleep(5); if (c === 4) throw new Error('page 4 broke'); return c; },
    take: async () => {} }), /page 4 broke/);
  assert.ok(Math.max(...started) <= 4 + 3 + 1, `no job far past the failure started (${Math.max(...started)})`);
  let runs = 0;
  await assert.rejects(orderedPool({ count: 30, workers: 3,
    run: async (wk, c) => { runs++; await sleep(2); return c; },
    take: async (c) => { if (c === 2) throw new Error('ffmpeg exited'); } }), /ffmpeg exited/);
  assert.ok(runs <= 2 + 3 + 2, `workers stop once the encoder fails (${runs} runs)`);
  let stops = 0;
  await assert.rejects(orderedPool({ count: 4, workers: 2,
    run: async (wk, c, stopped) => { if (c === 0) throw new Error('x'); await sleep(20); if (stopped()) stops++; return c; },
    take: async () => {} }), /x/);
  assert.ok(stops >= 1, 'a run can see that the pool has stopped');
});

// ---- the export, end to end ----

for (const workers of ['1', '3']) {
  test(`ffmpeg that cannot write its output stops the export at once, nothing left behind (--workers ${workers})`, async () => {
    const copy = workCopy(`export-robust-ff-${workers}`);
    try {
      const out = join(copy.film, 'out');
      mkdirSync(join(out, 'kit-smoke-film-1x1.partial.mp4'), { recursive: true });
      let kids = [];
      const r = await runExport([copy.film, '--force', '--fps', '10', '--formats', '1x1', '--workers', workers], { timeout: 60_000,
        onStderr: (s, child) => { if (!kids.length && /frame 1\//.test(s)) kids = descendants(child.pid); } });
      assert.equal(r.status, 2, r.out);
      assert.ok(r.seconds < 30, `stopped in ${r.seconds} s`);
      assert.match(r.stderr, /ffmpeg exited/);
      assert.deepEqual(readdirSync(out).filter((f) => /\.mp4$/.test(f) && f !== 'kit-smoke-film-1x1.partial.mp4'), []);
      assert.ok(kids.length > 0, 'children were seen');
      assert.deepEqual(await survivors(kids), [], 'no Chromium or ffmpeg outlives the export');
    } finally { copy.cleanup(); }
  });
}

test('the deck walkthrough stops at once when its ffmpeg dies, and leaves no walkthrough', async () => {
  // ffmpeg is killed mid-walkthrough (the walkthrough encodes for about 2 s at 30 fps), as the OOM killer would
  const out = join(w.deck, 'out');
  const run = runExport([w.deck, '--force', '--fps', '30'], { timeout: 60_000 });
  let killed = false;
  for (let i = 0; i < 600 && !killed && live.has(run.child); i++) {
    const pid = (spawnSync('pgrep', ['-f', `ffmpeg.*${w.dir}.*walkthrough`], { encoding: 'utf8' }).stdout ?? '').split('\n').filter(Boolean)[0];
    if (pid) { await sleep(300); try { process.kill(Number(pid), 'SIGKILL'); killed = true; } catch { /* already done */ } } else await sleep(50);
  }
  const r = await run;
  assert.ok(killed, 'the walkthrough encoder was killed while it ran');
  assert.equal(r.status, 2, r.out);
  assert.ok(r.seconds < 40, `stopped in ${r.seconds} s`);
  assert.match(r.stderr, /ffmpeg exited/);
  assert.deepEqual(mp4sIn(out), [], 'no walkthrough, partial or whole');
});

/** Starts the 6 s fixture at 30 fps and resolves once frame 91 is drawn (past x264's lookahead, so ffmpeg has written). */
function exportUntilFrame91(copy, workers, opts = {}) {
  let kids = [], reached;
  const at91 = new Promise((r) => { reached = r; });
  const run = runExport([copy.film, '--force', '--fps', '30', '--formats', '1x1', '--workers', workers], { timeout: 60_000, ...opts,
    onStderr: (s, child) => { if (!kids.length && /frame 91\//.test(s)) { kids = descendants(child.pid); reached(); } } });
  return { run, at91: Promise.race([at91, run]), kids: () => kids };
}

test('Ctrl-C (SIGINT to the process group) removes the partial MP4, closes everything, exits 130', async () => {
  const copy = workCopy('export-robust-int');
  try {
    const e = exportUntilFrame91(copy, '1', { detached: true });
    await e.at91;
    process.kill(-e.run.child.pid, 'SIGINT');   // the terminal signals the group: ffmpeg gets it too
    const r = await e.run;
    assert.equal(r.status, 130, r.out);
    assert.deepEqual(mp4sIn(join(copy.film, 'out')), []);
    assert.deepEqual(await survivors(e.kids()), []);
  } finally { copy.cleanup(); }
});

test('SIGTERM to the export removes the partial MP4, closes everything, exits 143', async () => {
  const copy = workCopy('export-robust-term');
  try {
    const e = exportUntilFrame91(copy, '3');
    await e.at91;
    e.run.child.kill('SIGTERM');
    const r = await e.run;
    assert.equal(r.status, 143, r.out);
    assert.deepEqual(mp4sIn(join(copy.film, 'out')), []);
    assert.deepEqual(await survivors(e.kids()), []);
  } finally { copy.cleanup(); }
});

test('a closed output pipe (| head) removes the partial MP4, closes everything, exits 141', async () => {
  const copy = workCopy('export-robust-pipe');
  try {
    const e = exportUntilFrame91(copy, '3');
    await e.at91;
    e.run.child.stderr.destroy();
    e.run.child.stdout.destroy();
    const r = await e.run;
    assert.equal(r.status, 141, `exit ${r.status} ${r.signal}`);
    assert.deepEqual(mp4sIn(join(copy.film, 'out')), []);
    assert.deepEqual(await survivors(e.kids()), []);
  } finally { copy.cleanup(); }
});

test('a run that fails in a later format, or names an unknown one, changes nothing in out/', async () => {
  const copy = workCopy('export-robust-atomic');
  try {
    const file = join(copy.film, 'story.json');
    const story = JSON.parse(readFileSync(file, 'utf8'));
    for (const sc of story.scenes) sc.duration = 1;
    writeFileSync(file, JSON.stringify(story, null, 2));
    const good = await runExport([copy.film, '--force', '--fps', '10', '--formats', '1x1,16x9', '--workers', '2', '--gif']);
    assert.equal(good.status, 0, good.out);
    const out = join(copy.film, 'out');
    const before = snapshot(out);
    assert.ok(before['kit-smoke-film-1x1.mp4'] && before['export.json'] && before['poster.png'] && before['loop_check.mp4']);
    // edit the words, so every new file would differ from the old one
    const beat = story.scenes[0].beats.find((b) => b.text);
    beat.text = `${beat.text} (edited)`;
    story.share = 'An edited caption.';
    writeFileSync(file, JSON.stringify(story, null, 2));
    const failed = await runExport([copy.film, '--force', '--fps', '10', '--formats', '1x1,16x9', '--workers', '2', '--gif'], { env: { MM_EXPORT_FAIL_FRAME: '16x9:5' } });
    assert.equal(failed.status, 2, failed.out);
    assert.match(failed.stderr, /frame 5 of 16x9/);
    assert.deepEqual(snapshot(out), before, 'every previous file is still there, unchanged, and nothing new');
    const unknown = await runExport([copy.film, '--force', '--fps', '10', '--formats', '1x1,4x4']);
    assert.equal(unknown.status, 2, unknown.out);
    assert.match(unknown.stderr, /unknown format 4x4/);
    assert.deepEqual(snapshot(out), before);
  } finally { copy.cleanup(); }
});

test('--workers must be a whole number of at least 1', async () => {
  for (const bad of ['abc', '0', '-2', '1.5', '1e1']) {
    const r = await runExport([w.film, '--force', `--workers=${bad}`]);
    assert.equal(r.status, 2, `${bad}: ${r.out}`);
    assert.match(r.stderr, /--workers must be a whole number of at least 1/, bad);
  }
});
