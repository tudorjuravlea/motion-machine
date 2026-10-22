// The particle-object kit (runtime/kit/points.js): points sampled from a picture's pixels (a cut-out
// inflated into a pillow by its distance field, a picture displaced by a supplied depth map, a mark or a
// line of text extruded into a solid), a flat ground keyed away, a ramp that maps a picture's brightness
// onto brand roles, a divergence-free swirl and the closed-form flight of a point through the reveal
// (seed, burst, front, home). Pure: Node runs it as the browser does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samplePicture, paletteRamp, keyBackground, distanceField, flowOf, flightOf, FLIGHT } from '../../runtime/kit/points.js';

// an RGBA picture filled by f(x, y) → [r, g, b, a]
function picture(w, h, f) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}
// a disc of radius 40 on a transparent 120 x 100 picture: left half dark red, right half light grey
const DISC = picture(120, 100, (x, y) => (Math.hypot(x - 60, y - 50) <= 40 ? (x < 60 ? [120, 20, 20, 255] : [220, 220, 220, 255]) : [0, 0, 0, 0]));
// an opaque horizontal ramp from black to white
const RAMP = picture(100, 60, (x) => { const v = Math.round((x / 99) * 255); return [v, v, v, 255]; });
// back to the pixel a point was sampled from (picture px, origin at the centre, y up)
const pixelOf = (pic, x, y) => [Math.round(x + pic.width / 2 - 0.5), Math.round(pic.height / 2 - y - 0.5)];
const at = (pic, [px, py]) => { const i = (Math.min(pic.height - 1, Math.max(0, py)) * pic.width + Math.min(pic.width - 1, Math.max(0, px))) * 4; return [...pic.data.slice(i, i + 4)]; };

test('the same seed samples the same points; another seed others', () => {
  const a = samplePicture(DISC, { count: 2000, seed: 7 }), b = samplePicture(DISC, { count: 2000, seed: 7 }), c = samplePicture(DISC, { count: 2000, seed: 8 });
  assert.deepEqual(a.pos, b.pos);
  assert.deepEqual(a.rgb, b.rgb);
  assert.notDeepEqual(a.pos, c.pos);
});

test('it returns the asked count of points, all on opaque pixels, each with that pixel\'s colour', () => {
  const s = samplePicture(DISC, { count: 2000, seed: 3 });
  assert.equal(s.count, 2000);
  assert.equal(s.pos.length, 6000);
  assert.equal(s.rgb.length, 6000);
  let opaque = 0;
  for (let i = 3; i < DISC.data.length; i += 4) if (DISC.data[i] >= 128) opaque++;
  assert.equal(s.area, opaque, 'it reports how many pixels are opaque, so a caller can size the dots');
  for (let i = 0; i < s.count; i++) {
    const px = pixelOf(DISC, s.pos[i * 3], s.pos[i * 3 + 1]);
    const [r, g, b, a] = at(DISC, px);
    assert.ok(a >= 128, `point ${i} at ${px} is on a transparent pixel`);
    assert.deepEqual([s.rgb[i * 3], s.rgb[i * 3 + 1], s.rgb[i * 3 + 2]], [r, g, b]);
  }
});

test('the points cover the picture evenly, and their order is shuffled so any prefix is spread over all of it', () => {
  const s = samplePicture(DISC, { count: 3000, seed: 5 });
  const left = [...Array(s.count).keys()].filter((i) => s.pos[i * 3] < 0).length;
  assert.ok(Math.abs(left / s.count - 0.5) < 0.05, `left share ${left / s.count}`);
  const head = [...Array(150).keys()].map((i) => s.pos[i * 3 + 1]);
  assert.ok(Math.max(...head) - Math.min(...head) > 60, 'the first 5 % of points span the disc top to bottom');
});

test('flat relief puts every point on the picture plane', () => {
  const s = samplePicture(RAMP, { count: 1000, seed: 1, relief: 'flat' });
  for (let i = 0; i < s.count; i++) assert.equal(s.pos[i * 3 + 2], 0);
});

