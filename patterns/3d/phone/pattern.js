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
import { DRAWN, phases, stroke, linesCanvas, paintLines } from '../../../runtime/kit/drawn.js';
import { rrect as ring, circ, solid, extremes } from '../../../runtime/kit/hairline.js';
import { contentMeta } from '../../../runtime/kit/screen.js';

const W = 1, H = 3668 / 1752, D = 0.115, R = 0.181, B = 0.0348;   // the slab of devices/phone, in widths
const SW = W - 2 * B, SH = H - 2 * B, SR = 0.157 * SW;            // the screen inside the bezel
// keys as [top, bottom] fractions of the height, as devices/phone draws them
const KEYS = {
  island: { left: [[0.205, 0.240], [0.285, 0.355], [0.380, 0.450]], right: [[0.310, 0.420], [0.560, 0.620]] },
  punch: { left: [], right: [[0.278, 0.347], [0.398, 0.523]] },
};
KEYS.plain = KEYS.island;
const cache = new WeakMap();

// drawn: the phone lies in the hairline view (seen from 30° up, turned 45°), its glass lifted GAP off the
// body; the camera starts nearly orthographic (a narrow field from far away) and widens to the hero's
const GAP = 0.3, GLASS = 0.012, FOV0 = 2.5, FOV1 = 28;
const axis = (x, y, z, a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z), a);
const ISO = axis(1, 0, 0, Math.PI / 6).multiply(axis(0, 1, 0, Math.PI / 4)).multiply(axis(1, 0, 0, -Math.PI / 2));
const ISO_BOX = (() => {   // the lying phone's box on screen at its most open (rule 03: fit the extreme pose)
  const v = new THREE.Vector3(), xs = [], ys = [];
  for (const x of [-W / 2, W / 2]) for (const y of [-H / 2, H / 2]) for (const z of [-D / 2, D / 2 + GAP + GLASS]) { v.set(x, y, z).applyQuaternion(ISO); xs.push(v.x); ys.push(v.y); }
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
})();
const RINGS = {
  body: ring(-W / 2, -H / 2, W / 2, H / 2, R, 8),
  seat: ring(-W / 2 + B, -H / 2 + B, W / 2 - B, H / 2 - B, R - B, 8),   // the crease: where the glass sits
  glass: ring(-W / 2 + 0.025, -H / 2 + 0.025, W / 2 - 0.025, H / 2 - 0.025, R - 0.025, 8),
  screen: ring(-SW / 2, -SH / 2, SW / 2, SH / 2, SR, 8),
};

// the pose of the drawn move at u: the lying phone turns up into the hero's, the field widens and the
// camera comes in so the phone keeps its size on screen
function drawnPose(c, u, q, ctx) {
  const ph = phases(u, { deck: !!ctx.deck, rest: q >= 1 }), e = ph.rise;
  const settled = Math.max(0, u - DRAWN.rise[0] - DRAWN.rise[1]);
  const ry = ctx.deck ? 0 : -0.16 + 0.05 * Math.sin(settled * 0.8);
  c.phone.quaternion.slerpQuaternions(ISO, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.04, ry, 0)), e);
  c.phone.position.set(-ISO_BOX.cx * (1 - e), -ISO_BOX.cy * (1 - e), 0);
  const a = c.camera.aspect, vIso = Math.max(ISO_BOX.h / 0.8, ISO_BOX.w / (0.86 * a)), vHero = (H * 1.08) / Math.min(1, a / 0.62);
  const fov = Math.exp(Math.log(FOV0) + (Math.log(FOV1) - Math.log(FOV0)) * e);
  const dist = ((vIso + (vHero - vIso) * e) / 2) / Math.tan((fov * Math.PI) / 360);
  if (c.camera.fov !== fov || c.camera.far !== dist + 30) { c.camera.fov = fov; c.camera.near = Math.max(0.5, dist - 6); c.camera.far = dist + 30; c.camera.updateProjectionMatrix(); }
  c.camera.position.set(0, 0.05 * e, dist);
  c.camera.lookAt(0, -0.05 * e, 0);
  c.floor.material.opacity = 0.28 * Math.min(1, Math.max(0, (e - 0.4) / 0.6));
  c.glow.material.opacity = 0.75 * e;
  const base = -0.9 + 1.64 * ph.reveal;   // the sheen crosses the glass with the band, then rests as the hero's
  c.shine.material.map.offset.x = base + (0.74 + ry * 1.15 - base) * e;
  return { ph, ry, gap: GAP * (1 - ph.gather) };
}

