// transitions/zoom-through: the camera dives through the outgoing scene into the incoming one, in two
// halves that never share a frame: the outgoing section grows and dissolves to nothing by
// the middle of the cut, and only then does the incoming one grow from small to rest and fade in.
// No frame holds two scenes, so no text is ever printed over a scaled ghost. Scenes carry text, so
// nothing here blurs.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['transform', 'opacity', 'visibility', 'background-color'];

const params = {
  depth: { type: 'number', default: 0.8, meaning: 'how far the camera dives: 0.8 grows the outgoing scene to 1.8 times its size' },
};

// The swap: the outgoing scene is gone (opacity 0) at SWAP and the incoming one starts there. The
// section that fades drops its own canvas fill (the stage behind it is the same canvas), so a
// part-opaque section never composites a canvas-on-canvas box a level off.
export const SWAP = 0.5;

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'zoom-through',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const depth = Math.max(0, Number(ctx.params?.depth ?? params.depth.default));
    const q = clamp01(p);
    if (q < SWAP) {
      // first half: only the outgoing scene, growing and dissolving to nothing at the swap
      const a = q / SWAP;
      if (from) {
        from.style.transform = `scale(${r3(1 + depth * a)})`;
        const fade = 1 - smooth(0.2, 1, a);
        from.style.opacity = r3(fade);
        // drop the canvas fill only once the section is visibly fading: dropping it while the scaled
        // section is still opaque makes forward and reverse renders differ by 1/255 (caught by --prove)
        if (fade < 0.98) from.style.backgroundColor = 'transparent';
      }
      to.style.opacity = '0';
      to.style.visibility = 'hidden';
      return;
    }
    // second half: only the incoming scene, growing from small to rest
    const b = (q - SWAP) / (1 - SWAP);
    if (from) { from.style.opacity = '0'; from.style.visibility = 'hidden'; }
    to.style.transform = `scale(${r3(1 / (1 + depth * 0.5 * (1 - b)))})`;
    to.style.opacity = r3(smooth(0, 0.7, b));
    to.style.backgroundColor = 'transparent';
  },
};
