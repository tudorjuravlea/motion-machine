// ui/table-edit: one value in a small table is edited in place, and the total it feeds follows a beat
// later. Every part sits at its final geometry from the first frame; the old figure, the new figure
// and both rings share one cell, so nothing moves when the value changes.
import { arrive, bar, cursorAt, drawCursor, elapsed, listOf, panel, part, pointIn, pressAt, scaleOf, timeline } from '../../../runtime/kit/ui.js';
import { count, formatNumber } from '../../../runtime/kit/count.js';
import { glass } from '../../../runtime/kit/surface.js';

const TL = timeline([
  ['open', 0.4], ['reach', 0.8, { after: -0.1 }], ['press', 0.37, { after: 0.1 }], ['ring', 0.2, { after: -0.3 }],
  ['select', 0.45, { after: -0.2 }], ['type', 0.55, { after: 0.1 }], ['commit', 0.15, { after: 0.2 }],
  ['retreat', 0.35], ['wash', 0.6, { after: -0.3 }], ['roll', 0.9, { after: -0.1 }], ['hold', 0.5],
]);
const r3 = (x) => Math.round(x * 1000) / 1000;
const DEFAULT_ROWS = 'Design:1200|Build:2400|Test:800';

// "Label:number" rows; the number is whatever follows the last colon
function rowsOf(v) {
  const rows = listOf(v || DEFAULT_ROWS).map((s) => {
    const i = s.lastIndexOf(':');
    const n = Number(s.slice(i + 1));
    return i > 0 && Number.isFinite(n) ? { label: s.slice(0, i).trim(), n } : null;
  }).filter(Boolean).slice(0, 4);
  return rows.length ? rows : rowsOf(DEFAULT_ROWS);
}

export default {
  name: 'table-edit',
  group: 'ui',
  dur: TL.total,
  steps: ['press', 'type', 'commit', 'roll'].map(TL.start),
  params: {
    rows: { type: 'string', default: DEFAULT_ROWS, meaning: 'the rows as Label:number, separated by |, four at most' },
    edit: { type: 'number', default: 1, meaning: 'the index of the row edited, counted from 0' },
    to: { type: 'number', default: 0, meaning: 'the new value of that row' },
    total: { type: 'string', default: 'Total', meaning: 'the label of the total row, which is summed from the rows' },
    prefix: { type: 'string', default: '', meaning: 'written before every figure' },
    suffix: { type: 'string', default: '', meaning: 'written after every figure' },
    surface: { type: 'enum(flat|glass)', default: 'flat', meaning: 'flat: the surface role; glass: the brand\'s glass surface' },
  },
  at(el, p, ctx) {
    const t = elapsed(p, ctx) * (TL.total / ctx.d);
    const prm = ctx.params;
    const rows = rowsOf(prm.rows);
    const ei = Math.min(rows.length - 1, Math.max(0, Math.round(Number(prm.edit) || 0)));
    const from = rows[ei].n, to = Number.isFinite(Number(prm.to)) && prm.to !== '' ? Number(prm.to) : from;
    const sum = rows.reduce((a, r) => a + r.n, 0);
    const sumTo = sum - from + to;
    const fix = Math.max(0, ...rows.map((r) => (String(r.n).split('.')[1] || '').length), (String(to).split('.')[1] || '').length);
    const fmt = { fix, prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? '') };
    const oldText = formatNumber(from, fmt), newText = formatNumber(to, fmt);
    const cols = Math.max(...[from, to, sum, sumTo].map((v) => formatNumber(v, fmt).length));

    const root = panel(el, 'mm-ui-table-edit');
    root.style.setProperty('--cols', String(cols));
    glass(root, prm.surface);

    const header = part(root, 'mm-ui-table-edit__row');
    bar(header, 5); part(header, ''); bar(header, 3, 'mm-ui-table-edit__head');
    let cell;
    rows.forEach((r, i) => {
      const row = part(root, 'mm-ui-table-edit__row');
      part(row, '', r.label);
      bar(row, 4 + ((i * 3) % 4));
      if (i !== ei) { part(row, 'mm-ui-table-edit__val', formatNumber(r.n, fmt)); return; }
      cell = part(row, 'mm-ui-table-edit__val');
    });
    const trow = part(root, 'mm-ui-table-edit__row mm-ui-table-edit__row--total');
    part(trow, '', prm.total);
    part(trow, '');
    const totalCell = part(trow, 'mm-ui-table-edit__val');

    // the edited cell: old figure (selected), new figure (typed in place), ring and wash, all in one box
    const tt = TL.at('type', t), typing = tt > 0 && t < TL.start('commit') + 1e-9 && TL.at('commit', t) < 1;
    const committed = TL.at('commit', t) > 0 || tt >= 1;
    const oldEl = part(cell, 'mm-ui-table-edit__old', oldText);
    const chars = part(cell, 'mm-ui-table-edit__chars');
    const n = committed ? newText.length : Math.round(newText.length * tt);
    [...newText].forEach((c, i) => {
      const s = part(chars, '', c);
      s.style.display = 'inline';
      s.style.opacity = i < n ? '1' : '0';
      if (!committed && typing) {
        if (i === n - 1) s.className = 'mm-ui-table-edit__caret';
        if (n === 0 && i === 0) s.className = 'mm-ui-table-edit__caret--before';
      }
    });
    const sel = ctx.ease('enter', TL.at('select', t));
    oldEl.style.opacity = tt > 0 ? '0' : '1';
    oldEl.style.background = `color-mix(in srgb, var(--mm-color-accent) ${Math.round(35 * sel)}%, transparent)`;

    const ringIn = ctx.ease('enter', TL.at('ring', t)), ringOut = TL.at('commit', t);
    const ring = part(cell, 'mm-ui-table-edit__ring');
    ring.style.opacity = String(r3(ringIn * (1 - ringOut)));
    ring.style.transform = `scale(${r3(0.94 + 0.06 * ringIn)})`;
    const q = TL.at('wash', t);
    const wash = part(cell, 'mm-ui-table-edit__wash');
    wash.style.opacity = String(r3(0.55 * Math.sin(Math.PI * q)));
    wash.style.backgroundPosition = `${Math.round(q * 100)}% 0`;

    // the total, rolled to its new figure a beat after the wash
    count(totalCell, sum, sumTo, ctx.ease('enter', TL.at('roll', t)), fmt);

    arrive(root, TL.at('open', t), ctx);

    // the cursor: in from outside the panel, to the cell, two presses, away from the total
    const k = scaleOf(root), W = root.offsetWidth;
    const cp = pointIn(cell, root, 0.1, 0.62), away = pointIn(header, root, 0.06, 0.5);
    const off = { x: W + 3 * 15 * k, y: cp.y + 2 * 15 * k };
    const pos = cursorAt(t, [
      { x: off.x, y: off.y, at: 0 },
      { x: cp.x, y: cp.y, at: TL.end('reach') },
      { x: cp.x, y: cp.y, at: TL.end('commit') },
      { x: away.x, y: away.y, at: TL.end('retreat') },
    ], k);
    const editing = t >= TL.start('press') && t < TL.end('commit');
    drawCursor(root, pos, { type: editing ? 'text' : 'arrow', press: Math.min(pressAt(t, TL.start('press')), pressAt(t, TL.start('press') + 0.07)) });
  },
};
