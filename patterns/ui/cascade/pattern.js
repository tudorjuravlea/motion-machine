// ui/cascade: one choice is pressed and the values that depend on it follow in hierarchy order. The
// thumb slides by transform alone; each value then rolls, only the span that differs, inside a
// feathered mask. Every box is laid out at its final size first, so nothing reflows.
import { arrive, cursorAt, drawCursor, elapsed, listOf, panel, part, pointIn, pressAt, scaleOf, timeline } from '../../../runtime/kit/ui.js';
import { glass } from '../../../runtime/kit/surface.js';

const ROLL = 0.5;
const TL = timeline([
  ['open', 0.4], ['press', 0.3, { after: 0.5 }],
  ['thumb', 0.9, { after: -0.22 }],
  ['v1', ROLL, { after: 0.1 - 0.9 }], ['v2', ROLL, { after: 0.12 - ROLL }], ['v3', ROLL, { after: 0.2 - ROLL }],
  ['hold', 0.5],
]);
const r3 = (x) => Math.round(x * 1000) / 1000;

/** The span that differs between two strings: what both share at the start and at the end holds still. */
function split(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return { head: a.slice(0, i), from: a.slice(i, a.length - j), to: b.slice(i, b.length - j), tail: a.slice(a.length - j) };
}

export default {
  name: 'cascade',
  group: 'ui',
  dur: TL.total,
  steps: ['press', 'v1', 'v2', 'v3'].map(TL.start),
  params: {
    options: { type: 'string', default: '', meaning: 'the choices of the selector, separated by |; the first is on at the start, the last is pressed' },
    from: { type: 'string', default: '', meaning: 'the three dependent values before, as Label:value separated by |' },
    to: { type: 'string', default: '', meaning: 'the three values after the press, separated by |' },
    surface: { type: 'enum(flat|glass)', default: 'flat', meaning: 'flat: the surface role; glass: the brand\'s glass surface' },
  },
  at(el, p, ctx) {
    const t = elapsed(p, ctx) * (TL.total / ctx.d);
    const prm = ctx.params;
    const root = panel(el, 'mm-ui-cascade');
    glass(root, prm.surface);
    const options = listOf(prm.options).slice(0, 3);
    const olds = listOf(prm.from).slice(0, 3).map((s) => { const k = s.indexOf(':'); return k < 0 ? ['', s] : [s.slice(0, k).trim(), s.slice(k + 1).trim()]; });
    const news = listOf(prm.to);

    // the selector: the thumb is one segment wide and moves by transform alone
    const seg = part(root, 'mm-ui-cascade__seg');
    seg.style.gridTemplateColumns = `repeat(${options.length}, 1fr)`;
    const thumb = part(seg, 'mm-ui-cascade__thumb');
    thumb.style.width = `calc((100% - 0.4em) / ${options.length})`;
    const e = ctx.ease('move', TL.at('thumb', t));
    thumb.style.transform = `translateX(${r3(e * (options.length - 1) * 100)}%)`;
    const last = options.length - 1;
    const cells = options.map((o, i) => {
      const c = part(seg, 'mm-ui-cascade__opt', o);
      if (i === last) c.style.scale = String(r3(pressAt(t, TL.start('press'), 0.94)));
      return c;
    });

    // the dependents: label at the left, the value at the right, its changed span rolling in a mask
    const rows = part(root, 'mm-ui-cascade__rows');
    olds.forEach(([label, old], i) => {
      const next = news[i] ?? old;
      const d = split(old, next);
      const row = part(rows, 'mm-ui-cascade__row');
      part(row, 'mm-ui-cascade__label mm-ui__muted', label);
      const value = part(row, 'mm-ui-cascade__value');
      part(value, 'mm-ui-cascade__keep', d.head);
      const win = part(value, 'mm-ui-cascade__win');
      const q = ctx.ease('move', TL.at(`v${i + 1}`, t));
      const out = part(win, 'mm-ui-cascade__roll', d.from);
      const inn = part(win, 'mm-ui-cascade__roll', d.to);
      out.style.transform = `translateY(${r3(-q * 100)}%)`;
      inn.style.transform = `translateY(${r3((1 - q) * 100)}%)`;
      part(value, 'mm-ui-cascade__keep', d.tail);
    });

    // the hand: in from outside the panel, one press, then away from the result
    const sc = scaleOf(root);
    const W = root.offsetWidth, H = root.offsetHeight;
    const aim = pointIn(cells[last], root, 0.6, 0.6);
    const press = TL.start('press');
    const pos = cursorAt(t, [
      { x: W * 1.06, y: H * 0.7, at: 0 },
      { ...aim, at: press },
      { ...aim, at: press + 0.3 },
      { x: W * 1.06, y: aim.y - H * 0.25, at: press + 0.3 + 0.35 },
    ], sc);
    arrive(root, TL.at('open', t), ctx);
    drawCursor(part(root, 'mm-ui-cascade__hand'), pos, { press: pressAt(t, press) });
  },
};
