// text/date-flip: a before-and-after change. The old value (param `from`) shows first, a strike
// line is drawn through it, then it flips away on its top edge while the new value (the beat's
// text) flips in from below. At p = 1 the slot is the new value as plain text. Writes spans
// inside the slot.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const STRIKE = [0.12, 0.42], FLIP = [0.48, 0.86];

const params = {
  from: { type: 'string', default: '', meaning: 'the old value, struck through and flipped away (empty: the flip alone)' },
};

function linear(ctx, p) {
  if (p >= 1) return 1;   // the kit calls an entrance finished within its tolerance of the end
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}
const span = (doc, cls, text) => { const s = doc.createElement('span'); s.className = cls; if (text != null) s.textContent = text; return s; };

export default {
  name: 'date-flip',
  group: 'text',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const q = linear(ctx, p);
    if (q >= 1 || !text) { el.textContent = text; return; }
    const from = String(ctx.params?.from ?? '').trim();
    const doc = el.ownerDocument;
    const box = span(doc, 'mm-date-flip');
    const old = span(doc, 'mm-date-flip__old', from || text);
    const neu = span(doc, 'mm-date-flip__new', text);
    const strike = span(doc, 'mm-date-flip__strike');
    old.append(strike);
    box.append(old, neu);
    el.textContent = '';
    el.append(box);
    const s = from ? ctx.ease('move', clamp01((q - STRIKE[0]) / (STRIKE[1] - STRIKE[0]))) : 0;
    strike.style.scale = `${s.toFixed(4)} 1`;
    const f = ctx.ease('move', clamp01((q - FLIP[0]) / (FLIP[1] - FLIP[0])));
    old.style.rotate = `x ${(-90 * clamp01(f * 2)).toFixed(3)}deg`;
    old.style.opacity = from ? (f >= 0.5 ? '0' : '') : '0';
    neu.style.rotate = `x ${(90 * (1 - clamp01(f * 2 - 1))).toFixed(3)}deg`;
    neu.style.opacity = f > 0.5 ? '' : '0';
  },
};