test('brightness relief brings light pixels forward and pushes dark ones back, depth a share of the short side', () => {
  const s = samplePicture(RAMP, { count: 1500, seed: 2, relief: 'luma', depth: 0.5 });
  let maxZ = -Infinity, minZ = Infinity;
  for (let i = 0; i < s.count; i++) {
    const x = s.pos[i * 3], z = s.pos[i * 3 + 2];
    if (x > 35) assert.ok(z > 0, `a light pixel at x ${x} sits behind the plane (z ${z})`);
    if (x < -35) assert.ok(z < 0, `a dark pixel at x ${x} sits in front of the plane (z ${z})`);
    maxZ = Math.max(maxZ, z); minZ = Math.min(minZ, z);
  }
  assert.ok(maxZ <= 15 + 1e-6 && minZ >= -15 - 1e-6, `z within ±depth/2 of 60 px: ${minZ}..${maxZ}`);
  assert.ok(maxZ - minZ > 25, `the relief spans most of the depth: ${maxZ - minZ}`);
});

test('a supplied depth map sets the depth, whatever the colours say', () => {
  // the colour is a left-to-right ramp; the depth map says the top half is near (white), the bottom far (black)
  const map = picture(50, 30, (x, y) => (y < 15 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  const s = samplePicture(RAMP, { count: 1200, seed: 4, relief: 'map', depth: 0.4, depthMap: map });
  for (let i = 0; i < s.count; i++) {
    const y = s.pos[i * 3 + 1], z = s.pos[i * 3 + 2];
    if (y > 3) assert.ok(z > 0, `top half is near: y ${y} z ${z}`);
    if (y < -3) assert.ok(z < 0, `bottom half is far: y ${y} z ${z}`);
  }
});

test('extrusion builds a solid: a front and a back face at ±depth/2 and walls along the outline between them', () => {
  const s = samplePicture(DISC, { count: 4000, seed: 6, relief: 'extrude', depth: 0.3 });
  const half = 0.3 * 100 / 2;
  const faces = [0, 0, 0];
  for (let i = 0; i < s.count; i++) {
    faces[s.face[i]]++;
    const x = s.pos[i * 3], y = s.pos[i * 3 + 1], z = s.pos[i * 3 + 2];
    if (s.face[i] === 0) assert.equal(z, half);
    else if (s.face[i] === 1) assert.equal(z, -half);
    else {
      assert.ok(Math.abs(z) <= half, `a wall point within the depth: ${z}`);
      const r = Math.hypot(x, y);
      assert.ok(Math.abs(r - 40) < 2.5, `a wall point on the outline: r ${r}`);
    }
  }
  assert.ok(faces[0] > faces[1] && faces[2] > 0.1 * s.count, `faces ${faces}`);
  assert.equal(faces[0] + faces[1] + faces[2], 4000);
});

test('a picture with fewer opaque pixels than points still returns points only where it is opaque', () => {
  const tiny = picture(20, 20, (x, y) => (x >= 8 && x < 12 && y >= 8 && y < 12 ? [9, 9, 9, 255] : [0, 0, 0, 0]));
  const s = samplePicture(tiny, { count: 500, seed: 1 });
  assert.ok(s.count >= 16 && s.count <= 500, `count ${s.count}`);
  for (let i = 0; i < s.count; i++) assert.ok(Math.abs(s.pos[i * 3]) <= 2 && Math.abs(s.pos[i * 3 + 1]) <= 2);
});

// the ramp: brightness to brand roles
const LIGHT = { canvas: [246, 242, 233], muted: [120, 112, 100], ink: [28, 26, 24], accent: [200, 60, 30] };
const DARK = { canvas: [14, 16, 26], muted: [120, 126, 150], ink: [236, 238, 245], accent: [90, 200, 250] };
// the distance from c to the nearest point on the segment a..b, and where on it
function onSegment(c, a, b) {
  const ab = a.map((v, k) => b[k] - v), ac = c.map((v, k) => v - a[k]);
  const L = ab.reduce((s, v) => s + v * v, 0);
  const t = L ? Math.max(0, Math.min(1, ab.reduce((s, v, k) => s + v * ac[k], 0) / L)) : 0;
  return Math.hypot(...c.map((v, k) => v - (a[k] + ab[k] * t)));
}
const onSomeSegment = (c, roles) => {
  const list = Object.values(roles);
  let d = Infinity;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) d = Math.min(d, onSegment(c, list[i], list[j]));
  return d;
};

test('the palette ramp only paints blends of two roles, for any input colour', () => {
  for (const roles of [LIGHT, DARK]) {
    const ramp = paletteRamp(roles);
    for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) {
      const c = ramp(r, g, b);
      assert.ok(onSomeSegment(c, roles) < 1.01, `${[r, g, b]} → ${c} is not a blend of two roles`);
    }
  }
});

