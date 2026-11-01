// A scripted session on a page, recorded: `mm capture site --script <steps.json>`. A script is a list
// of steps (goto, wait, move, click, hover, type, scroll); Playwright plays them in a Chromium that
// records a video, and the pointer's journey is written beside the video as a sidecar the kit reads
// (cursor.js): where the pointer was, what cursor the page showed under it, when it clicked, and the
// box of what it clicked. The pointer is the script's own, eased from where it was to the element it
// is told to go to; Playwright's video has no cursor, so the whole cursor is drawn later.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';
import { capturedRecord, writeLicence } from './licence.mjs';
import { cursorTypeOf } from '../../runtime/kit/cursor.js';
import { prep } from '../media-prep.mjs';
import { findFlashes, firstFrame, scanDuration } from './webm.mjs';
import { CLOCK_OFFSET_MS, TrackRecorder, cutTrack, flashOffset, shiftTrack } from './track.mjs';

export { CLOCK_OFFSET_MS, TrackRecorder, cutTrack, flashOffset, shiftTrack };

const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode });
/** How often the pointer is sampled while it moves, in ms. */
export const SAMPLE_MS = 33;
const CLICK_HOLD_MS = 120;
// the pointer is drawn smoothed (a spring), so it needs about half a second to arrive after the script's has stopped
const SETTLE_BEFORE_CLICK_MS = 450;
const STEP_TIMEOUT_MS = 8000;

const KEYS = { wait: ['ms'], move: ['to', 'at', 'ms'], click: ['on', 'ms'], hover: ['on', 'ms'], type: ['text', 'into', 'delay', 'ms'], scroll: ['by', 'to', 'ms'], goto: ['url'] };

/** A script (the list, `{ steps }`, or the text of either) as a checked list of steps; a mistake names the step. */
export function parseScript(input) {
  let v = input;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { throw fail(`the script is not valid JSON: ${e.message}`, 2); } }
  const steps = Array.isArray(v) ? v : Array.isArray(v?.steps) ? v.steps : null;
  if (!steps) throw fail('a script is a list of steps, or { "steps": [ … ] }', 2);
  if (!steps.length) throw fail('the script has no steps', 2);
  steps.forEach((s, i) => {
    const at = `step ${i + 1}`;
    if (!s || typeof s !== 'object' || !Object.hasOwn(KEYS, s.do)) throw fail(`${at}: "${s?.do}" is not a step (${Object.keys(KEYS).join(', ')})`, 2);
    for (const k of Object.keys(s)) if (k !== 'do' && !KEYS[s.do].includes(k)) throw fail(`${at}: ${s.do} has no "${k}" (${KEYS[s.do].join(', ')})`, 2);
    const need = (cond, what) => { if (!cond) throw fail(`${at}: ${s.do} needs ${what}`, 2); };
    const str = (v) => typeof v === 'string' && v.trim() !== '';
    const ms = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
    if (s.do === 'wait') need(ms(s.ms), 'ms (a number of milliseconds, 0 or more)');
    if (s.do === 'click' || s.do === 'hover') need(str(s.on), 'on (a selector)');
    if (s.do === 'move') need(str(s.to) || (Array.isArray(s.at) && s.at.length === 2 && s.at.every((n) => n >= 0 && n <= 1)), 'to (a selector) or at ([x, y], 0..1 of the viewport)');
    if (s.do === 'type') need(typeof s.text === 'string', 'text');
    if (s.do === 'scroll') need(Number.isFinite(s.by) || str(s.to), 'by (px) or to (a selector)');
    if (s.do === 'goto') need(str(s.url), 'url');
    if (s.ms != null && s.do !== 'wait') need(ms(s.ms), 'ms to be a number of milliseconds');
  });
  return steps;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** The points of an eased move from one place to another over `ms`: about every SAMPLE_MS, the last one exactly on the target. */
