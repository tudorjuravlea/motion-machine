// screen/zoom-to: the camera of a screen. Mode `mark` pushes in on a mark or a percent point until it sits
// at the screen's centre at scale `s`, from wherever the screen's zoom was; the device stays where it is,
// only its picture is magnified, clipped by the screen. Mode `auto` reads the pointer track of the
// recording on the screen (mm capture site --script) and zooms where the pointer clicked, with the
// camera's own timing (runtime/kit/camera.js): it has started about a second before the click, joins
// zooms that are close, follows the cursor a little, and has weight. The recording's own time is the
// frame screen/play has reached, so the camera is a function of t like everything else. A recording with
// no pointer track still takes `regions` drawn by hand (`mm showcase` writes them from where it moves).
// A zoom can also lean the device it is on (tilt, on a device that carries data-tilt-plane) and blur
// along its own motion (blur); both are drawn by paint() on every seek.
import { cameraOf, depthScale, motionBlur, pickDepth } from '../../../runtime/kit/camera.js';
import { lerpTilt, tiltOf, tiltTransform } from '../../../runtime/kit/demoframe.js';
import { readTrack } from '../../../runtime/kit/cursor.js';

const on = (v) => v !== false && v !== 'false';
const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);
const KINDS = new Set(['none', 'iso', 'left', 'right', 'alternate']);
const FLAT = { x: 0, y: 0 };

/** The zooms an action draws by hand (`regions`), as the camera's regions: seconds in, ms out. */
function handDrawn(list, track, prm) {
  if (!Array.isArray(list)) return [];
  return list.map((r, i) => {
    const hit = r.target ? track.targets.filter((g) => g.selector === r.target).sort((a, b) => Math.abs(a.timeMs - num(r.at) * 1000) - Math.abs(b.timeMs - num(r.at) * 1000))[0] : null;
    const box = hit?.box;
    const startMs = Math.round((r.at != null ? num(r.at) * 1000 : hit?.timeMs ?? 0));
    const depth = r.depth ?? prm.depth;
    return {
      id: `hand-${i + 1}`, source: 'manual', startMs, endMs: startMs + Math.round(num(r.hold, 1.5) * 1000),
      depth: depth === 'fit' && box ? pickDepth(box) : depthScale(depth),
      focus: box ? { cx: box.x + box.w / 2, cy: box.y + box.h / 2 } : { cx: num(r.x, 0.5), cy: num(r.y, 0.5) },
      tilt: KINDS.has(r.tilt) ? r.tilt : 'none',
    };
  });
}

// a recording with no pointer track: a pointer resting at the centre with no clicks, one per recording
const resting = new WeakMap();
function stillTrack(meta) {
  if (!resting.has(meta)) resting.set(meta, readTrack({ version: 2, surface: { w: meta.w || 1, h: meta.h || 1 }, samples: [{ timeMs: 0, cx: 0.5, cy: 0.5 }, { timeMs: Math.round((Number(meta.duration) || 1) * 1000), cx: 0.5, cy: 0.5 }], targets: [] }));
  return resting.get(meta);
}

function auto(state, ctx) {
  const meta = state.content.meta, prm = ctx.params;
  const drawn = Array.isArray(prm.regions) && prm.regions.length > 0;
  if (!meta || (!meta.track && !drawn)) return state;   // the gate and the kit say so; drawing never throws
  const track = meta.track ?? stillTrack(meta);
  const totalMs = Math.round((Number(meta.duration) || track.samples.at(-1).timeMs / 1000) * 1000);
  const cam = cameraOf(track, {
    totalMs, depth: prm.depth, hold: num(prm.hold) > 0 ? num(prm.hold) * 1000 : undefined, leadMs: num(prm.lead) * 1000,
    tilt: KINDS.has(prm.tilt) ? prm.tilt : 'none', spacing: num(prm.spacing, 1.8) * 1000, connect: on(prm.connect), follow: num(prm.follow, 0.35),
    chase: on(prm.chase), suggest: on(prm.suggest), regions: handDrawn(prm.regions, track, prm),
  });
  const c = cam.at(state.frameTime * 1000);
  let blur = null;
  const amount = num(prm.blur);
  if (amount > 0) {
    const b = motionBlur({ vx: c.vx, vy: c.vy, vs: c.vs }, ctx.box ?? { w: 1000, h: 1000 }, amount);
    // a box of length L has a deviation of L over the square root of 12; the source's streak is 2.4 times its blur
    blur = { sx: Math.round(b.px * 0.69 * Math.abs(b.dx) * 1000) / 1000, sy: Math.round(b.px * 0.69 * Math.abs(b.dy) * 1000) / 1000 };
  }
  return { ...state, zoom: { x: c.x, y: c.y, s: c.s }, tilt: c.tilt, blur };
}

