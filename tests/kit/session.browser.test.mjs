// A recorded session in Chromium: the cursor drawn from the pointer track (screen/pointer), the camera that zooms
// where it clicked (screen/zoom-to, mode auto) and the frame it sits in (devices/demo-frame). The recording is a
// scripted session on a fictional app (mediaAssets 'ses'): a click on "New task", a click in the field, typing, a
// click on "Add", a hover. Every instant is a function of t: the same t gives the same pixels in any seek order.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';
import { shapeOf } from '../../runtime/kit/cursor.js';
import { PAGE, mediaAssets } from './media-assets.mjs';

let server, browser, track, rec;
before(async () => {
  mediaAssets('ses', 'rec');
  server = await serveRoot(ROOT); browser = await launchBrowser();
  track = JSON.parse(readFileSync(join(PAGE, 'assets/ses/cursor.json'), 'utf8'));
  rec = JSON.parse(readFileSync(join(PAGE, 'assets/ses/media.json'), 'utf8'));
});
after(async () => { await browser?.close(); await server?.close(); });
const open = (format = '16x9', story = 'session') => openPiece(PAGE, { server, browser, format, query: { story } });
// the film's time for a moment of the recording: the scene starts at 0, the beat arrives at 0.1 and its screen actions start 0.1 later
const SECOND = JSON.parse(readFileSync(join(PAGE, 'session.json'), 'utf8')).scenes[0].duration;
const at = (r, scene = 0) => scene * SECOND + 0.2 + r;
const click = (selector) => track.targets.find((g) => g.selector === selector);

/** Where the screen layer draws the recording (from its content's transform) and the pointer's tip, in screen px. */
const geometry = (page, scene) => page.evaluate((id) => {
  const layer = document.querySelector(`[data-scene="${id}"] .mm-screen`);
  const content = layer.querySelector('.mm-screen__content');
  const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(content.style.transform);
  const svg = layer.querySelector('.mm-screen-fx .pointer');
  return {
    box: { w: layer.clientWidth, h: layer.clientHeight },
    x: Number(m[1]), y: Number(m[2]), s: Number(m[3]),
    pointer: svg && svg.style.display !== 'none' ? { left: parseFloat(svg.style.left), top: parseFloat(svg.style.top), h: parseFloat(svg.style.height), scale: svg.style.transform } : null,
    filter: content.style.filter,
  };
}, scene === 0 ? 'frame' : 'plain');

test('the session runs with no warning: the recording has its pointer track and the kit read it', async () => {
  const o = await open();
  try {
    assert.deepEqual(await o.page.evaluate(() => window.mm.warnings), []);
    assert.equal(rec.cursor, 'cursor.json');
  } finally { await o.close(); }
});

