// emphasis/brackets: four corner brackets snap in around the element from slightly outside, then
// the element lifts a little toward the viewer, holds, and everything settles back. The brackets
// frame the laid-out text, not the slot's column. Writes four spans inside the slot, scale and
// position: relative on a static slot; at p = 0 and p = 1 it writes nothing.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const SNAP = 0.22, LIFT = [0.22, 0.45], BACK = 0.8;

const params = {
  lift: { type: 'number', default: 0.04, meaning: 'how much the element grows while framed, 0 to 0.08' },
};

export default {
  name: 'brackets',
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
    const h = B - T, pad = h * 0.18, arm = Math.min(h * 0.45, (R - L) * 0.25);
    const snap = ctx.ease('move', clamp01(q / SNAP));
    const away = q > BACK ? (q - BACK) / (1 - BACK) : 0;
    const off = pad * (1 - snap) * 1.6 + pad * away;     // the brackets close in, then open away
    const alpha = Math.min(snap * 1.5, 1) * (1 - away);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const corners = [['tl', L - pad - off, T - pad - off], ['tr', R + pad + off - arm, T - pad - off], ['bl', L - pad - off, B + pad + off - arm], ['br', R + pad + off - arm, B + pad + off - arm]];
    for (const [c, x, y] of corners) {
      const s = el.ownerDocument.createElement('span');
      s.className = `mm-brackets mm-brackets--${c}`;
      s.setAttribute('aria-hidden', 'true');
      s.style.cssText = `left:${x.toFixed(2)}px;top:${y.toFixed(2)}px;width:${arm.toFixed(2)}px;height:${arm.toFixed(2)}px;opacity:${alpha.toFixed(4)}`;
      el.append(s);
    }
    const lift = Math.min(0.08, Math.max(0, Number(ctx.params?.lift ?? 0.04)));
    const up = ctx.ease('move', clamp01((q - LIFT[0]) / (LIFT[1] - LIFT[0]))) * (1 - ctx.ease('move', away));
    if (up > 1e-4) el.style.scale = (1 + lift * up).toFixed(5);
  },
};
