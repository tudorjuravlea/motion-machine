// text/garden's botanical kind, in Node: filled, shaded blooms (camellia, peony, lily, sweet pea,
// bud), broad veined leaves, tendrils and drifting petals, every colour a palette role or a blend of
// two roles; and the bed, a composition that grows the flowers from below the headline toward its
// baseline, as a pure function of the frame, the text box and the seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRESETS, BOUQUET, GRADIENTS, partSets, settingsOf, bloomShapes, leafPts, petalAt, bedLayout } from '../../patterns/text/garden/pattern.js';

const ROLES = ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'];
const set = (params) => settingsOf({ params });
const shapesOf = (form, t = 1, extra = {}) => bloomShapes({ form, r: 120, ang: -Math.PI / 2, tilt: 0.85, seed: 7, botany: true, ...extra }, 0, 0, t, 'grow', 0.1, 100);
const fills = (s, paint) => s.filter((x) => x.paint === paint && x.d);

test('botanical is a kind: a curve stem, broad leaves and a bouquet of illustrated blooms', () => {
  assert.equal(set({ kind: 'botanical' }).kind, 'botanical');
  assert.deepEqual(PRESETS.botanical, { stem: 'curve', leaf: 'broad', bloom: 'bouquet' });
  assert.deepEqual(BOUQUET, ['camellia', 'peony', 'lily', 'sweetpea', 'bud']);
  const s = partSets(set({ kind: 'botanical' }))[0];
  assert.deepEqual([s.kind, s.stem, s.leaf, s.bloom], ['botanical', 'curve', 'broad', 'bouquet']);
});

test('the new parts reach any organic kind: bloom camellia, peony, lily or sweetpea, leaf broad', () => {
  for (const b of ['camellia', 'peony', 'lily', 'sweetpea']) assert.equal(partSets(set({ kind: 'flowers', bloom: b }))[0].bloom, b);
  assert.equal(partSets(set({ kind: 'vines', leaf: 'broad' }))[0].leaf, 'broad');
  assert.equal(partSets(set({ kind: 'botanical', bloom: 'lily' }))[0].bloom, 'lily');
});

test('botanical stays out of mix: mix draws from the ten organic presets it always drew from', () => {
  for (let seed = 1; seed <= 30; seed++) for (const x of partSets(set({ kind: 'mix', seed }))) assert.notEqual(x.kind, 'botanical');
});

test('bed, petals and drift are checked and defaulted', () => {
  const d = set({ kind: 'botanical' });
  assert.equal(d.bed, false);
  assert.equal(d.petals, 8);
  assert.equal(d.drift, 'float');
  const s = set({ kind: 'botanical', bed: true, petals: 99, drift: 'settle' });
  assert.equal(s.bed, true);
  assert.equal(s.petals, 24);
  assert.equal(s.drift, 'settle');
  assert.equal(set({ bed: 'true', petals: -3, drift: 'spin' }).bed, true);
  assert.equal(set({ petals: -3 }).petals, 0);
  assert.equal(set({ drift: 'spin' }).drift, 'float');
});

const rolesIn = (css) => [...css.matchAll(/var\(--mm-color-([A-Za-z]+)\)/g)].map((m) => m[1]);
// a botanical paint is a flat role (its base) under a gradient of alphas of one other role at a time,
// so what it renders is a blend of two roles at every point
test('every botanical paint is a role under alphas of one other role at a time', () => {
  const names = Object.keys(GRADIENTS);
  assert.ok(names.length >= 7, names.join(' '));
  for (const [name, { base, stops }] of Object.entries(GRADIENTS)) {
    assert.ok(ROLES.includes(base), `${name}: base ${base}`);
    assert.ok(stops.length >= 2, `${name}: ${stops.length} stops`);
    let last = -1;
    for (const [at, r, alpha] of stops) {
      assert.ok(at >= 0 && at <= 1 && at >= last, `${name}: offset ${at}`);
      assert.ok(ROLES.includes(r) && r !== base, `${name}: ${r} is another role`);
      assert.ok(alpha >= 0 && alpha <= 1, `${name}: alpha ${alpha}`);
      last = at;
    }
    // between two stops of different roles one of them is fully transparent: never two overlays at once
    for (let i = 1; i < stops.length; i++) if (stops[i][1] !== stops[i - 1][1]) assert.ok(stops[i][2] === 0 || stops[i - 1][2] === 0, `${name}: two roles overlap at ${stops[i][0]}`);
  }
});

