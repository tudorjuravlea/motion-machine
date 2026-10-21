// transitions/light-leak: a warm accent glow drifts across the frame and peaks as the scenes
// swap. The glow is a pseudo-element on each section (pattern.css) driven by two custom
// properties written here. It never shortens or stretches time: p runs through the transition
// untouched and the swap beneath is an ordinary dissolve.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['opacity', '--mm-tx-leak-o', '--mm-tx-leak-x'];

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'light-leak',
  group: 'transitions',
  dur: 'slow',
  params: {},
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const q = clamp01(p);
    const x = `${r3(-10 + q * 120)}%`; // the glow's centre drifts from just off the left edge to just off the right
    to.style.opacity = r3(smooth(0.3, 0.7, q));
    if (q > 0) {
      to.style.setProperty('--mm-tx-leak-x', x);
      to.style.setProperty('--mm-tx-leak-o', r3(1 - smooth(0.5, 1, q)));
      if (from) {
        from.style.setProperty('--mm-tx-leak-x', x);
        from.style.setProperty('--mm-tx-leak-o', r3(smooth(0, 0.5, q)));
      }
    }
  },
};
