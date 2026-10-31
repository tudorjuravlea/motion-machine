// Seam evidence (scripts/lib/seams.mjs): the frames either side of every edit boundary as a row of a
// sheet, and a check for a black, duplicated or offset frame. The reading of a film's cut is tested on
// frames made here; the joins of a recording's edit on the synthetic recording `mm footage cut` is
// tested with (fixtures/footage/make.sh).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, mm } from './cli-helpers.mjs';
import { launchBrowser } from '../../scripts/lib/browser.mjs';
import { BLACK_LUMA, DUP_DIFF, diffOf, footageSeams, judgeFilmSeam } from '../../scripts/lib/seams.mjs';

const TMP = join(ROOT, `.tmp-seams-${process.pid}`);
const VIDEO = join(TMP, 'talk.mp4');
let browser, dir, edit;

// ---- a film's cut, from frames ----

/** A frame of 16 luma samples, all `v`, except sample 0 which is `mark`. */
const frame = (n, v, mark = v) => { const px = new Float32Array(16).fill(v); px[0] = mark; return { n, luma: px.reduce((a, b) => a + b, 0) / 16, px }; };
/** Frames 27..32: the outgoing scene (0.8 bright) up to frame 29, the next scene (0.4) from `cutAt`. */
const run = (cutAt, { black = [] } = {}) => Array.from({ length: 6 }, (_, k) => 27 + k).map((n) => frame(n, black.includes(n) ? 0 : n < cutAt ? 0.8 : 0.4));

test('diffOf is the mean absolute difference of two planes', () => {
  assert.equal(diffOf(new Float32Array([0, 1]), new Float32Array([1, 1])), 0.5);
  assert.equal(diffOf(new Float32Array([0, 1]), new Float32Array([0, 1])), 0);
  assert.equal(diffOf(new Float32Array(2), new Float32Array(3)), 1, 'planes of two sizes are different pictures');
});

test('a hard cut that changes the picture at its own frame is clean', () => {
  const r = judgeFilmSeam(run(30), { first: 30, hard: true });
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.steps.map((s) => s.diff), [0, 0, 0.4, 0, 0]);
});

test('a hard cut whose frame repeats the one before is a duplicate; one that changes a frame early is an offset', () => {
  const dup = judgeFilmSeam(run(31), { first: 30, hard: true });
  assert.deepEqual(dup.issues.map((i) => i.kind), ['duplicate']);
  assert.match(dup.issues[0].reason, /frame 30 repeats frame 29/);
  const early = judgeFilmSeam(run(29), { first: 30, hard: true });
  assert.deepEqual(early.issues.map((i) => i.kind), ['offset']);
  assert.match(early.issues[0].reason, /changes at frame 29, 1 frame before the cut at frame 30/);
  for (const cut of [29, 31]) assert.deepEqual(judgeFilmSeam(run(cut), { first: 30, hard: true, calmBefore: false }).issues, [], 'an exit planned before the cut may empty the stage: the next scene starts on the same picture');
});

test('a black frame in the window is flagged, unless the brand\'s canvas is black', () => {
  const r = judgeFilmSeam(run(30, { black: [30, 31] }), { first: 30, hard: true });
  assert.deepEqual(r.issues.filter((i) => i.kind === 'black').map((i) => i.frame), [30, 31]);
  assert.deepEqual(judgeFilmSeam(run(30, { black: [30, 31] }), { first: 30, hard: true, blackOk: true }).issues.filter((i) => i.kind === 'black'), []);
  assert.ok(BLACK_LUMA > 0 && BLACK_LUMA < 0.05);
});

test('inside a transition a frame that repeats the one before, between two moving steps, is a repeat; the transition\'s own still ends are not', () => {
  const t = [0.8, 0.8, 0.7, 0.55, 0.4, 0.4].map((v, k) => frame(28 + k, v));   // 28..33; the cut at 29 plays 4 frames
  assert.deepEqual(judgeFilmSeam(t, { first: 29, hard: false, transitionFrames: 4 }).issues.map((i) => i.frame), [], 'a still step at the start of the push, and the scene at rest after it');
  const stall = [0.8, 0.7, 0.55, 0.55, 0.4, 0.3].map((v, k) => frame(28 + k, v));
  const r = judgeFilmSeam(stall, { first: 29, hard: false, transitionFrames: 5 });
  assert.deepEqual(r.issues.map((i) => [i.kind, i.frame]), [['repeat', 31]]);
  assert.ok(DUP_DIFF > 0);
});

