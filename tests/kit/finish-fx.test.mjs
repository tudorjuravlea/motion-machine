// brand.finish, the finishing looks: chroma, scanlines, bloom, grainRate and look. The schema accepts
// them and keeps every old value valid; the pure side (runtime/kit/finish.js) turns a look into a tone
// table from the palette roles only, bounded to 0.08 from the identity, shares the over-text budget
// out so grain, halftone, paper and scanlines together stay at or under 0.08, and seeds the grain at
// its own rate. The browser side is tests/kit/finish-fx.browser.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { LOOKS, LOOK_LIMIT, lookTables, tintRole, overTextShares, grainSeed, chromaShift, chromaRoles, bloomGain, fxFilter, needsFx, gradeOf, ungradeLuts, ungradeImage } from '../../runtime/kit/finish.js';

const v = validators();
const paper = JSON.parse(readFileSync(join(ROOT, 'styles/brands/paper.json'), 'utf8'));
const light = { canvas: '#F4EFE6', ink: '#1E1B16', muted: '#6F675B', surface: '#FFFDF8', line: '#D9D1C2', accent: '#B5451B', accentInk: '#FFF8F1' };
const dark = { canvas: '#0E1116', ink: '#F2F5F9', muted: '#8B95A7', surface: '#171C24', line: '#2A3140', accent: '#35C3A0', accentInk: '#06130F' };
const size = 33;

test('a finish may carry chroma, scanlines, bloom, grainRate and a look, each optional, and every old finish stays valid', () => {
  const finish = { grain: 0.6, halftone: 0.3, vignette: 0.8, edgeFringe: 0.4, paperEdge: 1, chroma: 0.5, chromaRoles: ['accent', 'ink'], scanlines: 0.4, bloom: 0.6, grainRate: 24, look: 'warm-print', lookAmount: 0.7 };
  assert.ok(v.brand({ ...paper, finish }), JSON.stringify(v.brand.errors));
  assert.ok(v.brand({ ...paper, finish: { grain: 0.6, halftone: 0.3, vignette: 0.8, edgeFringe: 0.4, paperEdge: 1 } }), 'the five old strengths alone');
  for (const look of LOOKS) assert.ok(v.brand({ ...paper, finish: { look } }), look);
});

test('the new finish keys refuse a value outside their range, an unknown look and an unknown key', () => {
  for (const bad of [{ chroma: 1.2 }, { scanlines: -0.1 }, { bloom: 2 }, { grainRate: 61 }, { grainRate: -1 }, { look: 'sepia' }, { look: 3 }, { lookAmount: 1.5 }, { chromaRoles: ['accent'] }, { chromaRoles: ['accent', 'red'] }, { glow: 1 }]) {
    assert.equal(v.brand({ ...paper, finish: bad }), false, JSON.stringify(bad));
  }
});

test('the looks are neutral, warm-print, cool-print, faded and high-contrast', () => {
  assert.deepEqual(LOOKS, ['neutral', 'warm-print', 'cool-print', 'faded', 'high-contrast']);
});

test('neutral is no table at all, and an amount of 0 is the identity', () => {
  assert.equal(lookTables('neutral', light), null);
  for (const look of LOOKS.slice(1)) {
    const t = lookTables(look, light, 0);
    for (const ch of ['r', 'g', 'b']) t[ch].forEach((y, i) => assert.ok(Math.abs(y - i / (size - 1)) < 1e-9, `${look} ${ch}[${i}]`));
  }
});

test('every look is a 33-sample table per channel inside 0..1 that never lies more than 0.08 from the identity', () => {
  for (const palette of [light, dark]) for (const look of LOOKS.slice(1)) for (const amount of [0.25, 0.5, 1]) {
    const t = lookTables(look, palette, amount);
    for (const ch of ['r', 'g', 'b']) {
      assert.equal(t[ch].length, size, `${look} ${ch}`);
      t[ch].forEach((y, i) => {
        assert.ok(y >= 0 && y <= 1, `${look} ${ch}[${i}] = ${y}`);
        assert.ok(Math.abs(y - i / (size - 1)) <= LOOK_LIMIT + 1e-9, `${look} ${ch}[${i}] deviates ${Math.abs(y - i / (size - 1))}`);
      });
    }
  }
});

