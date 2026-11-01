// The page driver every verb and gate shares: a static server over the repo root, a Playwright
// Chromium launched with stable-raster flags, a piece opened in render mode at a format
// (with the G-TIME recorder when the gate asks for it), and a frame as PNG bytes (SPEC §2).
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { hostAllowed, loopbackHosts, staticFiles } from './static.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Chromium flags that make rasterisation a function of the frame alone. Partial raster and
 * GPU rasterisation reuse tiles painted for earlier frames, so a scale entrance could leave a
 * one-pixel difference that depended on what was painted before; colour management is pinned to sRGB.
 */
export const LAUNCH_ARGS = ['--disable-partial-raster', '--disable-gpu-rasterization', '--disable-gpu', '--disable-zero-copy',
  '--disable-checker-imaging', '--run-all-compositor-stages-before-draw', '--force-color-profile=srgb', '--disable-lcd-text'];

/**
 * A Chromium for rendering and checking: always these flags. `untrusted: true` is for a page from
 * the network: it opens with Chromium's sandbox on, so a renderer exploit stays in the sandbox.
 * `MM_NO_SANDBOX=1` turns the sandbox off for the one place that cannot run it (a container
 * that runs as root); nothing else does.
 */
export const launchBrowser = ({ untrusted = false, ...opts } = {}) => chromium.launch({
  ...opts,
  ...(untrusted ? { chromiumSandbox: process.env.MM_NO_SANDBOX !== '1' } : {}),
  args: [...LAUNCH_ARGS, ...(opts.args ?? [])],
});

/**
 * How much longer than usual to wait: the waits that depend on machine speed (the page-ready wait
 * and the slow-frame wait) are multiplied by `MM_TIMEOUT_SCALE` (a positive number; default 1).
 * A loaded machine, or a test run that starts many browsers at once, sets it above 1.
 */
export const timeoutScale = () => { const n = Number(process.env.MM_TIMEOUT_SCALE); return n > 0 ? n : 1; };

/**
 * G-TIME's runtime recorder, installed before any page script runs. It wraps the time and
 * randomness sources of SPEC §2.4 on the objects they live on, so a call is recorded however it is
 * reached (`globalThis['set'+'Timeout']`, `Reflect.apply`, a prototype method). Each record keeps
 * the call stack; the gate counts calls whose stack passes through a file the page served.
 *
 * `scheduler.postTask` and the per-load entropy a piece could read
 * (`performance.timeOrigin`, `performance.timing`, performance entries and marks,
 * `document.timeline.currentTime`, `Event.timeStamp`, `AudioContext.currentTime`, a no-argument
 * `Intl.DateTimeFormat` format, `URL.createObjectURL`'s fresh UUID) are recorded too. New realms and
 * threads are refused: `Worker`, `SharedWorker` and `navigator.serviceWorker.register` throw,
 * `createElement('iframe'|'frame')` throws, an iframe's `contentWindow`/`contentDocument` read null,
 * and any iframe, frame or SVG animation element (SMIL) that reaches the document by another path is
 * removed when the mutation is delivered. Those records carry `always: true`: no served frame need
 * be on the stack. `__mmTextLog` (G-LEGIBLE) records text the walk cannot read:
 * `attachShadow` (refused) and canvas `fillText`/`strokeText`.
 */
