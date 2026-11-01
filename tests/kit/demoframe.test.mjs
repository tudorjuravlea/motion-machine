// runtime/kit/demoframe.js: the arithmetic of a recording shown on a branded ground, all as
// fractions of the stage so the look holds at any format.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paddingScale, shadowStack, shadowCss, TILTS, tiltOf, lerpTilt, perspectivePx, containScale, tiltTransform, fitPlane } from '../../runtime/kit/demoframe.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('padding takes up to 40 % of the stage: 0.5 leaves 0.8, 1 leaves 0.6', () => {
  assert.equal(paddingScale(0), 1);
  near(paddingScale(0.5), 0.8); near(paddingScale(1), 0.6);
  assert.equal(paddingScale(7), 0.6, 'clamped to 0..1');
  assert.equal(paddingScale(-1), 1);
  assert.equal(paddingScale(NaN), 1);
});

test('the shadow is three layers that scale together with one intensity', () => {
  assert.deepEqual(shadowStack(1), [{ y: 12, blur: 48, alpha: 0.7 }, { y: 4, blur: 16, alpha: 0.5 }, { y: 2, blur: 8, alpha: 0.3 }]);
  const h = shadowStack(0.5);
  near(h[0].y, 6); near(h[0].blur, 24); near(h[0].alpha, 0.35); near(h[2].alpha, 0.15);
  assert.deepEqual(shadowStack(0).map((l) => l.alpha), [0, 0, 0]);
  assert.equal(shadowCss(0, 'ink'), 'none');
});

test('the shadow is CSS in one palette role, never a literal colour', () => {
  const css = shadowCss(1, 'ink');
  assert.equal(css.match(/drop-shadow\(/g).length, 3);
  assert.ok(css.includes('color-mix(in srgb, var(--mm-color-ink) 70%, transparent)'));
  assert.ok(css.includes('0 12px 48px'));
  assert.ok(!/#|\brgba?\(|\bhsla?\(/.test(css));
  assert.ok(shadowCss(1, 'accent').includes('var(--mm-color-accent)'));
  assert.ok(shadowCss(1, 'not-a-role').includes('var(--mm-color-ink)'), 'an unknown role falls back to ink');
});

test('tilts: iso leans on both axes, left and right on y alone; zero is flat', () => {
  assert.deepEqual(TILTS.none, { x: 0, y: 0 });
  assert.deepEqual(TILTS.iso, { x: -10, y: -16 });
  assert.deepEqual(TILTS.left, { x: 0, y: -22 });
  assert.deepEqual(TILTS.right, { x: 0, y: 22 });
  assert.deepEqual(tiltOf('nope'), { x: 0, y: 0 });
  assert.deepEqual(lerpTilt(TILTS.left, TILTS.right, 0.5), { x: 0, y: 0 });
  assert.deepEqual(lerpTilt(TILTS.none, TILTS.iso, 0.5), { x: -5, y: -8 });
});

test('perspective is 2.6 times the short side', () => {
  assert.equal(perspectivePx(1000, 600), 1560);
  assert.equal(perspectivePx(600, 1000), 1560);
});

// the corners of a w x h plane, rotated like `rotateX(ax) rotateY(ay)` under `perspective(P)`, as drawn
function project(w, h, tilt, P) {
  const ax = (tilt.x * Math.PI) / 180, ay = (tilt.y * Math.PI) / 180;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const x = (sx * w) / 2, y = (sy * h) / 2;
    const x1 = x * Math.cos(ay), z1 = -x * Math.sin(ay);
    const y2 = y * Math.cos(ax) - z1 * Math.sin(ax), z2 = y * Math.sin(ax) + z1 * Math.cos(ax);
    const k = 1 - z2 / P;
    return [x1 / k, y2 / k];
  });
}

test('contain scale: the rotated plane, projected, fits inside the rectangle it started in', () => {
  assert.equal(containScale({ x: 0, y: 0 }, 800, 500), 1);
  for (const name of ['iso', 'left', 'right']) {
    const w = 800, h = 500, tilt = TILTS[name], P = perspectivePx(w, h);
    const s = containScale(tilt, w, h);
    assert.ok(s < 1 && s > 0.6, `${name}: ${s}`);
    const pts = project(w, h, tilt, P).map(([x, y]) => [x * s, y * s]);
    const out = Math.max(...pts.map(([x, y]) => Math.max(Math.abs(x) / (w / 2), Math.abs(y) / (h / 2))));
    near(out, 1, 1e-9);   // snug: the farthest corner touches, none is past
  }
});

test('contain scale does not depend on the size, only the shape: the look holds at any format', () => {
  near(containScale(TILTS.iso, 800, 500), containScale(TILTS.iso, 1600, 1000));
  assert.notEqual(containScale(TILTS.iso, 800, 500), containScale(TILTS.iso, 500, 800));
});

test('the tilt transform scales after the projection and rotates under the perspective', () => {
  assert.equal(tiltTransform({ x: 0, y: 0 }, 800, 500), 'none');
  const css = tiltTransform({ x: -10, y: -16 }, 800, 500);
  assert.match(css, /^scale\([\d.]+\) perspective\(1300px\) rotateX\(-10deg\) rotateY\(-16deg\)$/);
});

test('the plane is the largest rectangle of its aspect inside the padded stage', () => {
  const f = fitPlane({ w: 1920, h: 1080 }, 16 / 10, 0.5);   // padded frame 1536 x 864; 864 * 1.6 = 1382.4 wide
  near(f.h, 864); near(f.w, 1382.4);
  const g = fitPlane({ w: 1080, h: 1920 }, 16 / 10, 0.5);   // padded 864 x 1536: width-limited
  near(g.w, 864); near(g.h, 540);
  // as fractions of the stage the padding is the same whichever way the format is cut
  near(fitPlane({ w: 1920, h: 1080 }, 2, 0.5).w / 1920, fitPlane({ w: 1080, h: 1920 }, 2, 0.5).w / 1080);
});
