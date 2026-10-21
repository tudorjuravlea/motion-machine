// odometer: a figure as clipped digit strips that roll to the value. Each column is a window one
// line tall over a strip of 0-9 and a closing 0; the strip offset is a pure function of p. Higher
// columns turn only as the column below them passes 9, as on a mechanical counter. p is clamped
// at 1 so a spring's overshoot never shows a number the fact does not carry.
const SIZES = ['display', 'h1', 'h2', 'body', 'caption'];
const LINE = 1.2;                      // strip pitch in em; the stylesheet uses the same figure
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };

function node(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

const PARAMS = {
  from: { type: 'number', default: 0, meaning: 'the figure the strips start from' },
  fix: { type: 'number', default: 0, meaning: 'decimal places shown' },
  pad: { type: 'number', default: 0, meaning: 'minimum integer digits, zero-filled' },
  prefix: { type: 'string', default: '', meaning: 'text before the figure' },
  suffix: { type: 'string', default: '', meaning: 'text after the figure' },
  size: { type: 'enum(display|h1|h2|body|caption)', default: 'h1', meaning: 'the style size role of the figure' },
};
const resolve = (ctx) => {
  const o = {};
  for (const [k, v] of Object.entries(PARAMS)) o[k] = v.default;
  return Object.assign(o, ctx && ctx.params);
};

export default {
  name: 'odometer',
  group: 'data',
  dur: 'slow',
  params: PARAMS,
  at(el, p, ctx) {
    const prm = resolve(ctx);
    const get = (k) => prm[k];
    const doc = el.ownerDocument;
    const q = clamp01(p);
    const to = num(el.dataset.value, 0);
    const from = num(get('from'), 0);
    const fix = Math.min(4, Math.max(0, Math.round(num(get('fix'), 0))));
    const pad = Math.max(0, Math.round(num(get('pad'), 0)));
    const size = SIZES.includes(get('size')) ? get('size') : 'h1';
    const k = 10 ** fix;
    const V = Math.round(Math.abs(to) * k), V0 = Math.round(Math.abs(from) * k);
    const cur = V0 + (V - V0) * q;
    const cols = Math.max(String(V).length, String(V0).length, pad + fix, fix + 1);
    const shown = Math.max(String(Math.floor(cur)).length, pad + fix, fix + 1);

    el.classList.add('mm-odometer');
    el.style.fontSize = `var(--mm-size-${size})`;
    el.style.opacity = String(clamp01(q * 8));
    el.replaceChildren();
    const pre = `${to < 0 ? '-' : ''}${get('prefix') ?? ''}`;
    if (pre) el.append(node(doc, 'span', 'mm-odometer__fix', pre));
    for (let i = cols - 1; i >= 0; i--) {
      if (fix > 0 && i === fix - 1) el.append(node(doc, 'span', 'mm-odometer__point', '.'));
      const v = cur / 10 ** i;
      const fr = v - Math.floor(v);
      const roll = i === 0 ? fr : Math.max(0, (fr - 0.9) * 10);
      const off = (Math.floor(v) % 10) + roll;
      const col = node(doc, 'span', 'mm-odometer__col');
      const strip = node(doc, 'span', 'mm-odometer__strip');
      for (let d = 0; d <= 10; d++) {
        const dig = node(doc, 'span', 'mm-odometer__digit', String(d % 10));
        if (Math.abs(d - off) >= 1) dig.style.visibility = 'hidden';   // wholly outside the window: the gate sees what the viewer sees
        strip.append(dig);
      }
      strip.style.translate = `0 ${(-off * LINE).toFixed(4)}em`;
      col.style.opacity = i >= shown ? '0' : '1';
      col.append(strip);
      el.append(col);
    }
    const post = get('suffix') ?? '';
    if (post) el.append(node(doc, 'span', 'mm-odometer__fix', post));
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `${pre}${(Math.abs(to)).toFixed(fix).padStart(pad + (fix ? fix + 1 : 0), '0')}${post}`);
  },
};
