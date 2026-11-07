// G-BRAND over a brand ground: overlapping blurred blobs mix four or more colours, so the ground
// itself is not a blend of up to three roles. With the ground-only frame given, a pixel passes when it is
// the ground or a blend of the ground under it and one palette colour (text antialiased over the
// field); any other colour still fails. Two rows of pixels, so every region is at least 2 px tall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offPalette, paletteDistance } from '../../scripts/check/_pixels.mjs';

const W = 8, H = 2;
const img = (px) => ({ width: W, height: H, data: Uint8ClampedArray.from([...px, ...px].flatMap((c) => [...c, 255])) });
const canvas = [24, 40, 72], ink = [250, 250, 248], b1 = [42, 157, 143], b2 = [233, 196, 106], b3 = [231, 111, 81];
const dist = paletteDistance([canvas, ink, b1, b2, b3]);
const mix = (cs, ws) => [0, 1, 2].map((i) => Math.round(cs.reduce((s, c, k) => s + c[i] * ws[k], 0)));
const ground4 = mix([b1, b2, b3, canvas], [0.3, 0.3, 0.2, 0.2]);   // four blobs overlapping: no blend of three roles
const textEdge = mix([ground4, ink], [0.5, 0.5]);                    // ink antialiased over that ground
const green = [40, 200, 60];
const row = (...cs) => cs.flatMap((c) => [c, c]);                    // each colour two pixels wide

test('without the ground frame, a four-blob mix is off the palette', () => {
  const r = offPalette(img(row(ground4, ground4, canvas, canvas)), dist, 2);
  assert.equal(r.off, 8);
});

test('with the ground frame, the ground and ink blended over it pass', () => {
  const ground = img(row(ground4, ground4, canvas, canvas));
  const r = offPalette(img(row(ground4, textEdge, canvas, canvas)), dist, 2, { ground });
  assert.equal(r.off, 0, JSON.stringify(r));
});

test('with the ground frame, a colour that is no blend of ground and palette still fails', () => {
  const ground = img(row(ground4, ground4, canvas, ground4));
  const r = offPalette(img(row(green, textEdge, canvas, mix([ground4, green], [0.5, 0.5]))), dist, 2, { ground });
  assert.equal(r.off, 8, JSON.stringify(r));
});
