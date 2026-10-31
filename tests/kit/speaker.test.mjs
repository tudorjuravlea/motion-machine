// runtime/kit/speaker.js: the speaker's pose scene by scene, the face box and the move that clears it.
// All pure: the pose at t is a function of the scene list and t, so it is the same in any seek order and
// the frame at a scene's start comes from the previous scene's mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAD_S, MOVE_S, MODES, KNOBS, resolveFrame, modeBox, panelBox, poseAt, drifted, widest, faceRect, clearFace, parseFace, median } from '../../runtime/kit/speaker.js';

const W = 1080, H = 1920, safe = 72, hero = { x: 0, y: 0, w: W, h: H };
const c = { W, H, safe, hero, ease: (p) => p };   // a linear ease makes the arithmetic plain
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const key = (at, mode, o = {}) => ({ at, frame: resolveFrame({ mode, ...o }) });

test('every mode has a box; hero is the layout\'s own pose, side a column, bottom the lower part, hidden below the frame at no opacity', () => {
  assert.deepEqual(MODES, ['hero', 'side', 'inset', 'bottom', 'hidden']);
  assert.deepEqual(modeBox(resolveFrame('hero'), c), { ...hero, o: 1 });
  const left = modeBox(resolveFrame('side'), c), right = modeBox(resolveFrame({ mode: 'side', side: 'right' }), c);
  near(left.w, W * KNOBS.sideSize); assert.equal(left.x, 0); assert.equal(left.h, H);
  near(right.x + right.w, W);
  const bottom = modeBox(resolveFrame('bottom'), c);
  near(bottom.y + bottom.h, H); near(bottom.h, H * KNOBS.bottomSize); assert.equal(bottom.w, W);
  const gone = modeBox(resolveFrame('hidden'), c);
  assert.equal(gone.o, 0); assert.ok(gone.y >= H, 'parked below the frame');
});

test('inset: the corner is a param and the card stays inside the safe area', () => {
  for (const corner of ['tl', 'tr', 'bl', 'br']) {
    const b = modeBox(resolveFrame({ mode: 'inset', corner }), c);
    assert.ok(b.x >= safe - 0.01 && b.x + b.w <= W - safe + 0.01 && b.y >= safe - 0.01 && b.y + b.h <= H - safe + 0.01, `${corner} ${JSON.stringify(b)}`);
    assert.equal(corner[1] === 'l' ? b.x : W - b.x - b.w, safe);
    assert.equal(corner[0] === 't' ? b.y : H - b.y - b.h, safe);
  }
  const small = modeBox(resolveFrame({ mode: 'inset', size: 0.2 }), c), big = modeBox(resolveFrame({ mode: 'inset', size: 0.5 }), c);
  assert.ok(small.w < big.w);
});

test('a brand sets the defaults; a scene\'s own frame wins; an unknown mode is hero and named', () => {
  assert.equal(resolveFrame(undefined, {}, false).mode, 'hero');
  assert.equal(resolveFrame(undefined, {}, true).mode, 'side', 'a scene with a panel beat takes panelFrame');
  assert.equal(resolveFrame(undefined, { frame: 'inset', corner: 'tl' }, false).mode, 'inset');
  assert.equal(resolveFrame(undefined, { frame: 'inset', corner: 'tl' }, false).corner, 'tl');
  assert.equal(resolveFrame('bottom', { frame: 'inset' }, false).mode, 'bottom');
  const bad = resolveFrame('cinema');
  assert.equal(bad.mode, 'hero'); assert.equal(bad.bad, 'cinema');
  assert.equal(resolveFrame(undefined, { sideSize: 0.3 }).sideSize, 0.3);
  assert.equal(resolveFrame({ mode: 'side', size: 0.6 }, { sideSize: 0.3 }).sideSize, 0.6);
});

test('the panel is the rest of the frame beside the speaker, inside the safe area', () => {
  const side = panelBox(resolveFrame('side'), c), sp = modeBox(resolveFrame('side'), c);
  assert.ok(side.x >= sp.x + sp.w, 'right of the column');
  near(side.x + side.w, W - safe);
  const bottom = panelBox(resolveFrame('bottom'), c), sb = modeBox(resolveFrame('bottom'), c);
  assert.ok(bottom.y + bottom.h <= sb.y, 'above the speaker');
  assert.deepEqual(panelBox(resolveFrame('hero'), c), { x: safe, y: safe, w: W - 2 * safe, h: H - 2 * safe });
});

