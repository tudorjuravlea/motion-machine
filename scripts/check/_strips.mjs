// Shared by W-POP and W-DEADSTOP (not a rule): frames read densely across each entrance, exit and move
// of a film, and the three readings taken from them. A frame is read at quarter scale, as W-EMPTY
// reads them, as brightness; `share(a, b)` is the share of its pixels that differ by more than
// LUMA_STEP levels. The frames are the ones inside a motion's own window (padded by a frame), minus a
// cut's span and the frame before it (a cut draws two scenes at once, or jumps from one to the next, and
// its look is its own), so the cost follows the motion
// in the film, not its length, and stops at MAX_FRAMES a format. Cached on ctx.
//
// Pure functions below take frames as Uint8Array brightness; the page part only fills the cache.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cdpOf, round } from './_lib.mjs';
import { decodePng } from './_pixels.mjs';

export const FPS = 30;
export const LUMA_STEP = 12;     // levels (of 255) a pixel must move to count as changed
export const MAX_FRAMES = 600;   // frames read per format
export const MIN_WINDOW = 6;     // frames: a shorter motion is a cut, not an ease
export const LONG_MOVE_S = 1.5;  // a move longer than this is read at its first second and its last half second
export const POP_SHARE = 0.002;  // a lone frame must differ from each neighbour by at least this share of the picture
export const POP_RETURN = 0.3;   // ... while the neighbours differ from each other by at most this part of that
export const JUMP_SHARE = 0.6;   // a dead stop: one step carries at least this part of the window's change
export const TAIL_STILL = 0.05;  // ... the steps after it each under this part of the jump
export const TAIL_MIN = 3;       // ... for at least this many frames, and a third of the window
export const STITCH_GAP = 2;     // frames of stillness between two motions of one element that make a stitch
export const ABRUPT = 0.35;      // a motion that stops or starts at this part of its peak step, not easing

/**
 * Frames are the gate's dearest reading, and a film's motion is one clock in every format, so the strips are
 * read in the first format only. A story whose scenes have `variants` (their own beats per format) is read in each.
 */
export function readsHere(ctx) {
  if (ctx.format === ctx.formats[0]) return true;
  if (ctx.cache.variants === undefined) {
    try { ctx.cache.variants = JSON.parse(readFileSync(join(ctx.dir, 'story.json'), 'utf8')).scenes.some((sc) => sc.variants && Object.keys(sc.variants).length); } catch { ctx.cache.variants = true; }
  }
  return ctx.cache.variants;
}

/** Share of pixels whose brightness differs by more than LUMA_STEP. */
export function share(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > LUMA_STEP) n++;
  return n / a.length;
}

/** The motions of a film as windows { from, to, selector, kind } in seconds, and the cut spans to stay out of. */
export function motionsOf(schedule) {
  const win = [], cuts = [];
  for (const e of schedule.events) {
    if (e.kind === 'cut') { cuts.push({ from: e.t, to: e.t + (e.d ?? 0) }); continue; }
    if (!(e.d > 0) || e.screen || e.ambient) continue;
    if (e.kind === 'arrive' || e.kind === 'depart') win.push({ from: e.t, to: e.t + e.d, selector: e.selector, kind: e.kind });
    else if (e.kind === 'move') {
      if (e.d <= LONG_MOVE_S) win.push({ from: e.t, to: e.t + e.d, selector: e.selector, kind: 'move' });
      else win.push({ from: e.t, to: e.t + 1, selector: e.selector, kind: 'move' }, { from: e.t + e.d - 0.5, to: e.t + e.d, selector: e.selector, kind: 'move' });
    }
  }
  return { win, cuts };
}

/** The frame numbers to read and the runs they form: { frames: Set, runs: [[n0, n1]], capped }. */
export function plan(schedule) {
  const { win, cuts } = motionsOf(schedule);
  const last = Math.floor(schedule.duration * FPS + 1e-6);
  const bad = (n) => cuts.some((c) => n / FPS >= c.from - 1 / FPS - 1e-9 && n / FPS < c.to - 1e-9);
  const want = new Set();
  for (const w of win) {
    const n0 = Math.round(w.from * FPS) - 1, n1 = Math.round(w.to * FPS) + 1;
    for (let n = Math.max(0, n0); n <= Math.min(last, n1); n++) if (!bad(n)) want.add(n);
  }
  const all = [...want].sort((a, b) => a - b);
  const capped = all.length > MAX_FRAMES;
  const keep = new Set(capped ? all.slice(0, MAX_FRAMES) : all);
  const runs = [];
  for (const n of [...keep].sort((a, b) => a - b)) {
    const r = runs.at(-1);
    if (r && n === r[1] + 1) r[1] = n; else runs.push([n, n]);
  }
  return { win, frames: keep, runs, capped, last };
}

