// ui/exchange: two nodes face each other. A request line draws from the left node to the right
// one with its badge, the right node confirms, the answer draws back on a parallel route, and a
// third line of moving dots starts under them. Each line draws by being cut, so its dashes never
// stretch, and the dots move only while the stream flows: their phase comes from the clock alone.
import { arrive, bar, drawLine, elapsed, panel, part, pointIn, timeline } from '../../../runtime/kit/ui.js';
import { glass } from '../../../runtime/kit/surface.js';

const TL = timeline([
  ['open', 0.4],
  ['send', 0.7, { after: 0.1 }],
  ['confirm', 0.45, { after: 0.05 }],
  ['reply', 0.7, { after: 0.15 }],
  ['stream', 0.7, { after: 0.2 }],
  ['flow', 3, { after: -0.7 }],
]);
const r3 = (x) => Math.round(x * 1000) / 1000;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r1 = (x) => Math.round(x * 10) / 10;
const DOTS = 0.42;   // em between two dots of the stream, as in ui.css
const SPEED = 3;     // em of travel per second while the stream flows

export default {
  name: 'exchange',
  group: 'ui',
  dur: TL.total,
  steps: ['send', 'confirm', 'reply', 'stream'].map(TL.start),
  params: {
    from: { type: 'string', default: '', meaning: 'the left node\'s label, which sends the request' },
    to: { type: 'string', default: '', meaning: 'the right node\'s label, which confirms and answers' },
    request: { type: 'string', default: '', meaning: 'the badge on the request line, a few words' },
    reply: { type: 'string', default: '', meaning: 'the badge on the answer line, a few words' },
    stream: { type: 'string', default: '', meaning: 'the small label under the stream line' },
    surface: { type: 'enum(flat|glass)', default: 'flat', meaning: 'flat: the surface role; glass: the brand\'s glass surface' },
  },
  at(el, p, ctx) {
    const t = elapsed(p, ctx) * (TL.total / ctx.d);
    const prm = ctx.params;

    // side by side when the badges fit between the nodes at this size, else stacked; on a narrow screen the stacked badges also go to one side
    const build = (layout, tight) => {
      const root = panel(el, 'mm-ui-exchange');
      root.dataset.layout = layout;
      if (tight) root.dataset.fit = 'tight';
      glass(root, prm.surface);
      const node = (label) => { const n = part(root, 'mm-ui-exchange__node'); part(n, 'mm-ui-exchange__label', String(label)); bar(n, 2.4); return n; };
      const a = node(prm.from);
      const mid = part(root, 'mm-ui-exchange__mid');
      const b = node(prm.to);
      const badge1 = part(mid, 'mm-ui__chip', String(prm.request));
      const lane1 = part(mid, 'mm-ui-exchange__lane');
      const lane2 = part(mid, 'mm-ui-exchange__lane');
      const badge2 = part(mid, 'mm-ui__chip', String(prm.reply));
      const zone = part(root, 'mm-ui-exchange__stream');
      part(zone, 'mm-ui__muted', String(prm.stream));
      return { root, a, b, badge1, badge2, lane1, lane2, zone };
    };
    let o = build('row');
    const over = () => o.root.scrollWidth > o.root.clientWidth + 1;
    if (over()) o = build('col');
    if (over()) o = build('col', true);
    const { root, a, b, badge1, badge2, lane1, lane2, zone } = o;

    // routes, in the root's own px: each stops 0.3em short of a node, and the stream sits clear of the label
    const em = parseFloat(root.ownerDocument.defaultView.getComputedStyle(root).fontSize);
    const gap = 0.3 * em;
    const side = root.dataset.layout === 'row';
    const across = (lane, from, to) => {   // from -> to: 'a' is the left or upper node
      const x0 = side ? pointIn(a, root, 1, 0.5).x + gap : pointIn(lane, root).x;
      const x1 = side ? pointIn(b, root, 0, 0.5).x - gap : x0;
      const y0 = side ? pointIn(lane, root).y : pointIn(a, root, 0.5, 1).y + gap;
      const y1 = side ? y0 : pointIn(b, root, 0.5, 0).y - gap;
      const there = [{ x: x0, y: y0 }, { x: x1, y: y1 }];
      return from === 'a' ? there : there.reverse();
    };
    const top = pointIn(zone, root, 0, 0).y + 0.55 * em;
    const stream = [{ x: pointIn(zone, root, 1, 0).x - 0.8 * em, y: top }, { x: pointIn(zone, root, 0, 0).x + 0.8 * em, y: top }];

    // the clock
    const fade = (name) => r3(ctx.ease('enter', clamp01(TL.at(name, t) * 2.5)));
    badge1.style.opacity = String(fade('send'));
    badge2.style.opacity = String(fade('reply'));
    b.style.setProperty('--lit', String(r3(ctx.ease('enter', TL.at('confirm', t)))));
    const draw = (pts, name, opts) => {
      const reveal = ctx.ease('move', TL.at(name, t));
      if (reveal > 0) drawLine(root, pts, { reveal, ...opts });
    };
    draw(across(lane1, 'a'), 'send', { kind: 'send', end: 'arrow' });
    draw(across(lane2, 'b'), 'reply', { kind: 'reply', end: 'arrow' });
    const flowed = Math.max(0, t - TL.start('flow'));
    draw(stream, 'stream', { kind: 'stream', phase: (flowed * SPEED * em) % (DOTS * em) });
    arrive(root, TL.at('open', t), ctx);
  },
};
