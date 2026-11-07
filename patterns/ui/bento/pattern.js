// ui/bento: a grid of product tiles, one whole short story in one beat. Tiles land 110 ms apart in
// reading order, the first leads in the accent fill and spans two columns, and no two neighbours
// share a kind. Then each tile does one small thing of its own: a number counts, bars grow, rows
// appear one by one, a chip pops, filler lines draw. Every box is laid out at its final size first.
import { arrive, bar, elapsed, listOf, panel, part, shownOf, timeline } from '../../../runtime/kit/ui.js';
import { count } from '../../../runtime/kit/count.js';
import { glass } from '../../../runtime/kit/surface.js';

const MAX = 6, GAP = 0.11, ARRIVE = 0.4, OPEN = 0.3, THING = 0.9;
const KINDS = ['figure', 'bars', 'list', 'chip', 'filler'];
const COLS = { '16x9': 3 };                      // every other format is two columns
const CUTS = new Set(['9x16', '1x1', '4x5']);                  // formats that may drop filler tiles

// open; every tile lands GAP after the one before; then every tile does its own thing, GAP apart
const rows = [];
let end = 0;
const put = (name, start, d) => { rows.push([name, d, { after: start - end }]); end = start + d; };
put('open', 0, OPEN);
for (let i = 0; i < MAX; i++) put(`a${i}`, OPEN + GAP * i, ARRIVE);
const landed = OPEN + GAP * (MAX - 1) + ARRIVE;
for (let i = 0; i < MAX; i++) put(`d${i}`, landed + GAP * i, THING);
put('hold', landed + GAP * (MAX - 1) + THING, 0.8);
const TL = timeline(rows);
const r3 = (x) => Math.round(x * 1000) / 1000;

/** The tiles in the order given, a stable reorder: the first stays first, and where it can, no two neighbours share a kind. Otherwise the order is left. Nothing is dropped. */
export function spreadKinds(tiles) {
  const ok = (list) => list.every((t, i) => i === 0 || t.kind !== list[i - 1].kind);
  if (tiles.length < 3 || ok(tiles)) return [...tiles];
  const left = tiles.slice(1), out = [tiles[0]];
  while (left.length) {
    const prev = out[out.length - 1].kind;
    const share = (k) => left.filter((t) => t.kind === k).length;
    // of the kinds that differ from the one before, take the one with most left; the earliest on a tie
    let pick = -1;
    left.forEach((t, i) => { if (t.kind !== prev && (pick < 0 || share(t.kind) > share(left[pick].kind))) pick = i; });
    if (pick < 0) return [...tiles];
    out.push(left.splice(pick, 1)[0]);
  }
  return out;
}

/** Filler tiles are the only thing a format may cut, and only when they are a third or more of the grid; otherwise all stay. The lead stays whatever it is. */
export function cutFiller(tiles, format) {
  if (!CUTS.has(format)) return [...tiles];
  const filler = tiles.filter((t, i) => i > 0 && t.kind === 'filler').length;
  return filler * 3 >= tiles.length ? tiles.filter((t, i) => i === 0 || t.kind !== 'filler') : [...tiles];
}

/** `kind:label:value` tiles separated by |, six at most; a kind that is not known is filler. */
function parse(text) {
  return listOf(text).slice(0, MAX).map((s) => {
    const [kind, label = '', ...rest] = s.split(':').map((x) => x.trim());
    return { kind: KINDS.includes(kind) ? kind : 'filler', label, value: rest.join(':').trim() };
  });
}

