// transitions/anticipation: a wind-up, then the push through. The first part of the cut is a brief pull
// back (the outgoing scene gives a little ground, the way a body crouches before a jump); the rest is
// the push that carries the film into the next scene. Two mechanisms, one pattern:
//   zoom   the outgoing scene shrinks a little, then dives toward the camera and dissolves to nothing;
//          the incoming scene then grows from small to rest. Two halves that never share a frame,
//          like transitions/zoom-through, so no type is ever printed over a scaled ghost.
//   slide  the outgoing scene gives a little ground against the way it will go, then both scenes travel
//          edge to edge, the incoming one right behind, and rest. They never overlap.
// Every part is a function of the cut's linear time; nothing is carried between frames.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clamp01 = (x) => clamp(x, 0, 1);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
const OWN = ['transform', 'opacity', 'visibility', 'background-color'];
const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

const params = {
  mode: { type: 'enum(zoom|slide)', default: 'zoom', meaning: 'the push: zoom dives through the outgoing scene into the incoming one; slide carries both scenes edge to edge' },
  direction: { type: 'enum(left|right|up|down)', default: 'left', meaning: 'slide only: where the content travels, left carries the outgoing scene off to the left (and the wind-up pulls it right)' },
  pull: { type: 'number', default: 0.06, meaning: 'how far the wind-up gives ground, as a share of the scene: zoom shrinks it by that much, slide moves it that share of the frame; 0 to 0.15' },
  depth: { type: 'number', default: 0.6, meaning: 'zoom only: how far the camera dives: 0.6 grows the outgoing scene to 1.6 times its size' },
  windup: { type: 'number', default: 0.25, meaning: 'the share of the cut the wind-up takes, 0.1 to 0.5' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

/**
 * Each scene's state at linear progress q (0 to 1) through the cut: `shows` names the scene drawn
 * (zoom: one at a time; slide: both), `from` and `to` are { scale, x, y (% of the section), opacity,
 * hidden, clearFill }. `ease(name, p)` is the kit's.
 */
export function frameAt(q, prm, ease) {
  q = clamp01(q);
  const w = clamp(num(prm.windup, DEFAULTS.windup), 0.1, 0.5);
  const pull = clamp(num(prm.pull, DEFAULTS.pull), 0, 0.15);
  const out = (o) => ({ scale: 1, x: 0, y: 0, opacity: 1, hidden: false, clearFill: false, ...o });
  if (prm.mode === 'slide') {
    const [vx, vy] = VEC[prm.direction] ?? VEC.left;
    const along = q < w ? -pull * ease('enter', q / w) : -pull + (1 + pull) * ease('move', (q - w) / (1 - w));
    const x = along * vx * 100 + 0, y = along * vy * 100 + 0;
    return { shows: q < 1 ? 'from' : 'to', from: out({ x, y }), to: out({ x: x - vx * 100 + 0, y: y - vy * 100 + 0 }) };
  }
  const depth = Math.max(0, num(prm.depth, DEFAULTS.depth));
  const swap = w + (1 - w) / 2;
  if (q < w) return { shows: 'from', from: out({ scale: 1 - pull * ease('enter', q / w) }), to: out({ hidden: true }) };
  if (q < swap) {
    const b = (q - w) / (swap - w);
    const fade = 1 - smooth(0.35, 1, b);
    return { shows: 'from', from: out({ scale: 1 - pull + (1 + depth - (1 - pull)) * ease('exit', b), opacity: fade, clearFill: fade < 0.98 }), to: out({ hidden: true }) };
  }
  const c = (q - swap) / (1 - swap);
  const op = smooth(0, 0.7, c);
  return { shows: 'to', from: out({ hidden: true }), to: out({ scale: 1 / (1 + depth * 0.5 * (1 - ease('enter', c))), opacity: op, clearFill: op < 0.98 }) };
}

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

function write(el, s) {
  if (!el) return;
  if (s.hidden) { el.style.opacity = '0'; el.style.visibility = 'hidden'; return; }
  if (s.scale !== 1 || s.x || s.y) el.style.transform = `translate(${r3(s.x)}%, ${r3(s.y)}%) scale(${r3(s.scale)})`;
  if (s.opacity < 1) el.style.opacity = r3(s.opacity);
  if (s.clearFill) el.style.backgroundColor = 'transparent';   // the stage behind is the same canvas: a part-opaque section never composites a canvas on a canvas
}

export default {
  name: 'anticipation',
  group: 'transitions',
  dur: 'slow',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const d = Number(ctx.d) > 0 ? Number(ctx.d) : 1;
    const q = Number.isFinite(ctx.u) ? ctx.u / d : p;
    const f = frameAt(q, { ...DEFAULTS, ...ctx.params }, ctx.ease ?? ((n, x) => x));
    write(from, f.from);
    write(to, f.to);
  },
};
