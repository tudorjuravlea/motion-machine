// emphasis/lens: focus through glass. The element's sibling slots (the other items of its list or
// grid) soften and dim while the element itself grows a little, stays sharp and gets a thin lens
// rim around its text, holds, then everything clears. Writes filter and opacity on the siblings,
// scale and a rim span on the element; at p = 0 and p = 1 it writes nothing.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const IN = 0.25, OUT = 0.8;
const smooth = (x) => x * x * (3 - 2 * x);

const params = {
  blur: { type: 'number', default: 0.06, meaning: 'how soft the siblings get, in em, 0.02 to 0.12' },
  zoom: { type: 'number', default: 0.06, meaning: 'how much the element grows under the lens, 0 to 0.1' },
};

export default {
  name: 'lens',
  group: 'emphasis',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    // phases run on the beat's own clock (the kit eases p for emphasis; the phases set their own easing)
    const q = ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    if (q <= 0 || q >= 1 || p <= 0 || p >= 1) return;
    const k = smooth(q < IN ? q / IN : q > OUT ? (1 - q) / (1 - OUT) : 1);
    if (k <= 1e-4) return;
    const blur = Math.min(0.12, Math.max(0.02, Number(ctx.params?.blur ?? 0.06)));
    const zoom = Math.min(0.1, Math.max(0, Number(ctx.params?.zoom ?? 0.06)));
    for (const sib of el.parentElement?.querySelectorAll(':scope > [data-slot]:not([data-empty])') ?? []) {
      if (sib === el) continue;
      sib.style.filter = `blur(${(blur * k).toFixed(4)}em)`;
      const own = sib.style.opacity === '' ? 1 : Number(sib.style.opacity);   // a sibling mid-entrance keeps its own fade
      sib.style.opacity = (own * (1 - 0.45 * k)).toFixed(4);
    }
    const cs = getComputedStyle(el), side = `${cs.textAlign} ${cs.justifyContent}`;
    el.style.transformOrigin = /left|start/.test(side) && !/center/.test(cs.textAlign) ? 'left center' : /right|end/.test(side) ? 'right center' : 'center';
    el.style.scale = (1 + zoom * k).toFixed(5);
    const w = el.offsetWidth;
    if (!w) return;
    const box = el.getBoundingClientRect(), s = box.width / w || 1;
    const range = el.ownerDocument.createRange(); range.selectNodeContents(el);
    const rs = [...range.getClientRects()].filter((r) => r.width > 0);
    if (!rs.length) return;
    const L = (Math.min(...rs.map((r) => r.left)) - box.left) / s, R = (Math.max(...rs.map((r) => r.right)) - box.left) / s;
    const T = (Math.min(...rs.map((r) => r.top)) - box.top) / s, B = (Math.max(...rs.map((r) => r.bottom)) - box.top) / s;
    const pad = (B - T) * 0.35;
    const rim = el.ownerDocument.createElement('span');
    rim.className = 'mm-lens';
    rim.setAttribute('aria-hidden', 'true');
    rim.style.cssText = `left:${(L - pad).toFixed(2)}px;top:${(T - pad * 0.6).toFixed(2)}px;width:${(R - L + 2 * pad).toFixed(2)}px;height:${(B - T + 1.2 * pad).toFixed(2)}px;opacity:${k.toFixed(4)}`;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.isolation = 'isolate';   // the rim sits behind the words but over the scene, not under it
    el.prepend(rim);
  },
};
