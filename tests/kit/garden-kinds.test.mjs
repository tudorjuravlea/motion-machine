// text/garden as a small organic grammar, in Node: a kind is a preset of three parts (a stem, a
// leaf, a bloom), each part can be set on its own, `mix` combines two or three part sets by seed,
// each stem type has its own growth form, and every leaf and bloom shape is a pure function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRESETS, FORMS, partSets, settingsOf, sprout, leafPts, bloomShapes, frondLeaflets } from '../../patterns/text/garden/pattern.js';
import { random } from '../../runtime/kit/random.js';

const DEG = Math.PI / 180;
const NEW = ['leaves', 'ferns', 'branches', 'roots', 'coral', 'seaweed', 'moss', 'grass'];
const ORGANIC = ['vines', 'flowers', ...NEW];
const set = (params) => settingsOf({ params });
const many = (n, f) => Array.from({ length: n }, (_, i) => f(random(`k|${i}`), i));
const base = { x: 0, y: 0, heading: -Math.PI / 2, size: 100, stemScale: 1, density: 1 };

test('every organic kind is a preset of a stem, a leaf and a bloom', () => {
  assert.deepEqual(PRESETS.vines, { stem: 'curve', leaf: 'lance', bloom: 'daisy' });
  assert.deepEqual(PRESETS.flowers, { stem: 'curve', leaf: 'lance', bloom: 'daisy' });
  assert.deepEqual(PRESETS.leaves, { stem: 'curve', leaf: 'heart', bloom: 'none' });
  assert.deepEqual(PRESETS.ferns, { stem: 'curve', leaf: 'frond', bloom: 'none' });
  assert.deepEqual(PRESETS.branches, { stem: 'branch', leaf: 'none', bloom: 'daisy' });
  assert.deepEqual(PRESETS.roots, { stem: 'root', leaf: 'none', bloom: 'none' });
  assert.deepEqual(PRESETS.coral, { stem: 'branch', leaf: 'none', bloom: 'none' });
  assert.deepEqual(PRESETS.seaweed, { stem: 'ribbon', leaf: 'none', bloom: 'none' });
  assert.deepEqual(PRESETS.moss, { stem: 'none', leaf: 'lance', bloom: 'spore' });
  assert.deepEqual(PRESETS.grass, { stem: 'ribbon', leaf: 'none', bloom: 'spore' });
  for (const k of NEW) assert.equal(set({ kind: k }).kind, k, `${k} is a kind`);
});

test('a part set on its own overrides the preset; auto keeps it; an unknown value falls back to auto', () => {
  assert.deepEqual(partSets(set({ kind: 'vines' })).map(({ stem, leaf, bloom }) => ({ stem, leaf, bloom })), [{ stem: 'curve', leaf: 'lance', bloom: 'daisy' }]);
  const s = partSets(set({ kind: 'vines', leaf: 'heart', bloom: 'rose' }))[0];
  assert.deepEqual([s.kind, s.stem, s.leaf, s.bloom], ['vines', 'curve', 'heart', 'rose']);
  const r = partSets(set({ kind: 'grass', stem: 'root', leaf: 'auto', bloom: 'berry' }))[0];
  assert.deepEqual([r.stem, r.leaf, r.bloom], ['root', 'none', 'berry']);
  const u = partSets(set({ kind: 'ferns', stem: 'tree', leaf: 7, bloom: 'orchid' }))[0];
  assert.deepEqual([u.stem, u.leaf, u.bloom], ['curve', 'frond', 'none']);
});

test('a number given as bloom is read as the blossom share, as before', () => {
  const a = set({ kind: 'vines', bloom: 0.2 });
  assert.equal(a.bloomShare, 0.2);
  assert.equal(partSets(a)[0].bloom, 'daisy');
  assert.equal(set({ kind: 'vines' }).bloomShare, 0.5);
  assert.equal(set({ kind: 'vines', bloomShare: 0.9 }).bloomShare, 0.9);
});

test('circuits and crystals are not organic: the parts do not apply to them', () => {
  for (const k of ['circuits', 'crystals']) {
    const s = partSets(set({ kind: k, stem: 'ribbon', leaf: 'heart', bloom: 'rose' }));
    assert.equal(s.length, 1);
    assert.equal(s[0].kind, k);
    assert.equal(s[0].stem, undefined);
  }
});

test('mix combines two or three organic part sets, chosen by the seed, the same every time', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 24; seed++) {
    const a = partSets(set({ kind: 'mix', seed })), b = partSets(set({ kind: 'mix', seed }));
    assert.deepEqual(a, b, `seed ${seed}: deterministic`);
    assert.ok(a.length === 2 || a.length === 3, `seed ${seed}: ${a.length} sets`);
    assert.equal(new Set(a.map((x) => x.kind)).size, a.length, 'no set twice');
    for (const x of a) assert.ok(ORGANIC.includes(x.kind), `${x.kind} is organic`);
    seen.add(a.map((x) => x.kind).sort().join('+'));
  }
  assert.ok(seen.size >= 8, `24 seeds give ${seen.size} combinations`);
  const lengths = new Set(Array.from({ length: 24 }, (_, i) => partSets(set({ kind: 'mix', seed: i + 1 })).length));
  assert.deepEqual([...lengths].sort(), [2, 3], 'both two and three sets occur');
  // a part given on its own reaches every set of the mix
  for (const x of partSets(set({ kind: 'mix', seed: 3, bloom: 'tulip' }))) assert.equal(x.bloom, 'tulip');
});

