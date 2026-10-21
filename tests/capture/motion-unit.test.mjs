// Unit level: the frame-difference analysis on synthetic greyscale frames (no
// ffmpeg), the cut kinds read at the source rate, and the energy bands on their own. Each synthetic
// shot has a large block, as real shots do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse, energyOf, energyFrom, calibrateEnergy, ENERGY_CALIBRATION } from '../../scripts/capture-motion.mjs';

const W = 160, H = 90, FPS = 10;
const BG = 236;

// A shot: canvas with a dark block (x0..x1) and a textured "text" bar.
function shot(blockX0, blockX1, textX0) {
  const f = new Float64Array(W * H).fill(BG);
  for (let y = 0; y < H; y++) for (let x = blockX0; x < blockX1; x++) f[y * W + x] = 90;
  for (let y = 40; y < 48; y++) for (let x = textX0; x < textX0 + 50; x++) if ((x + y) % 3) f[y * W + x] = 30;
  return f;
}
const A = shot(0, 70, 90), B = shot(90, 160, 10);
const toBytes = (f) => Uint8Array.from(f, (v) => Math.max(0, Math.min(255, Math.round(v))));
const mix = (a, b, q) => a.map((v, i) => v + (b[i] - v) * q);
// Horizontal push to the left by q of the width: A slides out, B slides in from the right.
const push = (a, b, q) => {
  const s = Math.round(q * W), f = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = x + s;
    f[y * W + x] = sx < W ? a[y * W + sx] : b[y * W + (sx - W)];
  }
  return f;
};
const film = (list, fps = FPS) => ({ frames: list.map(toBytes), w: W, h: H, fps });
const repeat = (f, n) => Array.from({ length: n }, () => f);

test('a single-frame replacement is one hard cut at the first new frame', () => {
  const r = analyse(film([...repeat(A, 15), ...repeat(B, 15)]));
  assert.equal(r.cuts.length, 1);
  assert.equal(r.cuts[0].kind, 'hard');
  assert.ok(Math.abs(r.cuts[0].t - 1.5) < 1e-9, `t ${r.cuts[0].t}`);
});

test('a plateau of blended frames is one fade starting where the blend starts', () => {
  const ramp = Array.from({ length: 7 }, (_, i) => mix(A, B, (i + 1) / 8));
  const r = analyse(film([...repeat(A, 15), ...ramp, ...repeat(B, 15)]));
  assert.equal(r.cuts.length, 1, JSON.stringify(r.cuts));
  assert.equal(r.cuts[0].kind, 'fade');
  assert.ok(Math.abs(r.cuts[0].t - 1.4) < 1e-9, `t ${r.cuts[0].t}`);
});

test('a shift of the whole picture along one axis is a push with its direction', () => {
  const slide = Array.from({ length: 5 }, (_, i) => push(A, B, (i + 1) / 6));
  const r = analyse(film([...repeat(A, 15), ...slide, ...repeat(B, 15)]));
  assert.equal(r.cuts.length, 1, JSON.stringify(r.cuts));
  assert.equal(r.cuts[0].kind, 'push');
  assert.equal(r.cuts[0].direction, 'left');
});

test('new content arriving over a held picture is an arrival, not a cut', () => {
  const add = (q) => { const f = A.slice(); for (let y = 60; y < 66; y++) for (let x = 90; x < 140; x++) if ((x * y) % 4) f[y * W + x] = BG + (30 - BG) * q; return f; };
  const fadeIn = Array.from({ length: 4 }, (_, i) => add((i + 1) / 5));
  const r = analyse(film([...repeat(A, 10), ...fadeIn, ...repeat(add(1), 16)]));
  assert.equal(r.cuts.length, 0, JSON.stringify(r.cuts));
  assert.equal(r.arrivals.length, 1);
});

// A wipe: the incoming shot shows behind an edge that travels; a plate rides the edge.
const wipe = (a, b, q, axis) => {
  const f = new Float64Array(W * H), ext = axis === 'x' ? W : H, edge = Math.round(q * ext);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = axis === 'x' ? x : y, i = y * W + x;
    f[i] = c < edge ? b[i] : c < edge + 4 ? 150 : a[i];
  }
  return f;
};
// An iris: the incoming shot inside a circle about the centre that opens.
const iris = (a, b, q) => {
  const f = new Float64Array(W * H), r = q * Math.hypot(W / 2, H / 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; f[i] = Math.hypot(x - W / 2, y - H / 2) < r ? b[i] : a[i]; }
  return f;
};
// Growth about the centre (the outgoing shot of a zoom-through), sampled bilinearly.
const grow = (a, s) => {
  const f = new Float64Array(W * H).fill(BG), cx = (W - 1) / 2, cy = (H - 1) / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = cx + (x - cx) / s, sy = cy + (y - cy) / s, x0 = Math.floor(sx), y0 = Math.floor(sy);
    if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) continue;
    const fx = sx - x0, fy = sy - y0, i = y0 * W + x0;
    f[y * W + x] = (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + W] * (1 - fx) + a[i + W + 1] * fx) * fy;
  }
  return f;
};
const blurX = (a, r) => a.map((_, i) => { const x = i % W; let s = 0, n = 0; for (let d = -r; d <= r; d++) if (x + d >= 0 && x + d < W) { s += a[i + d]; n++; } return s / n; });
const FLATF = new Float64Array(W * H).fill(BG);
const at30 = (list) => film(list, 30);

