// mm capture site: a page captured once as tall JPEG tiles plus
// media.json (viewport, height, tiles, marks), banners hidden, lazy images loaded. Fixture:
// fixtures/site (20,000 css px tall; magenta cookie banner; a lazy #2E86DE image at y 19,004).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { capture } from '../../scripts/capture-site.mjs';
import { ROOT, mm } from './cli-helpers.mjs';

const SITE = join(ROOT, 'fixtures', 'site');
const work = join(ROOT, `.tmp-cli-site-${process.pid}`);
const url = (f) => pathToFileURL(join(SITE, f)).href;
const site = (name) => JSON.parse(readFileSync(join(work, 'assets', name, 'media.json'), 'utf8'));
/** RGB rows of a JPEG tile, decoded by ffmpeg: { w, h, px(x, y) }. */
function decode(file) {
  const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const [w, h] = p.stdout.trim().split(',').map(Number);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 30 });
  return { w, h, data: r.stdout, px: (x, y) => { const i = (Math.round(y) * w + Math.round(x)) * 3; return [r.stdout[i], r.stdout[i + 1], r.stdout[i + 2]]; } };
}
const near = (a, b, tol = 14) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

before(() => { rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true }); });
after(() => rmSync(work, { recursive: true, force: true }));

test('capture writes tiles that cover the page, none taller than 16,000 device px', () => {
  const r = mm(['capture', 'site', '--url', url('index.html'), '--name', 'fx', '--piece', work, '--device', 'phone',
    '--mark', 'Pricing=#pricing', '--mark', 'Signup=.cta', '--mark', 'Lazy=#lazy']);
  assert.equal(r.status, 0, r.out);
  const s = site('fx');
  assert.equal(s.kind, 'page'); assert.equal(s.device, 'phone');
  assert.deepEqual(s.viewport, { w: 390, h: 844, scale: 3 });
  assert.equal(s.height, 20000);
  assert.equal(s.tiles.reduce((n, t) => n + t.h, 0), s.height);
  assert.ok(s.tiles.length >= 4);
  for (const t of s.tiles) {
    assert.ok(t.h * 3 <= 16000, `tile ${t.file} is ${t.h * 3} device px`);
    assert.equal(decode(join(work, 'assets', 'fx', t.file)).h, t.h * 3);
  }
  assert.ok(!Number.isNaN(Date.parse(s.captured)));
});

test('the capture writes its licence record: the page address, "third-party, ask", the date; a person\'s edit survives a recapture of the same page', () => {
  const first = mm(['capture', 'site', '--url', url('index.html'), '--name', 'lic', '--piece', work, '--device', 'phone']);
  assert.equal(first.status, 0, first.out);
  const file = join(work, 'assets', 'lic.licence.json');
  const rec = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(rec.licence, 'third-party, ask');
  assert.equal(rec.source, 'fixtures/site/index.html', 'a file in the repository is recorded by its repository path');
  assert.match(rec.retrieved, /^\d{4}-\d\d-\d\d$/);
  writeFileSync(file, `${JSON.stringify({ ...rec, licence: 'CC0-1.0', author: 'the page owner' })}\n`);
  const again = mm(['capture', 'site', '--url', url('index.html'), '--name', 'lic', '--piece', work, '--device', 'phone']);
  assert.equal(again.status, 0, again.out);
  const kept = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(kept.licence, 'CC0-1.0');
  assert.equal(kept.author, 'the page owner');
});

test('marks are page-relative boxes in css px', () => {
  const m = site('fx').marks;
  assert.ok(Math.abs(m.Pricing.y - 2000) <= 1, `Pricing.y ${m.Pricing.y}`);
  assert.ok(m.Signup.y > 10000 && m.Signup.w > 0 && m.Signup.h > 0);
  assert.ok(Math.abs(m.Lazy.y - 19004) <= 1, `Lazy.y ${m.Lazy.y}`);   // tail starts at 18,000; its 4 px top border; the box sits 1,000 below
});

test('the cookie banner is hidden: no magenta anywhere in the capture', () => {
  for (const t of site('fx').tiles) {
    const d = decode(join(work, 'assets', 'fx', t.file));
    let magenta = 0;
    for (let i = 0; i < d.data.length; i += 3 * 7) if (d.data[i] > 230 && d.data[i + 1] < 40 && d.data[i + 2] > 230) magenta++;
    assert.equal(magenta, 0, `${t.file} shows the banner`);
  }
});

