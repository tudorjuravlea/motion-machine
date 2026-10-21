#!/usr/bin/env node
// mm capture site --url <url> --name <n> [--piece <dir>] [--device phone|laptop|browser]
//   [--mark "<Label>=<selector>"]… [--hide <selector>]… [--wait <selector>] [--quality 90]
// A website is captured once, at the device's viewport, as a tall page cut into
// JPEG tiles of at most 16,000 device px (the browser's texture limit) plus media.json: viewport,
// page height, tiles and the page-relative box of every mark, so screen patterns can scroll to,
// tap and point at named things. Cookie banners and --hide selectors are hidden; lazy images are
// loaded by scrolling the page once before the capture. Only the URL given is opened.
// Exit 0 written, 1 the page could not be captured, 2 usage or a mark that matches nothing.
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isArgsError, usageText } from './lib/cli.mjs';
import { ROOT, launchBrowser } from './lib/browser.mjs';

const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode });
export const DEVICES = { phone: { w: 390, h: 844, scale: 3 }, laptop: { w: 1440, h: 900, scale: 2 }, browser: { w: 1280, h: 800, scale: 2 } };
export const TILE_DEVICE_PX = 16000;
/** The tallest page captured, in css px: an infinite-scroll page stops here. */
export const MAX_HEIGHT = 24000;
const CONSENT = ['[id*=cookie i]', '[class*=cookie i]', '[id*=consent i]', '[class*=consent i]', '[aria-label*=cookie i]'];

export async function capture({ url, name, piece = '.', device = 'phone', marks = [], hide = [], wait, quality = 90, maxHeight = MAX_HEIGHT }) {
  if (!(maxHeight >= 400)) throw fail('--max-height must be at least 400 (css px)', 2);
  if (!/^(https?|file):\/\//.test(url ?? '')) throw fail('--url must be an http(s):// or file:// address', 2);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name ?? '')) throw fail('--name must be lowercase letters, digits and hyphens', 2);
  const vp = DEVICES[device];
  if (!vp) throw fail(`--device must be phone, laptop or browser, not ${device}`, 2);
  const parsed = marks.map((m) => { const i = m.indexOf('='); if (i < 1) throw fail(`--mark must be "<Label>=<selector>", not ${m}`, 2); return [m.slice(0, i), m.slice(i + 1)]; });

  const browser = await launchBrowser({ untrusted: /^https?:/i.test(url) });
  try {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.scale, isMobile: device === 'phone', hasTouch: device === 'phone' });
    const page = await ctx.newPage();
    try { await page.goto(url, { waitUntil: 'load', timeout: 60_000 }); } catch (e) { throw fail(`could not open ${url}: ${e.message.split('\n')[0]}`, 1); }
    if (wait) { try { await page.waitForSelector(wait, { timeout: 15_000 }); } catch { throw fail(`--wait ${wait}: nothing matched within 15 s`, 1); } }
    if (hide.length) await page.addStyleTag({ content: `${hide.join(',\n')} { display: none !important; }` });
    // A page with scroll-behavior: smooth glides instead of jumping, and its fixed header was measured
    // and drawn mid-glide; every scroll here must land at once.
    await page.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; }' });
    // Consent banners: only an overlay (fixed or sticky) that matches, never <html>, <body> or a
    // section in the flow that merely carries a consent class.
    const hideConsent = (sels) => { for (const el of document.querySelectorAll(sels.join(','))) {
      if (el === document.documentElement || el === document.body) continue;
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') el.style.setProperty('display', 'none', 'important');
    } };
    await page.evaluate(hideConsent, CONSENT);
    // Scroll the page once, up to the height cap, so lazy images load (an infinite page stops at the
    // cap), then wait for every image and go back to the top.
    await page.evaluate(async (max) => {
      const step = innerHeight * 0.8;
      for (let y = 0, n = 0; y < Math.min(document.documentElement.scrollHeight, max) && n < 400; y += step, n++) { scrollTo(0, y); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }
      scrollTo(0, Math.min(document.documentElement.scrollHeight, max));
      // Only pictures a viewer can see: a lazy image in a closed panel or carousel never loads, and
      // waiting for it held the capture forever. Each wait is capped at 10 s as well.
      const shown = [...document.images].filter((i) => i.loading !== 'lazy' || i.checkVisibility());
      const capped = (p) => Promise.race([p, new Promise((r) => setTimeout(r, 10_000))]);
      await Promise.all(shown.map((i) => (i.complete ? null : capped(new Promise((r) => { i.onload = i.onerror = r; })))));
      await Promise.all(shown.map((i) => capped(i.decode().catch(() => {}))));
      scrollTo(0, 0);
      await document.fonts.ready;
    }, maxHeight);
    await page.evaluate(hideConsent, CONSENT);   // a banner the scroll brought in
    const height = Math.min(maxHeight, Math.max(vp.h, await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight))));
    // each top-level fixed or sticky element (a sticky one needs a px top to stick) becomes an
    // overlay: its own picture and its place at scroll 0, which the screen layer draws pinned
    const overlays = await page.evaluate(() => {
      const pinned = (el) => { const cs = getComputedStyle(el); return cs.position === 'fixed' || (cs.position === 'sticky' && /px$/.test(cs.top)); };
      // shown: visible, not see-through (a closed modal backdrop at opacity 0 is not one), with area in the viewport
      const all = [...document.body.querySelectorAll('*')].filter((el) => {
        if (!pinned(el) || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
        let op = 1;
        for (let a = el; a && a.nodeType === 1; a = a.parentElement) op *= Number(getComputedStyle(a).opacity);
        const r = el.getBoundingClientRect();
        return op > 0.01 && Math.min(r.right, innerWidth) - Math.max(r.left, 0) > 0 && Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) > 0;
      });
      const top = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
      return top.map((el, i) => {
        el.setAttribute('data-mm-overlay', String(i));
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        return { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height), position: cs.position, ...(cs.position === 'sticky' ? { top: Math.round(parseFloat(cs.top)) } : {}) };
      });
    });
    const boxes = await page.evaluate((ms) => Object.fromEntries(ms.map(([label, sel]) => {
      const el = document.querySelector(sel);
      if (!el) return [label, null];
      const r = el.getBoundingClientRect();
      // inside a fixed or sticky element the mark moves with the viewport, not the page
      let fixed = false;
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) if (/^(fixed|sticky)$/.test(getComputedStyle(a).position)) { fixed = true; break; }
      const ov = el.closest('[data-mm-overlay]');
      return [label, { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height), ...(fixed ? { fixed: true } : {}), ...(ov ? { overlay: Number(ov.dataset.mmOverlay) } : {}) }];
    })), parsed);
    const missing = parsed.filter(([label]) => !boxes[label]);
    if (missing.length) throw fail(missing.map(([l, s]) => `mark "${l}": the selector ${s} matched nothing on ${url}`).join('\n'), 2);

    // written beside the old capture and swapped in whole, so a capture that fails leaves the old one in place
    const dir = join(resolve(piece), 'assets', name);
    const staging = `${dir}.partial`;
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    let meta;
    try {
      const tileCss = Math.floor(TILE_DEVICE_PX / vp.scale);
      const tiles = [];
      for (let y = 0, k = 1; y < height; y += tileCss, k++) {
        const h = Math.min(tileCss, height - y);
        const file = `page-${k}.jpg`;
        await page.screenshot({ path: join(staging, file), type: 'jpeg', quality, fullPage: true, clip: { x: 0, y, width: vp.w, height: h }, animations: 'disabled', caret: 'hide' });
        tiles.push({ file, y, h });
      }
      for (const [i, o] of overlays.entries()) {
        o.file = `overlay-${i + 1}.jpg`;
        await page.locator(`[data-mm-overlay="${i}"]`).screenshot({ path: join(staging, o.file), type: 'jpeg', quality, animations: 'disabled', caret: 'hide' });
      }
      meta = { kind: 'page', device, viewport: { ...vp }, height, tiles, ...(overlays.length ? { overlays: overlays.map(({ file, ...o }) => ({ file, ...o })) } : {}), marks: boxes, url: recordedUrl(url), captured: new Date().toISOString() };
      writeFileSync(join(staging, 'media.json'), `${JSON.stringify(meta, null, 2)}\n`);
    } catch (e) {
      rmSync(staging, { recursive: true, force: true });
      throw e;
    }
    rmSync(dir, { recursive: true, force: true });
    renameSync(staging, dir);
    return { dir, meta };
  } finally { await browser.close(); }
}

