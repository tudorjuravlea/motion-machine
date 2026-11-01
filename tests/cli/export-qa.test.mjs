// The finished file is checked too (scripts/lib/export-qa.mjs, SPEC §8): the parsers and rules that
// read ffmpeg's detectors, then real MP4s with one known defect each: a black frame, a frozen stall, a
// frame out of place at a cut, a wrong size or frame rate, a long silence, a mix too loud. The piece
// is fixtures/kit-smoke/film, exported by `mm export` itself; the broken files are made from its MP4 with ffmpeg.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, launchBrowser } from '../../scripts/lib/browser.mjs';
import { mm } from './cli-helpers.mjs';
import { exportPiece } from '../../scripts/export.mjs';
import { buildSound } from '../../scripts/sound.mjs';
import {
  FREEZE_CORE_S, FREEZE_MIN_S, FREEZE_NOISE_DB, SILENCE_MAX_S, BLACK_MIN_S, MOTION_CORE,
  blackSpans, visibleChange, PAGE_SHARE, canvasIsBlack, formatOfFile, frozenFaults, frozenSpans, motionCores, overlapOf, pieceOf, silentSpans, verdictLines, verifyExport, verifyFile, walkthroughFrames,
} from '../../scripts/lib/export-qa.mjs';
import { ensurePiece, variant, withPicture, PATTERNS } from '../../fixtures/sound/setup.mjs';

// a copy of the kit-smoke fixtures, so this file and the others that export the film never meet at one export lock
const COPY = join(ROOT, 'fixtures', `.tmp-export-qa-${process.pid}`);
const PIECE = join(COPY, 'film');
const FPS = 10;
let tmp, browser, good;
const ff = (...args) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const X264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-fps_mode', 'cfr'];
/** A broken copy of the exported film: `vf` applied to its picture; named like a film of the story so the piece's format is known. */
const broken = (name, vf, extra = []) => { const dir = join(tmp, name); mkdirSync(dir, { recursive: true }); const f = join(dir, 'kit-smoke-film-16x9.mp4'); ff('-i', good, '-an', '-vf', vf, ...X264, ...extra, f); return f; };
const row = (file, id) => file.checks.find((c) => c.id === id);
const check = async (file, o = {}) => verifyFile(file, { dir: PIECE, fps: FPS, phase: 'export', sheetBase: join(tmp, `sheet-${Math.random().toString(36).slice(2)}`), browser, ...o });

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'mm-qa-'));
  cpSync(join(ROOT, 'fixtures', 'kit-smoke'), COPY, { recursive: true, filter: (p) => !p.includes('/out') });
  browser = await launchBrowser();
  const { manifest } = await exportPiece(PIECE, { fps: FPS, formats: ['16x9'], force: true });
  good = manifest.files[0].file;
});
after(async () => { await browser?.close(); rmSync(tmp, { recursive: true, force: true }); rmSync(COPY, { recursive: true, force: true }); });

// ---- the readers of ffmpeg's logs ----

test('blackSpans, frozenSpans and silentSpans read the detectors\' logs; a span still open at the end runs to the end', () => {
  assert.deepEqual(blackSpans('[blackdetect @ 0x1] black_start:1.5 black_end:2 black_duration:0.5\nother\n[blackdetect @ 0x1] black_start:4 black_end:4.2 black_duration:0.2'), [{ start: 1.5, end: 2 }, { start: 4, end: 4.2 }]);
  const frozen = '[Parsed_freezedetect_1 @ 0x1] lavfi.freezedetect.freeze_start: 0\n[Parsed_freezedetect_1 @ 0x1] lavfi.freezedetect.freeze_duration: 1\n[Parsed_freezedetect_1 @ 0x1] lavfi.freezedetect.freeze_end: 1\n[Parsed_freezedetect_1 @ 0x1] lavfi.freezedetect.freeze_start: 3';
  assert.deepEqual(frozenSpans(frozen, 4.5), [{ start: 0, end: 1 }, { start: 3, end: 4.5 }]);
  assert.deepEqual(silentSpans('[silencedetect @ 0x1] silence_start: 2.5\n[silencedetect @ 0x1] silence_end: 9.1 | silence_duration: 6.6\n[silencedetect @ 0x1] silence_start: 10', 12), [{ start: 2.5, end: 9.1 }, { start: 10, end: 12 }]);
  assert.deepEqual(blackSpans('no detector output'), []);
});

