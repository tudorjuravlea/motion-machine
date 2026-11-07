// mm capture site --script: a scripted session is recorded as a video, its pointer is written beside it
// as a sidecar (`<name>.cursor.json`: the pointer's samples and the boxes of what was clicked, as
// fractions of the viewport), and the recording is cut into a frame sequence the screen layer plays.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, mm } from './cli-helpers.mjs';
import { parseScript, movePoints, TrackRecorder, CLOCK_OFFSET_MS, flashOffset, shiftTrack, flashChain, cutTrack } from '../../scripts/lib/session.mjs';
import { readTrack } from '../../runtime/kit/cursor.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const SITE = join(ROOT, 'fixtures', 'site', 'session.html');
const work = join(ROOT, `.tmp-cli-session-${process.pid}`);
const url = pathToFileURL(SITE).href;

test('a script is a list of steps; each step names what it does and nothing else', () => {
  const steps = parseScript([{ do: 'wait', ms: 300 }, { do: 'move', to: '#a' }, { do: 'click', on: '#b', ms: 500 }, { do: 'type', text: 'hi', into: '#c' }, { do: 'scroll', by: 400 }, { do: 'scroll', to: '#d' }, { do: 'hover', on: '#e' }, { do: 'goto', url: 'x.html' }]);
  assert.equal(steps.length, 8);
  assert.equal(parseScript({ steps: [{ do: 'wait', ms: 1 }] }).length, 1, 'or an object with a steps list');
  assert.equal(parseScript(JSON.stringify([{ do: 'wait', ms: 1 }])).length, 1, 'or the text of a file');
  const bad = (x, re) => assert.throws(() => parseScript(x), re);
  bad([{ do: 'dance' }], /step 1: "dance" is not a step/);
  bad([{ do: 'click' }], /step 1: click needs on/);
  bad([{ do: 'wait', ms: -5 }], /step 1: wait needs ms/);
  bad([{ do: 'type', text: 'x', speed: 3 }], /step 1: type has no "speed"/);
  bad([{ do: 'scroll' }], /step 1: scroll needs by/);
  bad('{ not json', /not valid JSON/);
  bad([], /no steps/);
  bad({ nope: 1 }, /steps/);
});

test('a pointer move is eased, ends on its target, and is sampled about every 33 ms', () => {
  const pts = movePoints({ x: 0, y: 0 }, { x: 300, y: 120 }, 600);
  assert.deepEqual(pts.at(-1), { x: 300, y: 120, t: 600 });
  assert.equal(pts.length, Math.ceil(600 / 33));
  for (let i = 1; i < pts.length; i++) { assert.ok(pts[i].t > pts[i - 1].t); assert.ok(pts[i].x >= pts[i - 1].x - 1e-9); }
  assert.ok(pts[0].x < 300 / pts.length, 'it eases out of rest');
  assert.deepEqual(movePoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 600).length, 1, 'a move that goes nowhere is one point');
});

test('the recorder writes the sidecar shape: samples as fractions of the viewport, targets with their boxes', () => {
  const r = new TrackRecorder({ w: 1000, h: 500 });
  r.sample(0, 500, 250, { visible: false });
  r.sample(100, 100, 50, { type: 'pointer' });
  r.sample(220, 600, 150, { type: 'pointer', kind: 'click' });
  r.target(220, '#go', { x: 500, y: 100, width: 200, height: 100 });
  r.sample(340, 600, 150, { type: 'pointer', kind: 'mouseup' });
  const json = r.toJSON();
  assert.equal(json.version, 2); assert.equal(json.provider, 'none'); assert.deepEqual(json.surface, { w: 1000, h: 500 });
  assert.deepEqual(json.samples[1], { timeMs: 100, cx: 0.1, cy: 0.1, visible: true, cursorType: 'pointer', interactionType: 'move' });
  assert.equal(json.samples[0].visible, false);
  assert.equal(json.samples[2].interactionType, 'click');
  assert.deepEqual(json.targets, [{ timeMs: 220, selector: '#go', box: { x: 0.5, y: 0.2, w: 0.2, h: 0.2 } }]);
  assert.ok(readTrack(json), 'the kit reads what the recorder writes');
  r.sample(-30, 0, 0);
  assert.equal(r.toJSON().samples.find((s) => s.cx === 0 && s.cy === 0).timeMs, 0, 'a time before the first video frame is the first frame');
});

