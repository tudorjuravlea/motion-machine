// transitions/shared-element: an element that carries the same key in both scenes travels from its
// box in the outgoing scene to its box in the incoming one. FLIP geometry: both boxes are read
// with the pattern's own transforms cleared (the state at p = 0), then each copy is displaced
// by the remaining fraction of the journey, so the result is a function of p alone.
// The key is `data-shared="key"` in markup; a beat reaches it as `params: { shared: "key" }`, which
// the kit writes as `data-p-shared`. Only beat slots count: the kit restores their inline style.
// Everything else cross-dissolves: the incoming section fades in over the outgoing one.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['transform'];

const params = {
  fit: { type: 'enum(width|stretch)', default: 'width', meaning: 'width scales both axes by the width ratio so type keeps its shape; stretch fills the target box exactly' },
};

const SELECTOR = '[data-slot][data-shared], [data-slot][data-p-shared]';
const keyOf = (el) => el.getAttribute('data-shared') ?? el.getAttribute('data-p-shared');

function collect(section) {
  const found = new Map();
  if (!section) return found;
  for (const el of section.querySelectorAll(SELECTOR)) {
    const key = keyOf(el);
    if (key && !found.has(key)) found.set(key, el);
  }
  return found;
}

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'shared-element',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    const before = collect(from), after = collect(to);
    for (const el of [...before.values(), ...after.values()]) clear(el);
    to.style.removeProperty('opacity');
    if (p >= 1) { if (!to.getAttribute('style')) to.removeAttribute('style'); return; }
    const stretch = (ctx.params?.fit ?? params.fit.default) === 'stretch';
    const q = clamp01(p);
    // Read every box first, then write: reading never sees this call's own transforms.
    const pairs = [];
    for (const [key, b] of after) {
      const a = before.get(key);
      if (!a) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      if (!ra.width || !ra.height || !rb.width || !rb.height) continue;
      const sx = rb.width / ra.width;
      const sy = stretch ? rb.height / ra.height : sx;
      pairs.push({
        a, b, sx, sy,
        dx: rb.left + rb.width / 2 - (ra.left + ra.width / 2),
        dy: rb.top + rb.height / 2 - (ra.top + ra.height / 2),
      });
    }
    for (const { a, b, sx, sy, dx, dy } of pairs) {
      a.style.transform = `translate(${r3(dx * q)}px, ${r3(dy * q)}px) scale(${r3(1 + (sx - 1) * q)}, ${r3(1 + (sy - 1) * q)})`;
      b.style.transform = `translate(${r3(-dx * (1 - q))}px, ${r3(-dy * (1 - q))}px) scale(${r3(1 / sx + (1 - 1 / sx) * q)}, ${r3(1 / sy + (1 - 1 / sy) * q)})`;
    }
    to.style.opacity = r3(q);
  },
};
