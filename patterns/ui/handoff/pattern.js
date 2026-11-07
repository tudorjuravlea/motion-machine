// ui/handoff: a button is pressed, a chip buds off it and flies to a list, landing as a new row's
// pill, and the total rolls to its new value. The row is laid out from the first frame at opacity 0,
// so nothing else ever moves; the flying chip is the pill's twin and is swapped for it unseen.
import { arrive, bar, drawCursor, cursorAt, elapsed, pointIn, part, panel, pressAt, scaleOf, timeline } from '../../../runtime/kit/ui.js';
import { count } from '../../../runtime/kit/count.js';
import { glass } from '../../../runtime/kit/surface.js';

const TL = timeline([
  ['open', 0.4],
  ['reach', 0.75, { after: -0.2 }],
  ['press', 0.3],
  ['bud', 0.2, { after: -0.2 }],
  ['fly', 0.9],
  ['row', 0.5, { after: -0.9 }],
  ['total', 0.8, { after: 0.15 }],
  ['retreat', 0.35, { after: -1.8 }],
]);
const DUR = TL.total;
const r3 = (x) => Math.round(x * 1000) / 1000;
const r1 = (x) => Math.round(x * 10) / 10;
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// the lift of the carried chip: up to its peak 30 % into the flight, back to rest by 85 %
const lift = (q) => (q <= 0.3 ? smooth(q / 0.3) : q < 0.85 ? smooth(1 - (q - 0.3) / 0.55) : 0);

export default {
  name: 'handoff',
  group: 'ui',
  dur: DUR,
  steps: ['press', 'bud', 'fly', 'total'].map(TL.start),
  params: {
    action: { type: 'string', default: 'Add to order', meaning: 'the button that is pressed' },
    item: { type: 'string', default: 'Desk lamp', meaning: 'the chip that flies and the label of the new row' },
    from: { type: 'number', default: 120, meaning: 'the total before the handoff' },
    to: { type: 'number', default: 168, meaning: 'the total after it' },
    prefix: { type: 'string', default: '$', meaning: 'written before the total' },
    suffix: { type: 'string', default: '', meaning: 'written after the total' },
    surface: { type: 'enum(flat|glass)', default: 'flat', meaning: 'flat: the surface role; glass: the brand\'s glass surface' },
  },
  at(el, p, ctx) {
    const t = elapsed(p, ctx) * (TL.total / ctx.d);
    const prm = ctx.params;
    const root = panel(el, 'mm-ui-handoff');
    root.dataset.layout = ['16x9', '4x3'].includes(ctx.format) ? 'row' : 'col';
    glass(root, prm.surface);

    // source: two filler lines and the button
    const source = part(root, 'mm-ui-handoff__source');
    const lines = part(source, 'mm-ui-handoff__lines');
    bar(lines, 3); bar(lines, 4.5);
    const button = part(source, 'mm-ui__button mm-ui-handoff__button', String(prm.action));
    // destination: filler rows, the new row, then the total
    const list = part(root, 'mm-ui-handoff__list');
    bar(list, 6, 'mm-ui-handoff__head');
    const rowOf = (w) => {
      const r = part(list, 'mm-ui-handoff__row');
      return { r, lead: part(r, 'mm-ui-handoff__lead'), tail: bar(r, w) };
    };
    for (const w of [4, 6]) bar(rowOf(w).lead, 4.5, 'mm-ui-handoff__ghost');
    const fresh = rowOf(5);
    const pill = part(fresh.lead, 'mm-ui__chip', String(prm.item));
    const totalRow = part(list, 'mm-ui-handoff__total');
    part(totalRow, 'mm-ui__muted', 'Total');
    const figure = part(totalRow, 'mm-ui-handoff__figure');
    const chip = part(root, 'mm-ui__chip mm-ui-handoff__chip', String(prm.item));

    // the chip sits on the pill; flight is only a translate away from it
    const end = pointIn(pill, root);
    const corner = pointIn(pill, root, 0, 0);
    chip.style.left = `${corner.x}px`;
    chip.style.top = `${corner.y}px`;
    const wide = root.dataset.layout === 'row';
    const edge = pointIn(button, root, wide ? 1 : 0.5, wide ? 0.5 : 1);
    const from = { x: edge.x + (wide ? chip.offsetWidth / 2 : 0), y: edge.y + (wide ? 0 : chip.offsetHeight / 2) };
    const dx = from.x - end.x, dy = from.y - end.y, dist = Math.hypot(dx, dy) || 1;

    const bud = ctx.ease('enter', TL.at('bud', t));
    const q = TL.at('fly', t);
    const e = clamp01(ctx.ease('move', q));
    const bow = Math.sin(Math.PI * e) * dist * 0.1;
    const landed = q >= 1;
    const flying = TL.at('bud', t) > 0 && !landed;
    const px = dx * (1 - e) - (dy / dist) * bow, py = dy * (1 - e) + (dx / dist) * bow;
    const s = q > 0 ? 1 + 0.12 * lift(q) : 0.3 + 0.7 * bud;
    chip.style.opacity = flying ? String(r3(q > 0 ? 1 : bud)) : '0';
    chip.style.transform = `translate(${r1(px)}px, ${r1(py)}px) scale(${r3(s)})`;
    pill.style.opacity = landed ? '1' : '0';
    fresh.r.style.opacity = String(r3(ctx.ease('enter', TL.at('row', t))));

    count(figure, Number(prm.from), Number(prm.to), ctx.ease('move', TL.at('total', t)), { prefix: String(prm.prefix), suffix: String(prm.suffix) });

    // the hand: in from off the panel, onto the button, off to the side once the chip is away
    const k = scaleOf(root), off = parseFloat(root.ownerDocument.defaultView.getComputedStyle(root).fontSize) * 2;
    const hit = pointIn(button, root, 0.5, 0.55);
    arrive(root, TL.at('open', t), ctx);
    const pos = cursorAt(t, [{ x: -off, y: -off, at: 0 }, { ...hit, at: TL.start('press') }, { x: -off, y: hit.y, at: TL.end('retreat') }], k);
    drawCursor(root, pos, { press: pressAt(t, TL.start('press'), 0.85) });
    button.style.scale = String(r3(pressAt(t, TL.start('press'), 0.92)));
  },
};