test('the lazy image near the bottom is loaded, not its grey placeholder', () => {
  const s = site('fx'); const m = s.marks.Lazy;
  const cy = m.y + m.h / 2, cx = m.x + m.w / 2;
  const tile = s.tiles.find((t) => cy >= t.y && cy < t.y + t.h);
  const rgb = decode(join(work, 'assets', 'fx', tile.file)).px(cx * 3, (cy - tile.y) * 3);
  assert.ok(near(rgb, [46, 134, 222]), `lazy image pixel ${rgb}`);
});

test('a mark that matches nothing exits 2 naming its label and selector', () => {
  const r = mm(['capture', 'site', '--url', url('index.html'), '--name', 'bad', '--piece', work, '--mark', 'Ghost=#nope']);
  assert.equal(r.status, 2, r.out); assert.match(r.out, /Ghost/); assert.match(r.out, /#nope/);
});

test('a page shorter than the viewport gives one tile and a height of at least the viewport', () => {
  const r = mm(['capture', 'site', '--url', url('short.html'), '--name', 'short', '--piece', work]);
  assert.equal(r.status, 0, r.out);
  const s = site('short');
  assert.equal(s.tiles.length, 1); assert.equal(s.height, 844);
});

test('a capture that fails while it writes leaves the previous capture of that name in place', async () => {
  assert.equal(mm(['capture', 'site', '--url', url('short.html'), '--name', 'keep', '--piece', work]).status, 0);
  const before = readFileSync(join(work, 'assets', 'keep', 'media.json'), 'utf8');
  const real = chromium.launch;
  chromium.launch = async (o) => {   // a Chromium whose screenshots fail
    const b = await real.call(chromium, o);
    const newContext = b.newContext.bind(b);
    b.newContext = async (...a) => {
      const c = await newContext(...a);
      const newPage = c.newPage.bind(c);
      c.newPage = async () => { const p = await newPage(); p.screenshot = async () => { throw new Error('screenshot failed'); }; return p; };
      return c;
    };
    return b;
  };
  try { await assert.rejects(capture({ url: url('short.html'), name: 'keep', piece: work }), /screenshot failed/); } finally { chromium.launch = real; }
  assert.equal(readFileSync(join(work, 'assets', 'keep', 'media.json'), 'utf8'), before);
  assert.ok(existsSync(join(work, 'assets', 'keep', 'page-1.jpg')));
  assert.ok(!existsSync(join(work, 'assets', 'keep.partial')), 'no staging folder is left behind');
});

test('a missing --url exits 2 with the usage', () => {
  const r = mm(['capture', 'site', '--name', 'x', '--piece', work]);
  assert.equal(r.status, 2); assert.match(r.out, /mm capture site/);
});

test('a consent class on <html> or <body> does not blank the page', () => {
  const r = mm(['capture', 'site', '--url', url('cookieclass.html'), '--name', 'cc', '--piece', work]);
  assert.equal(r.status, 0, r.out);
  const s = site('cc');
  const rgb = decode(join(work, 'assets', 'cc', s.tiles[0].file)).px(195 * 3, 400 * 3);
  assert.ok(near(rgb, [0x2F, 0x6F, 0x5E]), `content pixel ${rgb}`);
});

test('an infinite-scroll page is captured to the height cap and the capture ends', () => {
  const t0 = Date.now();
  const r = mm(['capture', 'site', '--url', url('infinite.html'), '--name', 'inf', '--piece', work, '--max-height', '9000']);
  assert.equal(r.status, 0, r.out);
  assert.ok(Date.now() - t0 < 60_000, 'the capture took over a minute');
  assert.ok(site('inf').height <= 9000, `height ${site('inf').height}`);
});

test('a file:// page inside the repository is recorded by its repository path, never an absolute one', () => {
  assert.equal(site('fx').url, 'fixtures/site/index.html');
});

test('a mark inside a sticky or fixed element is flagged and warned about', () => {
  const r = mm(['capture', 'site', '--url', url('index.html'), '--name', 'sticky', '--piece', work, '--mark', 'Header=header']);
  assert.equal(r.status, 0, r.out);
  assert.equal(site('sticky').marks.Header.fixed, true);
  assert.match(r.out, /Header.*sticky or fixed/);
});

test('a sticky or fixed element is captured as an overlay with its viewport place, and its marks point at it', () => {
  const m = site('sticky');
  assert.equal(m.overlays?.length, 1, JSON.stringify(m.overlays));   // the header; the hidden cookie banner is not one
  const o = m.overlays[0];
  assert.deepEqual({ x: o.x, y: o.y, w: o.w, h: o.h, position: o.position, top: o.top }, { x: 0, y: 0, w: 390, h: 56, position: 'sticky', top: 0 });
  assert.ok(existsSync(join(work, 'assets', 'sticky', o.file)), o.file);
  assert.equal(m.marks.Header.overlay, 0);
});

test('a lazy image inside a hidden panel does not hold the capture forever', () => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/mm.mjs'), 'capture', 'site', '--url', url('hidden-lazy.html'), '--name', 'hidden', '--piece', work], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.signal, null, 'the capture was still waiting after a minute');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Date.now() - t0 < 60_000);
  assert.ok(site('hidden').height >= 1200);
});