test('the ramp keeps the picture\'s light and dark: the ink end is the side away from the canvas', () => {
  const light = paletteRamp(LIGHT), dark = paletteRamp(DARK);
  assert.deepEqual(light(0, 0, 0), LIGHT.ink, 'on a light canvas black is ink');
  assert.deepEqual(light(255, 255, 255), LIGHT.canvas, 'on a light canvas white is canvas');
  assert.deepEqual(dark(255, 255, 255), DARK.ink, 'on a dark canvas white is ink');
  assert.deepEqual(dark(0, 0, 0), DARK.canvas, 'on a dark canvas black is canvas');
  assert.ok(light(128, 128, 128).every((v, k) => Math.abs(v - LIGHT.muted[k]) < 2), 'mid grey is muted');
});

// saturated colour bars from light to dark: yellow, cyan, green, magenta, red, blue
const BARS = [[255, 225, 0], [0, 216, 240], [32, 192, 32], [224, 32, 208], [224, 16, 16], [16, 24, 176]];
const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

test('vivid colours run through the accent and keep their tonal order: a vivid picture is not one accent slab', () => {
  for (const roles of [LIGHT, DARK]) {
    const ramp = paletteRamp(roles);
    const out = BARS.map((c) => ramp(...c));
    // the bars run from light to dark, and so do their tones (on a light canvas from canvas to ink, on a dark one from ink to canvas)
    for (let k = 1; k < out.length; k++) assert.ok(lum(out[k]) < lum(out[k - 1]), `${roles === LIGHT ? 'light' : 'dark'}: bar ${k} ${out[k]} is not darker than bar ${k - 1} ${out[k - 1]}`);
    const distinct = out.filter((c, k) => out.findIndex((d) => Math.hypot(...c.map((v, i) => v - d[i])) < 12) === k);
    assert.ok(distinct.length >= 5, `${distinct.length} distinct tones of 6 bars`);
    // the accent is in play: some bar lies on a segment through the accent
    assert.ok(out.some((c) => Math.min(onSegment(c, roles.canvas, roles.accent), onSegment(c, roles.accent, roles.ink)) < 1.01 && Math.hypot(...c.map((v, i) => v - roles.canvas[i])) > 40), 'a bar takes the accent');
    // and still only blends of two roles
    for (const c of out) assert.ok(onSomeSegment(c, roles) < 1.01, `${c} is not a blend of two roles`);
  }
});

test('a vivid picture\'s own range is stretched over the ramp: its darkest hue is ink, its lightest a faint tint that never vanishes into the canvas', () => {
  const r = { lo: lum(BARS[5]), hi: lum(BARS[0]) };
  const ramp = paletteRamp(LIGHT, r);
  const light = ramp(...BARS[0]);
  assert.ok(Math.hypot(...ramp(...BARS[5]).map((v, i) => v - LIGHT.ink[i])) < 2, 'the darkest bar is ink');
  assert.ok(onSegment(light, LIGHT.canvas, LIGHT.accent) < 1.01, `the lightest bar ${light} is a tint of the accent`);
  const d = Math.hypot(...light.map((v, i) => v - LIGHT.canvas[i]));
  assert.ok(d > 15 && d < 60, `and faint but visible: ${d.toFixed(1)} from the canvas`);
});

