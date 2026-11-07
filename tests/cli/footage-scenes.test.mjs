// `mm footage scenes` on recordings made here (flat colours that change, a pattern shaken by hand), and
// `mm footage review|cut --scenes`: a join that would leave a sliver of the other shot moves onto the scene
// change, and never into a word.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, mm, readJson } from './cli-helpers.mjs';

const TMP = join(ROOT, `.tmp-footage-scenes-${process.pid}`);
const TALK = join(TMP, 'talk.mp4');
const write = (file, json) => { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, JSON.stringify(json)); return file; };
const W = (...rows) => rows.map(([text, start, dur = 0.3]) => ({ text, start, end: Math.round((start + dur) * 1000) / 1000 }));
const ffmpeg = (...args) => assert.equal(spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]).status, 0);

before(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  assert.equal(spawnSync('sh', [join(ROOT, 'fixtures/footage/make.sh'), TMP]).status, 0);
  // red 2 s, a moving test pattern 2 s, blue 2 s: hard cuts at 2 s and 4 s
  ffmpeg('-filter_complex', 'color=c=red:s=160x90:r=30:d=2[a];testsrc2=s=160x90:r=30:d=2[b];color=c=blue:s=160x90:r=30:d=2[c];[a][b][c]concat=n=3:v=1:a=0,format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', join(TMP, 'cuts.mp4'));
  // the same pattern 6 s, cropped from a larger frame at a different place each frame: a shake, no cut
  ffmpeg('-f', 'lavfi', '-i', 'testsrc2=s=240x140:r=30:d=6', '-vf', "crop=160:90:x='40+36*sin(n*7.3)':y='25+22*sin(n*5.1+1)',format=yuv420p", '-c:v', 'libx264', '-preset', 'ultrafast', join(TMP, 'shake.mp4'));
});
after(() => rmSync(TMP, { recursive: true, force: true }));

test('scenes: hard cuts are found at the second the new shot starts; scenes, rate and offset are written', () => {
  const out = join(TMP, 'o1');
  const r = mm(['footage', 'scenes', join(TMP, 'cuts.mp4'), '--out', out]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /2 scene cuts in 6 s \(3 scenes\): 2 s, 4 s/);
  const doc = readJson(join(out, 'scenes.json'));
  assert.equal(doc.kind, 'scenes');
  assert.deepEqual(doc.cuts.map((c) => c.at), [2, 4]);
  assert.deepEqual(doc.scenes, [{ start: 0, end: 2 }, { start: 2, end: 4 }, { start: 4, end: 6 }]);
  assert.equal(doc.fps, 30);
  assert.equal(doc.offset, 0);
  assert.deepEqual(doc.params, { spike: 1.8, minScene: 0.5 });
  assert.ok(doc.cuts.every((c) => c.strength > 0.04 && (c.ratio == null || c.ratio >= 1.8)));
});

test('scenes: a handheld shake is not a cut', () => {
  const out = join(TMP, 'o2');
  const r = mm(['footage', 'scenes', join(TMP, 'shake.mp4'), '--out', out]);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(readJson(join(out, 'scenes.json')).cuts, []);
  assert.match(r.stdout, /0 scene cuts in 6 s \(1 scenes\)/);
});

test('scenes: a spike under --spike is no cut; --min-scene widens the scene; bad flags and files exit 2', () => {
  const v = join(TMP, 'cuts.mp4');
  assert.equal(readJson(join(TMP, 'o1/scenes.json')).cuts.length, 2);
  let r = mm(['footage', 'scenes', v, '--out', join(TMP, 'o3'), '--min-scene', '2.5']);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(readJson(join(TMP, 'o3/scenes.json')).cuts, [], 'scenes of 2 s are under 2.5 s: both cuts fall inside one');
  r = mm(['footage', 'scenes', v, '--spike', '1']);
  assert.equal(r.status, 2, r.out);
  r = mm(['footage', 'scenes', v, '--min-scene', '0']);
  assert.equal(r.status, 2, r.out);
  r = mm(['footage', 'scenes', join(TMP, 'nope.mp4')]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.stderr, /no such file/);
  r = mm(['footage', 'scenes']);
  assert.equal(r.status, 2);
});

test('review --scenes: a cut edge just past a scene change moves onto it; one beside a word is left, with the word named', () => {
  const words = write(join(TMP, 'w.json'), { words: W(['alpha', 1.0, 0.5], ['beta', 5.0, 0.5], ['gamma', 9.0, 0.5], ['delta', 9.1, 0.4]) });
  // the pause 1.5-5.0: the gap is over 2 s, so 0.24 s stays after "alpha": the cut starts at 1.74 and ends 0.1 s before "beta" at 4.9;
  // a scene change at 1.55 and at 5.05 would leave slivers
  const scenes = write(join(TMP, 'scenes-r.json'), { kind: 'scenes', offset: 0, cuts: [{ at: 1.55 }, { at: 5.05 }] });
  const out = join(TMP, 'o4');
  const r = mm(['footage', 'review', words, '--out', out, '--scenes', scenes]);
  assert.equal(r.status, 0, r.out);
  const doc = readJson(join(out, 'cuts.proposed.json'));
  const c = doc.cuts.find((x) => x.kind === 'long-pause');
  assert.equal(c.start, 1.55, 'moved earlier onto the scene change');
  assert.equal(c.scene.snapped[0].edge, 'start');
  assert.match(c.reason, /its start moved 0\.19 s earlier onto a scene change \(1\.55 s\)/);
  assert.equal(c.scene.held[0].edge, 'end');
  assert.equal(c.scene.held[0].word, 'beta');
  assert.match(c.reason, /left where it is: a scene change at 5\.05 s falls inside "beta"/);
  assert.equal(c.end, 4.9);
  assert.equal(doc.source.scenes, 'scenes-r.json');
});

