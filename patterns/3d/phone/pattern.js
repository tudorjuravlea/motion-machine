// 3d/phone: a phone in real 3D (Three.js, vendored) that rises into frame and turns. The slab, rim,
// bezel, corners, keys and cutouts are those of devices/phone: a metal rim with bevelled
// edges, a glass front, a glossy screen that reflects the room, five keys (or two with the punch
// model), and a camera plateau, visor or block on the back for the turns that show it.
// The screen is a texture copied, after the seek's decodes (ctx.afterSettle), from a hidden 2D
// screen ([data-screen]) that the kit's screen fold drives exactly like a flat device. The pose is a
// pure function of p and u; the renderer is cached per slot and holds GPU resources only, never
// visible state. A deck rest faces the viewer. No clock, no animation loop.
import { THREE, clamp01, smoothstep01, cssText, cssColour, stage, slab, plate, disc, sheen, sweep, lightAll, phoneBar, alloy, metal, glass, glossy, turn, cross, fitCanvas, mark, draw } from '../../../runtime/kit/device3d.js';
import { RoundedBoxGeometry } from '../../../runtime/vendor/three/0.170.0/RoundedBoxGeometry.js';

const W = 1, H = 3668 / 1752, D = 0.115, R = 0.181, B = 0.0348;   // the slab of devices/phone, in widths
const SW = W - 2 * B, SH = H - 2 * B, SR = 0.157 * SW;            // the screen inside the bezel
// keys as [top, bottom] fractions of the height, as devices/phone draws them
const KEYS = {
  island: { left: [[0.205, 0.240], [0.285, 0.355], [0.380, 0.450]], right: [[0.310, 0.420], [0.560, 0.620]] },
  punch: { left: [], right: [[0.278, 0.347], [0.398, 0.523]] },
};
KEYS.plain = KEYS.island;
const cache = new WeakMap();
const say = (g, text, x, y) => g.fillText(text, x, y);   // the top bar's words: chrome on a declared-media canvas (canvasText)

// the camera on the back, seen when the phone turns: it faces -z, and from behind object +x is on the left
function camera(model, m) {
  const g = new THREE.Group();
  const lens = (x, y, r, z) => {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.022, 48), m.rim);
    ring.rotation.x = Math.PI / 2; ring.position.set(x, y, z - 0.011);
    const eye = disc(r * 0.8, m.glass); eye.rotation.y = Math.PI; eye.position.set(x, y, z - 0.0225);
    const pupil = disc(r * 0.34, m.lens); pupil.rotation.y = Math.PI; pupil.position.set(x, y, z - 0.023);
    g.add(ring, eye, pupil);
  };
  const dot = (x, y, r, mat, z) => { const d = disc(r, mat); d.rotation.y = Math.PI; d.position.set(x, y, z); g.add(d); };
  const back = -D / 2;
  if (model === 'punch') {           // a visor across the back, a glass window holding three lenses
    const visor = slab(W - 0.012, 0.25, 0.04, 0.11, 0.014, [m.rim, m.rim]);
    const y = H / 2 - 0.46;
    visor.position.set(0, y, back - 0.012);
    const win = plate(0.6, 0.17, 0.085, m.glass); win.rotation.y = Math.PI; win.position.set(0.1, y, back - 0.0325);
    g.add(visor, win);
    for (const x of [0.3, 0.1, -0.1]) lens(x, y, 0.062, back - 0.0325);
    dot(-0.32, y, 0.026, m.flash, back - 0.033);
  } else if (model === 'island') {   // a plateau across the top of the back, three lenses in a triangle
    const plateau = slab(W - 0.05, 0.6, 0.03, 0.14, 0.01, [m.back, m.rim]);
    const y = H / 2 - 0.025 - 0.3;
    plateau.position.set(0, y, back - 0.01);
    g.add(plateau);
    const z = back - 0.025;
    lens(0.25, y + 0.13, 0.108, z); lens(0.25, y - 0.13, 0.108, z); lens(0.03, y, 0.108, z);
    dot(-0.26, y + 0.13, 0.034, m.flash, z - 0.0005); dot(-0.26, y - 0.13, 0.04, m.glass, z - 0.0005);
  } else {                           // a square block, two lenses
    const block = slab(0.38, 0.38, 0.03, 0.1, 0.01, [m.back, m.rim]);
    block.position.set(0.25, H / 2 - 0.26, back - 0.01);
    g.add(block);
    lens(0.29, H / 2 - 0.18, 0.07, back - 0.025); lens(0.29, H / 2 - 0.34, 0.07, back - 0.025);
  }
  return g;
}