test('the ramp stretches the picture\'s own brightness range, and a one-colour mark is ink', () => {
  const flat = paletteRamp(DARK, { lo: 0.2, hi: 0.2 });
  assert.deepEqual(flat(47, 58, 74), DARK.ink, 'a dark mark on a dark canvas still reads as ink');
  const narrow = paletteRamp(LIGHT, { lo: 0.25, hi: 0.75 });
  assert.deepEqual(narrow(192, 192, 192), LIGHT.canvas, 'the lightest of the range is canvas on a light canvas');
  assert.deepEqual(narrow(63, 63, 63), LIGHT.ink, 'the darkest is ink');
});

// a cut-out: the disc on a transparent ground; a product on a flat ground; one on a gradient ground
const ON_FLAT = picture(120, 100, (x, y) => (Math.hypot(x - 60, y - 50) <= 30 ? [200, 40, 40, 255] : [30 + ((x * 7 + y * 3) % 3), 34, 40, 255]));
const ON_GRADIENT = picture(120, 100, (x, y) => (Math.hypot(x - 60, y - 50) <= 30 ? [200, 40, 40, 255] : [Math.round((x / 119) * 255), 60, Math.round((y / 99) * 200), 255]));
const alphaAt = (pic, x, y) => pic.data[(y * pic.width + x) * 4 + 3];

test('a picture on a flat ground is keyed: the ground connected to the border turns transparent, the subject stays', () => {
  const k = keyBackground(ON_FLAT);
  assert.equal(k.flat, true);
  assert.ok(k.pic && k.pic !== ON_FLAT, 'a keyed copy, the input untouched');
  assert.equal(alphaAt(ON_FLAT, 2, 2), 255);
  for (const [x, y] of [[0, 0], [119, 99], [10, 50], [60, 5], [25, 50]]) assert.equal(alphaAt(k.pic, x, y), 0, `ground at ${x},${y}`);
  for (const [x, y] of [[60, 50], [40, 50], [60, 75]]) assert.equal(alphaAt(k.pic, x, y), 255, `subject at ${x},${y}`);
  const disc = Math.PI * 30 * 30 / (120 * 100);
  assert.ok(Math.abs(k.removed - (1 - disc)) < 0.02, `removed ${k.removed}`);
});

test('a picture whose border is not one flat colour is refused, not drawn as a rectangle', () => {
  const k = keyBackground(ON_GRADIENT);
  assert.equal(k.flat, false);
  assert.equal(k.pic, null);
});

test('a picture that is already a cut-out is kept as it is', () => {
  const k = keyBackground(DISC);
  assert.equal(k.pic, DISC);
  assert.equal(k.cut, true);
  assert.equal(k.removed, 0);
});

test('the distance field: each opaque pixel\'s distance to the nearest transparent one, the deepest at the centre', () => {
  const { dist, max } = distanceField(DISC);
  assert.ok(Math.abs(max - 40) < 1.5, `max ${max}`);
  assert.ok(Math.abs(dist[50 * 120 + 60] - 40) < 1.5, `centre ${dist[50 * 120 + 60]}`);
  assert.ok(Math.abs(dist[50 * 120 + 90] - 10) < 1.2, `30 px from the centre: ${dist[50 * 120 + 90]}`);
  assert.equal(dist[0], 0, 'a transparent pixel is at distance 0');
});