export const TIME_TRAP = `(() => {
  if (window.__mmTimeLog) return;
  const log = [], textLog = [];
  Object.defineProperty(window, '__mmTimeLog', { value: log });
  Object.defineProperty(window, '__mmTextLog', { value: textLog });
  const rec = (name, extra, into = log) => { if (into.length < 500) into.push({ name, stack: String(new Error().stack), ...extra }); };
  const refuse = (what) => new DOMException(what + ' is refused in render mode (G-TIME: a new realm or thread has its own clock)', 'NotSupportedError');
  const define = (obj, key, value) => { try { Object.defineProperty(obj, key, { value, writable: true, configurable: true }); } catch { obj[key] = value; } };
  const wrapFn = (obj, key, name, into = log) => {
    const orig = obj && obj[key];
    if (typeof orig !== 'function') return;
    define(obj, key, { [key](...a) { rec(name, undefined, into); return orig.apply(this, a); } }[key]);
  };
  const wrapGet = (proto, key, name, alt) => {
    const d = proto && Object.getOwnPropertyDescriptor(proto, key);
    if (!d || typeof d.get !== 'function') return;
    Object.defineProperty(proto, key, { ...d, get() { rec(name); return alt ? alt.call(this, d.get) : d.get.call(this); } });
  };
  for (const k of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback']) wrapFn(window, k, k);
  wrapFn(Math, 'random', 'Math.random');
  if (window.Performance) {
    wrapFn(Performance.prototype, 'now', 'performance.now');
    for (const k of ['getEntries', 'getEntriesByType', 'getEntriesByName', 'mark', 'measure']) wrapFn(Performance.prototype, k, 'performance.' + k);
    wrapGet(Performance.prototype, 'timeOrigin', 'performance.timeOrigin');
    wrapGet(Performance.prototype, 'timing', 'performance.timing');
  }
  if (window.Crypto) { wrapFn(Crypto.prototype, 'getRandomValues', 'crypto.getRandomValues'); wrapFn(Crypto.prototype, 'randomUUID', 'crypto.randomUUID'); }
  if (window.Scheduler) wrapFn(Scheduler.prototype, 'postTask', 'scheduler.postTask');
  if (window.AnimationTimeline) wrapGet(AnimationTimeline.prototype, 'currentTime', 'document.timeline.currentTime');
  wrapGet(Event.prototype, 'timeStamp', 'Event.timeStamp');
  if (window.BaseAudioContext) wrapGet(BaseAudioContext.prototype, 'currentTime', 'AudioContext.currentTime');
  if (window.HTMLVideoElement) wrapFn(HTMLVideoElement.prototype, 'requestVideoFrameCallback', 'requestVideoFrameCallback');
  wrapFn(URL, 'createObjectURL', 'URL.createObjectURL');
  const DTF = Intl.DateTimeFormat.prototype, fmt = Object.getOwnPropertyDescriptor(DTF, 'format'), parts = DTF.formatToParts;
  if (fmt && fmt.get) Object.defineProperty(DTF, 'format', { ...fmt, get() { const f = fmt.get.call(this); return (d) => { if (d === undefined) rec('Intl.DateTimeFormat (now)'); return f(d); }; } });
  if (parts) define(DTF, 'formatToParts', function formatToParts(d) { if (d === undefined) rec('Intl.DateTimeFormat (now)'); return parts.call(this, d); });
  const D = Date;
  const now = function now() { rec('Date.now'); return D.now(); };
  const P = new Proxy(D, {
    construct(t, a, nt) { rec('Date'); return Reflect.construct(t, a, nt === P ? t : nt); },
    apply(t, self, a) { rec('Date'); return Reflect.apply(t, self, a); },
    get(t, k) { return k === 'now' ? now : Reflect.get(t, k); },
  });
  Object.defineProperty(window, 'Date', { value: P, writable: true, configurable: true });

  // New realms and threads: refused, and recorded.
  for (const k of ['Worker', 'SharedWorker']) {
    if (typeof window[k] !== 'function') continue;
    define(window, k, new Proxy(window[k], { construct() { rec(k, { always: true }); throw refuse(k); }, apply() { rec(k, { always: true }); throw refuse(k); } }));
  }
  if (window.ServiceWorkerContainer) define(ServiceWorkerContainer.prototype, 'register', function register() { rec('serviceWorker.register', { always: true }); return Promise.reject(refuse('serviceWorker.register')); });
  const REALM = /^(iframe|frame)$/i;
  const ce = Document.prototype.createElement, ceNS = Document.prototype.createElementNS;
  define(Document.prototype, 'createElement', function createElement(tag, ...a) { if (REALM.test(String(tag))) { rec('iframe', { always: true }); throw refuse('<' + String(tag).toLowerCase() + '>'); } return ce.call(this, tag, ...a); });
  define(Document.prototype, 'createElementNS', function createElementNS(ns, tag, ...a) { if (REALM.test(String(tag).split(':').pop())) { rec('iframe', { always: true }); throw refuse('<' + String(tag).toLowerCase() + '>'); } return ceNS.call(this, ns, tag, ...a); });
  for (const C of [window.HTMLIFrameElement, window.HTMLFrameElement]) {
    if (!C) continue;
    for (const k of ['contentWindow', 'contentDocument']) wrapGet(C.prototype, k, 'iframe', () => null);
  }
  const SMIL = new Set(['animate', 'set', 'animateTransform', 'animateMotion', 'animateColor']);
  const sweep = (n) => {
    if (n.nodeType !== 1) return;
    const hit = (e) => (REALM.test(e.localName) ? 'iframe' : e.namespaceURI === 'http://www.w3.org/2000/svg' && SMIL.has(e.localName) ? 'SVG <' + e.localName + '>' : null);
    for (const e of [n, ...n.querySelectorAll('*')]) { const k = hit(e); if (k) { log.push({ name: k, stack: '', always: true }); e.remove(); } }
  };
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) sweep(n); }).observe(document, { childList: true, subtree: true });

  // Text the walk cannot read.
  if (Element.prototype.attachShadow) define(Element.prototype, 'attachShadow', function attachShadow() { rec('attachShadow', { always: true }, textLog); throw refuse('attachShadow'); });
  for (const C of [window.CanvasRenderingContext2D, window.OffscreenCanvasRenderingContext2D]) {
    if (!C) continue;
    for (const k of ['fillText', 'strokeText']) wrapFn(C.prototype, k, 'canvas ' + k, textLog);
  }
})();`;

/** SPEC §12 viewports. */
export const VIEWPORTS = { '9x16': { width: 1080, height: 1920 }, '1x1': { width: 1080, height: 1080 }, '4x5': { width: 1080, height: 1350 }, '16x9': { width: 1920, height: 1080 } };

export { MIME } from './static.mjs';