test('motion cores are the middle of each arrival, exit, move and cut that takes time; a rest and an ease\'s ends are not', () => {
  const sched = { events: [
    { t: 1, kind: 'arrive', d: 0.4 }, { t: 1.2, kind: 'depart', d: 0.4 }, { t: 5, kind: 'move', d: 2 }, { t: 3, kind: 'cue', d: 1 }, { t: 4, kind: 'arrive', d: 0 }] };
  const [a, b] = MOTION_CORE;
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  const cores = motionCores(sched);
  assert.equal(cores.length, 2, 'the overlapping arrival and exit merge; a cue and an instant arrival are not motion');
  assert.ok(near(cores[0][0], 1 + a * 0.4) && near(cores[0][1], 1.2 + b * 0.4));
  assert.ok(near(cores[1][0], 5 + a * 2) && near(cores[1][1], 5 + b * 2));
  assert.ok(near(overlapOf(0, 10, cores), (cores[0][1] - cores[0][0]) + (cores[1][1] - cores[1][0])));
  assert.equal(overlapOf(0, 1, cores), 0);
});

test('frozenFaults: a freeze through a motion is a fault; a rest, a gap, a short freeze and an ease\'s tail are not', () => {
  const sched = { events: [{ t: 2, kind: 'arrive', d: 1 }] };   // core 2.25 to 2.75
  assert.equal(frozenFaults([{ start: 2.1, end: 3.2 }], sched).length, 1, 'frozen through the arrival');
  assert.equal(frozenFaults([{ start: 3, end: 8 }], sched).length, 0, 'a rest');
  assert.equal(frozenFaults([{ start: 0, end: 2.3 }], sched).length, 0, 'a gap that touches the ease\'s start');
  assert.equal(frozenFaults([{ start: 2.2, end: 2.6 }], sched).length, 0, `shorter than ${FREEZE_MIN_S} s`);
  assert.equal(frozenFaults([{ start: 2.6, end: 3.4 }], sched).length, FREEZE_CORE_S <= 0.15 ? 1 : 0, 'the arrival\'s tail');
  assert.equal(frozenFaults([{ start: 2.1, end: 3.2 }], sched, 1).length, 0, 'at 1 fps a motion between two frames cannot be seen to stand still');
  assert.equal(frozenFaults([{ start: 2.1, end: 3.2 }], sched, 10).length, 1);
  assert.equal(FREEZE_NOISE_DB, -80);
});

test('frozenFaults with the drawn frames: a freeze is a fault only where the page drew changing frames', () => {
  const sched = { events: [{ t: 2, kind: 'arrive', d: 1 }] };   // core 2.25 to 2.75
  const fps = 10, still = Array.from({ length: 60 }, () => 'aaaa');
  assert.equal(frozenFaults([{ start: 2.1, end: 3.2 }], sched, fps, still).length, 0, 'the page held the frame itself (a pattern that holds mid-entrance): on purpose');
  const moving = still.map((h, n) => (n >= 20 && n < 33 ? `f${n}` : h));
  assert.equal(frozenFaults([{ start: 2.1, end: 3.2 }], sched, fps, moving).length, 1, 'the page drew motion the file lost: a fault');
  assert.equal(frozenFaults([{ start: 2.1, end: 3.2 }], sched, fps, null).length, 1, 'without the drawn frames the schedule decides, as before');
});

test('visibleChange: a level of antialiasing is no motion; a stroke drawn across the frame is', () => {
  const img = (f) => { const data = new Uint8Array(100 * 100 * 4); for (let i = 0; i < 100 * 100; i++) { const v = f(i % 100, Math.floor(i / 100)); data.set([v, v, v, 255], i * 4); } return { width: 100, height: 100, data }; };
  const base = img(() => 20);
  assert.equal(visibleChange(base, img((x, y) => (x === y ? 23 : 20))), 0, 'a 3-level shimmer');
  assert.ok(visibleChange(base, img((x, y) => (y === 50 ? 230 : 20))) > PAGE_SHARE, 'a line drawn');
});

