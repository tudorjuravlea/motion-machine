// The scramble plan: how a line decodes from noise, or one value edits into another, as a pure
// function of progress. Every glyph has a window on the entrance, ranked by position (left to right,
// right to left, from the middle, or a fixed shuffle): it shows the old glyph before its window,
// noise glyphs that hold for one step (20 Hz) inside it, and the new glyph after it. Noise is a hash of
// (seed, position, step), so nothing is remembered between frames and a seek in any order gives the
// same line. With an old text the plan steps only what changed: the common start and end of the two
// texts stay still. A pattern draws the cells (text/scramble); the plan itself runs in Node.
//
// The window schedule (a glyph's start at rank × (1 − settle) / n, an end that lands on a step boundary,
// a jitter on both, the order from the middle held back until the extra glyphs of a shorter text are gone),
// the auto direction (from the right when the text shrinks), and the named glyph pools follow anime.js's
// scrambleText (MIT, Copyright (c) 2025 Julian Garnier; see NOTICE), rewritten as a stateless function
// over graphemes. The reveal delay, the length morph and the diff of one value into another restate the
// ideas of a timeline library's text plugins (no code).
import { graphemesOf } from './split.js';

/** 'a-e' to 'abcde'; a dash first or last is itself. */
export function expandRanges(s) {
  const a = Array.from(String(s));
  let out = '';
  for (let i = 0; i < a.length; i++) {
    if (i + 2 < a.length && a[i + 1] === '-' && a[i].codePointAt(0) < a[i + 2].codePointAt(0)) {
      for (let c = a[i].codePointAt(0); c <= a[i + 2].codePointAt(0); c++) out += String.fromCodePoint(c);
      i += 2;
    } else out += a[i];
  }
  return out;
}

const NAMED = { lowercase: 'a-z', uppercase: 'A-Z', numbers: '0-9', symbols: '!%#_|*+=', braille: '⠀-⣿', blocks: '▀-▟', shades: '░-▓' };
const DIGITS = '0123456789';

/**
 * The glyphs noise is drawn from. `spec` is a list of names joined by + or , (lowercase, uppercase,
 * letters, numbers, symbols, braille, blocks, shades, own), `none` for no noise, or the brand's own glyphs
 * as a plain string (a range x-y is expanded). `own` is the line's letters and digits.
 * @param {string} spec @param {{ own?: string }} [opts] @returns {string[]}
 */
export function poolOf(spec, { own = '' } = {}) {
  const s = String(spec ?? '').trim();
  const ownPool = () => Array.from(new Set([...graphemesOf(own).filter((c) => c.trim() !== ''), ...DIGITS]));
  if (s === '') return ownPool();
  if (s === 'none') return [];
  const names = s.split(/[+,]/).map((x) => x.trim());
  if (names.every((n) => n === 'own' || n === 'letters' || NAMED[n])) {
    const out = [];
    for (const n of names) {
      if (n === 'own') out.push(...ownPool());
      else if (n === 'letters') out.push(...graphemesOf(expandRanges(NAMED.lowercase + NAMED.uppercase)));
      else out.push(...graphemesOf(expandRanges(NAMED[n])));
    }
    return Array.from(new Set(out));
  }
  return Array.from(new Set(graphemesOf(expandRanges(s))));
}

/** A hash of three integers, 0 to 2^32 - 1: the one source of noise (no state, no clock). */
export function hashOf(a, b, c) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (b | 0) ^ (h >>> 15), 0xc2b2ae35);
  h = Math.imul(h ^ (c | 0) ^ (h >>> 13), 0x27d4eb2f);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The glyph a hash picks from a pool ('' for an empty pool). */
export const glyphOf = (pool, h) => (pool.length ? pool[h % pool.length] : '');

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * The schedule of one edit. `before` is the text shown first (omit it for a line that starts as noise),
 * `after` the text it resolves to.
 * @param {object} o
 * @param {string} [o.before] @param {string} o.after
 * @param {'auto'|'left'|'right'|'center'|'random'} [o.from] which glyphs resolve first ('auto': from the right when the text shrinks)
 * @param {boolean} [o.reversed] the order turned round
 * @param {number} [o.jitter] 0 to 1: how much each glyph's window is shifted by a seeded amount
 * @param {number} [o.settle] the share of the entrance each glyph spends in its window (0 to 1)
 * @param {number} [o.hold] the share at the end kept for reading the finished text
 * @param {number} [o.delay] the share at the start before the first glyph moves
 * @param {number} [o.rate] glyph steps per second
 * @param {number} [o.d] the entrance in seconds (the step boundaries land on a whole step of it)
 * @param {number} [o.seed] @param {boolean} [o.diff] keep the common start and end still (default true with a before)
 */
