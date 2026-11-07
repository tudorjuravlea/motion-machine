// The gate an export trusts is the gate of the story it renders. `mm check` records
// the story version and the formats it checked, writes its report whole or not at all (an
// interrupted gate leaves the previous report), and `mm export` refuses a report that is
// unfinished, of another story version or short of a format it is asked for. One
// export of a piece at a time, across processes: out/export.lock, which `mm sound` takes too,
// and which a dead holder does not keep. A story that changes during the render replaces nothing.
// The poster is a frame of the story's first format, so a subset without it leaves it alone.
// Every child runs under a timeout and is killed in after() if still alive.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gateStatus } from '../../scripts/export.mjs';
import { versionOf } from '../../scripts/lib/story-version.mjs';
import { MM, mm, probeVideo, readJson, stampChecked, workCopy } from './cli-helpers.mjs';

const live = new Set();
/** `mm <args>` as a child; resolves { status, stdout, stderr, out }; SIGTERM, then SIGKILL, past `timeout`. */
function run(args, { timeout = 120_000, onStderr, env } = {}) {
  const child = spawn(process.execPath, [MM, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  live.add(child);
  let stdout = '', stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; onStderr?.(stderr, child); });
  const term = setTimeout(() => child.kill('SIGTERM'), timeout);
  const kill = setTimeout(() => child.kill('SIGKILL'), timeout + 5000);
  return Object.assign(new Promise((ok) => child.on('exit', (status, signal) => {
    clearTimeout(term); clearTimeout(kill); live.delete(child);
    ok({ status, signal, stdout, stderr, out: stdout + stderr });
  })), { child });
}

let w;
before(() => { w = workCopy('export-gate'); });
after(() => { for (const c of live) c.kill('SIGKILL'); w?.cleanup(); });

const storyFile = (dir) => join(dir, 'story.json');
const report = (dir, fields) => { mkdirSync(join(dir, 'out'), { recursive: true }); writeFileSync(join(dir, 'out', 'check.json'), JSON.stringify({ spec: '0.11', rules: [{ id: 'G-TEST', status: 'PASS', evidence: {} }], ...fields })); };

test('gateStatus refuses an unfinished report, another story version, an unversioned report, and a report short of a format', () => {
  const dir = w.film, version = versionOf(readFileSync(storyFile(dir), 'utf8'));
  const all = ['16x9', '9x16', '1x1'];
  report(dir, { version, formats: all, complete: true });
  assert.deepEqual(gateStatus(dir, { version, formats: all }), { ok: true });
  report(dir, { version, formats: all, complete: false });
  assert.match(gateStatus(dir, { version, formats: all }).why, /did not finish/);
  report(dir, { version: '0123456789abcdef', formats: all, complete: true });
  assert.match(gateStatus(dir, { version, formats: all }).why, /story\.json changed since/);
  report(dir, { formats: all, complete: true });
  assert.match(gateStatus(dir, { version, formats: all }).why, /does not say which story/);
  report(dir, { version, formats: ['16x9'], complete: true });
  assert.deepEqual(gateStatus(dir, { version, formats: ['16x9'] }), { ok: true });
  assert.match(gateStatus(dir, { version, formats: ['16x9', '9x16'] }).why, /does not cover 9x16/);
});

test('mm check writes the story version, the formats it checked and complete: true', async () => {
  const r = await run(['check', w.film, '--format', '16x9', '--quiet']);
  assert.ok([0, 1].includes(r.status), r.out);
  const rep = readJson(join(w.film, 'out', 'check.json'));
  assert.equal(rep.version, versionOf(readFileSync(storyFile(w.film), 'utf8')));
  assert.deepEqual(rep.formats, ['16x9']);
  assert.equal(rep.complete, true);
});

test('SIGTERM during mm check writes no report: the previous out/check.json is left byte for byte, exit 143', async () => {
  const file = join(w.film, 'out', 'check.json');
  writeFileSync(file, '{"sentinel": true}\n');
  let sent = false;
  const r = await run(['check', w.film, '--quiet', '--progress'], {
    onStderr: (err, child) => { if (!sent && /\(1\/3\): G-/.test(err)) { sent = true; child.kill('SIGTERM'); } },
  });
  assert.ok(sent, `no progress line before the end: ${r.out}`);
  assert.equal(r.status, 143, r.out);
  assert.equal(readFileSync(file, 'utf8'), '{"sentinel": true}\n', 'the report the gate found is kept');
  assert.ok(!readdirSync(join(w.film, 'out')).some((f) => f.includes('.tmp')), 'no temporary report left');
});