function build(el, holder, model, kind) {
  const c = stage(el);
  c.canvas.className = 'phone3d__canvas';
  const col = (v) => cssColour(holder, v);
  const m = {
    rim: alloy(kind, col('--mm-device-body').lerp(col('--mm-device-rim-light'), 0.7)),   // satin metal: soft highlights where the softboxes fall
    back: glass(col('--mm-device-body'), 0.16, 0.5),   // dark glass: the sheen does the flashing
    glass: glass(col('--mm-device-glass')),
    lens: glass(col('--mm-device-lens'), 0.02),
    ring: glass(col('--mm-device-lens-ring'), 0.02),
    island: glass(col('--mm-device-island'), 0.03),
    flash: new THREE.MeshStandardMaterial({ color: col('--mm-device-spec'), roughness: 0.5 }),
  };
  const phone = new THREE.Group();
  phone.add(slab(W, H, D, R, 0.032, [m.back, m.rim]));   // rounded sides: they sweep the studio, so a bright line runs along them
  const front = plate(W - 0.05, H - 0.05, R - 0.025, m.glass);
  front.position.z = D / 2 + 0.001;
  const screen = plate(SW, SH, SR, glossy(c.tex));
  screen.position.z = D / 2 + 0.002;
  phone.add(front, screen);
  const top = D / 2 + 0.003, sy = SH / 2;
  let cutout = 'none';
  if (model === 'island') {
    const w = 0.2385 * SW, h = 0.0431 * SH, y = sy - 0.0161 * SH - h / 2;
    const pill = plate(w, h, h / 2, m.island); pill.position.set(0, y, top);
    const eye = disc(h * 0.3, m.ring); eye.position.set(w * 0.306, y, top + 0.0005);
    const pupil = disc(h * 0.14, m.lens); pupil.position.set(w * 0.306, y, top + 0.001);
    phone.add(pill, eye, pupil);
    cutout = 'island';
  } else if (model === 'punch') {
    const r = 0.071 * SW / 2, y = sy - 0.0196 * SH - r;
    const dot = disc(r, m.island); dot.position.set(0, y, top);
    const ring = disc(r * 0.55, m.ring); ring.position.set(0, y, top + 0.0005);
    phone.add(dot, ring);
    cutout = 'punch';
  }
  const keys = KEYS[model] ?? KEYS.island;
  for (const [side, list] of [[-1, keys.left], [1, keys.right]]) for (const [a, b] of list) {
    const key = new THREE.Mesh(new RoundedBoxGeometry(0.016, H * (b - a), D * 0.42, 2, 0.006), m.rim);
    key.position.set(side * (W / 2 + 0.003), H / 2 - H * (a + b) / 2, 0);
    phone.add(key);
  }
  const doc = el.ownerDocument;
  const shine = sheen(doc, W - 0.05, H - 0.05, R - 0.025, 0.2);   // over the screen: it crosses as the phone turns in, then leaves
  shine.position.z = D / 2 + 0.004;
  const backShine = sheen(doc, W - 0.07, H - 0.07, R - 0.035, 0.34);
  backShine.rotation.y = Math.PI; backShine.position.z = -D / 2 - 0.001;
  phone.add(shine, backShine);
  phone.add(camera(model, m));
  c.scene.add(phone);
  lightAll(c);
  c.floor.position.y = -H / 2 - 0.18;
  c.glow.position.set(0, 0.05, -1.6); c.glow.scale.set(2.3, 2.6, 1);
  Object.assign(c, { kind, phone, shine, backShine, cutout, model, surface: cssText(holder, '--mm-color-surface'), accent: cssText(holder, '--mm-color-accent') });
  cache.set(el, c);
  return c;
}

