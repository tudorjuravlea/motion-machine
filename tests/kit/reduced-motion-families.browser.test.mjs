// Reduced motion in a deck (SPEC §10), family by family. Under the reader's preference (the page emulates
// reducedMotion 'reduce') a deck draws no movement: seeking inside a press, nothing travels (every element's
// box holds still, within 2 px, at the box it has at the rest the press starts or ends on), and the rests are
// the same pictures as without the preference, the camera apart. The families: entrance, exit, emphasis and
// cut; animated grounds (bloom, graph-paper); a staggered data-each cascade; screen actions on a device
// (scroll, zoom-to, tap); a camera idle move; and a turning 3D device (every move of 3d/phone, the laptop).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { PAGE, mediaAssets } from './media-assets.mjs';

const TOL = 2;   // px
const made = [];
let server, browser;
before(async () => { mediaAssets('rec', 'site'); server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); for (const f of made) rmSync(f, { force: true }); });

/** A deck story written beside the media page (the page reads ?story=<name>), removed when the file ends. */
function deckStory(name, scenes) {
  const file = join(PAGE, `${name}.json`);
  writeFileSync(file, JSON.stringify({ id: name, kind: 'deck', formats: ['16x9'], title: name, language: 'en', facts: [], audio: { track: null, bpm: null, beats: null }, cta: { text: '', url: '' }, scenes }));
  made.push(file);
  return name;
}
const scene = (id, presses, beats, extra = {}) => ({ id, layout: 'layouts/title-stack', presses, cut: 'transitions/hard-cut', move: null, say: '', beats, ...extra });
const stage = (id, presses, beat, extra = {}) => scene(id, presses, [{ step: 1, at: 0, slot: 'stage', ...beat }], { layout: 'layouts/caption-bar', ...extra });

/** The piece opened with the preference on or off before the page mounts. */
async function open(story, { reduced, query = {} }) {
  const o = await openPiece(PAGE, { server, browser, format: '16x9', query: { story, ...query } });
  await o.page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await o.page.reload({ waitUntil: 'load' });
  await o.page.waitForFunction(() => window.mm && window.mm.ready !== undefined);
  await o.page.evaluate(() => document.fonts.ready);
  assert.equal(await o.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), !!reduced);
  return o;
}

/** Every drawn element under the stage, by structural path: its box, and a canvas's turn, crop and frame. */
const snap = (page, x) => page.evaluate(async (at) => {
  window.mm.seek(at);
  await window.mm.settle?.();
  const out = {};
  // what a canvas holds (a 3D device's turn is in its pixels, not its box): a hash of its data URL, read in the task that drew it
  const pixels = (c) => { try { const u = c.toDataURL(); let h = 0; for (let i = 0; i < u.length; i += 7) h = (h * 31 + u.charCodeAt(i)) | 0; return `${u.length}:${h}`; } catch { return null; } };
  const walk = (el, path, alpha, inCamera) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const a = alpha * Number(cs.opacity);
    inCamera ||= el.classList.contains('mm-camera');
    if (a > 0.02) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out[path] = { x: r.x, y: r.y, w: r.width, h: r.height, a, cam: inCamera, tag: el.tagName, ...(el.tagName === 'CANVAS' ? { ry: el.dataset.ry ?? null, view: el.dataset.view ?? null, px: pixels(el) } : {}) };
    }
    [...el.children].forEach((c, i) => walk(c, `${path}/${c.tagName}${i}`, a, inCamera));
  };
  walk(document.querySelector('.mm-stage'), 'stage', 1, false);
  return out;
}, x);

const same = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) <= TOL) && a.ry === b.ry && a.view === b.view && a.px === b.px;
const moved = (a, b) => ['x', 'y', 'w', 'h'].map((k) => `${k} ${a[k].toFixed(1)} to ${b[k].toFixed(1)}`).join(', ') + (a.ry !== b.ry ? ` ry ${a.ry} to ${b.ry}` : '') + (a.view !== b.view ? ` view ${a.view} to ${b.view}` : '') + (a.px !== b.px ? ' pixels differ' : '');

/**
 * With the preference, inside every press nothing travels: each element drawn mid-press stands where it stands at the
 * rest the press starts on or the rest it ends on. Returns how many boxes were compared.
 */
async function assertNothingTravels(o, presses, fractions = [0.1, 0.3, 0.5, 0.7, 0.9]) {
  let looked = 0;
  const rests = [];
  for (let n = 0; n <= presses; n++) rests.push(await snap(o.page, n));
  for (let n = 1; n <= presses; n++) {
    for (const f of fractions) {
      const mid = await snap(o.page, n - 1 + f);
      for (const [path, box] of Object.entries(mid)) {
        const ends = [rests[n - 1][path], rests[n][path]].filter(Boolean);
        if (!ends.length) continue;   // drawn only mid-press (an overlay): nothing to hold against
        looked++;
        assert.ok(ends.some((e) => same(box, e)), `press ${n} at ${f}: ${path} (${box.tag}) travels: ${moved(box, ends[0])}`);
      }
    }
  }
  assert.ok(looked > 0, 'nothing was compared');
  return looked;
}