/** The brightness of the frame at n / FPS, quarter scale, cached. */
export async function lumaAt(ctx, n) {
  const cache = (ctx.cache.luma ??= new Map());
  if (cache.has(n)) return cache.get(n);
  const cdp = await cdpOf(ctx);
  const { width, height } = ctx.page.viewportSize();
  await ctx.mm.seek(Math.min(n / FPS, ctx.schedule.duration));
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 0.25 } });
  const img = decodePng(Buffer.from(data, 'base64'));
  const y = new Uint8Array(img.width * img.height);
  for (let i = 0, o = 0; i < y.length; i++, o += 4) y[i] = (img.data[o] * 77 + img.data[o + 1] * 150 + img.data[o + 2] * 29) >> 8;
  cache.set(n, y);
  return y;
}

/**
 * Lone frames of a run: a frame that differs from the one before and the one after by at least POP_SHARE
 * while those two differ from each other by at most POP_RETURN of the smaller of the two. `get(n)` gives a frame.
 */
export function pops(run, get) {
  const out = [];
  for (let n = run[0] + 1; n < run[1]; n++) {
    const a = share(get(n - 1), get(n)), b = share(get(n), get(n + 1));
    const m = Math.min(a, b);
    if (m < POP_SHARE) continue;
    const back = share(get(n - 1), get(n + 1));
    if (back <= POP_RETURN * m) out.push({ frame: n, instant: round(n / FPS), measured: round(m, 4), back: round(back, 4) });
  }
  return out;
}

/** The steps (share of pixels changed between a frame and the next) over frames n0..n1, or null when a frame is missing. */
export function stepsOf(n0, n1, get) {
  const steps = [];
  for (let n = n0; n < n1; n++) {
    const a = get(n), b = get(n + 1);
    if (!a || !b) return null;
    steps.push(share(a, b));
  }
  return steps;
}

/**
 * A dead stop in a motion's steps: one step carries at least JUMP_SHARE of all the change, and every
 * step after it is under TAIL_STILL of that jump for at least TAIL_MIN steps and a third of the motion.
 * Returns { frame (index of the jump's step), jump, share, still } or null.
 */
export function deadStop(steps) {
  const total = steps.reduce((a, b) => a + b, 0);
  if (steps.length < MIN_WINDOW || total < POP_SHARE) return null;
  const k = steps.indexOf(Math.max(...steps));
  const jump = steps[k];
  if (jump < JUMP_SHARE * total) return null;
  let still = 0;
  for (let i = k + 1; i < steps.length && steps[i] < TAIL_STILL * jump; i++) still++;
  if (k + 1 + still < steps.length || still < Math.max(TAIL_MIN, Math.ceil(steps.length / 3))) return null;
  return { index: k, jump: round(jump, 4), share: round(jump / total, 3), still };
}

/**
 * A stitch between two motions of one element: the first ends abruptly (its last moving step at least
 * ABRUPT of its peak), at most STITCH_GAP frames stand still, and the second starts abruptly. `a` and
 * `b` are the steps of the two windows; `between` the frames between the first's end and the second's start.
 */
export function stitch(a, b, between = 0) {
  const MOVING = POP_SHARE;
  const moving = (s) => s >= MOVING;
  const lastA = a.findLastIndex(moving), firstB = b.findIndex(moving);
  if (lastA < 0 || firstB < 0) return null;
  const peakA = Math.max(...a), peakB = Math.max(...b);
  const gap = between + (a.length - 1 - lastA) + firstB;
  if (gap > STITCH_GAP) return null;
  if (a.filter(moving).length < 3 || b.filter(moving).length < 3) return null;
  if (a[lastA] < ABRUPT * peakA || b[firstB] < ABRUPT * peakB) return null;
  return { gap, endsAt: round(a[lastA] / peakA, 2), startsAt: round(b[firstB] / peakB, 2) };
}

