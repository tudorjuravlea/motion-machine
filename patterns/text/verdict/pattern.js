// text/verdict: two (or more) names show, hold for a beat, and then a stamp lands on one of them
// while the others dim. The stamp is emphasis/stamp's own: its look is its stylesheet (imported by
// this pattern's CSS and keyed on data-emphasis, which is set on the winner only from the landing)
// and its slam, wobble, flash and jolt are its module's `at`, called on the winner's name with the
// time since the landing. The beat's text is the names ("a|b"); the pattern builds the figure on
// every seek and draws it from the entrance's linear progress, so the stamped name and the dimmed
// others are what the slot shows at rest: it is the beat's `fx`.
import stamp from '../../emphasis/stamp/pattern.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r4 = (x) => String(Math.round(x * 10000) / 10000);
const ARRIVE = 0.15, DIM = 0.4, STAMP_S = 0.7;   // the names arrive over the first 15 %; the others dim over 40 % of what is left after the landing; the stamp's own window in seconds

const params = {
  winner: { type: 'number', default: 1, meaning: 'which name the stamp lands on, counting from 1 in the order of the beat\'s text' },
  land: { type: 'number', default: 0.55, meaning: 'where in the entrance the stamp lands, as a share of it (0.3 to 0.9): the held beat before it is the share before' },
  personality: { type: 'enum(slam|press)', default: 'slam', meaning: 'the stamp\'s landing: slam (down from large with a wobble) or press (a quiet set-down); see emphasis/stamp' },
  tone: { type: 'enum(accent|ink)', default: 'accent', meaning: 'the palette role of the stamp\'s ink (word, rules and pits)' },
  tilt: { type: 'enum(left|right|none)', default: 'left', meaning: 'the plate turns 7° anticlockwise, clockwise or not at all; the word stays level' },
  size: { type: 'enum(h1|h2)', default: 'h2', meaning: 'the size role of the names' },
  flash: { type: 'number', default: 0.35, meaning: 'strength of the flash at the landing, 0 to 0.5, in the lightest palette role' },
  shake: { type: 'number', default: 6, meaning: 'how far the scene\'s other slots jolt at the landing, in px; 0 for none' },
  sep: { type: 'string', default: '|', meaning: 'what separates the names in the beat\'s text' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const num = (v, d, lo, hi) => { const n = Number(v); return Math.min(hi, Math.max(lo, Number.isFinite(n) && v !== '' && v != null ? n : d)); };

/** The names of a beat's text: trimmed, empty ones dropped. */
export function namesOf(text, sep = '|') {
  return String(text ?? '').split(sep || '|').map((s) => s.trim()).filter(Boolean);
}

/** The figure's progress at linear time q: `arrive` (the names), `since` (progress through the stamp's window, negative before the landing) and `dim` (how far the others have dimmed). Pure. */
export function progressAt(q, land) {
  const l = num(land, DEFAULTS.land, 0.3, 0.9);
  return { arrive: clamp01(q / ARRIVE), since: q - l, dim: clamp01((q - l) / ((1 - l) * DIM)) };
}

export default {
  name: 'verdict',
  group: 'text',
  dur: 'hold',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const names = namesOf(el.textContent, prm.sep);
    if (!names.length) return;
    const q = p >= 1 ? 1 : ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    const land = num(prm.land, DEFAULTS.land, 0.3, 0.9);
    const win = Math.round(num(prm.winner, DEFAULTS.winner, 1, names.length)) - 1;
    const pr = progressAt(q, land);
    const doc = el.ownerDocument;
    const row = doc.createElement('span');
    row.className = 'mm-verdict';
    el.replaceChildren(row);
    const ease = (kind, x) => (ctx.ease ? ctx.ease(kind, x) : x);
    const arrive = ease('enter', pr.arrive);
    const dim = ease('move', pr.dim);
    const stamped = q >= land;
    names.forEach((text, i) => {
      const name = doc.createElement('span');
      name.className = 'mm-verdict__name';
      name.textContent = text;
      name.setAttribute('data-p-size', prm.size === 'h1' ? 'h1' : 'h2');
      if (pr.arrive < 1) { name.style.opacity = r4(arrive); name.style.translate = `0 ${r4((1 - arrive) * 0.2)}em`; }
      row.append(name);
      if (i === win) {
        if (!stamped) return;
        // the stamp's own look (its stylesheet) takes the name from here on; its module plays the landing
        name.setAttribute('data-emphasis', 'emphasis/stamp');
        name.setAttribute('data-p-tone', prm.tone === 'ink' ? 'ink' : 'accent');
        name.setAttribute('data-p-tilt', ['left', 'right', 'none'].includes(prm.tilt) ? prm.tilt : 'left');
        const u = pr.since * (ctx.d > 0 ? ctx.d : STAMP_S);
        if (q < 1 && u < STAMP_S) stamp.at(name, 0.5, { ...ctx, u, d: STAMP_S, params: { personality: prm.personality, flash: prm.flash, shake: prm.shake } });
        return;
      }
      if (dim > 0) name.style.color = dim >= 1 ? 'var(--mm-color-muted)' : `color-mix(in srgb, var(--mm-color-muted) ${r4(dim * 100)}%, var(--mm-color-ink))`;
    });
  },
};