/** Serves `root` on 127.0.0.1 (never 0.0.0.0) through the shared static handler (scripts/lib/static.mjs). */
export function serveRoot(root = ROOT, { port = 0 } = {}) {
  const serve = staticFiles(root);
  let hosts = new Set();
  const server = createServer((req, res) => {
    if (!hostAllowed(req, hosts)) { res.writeHead(403); return res.end(); }
    serve(req, res, String(req.url ?? '/').split('?')[0].split('#')[0] || '/');
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => {
      const { port: p } = server.address();
      hosts = loopbackHosts(p);
      ok({ url: `http://127.0.0.1:${p}`, port: p, close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }) });
    });
  });
}

/**
 * Opens pieces/<id>/index.html (or any folder under the repo) in render mode at `format`. `trap`
 * installs TIME_TRAP before the piece loads (the gate passes it; `mm serve` never does).
 */
// software WebGL (SwiftShader) can take longer than Playwright's 30 s default for one frame of a 3D
// device while other 3D pages share the CPU; a slow frame is not a broken piece
export const SLOW_FRAME_MS = 120_000 * timeoutScale();
/** How long a piece may take to define `window.mm` once its page has loaded (read at each open, so a test can set the scale late). */
export const readyMs = () => 30_000 * timeoutScale();

/** What `--alpha` lays over a piece: the canvas colour is not painted by the page, stage or scenes (the ground, finish and patterns still are). */
export const ALPHA_CSS = 'html, body, .mm-stage, .mm-scene { background: transparent !important; }';

export async function openPiece(dir, { format, render = true, browser, server, query = {}, trap = false, alpha = false } = {}) {
  const abs = resolve(dir);
  const rel = relative(ROOT, abs).split(sep).join('/');
  if (rel.startsWith('..')) throw new Error(`piece must live under the repo root: ${abs}`);
  const story = existsSync(join(abs, 'story.json')) ? JSON.parse(readFileSync(join(abs, 'story.json'), 'utf8')) : null;
  format ??= story?.formats?.[0] ?? '16x9';
  const viewport = VIEWPORTS[format];
  if (!viewport) throw new Error(`unknown format ${format}`);   // before a server or a browser exists
  const ownServer = !server; const ownBrowser = !browser;
  let page = null;
  try {
    server ??= await serveRoot(ROOT);
    browser ??= await launchBrowser();
    page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    page.setDefaultTimeout(SLOW_FRAME_MS);
    if (trap) await page.addInitScript(TIME_TRAP);
    const errors = [], broken = [];
    page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', (r) => { if (r.status() >= 400 && /\.m?js$/.test(new URL(r.url()).pathname)) broken.push(`${r.url()} (${r.status()})`); });
    page.on('requestfailed', (r) => { if (/\.m?js$/.test(new URL(r.url()).pathname)) broken.push(`${r.url()} (${r.failure()?.errorText ?? 'failed'})`); });
    const q = new URLSearchParams({ format, ...(render ? { render: '1' } : {}), ...query });
    await page.goto(`${server.url}/${rel}/index.html?${q}`, { waitUntil: 'load' });
    try {
      await page.waitForFunction(() => window.mm && (typeof window.mm.seek === 'function' || window.mm.ready === false), null, { timeout: broken.length ? 2_000 : readyMs() });
    } catch {
      if (broken.length) throw new Error(`piece did not open: its module import failed: ${broken[0]}`);
      throw new Error(`piece did not open: window.mm never appeared${errors.length ? ` (${errors[0]})` : ''}`);
    }
    const failed = await page.evaluate(() => (window.mm.ready === false ? window.mm.error : null));
    if (failed) throw new Error(`piece failed to mount: ${failed}`);
    await page.evaluate(() => document.fonts.ready);
    if (alpha) await page.addStyleTag({ content: ALPHA_CSS });
    const mm = {
      seek: (t) => page.evaluate(async (x) => { window.mm.seek(x); await window.mm.settle?.(); }, t),
      goto: (n) => page.evaluate((x) => window.mm.goto(x), n),
      report: () => page.evaluate(() => window.mm.report()),
      meta: () => page.evaluate(() => ({ duration: window.mm.duration ?? null, presses: window.mm.presses ?? null, scenes: window.mm.scenes, format: window.mm.format,
        fonts: window.mm.fonts ?? [], warnings: window.mm.warnings ?? [], schedule: window.mm.schedule ?? null })),
    };
    const close = async () => { await page.close(); if (ownBrowser) await browser.close(); if (ownServer) await server.close(); };
    return { page, mm, story, format, viewport, errors, server, browser, close };
  } catch (e) {
    // whatever this call started is closed on the way out, so the process can exit
    await page?.close().catch(() => {});
    if (ownBrowser) await browser?.close().catch(() => {});
    if (ownServer) await server?.close().catch(() => {});
    throw e;
  }
}

/** Seeks to `t` (film seconds or deck fractional press) and returns the frame as PNG bytes; `alpha` keeps the page's transparency (a page opened with `alpha`). */
export async function framePng(page, t, { alpha = false } = {}) {
  await page.evaluate(async (x) => { window.mm.seek(x); await window.mm.settle?.(); }, t);   // pixels wait for decodes
  return page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide', ...(alpha ? { omitBackground: true } : {}) });
}