test('cutting a recording cuts its track: times from the cut, the pointer held where it stood, the rest dropped', () => {
  const raw = { version: 2, provider: 'none', samples: [
    { timeMs: 100, cx: 0.1, cy: 0.1 }, { timeMs: 900, cx: 0.4, cy: 0.4 }, { timeMs: 1500, cx: 0.5, cy: 0.5, interactionType: 'click' }, { timeMs: 2500, cx: 0.9, cy: 0.9 }, { timeMs: 9000, cx: 1, cy: 1 }],
  targets: [{ timeMs: 500, selector: '#early', box: { x: 0, y: 0, w: 0.1, h: 0.1 } }, { timeMs: 1500, selector: '#go', box: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 } }] };
  const cut = cutTrack(raw, 1, 3);
  assert.deepEqual(cut.samples.map((s) => [s.timeMs, s.cx]), [[0, 0.4], [500, 0.5], [1500, 0.9]], 'held at 0 where it stood, then the rest shifted, and nothing past the end');
  assert.deepEqual(cut.targets.map((g) => [g.timeMs, g.selector]), [[500, '#go']]);
  assert.equal(cut.samples[1].interactionType, 'click');
  assert.equal(raw.samples.length, 5, 'the original is not changed');
  assert.deepEqual(cutTrack(raw, 0, 0.1).samples.map((s) => s.timeMs), [100], 'a cut from 0 holds nothing and keeps what falls inside');
});

test('the flashes in a video are the first runs of red 0.45 s apart or less; a later red page is not one', () => {
  assert.deepEqual(flashChain([0.3, 0.6, 0.9, 1.2, 1.5, 3.9, 4.0]), [0.3, 0.6, 0.9, 1.2, 1.5]);
  assert.deepEqual(flashChain([2.9]), [2.9]);
  assert.deepEqual(flashChain([]), []);
});

test('the clock is set by the sync flashes: the mean of when each was shown less when each appears in the video', () => {
  assert.equal(flashOffset([1000, 1300, 1600], [960, 1260, 1560]), 40);
  assert.equal(flashOffset([1000, 1300, 1600], [100, 410, 1500]), (900 + 890 + 100) / 3);
  assert.equal(flashOffset([1000, 1300, 1600], [960, 1260]), CLOCK_OFFSET_MS, 'a flash that was not seen: the measured fallback of 40 ms');
  assert.equal(flashOffset([1000], []), CLOCK_OFFSET_MS);
  const shifted = shiftTrack({ version: 2, samples: [{ timeMs: 500, cx: 0.5, cy: 0.5 }, { timeMs: 30, cx: 0, cy: 0 }], targets: [{ timeMs: 500, selector: '#a', box: { x: 0, y: 0, w: 1, h: 1 } }] }, 100);
  assert.deepEqual(shifted.samples.map((s) => s.timeMs), [400, 0], 'every time moves earlier by the offset, none before the first frame');
  assert.equal(shifted.targets[0].timeMs, 400);
});

// --- the whole thing, in a browser ---------------------------------------------------------
const script = [
  { do: 'wait', ms: 400 },
  { do: 'click', on: '#go', ms: 500 },
  { do: 'type', text: 'Ada', into: '#name' },
  { do: 'hover', on: '.menu > span' },
  { do: 'scroll', by: 300, ms: 400 },
  { do: 'wait', ms: 300 },
];
let result, dir;
const asset = (n) => join(dir, 'assets', n);
before(() => {
  rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  dir = work;
  writeFileSync(join(work, 'steps.json'), JSON.stringify(script));
  result = mm(['capture', 'site', '--url', url, '--name', 'ses', '--piece', work, '--device', 'laptop', '--script', join(work, 'steps.json')]);
});
after(() => rmSync(work, { recursive: true, force: true }));

test('the session is written: the recording, its pointer sidecar beside it, and a frame sequence that carries the sidecar', () => {
  assert.equal(result.status, 0, result.out);
  assert.ok(existsSync(asset('ses.webm')), 'the raw recording');
  assert.ok(existsSync(asset('ses.cursor.json')), 'the sidecar beside the capture');
  const meta = JSON.parse(readFileSync(join(asset('ses'), 'media.json'), 'utf8'));
  assert.equal(meta.kind, 'sequence');
  assert.equal(meta.cursor, 'cursor.json');
  assert.ok(existsSync(join(asset('ses'), 'cursor.json')), 'the track travels with the frames');
  assert.ok(meta.frames > 30 && meta.duration > 2, `${meta.frames} frames, ${meta.duration} s`);
  assert.match(result.out, /first frame/, 'the command says whether the first frame is black');
  assert.match(result.out, /packets/, 'and what the duration was checked against');
});

test('the sidecar is the OpenScreen v2 shape with the click target\'s box, and the click is on the right element', () => {
  const side = JSON.parse(readFileSync(asset('ses.cursor.json'), 'utf8'));
  assert.equal(side.version, 2);
  assert.deepEqual(side.surface, { w: 1440, h: 900 });
  assert.ok(side.samples.length > 20);
  for (const s of side.samples) {
    assert.ok(s.cx >= 0 && s.cx <= 1 && s.cy >= 0 && s.cy <= 1);
    assert.ok(['move', 'click', 'mouseup'].includes(s.interactionType));
  }
  const click = side.samples.find((s) => s.interactionType === 'click');
  assert.ok(click, 'a click sample');
  assert.equal(click.cursorType, 'pointer', 'the cursor of the button under the pointer');
  assert.equal(side.targets[0].selector, '#go');
  const b = side.targets[0].box;
  assert.ok(click.cx > b.x && click.cx < b.x + b.w && click.cy > b.y && click.cy < b.y + b.h, 'the click lands inside the target box');
  assert.ok(b.w > 0.05 && b.w < 0.3 && b.h > 0.02 && b.h < 0.2, JSON.stringify(b));
  assert.equal(side.targets[0].timeMs, click.timeMs);
  // the cursor was hidden before it first moved, and a text field showed the I-beam
  assert.equal(side.samples[0].visible, false);
  assert.ok(side.samples.some((s) => s.cursorType === 'text'), 'the text field under the pointer');
  for (let i = 1; i < side.samples.length; i++) assert.ok(side.samples[i].timeMs >= side.samples[i - 1].timeMs);
});