test('the curve form is the garden\'s own stem: sprout with it grows exactly what sprout grows by default', () => {
  for (let i = 0; i < 50; i++) assert.deepEqual(sprout(random(`f|${i}`), { ...base, form: FORMS.curve }), sprout(random(`f|${i}`), base));
});

test('branch: straighter twigs with angular joints, more offshoots, and twigs on the offshoots', () => {
  let joints = 0, kids = 0, grand = 0;
  for (const s of many(800, (r) => sprout(r, { ...base, form: FORMS.branch }))) {
    assert.ok(s.segs.length >= 2 && s.segs.length <= 5, `${s.segs.length} segments`);
    for (const g of s.segs) assert.ok(Math.abs(g.turn) >= 5 * DEG - 1e-9 && Math.abs(g.turn) <= 18 * DEG + 1e-9, `turn ${g.turn / DEG}`);
    joints += s.segs.length - 1;
    for (const c of s.children) {
      kids++;
      for (const gc of c.stem.children) { grand++; assert.deepEqual(gc.stem.children, [], 'no third level'); }
    }
  }
  assert.ok(kids / joints > 0.4, `offshoots at ${(kids / joints).toFixed(2)} of the joints`);
  assert.ok(grand > 0, 'some offshoot carries a twig of its own');
});

test('root: grows downward and forks, a pull toward the ground keeps it from climbing', () => {
  for (const s of many(400, (r) => sprout(r, { ...base, heading: Math.PI / 2, form: FORMS.root }))) {
    const walk = (st) => {
      for (const g of st.segs) assert.ok(g.p3[1] > g.p0[1] - 1e-9 || Math.abs(g.p3[1] - g.p0[1]) < g.len * 0.35, 'no segment climbs steeply');
      assert.ok(st.segs.at(-1).p3[1] > st.segs[0].p0[1], 'the tip lies below the start');
      for (const c of st.children) walk(c.stem);
    };
    walk(s);
  }
  const forks = many(400, (r) => sprout(r, { ...base, heading: Math.PI / 2, form: FORMS.root }).children.length).reduce((a, b) => a + b, 0);
  assert.ok(forks > 400, `${forks} forks over 400 roots`);
});

test('ribbon and blade: no offshoots, held upright by the pull', () => {
  for (const form of [FORMS.kelp, FORMS.blade]) {
    for (const s of many(300, (r) => sprout(r, { ...base, form }))) {
      assert.deepEqual(s.children, []);
      assert.ok(s.segs.at(-1).p3[1] < s.segs[0].p0[1], 'the tip stands above the root');
      for (const g of s.segs) assert.ok(Math.abs(Math.atan2(Math.sin(g.a0 + Math.PI / 2), Math.cos(g.a0 + Math.PI / 2))) < 70 * DEG, 'never leans past 70 degrees');
    }
  }
});

// a leaf outline in its own frame: x along the midrib from the stalk, y across
const local = (pts) => pts.map(([x, y]) => [x, y]);
const leafOf = (shape) => local(leafPts({ x: 0, y: 0, ang: 0, len: 100, wid: shape === 'lance' ? 45 : 90, shape }, 1));

test('a heart leaf is symmetric, notched at its stalk and widest in its lower half', () => {
  const p = leafOf('heart');
  const halfAt = (u) => Math.max(...p.filter(([x]) => Math.abs(x - u) < 4).map(([, y]) => Math.abs(y)));
  const up = p.filter(([, y]) => y < -1e-6).map(([x, y]) => [x, -y]).sort((a, b) => a[0] - b[0]);
  const down = p.filter(([, y]) => y > 1e-6).sort((a, b) => a[0] - b[0]);
  assert.equal(up.length, down.length, 'as many points on each side');
  up.forEach((q, i) => assert.ok(Math.hypot(q[0] - down[i][0], q[1] - down[i][1]) < 1e-6, 'mirror image'));
  const minX = Math.min(...p.map(([x]) => x)), stalk = Math.min(...p.filter(([, y]) => Math.abs(y) < 2).map(([x]) => x));
  assert.ok(stalk - minX > 6, `the notch sinks ${(stalk - minX).toFixed(1)} px into the lobes`);
  const widest = p.reduce((a, q) => (Math.abs(q[1]) > Math.abs(a[1]) ? q : a));
  assert.ok(widest[0] < 50, `widest at ${widest[0].toFixed(1)} of 100`);
  assert.ok(Math.max(...p.map(([x]) => x)) > 95, 'it ends in a point at its full length');
  assert.ok(halfAt(30) > halfAt(80), 'it narrows toward the tip');
});