export function movePoints(from, to, ms) {
  const n = from.x === to.x && from.y === to.y ? 1 : Math.max(1, Math.ceil(ms / SAMPLE_MS));
  return Array.from({ length: n }, (_, i) => {
    const u = (i + 1) / n, k = i === n - 1 ? 1 : smooth(u);
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, t: i === n - 1 ? ms : ms * u };
  });
}

/** A step's address is inside the capture's own site: the same origin, or for a file a file in the same folder. */
function sameSite(base, next) {
  try {
    const a = new URL(base), b = new URL(next, a);
    if (a.protocol === 'file:') return b.protocol === 'file:' && dirname(fileURLToPath(b)) === dirname(fileURLToPath(a));
    return a.origin === b.origin;
  } catch { return false; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/**
 * Plays steps on a page and returns what the pointer did, on the script's own clock: ms since `origin`
 * (`performance.now()` when the page was created). The video's clock is found afterwards, from the
 * sync flashes (captureSession), and the track moved onto it.
 * @returns {Promise<{ track: object, endMs: number }>}
 */
export async function runSession(page, steps, { viewport, url, origin }) {
  const rec = new TrackRecorder({ w: viewport.w, h: viewport.h });
  const now = () => performance.now() - origin;
  const sleepUntil = (perf) => sleep(perf - performance.now());
  let pos = { x: viewport.w / 2, y: viewport.h / 2 }, type = 'arrow', shown = false;
  rec.sample(0, pos.x, pos.y, { visible: false });

  const cursorAt = async (x, y) => cursorTypeOf(await page.evaluate(([px, py]) => { const el = document.elementFromPoint(px, py); return el ? getComputedStyle(el).cursor : 'default'; }, [x, y]));
  const hold = () => { rec.sample(now(), pos.x, pos.y, { type, visible: shown }); };
  const moveTo = async (x, y, ms) => {
    shown = true; hold();
    const t0 = performance.now();
    for (const p of movePoints(pos, { x, y }, ms)) {
      await sleepUntil(t0 + p.t);
      await page.mouse.move(p.x, p.y);
      type = await cursorAt(p.x, p.y);
      rec.sample(now(), p.x, p.y, { type });
    }
    pos = { x, y };
  };
  const locate = async (i, selector) => {
    const loc = page.locator(selector).first();
    try { await loc.waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS }); } catch { throw fail(`step ${i + 1}: the selector ${selector} matched nothing visible on ${url}`, 2); }
    await loc.scrollIntoViewIfNeeded();
    const box = await loc.boundingBox();
    if (!box) throw fail(`step ${i + 1}: the selector ${selector} has no box on the page`, 2);
    return box;
  };
  const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  const click = async (i, selector, ms = 700) => {
    const box = await locate(i, selector), c = centre(box);
    await moveTo(c.x, c.y, ms);
    await sleep(SETTLE_BEFORE_CLICK_MS);
    const down = now();
    rec.sample(down, pos.x, pos.y, { type, kind: 'click' });
    rec.target(down, selector, box);
    await page.mouse.down();
    await sleep(CLICK_HOLD_MS);
    rec.sample(now(), pos.x, pos.y, { type, kind: 'mouseup' });
    await page.mouse.up();
    await sleep(250);
    type = await cursorAt(pos.x, pos.y);
    hold();
  };

  for (const [i, s] of steps.entries()) {
    try {
      if (s.do === 'wait') await sleep(s.ms);
      else if (s.do === 'goto') {
        if (!sameSite(url, s.url)) throw fail(`step ${i + 1}: goto ${s.url} leaves the site the capture opened (${url}); only that site is opened`, 2);
        await page.goto(new URL(s.url, url).href, { waitUntil: 'load', timeout: 60_000 });
        await page.evaluate(() => document.fonts.ready);
        hold();
      } else if (s.do === 'move') {
        const c = s.to ? centre(await locate(i, s.to)) : { x: s.at[0] * viewport.w, y: s.at[1] * viewport.h };
        await moveTo(c.x, c.y, s.ms ?? 700);
      } else if (s.do === 'hover') {
        const c = centre(await locate(i, s.on));
        await moveTo(c.x, c.y, s.ms ?? 700);
        await sleep(400);
      } else if (s.do === 'click') await click(i, s.on, s.ms);
      else if (s.do === 'type') {
        if (s.into) await click(i, s.into, s.ms);
        await page.keyboard.type(s.text, { delay: s.delay ?? 60 });
        await sleep(200);
        hold();
      } else if (s.do === 'scroll') {
        let by = s.by;
        if (s.to) by = (await locate(i, s.to)).y - viewport.h * 0.3;
        const ms = s.ms ?? 600, n = Math.max(1, Math.ceil(ms / 16));
        hold();
        const t0 = performance.now();
        let sent = 0;
        for (let k = 1; k <= n; k++) {
          const want = Math.round(by * smooth(k / n));
          await sleepUntil(t0 + (ms * k) / n);
          if (want !== sent) await page.mouse.wheel(0, want - sent);
          sent = want;
        }
        type = await cursorAt(pos.x, pos.y);
        hold();
      }
    } catch (e) {
      if (e.exitCode) throw e;
      throw fail(`step ${i + 1} (${s.do}): ${String(e.message).split('\n')[0]}`, 1);
    }
  }
  await sleep(400);
  hold();
  return { track: rec.toJSON(), endMs: now() };
}

