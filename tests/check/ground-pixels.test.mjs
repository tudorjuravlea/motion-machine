// G-LITERAL over a brand ground: overlapping blurred blobs mix three or more colours, so the
// ground itself is not a two-colour blend. With the ground-only frame given, a pixel passes when it is
// the ground or a blend of the ground under it and one palette colour (text antialiased over the
// field); any other colour still fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offPalette, paletteDistance } from '../../scripts/check/_pixels.mjs';

const W = 4, H = 1;
const img = (px) => ({ width: W, height: H, data: Uint8ClampedArray.from(px.flatMap((c) => [...c, 255])) });
const canvas = [24, 40, 72], ink = [250, 250, 248], b1 = [42, 157, 143], b2 = [233, 196, 106], b3 = [231, 111, 81];
const dist = paletteDistance([canvas, ink, b1, b2, b3]);
const mix = (cs, ws) => [0, 1, 2].map((i) => Math.round(cs.reduce((s, c, k) => s + c[i] * ws[k], 0)));
const ground3 = mix([b1, b2, b3], [0.4, 0.35, 0.25]);   // three blobs overlapping: no two-colour blend
const textEdge = mix([ground3, ink], [0.5, 0.5]);        // ink antialiased over that ground
const green = [40, 200, 60];

test('without the ground frame, a three-blob mix is off the palette', () => {
  const r = offPalette(img([ground3, ground3, canvas, canvas]), dist, 2);
  assert.equal(r.off, 2);
});

test('with the ground frame, the ground and ink blended over it pass', () => {
  const ground = img([ground3, ground3, canvas, canvas]);
  const r = offPalette(img([ground3, textEdge, canvas, canvas]), dist, 2, { ground });
  assert.equal(r.off, 0, JSON.stringify(r));
});

test('with the ground frame, a colour that is no blend of ground and palette still fails', () => {
  const ground = img([ground3, ground3, canvas, canvas]);
  const r = offPalette(img([green, textEdge, canvas, mix([ground3, green], [0.5, 0.5])]), dist, 2, { ground });
  assert.equal(r.off, 2, JSON.stringify(r));
});