test('a look is a pure function of the palette: the same roles give the same table, a different accent a different tint', () => {
  assert.deepEqual(lookTables('warm-print', light), lookTables('warm-print', { ...light }));
  assert.notDeepEqual(lookTables('warm-print', light), lookTables('warm-print', { ...light, accent: '#2B6CB0', muted: '#4A5568', line: '#CBD5E0', surface: '#F7FAFC', canvas: '#EDF2F7', ink: '#1A202C' }));
});

test('faded lifts the blacks, high-contrast darkens the shadows and lifts the highlights, the warm and cool prints differ', () => {
  const faded = lookTables('faded', light), hc = lookTables('high-contrast', light);
  assert.ok(faded.g[0] > 0.01, 'faded lifts black');
  assert.ok(faded.g[size - 1] <= 1);
  assert.ok(hc.g[6] < 6 / (size - 1) && hc.g[size - 7] > (size - 7) / (size - 1), 'an S-curve');
  const warm = lookTables('warm-print', dark), cool = lookTables('cool-print', dark);
  assert.notDeepEqual(warm, cool);
});

test('the tint is a palette role: the warmest of the roles for a warm print, the coolest for a cool one, none when no role lies that way', () => {
  assert.equal(tintRole({ ...light, accent: '#B5451B' }, 'warm'), 'accent');
  const cream = tintRole({ ...light, accent: '#2B6CB0' }, 'warm');
  assert.ok(['canvas', 'line', 'muted', 'surface'].includes(cream), `a warm neutral of the palette over a blue accent, got ${cream}`);
  assert.equal(tintRole({ ...light, accent: '#2B6CB0' }, 'cool'), 'accent');
  const lime = { canvas: '#0B0D12', ink: '#F2F4F8', muted: '#8A93A6', surface: '#151925', line: '#262C3B', accent: '#D7FF3F', accentInk: '#0B0D12' };
  assert.equal(tintRole(lime, 'warm'), null, 'a lime accent is no warm role');
  assert.equal(tintRole(lime, 'cool'), 'muted');
  const grey = { canvas: '#F2F2F2', ink: '#111111', muted: '#777777', surface: '#FFFFFF', line: '#DDDDDD', accent: '#444444', accentInk: '#FFFFFF' };
  assert.equal(tintRole(grey, 'warm'), null);
  assert.equal(tintRole(grey, 'cool'), null);
});

test('a look with no tint role of its kind is its curve alone, still inside 0.08 and still not the identity', () => {
  const lime = { canvas: '#0B0D12', ink: '#F2F4F8', muted: '#8A93A6', surface: '#151925', line: '#262C3B', accent: '#D7FF3F', accentInk: '#0B0D12' };
  const warm = lookTables('warm-print', lime);
  assert.deepEqual(warm.r, warm.g, 'no tint: the three channels agree');
  assert.ok(warm.g[0] > 0.005, 'matte blacks');
  assert.notDeepEqual(lookTables('cool-print', lime).r, lookTables('cool-print', lime).b, 'the cool print has a role to tint with');
});

test('grain, halftone, paper and scanlines share 0.08: past a total of 1 each is scaled down in proportion', () => {
  assert.deepEqual(overTextShares({ grain: 0.4, scanlines: 0.2 }), { grain: 0.4, halftone: 0, paper: 0, scanlines: 0.2 });
  const s = overTextShares({ grain: 1, halftone: 1, paper: 1, scanlines: 1 });
  const total = s.grain + s.halftone + s.paper + s.scanlines;
  assert.ok(total <= 1 + 1e-9 && total > 0.999, String(total));
  assert.ok(Math.abs(s.grain - s.scanlines) < 1e-9);
  const t = overTextShares({ grain: 1, scanlines: 0.5 });
  assert.ok(Math.abs(t.grain / t.scanlines - 2) < 1e-3);
});

test('the grain seed changes grainRate times a second, 12 by default as before, and holds still at 0', () => {
  assert.equal(grainSeed(1.01), grainSeed(1.02), 'inside one 1/12 s step');
  assert.notEqual(grainSeed(1.01), grainSeed(1.1));
  assert.equal(grainSeed(1.01), 1 + (Math.floor(1.01 * 12 + 1e-9) % 997), 'the old behaviour');
  assert.equal(grainSeed(1.01, 24) === grainSeed(1.03, 24), true);
  assert.notEqual(grainSeed(1.0, 24), grainSeed(1.05, 24), 'twice as often at 24');
  assert.equal(grainSeed(0.3, 0), grainSeed(9.3, 0));
});

