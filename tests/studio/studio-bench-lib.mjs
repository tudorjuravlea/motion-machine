// Shared helpers of the studio page benches (studio.browser.test.mjs, studio-page.browser.test.mjs):
// a studio server on a temp copy, a page, real Playwright pointer and keyboard gestures, and waits
// on window.studio.state(). Not a test file itself.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { ROOT, timeoutScale } from '../../scripts/lib/browser.mjs';

export const VIEWPORT = { width: 1440, height: 900 };
export const versionOf = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
export const undoKey = process.platform === 'darwin' ? 'Meta+z' : 'Control+z';
export const redoKey = process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A wait in ms, stretched by MM_TIMEOUT_SCALE: the studio waits are generous on an idle machine and the scale covers a loaded one. */
export const waitMs = (ms) => Math.round(ms * timeoutScale());

/** Opens the studio page of `server` and waits until it is ready. `watch` collects every POST /api/edit and /api/undo. */
export async function openStudio(browser, server, { watch = [], setup, viewport = VIEWPORT, locale, format, errors } = {}) {
  const p = await browser.newPage({ viewport, ...(locale ? { locale } : {}) });
  p.on('pageerror', (e) => { if (errors) errors.push(e); else throw e; });
  p.on('request', (r) => { if (r.method() === 'POST' && /\/api\/(edit|undo)$/.test(new URL(r.url()).pathname)) watch.push(r.url()); });
  if (setup) await setup(p);
  await p.goto(`${server.url}/scripts/studio/ui/index.html?piece=${encodeURI(server.piece)}${format ? `&format=${format}` : ''}`);
  await p.waitForFunction(() => window.studio?.ready === true, null, { timeout: waitMs(60_000) });
  return p;
}

export const stateOf = (p) => p.evaluate(() => window.studio.state());

/** Waits until the page holds `version` (or any version but `not`), with nothing in flight. */
export async function settledOf(p, { version, not, timeout = waitMs(30_000) } = {}) {
  try {
    await p.waitForFunction(({ version, not }) => {
      const st = window.studio.state();
      return !st.busy && (version ? st.version === version : not ? st.version !== not : true);
    }, { version, not }, { timeout });
  } catch (e) {
    // say what the page held when it gave up: a timeout alone tells nothing
    const seen = await p.evaluate(() => { const st = window.studio.state(); const a = document.activeElement; return { version: st.version, busy: st.busy, selection: st.selection?.path ?? null, focus: a?.dataset?.clip ?? a?.id ?? a?.tagName, toast: document.querySelector('#toast:not([hidden])')?.textContent ?? null }; }).catch(() => null);
    e.message += `\n  waited for ${version ? `version ${version}` : `a version other than ${not}`}; the page held ${JSON.stringify(seen)}`;
    throw e;
  }
  return stateOf(p);
}

export async function boxOf(p, selector) {
  const b = await p.locator(selector).first().boundingBox();
  assert.ok(b, `${selector} is on screen`);
  return b;
}

/** A real pointer drag: press at (x, y), move by dx in steps, then release (or press Escape first). */
export async function dragBy(p, x, y, dx, { steps = 12, escape = false, during, alt = false } = {}) {
  await p.mouse.move(x, y);
  await p.mouse.down();
  if (alt) await p.keyboard.down('Alt');
  for (let k = 1; k <= steps; k++) await p.mouse.move(x + (dx * k) / steps, y);
  if (during) await during();
  if (escape) await p.keyboard.press('Escape');
  await p.mouse.up();
  if (alt) await p.keyboard.up('Alt');
}

/** A temp copy of pieces/<name> (or any folder under the root) at the same depth, so its relative imports hold. */
export function exampleCopy(rel, tag) {
  const parts = rel.split('/'), name = parts[parts.length - 1];
  const dir = join(ROOT, `.tmp-cli-${tag}-${process.pid}`);
  const piece = join(dir, ...parts.slice(1));   // .tmp-cli-<tag>/<all but the first segment>: the same depth
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(ROOT, rel), piece, { recursive: true, filter: (src) => !src.includes(`${join(name, 'out')}`) });
  return { dir, piece, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---- the Export benches (export.test.mjs, export-control.test.mjs): raw HTTP and the SSE `export` events ----

/** One request; resolves { status, headers, body (Buffer), json }. `raw` sends a body as is. */
export function call(server, method, path, { body, raw, headers = {} } = {}) {
  const port = new URL(server.url).port, data = raw ?? (body !== undefined ? JSON.stringify(body) : null);
  return new Promise((ok, fail) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...(data != null && raw == null ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const buf = Buffer.concat(chunks); let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch { /* not JSON */ } ok({ status: res.statusCode, headers: res.headers, body: buf, json }); });
    });
    req.setTimeout(30_000, () => req.destroy(new Error(`${method} ${path} timed out`)));
    req.on('error', fail);
    if (data != null) req.write(data);
    req.end();
  });
}

/** The `export` events of a server's SSE stream; `until(pred, ms)` resolves with the first that matches. */
export function exportEvents(server) {
  const port = new URL(server.url).port, seen = [], waiters = [];
  let buf = '', res;
  const req = request({ host: '127.0.0.1', port, path: '/api/events', headers: { host: `127.0.0.1:${port}`, accept: 'text/event-stream' } }, (r) => {
    res = r; r.setEncoding('utf8');
    r.on('data', (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        if (!/^event: export$/m.test(block)) continue;
        const ev = JSON.parse(block.split('\n').find((l) => l.startsWith('data: ')).slice(6));
        seen.push(ev);
        for (const wt of [...waiters]) if (wt.pred(ev)) { waiters.splice(waiters.indexOf(wt), 1); wt.ok(ev); }
      }
    });
  });
  req.on('error', () => {});
  req.end();
  return {
    seen,
    /** The states in the order they first arrived (a state's progress lines repeat it). */
    states: () => seen.map((e) => e.state).filter((st, k, a) => st !== a[k - 1]),
    until(pred, ms = 120_000) {
      const hit = seen.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((ok, fail) => {
        const wt = { pred, ok: (e) => { clearTimeout(timer); ok(e); } };
        const timer = setTimeout(() => { waiters.splice(waiters.indexOf(wt), 1); fail(new Error(`no matching export event in ${ms} ms; seen states ${seen.map((e) => e.state).join(',')}`)); }, ms);
        waiters.push(wt);
      });
    },
    close() { req.destroy(); res?.destroy(); },
  };
}
export const ended = (e) => ['done', 'failed', 'cancelled'].includes(e.state);
