// The studio's Export: POST /api/export
// runs the real gate (`mm check`, every story format) and, when it passes or `force` says so, the real
// `mm export --formats …` (then `mm sound` when asked), one run per piece, its progress on the SSE
// stream as `export` events; POST /api/export/cancel stops it and leaves out/ as it was (with sound,
// `mm check` runs again on the mix). The file
// server answers Range requests, so the page's <video> can seek the MP4 it made. Temp copies of the
// kit-smoke film (fails G-HOOK and G-LENGTH) and of golden-film-editorial (passes, has cues); every
// export renders at a low frame rate (startStudio's exportFps) to stay quick.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { startStudio } from '../../scripts/studio/server.mjs';
import { probeVideo, workCopy } from '../cli/cli-helpers.mjs';
import { call, ended, exampleCopy, exportEvents } from './studio-bench-lib.mjs';

const FPS = 4;
let w, s;
before(async () => { w = workCopy('studio-export'); s = await startStudio({ piece: w.film, exportFps: FPS }); });
after(async () => { await s?.close(); w?.cleanup(); });

const outFiles = (dir) => (existsSync(join(dir, 'out')) ? readdirSync(join(dir, 'out')) : []);

test('the file server answers Range requests: 206 with Content-Range, a suffix range, 416 past the end', async () => {
  const path = `/${s.piece}/story.json`, size = statSync(join(w.film, 'story.json')).size, text = readFileSync(join(w.film, 'story.json'));
  const whole = await call(s, 'GET', path);
  assert.equal(whole.status, 200);
  assert.equal(whole.headers['accept-ranges'], 'bytes');
  const r = await call(s, 'GET', path, { headers: { range: 'bytes=2-11' } });
  assert.equal(r.status, 206);
  assert.equal(r.headers['content-range'], `bytes 2-11/${size}`);
  assert.equal(r.headers['content-length'], '10');
  assert.deepEqual(r.body, text.subarray(2, 12));
  const tail = await call(s, 'GET', path, { headers: { range: 'bytes=-5' } });
  assert.equal(tail.status, 206);
  assert.deepEqual(tail.body, text.subarray(size - 5));
  const open = await call(s, 'GET', path, { headers: { range: 'bytes=10-' } });
  assert.equal(open.status, 206);
  assert.equal(open.headers['content-range'], `bytes 10-${size - 1}/${size}`);
  const past = await call(s, 'GET', path, { headers: { range: `bytes=${size + 10}-` } });
  assert.equal(past.status, 416);
  assert.equal(past.headers['content-range'], `bytes */${size}`);
});

test('POST /api/export takes only formats the story ships (422), and plain booleans (400); cancel with nothing running is 409', async () => {
  for (const formats of [['4x5'], [], ['16x9', '16x9'], '16x9', undefined]) {
    const r = await call(s, 'POST', '/api/export', { body: { formats } });
    assert.equal(r.status, 422, JSON.stringify(formats));
    assert.equal(r.json.error, 'bad-formats');
    assert.deepEqual(r.json.formats, ['16x9', '9x16', '1x1']);
  }
  assert.equal((await call(s, 'POST', '/api/export', { body: { formats: ['16x9'], force: 'yes' } })).status, 400);
  assert.equal((await call(s, 'POST', '/api/export', { body: { formats: ['16x9'], sound: 1 } })).status, 400);
  const c = await call(s, 'POST', '/api/export/cancel', { body: {} });
  assert.equal(c.status, 409); assert.equal(c.json.error, 'idle');
  assert.equal((await call(s, 'POST', '/api/export', { body: { formats: ['16x9'] }, headers: { origin: 'http://evil.example' } })).status, 403, 'a foreign origin is refused');
  assert.equal((await call(s, 'GET', '/api/export')).json, null, 'no run yet');
});

test('a failing gate: check, then failed with the failing rule ids and rows; nothing is rendered', async () => {
  const ev = exportEvents(s);
  try {
    const r = await call(s, 'POST', '/api/export', { body: { formats: ['16x9'] } });
    assert.equal(r.status, 202, JSON.stringify(r.json));
    const end = await ev.until(ended);
    assert.equal(end.state, 'failed', JSON.stringify(end));
    assert.ok(end.failed.includes('G-HOOK') && end.failed.includes('G-LENGTH'), JSON.stringify(end.failed));
    assert.ok(end.rules.every((x) => x.status === 'FAIL' && end.failed.includes(x.id)), 'the rows are the failing rules, with their evidence');
    assert.deepEqual(ev.states(), ['check', 'failed']);
    assert.ok(!outFiles(w.film).some((f) => f.endsWith('.mp4')), 'no MP4');
    assert.equal((await call(s, 'GET', '/api/export')).json.state, 'failed', 'GET /api/export reports the last run');
  } finally { ev.close(); }
});