test('mm export refuses a report of an older story or of fewer formats; --force stamps UNCHECKED', async () => {
  const copy = workCopy('export-gate-stale');
  try {
    stampChecked(copy.film);
    writeFileSync(storyFile(copy.film), readFileSync(storyFile(copy.film), 'utf8').replace('"title": "', '"title": "Edited '));
    let r = await run(['export', copy.film, '--fps', '4', '--formats', '16x9']);
    assert.equal(r.status, 1, r.out);
    assert.match(r.stderr, /story\.json changed since mm check/);
    stampChecked(copy.film, 'PASS', ['16x9']);
    r = await run(['export', copy.film, '--fps', '4', '--formats', '9x16']);
    assert.equal(r.status, 1, r.out);
    assert.match(r.stderr, /does not cover 9x16/);
    assert.ok(!readdirSync(join(copy.film, 'out')).some((f) => f.endsWith('.mp4')), 'nothing rendered');
  } finally { copy.cleanup(); }
});

test('a live export lock refuses mm export and mm sound in one line (exit 2, no stack); a dead holder\'s lock is broken', async () => {
  const copy = workCopy('export-gate-lock');
  try {
    stampChecked(copy.film);
    const lock = join(copy.film, 'out', 'export.lock');
    writeFileSync(lock, JSON.stringify({ pid: process.pid, by: 'mm studio', at: new Date().toISOString(), nonce: 'abc' }));
    for (const args of [['export', copy.film, '--fps', '4', '--formats', '16x9'], ['sound', copy.film]]) {
      const r = await run(args);
      assert.equal(r.status, 2, r.out);
      assert.match(r.stderr, /an export of this piece is running \(mm studio, pid \d+\)/);
      assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack');
    }
    // 9x16 alone is not the story's first format (16x9), so no poster and no loop check
    writeFileSync(lock, JSON.stringify({ pid: 2 ** 22 + 12345, by: 'mm export', at: new Date().toISOString(), nonce: 'dead' }));
    const r = await run(['export', copy.film, '--fps', '4', '--formats', '9x16']);
    assert.equal(r.status, 0, r.out);
    assert.ok(!existsSync(lock), 'the lock is released after the run');
    assert.ok(existsSync(join(copy.film, 'out', 'kit-smoke-film-9x16.mp4')));
    assert.ok(!existsSync(join(copy.film, 'out', 'poster.png')), 'no poster from a format that is not the story\'s first');
    assert.ok(!existsSync(join(copy.film, 'out', 'loop_check.mp4')));
    assert.equal(readJson(join(copy.film, 'out', 'export.json')).version, versionOf(readFileSync(storyFile(copy.film), 'utf8')));
  } finally { copy.cleanup(); }
});

test('a story that changes during the render replaces nothing and says why (exit 1)', async () => {
  const copy = workCopy('export-gate-moved');
  try {
    stampChecked(copy.film);
    let edited = false;
    const r = await run(['export', copy.film, '--fps', '4', '--formats', '16x9,9x16'], {
      // as an editor saves: a temporary file renamed over story.json, so no reader sees it half written
      onStderr: (err) => { if (!edited && /export 9x16/.test(err)) { edited = true; const tmp = `${storyFile(copy.film)}.tmp`; writeFileSync(tmp, `${readFileSync(storyFile(copy.film), 'utf8')}\n`); renameSync(tmp, storyFile(copy.film)); } },
    });
    assert.ok(edited, r.out);
    assert.equal(r.status, 1, r.out);
    assert.match(r.stderr, /story\.json changed during the export/);
    assert.ok(!readdirSync(join(copy.film, 'out')).some((f) => f.endsWith('.mp4') || f === 'poster.png'), 'nothing was renamed into out/');
    assert.ok(!existsSync(join(copy.film, 'out', 'export.lock')));
  } finally { copy.cleanup(); }
});

test('a forced export of a stale report is stamped UNCHECKED', async () => {
  const copy = workCopy('export-gate-force');
  try {
    report(copy.film, { version: '0123456789abcdef', formats: ['16x9', '9x16', '1x1'], complete: true });
    const r = await run(['export', copy.film, '--fps', '4', '--formats', '16x9', '--force']);
    assert.equal(r.status, 0, r.out);
    assert.equal(probeVideo(join(copy.film, 'out', 'kit-smoke-film-16x9.mp4')).comment, 'UNCHECKED');
  } finally { copy.cleanup(); }
});
