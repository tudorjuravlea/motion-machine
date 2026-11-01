// projection: the maths of an element that travels from one box to another without its insides
// stretching: the axis delta with an origin, the cross-fade windows, the corner and shadow corrections,
// the aspect rule, a crop window, and an arc of travel. Pure: boxes in, numbers out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  axisDelta, boxDelta, compress, circOut, fadeWindows, aspectOff, ASPECT_TOLERANCE, arcPoint, ARC,
  cornerFix, mixRadius, shadowFix, cropPlace, journey,
} from '../../runtime/kit/projection.js';

const near = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('axisDelta: scale is the ratio of lengths, translate moves the origin point onto its target', () => {
  const d = axisDelta({ min: 100, max: 300 }, { min: 0, max: 800 });
  near(d.scale, 4);
  near(d.origin, 0.5);
  // the middle of the source (200) lands on the middle of the target (400): translate 200
  near(d.translate, 200);
  const left = axisDelta({ min: 100, max: 300 }, { min: 0, max: 800 }, 0);
  near(left.translate, -100, 1e-9, 'with the origin at the left edge the left edge moves to the left edge');
});

test('axisDelta: a scale within 1e-4 of 1, a translate within 0.01 px of 0, and a zero-size box are snapped, never NaN', () => {
  assert.equal(axisDelta({ min: 0, max: 100 }, { min: 0, max: 100.005 }).scale, 1);
  assert.equal(axisDelta({ min: 0, max: 100 }, { min: 0.004, max: 100.004 }).translate, 0);
  const z = axisDelta({ min: 5, max: 5 }, { min: 0, max: 100 });
  assert.equal(z.scale, 1);
  assert.ok(Number.isFinite(z.translate));
});

test('boxDelta: both axes, and null when either box has no size', () => {
  const d = boxDelta({ x: 0, y: 0, w: 100, h: 50 }, { x: 200, y: 100, w: 200, h: 50 });
  near(d.x.scale, 2); near(d.y.scale, 1);
  near(d.x.translate, 250); near(d.y.translate, 100);
  assert.equal(boxDelta({ x: 0, y: 0, w: 0, h: 50 }, { x: 0, y: 0, w: 10, h: 10 }), null);
  assert.equal(boxDelta({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 0 }), null);
});

test('compress and circOut', () => {
  assert.equal(compress(0.2, 0.6, (x) => x, 0.1), 0);
  assert.equal(compress(0.2, 0.6, (x) => x, 0.9), 1);
  near(compress(0.2, 0.6, (x) => x, 0.4), 0.5);
  near(circOut(0), 0); near(circOut(1), 1);
  near(circOut(0.5), Math.sqrt(0.75));
  assert.ok(circOut(0.25) > 0.25, 'it rises early');
});

test('fadeWindows: the incoming scene rises over the first half, the outgoing falls over 0.5 to 0.95; they never both dip', () => {
  assert.deepEqual(fadeWindows(0), { lead: 0, follow: 1 });
  assert.deepEqual(fadeWindows(1), { lead: 1, follow: 0 });
  near(fadeWindows(0.5).lead, 1);
  near(fadeWindows(0.5).follow, 1);
  near(fadeWindows(0.95).follow, 0);
  near(fadeWindows(0.725).follow, 0.5, 1e-9, 'linear between 0.5 and 0.95');
  let prevL = -1, prevF = 2;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const w = fadeWindows(Math.min(1, p));
    assert.ok(w.lead >= prevL - 1e-12 && w.follow <= prevF + 1e-12, 'lead only rises, follow only falls');
    // together the two cover: whenever the incoming is not whole, the outgoing still is
    assert.ok(w.lead + w.follow >= 1 - 1e-9, `no dip at ${p}`);
    prevL = w.lead; prevF = w.follow;
  }
});

test('aspectOff: a pair is off when their aspect ratios differ by more than 0.2', () => {
  assert.equal(ASPECT_TOLERANCE, 0.2);
  assert.equal(aspectOff({ w: 300, h: 200 }, { w: 320, h: 200 }), false);
  assert.equal(aspectOff({ w: 300, h: 200 }, { w: 200, h: 300 }), true);
  assert.equal(aspectOff({ w: 100, h: 100 }, { w: 120, h: 100 }), false, 'a difference of exactly 0.2 is within');
  assert.equal(aspectOff({ w: 100, h: 100 }, { w: 121, h: 100 }), true);
});

