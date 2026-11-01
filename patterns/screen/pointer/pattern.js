// screen/pointer: the cursor of a recorded session, drawn from the pointer track that sits beside the recording
// (mm capture site --script). Playwright's video has no cursor, so the whole cursor is ours: smoothed once over the
// whole path by a spring (a cursor with weight, not the jitter of a recording), hotspot-anchored so the tip of the
// arrow is on the point, bouncing as it clicks, a touch blurred when it moves fast, hidden where the track hides it.
// It grows with the camera's zoom by a share of your choosing (grow) and the screen clips it. The time is the
// recording's own: the frame screen/play has reached, so it is a function of t.
import { smoothPath, typeAt, clickBounce, bounceScale, blurPx, shapeOf } from '../../../runtime/kit/cursor.js';
import { view } from '../../../runtime/kit/screen.js';

const ROLES = ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'];
const role = (v, d) => (ROLES.includes(v) ? v : d);
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);
// the outline's weight in the art's own units, and how its corners are cut
const LOOKS = { classic: { weight: 1.6, join: 'miter' }, soft: { weight: 2.4, join: 'round' }, solid: { weight: 0, join: 'round' } };
const round = (n, k = 1000) => Math.round(n * k) / k;

export default {
  name: 'pointer',
  group: 'screen',
  dur: 'hold',
  params: {
    size: { type: 'number', default: 0.045, meaning: 'the cursor\'s height as a share of the screen\'s width' },
    smoothing: { type: 'number', default: 0.67, meaning: 'how much weight the cursor has: 0 follows the recording exactly, 1 trails it most (0 to 1)' },
    bounce: { type: 'number', default: 2.5, meaning: 'how far the cursor dips and rebounds as it clicks (0 to 5)' },
    blur: { type: 'number', default: 0.35, meaning: 'motion blur along the cursor\'s own speed (0 to 1)' },
    grow: { type: 'number', default: 0.6, meaning: 'how much of the camera\'s zoom the cursor takes: 0 stays one size, 1 grows with the recording' },
    look: { type: 'enum(classic|soft|solid)', default: 'classic', meaning: 'classic: an outline with sharp corners; soft: a heavier outline with round corners; solid: no outline' },
    fill: { type: 'enum(canvas|ink|muted|surface|line|accent|accentInk)', default: 'ink', meaning: 'the palette role the cursor is filled with' },
    outline: { type: 'enum(canvas|ink|muted|surface|line|accent|accentInk)', default: 'canvas', meaning: 'the palette role of its outline' },
  },
  reduce(state) { return state; },
  draw(el, p, ctx) {
    const track = ctx.state.content.meta?.track;
    if (!track) return;
    let svg = el.querySelector(':scope > .pointer');
    if (!svg) { el.insertAdjacentHTML('beforeend', '<svg class="pointer" aria-hidden="true"><path></path></svg>'); svg = el.lastElementChild; }
    const prm = ctx.params, t = ctx.state.frameTime * 1000;
    const pos = smoothPath(track, num(prm.smoothing, 0.67)).at(t);
    if (!pos) { svg.style.display = 'none'; return; }
    const { x, y } = ctx.at(`${(pos.cx * 100).toFixed(4)}%,${(pos.cy * 100).toFixed(4)}%`);
    const zoom = view(ctx.state.zoom).s, box = ctx.box;
    const shape = shapeOf(typeAt(track, t));
    const px = box.w * num(prm.size, 0.045) * (1 + (zoom - 1) * Math.min(1, Math.max(0, num(prm.grow, 0.6))));
    const k = px / shape.h;
    const look = LOOKS[prm.look] ?? LOOKS.classic;
    const path = svg.firstElementChild;
    svg.style.display = '';
    svg.setAttribute('viewBox', `0 0 ${shape.w} ${shape.h}`);
    svg.style.width = `${round(shape.w * k, 100)}px`;
    svg.style.height = `${round(px, 100)}px`;
    svg.style.left = `${round(x * box.w - shape.hot[0] * k, 100)}px`;
    svg.style.top = `${round(y * box.h - shape.hot[1] * k, 100)}px`;
    svg.style.transformOrigin = `${round(shape.hot[0] * k, 100)}px ${round(shape.hot[1] * k, 100)}px`;
    svg.style.transform = `scale(${round(bounceScale(clickBounce(track, t), num(prm.bounce, 2.5)))})`;
    // the cursor's speed on the screen: the path's, in surface fractions a second, times the screen's size and the camera's zoom
    const speed = Math.hypot(pos.vx * box.w, pos.vy * box.h) * zoom;
    const b = blurPx(speed, num(prm.blur, 0.35));
    svg.style.filter = b > 0.05 ? `blur(${round(b, 100)}px)` : 'none';
    path.setAttribute('d', shape.d);
    path.style.fill = `var(--mm-color-${role(prm.fill, 'ink')})`;
    path.style.stroke = look.weight ? `var(--mm-color-${role(prm.outline, 'canvas')})` : 'none';
    path.style.strokeWidth = String(look.weight);
    path.style.strokeLinejoin = look.join;
    path.style.paintOrder = 'stroke';
  },
};
