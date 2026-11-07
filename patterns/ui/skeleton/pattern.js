// ui/skeleton: a list loads. The chrome is real from the first frame; each row's bar sits exactly on
// the word it stands in for, and the rows resolve top to bottom without anything moving.
import { arrive, bar, elapsed, listOf, panel, part, shownOf, timeline } from '../../../runtime/kit/ui.js';
import { glass } from '../../../runtime/kit/surface.js';

const DUR = 3.4;
const TL = timeline([['open', 0.4], ['wait', 1.1], ['resolve', 1.3]]);
const r3 = (x) => Math.round(x * 1000) / 1000;

export default {
  name: 'skeleton',
  group: 'ui',
  dur: DUR,
  steps: [TL.start('resolve')],
  params: {
    title: { type: 'string', default: '', meaning: 'the list\'s name, real from the first frame' },
    rows: { type: 'string', default: '', meaning: 'the rows, separated by |, five at most; empty uses the slot text' },
    surface: { type: 'enum(flat|glass)', default: 'flat', meaning: 'flat: the surface role; glass: the brand\'s glass surface' },
  },
  at(el, p, ctx) {
    const t = elapsed(p, ctx) * (TL.total / ctx.d);
    const prm = ctx.params;
    const rows = listOf(prm.rows || el.dataset.mmLabel).slice(0, 5);
    const root = panel(el, 'mm-ui-skeleton');
    glass(root, prm.surface);
    const head = part(root, 'mm-ui-skeleton__head');
    part(head, 'mm-ui-skeleton__title', prm.title);
    bar(head, 3);
    const breath = 0.8 + 0.2 * Math.cos((t / 1.4) * Math.PI * 2);
    rows.forEach((text, i) => {
      const row = part(root, 'mm-ui-skeleton__row');
      const q = shownOf(t, i, rows.length, { start: TL.start('resolve'), span: TL.end('resolve') - TL.start('resolve'), fade: 0.5 });
      const dot = part(row, 'mm-ui-skeleton__dot');
      const fill = part(dot, 'mm-ui-skeleton__fill');
      fill.style.opacity = String(r3(q));
      const cell = part(row, 'mm-ui-skeleton__cell');
      const word = part(cell, 'mm-ui-skeleton__word', text);
      word.style.opacity = String(r3(q));
      const stand = part(cell, 'mm-ui-skeleton__stand mm-ui__bar');
      stand.style.opacity = String(r3((1 - q) * breath));
      bar(row, 2.4, 'mm-ui-skeleton__meta');
    });
    arrive(root, TL.at('open', t), ctx);
  },
};