test('the colour map: coral camellia, pink sweet peas, cream peonies, golden lilies, teal and sage leaves', () => {
  assert.equal(GRADIENTS.camellia.base, 'accent');
  assert.equal(GRADIENTS.peony.base, 'surface');
  assert.equal(GRADIENTS.lily.base, 'accentInk');
  assert.equal(GRADIENTS.deep.base, 'line');
  assert.equal(GRADIENTS.sage.base, 'muted');
  // sweet peas: the accent blended toward the canvas, nothing else, lighter toward the rim
  assert.equal(GRADIENTS.sweetpea.base, 'accent');
  assert.deepEqual([...new Set(GRADIENTS.sweetpea.stops.map(([, r]) => r))], ['canvas']);
  assert.ok(GRADIENTS.sweetpea.stops.every(([, , a]) => a > 0.1), 'every point of a sweet pea is blended toward the canvas');
  assert.ok(GRADIENTS.sweetpea.stops.at(-1)[2] > GRADIENTS.sweetpea.stops[0][2]);
});

test('the flat botanical classes in the stylesheet are a role or an alpha of one role', () => {
  const css = readFileSync(join(import.meta.dirname, '../../patterns/text/garden/pattern.css'), 'utf8');
  const rules = [...css.matchAll(/\.mm-garden__b-[\w-]+\s*\{([^}]*)\}/g)];
  assert.ok(rules.length >= 6, `${rules.length} botanical classes`);
  for (const [whole, body] of rules) {
    for (const m of body.matchAll(/(fill|stroke|stop-color)\s*:\s*([^;]+);/g)) {
      if (m[2].trim() === 'none') continue;
      assert.equal(rolesIn(m[2]).length, 1, `${whole.split('{')[0].trim()}: ${m[2]}`);
    }
  }
  // fine detail lines are the ink at a low alpha
  assert.match(css, /\.mm-garden__b-detail\s*\{[^}]*stroke:\s*color-mix\(in srgb, var\(--mm-color-ink\) \d+%, transparent\)/);
});

const ringRadii = (s) => [...new Set(s.filter((x) => x.paint === 'camellia' && x.d).map((x) => x.ring))];
test('a camellia is many layered rounded petals in rings, shaded and veined', () => {
  const s = shapesOf('camellia');
  assert.ok(fills(s, 'camellia').length >= 26, `${fills(s, 'camellia').length} petals`);
  assert.ok(ringRadii(s).length >= 4, `${ringRadii(s).length} rings`);
  assert.ok(s.filter((x) => x.cls === 'mm-garden__b-detail').length >= 10, 'veins and edges in fine ink lines');
  // the outer ring is drawn first so the inner rings lie on it
  const rings = s.filter((x) => x.paint === 'camellia' && x.d).map((x) => x.ring);
  for (let i = 1; i < rings.length; i++) assert.ok(rings[i] >= rings[i - 1], 'rings drawn outer to inner');
});

test('a peony is ruffled cream petals round a golden heart', () => {
  const s = shapesOf('peony');
  const petals = fills(s, 'peony');
  assert.ok(petals.length >= 16, `${petals.length} petals`);
  assert.ok(petals.some((x) => x.ruffle >= 4), 'ruffled rims');
  assert.ok(s.filter((x) => x.cls === 'mm-garden__b-gold').length >= 6, 'a golden heart of stamens');
});

test('a lily is six pointed tepals with spots, six stamens and a pistil', () => {
  const s = shapesOf('lily');
  assert.equal(fills(s, 'lily').length, 6);
  assert.ok(s.filter((x) => x.cls === 'mm-garden__b-spot').length >= 12, 'spots');
  assert.equal(s.filter((x) => x.cls === 'mm-garden__b-filament').length, 7, 'six stamens and a pistil');
  assert.equal(s.filter((x) => x.cls === 'mm-garden__b-anther').length, 6);
});