/** The rests drawn with the preference are the rests drawn without it (what the camera carries apart, when `camera`). */
async function assertRestsMatch(story, presses, { query = {}, camera = false } = {}) {
  const a = await open(story, { reduced: false, query }), b = await open(story, { reduced: true, query });
  try {
    let looked = 0;
    for (let n = 0; n <= presses; n++) {
      const free = await snap(a.page, n), still = await snap(b.page, n);
      for (const [path, box] of Object.entries(free)) {
        if (camera && box.cam) continue;
        assert.ok(still[path], `rest ${n}: ${path} (${box.tag}) is drawn without the preference and missing with it`);
        looked++;
        assert.ok(same(box, still[path]), `rest ${n}: ${path} (${box.tag}) differs: ${moved(box, still[path])}`);
      }
      for (const path of Object.keys(still)) if (!camera || !still[path].cam) assert.ok(free[path], `rest ${n}: ${path} is drawn only with the preference`);
    }
    assert.ok(looked > 0);
  } finally { await a.close(); await b.close(); }
}

const lines = [
  { step: 1, at: 0, slot: 'headline', fx: 'entrances/rise', text: 'A press is the unit.' },
  { step: 2, at: 0, slot: 'sub', fx: 'entrances/fade', text: 'Every integer press is a rest.' },
];

test('entrance, exit, emphasis and cut: nothing travels, the rests are the same', async () => {
  const story = deckStory('reduced-basic', [
    scene('a', 3, [
      { step: 1, at: 0, slot: 'headline', fx: 'entrances/rise', text: 'Rises in', emphasis: 'emphasis/shine' },
      { step: 2, at: 0, slot: 'sub', fx: 'entrances/drop', text: 'Drops in', until: 3, exit: 'exits/push-out' },
    ]),
    scene('b', 1, [{ step: 1, at: 0, slot: 'headline', fx: 'entrances/pop', text: 'Next scene' }], { cut: 'transitions/push' }),
  ]);
  const o = await open(story, { reduced: true });
  try { await assertNothingTravels(o, 4); } finally { await o.close(); }
  await assertRestsMatch(story, 4);
});

const BLOOM = { kind: 'bloom', bloom: { role: 'accent', strength: 0.4 } };
const PAPER = { kind: 'graph-paper', grid: { spacing: 0.02, every: 5, strength: 0.7, drift: 0.012, cycle: 8, scan: { role: 'accent', size: 0.2, strength: 0.14 } } };
for (const [name, ground] of [['bloom', BLOOM], ['graph-paper', PAPER]]) {
  test(`animated ground (${name}): it holds still inside a press and at the rests`, async () => {
    const story = deckStory(`reduced-ground-${name}`, [scene('a', 2, lines), scene('b', 2, lines)]);
    const query = { groundJson: JSON.stringify(ground), preset: 'obsidian-premium' };
    const o = await open(story, { reduced: true, query });
    try {
      assert.ok(await o.page.evaluate(() => document.querySelectorAll('.mm-ground').length) > 0, 'the page draws a ground');
      await assertNothingTravels(o, 4);
    } finally { await o.close(); }
    await assertRestsMatch(story, 4, { query });
  });
}

test('a staggered data-each cascade: no child travels while it arrives, the rests are the same', async () => {
  const story = deckStory('reduced-each', [
    scene('a', 2, [
      { step: 1, at: 0, slot: 'headline', fx: 'entrances/rise', text: 'One | two | three | four', params: { each: true, stagger: 0.15 } },
      { step: 2, at: 0, slot: 'sub', fx: 'entrances/pop', text: 'Five | six | seven', params: { each: true } },
    ], { layout: 'layouts/statement' }),
  ]);
  const o = await open(story, { reduced: true });
  try {
    assert.ok(await assertNothingTravels(o, 2) > 5);
  } finally { await o.close(); }
  await assertRestsMatch(story, 2);
});

