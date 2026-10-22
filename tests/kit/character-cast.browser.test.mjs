// Any mascot in the page: the fixture brand's cast (a floating droplet with no limbs, a cat-like
// animal with ears, a tail and four legs, a small robot with a screen face, an antenna and arms)
// hops in, idles and acts a mood change through entrances/character and emphasis/act, each named
// with `who`. Its extra parts swing on the hop and are still at rest, every painted colour is a
// palette role, the drawing never leaves its slot, and seeking in either order draws the same.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { compose } from '../../scripts/compose.mjs';
import { newPiece } from '../../scripts/new.mjs';

const CAST = [['drop', null, 'calm', 'happy'], ['cat', 'cat', 'calm', 'surprised'], ['robot', 'robot', 'worried', 'proud']];
const story = {
  id: 'cast-test', title: 'cast test', kind: 'film', formats: ['16x9', '9x16'], language: 'en', facts: [],
  audio: { track: null, bpm: null, beats: null }, cta: { text: 'Say hello', url: 'example.org' },
  scenes: CAST.map(([id, who, mood, to]) => ({
    id, layout: 'layouts/split', duration: 4, cut: 'transitions/hard-cut', move: null,
    beats: [
      { at: 0.2, slot: 'headline', fx: 'entrances/rise', text: 'A new friend' },
      { at: 0.5, slot: 'figure', fx: 'entrances/character', params: { mood, to, ...(who ? { who } : {}) }, emphasis: 'emphasis/act' },
    ],
  })),
};

let server, browser, base;
before(async () => {
  server = await serveRoot(ROOT); browser = await launchBrowser();
  base = mkdtempSync(join(ROOT, '.tmp-cast-'));
  const styleFile = join(base, 'style.json');
  writeFileSync(styleFile, JSON.stringify(compose({ brand: join(ROOT, 'fixtures/mascot/brand.json'), motion: 'kinetic' })));
  const dir = newPiece({ kind: 'film', style: styleFile, dir: join(base, 'piece') });
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story));
});
after(async () => { await browser?.close(); await server?.close(); if (base) rmSync(base, { recursive: true, force: true }); });

const RIG = (sc) => {
  const el = document.querySelector(`[data-scene="${sc}"] [data-slot="figure"]`);
  const svg = el.querySelector(':scope > svg.mm-rig');
  if (!svg) return null;
  const slot = el.getBoundingClientRect();
  let out = 0;
  const painted = [];
  for (const n of svg.querySelectorAll('path, ellipse, circle, rect')) {
    if (n.closest('clipPath')) continue;
    const r = n.getBoundingClientRect();
    if (r.width || r.height) out = Math.max(out, slot.left - r.left, r.right - slot.right, slot.top - r.top, r.bottom - slot.bottom);
    painted.push(n.getAttribute('style') ?? '');
  }
  return {
    html: svg.outerHTML, out, painted, mood: svg.dataset.mood,
    parts: [...svg.querySelectorAll('[data-part]')].map((g) => [g.dataset.part, Number(g.dataset.swing)]),
    limbs: svg.querySelectorAll('.mm-rig__limb').length, plate: !!svg.querySelector('.mm-rig__plate'), mouth: svg.dataset.mouth,
  };
};

test('each cast member is drawn as itself: the droplet floats with no limbs, the cat has its parts and legs, the robot its plate and antenna', async () => {
  const o = await openPiece(join(base, 'piece'), { server, browser, format: '16x9' });
  try {
    await o.mm.seek(3.5);
    const drop = await o.page.evaluate(RIG, 'drop');
    assert.equal(drop.limbs, 0);
    assert.equal(drop.mouth, 'none', 'an eyes-only face');
    assert.match(drop.html, /class="mm-rig__body" transform="translate\(0 -/, 'lifted off the ground');
    await o.mm.seek(7.5);
    const cat = await o.page.evaluate(RIG, 'cat');
    assert.deepEqual(cat.parts.map((p) => p[0]).sort(), ['ear-left', 'ear-right', 'tail']);
    assert.equal(cat.limbs, 8, 'four legs, each with its outline');
    assert.equal(cat.mood, 'surprised', 'the act is kept');
    await o.mm.seek(11.5);
    const robot = await o.page.evaluate(RIG, 'robot');
    assert.ok(robot.plate);
    assert.deepEqual(robot.parts.map((p) => p[0]).sort(), ['antenna', 'antenna-2']);
    assert.equal(robot.mood, 'proud');
    assert.deepEqual(o.errors, []);
  } finally { await o.close(); }
});

test('parts swing during the hop, every colour is a role, and nothing leaves the slot in either format', async () => {
  for (const format of ['16x9', '9x16']) {
    const o = await openPiece(join(base, 'piece'), { server, browser, format });
    try {
      let swing = 0;
      for (let k = 0; k < 3; k++) {
        const sc = CAST[k][0];
        for (let t = 4 * k + 0.5; t < 4 * k + 4; t += 1 / 15) {
          await o.mm.seek(Math.round(t * 1000) / 1000);
          const r = await o.page.evaluate(RIG, sc);
          if (!r) continue;
          assert.ok(r.out <= 0.5, `${format} ${sc} at ${t.toFixed(2)}: ${r.out.toFixed(1)} px outside the slot`);
          for (const st of r.painted) for (const m of st.matchAll(/(?:fill|stroke): ([^;]+)/g)) assert.match(m[1].trim(), /^(none|var\(--mm-color-[a-zA-Z]+\)|color-mix\(in srgb, var\(--mm-color-[a-zA-Z]+\) [\d.]+%, (var\(--mm-color-[a-zA-Z]+\)|transparent)\))$/, m[1]);
          if (sc === 'cat') swing = Math.max(swing, ...r.parts.map((p) => Math.abs(p[1])));
        }
      }
      assert.ok(swing > 5, `${format}: the cat's parts swing (${swing.toFixed(1)} degrees)`);
    } finally { await o.close(); }
  }
});

test('the same instant draws the same character whichever way it is reached', async () => {
  const o = await openPiece(join(base, 'piece'), { server, browser, format: '16x9' });
  try {
    const ts = [0.9, 1.4, 2.2, 5.1, 6.0, 9.3, 10.4, 11.9];
    const fwd = [];
    for (const t of ts) { await o.mm.seek(t); fwd.push(await o.page.evaluate(RIG, CAST[Math.floor(t / 4)][0])); }
    for (let i = ts.length - 1; i >= 0; i--) { await o.mm.seek(ts[i]); assert.equal((await o.page.evaluate(RIG, CAST[Math.floor(ts[i] / 4)][0])).html, fwd[i].html, `t ${ts[i]}`); }
    await o.mm.seek(11.9);
    const robot = await o.page.evaluate(RIG, 'robot');
    assert.ok(robot.parts.every((p) => p[1] === 0), `still at rest: ${JSON.stringify(robot.parts)}`);
  } finally { await o.close(); }
});