test('at 30 fps a 0.1 s push (three frames) is read as a push with its direction', () => {
  const slide = [1, 2, 3].map((i) => push(A, B, i / 4));
  const r = analyse(at30([...repeat(A, 45), ...slide, ...repeat(B, 45)]));
  assert.deepEqual(r.cuts.map((c) => [c.kind, c.direction]), [['push', 'left']], JSON.stringify(r.cuts));
  assert.ok(Math.abs(r.cuts[0].t - 44 / 30) < 1e-6, `starts at the last still frame: ${r.cuts[0].t}`);
});

test('a travelling edge is a wipe, with the direction it travels', () => {
  for (const [axis, dir] of [['x', 'right'], ['y', 'down']]) {
    const sweep = Array.from({ length: 9 }, (_, i) => wipe(A, B, (i + 1) / 10, axis));
    const r = analyse(at30([...repeat(A, 45), ...sweep, ...repeat(B, 45)]));
    assert.deepEqual(r.cuts.map((c) => [c.kind, c.direction]), [['wipe', dir]], `${axis}: ${JSON.stringify(r.cuts)}`);
  }
});

test('a circle that opens on the incoming shot is an iris', () => {
  const open = Array.from({ length: 9 }, (_, i) => iris(A, B, (i + 1) / 10));
  const r = analyse(at30([...repeat(A, 45), ...open, ...repeat(B, 45)]));
  assert.deepEqual(r.cuts.map((c) => c.kind), ['iris'], JSON.stringify(r.cuts));
});

test('a fade to a flat colour that comes back is a dip; a fade that stays flat is a fade into an empty shot', () => {
  const out = Array.from({ length: 4 }, (_, i) => mix(A, FLATF, (i + 1) / 5));
  const back = Array.from({ length: 4 }, (_, i) => mix(FLATF, B, (i + 1) / 5));
  const dip = analyse(at30([...repeat(A, 45), ...out, ...repeat(FLATF, 3), ...back, ...repeat(B, 45)]));
  assert.deepEqual(dip.cuts.map((c) => c.kind), ['dip'], JSON.stringify(dip.cuts));
  const empty = analyse(at30([...repeat(A, 45), ...out, ...repeat(FLATF, 60)]));
  assert.deepEqual(empty.cuts.map((c) => c.kind), ['fade'], JSON.stringify(empty.cuts));
});

test('a shift blurred along its axis is a whip-pan with its direction', () => {
  const whip = [1, 2, 3, 4].map((i) => blurX(push(A, B, i / 5), 3 + 2 * Math.min(i, 5 - i)));
  const r = analyse(at30([...repeat(A, 45), ...whip, ...repeat(B, 45)]));
  assert.deepEqual(r.cuts.map((c) => [c.kind, c.direction]), [['whip-pan', 'left']], JSON.stringify(r.cuts));
});

test('a picture that grows about its centre as it gives way is a zoom', () => {
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const dive = Array.from({ length: 8 }, (_, i) => {
    const q = (i + 1) / 9;
    return mix(mix(FLATF, grow(A, 1 + 0.8 * q), 1 - smooth(0.35, 0.9, q)), grow(B, 1 / (1 + 0.8 * (1 - q))), smooth(0.25, 0.8, q));
  });
  const r = analyse(at30([...repeat(A, 45), ...dive, ...repeat(B, 45)]));
  assert.deepEqual(r.cuts.map((c) => c.kind), ['zoom'], JSON.stringify(r.cuts));
});

test('energy bands: hard cuts and short timed cuts read high, long timed cuts calm, between them medium', () => {
  assert.equal(energyOf({ hardShare: 0.5, cutBurstS: 0.25 }), 'high');
  assert.equal(energyOf({ hardShare: 0, cutBurstS: 0.47 }), 'calm');
  assert.equal(energyOf({ hardShare: 0, cutBurstS: 0.42 }), 'medium');
});

test('energy: a feature the labelled films could not use does not choose; calm and medium then stay medium', () => {
  for (const f of Object.keys(ENERGY_CALIBRATION.weights)) {
    if (ENERGY_CALIBRATION.weights[f].every((w) => w === 0)) assert.equal(energyFrom({ [f]: 0.1 }).energy, 'medium', f);
  }
  const r = energyFrom({ hardShare: 0 });
  assert.equal(r.energy, 'medium');
  assert.equal(r.measured[0], false, 'no measured feature weighs at the calm|medium edge');
});

test('calibrateEnergy: anchors are the energies\' medians; a feature they share weighs 0, one that parts them weighs more', () => {
  const l = (energy, sep, same) => ({ energy, features: { cutBurstS: sep, shotMedianS: same } });
  const cal = calibrateEnergy([l('calm', 0.5, 4), l('calm', 0.52, 4), l('medium', 0.4, 4), l('medium', 0.42, 4), l('high', 0.2, 4), l('high', 0.22, 4)]);
  assert.deepEqual(cal.anchors.cutBurstS, [0.51, 0.41, 0.21]);
  assert.deepEqual(cal.weights.shotMedianS, [0, 0]);
  assert.ok(cal.weights.cutBurstS[0] > 1 && cal.weights.cutBurstS[1] > 1, JSON.stringify(cal.weights));
  assert.equal(energyFrom({ cutBurstS: 0.3 }, cal).energy, 'high');
  assert.equal(energyFrom({ cutBurstS: 0.5 }, cal).energy, 'calm');
});