// the wire of the page on the screen, as screen-plane shapes in css px of the hidden screen
function wireOf(holder, c) {
  const scr = holder.querySelector('[data-screen]');
  if (!scr) return null;
  const box = scr.getBoundingClientRect();
  const shown = [...scr.querySelectorAll('.mm-screen__content')].find((el) => el.style.visibility !== 'hidden');
  const meta = shown ? contentMeta.get(shown) : null;
  const own = !!shown?.querySelector('img.mm-screen__media');
  const bar = c.bar && (c.bar.status === 'true' || (c.bar.status !== 'false' && !own));
  const inset = bar ? c.bar.inset(true) * box.height : 0;
  const out = { w: box.width, h: box.height, bar, shapes: [] };
  const tile = shown?.querySelector('.mm-screen__tile');
  if (meta?.kind !== 'page' || !Array.isArray(meta.wire) || !tile) return out;
  const k = box.width / meta.viewport.w, top0 = tile.getBoundingClientRect().top - box.top - meta.tiles[0].y * k;
  for (const s of meta.wire) {
    const y = inset + (s.fixed || s.overlay != null ? s.y * k : top0 + s.y * k), h = s.h * k;
    if (y + h < inset || y > box.height) continue;
    out.shapes.push({ k: s.k, x: s.x * k, y, w: s.w * k, h, r: (s.r ?? 0) * k });
  }
  return out;
}