for (const [name, actions, presses] of [
  ['scroll', [{ do: 'screen/scroll', step: 1, params: { to: 'Pricing' } }], 1],
  ['zoom-to', [{ do: 'screen/zoom-to', step: 1, params: { at: '50%,25%', s: 2 } }], 1],
  ['tap', [{ do: 'screen/tap', step: 1, params: { at: '30%,40%' } }], 1],
  ['scroll then zoom', [{ do: 'screen/scroll', step: 1, params: { to: 'Pricing' } }, { do: 'screen/zoom-to', step: 2, params: { at: '50%,25%', s: 2 } }], 2],
]) {
  for (const fx of ['devices/phone', 'devices/laptop']) {
    test(`screen action ${name} on ${fx}: the device and the picture hold still inside a press`, async () => {
      const story = deckStory(`reduced-screen-${name.replace(/\W/g, '-')}-${fx.split('/')[1]}`, [stage('call', presses, { fx, asset: 'assets/site/', params: { size: 'large' }, screen: actions })]);
      const o = await open(story, { reduced: true });
      try { await assertNothingTravels(o, presses); } finally { await o.close(); }
      await assertRestsMatch(story, presses);
    });
  }
}

test('camera idle moves: the camera stays still inside a press', async () => {
  for (const move of ['moves/idle-breathe', 'moves/hero-drift', 'moves/push-in']) {
    const story = deckStory(`reduced-move-${move.split('/')[1]}`, [scene('a', 3, [...lines, { step: 3, at: 0, slot: 'sub', fx: 'entrances/fade', text: 'Third' }], { move })]);
    const o = await open(story, { reduced: true });
    try {
      const cams = [];
      for (let x = 0; x <= 3; x += 0.25) {
        cams.push(await o.page.evaluate(async (at) => {
          window.mm.seek(at); await window.mm.settle?.();
          const cs = getComputedStyle(document.querySelector('.mm-camera'));
          return `${cs.transform}|${cs.translate}|${cs.scale}|${cs.rotate}`;
        }, x));
      }
      assert.equal(new Set(cams).size, 1, `${move}: the camera moves: ${[...new Set(cams)].join(' / ')}`);
    } finally { await o.close(); }
  }
});

for (const fx of ['3d/phone', '3d/laptop', '3d/tablet']) {
  const moves = fx === '3d/phone' ? ['hero', 'turntable', 'showcase', 'cross'] : fx === '3d/laptop' ? ['hero', 'turntable'] : ['hero'];
  for (const move of moves) {
    test(`turning 3D device ${fx} (${move}): it holds still inside a press and the rests are the same`, async () => {
      const story = deckStory(`reduced-3d-${fx.split('/')[1]}-${move}`, [stage('d', 2, { fx, asset: 'assets/site/', params: { move } })]);
      const o = await open(story, { reduced: true });
      try {
        await o.mm.seek(2);
        assert.ok(await o.page.evaluate(() => !!document.querySelector('canvas[data-3d]')), 'a 3D canvas is drawn');
        await assertNothingTravels(o, 2);
      } finally { await o.close(); }
      await assertRestsMatch(story, 2);
    });
  }
}

test('film grain: the grain holds one pattern inside a press (a shimmer is movement), and each rest has the grain it has without the preference', async () => {
  const story = deckStory('reduced-grain', [scene('a', 2, lines)]);
  const query = { finishJson: JSON.stringify({ grain: 0.6, grainRate: 12 }) };
  const seedAt = (o, x) => o.page.evaluate(async (at) => { window.mm.seek(at); await window.mm.settle?.(); return document.querySelector('#mm-finish-defs #mm-grain feTurbulence')?.getAttribute('seed') ?? null; }, x);
  const free = await open(story, { reduced: false, query }), still = await open(story, { reduced: true, query });
  try {
    for (const n of [0, 1, 2]) assert.equal(await seedAt(still, n), await seedAt(free, n), `the grain at rest ${n}`);
    const shimmer = new Set();
    for (const x of [0.1, 0.3, 0.5, 0.7, 0.9]) shimmer.add(await seedAt(free, x));
    assert.ok(shimmer.size > 1, 'without the preference the grain does shimmer inside a press (the probe sees it)');
    for (const n of [1, 2]) {
      const seeds = new Set();
      for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) seeds.add(await seedAt(still, n - 1 + f));
      assert.equal(seeds.size, 1, `press ${n}: the grain shimmers under the preference: ${[...seeds]}`);
    }
  } finally { await free.close(); await still.close(); }
});

// the probe sees what it should: without the preference the same pieces do travel inside a press
test('control: without the preference a zoom and a turning phone travel inside a press', async () => {
  for (const [name, beat] of [
    ['reduced-control-zoom', { fx: 'devices/phone', asset: 'assets/site/', params: { size: 'large' }, screen: [{ do: 'screen/zoom-to', step: 1, params: { at: '50%,25%', s: 2 } }] }],
    ['reduced-control-turn', { fx: '3d/phone', asset: 'assets/site/', params: { move: 'cross' } }],
  ]) {
    const story = deckStory(name, [stage('d', 1, beat)]);
    const o = await open(story, { reduced: false });
    try { await assert.rejects(assertNothingTravels(o, 1), /travels/, name); } finally { await o.close(); }
  }
});