test('the first scene holds its mode; a later scene\'s move starts LEAD_S before it lands and takes MOVE_S', () => {
  const keys = [key(0, 'hero'), key(4, 'side')];
  const side = modeBox(keys[1].frame, c);
  assert.deepEqual(poseAt(keys, 0, c), { ...hero, o: 1 });
  assert.deepEqual(poseAt(keys, 4 - LEAD_S - 0.001, c), { ...hero, o: 1 }, 'not moving before the lead');
  const mid = poseAt(keys, 4 - LEAD_S + MOVE_S / 2, c);
  near(mid.w, (W + side.w) / 2, 1e-4);
  const done = poseAt(keys, 4 - LEAD_S + MOVE_S + 0.001, c);
  near(done.w, side.w); near(done.x, side.x);
  assert.ok(poseAt(keys, 4, c).w < W, 'at the scene\'s start the move is already under way');
  assert.ok(poseAt(keys, 4, c).w > side.w, 'and not over');
});

test('the pose at a scene\'s start is computed from the previous scene\'s mode, in any order of asking', () => {
  const keys = [key(0, 'side'), key(3, 'inset', { corner: 'tr' }), key(6, 'hero'), key(9, 'bottom')];
  const ts = [0, 1.5, 2.9, 2.95, 3.0, 3.2, 3.5, 5.9, 6.0, 6.2, 8.8, 9.0, 9.4, 12];
  const fwd = ts.map((t) => poseAt(keys, t, c));
  const rev = [...ts].reverse().map((t) => poseAt(keys, t, c)).reverse();
  assert.deepEqual(fwd, rev);
  // the second move starts from where the first left the box, so the boxes never jump
  let last = fwd[0];
  for (let i = 0; i <= 1200; i++) {
    const p = poseAt(keys, i / 100, c);
    assert.ok(Math.abs(p.x - last.x) + Math.abs(p.y - last.y) + Math.abs(p.w - last.w) + Math.abs(p.h - last.h) < 120, `no jump at ${i / 100}`);
    last = p;
  }
});

test('a move that is still running when the next starts hands its pose over: no pop', () => {
  // scenes 0.3 s apart: the second move starts while the first is half way
  const keys = [key(0, 'hero'), key(2, 'side'), key(2.3, 'bottom')];
  const at = 2.3 - LEAD_S;
  const before = poseAt(keys, at - 1e-6, c), after = poseAt(keys, at + 1e-6, c);
  for (const k of ['x', 'y', 'w', 'h']) near(before[k], after[k], 0.5);
});

test('a hidden speaker fades out and the box leaves; leaving hidden brings it back', () => {
  const keys = [key(0, 'hero'), key(2, 'hidden'), key(5, 'hero')];
  assert.equal(poseAt(keys, 1, c).o, 1);
  assert.equal(poseAt(keys, 4, c).o, 0);
  assert.equal(poseAt(keys, 8, c).o, 1);
  const mid = poseAt(keys, 2 - LEAD_S + MOVE_S / 2, c);
  assert.ok(mid.o > 0.4 && mid.o < 0.6);
});

test('drift breathes the box about its centre, from nothing, by at most `drift`; a still brand is untouched', () => {
  const b = { x: 100, y: 200, w: 400, h: 600, o: 1 };
  assert.deepEqual(drifted(b, 0, 0.03), b, 'starts at rest');
  assert.deepEqual(drifted(b, 3, 0), b);
  const top = drifted(b, 4.5, 0.03);
  near(top.w, 400 * 1.03, 1e-6); near(top.x + top.w / 2, 300); near(top.y + top.h / 2, 500);
  for (let i = 0; i < 100; i++) assert.ok(drifted(b, i / 5, 0.03).w <= 400 * 1.03 + 1e-9);
});

