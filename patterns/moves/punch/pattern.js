// moves/punch: jump cuts in footage read as edits when the framing jumps with them. On every other
// footage clip of the scene (the second, the fourth, …) the footage is scaled about an anchor, the
// speaker's eye line, so the anchor stays exactly where it was and everything else moves out from
// it. The scale is one step held for the whole clip, never animated, and only the footage
// (`[data-footage]`, layouts/talking-full) moves: the camera, the plates and their text stay put.
// The anchor is a point of the recording, not of the picture's box: the footage covers its box
// (object-fit: cover, centred), so the point is mapped through that fit to px of the box, and it
// holds whatever the recording's shape and the frame's shape are.
// Each scene starts the alternation again (a section scene resets it). Reads ctx.footage (the
// kit's footage clock); without footage, or in a deck, it writes nothing. Runs on .mm-camera.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const r2 = (x) => Math.round(x * 100) / 100;
// the recording's point (ax, ay), shares of its width and height, in px of the element's layout box;
// percent of the box when the recording's size or the box is unknown (then the two agree only for a
// recording of the box's shape)
function originOf(el, f, ax, ay) {
  const W = el.offsetWidth, H = el.offsetHeight, w = f.w, h = f.h;
  if (!(W > 0 && H > 0 && w > 0 && h > 0)) return `${ax * 100}% ${ay * 100}%`;
  const k = Math.max(W / w, H / h);
  return `${r2((W - w * k) / 2 + ax * w * k)}px ${r2((H - h * k) / 2 + ay * h * k)}px`;
}

const MOVE = {
  name: 'punch',
  group: 'moves',
  params: {
    scale: { type: 'number', default: 1.15, meaning: 'the punched clip\'s scale, clamped to 1.05 to 1.3' },
    x: { type: 'number', default: 50, meaning: 'the anchor across the recording, in percent of its width (the eye line), wherever the frame crops it' },
    y: { type: 'number', default: 35, meaning: 'the anchor down the recording, in percent of its height (the eye line), wherever the frame crops it' },
  },
  at(camera, p, ctx) {
    const f = ctx?.footage;
    if (!f || !(ctx.u >= 0)) return;
    const prm = { scale: MOVE.params.scale.default, x: MOVE.params.x.default, y: MOVE.params.y.default, ...ctx.params };
    // the clip on the scene's first frame: a scene that starts a hair before a cut opens on the clip after it
    const first = f.clipAt(f.t - ctx.u + 0.5 / f.fps);
    const on = (f.clip - first) % 2 === 1;
    const s = clamp(Number(prm.scale), 1.05, 1.3), ax = clamp(Number(prm.x), 0, 100) / 100, ay = clamp(Number(prm.y), 0, 100) / 100;
    for (const el of camera.querySelectorAll('[data-footage]')) {
      el.style.transformOrigin = on ? originOf(el, f, ax, ay) : '';
      el.style.transform = on ? `scale(${s})` : '';
    }
  },
};
export default MOVE;