test('formatOfFile, walkthroughFrames, canvasIsBlack and pieceOf', () => {
  assert.equal(formatOfFile('/x/out/launch-9x16.mp4'), '9x16');
  assert.equal(formatOfFile('/x/out/walkthrough.mp4'), null);
  // the first rest is held, then each of 3 presses plays 0.5 s (15 frames, 14 beyond the first) and holds 2 s
  assert.equal(walkthroughFrames({ presses: 3, pressLengths: [0, 0.5, 0.5, 0.5] }, { fps: 30, holdS: 2 }), 60 + 3 * (14 + 60));
  assert.equal(walkthroughFrames({ presses: 1, pressLengths: [0, 0] }, { fps: 30, holdS: 2 }), 60 + 60, 'a press with no length is one frame');
  assert.equal(canvasIsBlack({ color: { canvas: '#000000' } }), true);
  assert.equal(canvasIsBlack({ color: { canvas: '#0b0b10' } }), false);
  assert.equal(canvasIsBlack({ color: { canvas: '#f4f1ea' } }), false);
  assert.equal(pieceOf(good), PIECE);
  assert.equal(pieceOf('/tmp/elsewhere.mp4'), null);
});

// ---- the exported film, as `mm export` read it back ----

test('mm export reads the finished MP4 back: every check passes or says why it skipped, and the report and seam sheet are written', () => {
  const report = JSON.parse(readFileSync(join(PIECE, 'out', 'export-qa.json'), 'utf8'));
  assert.equal(report.ok, true);
  const f = report.files[0];
  assert.equal(f.phase, 'export');
  assert.deepEqual(f.checks.map((c) => c.id), ['QA-STREAM', 'QA-DURATION', 'QA-FRAMES', 'QA-SIZE', 'QA-FPS', 'QA-BITRATE', 'QA-AUDIO', 'QA-SILENCE', 'QA-LEVEL', 'QA-BLACK', 'QA-FROZEN', 'QA-DECODE', 'QA-SEAM']);
  for (const id of ['QA-STREAM', 'QA-DURATION', 'QA-FRAMES', 'QA-SIZE', 'QA-FPS', 'QA-BITRATE', 'QA-AUDIO', 'QA-BLACK', 'QA-FROZEN', 'QA-DECODE', 'QA-SEAM']) assert.equal(row(f, id).status, 'PASS', `${id}: ${JSON.stringify(row(f, id).evidence)}`);
  for (const id of ['QA-SILENCE', 'QA-LEVEL']) assert.equal(row(f, id).status, 'SKIP', id);
  assert.match(row(f, 'QA-SILENCE').evidence.reason, /no sound/);
  assert.equal(row(f, 'QA-SEAM').evidence.seams, 1);
  assert.deepEqual(row(f, 'QA-SEAM').evidence.sheets, ['out/export-qa-seams-16x9.png']);
  assert.ok(existsSync(join(PIECE, 'out', 'export-qa-seams-16x9.png')));
  const manifest = JSON.parse(readFileSync(join(PIECE, 'out', 'export.json'), 'utf8'));
  assert.deepEqual(manifest.qa, { file: 'out/export-qa.json', ok: true, failed: [] });
});

test('a file nothing is wrong with passes with the piece, and the verdict lines say so', async () => {
  const f = await check(good);
  assert.equal(f.ok, true);
  assert.match(verdictLines({ files: [f] }, { cwd: ROOT })[0], /^ok {2}.*kit-smoke-film-16x9\.mp4: 11 pass, 0 fail, 2 skipped$/);
});

test('a black stretch fails QA-BLACK and QA-SEAM when it sits on a cut', async () => {
  const f = await check(broken('black', "drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(n,30,31)'"));
  assert.equal(f.ok, false);
  assert.equal(row(f, 'QA-BLACK').status, 'FAIL');
  assert.match(row(f, 'QA-BLACK').evidence.reason, /black from 3 to 3\.2 s/);
  assert.equal(row(f, 'QA-SEAM').status, 'FAIL');
  assert.equal(row(f, 'QA-SEAM').evidence.issues[0].kind, 'black');
  assert.equal(BLACK_MIN_S, 0.1);
});

test('a frame dropped at the start puts the cut a frame early: QA-DURATION and QA-SEAM (offset) fail', async () => {
  const f = await check(broken('early', "select='gte(n,1)',setpts=N/(10*TB)"));
  assert.equal(row(f, 'QA-DURATION').status, 'FAIL');
  assert.match(row(f, 'QA-DURATION').evidence.reason, /59 frames, the story makes 60/);
  const seam = row(f, 'QA-SEAM');
  assert.equal(seam.status, 'FAIL');
  assert.equal(seam.evidence.issues[0].kind, 'offset');
  assert.match(seam.evidence.issues[0].reason, /changes at frame 29, 1 frame before the cut at frame 30/);
});

