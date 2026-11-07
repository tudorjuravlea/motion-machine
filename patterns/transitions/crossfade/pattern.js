// transitions/crossfade: the scenes dissolve by opacity alone. Under a velocity-matched policy (or
// when a scene carries no text) the incoming scene fades in over the outgoing one, which stays whole
// underneath, so nothing dips. Otherwise, with text in both scenes, the outgoing scene is cleared
// first and the incoming one fades in after it, so two lines are never on screen in the same place
//. Opacity goes on whole sections, so a box with a fill fades with its text.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['opacity'];
const OUT_END = 0.45;   // the outgoing text is gone by here
const IN_START = 0.55;  // the incoming text starts after the gap

const hasText = (el) => !!el && /\S/.test(el.textContent || '');

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'crossfade',
  group: 'transitions',
  dur: 'standard',
  params: {},
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const q = clamp01(p);
    if (ctx.policy !== 'velocity-matched' && hasText(from) && hasText(to)) {
      from.style.opacity = r3(1 - smooth(0, OUT_END, q));
      to.style.opacity = r3(smooth(IN_START, 1, q));
      return;
    }
    to.style.opacity = r3(q);
  },
};
/* crossfade: writes opacity on the sections only. No styles of its own. */
