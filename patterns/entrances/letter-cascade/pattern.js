// entrances/letter-cascade: every letter drops in from above in a quick ripple. The ripple is the
// whole cascade: eachS per letter, capped by capS and by 60 % of the entrance, so a long line
// ripples faster rather than longer (W-STAGGER). Words stay whole: each is a no-wrap unit. Letters
// ease on the type spring. Writes translate and opacity on spans it creates, and opacity on a slot that paints its own box (it fades with the first letter).
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
  d: { type: 'number', default: 36, meaning: 'drop per letter in px before the style multiplier' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const ROLE = 'slow';

function clock(ctx, p) {
  if (ctx.u != null && ctx.d > 0) return { u: ctx.u, d: ctx.d };
  const d = ctx.style.motion.durations[ROLE] / 1000;
  return { u: clamp01(p) * d, d };
}

function shape(ctx, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const sp = ctx.spring;
  return sp && sp.settle ? Math.min(1, sp(x * sp.settle('type'), 'type')) : x;
}

function split(el) {
  const found = el.querySelectorAll('[data-mm-c]');
  if (found.length) return [...found];
  const words = (el.textContent || '').split(/\s+/).filter(Boolean);
  el.textContent = '';
  const doc = el.ownerDocument;
  const out = [];
  words.forEach((w, i) => {
    const unit = doc.createElement('span');
    unit.className = 'mm-letter-cascade__word';
    for (const ch of Array.from(w)) {
      const s = doc.createElement('span');
      s.className = 'mm-letter-cascade__c';
      s.setAttribute('data-mm-c', '');
      s.textContent = ch;
      unit.append(s);
      out.push(s);
    }
    if (i) el.append(' ');
    el.append(unit);
  });
  return out;
}

export default {
  name: 'letter-cascade',
  group: 'entrances',
  dur: ROLE,
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const { u, d } = clock(ctx, p);
    // at rest the plain text returns, so the face's own kerning is back between letters
    if (u >= d) { el.textContent = (el.textContent || '').split(/\s+/).filter(Boolean).join(' '); return; }
    const spans = split(el);
    const n = spans.length;
    if (!n) return;
    const { eachS, capS } = ctx.style.motion.stagger;
    const span = Math.min(capS, d * 0.6, (n - 1) * eachS);
    const step = n > 1 ? span / (n - 1) : 0;
    const w = d - span;
    const drop = Number(prm.d) * ctx.style.motion.travel;
    spans.forEach((s, i) => {
      const k = shape(ctx, clamp01((u - i * step) / w));
      s.style.opacity = k >= 1 ? '' : String(clamp01(k));
      s.style.translate = k >= 1 ? 'none' : `0 ${(-(1 - k) * drop).toFixed(3)}px`;
    });
    if (painted(el)) { const k0 = shape(ctx, clamp01(u / w)); el.style.opacity = k0 >= 1 ? '' : String(clamp01(k0)); }
  },
};
