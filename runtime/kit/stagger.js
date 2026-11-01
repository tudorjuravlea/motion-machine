// Stagger v2 (SPEC §6): when each of n items starts, by where it sits. Pure, and seeded wherever it is random, so
// the same options give the same offsets in every seek order. Importable in Node and in the browser.
//
// Every item gets a "distance" in steps. The geometry is a row (the default), a grid [cols, rows] or a block
// [cols, rows, layers] read in reading order; the origin is where the distance is 0:
//   first · last · center · an item index · a ratio pair [rx, ry(, rz)] over the grid (0..1 on each axis)
//   edges   the distance in from the nearest edge, so the outside goes first and the middle last
//   random  the steps in a seeded shuffle
// The distance is the straight-line distance, or along one `axis` ('x' | 'y' | 'z') alone. It then goes through, in
// this order, `ease` (v/max bent, times max: the last item reaches the full eased delay), `reverse` (max - v) and, for
// random, the shuffle. `use` ranks the items by a list of data values instead of their place, `total` lays the
// geometry out for more slots than items. A step is `each` seconds, or `amount` seconds is the whole spread; `cap`
// bounds the spread; `jitter` (seconds, or [at the start, at the end] of the spread) adds a seeded wobble.
// The ideas and the order of operations are from anime.js (grid, radial and 3D origins, `use`, `total`, the jitter
// ramp, ease then reverse) and Motion (the edges distance), re-derived here with a seeded shuffle and a normaliser
// that reaches the last item.

import { parseEasing } from './ease.js';
import { random } from './random.js';

const bad = (msg) => { throw new TypeError(`stagger: ${msg}`); };
const FROM = ['first', 'last', 'center', 'edges', 'random', 'index'];

// a seeded Fisher-Yates shuffle, in place
function shuffle(list, rand) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * The distance of each of n items, after ease, reverse and the shuffle: { values, max }, `max` the largest distance
 * before the ease (the unit that `amount` and the jitter ramp divide by).
 */
export function staggerValues(n, opts = {}) {
  const { grid, axis, from = 'first', index = 0, ease, reverse = false, seed = 0, use, total } = opts;
  if (!Number.isInteger(n) || n < 0) bad(`n must be a whole number, got ${n}`);
  if (axis != null && !['x', 'y', 'z'].includes(axis)) bad(`axis must be x, y or z, got "${axis}"`);
  if (!(typeof from === 'number' || Array.isArray(from) || FROM.includes(from))) bad(`from must be ${FROM.join(', ')}, an item index or a ratio pair, got ${JSON.stringify(from)}`);
  if (grid != null && !(Array.isArray(grid) && (grid.length === 2 || grid.length === 3) && grid.every((g) => Number.isInteger(g) && g >= 1))) bad(`grid must be [cols, rows] or [cols, rows, layers] of whole numbers above 0, got ${JSON.stringify(grid)}`);
  if (n === 0) return { values: [], max: 0 };

  const G = Math.max(Number.isInteger(total) ? total : n, n);   // slots in the geometry
  const nd = grid ? grid.length : 1;
  const cols = grid ? grid[0] : G, rows = grid ? grid[1] : 1;
  const rowsEff = nd === 2 ? Math.max(rows, Math.ceil(G / cols)) : rows;
  const layersEff = nd === 3 ? Math.max(grid[2], Math.ceil(G / (cols * rows))) : 1;
  const last = [Math.min(cols, G) - 1, nd >= 2 ? rowsEff - 1 : 0, nd === 3 ? layersEff - 1 : 0];
  const at = (j) => [j % cols, nd === 1 ? 0 : nd === 2 ? Math.floor(j / cols) : Math.floor(j / cols) % rows, nd === 3 ? Math.floor(j / (cols * rows)) : 0];
  const slot = (j) => at(Math.min(G - 1, Math.max(0, Math.round(j))));

  // the origin
  let o = [0, 0, 0];
  if (typeof from === 'number') o = slot(from);
  else if (from === 'last') o = slot(G - 1);
  else if (from === 'index') o = slot(index);
  else if (from === 'center') o = last.map((l) => l / 2);
  else if (Array.isArray(from)) o = [(from[0] ?? 0) * last[0], (from[1] ?? 0) * last[1], (from[2] ?? 0.5) * last[2]];
  const dims = axis ? ['x', 'y', 'z'].indexOf(axis) : -1;

  const distance = (j) => {
    const c = at(j);
    if (from === 'edges') {
      let m = Infinity;
      for (let d = 0; d < 3; d++) if (last[d] > 0 && (dims < 0 || dims === d)) m = Math.min(m, c[d], last[d] - c[d]);
      return m === Infinity ? 0 : m;
    }
    const dx = c[0] - o[0], dy = c[1] - o[1], dz = c[2] - o[2];
    if (dims >= 0) return Math.abs([dx, dy, dz][dims]);
    if (nd === 1) return Math.abs(dx);
    return nd === 2 ? Math.hypot(dx, dy) : Math.hypot(dx, dy, dz);
  };

  let v = Array.from({ length: G }, (_, j) => distance(j));
  const max = Math.max(...v);
  if (ease != null && max > 0) {
    const f = typeof ease === 'function' ? ease : parseEasing(ease);
    v = v.map((x) => f(x / max) * max);
  }
  if (reverse) v = v.map((x) => Math.abs(max - x));
  if (from === 'random') shuffle(v, random(seed));

  // which slot each item takes: its own, or its rank by the data value (ties in order, no number last)
  let slots = Array.from({ length: n }, (_, i) => i);
  if (use != null) {
    if (!Array.isArray(use)) bad('use must be a list of numbers, one per item');
    const key = (i) => (Number.isFinite(use[i]) ? use[i] : Infinity);
    const order = slots.slice().sort((a, b) => key(a) - key(b) || a - b);
    slots = new Array(n);
    order.forEach((item, rank) => { slots[item] = rank; });
  }
  return { values: slots.map((s) => v[s]), max };
}

/**
 * Start offsets in seconds for n items. Options as staggerValues, plus each (seconds per step, default 0.1) or amount
 * (seconds for the whole spread), cap, start (added to every offset), jitter and seed.
 */
export function staggerOffsets(n, opts = {}) {
  const { each = 0.1, amount, cap, start = 0, jitter, seed = 0 } = opts;
  if (amount != null && !(Number.isFinite(amount) && amount >= 0)) bad(`amount must be seconds >= 0, got ${amount}`);
  if (amount == null && !(Number.isFinite(each) && each >= 0)) bad(`each must be seconds >= 0, got ${each}`);
  const { values, max } = staggerValues(n, opts);
  if (!values.length) return [];
  let spacing = amount != null ? (max > 0 ? amount / max : 0) : each;
  const top = Math.max(...values);
  if (cap != null && top * spacing > cap) spacing = cap / top;
  const wobble = jitter == null ? null : Array.isArray(jitter) ? jitter : [jitter, jitter];
  const rand = wobble ? random(`${seed}/jitter`) : null;
  return values.map((x) => {
    let t = x * spacing;
    if (wobble) {
      const sample = rand() * 2 - 1;
      t += sample * (wobble[0] + (wobble[1] - wobble[0]) * (max > 0 ? x / max : 0));
    }
    return start + Math.max(0, t);
  });
}

/** A value for each of n items, spread by the same geometry from range[0] (distance 0) to range[1] (the largest distance). */
export function distribute(n, range, opts = {}) {
  const { values, max } = staggerValues(n, opts);
  return values.map((x) => range[0] + (range[1] - range[0]) * (max > 0 ? x / max : 0));
}
