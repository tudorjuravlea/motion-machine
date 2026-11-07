// ui/answer: a question is typed and sent, the assistant thinks, the answer streams in and its
// sources arrive last. Every word is laid out from the first frame, so the stream never reflows.
import { arrive, elapsed, listOf, panel, part, pointIn, pressAt, shownOf, timeline } from '../../../runtime/kit/ui.js';
import { glass } from '../../../runtime/kit/surface.js';

const DUR = 6.6;
const TL = timeline([['open', 0.4], ['type', 1.1], ['send', 0.3], ['rise', 0.45, { after: -0.1 }], ['think', 1.1], ['stream', 2.2], ['sources', 0.55, { after: -0.2 }]]);
const r3 = (x) => Math.round(x * 1000) / 1000;

export default {
  name: 'answer',
  group: 'ui',
  dur: DUR,
  steps: ['send', 'think', 'stream', 'sources'].map(TL.start),
  params: {
    ask: { type: 'string', default: '', meaning: 'the question, a short line' },
    answer: { type: 'string', default: '', meaning: 'the answer, two lines at most; empty uses the slot text' },
    sources: { type: 'string', default: '', meaning: 'what it drew on, separated by |, two at most; empty omits them' },
    thinking: { type: 'string', default: 'Thinking', meaning: 'the word shown while it works' },
    surface: { type: 'enum(flat|glass)', default: 'flat', meaning: 'flat: the surface role; glass: the brand\'s glass surface' },
  },
  at(el, p, ctx) {
    const t = elapsed(p, ctx) * (TL.total / ctx.d);
    const prm = ctx.params;
    const root = panel(el, 'mm-ui-answer');
    glass(root, prm.surface);
    const answer = String(prm.answer || el.dataset.mmLabel || '');
    const ask = String(prm.ask ?? '');

    const bubble = part(root, 'mm-ui-answer__ask', ask);
    const lane = part(root, 'mm-ui-answer__lane');
    const think = part(lane, 'mm-ui-answer__think mm-ui__muted', prm.thinking);
    const words = part(lane, 'mm-ui-answer__words');
    const spans = answer.split(/\s+/).filter(Boolean).map((w, i) => {
      const s = root.ownerDocument.createElement('span');
      s.textContent = i ? ` ${w}` : w;
      words.append(s);
      return s;
    });
    const row = part(root, 'mm-ui-answer__sources');
    const chips = listOf(prm.sources).slice(0, 2).map((s) => part(row, 'mm-ui__chip mm-ui__muted', s));
    const composer = part(root, 'mm-ui-answer__composer mm-ui__field');
    const typed = part(composer, 'mm-ui-answer__typed');
    const send = part(composer, 'mm-ui-answer__send');
    send.style.scale = String(r3(pressAt(t, TL.start('send'), 0.82)));

    // the question: typed in the composer, then carried up out of it as the bubble
    const sent = TL.at('send', t) > 0;
    const shown = sent ? '' : ask.slice(0, Math.round(ask.length * TL.at('type', t)));
    typed.textContent = shown;
    if (!sent && TL.at('open', t) >= 1) part(typed, 'mm-ui__caret');
    const rise = ctx.ease('enter', TL.at('rise', t));
    const dy = pointIn(composer, root, 0, 0).y - pointIn(bubble, root, 0, 0).y;
    bubble.style.opacity = String(r3(rise));
    bubble.style.transform = `translateY(${Math.round((1 - rise) * dy * 10) / 10}px)`;

    // the word and the answer share one lane: the word gives way as the first words land
    const stream = { start: TL.start('stream'), span: TL.end('stream') - TL.start('stream'), fade: 0.24 };
    const thinkIn = TL.at('think', t) > 0 ? Math.min(1, (t - TL.start('think')) / 0.2) : 0;
    const thinkOut = Math.min(1, Math.max(0, (t - stream.start) / 0.2));
    think.style.opacity = String(r3(thinkIn * (1 - thinkOut) * (0.62 + 0.38 * Math.cos(((t - TL.start('think')) / 0.9) * Math.PI * 2))));
    spans.forEach((s, i) => { s.style.opacity = String(r3(shownOf(t, i, spans.length, stream))); });

    chips.forEach((c, i) => {
      const e = ctx.ease('enter', shownOf(t, i, chips.length, { start: TL.start('sources'), span: TL.end('sources') - TL.start('sources'), fade: 0.4 }));
      c.style.opacity = String(r3(e));
      c.style.transform = `translateY(${Math.round((1 - e) * ctx.unit * 0.08 * 10) / 10}px)`;
    });
    arrive(root, TL.at('open', t), ctx);
  },
};