// one frame of the drawing, projected with the camera the 3D phone is about to be drawn with
function drawnLines(c, holder, u, pose) {
  const cv = linesCanvas(holder);
  const { ph, gap } = pose;
  if (ph.reveal >= 1) { cv.style.display = 'none'; return; }
  cv.style.display = '';
  c.phone.updateMatrixWorld(true); c.camera.updateMatrixWorld();
  const M = c.phone.matrixWorld, V = c.camera.matrixWorldInverse, w = cv.width, h = cv.height;
  const v = new THREE.Vector3(), n = new THREE.Vector3(), to = new THREE.Vector3();
  const P = (x, y, z) => { v.set(x, y, z).applyMatrix4(M).project(c.camera); return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h]; };
  const sees = (x, y, z, nx, ny, nz) => { v.set(x, y, z).applyMatrix4(M); n.set(nx, ny, nz).transformDirection(M); return n.dot(to.subVectors(c.camera.position, v)) > 0; };
  const depth = (x, y, z) => v.set(x, y, z).applyMatrix4(M).applyMatrix4(V).z;
  const lw = Math.max(1, h / 640);
  const faceZ = (q, z) => sees(q.u, q.v, z, q.nu, q.nv, 0);
  const at = (r, z) => r.map((q) => P(q.u, q.v, z));
  const parts = [];
  const lid = D / 2, zg = lid + gap, zs = zg + GLASS + 0.001;

  // dashed guides from the lifted glass down to its seat: painted first, so every plate hides them
  const gl = at(RINGS.glass, zs);
  for (const i of extremes(gl)) {
    const q = RINGS.glass[i];
    parts.push({ pts: [P(q.u, q.v, zs), P(q.u, q.v, lid)], role: 'mid', dash: true, s: stroke(u, 0.15, 0.6), alpha: 1 - ph.gather });
  }
  // the body and its keys, far to near
  const solids = [];
  const body = solid(P, faceZ, RINGS.body, RINGS.seat, -D / 2, lid);
  solids.push({ z: depth(0, 0, 0), list: [
    { pts: body.sil, closed: true, role: 'edge', fill: true, s: stroke(u, 0, 1.1) },
    { pts: body.crease, role: 'lo', s: stroke(u, 0.55, 0.8) },
  ] });
  const keys = KEYS[c.model] ?? KEYS.island;
  for (const [side, list] of [[-1, keys.left], [1, keys.right]]) for (const [a, b] of list) {
    const y0 = H / 2 - H * b, y1 = H / 2 - H * a, kz = D * 0.21;
    const kr = ring(y0, -kz, y1, kz, 0.006, 3), x0 = side * W / 2, x1 = side * (W / 2 + 0.011);
    const Pk = (uu, vv, hh) => P(hh, uu, vv), Fk = (qq, hh) => sees(hh, qq.u, qq.v, 0, qq.nu, qq.nv);
    const k = solid(Pk, Fk, kr, null, Math.min(x0, x1), Math.max(x0, x1));
    solids.push({ z: depth(x1, (y0 + y1) / 2, 0), list: [{ pts: k.sil, closed: true, role: 'edge', fill: true, s: stroke(u, 0.85, 0.4) }] });
  }
  solids.sort((A, Bz) => A.z - Bz.z).forEach((x) => parts.push(...x.list));

  // the glass: one thin plate (the bright mark until the band takes the bright), its screen edge and island
  const glass = solid(P, faceZ, RINGS.glass, null, zg, zg + GLASS);
  parts.push({ pts: glass.sil, closed: true, role: ph.reveal > 0 ? 'edge' : 'hi', fill: true, s: stroke(u, 0.3, 1.0) });
  const scr = at(RINGS.screen, zs);
  parts.push({ pts: scr, closed: true, role: 'mid', s: stroke(u, 0.6, 0.8) });
  const wire = wireOf(holder, c);
  const bw = wire?.w || 1, bh = wire?.h || 1;
  const X = (sx) => (sx / bw - 0.5) * SW, Y = (sy) => (0.5 - sy / bh) * SH;
  const from = (sx, sy) => 1.1 + (Math.hypot(sx / bw - 0.5, sy / bh) / 1.12) * 0.8;   // spread out from the island
  const shape = (s, role) => {
    const t0 = from(s.x + s.w / 2, s.y + s.h / 2);
    if (s.k === 'text') return { pts: [P(X(s.x), Y(s.y + s.h / 2), zs), P(X(s.x + s.w), Y(s.y + s.h / 2), zs)], role, s: stroke(u, t0, 0.35), clip: scr };
    if (s.k === 'dot') return { pts: at(circ((Math.min(s.w, s.h) / 2 / bw) * SW, 16, X(s.x + s.w / 2), Y(s.y + s.h / 2)), zs), role: 'edge', dot: true, s: stroke(u, t0, 0.3), clip: scr };
    return { pts: at(ring(X(s.x), Y(s.y + s.h), X(s.x + s.w), Y(s.y), (s.r / bw) * SW, 4), zs), closed: true, role, s: stroke(u, t0, 0.5), clip: scr };
  };
  if (c.model === 'island') {
    const iw = 0.2385 * SW, ih = 0.0431 * SH, iy = SH / 2 - 0.0161 * SH - ih / 2;
    parts.push({ pts: at(ring(-iw / 2, iy - ih / 2, iw / 2, iy + ih / 2, ih / 2, 6), zs), closed: true, role: 'edge', s: stroke(u, 0.95, 0.35) });
    parts.push({ pts: at(circ(ih * 0.3, 16, iw * 0.306, iy), zs), role: 'edge', dot: true, s: stroke(u, 1.2, 0.25) });
  }
  if (wire?.bar) {   // the status bar: the time, the signal and the battery, as phoneBar places them
    const by = 0.0377 * bh, u0 = bw / 393;
    parts.push(shape({ k: 'text', x: 0.205 * bw - 18 * u0, y: by - 6 * u0, w: 36 * u0, h: 12 * u0 }, 'mid'));
    parts.push(shape({ k: 'text', x: 0.805 * bw - 33 * u0, y: by - 6 * u0, w: 36 * u0, h: 12 * u0 }, 'mid'));
    parts.push(shape({ k: 'box', x: 0.805 * bw + 9 * u0, y: by - 6 * u0, w: 24 * u0, h: 12 * u0, r: 3.5 * u0 }, 'mid'));
  }
  for (const s of wire?.shapes ?? []) parts.push(shape(s, s.k === 'text' && s.h > 20 * (bw / 393) ? 'edge' : 'mid'));

  const ink = {}; for (const r of ['hi', 'edge', 'mid', 'lo', 'plate']) ink[r] = c.ink[r];
  const reveal = ph.reveal > 0 ? { a: P(0, H / 2, lid), b: P(0, -H / 2, lid), s: -0.12 + 1.12 * ph.reveal, clip: body.sil } : null;
  if (reveal) reveal.feather = 0.12 * Math.hypot(reveal.b[0] - reveal.a[0], reveal.b[1] - reveal.a[1]);
  paintLines(cv, { parts, ink, lw, cover: !!reveal, front: reveal });
  c.canvas.dataset.drawn = ph.rise > 0 ? 'rise' : ph.reveal > 0 ? 'reveal' : ph.gather > 0 ? 'gather' : 'draw';
}
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
  const ink = Object.fromEntries(['hi', 'edge', 'mid', 'lo', 'plate'].map((r) => [r, cssText(holder, `--hl-${r}`)]));
  Object.assign(c, { kind, phone, shine, backShine, cutout, model, ink, surface: cssText(holder, '--mm-color-surface'), accent: cssText(holder, '--mm-color-accent') });
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
    move: { type: 'enum(hero|turntable|still|showcase|cross|drawn)', default: 'hero', meaning: 'hero turns from edge-on to facing and sways; turntable turns slowly the whole time; still holds a slight angle; showcase starts with the back to the viewer and makes a slow half-turn to face it, then holds; cross faces the viewer at `from`, then travels to `to` making one full turn (its back shows half-way); drawn draws the phone lying in thin lines, its glass and the page\'s wire lifted on dashed guides, settles the glass, sweeps a band along it that turns the lines into the real phone, then stands it up into the camera (about 6.5 s; screen actions after that)' },
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
    if (ctx.params?.move === 'drawn') {
      const dp = drawnPose(c, u, q, ctx);
      holder.style.opacity = '1';
      c.canvas.style.visibility = dp.ph.reveal > 0 ? '' : 'hidden';   // only lines until the band arrives
      sweep(c.backShine, dp.ry + Math.PI, 0.18);
      mark(c, dp.ry, { cutout: c.cutout });
      ctx.afterSettle(() => drawnLines(c, holder, u, dp));
      if (dp.ph.reveal > 0) draw(c, holder, ctx);
      return;
    }
    if (c.camera.fov !== FOV1) { c.camera.fov = FOV1; c.camera.near = 0.5; c.camera.far = 60; c.camera.updateProjectionMatrix(); }
    c.canvas.style.visibility = '';
    holder.querySelector(':scope > canvas.drawn__lines')?.style.setProperty('display', 'none');
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