test('arcPoint: straight at strength 0, a bow of half the control offset otherwise, on a screen-stable side', () => {
  const d = { x: 400, y: 0 };
  assert.deepEqual(arcPoint(d, 0.5, { strength: 0 }), { x: 200, y: 0 });
  const mid = arcPoint(d, 0.5, { strength: ARC.strength });
  near(mid.x, 200, 1e-9);
  near(mid.y, -0.5 * ARC.strength * 400, 1e-9, 'the apex is half the control offset; across to the right bows up the page');
  const back = arcPoint({ x: -400, y: 0 }, 0.5, { strength: ARC.strength });
  near(back.y, -0.5 * ARC.strength * 400, 1e-9, 'across to the left bows up too: the same side of the screen');
  const down = arcPoint({ x: 0, y: 400 }, 0.5, { strength: ARC.strength });
  const up = arcPoint({ x: 0, y: -400 }, 0.5, { strength: ARC.strength });
  assert.ok(down.x > 0 && up.x > 0, 'vertical travel bows to the right, either way');
  assert.deepEqual(arcPoint(d, 0, { strength: 0.5 }), { x: 0, y: 0 });
  near(arcPoint(d, 1, { strength: 0.5 }).x, 400); near(arcPoint(d, 1, { strength: 0.5 }).y, 0, 1e-9);
  // a short hop is not worth an arc
  assert.deepEqual(arcPoint({ x: 10, y: 0 }, 0.5, { strength: 0.5 }), { x: 5, y: 0 });
  // a chosen side
  assert.ok(arcPoint(d, 0.5, { strength: 0.5, side: 'cw' }).y !== arcPoint(d, 0.5, { strength: 0.5, side: 'ccw' }).y);
});

test('cornerFix: a radius is divided by the scale of its axis so it looks the same size on the page', () => {
  assert.deepEqual(cornerFix(24, 2, 1), [12, 24]);
  assert.deepEqual(cornerFix(24, 0.5, 0.5), [48, 48]);
  assert.deepEqual(cornerFix(0, 3, 3), [0, 0]);
  assert.deepEqual(cornerFix(10, 0, 1), [10, 10], 'a zero scale is left alone');
});

test('mixRadius: the radius on the page is the one box\'s to the other\'s, never negative', () => {
  near(mixRadius(8, 40, 0.5), 24);
  near(mixRadius(8, 40, 0), 8);
  near(mixRadius(8, 40, 1), 40);
  assert.equal(mixRadius(-5, 0, 0.3), 0);
});