const FIT = { phone: 'phone', laptop: 'laptop', browser: 'laptop' };
/** The sync flashes before a session, and the fewest that must be found for the clock to be measured. */
const FLASHES = 5, FLASHES_NEEDED = 3;
/** The flashes found in a video, from the last of them backwards: runs of red 0.45 s apart or less, the first run after a longer gap being a page that turns red later. */
export function flashChain(runsS) {
  const chain = [];
  for (const t of runsS) { if (chain.length && t - chain.at(-1) > 0.45) break; chain.push(t); }
  return chain;
}
const CONSENT = ['[id*=cookie i]', '[class*=cookie i]', '[id*=consent i]', '[class*=consent i]', '[aria-label*=cookie i]'];

/**
 * `mm capture site --script`: the session, recorded, cut at the moment the page had loaded, as
 * `<piece>/assets/<name>.webm`, its pointer track `<name>.cursor.json` beside it, and a frame sequence
 * `<name>/` (media.json, frames, the track cut to match). Nothing is written until the whole script ran.
 */
export async function captureSession({ url, name, piece = '.', device = 'phone', viewport, hide = [], wait, scriptFile, quality = 90, log = () => {} }) {
  let steps;
  try { steps = parseScript(readFileSync(scriptFile, 'utf8')); } catch (e) { throw e.exitCode ? e : fail(`could not read the script ${scriptFile}: ${e.message}`, 2); }
  const tmp = mkdtempSync(join(tmpdir(), 'mm-session-'));
  const browser = await launchBrowser({ untrusted: /^https?:/i.test(url) });
  let video, track, cutHostMs, endMs;
  const shown = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: viewport.w, height: viewport.h }, deviceScaleFactor: 1, recordVideo: { dir: tmp, size: { width: viewport.w, height: viewport.h } } });
    const page = await ctx.newPage();
    const origin = performance.now();
    try { await page.goto(url, { waitUntil: 'load', timeout: 60_000 }); } catch (e) { throw fail(`could not open ${url}: ${e.message.split('\n')[0]}`, 1); }
    if (wait) { try { await page.waitForSelector(wait, { timeout: 15_000 }); } catch { throw fail(`--wait ${wait}: nothing matched within 15 s`, 1); } }
    if (hide.length) await page.addStyleTag({ content: `${hide.join(',\n')} { display: none !important; }` });
    await page.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; }' });
    await page.evaluate((sels) => { for (const el of document.querySelectorAll(sels.join(','))) { if (el === document.documentElement || el === document.body) continue; const p = getComputedStyle(el).position; if (p === 'fixed' || p === 'sticky') el.style.setProperty('display', 'none', 'important'); } }, CONSENT);
    await page.evaluate(() => document.fonts.ready);
    await sleep(300);
    // five full-frame red flashes, before anything is played: when each reaches the video says where the video's clock stands against ours
    // (the recorder can begin late, in the middle of the first one, so the first or two may be lost)
    for (let i = 0; i < FLASHES; i++) {
      shown.push(performance.now() - origin);
      await page.evaluate(() => { const d = document.createElement('div'); d.id = '__mm_sync'; d.style.cssText = 'position:fixed;inset:0;background:#f00;z-index:2147483647'; document.documentElement.append(d); });
      await sleep(120);
      await page.evaluate(() => document.getElementById('__mm_sync')?.remove());
      await sleep(180);
    }
    cutHostMs = performance.now() - origin + 150;   // from here the video shows the page as it is (the last flash is gone from it a frame or two after it was removed)
    ({ track, endMs } = await runSession(page, steps, { viewport, url, origin }));
    await sleep(200);
    video = page.video();
    await ctx.close();
    video = await video.path();
  } catch (e) { await browser.close(); rmSync(tmp, { recursive: true, force: true }); throw e; }
  await browser.close();

  try {
    const assets = join(resolve(piece), 'assets');
    mkdirSync(assets, { recursive: true });
    const webm = join(assets, `${name}.webm`), side = join(assets, `${name}.cursor.json`);
    copyFileSync(video, webm);
    const found = flashChain(findFlashes(webm, shown.at(-1) / 1000 + 1.5)).slice(-shown.length).map((t) => t * 1000);   // the flashes that were seen are the last ones shown
    const measured = found.length >= FLASHES_NEEDED;
    const offset = measured ? flashOffset(shown.slice(-found.length), found) : CLOCK_OFFSET_MS;
    const startS = Math.max(0, Math.round(cutHostMs - offset)) / 1000;
    const aligned = { ...shiftTrack(track, offset), sync: { method: measured ? 'flashes' : 'estimate', flashes: found.length, offsetMs: Math.round(offset), cutS: startS } };
    writeFileSync(side, `${JSON.stringify(aligned)}\n`);
    log(measured ? `the clock was set from ${found.length} of ${shown.length} sync flashes: the video runs ${Math.round(offset)} ms behind the script` : `warning: ${found.length} of ${shown.length} sync flashes found in the video; the clock is estimated (the video starts ${CLOCK_OFFSET_MS} ms after the page)`);
    const dur = scanDuration(webm);
    log(`wrote ${relative(process.cwd(), webm) || webm} (${dur.seconds.toFixed(2)} s; ${dur.source === 'scan' ? `the duration was read from its ${dur.packets} video packets: the container says ${dur.container == null ? 'none' : `${dur.container.toFixed(2)} s, which is off`}` : 'the container\'s duration agrees with its packets'})`);
    log(`wrote ${relative(process.cwd(), side) || side} (${track.samples.length} samples, ${track.targets.length} click target${track.targets.length === 1 ? '' : 's'}; its clock starts at the video's first frame)`);
    const endS = Math.round(dur.seconds * 1000) / 1000;
    const { dir, meta } = await prep({ file: webm, name, piece, fps: 30, fit: FIT[device] ?? 'laptop', trim: `${startS}-${endS}`, quality });
    log(`wrote ${meta.frames} frames (${meta.w}x${meta.h} at ${meta.fps} fps) from the first frame after the flashes (${startS.toFixed(2)} s into the video) to ${dir}`);
    const ff = firstFrame(join(dir, 'f00001.jpg'));
    log(ff.black ? `warning: the first frame is black (luma max ${ff.max}, mean ${ff.mean}); the page had not painted when the recording began` : `first frame is not black (luma max ${ff.max}, mean ${ff.mean})`);
    const record = capturedRecord({ url });
    let kept = false;
    try { kept = JSON.parse(readFileSync(join(assets, `${name}.licence.json`), 'utf8')).source === record.source; } catch { /* none yet */ }
    if (!kept) writeLicence(resolve(piece), `assets/${name}.licence.json`, record);
    return { dir, meta, track, firstFrame: ff, duration: dur };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