export default {
  name: 'bento',
  group: 'ui',
  dur: TL.total,
  steps: ['a0', 'd0'].map(TL.start),
  params: {
    tiles: { type: 'string', default: '', meaning: 'the tiles, separated by |, six at most, each kind:label:value; kinds figure, bars, list, chip, filler; a bars value is numbers and a list value is words, separated by commas; the first tile leads' },
    prefix: { type: 'string', default: '', meaning: 'written before a figure' },
    suffix: { type: 'string', default: '', meaning: 'written after a figure' },
    surface: { type: 'enum(flat|glass)', default: 'flat', meaning: 'flat: the surface role; glass: the brand\'s glass surface' },
  },
  at(el, p, ctx) {
    const t = elapsed(p, ctx) * (TL.total / ctx.d);
    const prm = ctx.params;
    const cols = COLS[ctx.format] ?? 2;
    const tiles = spreadKinds(cutFiller(parse(prm.tiles || el.dataset.mmLabel), ctx.format));
    const root = panel(el, 'mm-ui-bento');
    root.dataset.cols = String(cols);
    glass(root, prm.surface);
    const grid = part(root, 'mm-ui-bento__grid');
    const spare = (cols - ((tiles.length + 1) % cols)) % cols;     // the last row is filled by the last tile

    tiles.forEach(({ kind, label, value }, i) => {
      const lead = i === 0;
      const tile = part(grid, `mm-ui-bento__tile mm-ui-bento__tile--${kind}${lead ? ' mm-ui-bento__tile--lead' : ''}`);
      const span = (lead ? 2 : 1) + (i === tiles.length - 1 ? spare : 0);
      if (span > 1) tile.style.gridColumn = `span ${span}`;
      const e = Math.min(1, ctx.ease('enter', TL.at(`a${i}`, t)));
      tile.style.opacity = String(r3(e));
      tile.style.transform = `translateY(${r3((1 - e) * ctx.unit * 0.05)}px)`;
      if (kind !== 'filler') part(tile, 'mm-ui-bento__label', label);
      const body = part(tile, `mm-ui-bento__body mm-ui-bento__body--${kind}`);
      const q = TL.at(`d${i}`, t);

      if (kind === 'figure') {
        const num = Number(value);
        const fix = (value.split('.')[1] || '').length;
        const fmt = { fix, prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? '') };
        const cell = part(body, 'mm-ui-bento__num');
        // the final text holds the cell's size, so the counting digits never move their tile
        const ghost = part(cell, 'mm-ui-bento__ghost', `${fmt.prefix}${value}${fmt.suffix}`);
        ghost.setAttribute('aria-hidden', 'true');
        const live = part(cell, 'mm-ui-bento__live');
        if (Number.isFinite(num)) count(live, 0, num, ctx.ease('move', q), fmt);
        else live.textContent = `${fmt.prefix}${value}${fmt.suffix}`;
      } else if (kind === 'bars') {
        const vals = listOf(value, ',').map(Number).filter(Number.isFinite).slice(0, 5);
        const top = Math.max(...vals, 1e-9);
        const track = part(body, 'mm-ui-bento__bars');
        vals.forEach((v, j) => {
          const b = part(track, 'mm-ui-bento__col');
          const k = shownOf(q, j, vals.length, { span: 1, fade: 0.5 });
          b.style.height = `${r3(Math.max(v / top, 0.06) * 100 * ctx.ease('move', k))}%`;
        });
      } else if (kind === 'list') {
        const words = listOf(value, ',').slice(0, 3);
        const list = part(body, 'mm-ui-bento__rows');
        words.forEach((w, j) => {
          const row = part(list, 'mm-ui-bento__row');
          row.style.opacity = String(r3(shownOf(q, j, words.length, { span: 1, fade: 0.3 })));
          part(row, 'mm-ui-bento__dot');
          part(row, 'mm-ui-bento__word', w);
        });
      } else if (kind === 'chip') {
        const chip = part(body, 'mm-ui__chip mm-ui-bento__chip', value);
        const k = ctx.ease('enter', shownOf(q, 0, 2, { span: 1, fade: 0.5 }));
        chip.style.opacity = String(r3(Math.min(1, k)));
        chip.style.scale = String(r3(0.9 + 0.1 * Math.min(1, k)));
        const w = 6 * ctx.ease('move', shownOf(q, 1, 2, { span: 1, fade: 0.5 }));
        bar(body, r3(Math.max(w, 0)), 'mm-ui-bento__fill');
      } else {
        [9, 5].forEach((w, j) => bar(body, r3(w * ctx.ease('move', shownOf(q, j, 2, { span: 1, fade: 0.5 }))), 'mm-ui-bento__line'));
      }
    });
    arrive(root, TL.at('open', t), ctx);
  },
};