test('the cursor is drawn with its tip on the clicked element, under the camera that zoomed to it', async () => {
  const o = await open();
  try {
    for (const [sel, scene] of [['#new', 0], ['#title', 0], ['#add', 0], ['#new', 1]]) {
      const g = click(sel);
      await o.mm.seek(at(g.timeMs / 1000, scene));
      const geo = await geometry(o.page, scene);
      assert.ok(geo.pointer, `${sel}: a cursor is drawn at the click`);
      const shape = shapeOf(sel === '#title' ? 'text' : 'pointer');
      const k = geo.pointer.h / shape.h;
      const tip = { x: geo.pointer.left + shape.hot[0] * k, y: geo.pointer.top + shape.hot[1] * k };
      // the box of the target, in the screen's px under the camera's transform
      const b = g.box, W = geo.box.w, H = geo.box.h;
      const r = { l: b.x * W * geo.s + geo.x, r: (b.x + b.w) * W * geo.s + geo.x, t: b.y * H * geo.s + geo.y, b: (b.y + b.h) * H * geo.s + geo.y };
      assert.ok(tip.x >= r.l - 4 && tip.x <= r.r + 4 && tip.y >= r.t - 4 && tip.y <= r.b + 4, `${sel}: the tip (${tip.x.toFixed(0)}, ${tip.y.toFixed(0)}) is in the box ${JSON.stringify(r)}`);
      assert.match(geo.pointer.scale, /scale\(/);
    }
  } finally { await o.close(); }
});

test('the camera has zoomed in on the target by the time it is clicked, and the whole box is in view', async () => {
  const o = await open();
  try {
    for (const sel of ['#new', '#add']) {
      const g = click(sel);
      await o.mm.seek(at(g.timeMs / 1000 + 0.6));
      const geo = await geometry(o.page, 0);
      assert.ok(geo.s > 1.9, `${sel}: zoom ${geo.s}`);
      const b = g.box, W = geo.box.w, H = geo.box.h;
      const l = b.x * W * geo.s + geo.x, rr = (b.x + b.w) * W * geo.s + geo.x, t = b.y * H * geo.s + geo.y, bt = (b.y + b.h) * H * geo.s + geo.y;
      assert.ok(l >= -2 && rr <= W + 2 && t >= -2 && bt <= H + 2, `${sel}: the box is in view (${[l, t, rr, bt].map(Math.round)} of ${W} by ${H})`);
      // and the view never shows beyond the recording
      assert.ok(geo.x <= 0.5 && geo.y <= 0.5 && geo.x + W * geo.s >= W - 0.5 && geo.y + H * geo.s >= H - 0.5, 'the recording covers the screen');
    }
    await o.mm.seek(at(rec.duration - 0.05));
    assert.ok((await geometry(o.page, 0)).s < 1.05, 'zoomed out again by the end');
  } finally { await o.close(); }
});

test('the same t gives the same pixels in any seek order, in the frame and in the plain window', async () => {
  const o = await open();
  try {
    const ts = [at(1.0), at(2.4), at(3.4), at(4.6), at(6.0), at(1.6, 1), at(3.4, 1), at(5.2, 1)];
    const first = [];
    for (const t of ts) first.push(await framePng(o.page, t));
    const reverse = [];
    for (const t of [...ts].reverse()) reverse.push(await framePng(o.page, t));
    reverse.reverse();
    ts.forEach((t, i) => assert.ok(first[i].equals(reverse[i]), `t ${t.toFixed(2)} differs after other seeks`));
  } finally { await o.close(); }
});

test('the frame leans only while a zoom is on, and the cursor and the camera follow the recording\'s own clock', async () => {
  const o = await open();
  try {
    const plane = () => o.page.evaluate(() => { const p = document.querySelector('[data-scene="frame"] .demo-frame__plane'); return p.style.transform; });
    await o.mm.seek(at(0.1));
    assert.equal(await plane(), 'none');
    await o.mm.seek(at(click('#title').timeMs / 1000 + 0.3));
    assert.match(await plane(), /^scale\([\d.]+\) perspective\([\d.]+px\) rotateX\(-(9\.99\d*|10)deg\) rotateY\(-(15\.9\d*|16)deg\)$/, 'iso at full strength');
    await o.mm.seek(at(rec.duration - 0.05));
    assert.equal(await plane(), 'none', 'flat again once the zoom has gone');
  } finally { await o.close(); }
});

test('the frame is the same share of the stage at 16x9 and 9x16: padding, shape and a shadow of three layers', async () => {
  const shares = [];
  for (const format of ['16x9', '9x16']) {
    const o = await open(format);
    try {
      await o.mm.seek(at(0.5));
      const m = await o.page.evaluate(() => {
        const root = document.querySelector('[data-scene="frame"] .demo-frame');
        const shadow = root.querySelector('.demo-frame__shadow'), plane = root.querySelector('.demo-frame__plane');
        const cs = getComputedStyle(document.documentElement);
        return { rootW: root.offsetWidth, rootH: root.offsetHeight, w: shadow.offsetWidth, h: shadow.offsetHeight, frameW: parseFloat(cs.getPropertyValue('--mm-frame-w')), frameH: parseFloat(cs.getPropertyValue('--mm-frame-h')),
          filter: shadow.style.filter, radius: parseFloat(plane.style.borderRadius), fit: root.style.getPropertyValue('--demo-fit'), ratio: root.style.getPropertyValue('--demo-ratio') };
      });
      assert.ok(Math.abs(m.rootW / m.frameW - 0.8) < 0.005 && Math.abs(m.rootH / m.frameH - 0.8) < 0.005, `${format}: 0.8 of the frame (${m.rootW / m.frameW}, ${m.rootH / m.frameH})`);
      assert.ok(Math.abs(m.w / m.h - 1.6) < 0.01, `${format}: the shape of the recording, ${m.w / m.h}`);
      assert.ok(Math.abs(Math.max(m.w / m.rootW, m.h / m.rootH) - 1) < 0.005, `${format}: it fills the padded frame on its limiting side`);
      assert.equal(m.filter.match(/drop-shadow/g).length, 3);
      assert.ok(Math.abs(m.radius - 0.03 * Math.min(m.w, m.h)) < 0.5, `${format}: radius ${m.radius}`);
      shares.push(m.rootW / m.frameW);
    } finally { await o.close(); }
  }
  assert.ok(Math.abs(shares[0] - shares[1]) < 0.005);
});

test('a brand sets the look once for every use: padding, radius, shadow role and the cursor\'s roles from style.patterns', async () => {
  const patternsJson = JSON.stringify({ 'devices/demo-frame': { padding: 0, radius: 0.1, shadow: 0, shadowRole: 'accent' }, 'screen/pointer': { fill: 'accent', outline: 'ink', look: 'soft', size: 0.08 } });
  const o = await openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'session', patternsJson } });
  try {
    await o.mm.seek(at(1.2));
    const m = await o.page.evaluate(() => {
      const root = document.querySelector('[data-scene="frame"] .demo-frame'), path = document.querySelector('[data-scene="frame"] .mm-screen-fx .pointer path');
      return { fit: root.style.getPropertyValue('--demo-fit'), filter: root.querySelector('.demo-frame__shadow').style.filter, fill: path.style.fill, stroke: path.style.stroke, join: path.style.strokeLinejoin };
    });
    assert.equal(m.fit, '1', 'padding 0 fills the frame');
    assert.equal(m.filter, 'none', 'shadow 0');
    assert.match(m.fill, /--mm-color-accent/);
    assert.match(m.stroke, /--mm-color-ink/);
    assert.equal(m.join, 'round');
  } finally { await o.close(); }
});

