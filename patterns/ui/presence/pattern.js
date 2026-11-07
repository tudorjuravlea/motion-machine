// ui/presence: two people work in one document. The first sweeps a selection across a line, the
// second moves elsewhere and types a phrase. Each keeps one colour on cursor, flag, selection and
// caret. Everything is laid out at its final geometry first, so the typing never rewraps the line.
import { arrive, bar, cursorAt, drawCursor, elapsed, panel, part, pointIn, scaleOf, timeline } from '../../../runtime/kit/ui.js';
import { glass } from '../../../runtime/kit/surface.js';

const TL = timeline([['open', 0.4], ['sweep', 0.7], ['hop', 1.0], ['settle', 0.5], ['type', 1.1], ['clear', 0.5]]);
const r3 = (x) => Math.round(x * 1000) / 1000;
const r1 = (x) => Math.round(x * 10) / 10;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export default {
  name: 'presence',
  group: 'ui',
  dur: TL.total,
  steps: ['sweep', 'hop', 'type', 'clear'].map(TL.start),
  params: {
    title: { type: 'string', default: '', meaning: 'the document title, a few words' },
    line: { type: 'string', default: '', meaning: 'the line the first person selects, one line' },
    typed: { type: 'string', default: '', meaning: 'the phrase the second person types, one line' },
    one: { type: 'string', default: 'Design', meaning: 'the first person\'s name on their flag (a role, not a person)' },
    two: { type: 'string', default: 'Product', meaning: 'the second person\'s name on their flag (a role, not a person)' },
    surface: { type: 'enum(flat|glass)', default: 'flat', meaning: 'flat: the surface role; glass: the brand\'s glass surface' },
  },
  at(el, p, ctx) {
    const t = elapsed(p, ctx) * (TL.total / ctx.d);
    const prm = ctx.params;
    const root = panel(el, 'mm-ui-presence');
    glass(root, prm.surface);
    const doc = root.ownerDocument;
    const line = String(prm.line ?? '');
    const typed = String(prm.typed ?? '');

    // the document, at its final geometry
    part(root, 'mm-ui-presence__title', prm.title);
    const body = part(root, 'mm-ui-presence__body');
    const rows = part(body, 'mm-ui-presence__rows');
    bar(rows, 18); bar(rows, 13);
    const lineRow = part(body, 'mm-ui-presence__line');
    const sel = part(lineRow, 'mm-ui-presence__sel');
    const lineText = part(lineRow, 'mm-ui-presence__text', line);
    bar(body, 16);
    const typeRow = part(body, 'mm-ui-presence__line');
    const chars = [...typed].map((c) => {
      const s = doc.createElement('span');
      s.textContent = c;
      typeRow.append(s);
      return s;
    });
    const caret = part(typeRow, 'mm-ui__caret mm-ui-presence__caret');
    const foot = part(body, 'mm-ui-presence__foot');
    bar(foot, 7);

    // where each person stands, found in the layout
    const size = parseFloat(doc.defaultView.getComputedStyle(root).fontSize);
    const k = scaleOf(root);
    const W = root.offsetWidth;
    const a = pointIn(lineText, root, 0, 0.5), b = pointIn(lineText, root, 1, 0.5);
    const full = b.x - a.x;
    const spot = chars.length ? pointIn(chars[0], root, 0, 0.5) : pointIn(typeRow, root, 0, 0.5);
    const park1 = pointIn(foot, root, 0.25, 0.5), park2 = pointIn(foot, root, 0.76, 0.5);

    sel.style.left = `${r1(pointIn(lineText, lineRow, 0, 0).x)}px`;

    const one = cursorAt(t, [
      { x: -size * 2, y: a.y, at: 0 },
      { x: a.x, y: a.y, at: TL.start('sweep') },
      { x: b.x, y: b.y, at: TL.end('sweep') },
      { x: park1.x, y: park1.y, at: TL.end('clear') },
    ], k);
    const sweeping = t >= TL.start('sweep') && t <= TL.end('sweep');
    if (sweeping) one.y = a.y;
    const two = cursorAt(t, [
      { x: W + size * 2, y: spot.y, at: 0 },
      { x: spot.x, y: spot.y, at: TL.end('hop') },
      { x: park2.x, y: park2.y, at: TL.end('clear') },
    ], k);

    // person one: the selection is exactly as long as the I-beam has travelled
    const w = t <= TL.start('sweep') ? 0 : t >= TL.end('sweep') ? full : clamp(one.x - a.x, 0, full);
    sel.style.width = `${r1(w)}px`;

    // person two: the whole phrase is there, only its reveal moves; solid while typing, blinking at rest
    const n = Math.round(chars.length * TL.at('type', t));
    chars.forEach((s, i) => { s.style.opacity = i < n ? '1' : '0'; });
    const cx = n ? chars[n - 1].offsetLeft + chars[n - 1].offsetWidth : (chars[0]?.offsetLeft ?? 0);
    caret.style.left = `${r1(cx)}px`;
    const rest = t >= TL.end('hop') && t < TL.start('type') && p < 1;
    const off = rest && ((t - TL.end('hop')) / 0.1667) % 2 >= 1;
    caret.style.opacity = t < TL.end('hop') ? '0' : off ? '0' : '1';

    // flags ride their cursors, under the cursors themselves
    const flag = (who, pos, cls, above) => {
      const f = part(root, `mm-ui-presence__flag ${cls}`, who);
      const right = pos.x + size * 0.5, left = pos.x - size * 0.5 - f.offsetWidth;
      const x = right + f.offsetWidth > W - size * 0.5 ? left : right;
      f.style.transform = `translate(${r1(x)}px, ${r1(above ? pos.y - size * 0.55 - f.offsetHeight : pos.y + size * 0.55)}px)`;
      f.style.opacity = String(r3(clamp(Math.min(x, W - x - f.offsetWidth) / (size * 0.5), 0, 1)));   // a flag the panel would cut waits until its cursor is in
    };
    flag(prm.one, one, 'mm-ui-presence__flag--one');
    flag(prm.two, two, 'mm-ui-presence__flag--two', true);
    drawCursor(root, { x: r1(one.x), y: r1(one.y) }, { type: 'text' }).classList.add('mm-ui-presence__cursor--one');
    drawCursor(root, { x: r1(two.x), y: r1(two.y) }, { type: 'text' }).classList.add('mm-ui-presence__cursor--two');
    arrive(root, TL.at('open', t), ctx);
    root.style.opacity = String(r3(parseFloat(root.style.opacity)));
  },
};