test('review --scenes: the scenes are moved onto the sound\'s clock by the offset in the file; a bad file exits 2', () => {
  const words = write(join(TMP, 'w2.json'), { words: W(['alpha', 1.0, 0.5], ['beta', 5.0, 0.5]) });
  const scenes = write(join(TMP, 'scenes-o.json'), { kind: 'scenes', offset: 0.5, cuts: [{ at: 2.05 }] });   // 1.55 s of the sound
  const out = join(TMP, 'o5');
  assert.equal(mm(['footage', 'review', words, '--out', out, '--scenes', scenes]).status, 0);
  assert.equal(readJson(join(out, 'cuts.proposed.json')).cuts[0].start, 1.55);
  let r = mm(['footage', 'review', words, '--out', join(TMP, 'o6'), '--scenes', write(join(TMP, 'bad.json'), { hello: 1 })]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.stderr, /--scenes: the scenes file must be/);
  r = mm(['footage', 'review', words, '--out', join(TMP, 'o7'), '--scenes', join(TMP, 'missing.json')]);
  assert.equal(r.status, 2, r.out);
  assert.ok(!existsSync(join(TMP, 'o7/cuts.proposed.json')));
});

function piece(name) {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  const r = mm(['media', 'prep', TALK, '--name', 'talk', '--piece', dir]);
  assert.equal(r.status, 0, r.out);
  return dir;
}

test('cut --scenes: the join of an approved cut moves onto a scene change just beyond it; a word in the way holds it', () => {
  const dir = piece('apply');
  const cuts = write(join(TMP, 'apply/approved.json'), { cuts: [{ id: 'c001', kind: 'retake', start: 3.0, end: 6.0, approved: true }] });
  const words = write(join(TMP, 'apply/words.json'), W(['alpha', 1.0], ['beta', 2.6, 0.38], ['gamma', 8.0]));
  // a scene change at 2.9 would leave 0.1 s of the new shot before the join, but "beta" (2.6-2.98) is in the way?
  // no: the word ends at 2.98, after the scene change at 2.9, so the start edge at 3.0 may not move to 2.9
  let scenes = write(join(TMP, 'apply/scenes-held.json'), { cuts: [{ at: 2.9 }, { at: 6.1 }] });
  let r = mm(['footage', 'cut', TALK, '--name', 'talk', '--piece', dir, '--words', words, '--cuts', cuts, '--scenes', scenes]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /scene: the join at source 3 s keeps its start: a scene change at 2.9 s falls inside "beta"/);
  let e = readJson(join(dir, 'assets/talk/edit.json'));
  assert.deepEqual(e.cuts, [{ at: 3, out: 3, in: 6.1 }], 'the end edge moved onto 6.1, the start edge was held');
  assert.deepEqual(e.settings.scenes.held, [{ edge: 'start', scene: 2.9, word: 'beta', at: 3 }]);
  assert.deepEqual(e.settings.scenes.snapped, [{ edge: 'end', from: 6, to: 6.1, at: 3 }]);

  // with no word in the way both edges move
  const words2 = write(join(TMP, 'apply/words2.json'), W(['alpha', 1.0], ['gamma', 8.0]));
  r = mm(['footage', 'cut', TALK, '--name', 'talk', '--piece', dir, '--words', words2, '--cuts', cuts, '--scenes', scenes]);
  assert.equal(r.status, 0, r.out);
  e = readJson(join(dir, 'assets/talk/edit.json'));
  assert.deepEqual(e.cuts, [{ at: 2.9, out: 2.9, in: 6.1 }]);
  assert.equal(e.settings.scenes.file, 'scenes-held.json');
  assert.equal(e.settings.scenes.snapped.length, 2);
  assert.match(r.stdout, /scene: the join at source 3 s moved its start from 3 s to 2.9 s/);

  // without --scenes the cut is as approved
  r = mm(['footage', 'cut', TALK, '--name', 'talk', '--piece', dir, '--words', words2, '--cuts', cuts]);
  assert.equal(r.status, 0, r.out);
  e = readJson(join(dir, 'assets/talk/edit.json'));
  assert.deepEqual(e.cuts, [{ at: 3, out: 3, in: 6 }]);
  assert.ok(!('scenes' in e.settings));
});

test('cut --scenes: a missing or bad scenes file exits 2 and writes nothing', () => {
  const dir = piece('bad');
  let r = mm(['footage', 'cut', TALK, '--name', 'talk', '--piece', dir, '--scenes', join(TMP, 'bad/nope.json')]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.stderr, /--scenes: no such file/);
  r = mm(['footage', 'cut', TALK, '--name', 'talk', '--piece', dir, '--scenes', write(join(TMP, 'bad/s.json'), { nope: 1 })]);
  assert.equal(r.status, 2, r.out);
  assert.ok(!existsSync(join(dir, 'assets/talk/edit.json')));
});