test('one export at a time (409 busy); cancel stops it, says cancelled, and leaves no MP4 or staged file', async () => {
  const ev = exportEvents(s);
  try {
    assert.equal((await call(s, 'POST', '/api/export', { body: { formats: ['16x9'], force: true } })).status, 202);
    const again = await call(s, 'POST', '/api/export', { body: { formats: ['16x9'], force: true } });
    assert.equal(again.status, 409); assert.equal(again.json.error, 'busy');
    await ev.until((e) => e.state === 'export');
    const c = await call(s, 'POST', '/api/export/cancel', { body: {} });
    assert.equal(c.status, 200);
    const end = await ev.until(ended, 30_000);
    assert.equal(end.state, 'cancelled');
    assert.equal(end.stage, 'export');
    const files = outFiles(w.film);
    assert.ok(!files.some((f) => f.endsWith('.mp4') || f.includes('.partial')), `out/ holds ${files.join(', ')}`);
  } finally { ev.close(); }
});

test('force: the gate fails, the export runs anyway, stamped UNCHECKED; done lists each MP4 with a URL that seeks', async () => {
  const ev = exportEvents(s);
  try {
    assert.equal((await call(s, 'POST', '/api/export', { body: { formats: ['16x9'], force: true } })).status, 202);
    const end = await ev.until(ended, 180_000);
    assert.equal(end.state, 'done', JSON.stringify(end));
    assert.deepEqual(ev.states(), ['check', 'export', 'done']);
    assert.equal(end.unchecked, true);
    assert.equal(end.files.length, 1);
    const [f] = end.files;
    assert.equal(f.format, '16x9');
    assert.equal(f.path, `${s.piece}/out/kit-smoke-film-16x9.mp4`);
    assert.equal(f.url, `/${s.piece}/out/kit-smoke-film-16x9.mp4`);
    const file = join(w.film, 'out', 'kit-smoke-film-16x9.mp4');
    assert.equal(f.bytes, statSync(file).size);
    assert.equal(probeVideo(file).comment, 'UNCHECKED');
    const r = await call(s, 'GET', f.url, { headers: { range: 'bytes=0-99' } });
    assert.equal(r.status, 206); assert.equal(r.headers['content-type'], 'video/mp4'); assert.equal(r.body.length, 100);
  } finally { ev.close(); }
});

test('a passing gate with sound: check, export, sound, the gate again on the mix, done; the MP4 is not stamped and carries the mix', async () => {
  const c = exampleCopy('pieces/golden-film-editorial', 'studio-export-pass');
  const sv = await startStudio({ piece: c.piece, exportFps: FPS });
  const ev = exportEvents(sv);
  try {
    assert.equal((await call(sv, 'POST', '/api/export', { body: { formats: ['16x9'], sound: true } })).status, 202);
    const end = await ev.until(ended, 280_000);
    assert.equal(end.state, 'done', JSON.stringify(end));
    assert.deepEqual(ev.states(), ['check', 'export', 'sound', 'recheck', 'done']);
    assert.equal(end.unchecked, false);
    assert.equal(end.mixChecked, true, 'the gate ran again, after the mux');
    assert.ok(Array.isArray(end.failed), JSON.stringify(end));
    const loud = JSON.parse(readFileSync(join(c.piece, 'out', 'check.json'), 'utf8')).rules.find((r) => r.id === 'G-LOUD');
    assert.notEqual(loud.status, 'SKIP', `G-LOUD measured the mix: ${JSON.stringify(loud)}`);
    const file = join(c.piece, 'out', 'golden-film-editorial-16x9.mp4');
    assert.notEqual(probeVideo(file).comment, 'UNCHECKED');
    assert.ok(existsSync(join(c.piece, 'out', 'mix.wav')), 'mm sound wrote its mix');
    assert.equal(end.files[0].bytes, statSync(file).size, 'the size after the mux');
  } finally { ev.close(); await sv.close(); c.cleanup(); }
});