/** The pops, dead stops and stitches among the plan's runs and windows, read from `get(n)` (a frame or undefined). */
export function analyse(p, get) {
  const out = { pops: [], deadStops: [], stitches: [] };
  for (const run of p.runs) {
    if (run[1] - run[0] < 2) continue;
    for (const x of pops(run, get)) out.pops.push({ ...x, selector: p.win.filter((w) => x.instant >= w.from - 1 / FPS && x.instant <= w.to + 1 / FPS).map((w) => w.selector)[0] ?? null });
  }
  const byEl = new Map();
  for (const w of p.win) {
    const n0 = Math.round(w.from * FPS), n1 = Math.round(w.to * FPS);
    const steps = stepsOf(n0, n1, get);
    if (!steps) continue;
    const d = deadStop(steps);
    if (d) out.deadStops.push({ selector: w.selector, kind: w.kind, instant: round((n0 + d.index) / FPS), ...d });
    if (!byEl.has(w.selector)) byEl.set(w.selector, []);
    byEl.get(w.selector).push({ ...w, steps, n0, n1 });
  }
  for (const [selector, list] of byEl) {
    list.sort((a, b) => a.n0 - b.n0);
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], b = list[i + 1];
      const between = b.n0 - a.n1;
      if (between < 0 || between > STITCH_GAP || (a.kind === b.kind && a.kind !== 'move')) continue;
      const s = stitch(a.steps, b.steps, between);
      if (s) out.stitches.push({ selector, instant: round(a.n1 / FPS), from: a.kind, to: b.kind, ...s });
    }
  }
  return out;
}

/** The same brightness read from a full-size screenshot, every fourth pixel each way: slower and steadier than the quarter-scale capture, which can catch a 3D or composited layer unrastered. */
export async function lumaSure(ctx, n, pass = 'a') {
  const cache = ((ctx.cache.lumaSure ??= {})[pass] ??= new Map());
  if (cache.has(n)) return cache.get(n);
  await ctx.mm.seek(Math.min(n / FPS, ctx.schedule.duration));
  const img = decodePng(await ctx.page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' }));
  const w = img.width >> 2, h = img.height >> 2, y = new Uint8Array(w * h);
  for (let r = 0, k = 0; r < h; r++) {
    for (let c = 0; c < w; c++, k++) { const o = ((r << 2) * img.width + (c << 2)) * 4; y[k] = (img.data[o] * 77 + img.data[o + 1] * 150 + img.data[o + 2] * 29) >> 8; }
  }
  cache.set(n, y);
  return y;
}

/**
 * Reads the film's strips once per format: { pops, deadStops, stitches, framesRead, capped, confirmed }.
 * Every finding is read again, twice, from full-size screenshots of just its frames, and kept only when it holds both times.
 */
export async function strips(ctx) {
  if (ctx.cache.strips) return ctx.cache.strips;
  const p = plan(ctx.schedule);
  for (const n of p.frames) await lumaAt(ctx, n);
  const fast = analyse(p, (n) => ctx.cache.luma.get(n));
  const out = { pops: [], deadStops: [], stitches: [], framesRead: p.frames.size, capped: p.capped, confirmed: 0 };
  if (fast.pops.length || fast.deadStops.length || fast.stitches.length) {
    const win = [], runs = [], need = new Set();
    const span = (a, b) => { for (let n = a; n <= b; n++) need.add(n); };
    const near = (sel, from, to) => p.win.filter((w) => w.selector === sel && Math.round(w.to * FPS) >= from && Math.round(w.from * FPS) <= to);
    for (const x of fast.pops) { const n = Math.round(x.instant * FPS); runs.push([n - 1, n + 1]); span(n - 1, n + 1); win.push(...near(x.selector, n - 1, n + 1)); }
    for (const x of [...fast.deadStops, ...fast.stitches]) {
      const n = Math.round(x.instant * FPS);
      for (const w of near(x.selector, n - FPS, n + FPS)) { win.push(w); span(Math.round(w.from * FPS), Math.round(w.to * FPS)); }
    }
    // twice, the second time in the other order: a real finding is the same however the frames are reached, a raster that came up late is not
    const frames = [...need].sort((a, b) => a - b);
    const read = async (pass, order) => {
      for (const n of order) await lumaSure(ctx, n, pass);
      return analyse({ runs, win: [...new Set(win)] }, (n) => ctx.cache.lumaSure[pass].get(n));
    };
    const a = await read('a', frames), b = await read('b', [...frames].reverse());
    const both = (xs, ys) => xs.filter((x) => ys.some((y) => y.instant === x.instant && y.selector === x.selector));
    Object.assign(out, { pops: both(a.pops, b.pops), deadStops: both(a.deadStops, b.deadStops), stitches: both(a.stitches, b.stitches), confirmed: frames.length });
  }
  ctx.cache.strips = out;
  return out;
}