test('a pillow: a cut-out inflated by its distance field, a front and a back surface and points inside the shell', () => {
  const D = 0.4 * 100, s = samplePicture(DISC, { count: 6000, seed: 9, relief: 'pillow', depth: 0.4 });
  assert.equal(s.count, 6000);
  const faces = [0, 0, 0];
  for (let i = 0; i < s.count; i++) {
    const x = s.pos[i * 3], y = s.pos[i * 3 + 1], z = s.pos[i * 3 + 2], r = Math.hypot(x, y);
    const d = Math.max(0, 40 - r), h = (D / 2) * Math.sqrt(1 - (1 - Math.min(1, d / 40)) ** 2);
    faces[s.face[i]]++;
    assert.ok(Math.abs(z) <= D / 2 + 1e-6, `inside the depth: ${z}`);
    if (d < 4) continue;   // the rim, where the surface is steep, is checked by the means below
    if (s.face[i] === 0) assert.ok(Math.abs(z - h) < D * 0.06, `front at r ${r.toFixed(1)}: z ${z.toFixed(1)} vs ${h.toFixed(1)}`);
    if (s.face[i] === 1) assert.ok(Math.abs(z + h) < D * 0.06, `back at r ${r.toFixed(1)}: z ${z.toFixed(1)} vs ${-h.toFixed(1)}`);
    if (s.face[i] === 2) assert.ok(Math.abs(z) <= h + D * 0.06, `inside the shell at r ${r.toFixed(1)}: z ${z.toFixed(1)}`);
  }
  assert.ok(faces[0] > 0.35 * s.count && faces[1] > 0.35 * s.count && faces[2] > 0.05 * s.count, `faces ${faces}`);
  // round, not a slab: near the rim the surfaces close in, at the centre they are a full depth apart
  const zs = (lo, hi) => [...Array(s.count).keys()].filter((i) => s.face[i] === 0 && Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1]) >= lo && Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1]) < hi).map((i) => s.pos[i * 3 + 2]);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(zs(0, 10)) > 0.45 * D && mean(zs(37, 40)) < 0.25 * D, `centre ${mean(zs(0, 10))} rim ${mean(zs(37, 40))}`);
});

test('depth jitter gives every surface a thickness, within the share asked', () => {
  const a = samplePicture(DISC, { count: 3000, seed: 2, relief: 'extrude', depth: 0.3 });
  const b = samplePicture(DISC, { count: 3000, seed: 2, relief: 'extrude', depth: 0.3, jitter: 0.2 });
  let moved = 0, most = 0;
  for (let i = 0; i < a.count; i++) { const d = Math.abs(b.pos[i * 3 + 2] - a.pos[i * 3 + 2]); if (d > 0.01) moved++; most = Math.max(most, d); }
  assert.ok(moved > 0.9 * a.count, `${moved} of ${a.count} points jittered`);
  assert.ok(most <= 0.2 * 30 / 2 + 1e-9, `at most jitter × depth / 2: ${most}`);
});

test('a depth map below its threshold removes the ground: no points where the map is far', () => {
  const map = picture(120, 100, (x, y) => (Math.hypot(x - 60, y - 50) <= 30 ? [230, 230, 230, 255] : [0, 0, 0, 255]));
  const s = samplePicture(ON_FLAT, { count: 2000, seed: 3, relief: 'map', depth: 0.3, depthMap: map, depthMin: 0.08 });
  assert.ok(s.count > 1500, `count ${s.count}`);
  for (let i = 0; i < s.count; i++) assert.ok(Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1]) <= 31.5, `a point on the far ground at ${s.pos[i * 3]},${s.pos[i * 3 + 1]}`);
  assert.ok(Math.abs(s.area - Math.PI * 900) < 120, `area counts only the near pixels: ${s.area}`);
});

test('the swirl is divergence-free (a curl-like flow), bounded, and the same for the same inputs', () => {
  const v = [0, 0, 0], a = [0, 0, 0], b = [0, 0, 0], e = 1e-4;
  for (let i = 0; i < 200; i++) {
    const x = i * 0.31, y = i * 0.17 - 3, z = i * 0.07 + 1, t = i * 0.01;
    flowOf(x, y, z, t, v);
    assert.ok(Math.hypot(...v) <= 3 + 1e-9, `|v| ${Math.hypot(...v)}`);
    let div = 0;
    for (let k = 0; k < 3; k++) {
      const p = [x, y, z], m = [x, y, z]; p[k] += e; m[k] -= e;
      flowOf(...p, t, a); flowOf(...m, t, b);
      div += (a[k] - b[k]) / (2 * e);
    }
    assert.ok(Math.abs(div) < 1e-5, `divergence ${div}`);
  }
  flowOf(1, 2, 3, 0.4, a); flowOf(1, 2, 3, 0.4, b);
  assert.deepEqual(a, b);
});