test('a frame repeated at the cut is a duplicate: QA-SEAM fails and names the frame', async () => {
  const f = await check(broken('dup', 'loop=loop=1:size=1:start=29'));
  const seam = row(f, 'QA-SEAM');
  assert.equal(seam.status, 'FAIL');
  assert.deepEqual(seam.evidence.issues.map((i) => i.kind), ['duplicate']);
  assert.match(seam.evidence.issues[0].reason, /frame 30 repeats frame 29/);
});

test('a stall in the middle of an arrival fails QA-FROZEN; the rests of the film do not', async () => {
  const f = await check(broken('stall', 'loop=loop=5:size=1:start=3'));
  const frozen = row(f, 'QA-FROZEN');
  assert.equal(frozen.status, 'FAIL');
  assert.match(frozen.evidence.reason, /^frozen from 0(\.\d)? to \d(\.\d)? s while the story moves/);
  assert.ok(frozen.evidence.faults[0].start < 1);
  assert.ok(frozen.evidence.spans.length >= 2, 'the film\'s rests are frozen spans too, and are not faults');
});

test('the wrong size and the wrong frame rate fail QA-SIZE and QA-FPS', async () => {
  const small = await check(broken('small', 'scale=1280:720'));
  assert.equal(row(small, 'QA-SIZE').status, 'FAIL');
  assert.match(row(small, 'QA-SIZE').evidence.reason, /1280x720, 16x9 is 1920x1080/);
  const slow = await check(broken('slow', 'fps=12', ['-r', '12']));
  assert.equal(row(slow, 'QA-FPS').status, 'FAIL');
  assert.match(row(slow, 'QA-FPS').evidence.reason, /12 fps.*asked for 10/);
});

test('a file with no video stream fails QA-STREAM and every other check is skipped for it', async () => {
  const dir = join(tmp, 'noviz'); mkdirSync(dir, { recursive: true });
  const f = join(dir, 'kit-smoke-film-16x9.mp4');
  ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'aac', f);
  const r = await check(f);
  assert.equal(row(r, 'QA-STREAM').status, 'FAIL');
  assert.deepEqual(r.checks.slice(1).map((c) => c.status), Array(12).fill('SKIP'));
});

test('without a piece only what the file alone says is checked, and the rest is skipped with the reason', async () => {
  const r = await verifyFile(good, { phase: 'final' });
  assert.equal(r.ok, true);
  assert.equal(row(r, 'QA-STREAM').status, 'PASS');
  assert.equal(row(r, 'QA-BLACK').status, 'PASS');
  assert.equal(row(r, 'QA-FPS').status, 'PASS');
  for (const id of ['QA-DURATION', 'QA-SEAM']) assert.match(row(r, id).evidence.reason, /no piece given/, id);
  assert.match(row(r, 'QA-FROZEN').evidence.reason, /a rest cannot be told from a freeze/);
  assert.equal(row(r, 'QA-FROZEN').status, 'SKIP');
});

test('verify-export writes out/export-qa.json beside the others and keeps the rows of other files when one is checked alone', async () => {
  const a = await verifyExport(PIECE, [good], { phase: 'final', fps: FPS, browser });
  assert.equal(a.ok, true);
  assert.equal(JSON.parse(readFileSync(a.file, 'utf8')).files.length, 1);
  const again = await verifyExport(PIECE, [good], { phase: 'final', fps: FPS, browser, merge: true });
  assert.equal(JSON.parse(readFileSync(again.file, 'utf8')).files.length, 1, 'the same file is replaced, not added twice');
});

// ---- the verb ----

test('mm verify-export: a clean file exits 0 and prints its verdict; a broken one exits 1 and names the check; no file is 2', () => {
  const clean = mm(['verify-export', good]);
  assert.equal(clean.status, 0, clean.out);
  assert.match(clean.stdout, /^ok {2}.*kit-smoke-film-16x9\.mp4: 11 pass, 0 fail, 2 skipped/m);
  assert.match(clean.stdout, /report: .*export-qa\.json/);
  const bad = mm(['verify-export', broken('verb-black', "drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(n,10,13)'"), '--piece', PIECE]);
  assert.equal(bad.status, 1, bad.out);
  assert.match(bad.stdout, /^FAIL .*: .* 1 fail/m);
  assert.match(bad.stdout, /QA-BLACK: black from 1 to 1\.4 s/);
  const none = mm(['verify-export', join(tmp, 'no-such.mp4')]);
  assert.equal(none.status, 2);
  assert.match(none.out, /no such file/);
  assert.equal(mm(['verify-export']).status, 2);
  assert.equal(mm(['verify-export', '--help']).status, 0);
});