// ---- the joins of a recording's edit ----

before(async () => {
  rmSync(TMP, { recursive: true, force: true });
  assert.equal(spawnSync('sh', [join(ROOT, 'fixtures/footage/make.sh'), TMP]).status, 0);
  dir = join(TMP, 'piece');
  mkdirSync(dir, { recursive: true });
  assert.equal(mm(['media', 'prep', VIDEO, '--name', 'talk', '--piece', dir]).status, 0);
  const r = mm(['footage', 'cut', VIDEO, '--name', 'talk', '--piece', dir]);
  assert.equal(r.status, 0, r.out);
  browser = await launchBrowser();
  edit = JSON.parse(readFileSync(join(dir, 'assets/talk/edit.json'), 'utf8'));
});
after(async () => { await browser?.close(); rmSync(TMP, { recursive: true, force: true }); });

test('mm footage cut draws every join of its edit beside edit.json and finds nothing wrong with a clean cut', () => {
  const sheet = join(dir, 'assets/talk/seams.png');
  assert.ok(existsSync(sheet), 'seams.png');
  const seams = JSON.parse(readFileSync(join(dir, 'assets/talk/seams.json'), 'utf8'));
  assert.equal(edit.picture.length, 3);
  assert.equal(seams.joins.length, edit.picture.length - 1, 'one row a join');
  assert.deepEqual(seams.issues, []);
  assert.deepEqual(seams.sheets, ['seams.png']);
  assert.deepEqual(seams.joins.map((j) => j.at), edit.cuts.map((c) => c.at));
  assert.ok(readFileSync(sheet).length > 5000);
});

test('a clip that starts inside the one before it shows frames twice; a clip that starts late leaves a gap: both are flagged from the edit', async () => {
  const [a, b] = edit.picture;
  const overlap = await footageSeams(join(dir, 'assets/talk'), { ...edit, picture: [a, { ...b, from: a.from + a.length - 2 }] }, { browser, sheetBase: join(TMP, 'overlap') });
  assert.deepEqual(overlap.issues.map((i) => i.kind), ['duplicate']);
  assert.match(overlap.issues[0].reason, /takes its picture from source frame .*inside clip 1/);
  const gap = await footageSeams(join(dir, 'assets/talk'), { ...edit, picture: [a, { ...b, start: b.start + 2 }] }, { browser, sheetBase: join(TMP, 'gap') });
  assert.deepEqual(gap.issues.map((i) => i.kind), ['offset']);
  assert.match(gap.issues[0].reason, /a gap/);
});

test('the same picture either side of a join, and a black frame there, are flagged from the frames', async () => {
  const flat = join(TMP, 'flat');
  mkdirSync(flat, { recursive: true });
  const jpg = (name, color) => assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=160x90:d=0.04`, '-frames:v', '1', join(flat, name)]).status, 0);
  jpg('same.jpg', 'gray');
  jpg('black.jpg', 'black');
  const clips = { ...edit, picture: edit.picture.slice(0, 2) };
  const same = await footageSeams(flat, clips, { browser, sheetBase: join(TMP, 'same'), frameFile: () => join(flat, 'same.jpg') });
  assert.ok(same.issues.some((i) => i.kind === 'duplicate' && /are the same picture across the join/.test(i.reason)));
  const black = await footageSeams(flat, clips, { browser, sheetBase: join(TMP, 'black'), frameFile: () => join(flat, 'black.jpg') });
  assert.ok(black.issues.some((i) => i.kind === 'black' && /is black/.test(i.reason)));
  assert.ok(existsSync(join(TMP, 'same.png')) && existsSync(join(TMP, 'black.png')));
});
