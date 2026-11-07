// mm showcase: one command from a screen recording or a still to a finished device film. The plan, the
// --check report and the story it writes are pure; the dry run is run end to end (it renders nothing).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, mm } from './cli-helpers.mjs';
import { parseShowcase, planShowcase, checkReport, storyOf, stillTimes, audioMuxArgs } from '../../scripts/showcase.mjs';

const video = (w, h, duration = 8) => ({ kind: 'video', w, h, duration, codec: 'h264', hdr: false });
const image = (w, h) => ({ kind: 'image', w, h, duration: null, codec: 'png', hdr: false });
const plan = (args, probe) => planShowcase(parseShowcase(args), probe);

test('the device follows the content: a portrait recording on a phone, a landscape one on a laptop', () => {
  assert.equal(plan(['rec.mp4'], video(1170, 2532)).device, 'phone');
  assert.equal(plan(['rec.mp4'], video(1920, 1080)).device, 'laptop');
  assert.equal(plan(['rec.mp4', '--device', 'tablet'], video(1920, 1080)).orientation, 'landscape');
  assert.equal(plan(['rec.mp4', '--device', 'tablet'], video(1200, 1600)).orientation, 'portrait');
});

test('the format is the one nearest the device screen, unless --format says', () => {
  assert.equal(plan(['rec.mp4'], video(1170, 2532)).format, '9x16');
  assert.equal(plan(['rec.mp4'], video(1920, 1080)).format, '16x9');
  assert.equal(plan(['rec.mp4', '--device', 'tablet'], video(1200, 1600)).format, '4x5');
  assert.equal(plan(['rec.mp4', '--format', '1x1'], video(1170, 2532)).format, '1x1');
});

test('a landscape recording on a phone is refused with the devices that take it', () => {
  assert.throws(() => plan(['rec.mp4', '--device', 'phone'], video(1920, 1080)), /portrait.*tablet, laptop or browser/);
});

test('the duration is the whole recording, held to 6 to 120 s; a still is 10 s; --duration wins', () => {
  assert.equal(plan(['rec.mp4'], video(1170, 2532, 14.2)).duration, 14.2);
  assert.equal(plan(['rec.mp4'], video(1170, 2532, 2)).duration, 6);
  assert.equal(plan(['rec.mp4'], video(1170, 2532, 400)).duration, 120);
  assert.equal(plan(['shot.png'], image(1170, 2532)).duration, 10);
  assert.equal(plan(['rec.mp4', '--duration', '4'], video(1170, 2532, 14)).duration, 4);
});

test('looks are the device\'s own moves, and nothing zooms unless --zoom asks', () => {
  const p = plan(['rec.mp4'], video(1170, 2532));
  assert.deepEqual([p.look, p.move, p.zooms], ['hero', 'hero', false]);
  for (const look of ['turntable', 'still', 'showcase']) assert.equal(plan(['rec.mp4', '--look', look], video(1170, 2532)).zooms, false);
  const z = plan(['rec.mp4', '--zoom'], video(1170, 2532));
  assert.deepEqual([z.move, z.zooms], ['hero', true]);
  assert.equal(plan(['shot.png', '--zoom'], image(1170, 2532)).zooms, false, 'a still has no clicks to zoom on');
  assert.equal(plan(['rec.mp4', '--look', 'turntable'], video(1920, 1080)).move, 'turntable');
  assert.throws(() => plan(['rec.mp4', '--look', 'cross'], video(1920, 1080)), /laptop takes hero, turntable, still, showcase,/);
  assert.throws(() => plan(['rec.mp4', '--look', 'auto'], video(1170, 2532)), /phone takes/);
  assert.equal(storyOf(plan(['rec.mp4'], video(1170, 2532)), { track: true, regions: [{ at: 1, hold: 1, x: 0.5, y: 0.5, depth: 2 }] }).scenes[0].beats[0].screen, undefined, 'without --zoom a track or measured motion adds nothing');
});

test('--contained keeps the device inside the safe margin and refuses --zoom', () => {
  assert.equal(storyOf(plan(['rec.mp4', '--contained'], video(1170, 2532))).scenes[0].layout, 'layouts/caption-bar');
  assert.equal(storyOf(plan(['rec.mp4'], video(1170, 2532))).scenes[0].layout, 'layouts/stage');
  assert.throws(() => parseShowcase(['rec.mp4', '--zoom', '--contained']), /makes no zooms/);
});