export function plan({ before, after, from = 'auto', reversed = false, jitter = 0, settle = 0.35, hold = 0, delay = 0, rate = 20, d = 1, seed = 0, diff = true }) {
  const hasBefore = before != null && String(before) !== '';
  const B = hasBefore ? graphemesOf(before) : [], A = graphemesOf(after ?? '');
  let pre = 0, suf = 0;
  if (hasBefore && diff) {
    while (pre < B.length && pre < A.length && B[pre] === A[pre]) pre++;
    while (suf < B.length - pre && suf < A.length - pre && B[B.length - 1 - suf] === A[A.length - 1 - suf]) suf++;
  }
  const oldM = B.slice(pre, B.length - suf), newM = A.slice(pre, A.length - suf);
  const n = Math.max(oldM.length, newM.length);
  const dir = from === 'auto' ? (newM.length < oldM.length ? 'right' : 'left') : from;
  const rank = new Array(n);
  if (dir === 'random') {
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = hashOf(seed, i, 0x51ed) % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    order.forEach((c, r) => { rank[c] = r; });
  } else {
    const ref = dir === 'right' ? n - 1 : dir === 'center' ? (n - 1) / 2 : 0;
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref));
    idx.forEach((c, r) => { rank[c] = r; });
  }
  if (reversed) for (let c = 0; c < n; c++) rank[c] = n - 1 - rank[c];
  const settleShare = clamp01(settle) || 0.01;
  const spacing = n ? (1 - settleShare) / n : 0;
  const stepShare = 1 / Math.max(1, rate * d);
  const scale = jitter > 0 ? jitter * settleShare : 0;
  const cells = [];
  for (let c = 0; c < n; c++) {
    // two seeded offsets per glyph, in -1..1 of the jitter's share
    const so = scale ? ((hashOf(seed, c, 0xa1) % 2001) - 1000) / 1000 * scale : 0;
    const eo = scale ? ((hashOf(seed, c, 0xa2) % 2001) - 1000) / 1000 * scale : 0;
    const start = rank[c] * spacing + so;
    const end = Math.min(1, Math.ceil((start + settleShare + eo) / stepShare - 1e-9) * stepShare);
    cells.push({ c, rank: rank[c], start, end, old: oldM[c] ?? null, new: newM[c] ?? null });
  }
  // a middle-out or random order on a shrinking text: the glyphs that stay wait until those that go have gone
  if (newM.length < n && dir !== 'left' && dir !== 'right' && dir !== 'random') {
    let extra = 0;
    for (let c = newM.length; c < n; c++) extra = Math.max(extra, cells[c].end);
    const keep = cells.slice(0, newM.length).sort((a, b) => a.rank - b.rank);
    const gap = (1 - extra) / (keep.length || 1);
    keep.forEach((cell, i) => { const t = extra + i * gap; if (t > cell.end) cell.end = t; });
  }
  return { from: dir, prefix: A.slice(0, pre).join(''), suffix: A.slice(A.length - suf).join(''), cells, d, rate, hold: clamp01(hold), delay: clamp01(delay), noiseStart: !hasBefore, seed };
}

/**
 * The cells of the line at linear progress `lin` (0 to 1 over the entrance) and glyph step `step`
 * (floor of seconds × rate): { state: 'same'|'old'|'noise'|'new', ch, h }. A noise cell has no `ch`: its
 * `h` is the hash a pool turns into a glyph. The common start and end come first and last as one 'same' cell each.
 */
export function cellsAt(p, lin, step) {
  const l = p.delay > 0 ? (lin - p.delay) / (1 - p.delay) : lin;
  const t = l <= 0 ? 0 : clamp01(l / (1 - p.hold));
  const out = [];
  if (p.prefix) out.push({ state: 'same', ch: p.prefix, h: 0 });
  for (const cell of p.cells) {
    const space = cell.new === ' ' || cell.old === ' ';
    const h = hashOf(p.seed, cell.c, step);
    if (t >= cell.end) { if (cell.new != null) out.push({ state: 'new', ch: cell.new, h, n: cell.new, o: cell.old }); continue; }
    if (t <= 0 || t < cell.start) {
      if (cell.old != null) out.push({ state: 'old', ch: cell.old, h, n: cell.new, o: cell.old });
      else if (p.noiseStart && cell.new != null) out.push(space ? { state: 'new', ch: ' ', h, n: ' ', o: ' ' } : { state: 'noise', ch: null, h, n: cell.new, o: cell.old });
      continue;
    }
    out.push(space ? { state: 'new', ch: ' ', h, n: ' ', o: ' ' } : { state: 'noise', ch: null, h, n: cell.new, o: cell.old });
  }
  if (p.suffix) out.push({ state: 'same', ch: p.suffix, h: 0 });
  return out;
}

/**
 * The line as a string at progress `lin`, noise glyphs taken from `pool`. With an empty pool a glyph in its window
 * keeps its old glyph until it resolves (a value that steps without noise).
 */
export function textAt(p, lin, step, pool) {
  return cellsAt(p, lin, step).map((c) => (c.state !== 'noise' ? c.ch : pool.length ? glyphOf(pool, c.h) : (c.o ?? ''))).join('');
}
