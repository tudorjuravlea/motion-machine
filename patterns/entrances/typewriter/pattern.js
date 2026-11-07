// entrances/typewriter: characters appear one by one at a steady rate, with a caret at the typing
// position. The caret is a function of p (shown while typing, optionally blinking by p), never a
// timer, and it is gone at rest. The untyped rest of the text stays in the flow, hidden, so the
// line breaks never move. Writes markup inside the slot, which a seek restores, and opacity on a slot that paints its own
// box (it fades in over the first character).
import { graphemesOf } from '../../../runtime/kit/split.js';
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// A slot that paints its own box (a fill or a border) fades with its first piece, so the box never
// shows empty while its text is still to come. A plain text slot is left alone.
const painted = (el) => {
  if (typeof getComputedStyle !== 'function') return false;
  const cs = getComputedStyle(el);
  const fill = cs.backgroundColor !== 'transparent' && !/,\s*0\)$/.test(cs.backgroundColor);
  return fill || ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
};

const params = {
  caret: { type: 'boolean', default: true, meaning: 'show the caret while typing' },
  blinks: { type: 'number', default: 0, meaning: 'caret blinks across the whole entrance; 0 keeps it solid' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

function linear(ctx, p) {
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

export default {
  name: 'typewriter',
  group: 'entrances',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const lin = linear(ctx, p);
    if (lin >= 1) { el.textContent = text; return; }
    const chars = graphemesOf(text);
    const shown = Math.floor(lin * chars.length);
    if (painted(el)) el.style.opacity = String(clamp01(lin * chars.length));
    const doc = el.ownerDocument;
    const typed = doc.createElement('span');
    typed.textContent = chars.slice(0, shown).join('');
    const rest = doc.createElement('span');
    rest.className = 'mm-typewriter__rest';
    rest.textContent = chars.slice(shown).join('');
    el.textContent = '';
    el.append(typed);
    const blinks = Number(prm.blinks);
    const on = !(blinks > 0) || Math.floor(lin * 2 * blinks) % 2 === 0;
    if (prm.caret !== false && prm.caret !== 'false' && on) {
      const caret = doc.createElement('span');
      caret.className = 'mm-typewriter__caret';
      el.append(caret);
    }
    el.append(rest);
  },
};