test('usage mistakes exit 2 before anything is read', () => {
  assert.throws(() => parseShowcase([]), /needs one file/);
  assert.throws(() => parseShowcase(['a.mp4', '--device', 'watch']), /--device takes phone, tablet, laptop, browser/);
  assert.throws(() => parseShowcase(['a.mp4', '--fps', '90']), /--fps takes 5 to 60/);
  assert.throws(() => parseShowcase(['a.mp4', '--background', 'rgb(0,0,0)']), /--background takes a hex colour/);
  assert.throws(() => parseShowcase(['notes.txt']), /a video .* or a still/);
});

test('the story is generated: stamped, one scene the length of the film, the device on the stage', () => {
  const p = plan(['rec.mp4', '--zoom'], video(1170, 2532, 9));
  const s = storyOf(p, { regions: [{ at: 2, hold: 1, x: 0.3, y: 0.4, depth: 2 }] });
  assert.equal(s.generator, 'scripts/showcase.mjs');
  assert.deepEqual(s.formats, ['9x16']);
  assert.equal(s.scenes.length, 1);
  const [sc] = s.scenes, [beat] = sc.beats;
  assert.equal(sc.duration, 9);
  assert.deepEqual([beat.slot, beat.fx, beat.asset, beat.params.move], ['stage', '3d/phone', 'assets/rec/', 'hero']);
  const zoom = beat.screen.find((a) => a.do === 'screen/zoom-to');
  assert.deepEqual([zoom.params.mode, zoom.params.suggest, zoom.params.regions.length], ['auto', false, 1]);
  // with a pointer track, --zoom zooms on its clicks and taps (the camera's own suggestions)
  const clicks = storyOf(p, { track: true }).scenes[0].beats[0].screen[0];
  assert.deepEqual(clicks.params, { mode: 'auto' });
  const still = storyOf(plan(['shot.png'], image(1170, 2532)));
  assert.equal(still.scenes[0].beats[0].asset, 'assets/screen.png');
  assert.equal(still.scenes[0].beats[0].screen, undefined);
});

test('a browser is the flat window with the scene\'s drift as its hero', () => {
  const s = storyOf(plan(['rec.mp4', '--device', 'browser'], video(1920, 1080)));
  assert.equal(s.scenes[0].beats[0].fx, 'devices/browser');
  assert.equal(s.scenes[0].move, 'moves/hero-drift');
  assert.equal(storyOf(plan(['rec.mp4', '--device', 'browser', '--look', 'still'], video(1920, 1080))).scenes[0].move, null);
});

test('the check report names the device, the look, the length, the format and the output', () => {
  const p = plan(['rec.mp4', '--html', '--background', '#112233'], { ...video(1170, 2532, 31.4), hdr: true });
  const text = checkReport(p).join('\n');
  for (const want of ['content: video 1170x2532, 31.4 s', 'device: 3d/phone (portrait)', 'look: hero, no zooms', 'duration 31.4 s at 30 fps', 'format: 9x16', 'background: #112233', 'hero page', 'HDR']) assert.ok(text.includes(want), `missing "${want}" in\n${text}`);
});

test('stills: a count spreads evenly, seconds are kept and held to the film', () => {
  assert.deepEqual(stillTimes('3', 10), [0, 5, 9.967]);
  assert.deepEqual(stillTimes('0,2.5,40', 10), [0, 2.5, 9.967]);
  assert.throws(() => stillTimes('1', 10), /2 to 24/);
  assert.throws(() => stillTimes('a,b', 10), /a count .* or seconds/);
});

test('audio is laid under the picture with the video copied, padded or trimmed, and faded out', () => {
  const a = audioMuxArgs('in.mp4', 'track.wav', 'out.mp4', 10);
  assert.ok(a.includes('-shortest') && a.includes('copy'));
  assert.ok(a.join(' ').includes('afade=t=out:st=9.2:d=0.8,apad'));
});

const work = join(ROOT, `.tmp-cli-showcase-${process.pid}`);
before(() => { rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true }); });
after(() => rmSync(work, { recursive: true, force: true }));

test('--check prints the plan on stdout and writes nothing', () => {
  const clip = join(work, 'clip.mp4');
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=390x844:rate=30:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]).status, 0);
  const piece = join(work, 'piece');
  const r = mm(['showcase', clip, '--check', '--piece', piece]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /device: 3d\/phone \(portrait\)/);
  assert.match(r.stdout, /duration 6 s/);
  assert.ok(!existsSync(piece), 'a dry run writes no piece');
});