// one object's flight: homes on a disc of radius 100, burst directions seeded
const FL = { origin: [0, 0, 0], reach: 180, far: 100, swirl: 2.4, size: 120 };
const PTS = Array.from({ length: 400 }, (_, i) => {
  const a = i * 2.39996, r = 100 * Math.sqrt((i + 0.5) / 400), u = 2 * ((i * 0.618) % 1) - 1, ph = i * 1.7;
  const k = Math.sqrt(1 - u * u);
  return [r * Math.cos(a), r * Math.sin(a), ((i * 0.37) % 1) * 20 - 10, k * Math.cos(ph), k * Math.sin(ph), u, 0.3 + 0.7 * ((i * 0.733) % 1), (i * 0.411) % 1];
});
const fly = (q, p, out = [0, 0, 0, 0, 0]) => flightOf(q, ...p, FL, out);

test('the flight starts as one seed at the origin, with no point shown yet', () => {
  for (const p of PTS) { const o = fly(0, p); assert.deepEqual(o.slice(0, 3), [0, 0, 0]); assert.equal(o[4], 0, 'not spawned'); assert.equal(o[3], 0, 'not landed'); }
});

test('the burst swirls out past the object\'s bounds before the front lands anything', () => {
  let far = 0, landed = 0;
  const q = FLIGHT.F0;
  for (const p of PTS) { const o = fly(q, p); far = Math.max(far, Math.hypot(o[0], o[1], o[2])); if (o[3] > 0) landed++; assert.equal(o[4], 1, 'spawned'); }
  assert.ok(far > 1.3 * FL.far, `the cloud reaches ${far.toFixed(0)} px, the object ${FL.far}`);
  assert.equal(landed, 0, 'nothing lands before the front starts');
});

test('the front passes nearer homes first; every point is exactly home once it has passed, and at q = 1', () => {
  const mid = (FLIGHT.F0 + FLIGHT.F1) / 2;
  const near = PTS.filter((p) => Math.hypot(p[0], p[1], p[2]) < 30), far = PTS.filter((p) => Math.hypot(p[0], p[1], p[2]) > 90);
  const mean = (list) => list.reduce((s, p) => s + fly(mid, p)[3], 0) / list.length;
  assert.ok(mean(near) > mean(far) + 0.3, `near ${mean(near)} far ${mean(far)}`);
  for (const q of [FLIGHT.F1, 0.97, 1]) for (const p of PTS) {
    const o = fly(q, p);
    assert.equal(o[3], 1, `landed at ${q}`);
    assert.deepEqual(o.slice(0, 3), p.slice(0, 3), `home at ${q}`);
  }
});

test('the flight is continuous, and a point\'s streak (its motion over a frame) is long in the burst and gone once home', () => {
  const a = [0, 0, 0, 0, 0], b = [0, 0, 0, 0, 0], dq = 0.011;
  for (const p of PTS.slice(0, 60)) for (let q = 0; q < 1; q += 0.01) {
    fly(q, p, a); fly(q + 1e-4, p, b);
    assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 2, `a jump at q ${q.toFixed(2)}`);
  }
  const step = (q, p) => { fly(q, p, a); fly(q - dq, p, b); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
  const burst = PTS.reduce((s, p) => s + step(0.25, p), 0) / PTS.length;
  const home = PTS.reduce((s, p) => s + step(FLIGHT.F1 + 0.02, p), 0) / PTS.length;
  assert.ok(burst > 4, `mean motion over a frame in the burst: ${burst.toFixed(2)} px`);
  assert.equal(home, 0);
});