test('a round leaf is nearly as wide as it is long; a lance leaf is narrow', () => {
  const width = (p) => Math.max(...p.map(([, y]) => y)) - Math.min(...p.map(([, y]) => y));
  const length = (p) => Math.max(...p.map(([x]) => x)) - Math.min(...p.map(([x]) => x));
  const r = leafOf('round'), l = leafOf('lance');
  assert.ok(width(r) / length(r) >= 0.7, `round ${(width(r) / length(r)).toFixed(2)}`);
  assert.ok(width(l) / length(l) <= 0.5, `lance ${(width(l) / length(l)).toFixed(2)}`);
});

test('a frond grades its leaflets: longest near the base, shortest at the tip', () => {
  const f = frondLeaflets(random('frond'), 2.4, 0.2);
  assert.ok(f.length >= 16, `${f.length} leaflets`);
  for (const q of f) assert.ok(q.u > 0 && q.u < 1 && (q.side === 1 || q.side === -1));
  const lens = f.filter((q) => q.side === 1).map((q) => q.len);
  const third = Math.floor(lens.length / 3);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(lens.slice(0, third)) > 1.8 * mean(lens.slice(-third)), 'the lower third is much longer than the upper third');
  for (let i = third + 1; i < lens.length; i++) assert.ok(lens[i] <= lens[i - 1] + 1e-9, 'past the base they only shorten');
});

const shapesOf = (form, r = 40, t = 1, extra = {}) => bloomShapes({ form, r, ang: 0, n: 5, twist: 0, notch: true, seed: 3, ...extra }, 0, 0, t, 'grow', 0.1, 40);
const ptsOf = (s) => s.pts ?? s.line ?? (s.circle ? [[s.circle[0], s.circle[1]]] : []);

test('a rose is rings of petals around a spiral heart, all within its radius', () => {
  const s = shapesOf('rose');
  const petals = s.filter((x) => x.cls.includes('mm-garden__petal'));
  assert.ok(petals.length >= 12, `${petals.length} petals`);
  assert.ok(s.some((x) => x.cls === 'mm-garden__crease' && x.line && x.line.length > 20), 'a spiral line at its heart');
  for (const x of s) for (const [px, py] of ptsOf(x)) assert.ok(Math.hypot(px, py) <= 40 * 1.15, 'inside 1.15 R');
});

test('a tulip is a cup of three petals opening along the stem', () => {
  const petals = shapesOf('tulip').filter((x) => x.cls.includes('mm-garden__petal'));
  assert.equal(petals.length, 3);
  for (const p of petals) for (const [px] of p.pts) assert.ok(px >= -40 * 0.12, 'every petal lies ahead of the stem end');
});

test('berries: three to six round berries, each with a shine, packed within the radius', () => {
  for (let seed = 0; seed < 20; seed++) {
    const s = shapesOf('berry', 40, 1, { seed });
    const berries = s.filter((x) => x.cls === 'mm-garden__berry'), shine = s.filter((x) => x.cls === 'mm-garden__shine');
    assert.ok(berries.length >= 3 && berries.length <= 6, `${berries.length} berries`);
    assert.equal(shine.length, berries.length);
    for (const b of berries) assert.ok(Math.hypot(b.circle[0], b.circle[1]) + b.circle[2] <= 40 * 1.05);
  }
});

test('a spore head: one capsule when small, three to seven grains along the stem when larger', () => {
  const small = shapesOf('spore', 6).filter((x) => x.cls.includes('mm-garden__petal'));
  assert.equal(small.length, 1);
  for (let seed = 0; seed < 10; seed++) {
    const big = shapesOf('spore', 40, 1, { seed }).filter((x) => x.cls.includes('mm-garden__petal'));
    assert.ok(big.length >= 3 && big.length <= 7, `${big.length} grains`);
    for (const g of big) for (const [px] of g.pts) assert.ok(px >= -40 * 0.1, 'grains sit ahead along the stem');
  }
});

test('every bloom opens from nothing: no shape before it starts, its full set once open', () => {
  for (const form of ['daisy', 'rose', 'tulip', 'bud', 'berry', 'spore']) {
    assert.equal(shapesOf(form, 40, 0).length, 0, `${form} at 0`);
    assert.ok(shapesOf(form, 40, 1).length > 0, `${form} at 1`);
  }
});

test('the card lists every kind and the three parts', () => {
  const card = readFileSync(join(import.meta.dirname, '../../patterns/text/garden/PATTERN.md'), 'utf8');
  for (const k of [...NEW, 'mix']) assert.match(card, new RegExp(`\\b${k}\\b`), k);
  assert.match(card, /\| `stem` \| enum\(auto\|curve\|branch\|ribbon\|root\|none\)/);
  assert.match(card, /\| `leaf` \| enum\(auto\|none\|round\|lance\|heart\|frond[|)]/);
  assert.match(card, /\| `bloom` \| enum\(auto\|none\|daisy\|rose\|tulip\|bud\|berry\|spore[|)]/);
});