test('drift keeps a box flush with a frame edge on that edge, and a full-frame box centred; the widest breath is the zone graphics keep clear of', () => {
  const col = { x: 0, y: 0, w: 456, h: 1920, o: 1 };
  const d = drifted(col, 4.5, 0.03, { W, H });
  near(d.x, 0); near(d.w, 456 * 1.03, 1e-6); near(d.y + d.h / 2, 960);
  const right = drifted({ x: 624, y: 0, w: 456, h: 1920, o: 1 }, 4.5, 0.03, { W, H });
  near(right.x + right.w, 1080);
  const full = drifted({ x: 0, y: 0, w: W, h: H, o: 1 }, 4.5, 0.03, { W, H });
  near(full.x + full.w / 2, 540);
  const wide = widest(col, 0.03, { W, H });
  near(wide.w, 456 * 1.03, 1e-6);
  for (let i = 0; i < 100; i++) assert.ok(drifted(col, i / 5, 0.03, { W, H }).w <= wide.w + 1e-9);
  assert.deepEqual(widest(col, 0, { W, H }), col);
});

test('the face box: a matte\'s head is mapped through the cover fit and padded; with none, the shares of the box', () => {
  const box = { x: 0, y: 0, w: 1080, h: 1920, o: 1 };
  // a 16:9 recording covering a 9:16 box: scale 1920/1080, the recording is 3413 wide and centred
  const f = faceRect(box, { rec: { w: 1920, h: 1080 }, face: [0.4, 0.1, 0.6, 0.4], shares: [0, 0, 1, 1] }, 0);
  const k = 1920 / 1080, ox = (1080 - 1920 * k) / 2;
  near(f.x, ox + 0.4 * 1920 * k, 0.02); near(f.y, 0.1 * 1080 * k, 0.02); near(f.w, 0.2 * 1920 * k, 0.02); near(f.h, 0.3 * 1080 * k, 0.02);
  const padded = faceRect(box, { rec: { w: 1920, h: 1080 }, face: [0.4, 0.1, 0.6, 0.4], shares: [0, 0, 1, 1] }, 0.1);
  near(padded.w, f.w * 1.2, 0.05);
  const d = faceRect(box, { shares: [0.25, 0.1, 0.5, 0.2] }, 0);
  assert.deepEqual(d, { x: 270, y: 192, w: 540, h: 384 });
  assert.equal(faceRect({ ...box, o: 0 }, { shares: [0, 0, 1, 1] }), null, 'no face when the speaker is away');
});

test('clearFace: a rect on the face moves the least to stand clear inside the bounds; one already clear stays', () => {
  const bounds = { x: 72, y: 72, w: 936, h: 1776 };
  const face = { x: 300, y: 200, w: 480, h: 400 };
  const clear = { x: 100, y: 1500, w: 800, h: 200 };
  assert.deepEqual(clearFace(clear, [face], bounds), { dx: 0, dy: 0 });
  const on = { x: 150, y: 150, w: 780, h: 200 };   // lies across the top of the face
  const m = clearFace(on, [face], bounds);
  const moved = { ...on, x: on.x + m.dx, y: on.y + m.dy };
  assert.ok(moved.y >= face.y + face.h - 0.01 || moved.y + moved.h <= face.y + 0.01 || moved.x + moved.w <= face.x + 0.01 || moved.x >= face.x + face.w - 0.01, 'clear of the face');
  assert.ok(moved.x >= 72 - 0.01 && moved.x + moved.w <= 1008 + 0.01 && moved.y >= 72 - 0.01, 'inside the bounds');
  // nowhere to go: a rect as big as the bounds stays put
  assert.deepEqual(clearFace({ ...bounds }, [face], bounds), { dx: 0, dy: 0 });
  // two obstacles (the face and a placed plate): clear of both
  const plate = { x: 72, y: 600, w: 936, h: 120 };
  const m2 = clearFace({ x: 100, y: 300, w: 700, h: 250 }, [face, plate], bounds);
  const r2 = { x: 100 + m2.dx, y: 300 + m2.dy, w: 700, h: 250 };
  for (const o of [face, plate]) assert.ok(r2.x + r2.w <= o.x || o.x + o.w <= r2.x || r2.y + r2.h <= o.y || o.y + o.h <= r2.y, 'clear of ' + JSON.stringify(o));
});

test('parseFace and median', () => {
  assert.deepEqual(parseFace('0.3, 0.1, 0.4, 0.3'), [0.3, 0.1, 0.4, 0.3]);
  assert.equal(parseFace(''), null);
  assert.equal(parseFace('1,2,3'), null);
  assert.equal(parseFace('0,0,0,1'), null);
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});