test('a sweet pea is a ruffled standard, two wings, a keel and a green calyx', () => {
  const s = shapesOf('sweetpea', 1, { r: 40 });
  const parts = s.filter((x) => x.part).map((x) => x.part);
  for (const p of ['standard', 'wing', 'keel', 'calyx']) assert.ok(parts.includes(p), p);
  assert.equal(parts.filter((p) => p === 'wing').length, 2);
  assert.ok(s.some((x) => x.part === 'standard' && x.paint === 'sweetpea'));
  assert.ok(s.some((x) => x.part === 'calyx' && x.paint === 'sage'));
});

test('a botanical bud is a shaded closed bud between sepals', () => {
  const s = shapesOf('bud', 1, { r: 30 });
  assert.ok(s.some((x) => x.d && ['peony', 'camellia', 'lilybud'].includes(x.paint)), 'a shaded bud');
  assert.ok(s.filter((x) => x.paint === 'sage').length >= 2, 'sepals');
});

test('every illustrated bloom opens from nothing and is drawn the same every time', () => {
  for (const f of ['camellia', 'peony', 'lily', 'sweetpea', 'bud']) {
    assert.deepEqual(shapesOf(f, 0), [], `${f}: nothing at 0`);
    const a = shapesOf(f, 0.5), b = shapesOf(f, 0.5), c = shapesOf(f, 1);
    assert.deepEqual(a, b, `${f}: deterministic`);
    assert.ok(a.length > 0 && c.length >= a.length * 0.6, `${f}: grows (${a.length} → ${c.length})`);
    for (const x of c) assert.ok(x.paint ? Object.keys(GRADIENTS).includes(x.paint) : /^mm-garden__/.test(x.cls), `${f}: paint ${x.paint ?? x.cls}`);
  }
});

test('a broad leaf is wide and pointed, wider than a lance leaf', () => {
  const w = (shape) => { const p = leafPts({ x: 0, y: 0, ang: 0, len: 100, wid: shape === 'broad' ? 46 : 22, shape }, 1); return Math.max(...p.map((q) => q[1])) - Math.min(...p.map((q) => q[1])); };
  assert.ok(w('broad') > 2 * w('lance'), `${w('broad')} vs ${w('lance')}`);
  const p = leafPts({ x: 0, y: 0, ang: 0, len: 100, wid: 46, shape: 'broad' }, 1);
  const tip = p.reduce((a, q) => (q[0] > a[0] ? q : a));
  assert.ok(tip[0] > 97 && Math.abs(tip[1]) < 6, `a pointed tip at ${tip}`);
});

test('a drifting petal flies from its bloom to its place in the air, then floats within a small bound', () => {
  const e = { src: [0, 0], home: [300, -200], lift: 80, a0: 0, a1: 2, spin: 1.5, r: 20, seed: 4, amp: 12 };
  const p0 = petalAt(e, 0, 0, 0), p1 = petalAt(e, 1, 0, 0);
  assert.ok(Math.hypot(p0.x, p0.y) < 1e-6 && p0.s < 0.05, 'starts at the bloom, small');
  assert.ok(Math.hypot(p1.x - 300, p1.y + 200) < 1e-6 && p1.s === 1, 'lands at home');
  assert.deepEqual(petalAt(e, 0.4, 3, 0), petalAt(e, 0.4, 3, 0), 'pure');
  let far = 0;
  for (let T = 0; T < 40; T += 0.25) { const p = petalAt(e, 1, T, 1); far = Math.max(far, Math.hypot(p.x - 300, p.y + 200)); }
  assert.ok(far > 2 && far <= 12 * 1.2, `floats ${far.toFixed(1)} px from home`);
  // no float until the ramp opens: the landing is continuous
  assert.deepEqual(petalAt(e, 1, 7.3, 0), petalAt(e, 1, 0, 0));
});

// a 16x9 frame with a two-line headline at the top left of the safe area, in the slot's own pixels
const WIDE = { frame: { x0: -64, y0: -64, x1: 1856, y1: 1016 }, box: { W: 1000, H: 250 }, base: 225, em: 120, seed: 1, petals: 8 };
const TALL = { frame: { x0: -72, y0: -72, x1: 1008, y1: 1848 }, box: { W: 900, H: 380 }, base: 350, em: 130, seed: 1, petals: 8 };
const count = (b, type) => b.plants.filter((p) => p.type === type).length;

