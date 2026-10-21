// text/kinetic-words: one word or phrase at a time, each replacing the last. The beat text lists
// the phrases separated by `sep`; the entrance is split into equal turns. In a turn the phrase
// rises in, holds, and (except the last) rises out and is gone before the next turn begins, so at
// no instant are two phrases on screen. The last phrase stays: that is the rest. Phrases ease on
// the type spring in and the exit ease out, and never overshoot. Writes translate and opacity on a
// span it creates inside the slot, and opacity on a slot that paints its own box during the first
// phrase's entrance.
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
  sep: { type: 'string', default: '|', meaning: 'what separates the phrases in the beat text' },
  d: { type: 'number', default: 36, meaning: 'rise per phrase in px before the style multiplier' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const ROLE = 'hold';
const IN = 0.4;
const OUT_FROM = 0.72;
const OUT_TO = 0.92;

function linear(ctx, p) {
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

function shape(ctx, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const sp = ctx.spring;
  return sp && sp.settle ? Math.min(1, sp(x * sp.settle('type'), 'type')) : x;
}

export default {
  name: 'kinetic-words',
  group: 'text',
  dur: ROLE,
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const phrases = (el.textContent || '').split(String(prm.sep)).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const n = phrases.length;
    if (!n) return;
    const lin = linear(ctx, p);
    const turn = lin >= 1 ? n - 1 : Math.min(n - 1, Math.floor(lin * n));
    const s = lin >= 1 ? 1 : lin * n - turn;
    const inK = shape(ctx, clamp01(s / IN));
    const last = turn === n - 1;
    const outK = last ? 0 : (ctx.ease ? ctx.ease('exit', clamp01((s - OUT_FROM) / (OUT_TO - OUT_FROM))) : clamp01((s - OUT_FROM) / (OUT_TO - OUT_FROM)));
    const rise = Number(prm.d) * ctx.style.motion.travel;
    const span = el.ownerDocument.createElement('span');
    span.className = 'mm-kinetic-words__phrase';
    span.textContent = phrases[turn];
    el.textContent = '';
    el.append(span);
    if (turn === 0 && painted(el)) el.style.opacity = inK >= 1 ? '' : String(clamp01(inK));
    const o = inK * (1 - outK);
    span.style.opacity = o >= 1 ? '' : String(clamp01(o));
    const y = (1 - inK) * rise - outK * rise;
    span.style.translate = y === 0 ? 'none' : `0 ${y.toFixed(3)}px`;
  },
};
