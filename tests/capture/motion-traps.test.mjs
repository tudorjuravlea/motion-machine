// Motion capture against three known measuring traps, each on a labelled synthetic clip made here with ffmpeg:
//  (a) a small mover in a mostly still, noisy frame is an arrival, not a hold: whole-frame averaging buries it,
//      so activity is read from the most active part of the frame;
//  (b) a staggered group of ease-out elements: each element's easing is not recoverable from the summed curve,
//      so the group reports no one ease and the notes say so;
//  (c) a burned-in static overlay over a moving picture does not vote the camera still: regions that never
//      change in the whole film are masked before a shift or a replacement is measured.
// Every clip has a control beside it, so a fix cannot pass by seeing motion everywhere.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bin } from '../../scripts/lib/ffmpeg.mjs';
import { analyse, captureMotion, extractFrames } from '../../scripts/capture-motion.mjs';

let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), 'mm-capture-traps-')); });
after(() => rmSync(dir, { recursive: true, force: true }));

function ffmpeg(name, args) {
  const out = join(dir, `${name}.mp4`);
  const r = spawnSync(bin('ffmpeg'), ['-v', 'error', '-y', ...args, '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${name}: ${r.stderr}`);
  return out;
}
const src = (spec) => ['-f', 'lavfi', '-i', spec];
const read = async (file) => analyse(await extractFrames(file));

// (a) a 6 px square, 4 s, 320x180, moving over a second with an ease-out; temporal noise over everything
const EASE = '(1-pow(1-clip((t-1)/1,0,1),3))';
const still = (name) => ffmpeg(name, [...src('color=c=0x404040:s=320x180:d=4:r=30'), '-vf', 'noise=alls=10:allf=t']);
const mover = (name) => ffmpeg(name, [...src('color=c=0x404040:s=320x180:d=4:r=30'), ...src('color=c=0x808080:s=6x6:d=4:r=30'),
  '-filter_complex', `[0][1]overlay=x='20+260*${EASE}':y=80:eval=frame,noise=alls=10:allf=t`]);

test('(a) a small mover in a mostly still, noisy frame is an arrival, not a hold', async () => {
  const a = await read(mover('small-mover'));
  assert.ok(a.arrivals.length >= 1, `the mover was read as a hold: ${JSON.stringify(a.arrivals)}`);
  const first = a.arrivals[0];
  assert.ok(first.t >= 0.8 && first.t <= 1.3, `it starts at 1 s: ${first.t}`);
  assert.ok(first.end <= 2.6, `it ends by 2 s or soon after: ${first.end}`);
});

test('(a) control: the same noisy frame with nothing moving reads no arrival and no cut', async () => {
  const a = await read(still('noise-only'));
  assert.deepEqual([a.arrivals.length, a.cuts.length], [0, 0], JSON.stringify([a.arrivals, a.cuts]));
});

// (b) four boxes arriving in turn, each an ease-out cubic over half a second, a quarter second apart; and one alone
const rise = (i, at) => `overlay=x=${30 + 70 * i}:y='70+130*pow(1-clip((t-${at})/0.5,0,1),3)':eval=frame`;
const group = () => ffmpeg('staggered', [...src('color=c=0x303030:s=320x180:d=4:r=30'), ...[0, 1, 2, 3].flatMap(() => src('color=c=white:s=50x40:d=4:r=30')),
  '-filter_complex', `[0][1]${rise(0, 1)}[a];[a][2]${rise(1, 1.25)}[b];[b][3]${rise(2, 1.5)}[c];[c][4]${rise(3, 1.75)}`]);
const alone = () => ffmpeg('single', [...src('color=c=0x303030:s=320x180:d=4:r=30'), ...src('color=c=white:s=50x40:d=4:r=30'),
  '-filter_complex', `[0][1]${rise(1, 1)}`]);

test('(b) a staggered group is marked, reports no one ease, and the notes say the easing is not recoverable', async () => {
  const out = join(dir, 'staggered.json');
  const r = await captureMotion({ from: group(), name: 'staggered', out });
  const marked = r.analysis.arrivals.filter((a) => a.staggered);
  assert.ok(marked.length >= 2, `the group is several arrivals marked staggered: ${JSON.stringify(r.analysis.arrivals.map((a) => [a.t, a.staggered]))}`);
  for (const a of marked) assert.equal(a.easing, 'not recoverable');
  const notes = readFileSync(r.notesPath, 'utf8');
  assert.match(notes, /staggered[^\n]*not recoverable|not recoverable[^\n]*staggered/i);
  assert.ok(r.facts.arrivals.filter((a) => a.staggered).every((a) => a.easing === 'not recoverable'));
});

test('(b) control: one element on its own is not a staggered group, and the notes do not claim one', async () => {
  const out = join(dir, 'single.json');
  const r = await captureMotion({ from: alone(), name: 'single', out });
  assert.ok(r.analysis.arrivals.length >= 1);
  assert.ok(r.analysis.arrivals.every((a) => !a.staggered));
  assert.doesNotMatch(readFileSync(r.notesPath, 'utf8'), /not recoverable/);
});

// (c) a textured picture panned by 200 px over a second (an ease), and the same pan under a burned-in static textured band
const PAN = "crop=320:180:x='clip(t-1,0,1)*(3-2*clip(t-1,0,1))*200':y=0";
const picture = 'color=c=0x606060:s=640x180:d=4:r=30,noise=alls=60:all_seed=1:allf=u';
const clean = () => ffmpeg('pan-clean', [...src(picture), '-vf', PAN]);
const burned = (name, h) => ffmpeg(name, [...src(picture), ...src(`color=c=0x303030:s=320x${h}:d=4:r=30,noise=alls=70:all_seed=7:allf=u`),
  '-filter_complex', `[0]${PAN}[a];[a][1]overlay=x=0:y=${180 - h}`]);
const kinds = (a) => a.cuts.map((c) => c.kind);

test('(c) a pan is a push; a burned-in static band over it (a third, then nearly half the frame) does not vote the camera still', async () => {
  const base = await read(clean());
  assert.deepEqual(kinds(base), ['push'], 'the clean pan reads as a push');
  for (const [name, h] of [['pan-third', 60], ['pan-half', 90]]) {
    const a = await read(burned(name, h));
    assert.deepEqual(kinds(a), ['push'], `${name}: ${JSON.stringify(a.cuts.map((c) => [c.t, c.kind]))}, arrivals ${JSON.stringify(a.arrivals.map((x) => [x.t, x.end]))}`);
    assert.equal(a.cuts[0].direction, base.cuts[0].direction, `${name}: the same direction`);
    assert.ok(Math.abs(a.cuts[0].t - base.cuts[0].t) <= 0.1, `${name}: the same onset (${a.cuts[0].t} vs ${base.cuts[0].t})`);
  }
});

test('(c) control: the same static band over a picture that does not move reads no cut and no arrival', async () => {
  const still = ffmpeg('band-only', [...src(picture), ...src('color=c=0x303030:s=320x90:d=4:r=30,noise=alls=70:all_seed=7:allf=u'),
    '-filter_complex', '[0]crop=320:180:x=0:y=0[a];[a][1]overlay=x=0:y=90']);
  const a = await read(still);
  assert.deepEqual([a.cuts.length, a.arrivals.length], [0, 0], JSON.stringify([a.cuts, a.arrivals]));
});
