// transitions/iris: the incoming scene opens through a growing circle or diamond (clip-path), from
// the centre of the frame or from the box of a slot it names (`target`); the outgoing scene stays
// whole underneath.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['clip-path'];

const params = {
  shape: { type: 'enum(circle|diamond)', default: 'circle', meaning: 'the aperture: a circle or a diamond (a square turned 45 degrees)' },
  target: { type: 'string', default: '', meaning: 'a slot of the incoming scene to open from (its box centre); empty opens from the frame centre' },
};

// Width and height as a ratio, read from the format name ('16x9' -> 16 and 9).
function aspect(format) {
  const m = /^(\d+)x(\d+)$/.exec(String(format));
  return m ? [Number(m[1]), Number(m[2])] : [16, 9];
}

// The centre of a slot of the section, in the section's layout pixels (the stage may be drawn
// scaled, so client boxes are divided by the section's own scale). Null when the slot is missing
// or has no box.
function targetOf(section, name) {
  if (!name || !section?.querySelector) return null;
  const slot = section.querySelector(`[data-slot="${name}"]`);
  const r = slot?.getBoundingClientRect?.(), s = section.getBoundingClientRect?.();
  const W = section.offsetWidth, H = section.offsetHeight;
  if (!r || !s || !r.width || !r.height || !s.width || !s.height || !W || !H) return null;
  const k = W / s.width, j = H / s.height;
  return { W, H, x: (r.left - s.left + r.width / 2) * k, y: (r.top - s.top + r.height / 2) * j };
}

// A slot name that matches no slot of the scene is a note for the story author in mm.warnings, once.
function checkSlot(section, name, key, fallback) {
  if (!name || !section?.querySelector || section.querySelector(`[data-slot="${name}"]`)) return;
  const w = section.ownerDocument?.defaultView?.mm?.warnings;
  const msg = `transitions/iris: ${key} "${name}" is not a slot of scene ${section.getAttribute?.('data-scene') ?? '?'}; ${fallback}`;
  if (Array.isArray(w) && !w.includes(msg)) w.push(msg);
}

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'iris',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    clear(ctx.from); clear(to);
    if (p >= 1) return;
    const q = clamp01(p);
    const diamond = (ctx.params?.shape ?? params.shape.default) === 'diamond';
    const target = ctx.params?.target ?? params.target.default;
    checkSlot(to, target, 'target', 'the iris opens from the frame centre');
    const c = targetOf(to, target);
    if (c) {
      // From the slot's centre: the aperture grows to the farthest frame corner by p = 1.
      const corners = [[0, 0], [c.W, 0], [0, c.H], [c.W, c.H]].map(([x, y]) => [x - c.x, y - c.y]);
      const px = (v) => `${r3(v)}px`;
      if (diamond) {
        const d = q * Math.max(...corners.map(([dx, dy]) => Math.abs(dx) + Math.abs(dy)));
        to.style.clipPath = `polygon(${px(c.x)} ${px(c.y - d)}, ${px(c.x + d)} ${px(c.y)}, ${px(c.x)} ${px(c.y + d)}, ${px(c.x - d)} ${px(c.y)})`;
      } else {
        to.style.clipPath = `circle(${px(q * Math.max(...corners.map(([dx, dy]) => Math.hypot(dx, dy))))} at ${px(c.x)} ${px(c.y)})`;
      }
      return;
    }
    if (diamond) {
      // The diamond must reach the corner: |dx| + |dy| = (w + h) / 2 there.
      const [w, h] = aspect(ctx.format);
      const rx = (q * (w + h)) / (2 * w) * 100, ry = (q * (w + h)) / (2 * h) * 100;
      to.style.clipPath = `polygon(50% ${r3(50 - ry)}%, ${r3(50 + rx)}% 50%, 50% ${r3(50 + ry)}%, ${r3(50 - rx)}% 50%)`;
    } else {
      // circle() percentages read against sqrt((w^2 + h^2) / 2); the corner is 1 / sqrt(2) of that away.
      to.style.clipPath = `circle(${r3(q * Math.SQRT1_2 * 100)}% at 50% 50%)`;
    }
  },
};