test('the fringe is drawn in two palette roles: the accent outside and the muted role inside unless the brand says', () => {
  assert.deepEqual(chromaRoles({}), ['accent', 'muted']);
  assert.deepEqual(chromaRoles({ chromaRoles: ['ink', 'line'] }), ['ink', 'line']);
  assert.deepEqual(chromaRoles({ chromaRoles: ['ink', 'nope'] }), ['ink', 'muted'], 'a name that is no role falls back');
});

test('a look as a function on a colour: the identity with none, the table through a colour with one, and 0.08 at most away', () => {
  const none = gradeOf({}, light);
  assert.deepEqual(none([12, 200, 99]), [12, 200, 99]);
  const faded = gradeOf({ look: 'faded' }, light);
  assert.ok(faded([0, 0, 0])[1] > 10, 'black is lifted');
  for (const rgb of [[30, 27, 22], [244, 239, 230], [181, 69, 27], [128, 128, 128]]) {
    faded(rgb).forEach((c, i) => assert.ok(Math.abs(c - rgb[i]) <= LOOK_LIMIT * 255 + 1, `${rgb} -> ${faded(rgb)}`));
  }
  assert.deepEqual(gradeOf({ look: 'faded', lookAmount: 0 }, light)([30, 27, 22]), [30, 27, 22]);
});

test('the look undone: a painted colour reads back as the colour the stage held before the grade, within a level', () => {
  assert.equal(ungradeLuts({}, light), null);
  const img = { width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) };
  assert.equal(ungradeImage(img, null), img);
  for (const look of LOOKS.slice(1)) for (const palette of [light, dark]) {
    const finish = { look }, grade = gradeOf(finish, palette), luts = ungradeLuts(finish, palette);
    for (const rgb of [[30, 27, 22], [244, 239, 230], [181, 69, 27], [128, 128, 128], [0, 0, 0], [255, 255, 255]]) {
      const back = ungradeImage({ width: 1, height: 1, data: new Uint8Array([...grade(rgb), 255]) }, luts).data;
      for (let c = 0; c < 3; c++) assert.ok(Math.abs(back[c] - rgb[c]) <= 2, `${look}: ${rgb} -> ${grade(rgb)} -> ${[...back].slice(0, 3)}`);
      assert.equal(back[3], 255, 'alpha is kept');
    }
  }
});

test('chroma is the gap, as a share of the short side, between the two ghosts at the frame edge; bloom adds at most 0.08', () => {
  assert.equal(chromaShift(0, 1080), 0);
  assert.ok(Math.abs(chromaShift(1, 1080) - 4.32) < 0.01, '0.4 % of the short side at 1');
  assert.ok(chromaShift(0.5, 1080) * 2 - chromaShift(1, 1080) < 1e-9);
  assert.equal(bloomGain(0), 0);
  assert.ok(Math.abs(bloomGain(1) - 0.08) < 1e-9);
  assert.ok(bloomGain(5) <= 0.08, 'clamped');
});

test('the stage filter is built only from the keys that need it, and holds no literal colour beyond the palette', () => {
  assert.equal(needsFx({ grain: 1, vignette: 0.5 }), false);
  assert.equal(needsFx({ look: 'neutral' }), false);
  assert.equal(needsFx({ lookAmount: 1 }), false);
  for (const f of [{ chroma: 0.5 }, { bloom: 0.5 }, { look: 'faded' }]) assert.equal(needsFx(f), true, JSON.stringify(f));
  assert.equal(fxFilter({ grain: 1 }, light, { w: 1080, h: 1920 }, 'x'), '');
  const f = fxFilter({ chroma: 1, bloom: 1, look: 'faded' }, dark, { w: 1080, h: 1920 }, 'ramp.png');
  assert.match(f, /^<filter id="mm-fx"/);
  assert.match(f, /feDisplacementMap/);
  assert.match(f, /feGaussianBlur/);
  assert.match(f, /feComponentTransfer/);
  assert.match(f, /color-interpolation-filters="sRGB"/);
  const lookOnly = fxFilter({ look: 'faded' }, light, { w: 1080, h: 1920 }, 'ramp.png');
  assert.doesNotMatch(lookOnly, /feImage|feDisplacementMap|feGaussianBlur/);
  const hexes = new Set([...f.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toLowerCase()));
  const roles = new Set(Object.values(dark).map((h) => h.toLowerCase()));
  for (const h of hexes) assert.ok(roles.has(h), `${h} is not a palette role`);
});