/** The page's address as recorded: a file inside the repository by its repository path, any other
 *  local file by its name only, so no absolute local path reaches a piece or a repository. */
export function recordedUrl(url) {
  if (!url.startsWith('file:')) return url;
  const file = fileURLToPath(url);
  const rel = relative(ROOT, file);
  return rel && !rel.startsWith('..') ? rel.split(sep).join('/') : file.split(sep).pop();
}

export async function main(argv) {
  try {
    const { values: v } = parseArgs({ args: argv, strict: true, options: {
      url: { type: 'string' }, name: { type: 'string' }, piece: { type: 'string' }, device: { type: 'string' },
      mark: { type: 'string', multiple: true }, hide: { type: 'string', multiple: true }, wait: { type: 'string' }, quality: { type: 'string' }, 'max-height': { type: 'string' } } });
    if (!v.url || !v.name) throw fail(usageText('capture site'), 2);
    const { dir, meta } = await capture({ url: v.url, name: v.name, piece: v.piece, device: v.device ?? 'phone', marks: v.mark ?? [], hide: v.hide ?? [], wait: v.wait, quality: v.quality ? Number(v.quality) : 90, maxHeight: v['max-height'] ? Number(v['max-height']) : MAX_HEIGHT });
    for (const [label, m] of Object.entries(meta.marks)) {
      if (m.fixed && m.overlay != null) console.error(`mark "${label}" is inside a sticky or fixed element: captured as overlay ${m.overlay + 1}, pinned to the screen`);
      else if (m.fixed) console.error(`warning: mark "${label}" is inside a sticky or fixed element the capture could not pin (a sticky element with no px top); a tap or callout on it after a scroll lands off the screen`);
    }
    console.log(`wrote ${meta.tiles.length} tile${meta.tiles.length > 1 ? 's' : ''} (${meta.height} css px tall at ${meta.viewport.w} wide) and media.json to ${dir}`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('capture site')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