test('mm verify-export on a file outside any piece says so and checks only what the file alone can say', () => {
  const r = mm(['verify-export', join(tmp, 'black', 'kit-smoke-film-16x9.mp4')]);
  assert.match(r.stdout, /^no piece /);
  assert.match(r.stdout, /QA-DURATION skipped: no piece given/);
});

// ---- sound: silence and level on a file with sound, and the phases ----

const tone = (name, amplitude, { seconds = 12, gapAt = null, gapS = 0 } = {}) => {
  const dir = join(tmp, name); mkdirSync(dir, { recursive: true });
  const f = join(dir, 'tone.mp4');
  const gap = gapAt == null ? '1' : `if(between(t,${gapAt},${gapAt + gapS}),0,1)`;
  ff('-f', 'lavfi', '-i', `testsrc=s=320x180:r=10:d=${seconds}`, '-f', 'lavfi', '-i', `aevalsrc='${amplitude}*sin(2*PI*1000*t)*${gap}':s=48000:d=${seconds}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', f);
  return f;
};

test('a tone at the style\'s level passes QA-LEVEL and QA-SILENCE; one that is too loud fails QA-LEVEL', async () => {
  const ok = await verifyFile(tone('tone-ok', 0.28), { phase: 'final' });
  assert.equal(row(ok, 'QA-AUDIO').status, 'PASS');
  assert.equal(row(ok, 'QA-SILENCE').status, 'PASS', JSON.stringify(row(ok, 'QA-SILENCE').evidence));
  assert.equal(row(ok, 'QA-LEVEL').status, 'PASS', JSON.stringify(row(ok, 'QA-LEVEL').evidence));
  const loud = await verifyFile(tone('tone-loud', 0.95), { phase: 'final' });
  assert.equal(row(loud, 'QA-LEVEL').status, 'FAIL');
  assert.match(row(loud, 'QA-LEVEL').evidence.reason, /LUFS and .* dBTP against -14 LUFS ±1 and -1 dBTP/);
});

test('a silence longer than the limit inside a sounding file fails QA-SILENCE with its span', async () => {
  const r = await verifyFile(tone('tone-gap', 0.28, { seconds: 14, gapAt: 3, gapS: SILENCE_MAX_S + 2 }), { phase: 'final' });
  assert.equal(row(r, 'QA-SILENCE').status, 'FAIL');
  assert.match(row(r, 'QA-SILENCE').evidence.reason, /^silent from 3(\.\d+)? to 10(\.\d+)? s/);
});

test('a piece with sound: the export phase skips the checks of the mix and names `mm sound`; the final phase fails a file that has none', async () => {
  await ensurePiece();
  const dir = await variant('qa-sounding');
  const mp4 = await withPicture(dir, 'kit-smoke-cues-16x9.mp4');
  const early = await verifyFile(mp4, { dir, phase: 'export', fps: 10 });
  for (const id of ['QA-AUDIO', 'QA-SILENCE', 'QA-LEVEL']) { assert.equal(row(early, id).status, 'SKIP', id); assert.match(row(early, id).evidence.reason, /mm sound/); }
  const silent = await verifyFile(mp4, { dir, phase: 'final', fps: 10 });
  assert.equal(row(silent, 'QA-AUDIO').status, 'FAIL');
  assert.match(row(silent, 'QA-AUDIO').evidence.reason, /the piece has sound but the MP4 has none/);
  await buildSound(dir, { patterns: PATTERNS });
  const mixed = await verifyFile(mp4, { dir, phase: 'final', fps: 10 });
  assert.equal(row(mixed, 'QA-AUDIO').status, 'PASS', JSON.stringify(row(mixed, 'QA-AUDIO').evidence));
  assert.equal(row(mixed, 'QA-LEVEL').status, 'PASS', JSON.stringify(row(mixed, 'QA-LEVEL').evidence));
  assert.equal(row(mixed, 'QA-SILENCE').status, 'PASS', JSON.stringify(row(mixed, 'QA-SILENCE').evidence));
});