test('shadowFix: offsets are divided by the axis scale, blur and spread by the mean scale; colour is untouched', () => {
  const out = shadowFix('rgba(0, 0, 0, 0.3) 10px 20px 30px 4px', 2, 0.5);
  assert.equal(out, 'rgba(0, 0, 0, 0.3) 5px 40px 24px 3.2px');
  assert.equal(shadowFix('none', 2, 2), 'none');
  const inset = shadowFix('inset rgb(1, 2, 3) 2px 4px 6px 0px', 2, 2);
  assert.ok(inset.startsWith('inset '), 'the inset keyword stays in front');
  assert.match(inset, /1px 2px 3px 0px/);
  const two = shadowFix('rgba(0, 0, 0, 0.1) 0px 2px 4px 0px, rgba(0, 0, 0, 0.2) 0px 10px 20px 0px', 2, 2);
  assert.equal(two.match(/rgba\(/g).length, 2, 'every shadow of the list is kept');
  assert.match(two, /0px 1px 2px 0px/);
  assert.match(two, /0px 5px 10px 0px/);
});

test('journey: a uniform pair scales both copies the same way and meets in the middle', () => {
  const ra = { x: 0, y: 0, w: 100, h: 50 }, rb = { x: 300, y: 100, w: 200, h: 100 };
  const j = journey(ra, rb, { fit: 'width' });
  assert.equal(j.kind, 'scale');
  near(j.sx, 2); near(j.sy, 2);
  const s0 = j.at(0), s1 = j.at(1);
  assert.deepEqual([s0.a.tx, s0.a.ty, s0.a.sx, s0.a.sy], [0, 0, 1, 1]);
  near(s0.b.sx, 0.5); near(s0.b.tx, -350); near(s0.b.ty, -125);
  assert.deepEqual([s1.b.tx, s1.b.ty, s1.b.sx, s1.b.sy], [0, 0, 1, 1]);
  near(s1.a.tx, 350); near(s1.a.ty, 125); near(s1.a.sx, 2);
  // the two copies cover the same box at every q: the same size and the same centre on the page
  for (const q of [0.2, 0.5, 0.8]) {
    const m = j.at(q);
    near(m.a.sx * 100, m.b.sx * 200, 1e-9, `same width on the page at ${q}`);
    near(m.a.sy * 50, m.b.sy * 100, 1e-9, `same height at ${q}`);
    near(m.a.tx + 50, m.b.tx + 400, 1e-9, 'same centre x');
    near(m.a.ty + 25, m.b.ty + 150, 1e-9, 'same centre y');
  }
});

test('journey: stretch scales each axis by its own ratio and says children are to be counter-scaled', () => {
  const j = journey({ x: 0, y: 0, w: 300, h: 200 }, { x: 0, y: 0, w: 600, h: 200 }, { fit: 'stretch' });
  assert.equal(j.kind, 'scale');
  near(j.sx, 2); near(j.sy, 1);
  assert.equal(j.counter, true);
  const uniform = journey({ x: 0, y: 0, w: 300, h: 200 }, { x: 0, y: 0, w: 600, h: 400 }, { fit: 'width' });
  assert.equal(uniform.counter, false, 'a uniform scale needs no counter');
});

test('journey: box fit with the aspects off crops or holds position, as asked; with the aspects close it stretches', () => {
  const tall = { x: 0, y: 0, w: 200, h: 300 }, wide = { x: 400, y: 0, w: 300, h: 200 };
  const crop = journey(wide, tall, { fit: 'box', mismatch: 'crop' });
  assert.equal(crop.kind, 'crop');
  const pos = journey(wide, tall, { fit: 'box', mismatch: 'position' });
  assert.equal(pos.kind, 'position');
  const m = pos.at(0.5);
  assert.deepEqual([m.a.sx, m.a.sy, m.b.sx, m.b.sy], [1, 1, 1, 1], 'position only: nothing scales');
  const close = journey({ x: 0, y: 0, w: 300, h: 200 }, { x: 0, y: 0, w: 330, h: 200 }, { fit: 'box', mismatch: 'crop' });
  assert.equal(close.kind, 'scale');
});

test('journey: a zero-size box has no journey', () => {
  assert.equal(journey({ x: 0, y: 0, w: 0, h: 10 }, { x: 0, y: 0, w: 5, h: 5 }, { fit: 'width' }), null);
});

test('cropPlace: the window is the box mixed from one to the other, the content covers it, nothing outside shows', () => {
  const box = { x: 100, y: 100, w: 200, h: 300 };
  const win = { x: 0, y: 0, w: 300, h: 200 };      // a landscape window over a portrait box
  const c = cropPlace(box, win);
  near(c.k, 1.5, 1e-9, 'covers the width');
  near(c.tx, (0 + 150) - (100 + 100), 1e-9);
  near(c.ty, (0 + 100) - (100 + 150), 1e-9);
  near(c.clip.left, 0, 1e-9); near(c.clip.right, 0, 1e-9);
  near(c.clip.top, 150 - 100 / 1.5, 1e-9); near(c.clip.bottom, 150 - 100 / 1.5, 1e-9);
  // a window that is the box itself leaves nothing cropped
  const same = cropPlace(box, box);
  near(same.k, 1); assert.deepEqual([same.clip.top, same.clip.right, same.clip.bottom, same.clip.left].map((x) => Math.abs(x) < 1e-9), [true, true, true, true]);
});