export default {
  name: 'phone',
  group: '3d',
  dur: 'slow',
  fragment: true,
  canvasText: true,   // the top bar's time, network and menu words are drawn into the screen texture
  ambient: true,   // it keeps turning after it arrives: a move until the scene ends (schedule)
  params: {
    move: { type: 'enum(hero|turntable|still|showcase|cross)', default: 'hero', meaning: 'hero turns from edge-on to facing and sways; turntable turns slowly the whole time; still holds a slight angle; showcase starts with the back to the viewer and makes a slow half-turn to face it, then holds; cross faces the viewer at `from`, then travels to `to` making one full turn (its back shows half-way)' },
    from: { type: 'number', default: -0.28, meaning: 'cross: where the phone starts, as a fraction of its slot\'s width from the centre (negative is left)' },
    to: { type: 'number', default: 0.28, meaning: 'cross: where it ends, the same way' },
    crossAt: { type: 'number', default: 2, meaning: 'cross: seconds after the phone arrives that the cross begins' },
    crossFor: { type: 'number', default: 2.4, meaning: 'cross: seconds the cross takes; the back faces the viewer at its middle (swap the screen there)' },
    status: { type: 'enum(auto|true|false)', default: 'auto', meaning: 'the status bar (time, signal, network, battery) drawn into the screen: auto shows it on a bare screen and a captured page, and leaves it to a recording or a still, which carry their own' },
    statusTime: { type: 'string', default: '10:00', meaning: 'the time in the status bar' },
    metal: { type: 'enum(aluminium|titanium)', default: 'aluminium', meaning: 'the frame: satin aluminium in a neutral, faintly cool grey; or titanium, darker and faintly warm with a finer brushed sheen' },
    model: { type: 'enum(island|punch|plain)', default: 'island', meaning: 'the cutout on the front and the camera on the back: an island and a camera plateau; a punch-hole camera and a visor; or none and a small camera block' },
  },
  at(el, p, ctx) {
    const holder = el.querySelector(':scope > .phone3d');
    if (!holder) return;
    const model = ctx.params?.model ?? 'island';
    const kind = ctx.params?.metal ?? 'aluminium';
    let c = cache.get(el);
    if (!c || c.model !== model || c.kind !== kind) c = ctx.seeded(() => build(el, holder, model, kind));   // Three.js names objects with Math.random: seeded here
    if (c.canvas.parentElement !== holder) holder.prepend(c.canvas);   // the seek's restore rebuilt the markup
    fitCanvas(c, holder);
    c.bar = { ...phoneBar(model, String(ctx.params?.statusTime ?? '10:00'), getComputedStyle(holder).getPropertyValue('--mm-font-text').trim() || 'sans-serif', say), status: String(ctx.params?.status ?? 'auto') };
    const q = clamp01(p), u = Math.max(0, Number(ctx.u) || 0);
    const pose = ctx.params?.move === 'cross' ? cross(q, u, ctx.params, ctx) : null;
    const ry = pose ? pose.ry : turn(ctx.params?.move ?? 'hero', q, u, ctx);
    c.phone.rotation.set(0.06 * (1 - q) + 0.04, ry, 0);
    c.phone.position.set(0, -0.5 * (1 - smoothstep01(q)), 0);
    sweep(c.shine, ry, 0.74);   // off the left edge at rest: the screen reads clean
    sweep(c.backShine, ry + Math.PI, 0.18);
    const tall = H * 1.18;                                  // the phone fills most of the canvas height
    c.camera.position.set(0, 0.05, (tall / 2) / Math.tan((c.camera.fov * Math.PI) / 360) / Math.min(1, c.camera.aspect / 0.62));
    c.camera.lookAt(0, -0.05, 0);
    // cross: x as a fraction of the slot's width, in world units at the phone's depth
    if (pose) c.phone.position.x = pose.x * 2 * c.camera.position.z * Math.tan((c.camera.fov * Math.PI) / 360) * c.camera.aspect;
    holder.style.opacity = String(Math.round(clamp01(q / 0.4) * 1000) / 1000);
    mark(c, ry, pose ? { cutout: c.cutout, x: Math.round(pose.x * 1e4) / 1e4 } : { cutout: c.cutout });
    draw(c, holder, ctx);
  },
};