test('a smooth-scrolling page is measured at the top: its fixed header is an overlay at y 0', () => {
  const r = mm(['capture', 'site', '--url', url('smooth.html'), '--name', 'smooth', '--piece', work]);
  assert.equal(r.status, 0, r.out);
  const o = site('smooth').overlays;
  assert.equal(o?.length, 1, JSON.stringify(o));
  assert.equal(o[0].y, 0, `the header was measured mid-scroll at y ${o[0].y}`);
});

test('the wire lists the boxes, dots and text lines of the page in page px', () => {
  const r = mm(['capture', 'site', '--url', url('wire.html'), '--name', 'wire', '--piece', work, '--mark', 'Card=#card', '--mark', 'Label=#label']);
  assert.equal(r.status, 0, r.out);
  const s = site('wire');
  assert.ok(Array.isArray(s.wire), 'media.json has a wire');
  assert.ok(!s.wireCut);
  const at = (k, m) => s.wire.filter((o) => o.k === k && Math.abs(o.x - m.x) <= 1 && Math.abs(o.y - m.y) <= 1 && Math.abs(o.w - m.w) <= 1 && Math.abs(o.h - m.h) <= 1);
  const rect = (sel) => { const m = s.marks[sel]; return m; };
  const card = at('box', rect('Card'));
  assert.equal(card.length, 1, JSON.stringify(s.wire));
  assert.ok(Math.abs(card[0].r - 16) <= 0.5, `card r ${card[0].r}`);
  const dots = s.wire.filter((o) => o.k === 'dot');
  assert.equal(dots.length, 1, JSON.stringify(s.wire));
  assert.ok(dots[0].w === 10 && dots[0].h === 10 && dots[0].r >= 4.5);
  const img = s.wire.filter((o) => o.k === 'box' && o.w === 100 && o.h === 60);
  assert.equal(img.length, 1, JSON.stringify(s.wire));
  for (const o of s.wire) assert.ok(o.w >= 2 && o.h >= 2 && o.y < s.height);
});

test('a paragraph that wraps onto two lines gives two text shapes, one above the other', () => {
  const s = site('wire');
  const dot = s.wire.find((o) => o.k === 'dot');
  const para = s.wire.filter((o) => o.k === 'text' && !o.fixed && o.y > dot.y);
  assert.equal(para.length, 2, JSON.stringify(para));
  assert.ok(para[1].y > para[0].y + 10, 'the second line is below the first');
  assert.ok(para.every((o) => o.r === 0 && o.w <= 200 + 1));
});

test('shapes inside the fixed header carry fixed and overlay, as marks do', () => {
  const s = site('wire');
  const bar = s.wire.filter((o) => o.y < 56 && o.fixed);
  assert.ok(bar.some((o) => o.k === 'box'), 'the header box');
  const label = bar.find((o) => o.k === 'text');
  assert.ok(label, 'the header label');
  assert.equal(label.overlay, s.marks.Label.overlay);
  assert.equal(label.overlay, 0);
  assert.ok(s.wire.filter((o) => !o.fixed).every((o) => o.overlay == null));
});

test('a display:none element and its text contribute nothing to the wire', () => {
  const s = site('wire');
  assert.equal(s.wire.filter((o) => o.k === 'box' && o.w === 80).length, 0);
  assert.equal(s.wire.filter((o) => o.k === 'text').length, 3);   // the label and the two paragraph lines
});

test('a fixed bar is only in its overlay: the tiles show the page under it, so it never scrolls away as a copy', () => {
  const r = mm(['capture', 'site', '--url', url('fixed-bar.html'), '--name', 'bar', '--piece', work]);
  assert.equal(r.status, 0, r.out);
  const s = site('bar');
  assert.equal(s.overlays?.length, 1, JSON.stringify(s.overlays));
  const o = s.overlays[0];
  const rgb = decode(join(work, 'assets', 'bar', s.tiles[0].file)).px(195 * 3, (o.y + o.h / 2) * 3);
  assert.ok(near(rgb, [255, 255, 255]), `the tile holds the bar at its place: ${rgb}`);
  const bar = decode(join(work, 'assets', 'bar', o.file)).px(o.w * 1.5, o.h * 1.5);
  assert.ok(near(bar, [0x1F, 0x6F, 0xEB]), `the overlay lost the bar: ${bar}`);
});