test('the bed: deterministic, seeded, one hero camellia among peonies, lilies, sweet peas and buds', () => {
  const a = bedLayout(WIDE), b = bedLayout(WIDE), c = bedLayout({ ...WIDE, seed: 2 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const bed of [a, c, bedLayout(TALL)]) {
    assert.equal(count(bed, 'camellia'), 1);
    assert.ok(count(bed, 'peony') >= 2 && count(bed, 'lily') >= 2 && count(bed, 'sweetpea') >= 2, JSON.stringify(bed.plants.map((p) => p.type)));
    assert.ok(count(bed, 'bud') + count(bed, 'lilybud') >= 1, 'buds');
    const tones = new Set(bed.leaves.map((l) => l.tone));
    assert.deepEqual([...tones].sort(), ['deep', 'sage']);
    assert.ok(bed.plants.filter((p) => p.type === 'sweetpea').every((p) => p.tendrils >= 1), 'sweet peas climb with tendrils');
  }
});

test('the bed rises from below the headline: rooted low, every bloom under the text box, reaching toward it', () => {
  for (const L of [WIDE, TALL, { ...WIDE, seed: 5 }, { ...TALL, seed: 9 }]) {
    const bed = bedLayout(L), { frame, box, base } = L, Wf = frame.x1 - frame.x0, Hf = frame.y1 - frame.y0;
    for (const p of bed.plants) {
      assert.ok(p.root[1] >= frame.y1 - 0.02 * Hf, `${p.type} rooted at ${p.root[1].toFixed(0)}, frame bottom ${frame.y1}`);
      assert.ok(p.head[1] - p.r >= box.H, `${p.type} bloom top ${(p.head[1] - p.r).toFixed(0)} under the box bottom ${box.H}`);
      if (p.tip) assert.ok(p.tip[1] >= base, `${p.type} tip ${p.tip[1].toFixed(0)} under the baseline ${base}`);
    }
    const xs = bed.plants.map((p) => p.head[0]);
    assert.ok(Math.min(...xs) <= frame.x0 + 0.12 * Wf && Math.max(...xs) >= frame.x1 - 0.12 * Wf, 'spans the frame');
    const top = Math.min(...bed.plants.map((p) => (p.tip ?? p.head)[1] - (p.tip ? 0 : p.r)));
    assert.ok(top <= box.H + 0.12 * Math.min(Wf, Hf), `reaches up to ${top.toFixed(0)} (box bottom ${box.H})`);
  }
});

test('the bed keeps off other text blocks and floats its petals outside the text box', () => {
  const block = { x0: 0, y0: 300, x1: 700, y1: 380 };
  const bed = bedLayout({ ...WIDE, blocks: [block] });
  for (const p of bed.plants) {
    const nx = Math.max(block.x0, Math.min(block.x1, p.head[0])), ny = Math.max(block.y0, Math.min(block.y1, p.head[1]));
    assert.ok(Math.hypot(nx - p.head[0], ny - p.head[1]) >= p.r * 0.95, `${p.type} bloom on the block`);
  }
  for (const L of [WIDE, TALL]) {
    const b = bedLayout(L);
    assert.equal(b.petals.length, 8);
    for (const q of b.petals) {
      const [x, y] = q.home;
      assert.ok(!(x > -q.r * 2 && x < L.box.W + q.r * 2 && y < L.box.H + q.r * 2), `petal at ${x.toFixed(0)},${y.toFixed(0)} by the text`);
      assert.ok(x > L.frame.x0 && x < L.frame.x1 && y > L.frame.y0 && y < L.frame.y1, 'inside the frame');
    }
  }
  assert.equal(bedLayout({ ...WIDE, petals: 0 }).petals.length, 0);
});

test('the card lists botanical, its blooms, the broad leaf and the bed', () => {
  const card = readFileSync(join(import.meta.dirname, '../../patterns/text/garden/PATTERN.md'), 'utf8');
  for (const w of ['botanical', 'camellia', 'peony', 'lily', 'sweetpea', 'broad', '`bed`', '`petals`', '`drift`']) assert.ok(card.includes(w), w);
  assert.match(card, /\| `bloom` \| enum\(auto\|none\|daisy\|rose\|tulip\|bud\|berry\|spore\|camellia\|peony\|lily\|sweetpea\)/);
  assert.match(card, /\| `leaf` \| enum\(auto\|none\|round\|lance\|heart\|frond\|broad\)/);
});
