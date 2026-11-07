// emphasis/stretch-pill: a pill slides in behind the element, its leading edge running ahead and its
// trailing edge catching up, so it stretches as it travels; it holds behind the words while the eye
// lands, then stretches away to the far side. The pill wraps the laid-out text, not the slot's
// column. Writes a span inside the slot (and position: relative on a static slot); at p = 0 and
// p = 1 it writes nothing.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const IN = 0.35, OUT = 0.72;
const out3 = (x) => 1 - (1 - x) ** 3;

const params = {
  strength: { type: 'number', default: 0.28, meaning: 'accent mixed into the pill, 0.15 to 1' },
};

export default {
  name: 'stretch-pill',
  group: 'emphasis',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    // phases run on the beat's own clock (the kit eases p for emphasis; the phases set their own easing)
    const q = ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    if (q <= 0 || q >= 1 || p <= 0 || p >= 1) return;
    const w = el.offsetWidth;
    if (!w) return;
    const box = el.getBoundingClientRect(), k = box.width / w || 1;
    const range = el.ownerDocument.createRange(); range.selectNodeContents(el);
    const rs = [...range.getClientRects()].filter((r) => r.width > 0);
    if (!rs.length) return;
    const L = (Math.min(...rs.map((r) => r.left)) - box.left) / k, R = (Math.max(...rs.map((r) => r.right)) - box.left) / k;
    const T = (Math.min(...rs.map((r) => r.top)) - box.top) / k, B = (Math.max(...rs.map((r) => r.bottom)) - box.top) / k;
    const W = R - L;
    // edges as fractions of the text's width: the leading edge eases fast, the trailing edge late
    let a, b;
    if (q < IN) { const u = q / IN; b = 0.12 + 0.88 * out3(u); a = 0.1 * (1 - out3(u ** 0.6)); }
    else if (q <= OUT) { a = 0; b = 1; }
    else { const v = (q - OUT) / (1 - OUT); b = 1 + 0.06 * out3(v); a = 0.94 * out3(v ** 1.8); }   // stays within the text's span (+ pad)
    const pill = el.ownerDocument.createElement('span');
    pill.className = 'mm-stretch-pill';
    pill.setAttribute('aria-hidden', 'true');
    const padX = (B - T) * 0.32, padY = (B - T) * 0.08;
    pill.style.left = `${(L + a * W - padX).toFixed(2)}px`;
    pill.style.width = `${Math.max(0, (b - a) * W + 2 * padX).toFixed(2)}px`;
    pill.style.top = `${(T - padY).toFixed(2)}px`;
    pill.style.height = `${(B - T + 2 * padY).toFixed(2)}px`;
    pill.style.setProperty('--mm-pill-strength', `${(Math.min(1, Math.max(0.15, Number(ctx.params?.strength ?? 0.28))) * 100).toFixed(1)}%`);
    if (q > 0.9) pill.style.opacity = ((1 - q) / 0.1).toFixed(4);
    else if (q < 0.06) pill.style.opacity = (q / 0.06).toFixed(4);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.isolation = 'isolate';   // the pill sits behind the words but over the scene, not under it
    el.prepend(pill);
  },
};
