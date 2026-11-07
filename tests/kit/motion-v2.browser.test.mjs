// The motion maths in a real page (fixtures/motion/stagger-grid): cascades laid out on a grid with ease families, a
// seeded random order and a preset spring. Frames are pure functions of t: the same instants give the same pixels
// seeked forward and in reverse; the --mm-ease-* variables of a family ease are valid CSS; the order is what was asked.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';

const PIECE = join(ROOT, 'fixtures/motion/stagger-grid');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

test('forward and reverse seek order draw the same pixels in every scene', async () => {
  const o = await openPiece(PIECE, { server, browser, format: '16x9' });
  try {
    const sched = (await o.mm.meta()).schedule;
    const ts = sched.scenes.flatMap((sc) => [0.3, 0.45, 0.6, 0.9].map((d) => sc.start + d));
    const fwd = [];
    for (const t of ts) fwd.push((await framePng(o.page, t)).toString('base64'));
    const rev = [];
    for (const t of [...ts].reverse()) rev.push((await framePng(o.page, t)).toString('base64'));
    assert.deepEqual(fwd, rev.reverse());
    assert.ok(new Set(fwd).size > ts.length / 2, 'the frames differ from each other: something moves');
  } finally { await o.close(); }
});

test('the cascade comes in the order the beat asked for', async () => {
  const o = await openPiece(PIECE, { server, browser, format: '16x9' });
  try {
    const items = (await o.mm.meta()).schedule.items.filter((it) => it.parent && it.slot === 'headline');
    const order = (scene) => items.filter((it) => it.scene === scene).map((it) => it.start);
    const centre = order('centre');
    assert.equal(centre.length, 12);
    const first = Math.min(...centre);
    // a 4 x 3 grid from the centre: the two middle tiles (index 5 and 6) go first
    assert.deepEqual(centre.map((t, i) => (t === first ? i : -1)).filter((i) => i >= 0), [5, 6]);
    const edges = order('edges');
    assert.equal(edges[0], Math.min(...edges), 'from the edges: the corner goes first');
    assert.equal(Math.max(...edges), edges[5], 'and the middle last');
    const axis = order('axis');
    assert.ok(axis[3] < axis[0] && axis[2] < axis[1], 'along x, reversed: the right column before the left');
    assert.equal(new Set(order('random')).size, 12, 'a random order still gives every tile its own step');
  } finally { await o.close(); }
});

test('an ease from a family reaches the page as a valid CSS easing', async () => {
  const o = await openPiece(PIECE, { server, browser, format: '16x9' });
  try {
    const vars = await o.page.evaluate(() => Object.fromEntries(['enter', 'exit', 'move', 'pop'].map((k) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(`--mm-ease-${k}`).trim();
      return [k, [value, CSS.supports('transition-timing-function', value)]];
    })));
    for (const [k, [value, ok]] of Object.entries(vars)) {
      assert.match(value, /^linear\(0, /, `--mm-ease-${k} is a sampled linear()`);
      assert.equal(ok, true, `--mm-ease-${k} is a CSS easing the browser accepts`);
    }
  } finally { await o.close(); }
});