test('the clock is aligned to the first frame: a scripted click lands within one frame of the picture that shows it', () => {
  const side = JSON.parse(readFileSync(asset('ses.cursor.json'), 'utf8'));
  const click = side.samples.find((s) => s.interactionType === 'click');
  // the fixture page turns red on mousedown; find the first red frame in the raw recording
  const w = 40, h = 25;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', asset('ses.webm'), '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
  const n = r.stdout.length / (w * h * 3);
  // runs of red frames: the three sync flashes first, then the page turning red under each click
  const runs = [];
  let on = false;
  for (let i = 0; i < n; i++) { const o = i * w * h * 3 + (2 * w + 2) * 3; const red = r.stdout[o] > 220 && r.stdout[o + 1] < 60 && r.stdout[o + 2] < 60; if (red && !on) runs.push(i); on = red; }
  assert.ok(runs.length >= 5, `at least three flashes and a click: ${runs.length} red runs`);
  const frameMs = runs.map((i) => i * 40).reduce((a, b) => (Math.abs(b - click.timeMs) < Math.abs(a - click.timeMs) ? b : a));   // the red run nearest the click; Playwright records 25 frames a second
  assert.ok(Math.abs(frameMs - click.timeMs) <= 40, `the click is at ${click.timeMs} ms, the first red frame at ${frameMs} ms`);
  assert.ok(side.sync && side.sync.method === 'flashes' && side.sync.flashes >= 3 && Number.isFinite(side.sync.offsetMs), `the sidecar says how its clock was set: ${JSON.stringify(side.sync)}`);
});

test('the prepared frames begin when the flashes are over: the first frame is the page, not a flash', () => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', join(asset('ses'), 'f00001.jpg'), '-vf', 'scale=32:20', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 });
  let red = 0;
  for (let i = 0; i < 32 * 20; i++) if (r.stdout[i * 3] > 200 && r.stdout[i * 3 + 1] < 70 && r.stdout[i * 3 + 2] < 70) red++;
  assert.ok(red < 32 * 20 * 0.1, `${red} of 640 pixels of the first frame are red`);
});

test('the prepared frames begin when the page has loaded, and the track is shifted to match', () => {
  const side = JSON.parse(readFileSync(asset('ses.cursor.json'), 'utf8'));
  const prepared = JSON.parse(readFileSync(join(asset('ses'), 'cursor.json'), 'utf8'));
  assert.equal(prepared.samples.length > 0, true);
  const raw = side.samples.find((s) => s.interactionType === 'click').timeMs;
  const cut = prepared.samples.find((s) => s.interactionType === 'click').timeMs;
  assert.ok(cut <= raw && raw - cut < 2500, `raw click ${raw} ms, in the cut ${cut} ms`);
  assert.ok(prepared.samples[0].timeMs >= 0);
  assert.equal(prepared.targets[0].timeMs, cut);
});

test('a first frame that is not black is said to be fine; a step that cannot find its element exits 2 and writes nothing', () => {
  assert.match(result.out, /first frame (is )?(ok|not black)/i);
  writeFileSync(join(work, 'bad.json'), JSON.stringify([{ do: 'click', on: '#nope' }]));
  const bad = mm(['capture', 'site', '--url', url, '--name', 'bad', '--piece', work, '--device', 'laptop', '--script', join(work, 'bad.json')]);
  assert.equal(bad.status, 2, bad.out);
  assert.match(bad.out, /step 1: .*#nope .*matched nothing/);
  assert.ok(!existsSync(asset('bad.webm')) && !existsSync(asset('bad')), 'nothing is written for a failed session');
  writeFileSync(join(work, 'mix.json'), JSON.stringify([{ do: 'wait', ms: 10 }]));
  const mix = mm(['capture', 'site', '--url', url, '--name', 'mix', '--piece', work, '--script', join(work, 'mix.json'), '--mark', 'A=#go']);
  assert.equal(mix.status, 2, mix.out);
  assert.match(mix.out, /--mark/);
});

test('a capture with no script is the page capture it always was', () => {
  const r = mm(['capture', 'site', '--url', url, '--name', 'plain', '--piece', work, '--device', 'laptop']);
  assert.equal(r.status, 0, r.out);
  assert.equal(JSON.parse(readFileSync(join(asset('plain'), 'media.json'), 'utf8')).kind, 'page');
  assert.ok(!existsSync(asset('plain.cursor.json')));
});
