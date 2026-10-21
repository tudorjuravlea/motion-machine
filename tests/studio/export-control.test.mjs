// The studio's Export, against the real server and the real verbs on temp copies of
// the kit-smoke film (its copy's font sits outside the piece, so G-LOCAL fails and its exports are forced) at a low frame rate:
// an Export pins the story it checks (edits refused meanwhile, here and by `mm timeline`); a
// Cancel during the gate leaves out/check.json as it found it; the studio and a shell's
// `mm export` exclude each other; a Cancel queued behind Run gate ends at once; a
// failed `mm sound` reports the MP4s it rendered; failure reasons are not stack frames;
// the API is as strict as the rest; the page learns whether there is sound to mix.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { byteRange, reasonOf, startStudio } from '../../scripts/studio/server.mjs';
import { mixable } from '../../scripts/sound.mjs';
import { mm, workCopy } from '../cli/cli-helpers.mjs';
import { call, ended, exportEvents } from './studio-bench-lib.mjs';

const FPS = 4;
let w, s;
before(async () => { w = workCopy('studio-e6'); s = await startStudio({ piece: w.film, exportFps: FPS }); });
after(async () => { await s?.close(); w?.cleanup(); });
const lockFile = () => join(w.film, 'out', 'export.lock');

test('while an Export runs, every edit is refused (409 exporting; mm timeline exits 2); the run renders the story it pinned; edits work after', async () => {
  const ev = exportEvents(s);
  try {
    const { version } = (await call(s, 'GET', '/api/piece')).json;
    const r = await call(s, 'POST', '/api/export', { body: { formats: ['16x9'], force: true } });
    assert.equal(r.status, 202, JSON.stringify(r.json));
    assert.equal(typeof r.json.id, 'string');
    await ev.until((e) => e.state === 'check');
    const edit = await call(s, 'POST', '/api/edit', { body: { version, edits: [{ op: 'scene.duration', scene: 'intro', value: 4 }] } });
    assert.equal(edit.status, 409, JSON.stringify(edit.json));
    assert.equal(edit.json.error, 'exporting');
    assert.match(edit.json.reason, /an export of this piece is running \(mm studio/);
    const cli = mm(['timeline', w.film, 'trim', 'intro', '4'], { timeout: 60_000 });
    assert.equal(cli.status, 2, cli.out);
    assert.match(cli.stderr, /refused \(exporting\): an export of this piece is running/);
    const end = await ev.until(ended, 180_000);
    assert.equal(end.state, 'done', JSON.stringify(end));
    assert.equal(end.version, version, 'the run names the story it pinned');
    assert.equal(end.id, r.json.id);
    assert.ok(ev.seen.every((e) => e.id === r.json.id && e.version === version && e.force === true && e.sound === false), 'every event carries the run, its story and its options');
    assert.equal(end.files.length, 1);
    assert.equal(end.poster, `/${s.piece}/out/poster.png`, '16x9 is the story\'s first format');
    assert.ok(!existsSync(lockFile()), 'the lock is released before done');
    const again = await call(s, 'POST', '/api/edit', { body: { version, edits: [{ op: 'scene.duration', scene: 'intro', value: 4 }] } });
    assert.equal(again.status, 200, JSON.stringify(again.json));
    assert.equal((await call(s, 'POST', '/api/undo', { body: {} })).status, 200);
  } finally { ev.close(); }
});

test('a Cancel during the gate leaves out/check.json byte for byte, and says it stopped in the gate', async () => {
  const ev = exportEvents(s);
  const file = join(w.film, 'out', 'check.json');
  writeFileSync(file, '{"sentinel": true}\n');
  try {
    assert.equal((await call(s, 'POST', '/api/export', { body: { formats: ['16x9'], force: true } })).status, 202);
    await ev.until((e) => e.state === 'check' && /\(\d\/3\): G-/.test(e.line ?? ''), 60_000);
    assert.equal((await call(s, 'POST', '/api/export/cancel', { body: {} })).status, 200);
    const end = await ev.until(ended, 30_000);
    assert.equal(end.state, 'cancelled');
    assert.equal(end.stage, 'check');
    await new Promise((r) => setTimeout(r, 1500));   // the gate's process is gone by now
    assert.equal(readFileSync(file, 'utf8'), '{"sentinel": true}\n');
    assert.ok(!existsSync(lockFile()));
  } finally { ev.close(); }
});

test('the studio\'s Export refuses a shell\'s mm export, and a shell\'s export lock refuses the studio (409 busy, its holder named)', async () => {
  const ev = exportEvents(s);
  try {
    assert.equal((await call(s, 'POST', '/api/export', { body: { formats: ['16x9'], force: true } })).status, 202);
    await ev.until((e) => e.state === 'check');
    const cli = mm(['export', w.film, '--force', '--fps', String(FPS), '--formats', '16x9'], { timeout: 60_000 });
    assert.equal(cli.status, 2, cli.out);
    assert.match(cli.stderr, /export refused: an export of this piece is running \(mm studio, pid \d+\)/);
    assert.doesNotMatch(cli.stderr, /\n\s+at /);
    assert.equal((await call(s, 'POST', '/api/export/cancel', { body: {} })).status, 200);
    await ev.until(ended, 30_000);
  } finally { ev.close(); }
  writeFileSync(lockFile(), JSON.stringify({ pid: process.pid, by: 'mm export', at: new Date().toISOString(), nonce: 'shell' }));
  try {
    const r = await call(s, 'POST', '/api/export', { body: { formats: ['16x9'], force: true } });
    assert.equal(r.status, 409, JSON.stringify(r.json));
    assert.equal(r.json.error, 'busy');
    assert.match(r.json.reason, /mm export, pid \d+/);
    const { version } = (await call(s, 'GET', '/api/piece')).json;
    const edit = await call(s, 'POST', '/api/edit', { body: { version, edits: [{ op: 'scene.duration', scene: 'intro', value: 4 }] } });
    assert.equal(edit.json?.error, 'exporting', 'a shell\'s export pauses studio edits too');
  } finally { rmSync(lockFile(), { force: true }); }
  // a lock whose pid is gone is broken by the next writer
  writeFileSync(lockFile(), JSON.stringify({ pid: 2 ** 22 + 4321, by: 'mm export', at: new Date().toISOString(), nonce: 'dead' }));
  const { version } = (await call(s, 'GET', '/api/piece')).json;
  const edit = await call(s, 'POST', '/api/edit', { body: { version, edits: [{ op: 'scene.duration', scene: 'intro', value: 4 }] } });
  assert.equal(edit.status, 200, JSON.stringify(edit.json));
  assert.ok(!existsSync(lockFile()), 'the dead holder\'s lock is gone');
  assert.equal((await call(s, 'POST', '/api/undo', { body: {} })).status, 200);
});

test('story.json written outside the studio during the gate fails the run and says so', async () => {
  const ev = exportEvents(s);
  const file = join(w.film, 'story.json'), text = readFileSync(file, 'utf8');
  try {
    assert.equal((await call(s, 'POST', '/api/export', { body: { formats: ['16x9'], force: true } })).status, 202);
    await ev.until((e) => e.state === 'check');
    writeFileSync(`${file}.tmp`, `${text}\n`); renameSync(`${file}.tmp`, file);   // an editor that does not take the journal lock
    const end = await ev.until(ended, 120_000);
    assert.equal(end.state, 'failed', JSON.stringify(end));
    assert.match(end.reason, /story\.json changed during the check/);
    assert.ok(!ev.seen.some((e) => e.state === 'export'), 'nothing was rendered');
  } finally { ev.close(); writeFileSync(file, text); }
});

test('a Cancel while the gate waits behind Run gate ends the run at once, and its gate never runs', async () => {
  const ev = exportEvents(s);
  try {
    const runGate = call(s, 'POST', '/api/check', { body: { format: '16x9' } });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal((await call(s, 'POST', '/api/export', { body: { formats: ['16x9'], force: true } })).status, 202);
    const t0 = Date.now();
    assert.equal((await call(s, 'POST', '/api/export/cancel', { body: {} })).status, 200);
    const end = await ev.until(ended, 30_000);
    assert.equal(end.state, 'cancelled');
    assert.ok(Date.now() - t0 < 3000, `cancelled in ${Date.now() - t0} ms`);
    assert.equal((await runGate).status, 200);
    assert.ok(!ev.seen.some((e) => e.state === 'check' && e.line), 'the queued gate printed nothing: it never started');
  } finally { ev.close(); }
});

test('a failed mm sound reports the MP4s this run rendered, marked not mixed', async () => {
  const c = workCopy('studio-e6-sound');
  const file = join(c.film, 'story.json');
  const story = JSON.parse(readFileSync(file, 'utf8'));
  mkdirSync(join(c.film, 'assets'), { recursive: true });
  writeFileSync(join(c.film, 'assets', 'track.wav'), 'not audio');
  story.audio.track = 'assets/track.wav';
  writeFileSync(file, JSON.stringify(story, null, 2));
  const sv = await startStudio({ piece: c.film, exportFps: FPS });
  const ev = exportEvents(sv);
  try {
    assert.equal((await call(sv, 'GET', '/api/piece')).json.sound, true, 'a track: there is something to mix');
    assert.equal((await call(sv, 'POST', '/api/export', { body: { formats: ['16x9'], force: true, sound: true } })).status, 202);
    const end = await ev.until(ended, 240_000);
    assert.equal(end.state, 'failed', JSON.stringify(end));
    assert.equal(end.soundFailed, true);
    assert.deepEqual(end.files.map((f) => f.path), [`${sv.piece}/out/kit-smoke-film-16x9.mp4`]);
    assert.match(end.reason, /^sound: /, end.reason);
    assert.deepEqual(ev.states(), ['check', 'export', 'sound', 'failed']);
  } finally { ev.close(); await sv.close(); c.cleanup(); }
});

test('a failure\'s reason is the line that says why, never a stack frame', () => {
  assert.equal(reasonOf(['export 16x9 → x', 'Error: boom', '    at f (x.js:1:1)'.trim(), 'at ChildProcess._handle.onexit (node:internal/child_process:305:5)', 'Node.js v24.0.0']), 'Error: boom');
  assert.equal(reasonOf(['warning: x', 'mm: export refused: an export of this piece is running (mm studio, pid 3)']), 'mm: export refused: an export of this piece is running (mm studio, pid 3)');
  assert.equal(reasonOf(['sound: audio.track x does not exist']), 'sound: audio.track x does not exist');
  assert.equal(reasonOf(['plain last words', 'at x (y:1:1)']), 'plain last words');
  assert.equal(reasonOf([]), '');
});

test('cancel takes JSON only (415), unknown export keys are a 400, and a range that ends before it starts is ignored (200)', async () => {
  const plain = await call(s, 'POST', '/api/export/cancel', { raw: 'x', headers: { 'content-type': 'text/plain' } });
  assert.equal(plain.status, 415);
  const extra = await call(s, 'POST', '/api/export', { body: { formats: ['16x9'], fps: 1000, workers: 99 } });
  assert.equal(extra.status, 400, JSON.stringify(extra.json));
  assert.match(extra.json.reason, /fps, workers/);
  assert.equal(byteRange('bytes=5-3', 100), null);
  assert.equal((await call(s, 'GET', `/${s.piece}/story.json`, { headers: { range: 'bytes=5-3' } })).status, 200);
  assert.equal(byteRange('bytes=200-', 100), 'unsatisfiable');
});

test('GET /api/piece says whether mm sound has anything to mix, by mm sound\'s own predicate', async () => {
  assert.equal((await call(s, 'GET', '/api/piece')).json.sound, false, 'kit-smoke: no track, no cue');
  const story = JSON.parse(readFileSync(join(w.film, 'story.json'), 'utf8'));
  const cue = structuredClone(story);
  cue.scenes[0].beats[0].cue = 'hit';
  assert.equal(mixable(cue, { sound: { palette: 'soft-ui' } }), true);
  assert.equal(mixable(cue, { sound: { palette: 'none' } }), false, 'cues with palette none: nothing to mix');
  const variantOnly = structuredClone(story);
  variantOnly.scenes[0].variants = { '9x16': { beats: [{ ...story.scenes[0].beats[0], cue: 'hit' }] } };
  assert.equal(mixable(variantOnly, { sound: { palette: 'soft-ui' } }), false, 'mm sound mixes only scene.beats cues');
  assert.equal(mixable({ ...story, kind: 'deck', audio: { track: 'x.wav' } }, {}), false, 'decks are not mixed');
});
