// ui/annotate: a small product card and up to three short notes on the ground beside it. For each
// note in turn its target row lights, a thin leader draws from the note to the row's value, and
// only then the note fades in. A leader runs through empty ground, never across a word, and stops
// short of its target. Every box is laid out at its final place first, so nothing reflows.
import { arrive, bar, drawLine, elapsed, leaderRoute, listOf, panel, part, pointIn, timeline } from '../../../runtime/kit/ui.js';
import { glass } from '../../../runtime/kit/surface.js';

const MAX = 3;
const steps = [];
for (let k = 1; k <= MAX; k++) steps.push([`light${k}`, 0.3, { after: k === 1 ? 0.1 : 0.9 }], [`draw${k}`, 0.6], [`note${k}`, 0.35]);
const TL = timeline([['open', 0.4], ...steps, ['hold', 0.9]]);
const r3 = (x) => Math.round(x * 1000) / 1000;

/** `Label:value` split at its first colon; text with no colon is a value alone. */
const pair = (s) => { const k = s.indexOf(':'); return k < 0 ? ['', s] : [s.slice(0, k).trim(), s.slice(k + 1).trim()]; };

/** A leader for a note below the card: it leaves the note's right edge, climbs a lane beside the card and turns left into the value. Each note has its own lane, so none crosses another. */
function laneRoute(from, to, gap, laneX) {
  return [from, { x: laneX, y: from.y }, { x: laneX, y: to.y }, { x: to.x + gap, y: to.y }];
}

export default {
  name: 'annotate',
  group: 'ui',
  dur: TL.total,
  steps: Array.from({ length: MAX }, (_, i) => `light${i + 1}`).map(TL.start),
  params: {
    title: { type: 'string', default: '', meaning: 'the card\'s name' },
    rows: { type: 'string', default: '', meaning: 'the three rows of the card, as Label:value separated by |' },
    notes: { type: 'string', default: '', meaning: 'up to three notes, as row:text separated by |; rows count from 0, the top row' },
    surface: { type: 'enum(flat|glass)', default: 'flat', meaning: 'flat: the surface role; glass: the brand\'s glass surface' },
  },
  at(el, p, ctx) {
    const t = elapsed(p, ctx) * (TL.total / ctx.d);
    const prm = ctx.params;
    const root = panel(el, 'mm-ui-annotate');
    const wide = ['16x9', '4x3'].includes(ctx.format);
    root.dataset.layout = wide ? 'row' : 'col';
    const rowsOf = listOf(prm.rows).slice(0, 3).map(pair);

    // the card, with its three rows at their final place
    const card = part(root, 'mm-ui-annotate__card');
    glass(card, prm.surface);
    const head = part(card, 'mm-ui-annotate__head');
    part(head, 'mm-ui-annotate__title', String(prm.title));
    bar(head, 3);
    const rows = rowsOf.map(([label, value]) => {
      const row = part(card, 'mm-ui-annotate__row');
      part(row, 'mm-ui__muted', label);
      return { row, value: part(row, 'mm-ui-annotate__value', value) };
    });

    // the notes: each tied to a row, in the order they are told; below the card the nearest note names the lowest row
    const ground = part(root, 'mm-ui-annotate__ground');
    const told = listOf(prm.notes).slice(0, MAX).map((s, i) => {
      const [n, text] = pair(s);
      return { i, at: Number(n), text };
    }).filter((n) => rows[n.at] && n.text);
    const shown = wide ? told : [...told].sort((a, b) => b.at - a.at || a.i - b.i);
    const made = new Map(shown.map((n) => [n, part(ground, 'mm-ui-annotate__note', n.text)]));

    // geometry, in the root's own px
    const em = parseFloat(root.ownerDocument.defaultView.getComputedStyle(root).fontSize);
    const gap = 0.3 * em, lead = 0.4 * em;
    const cardRight = card.offsetLeft + card.offsetWidth;
    const rank = new Map([...told].sort((a, b) => a.at - b.at || a.i - b.i).map((n, k) => [n, k]));
    let floor = -Infinity;
    const routes = new Map();
    for (const n of wide ? [...told].sort((a, b) => a.at - b.at || a.i - b.i) : shown) {
      const note = made.get(n);
      const to = pointIn(rows[n.at].value, root, 1, 0.5);
      if (wide) {
        // level with its row where it can be; a note that would meet the one above is pushed down
        const top = Math.max(to.y - 0.625 * em, floor);
        note.style.top = `${r3(top - pointIn(ground, root, 0, 0).y)}px`;
        floor = top + note.offsetHeight + 0.6 * em;
        const start = { x: pointIn(note, root, 0, 0).x - lead, y: Math.min(Math.max(to.y, top + 0.3 * em), top + note.offsetHeight - 0.3 * em) };
        routes.set(n, leaderRoute(start, to, gap));
      } else {
        const edge = pointIn(note, root, 1, 0);
        const start = { x: edge.x + lead, y: edge.y + 0.625 * em };
        routes.set(n, laneRoute(start, to, gap, cardRight + (told.length - rank.get(n)) * 0.8 * em));
      }
    }

    // the clock: the row lights, the leader draws from the note, then the note fades in
    told.forEach((n, k) => {
      const q = k + 1;
      rows[n.at].row.style.setProperty('--lit', String(r3(ctx.ease('enter', TL.at(`light${q}`, t)))));
      made.get(n).style.opacity = String(r3(ctx.ease('enter', TL.at(`note${q}`, t))));
      const reveal = ctx.ease('move', TL.at(`draw${q}`, t));
      if (reveal > 0) drawLine(root, routes.get(n), { kind: 'lead', reveal, end: 'dot' });
    });
    arrive(root, TL.at('open', t), ctx);
  },
};
