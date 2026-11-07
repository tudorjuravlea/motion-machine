// ui/status: one status changes on one pill and the list around it responds. The pill's label
// crossfades in place while its width eases from its right edge, so it always ends on the row's edge; the arc hands over to a disc
// with no half-faded stack; then a new row pushes in at the top as the others glide down one row.
import { arrive, bar, elapsed, listOf, panel, part, pointIn, timeline } from '../../../runtime/kit/ui.js';
import { glass } from '../../../runtime/kit/surface.js';

const TL = timeline([['open', 0.4], ['tick', 2.08], ['hold', 1.8], ['change', 0.6], ['push', 0.6, { after: 0.25 }], ['rest', 1.0]]);
const DUR = Math.round(TL.total * 1000) / 1000;
const r3 = (x) => Math.round(x * 1000) / 1000;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const NS = 'http://www.w3.org/2000/svg';

function svg(parent, cls, children) {
  const s = parent.ownerDocument.createElementNS(NS, 'svg');
  s.setAttribute('class', cls);
  s.setAttribute('viewBox', '0 0 20 20');
  for (const [tag, attrs] of children) {
    const n = parent.ownerDocument.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    s.append(n);
  }
  parent.append(s);
  return s;
}

// a pill with both labels stacked in one cell; `auto` clones are only for measuring
function pill(parent, from, to) {
  const p = part(parent, 'mm-ui-status__pill');
  const icon = part(p, 'mm-ui-status__icon');
  const arc = svg(icon, 'mm-ui-status__arc', [['circle', { cx: 10, cy: 10, r: 7, 'stroke-dasharray': '11 33' }]]);
  const disc = svg(icon, 'mm-ui-status__disc', [['circle', { cx: 10, cy: 10, r: 9 }], ['path', { d: 'M6 10.4 L9 13.2 L14 7.2', pathLength: 1 }]]);
  const labels = part(p, 'mm-ui-status__labels');
  const a = part(labels, 'mm-ui-status__label', from);
  const b = part(labels, 'mm-ui-status__label', to);
  return { p, arc, disc, tick: disc.querySelector('path'), a, b };
}

export default {
  name: 'status',
  group: 'ui',
  dur: DUR,
  steps: ['tick', 'change', 'push'].map(TL.start),
  params: {
    title: { type: 'string', default: '', meaning: 'the list\'s heading' },
    from: { type: 'string', default: '', meaning: 'the first state, one word' },
    to: { type: 'string', default: '', meaning: 'the final state, one word' },
    rows: { type: 'string', default: '', meaning: 'the rows, separated by |, the first carries the pill, four at most; empty uses the slot text' },
    added: { type: 'string', default: '', meaning: 'the new row that pushes in at the top' },
    surface: { type: 'enum(flat|glass)', default: 'flat', meaning: 'flat: the surface role; glass: the brand\'s glass surface' },
  },
  at(el, p, ctx) {
    const t = elapsed(p, ctx) * (TL.total / ctx.d);
    const prm = ctx.params;
    const rows = listOf(prm.rows || el.dataset.mmLabel).slice(0, 4);
    const root = panel(el, 'mm-ui-status');
    glass(root, prm.surface);
    const head = part(root, 'mm-ui-status__head');
    part(head, 'mm-ui-status__title', prm.title);
    bar(head, 3);
    const list = part(root, 'mm-ui-status__list');

    // every row at its final place: the new one on top, the old ones below it
    const all = [String(prm.added ?? ''), ...rows];
    const els = all.map((text, i) => {
      const row = part(list, 'mm-ui-status__row');
      part(row, 'mm-ui-status__text', text);
      return row;
    });
    const pl = pill(els[1], prm.from, prm.to);
    const slot = pl.p.parentNode.insertBefore(part(els[1], 'mm-ui-status__slot'), pl.p);
    slot.append(pl.p);
    els.forEach((row, i) => { if (i !== 1) bar(row, 2.4, 'mm-ui-status__meta'); });

    // the two pill widths, measured once on hidden copies of both labels
    const probe = part(root, 'mm-ui-status__probe');
    const ghosts = [prm.from, prm.to].map((s) => pill(probe, s, s).p);
    const w0 = ghosts[0].offsetWidth, w1 = ghosts[1].offsetWidth;
    probe.remove();
    slot.style.width = `${Math.max(w0, w1)}px`;

    const pitch = pointIn(els[1], list, 0, 0).y - pointIn(els[0], list, 0, 0).y;
    const c = TL.start('change');
    const q = (a, b) => clamp01((t - c - a) / (b - a));   // a window inside the change, in seconds

    // the arc ticks a quarter turn per step, quick then still, until the change
    const spin = Math.min(t, c);
    const k = Math.floor(spin / 0.52), f = (spin - k * 0.52) / 0.18;
    pl.arc.style.transform = `rotate(${r3((k + ctx.ease('enter', clamp01(f))) * 90)}deg)`;
    pl.arc.style.opacity = String(r3(1 - q(0, 0.16)));

    // the disc starts only once the arc is gone; its tick draws 0.16 s after it
    const grow = q(0.16, 0.46);
    pl.disc.style.opacity = String(r3(clamp01(grow * 2)));
    pl.disc.style.transform = `scale(${r3(0.35 + 0.65 * ctx.ease('enter', grow))})`;
    pl.tick.style.strokeDashoffset = String(r3(1 - ctx.ease('enter', q(0.32, 0.58))));

    // the label crossfades where it stands; the right edge stays on the row's edge and only the left one moves
    const x = ctx.ease('enter', q(0, 0.6));
    pl.a.style.opacity = String(r3(1 - x));
    pl.b.style.opacity = String(r3(x));
    pl.p.style.width = `${r3(w0 + (w1 - w0) * x)}px`;

    // the new row arrives as the old ones glide down by exactly one row
    const e = ctx.ease('enter', TL.at('push', t));
    els[0].style.opacity = String(r3(e));
    els[0].style.transform = `translateY(${r3(-pitch * 0.3 * (1 - e))}px)`;
    els.slice(1).forEach((row) => { row.style.transform = `translateY(${r3(-pitch * (1 - e))}px)`; });
    arrive(root, TL.at('open', t), ctx);
  },
};
