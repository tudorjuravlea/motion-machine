// scripts/lib/frame-rate.mjs: the rates a file can have, recognised exactly (23.976, 29.97, 59.94 are
// 24000/1001, 30000/1001, 60000/1001, never 24, 30, 60), and a constant-rate detector that reads packet times.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMON_RATES, detectRate, exactFps, fractionOf, nameOfRate, sameRate, snapRate } from '../../scripts/lib/frame-rate.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { bin } from '../../scripts/lib/ffmpeg.mjs';
import { packetTimes } from '../../scripts/lib/export-qa.mjs';

const times = (n, num, den, t0 = 0) => Array.from({ length: n }, (_, i) => t0 + (i * den) / num);

test('exactFps maps the broadcast rates a person types to their exact fractions, and leaves the rest alone', () => {
  assert.deepEqual(exactFps(29.97), { value: 30000 / 1001, arg: '30000/1001', name: '29.97' });
  assert.deepEqual(exactFps(23.976), { value: 24000 / 1001, arg: '24000/1001', name: '23.976' });
  assert.deepEqual(exactFps(59.94), { value: 60000 / 1001, arg: '60000/1001', name: '59.94' });
  assert.equal(exactFps(30).arg, '30');
  assert.equal(exactFps(30).value, 30);
  assert.equal(exactFps(60).name, '60');
  assert.equal(exactFps(12.5).arg, '12.5');
  assert.equal(exactFps(24).arg, '24', '24 is 24, not 23.976');
  assert.equal(exactFps(30000 / 1001).arg, '30000/1001', 'the exact value maps back to its fraction');
});

test('nameOfRate and snapRate tell 30 from 29.97 and 24 from 23.976', () => {
  assert.equal(nameOfRate(30000 / 1001), '29.97');
  assert.equal(nameOfRate(30), '30');
  assert.equal(nameOfRate(24000 / 1001), '23.976');
  assert.equal(nameOfRate(60000 / 1001), '59.94');
  assert.equal(nameOfRate(13.37), null);
  assert.deepEqual(snapRate(29.9701), { num: 30000, den: 1001, name: '29.97' });
  assert.deepEqual(snapRate(30.0003), { num: 30, den: 1, name: '30' });
  assert.equal(snapRate(27), null, 'a rate nobody ships is not snapped');
  assert.ok(COMMON_RATES.some(([n, d]) => n === 24000 && d === 1001));
});

test('fractionOf reads ffprobe\'s "n/d" and sameRate compares exactly', () => {
  assert.deepEqual(fractionOf('30000/1001'), { num: 30000, den: 1001, value: 30000 / 1001 });
  assert.equal(fractionOf('0/0'), null);
  assert.equal(fractionOf('x'), null);
  assert.ok(sameRate(30000 / 1001, fractionOf('30000/1001').value));
  assert.ok(!sameRate(30, 30000 / 1001), '30 and 29.97 are different rates');
  assert.ok(!sameRate(29.97, 30000 / 1001), 'a rounded 29.97 is not the broadcast rate');
});

test('detectRate: constant packet times give the rate, snapped to the common list', () => {
  for (const [num, den, name] of [[30, 1, '30'], [30000, 1001, '29.97'], [24000, 1001, '23.976'], [60, 1, '60'], [25, 1, '25'], [60000, 1001, '59.94']]) {
    const d = detectRate(times(120, num, den));
    assert.equal(d.constant, true, name);
    assert.equal(d.snapped?.name, name);
    assert.ok(Math.abs(d.fps - num / den) < 1e-6, `${name}: ${d.fps}`);
  }
});

test('detectRate: a dropped frame, a hold and a stutter are not a constant rate', () => {
  const t = times(100, 30, 1);
  const dropped = t.filter((_, i) => i !== 50);
  assert.equal(detectRate(dropped).constant, false);
  const vfr = [...t.slice(0, 40), ...t.slice(40).map((x) => x + 0.5)];
  assert.equal(detectRate(vfr).constant, false);
});

test('detectRate: unordered times, B-frame style, and a start offset', () => {
  const t = times(64, 25, 1, 1.5);
  const shuffled = [...t.slice(2, 4), ...t.slice(0, 2), ...t.slice(4)];
  const d = detectRate(shuffled);
  assert.equal(d.snapped.name, '25');
  assert.equal(d.constant, true);
});

test('detectRate: too few packets say so', () => {
  assert.equal(detectRate([]), null);
  assert.equal(detectRate([0]), null);
  assert.equal(detectRate([0, 0]), null, 'no gap at all');
  assert.equal(detectRate(times(2, 30, 1)).snapped.name, '30');
});

test('detectRate reads at most 256 packets', () => {
  const d = detectRate(times(1000, 30, 1));
  assert.equal(d.packets, 256);
});

test('a real H.264 file longer than the window reads constant: its packets come in decode order, so the window takes them all and sorts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-fps-'));
  try {
    const file = join(dir, 'long.mp4');
    const r = spawnSync(bin('ffmpeg'), ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=30:duration=12', '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '16', '-pix_fmt', 'yuv420p', file]);
    assert.equal(r.status, 0, String(r.stderr));
    const d = detectRate(packetTimes(file));
    assert.equal(d.snapped.name, '30');
    assert.equal(d.constant, true, 'a constant 30 fps file with B-frames is constant');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