// The blur is one SVG filter in the screen layer, its deviation set on every seek; the layer is the kit's own and keeps it.
function blurFilter(layer) {
  let svg = layer.querySelector(':scope > svg[data-mm-blur]');
  if (!svg) {
    const n = layer.ownerDocument.querySelectorAll('svg[data-mm-blur]').length;
    layer.insertAdjacentHTML('afterbegin', `<svg data-mm-blur="${n}" width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="mm-blur-${n}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0 0"/></filter></svg>`);
    svg = layer.firstElementChild;
  }
  return svg;
}

export default {
  name: 'zoom-to',
  group: 'screen',
  dur: 'slow',
  params: {
    at: { type: 'string', default: '50%,50%', meaning: 'mark: a mark label from media.json, or "x%,y%" of the screen' },
    s: { type: 'number', default: 1.6, meaning: 'mark: the magnification at p = 1 (1 to 4)' },
    mode: { type: 'enum(mark|auto)', default: 'mark', meaning: 'mark: push in on `at`; auto: zoom where the recording\'s pointer clicked (it needs a pointer track), or only where `regions` say on a recording without one' },
    depth: { type: 'string', default: 'medium', meaning: 'auto: how far, a step of the ladder (gentle 1.25, soft 1.5, medium 1.8, close 2.2, tight 3.5, macro 5), a number 1 to 5, or fit (the deepest step that shows the clicked box with room round it)' },
    follow: { type: 'number', default: 0.35, meaning: 'auto: how much of the cursor\'s follow the view takes while zoomed (0 sits on the click target, 1 follows the cursor)' },
    hold: { type: 'number', default: 0, meaning: 'auto: seconds each zoom is held after it has landed (0: the longer of 1 s and 5 % of the recording)' },
    lead: { type: 'number', default: 0, meaning: 'auto: seconds the zooms land after (or, negative, before) the click' },
    spacing: { type: 'number', default: 1.8, meaning: 'auto: the fewest seconds between two zooms that land' },
    connect: { type: 'boolean', default: true, meaning: 'auto: zooms at most 1.5 s apart are joined by a pan, not a zoom out and in' },
    chase: { type: 'boolean', default: true, meaning: 'auto: the camera has weight (a spring that arrives without overshoot); off draws the authored camera as it is' },
    suggest: { type: 'boolean', default: true, meaning: 'auto: one zoom at each click target; off leaves only `regions`' },
    regions: { type: 'array', default: '', meaning: 'auto: zooms drawn by hand, each { at, hold, x, y | target, depth, tilt } (seconds into the recording; x, y 0..1 of it; target a selector of the pointer track)' },
    tilt: { type: 'enum(none|iso|left|right|alternate)', default: 'none', meaning: 'the device leans while the zoom is on (on a device with data-tilt-plane); alternate: left then right, auto only' },
    blur: { type: 'number', default: 0, meaning: 'auto: motion blur along the camera\'s own speed, 0 to 1' },
  },
  reduce(state, p, ctx) {
    if (ctx.params.mode === 'auto') return auto(state, ctx);
    const flat = { ...state, zoom: { x: 0.5, y: 0.5, s: 1 } };
    const c = ctx.locate(flat, ctx.params.at);
    const s = Math.min(4, Math.max(1, Number(ctx.params.s) || 1));
    const e = ctx.ease('move', p);
    const z = state.zoom;
    const out = { ...state, zoom: { x: z.x + (c.x - z.x) * e, y: z.y + (c.y - z.y) * e, s: z.s + (s - z.s) * e } };
    const kind = ctx.params.tilt;
    if (kind === 'iso' || kind === 'left' || kind === 'right' || state.tilt) out.tilt = lerpTilt(state.tilt ?? FLAT, tiltOf(kind), e);
    return out;
  },
  paint(screenEl, state) {
    const plane = screenEl.closest('[data-tilt-plane]');
    if (plane) plane.style.transform = state.tilt ? tiltTransform(state.tilt, plane.offsetWidth, plane.offsetHeight) : 'none';
    const layer = screenEl.querySelector(':scope > .mm-screen');
    if (!layer) return;
    const b = state.blur;
    if (b && (b.sx > 0.05 || b.sy > 0.05)) {
      const svg = blurFilter(layer);
      svg.querySelector('feGaussianBlur').setAttribute('stdDeviation', `${b.sx} ${b.sy}`);
      for (const el of layer.querySelectorAll(':scope > .mm-screen__content')) if (el.style.visibility !== 'hidden') el.style.filter = `url(#${svg.querySelector('filter').id})`;
    } else for (const el of layer.querySelectorAll(':scope > .mm-screen__content')) el.style.filter = '';
  },
};
