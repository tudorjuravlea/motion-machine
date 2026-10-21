// mm media frame: a device frame image you own (a maker's official bezel, a licensed
// render) goes into <piece>/assets/frames/<n>.png, and its screen hole is found by flood fill from
// the centre through transparent pixels: <n>.json records the image size, the hole's box and its
// corner radius, so a device beat with `frame` can put its screen exactly in the hole.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, mm } from './cli-helpers.mjs';

const work = join(ROOT, `.tmp-cli-frame-${process.pid}`);
const png = join(work, 'bezel.png');
before(() => {
  rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  // a 300×620 opaque body with a transparent 260×560 hole at (20, 30) whose corners are rounded by 24 px
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x202124:s=300x620,format=rgba', '-frames:v', '1', '-vf',
    "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(between(X,20,279)*between(Y,30,589)*lte(pow(max(0,max(44-X,X-255)),2)+pow(max(0,max(54-Y,Y-565)),2),576),0,255)'", png]);
  assert.equal(r.status, 0, String(r.stderr));
});
after(() => rmSync(work, { recursive: true, force: true }));

test('the frame is copied and its screen hole found: box and corner radius', () => {
  const r = mm(['media', 'frame', png, '--name', 'test-phone', '--piece', work]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(work, 'assets', 'frames', 'test-phone.png')));
  const j = JSON.parse(readFileSync(join(work, 'assets', 'frames', 'test-phone.json'), 'utf8'));
  assert.deepEqual(j.image, { w: 300, h: 620 });
  assert.deepEqual(j.screen && [j.screen.x, j.screen.y, j.screen.w, j.screen.h], [20, 30, 260, 560]);
  assert.ok(Math.abs(j.screen.radius - 24) <= 4, `radius ${j.screen.radius}`);
});

test('a screen behind semi-transparent glass (a mockup\'s reflection, alpha under one half) is still found', () => {
  const glass = join(work, 'glass.png');
  const r0 = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x202124:s=300x620,format=rgba', '-frames:v', '1', '-vf',
    "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(between(X,20,279)*between(Y,30,589),90,255)'", glass]);
  assert.equal(r0.status, 0, String(r0.stderr));
  const r = mm(['media', 'frame', glass, '--name', 'glass', '--piece', work]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(readFileSync(join(work, 'assets', 'frames', 'glass.json'), 'utf8'));
  assert.deepEqual([j.screen.x, j.screen.y, j.screen.w, j.screen.h], [20, 30, 260, 560]);
});

test('--key: a flat placeholder screen colour (a mockup export) is cut out and measured', () => {
  const flat = join(work, 'flat.png');
  const r0 = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x000000:s=400x260,format=rgba', '-frames:v', '1', '-vf',
    'drawbox=x=30:y=20:w=340:h=200:color=0x1B1B1B:t=fill', flat]);
  assert.equal(r0.status, 0, String(r0.stderr));
  assert.equal(mm(['media', 'frame', flat, '--name', 'flat', '--piece', work]).status, 2, 'without --key an opaque screen is refused');
  const r = mm(['media', 'frame', flat, '--name', 'flat', '--piece', work, '--key']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(readFileSync(join(work, 'assets', 'frames', 'flat.json'), 'utf8'));
  assert.deepEqual([j.screen.x, j.screen.y, j.screen.w, j.screen.h], [30, 20, 340, 200]);
  const a = spawnSync('ffmpeg', ['-v', 'error', '-i', join(work, 'assets', 'frames', 'flat.png'), '-vf', 'crop=1:1:200:120', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 20 }).stdout;
  assert.equal(a[3], 0, 'the screen is transparent in the copied frame');
});

test('an image with no transparent screen at its centre is refused, naming what was expected', () => {
  const solid = join(work, 'solid.png');
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x202124:s=100x200,format=rgba', '-frames:v', '1', solid]);
  const r = mm(['media', 'frame', solid, '--name', 'solid', '--piece', work]);
  assert.equal(r.status, 2); assert.match(r.stderr, /transparent screen/);
});