test('camera motion blur is on while the camera moves and off at rest', async () => {
  const o = await open();
  try {
    let moving = 0;
    for (let r = 0.2; r < 4.5; r += 0.1) {
      await o.mm.seek(at(r, 1));
      const g = await geometry(o.page, 1);
      if (g.filter.startsWith('url(')) moving++;
    }
    assert.ok(moving > 3, `blurred on ${moving} of the instants sampled`);
    await o.mm.seek(at(rec.duration - 0.05, 1));
    assert.ok(!(await geometry(o.page, 1)).filter, 'no blur at rest');
    const n = await o.page.evaluate(() => document.querySelectorAll('[data-scene="plain"] svg[data-mm-blur]').length);
    assert.equal(n, 1, 'one filter in the layer, kept');
  } finally { await o.close(); }
});

test('a recording with no pointer track says so, and draws nothing', async () => {
  const o = await open('16x9', 'session-bare');
  try {
    const warnings = await o.page.evaluate(() => window.mm.warnings);
    assert.ok(warnings.some((w) => /screen\/pointer reads a pointer track/.test(w)), warnings.join('\n'));
    assert.ok(warnings.some((w) => /screen\/zoom-to reads a pointer track/.test(w)));
    await o.mm.seek(1.2);
    assert.equal(await o.page.evaluate(() => document.querySelectorAll('.mm-screen-fx .pointer').length), 0);
  } finally { await o.close(); }
});
