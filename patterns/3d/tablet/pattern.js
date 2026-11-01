// 3d/tablet: a tablet in real 3D (Three.js, vendored), a sibling of 3d/phone built the same way: a
// metal unibody slab with bevelled edges, a glass front with thin even bezels, a glossy screen that
// reflects the room, a small front camera centred in the top bezel, a top button and two volume keys,
// and one camera block on the back. `orientation` builds the slab portrait or landscape (the geometry,
// never a turned mesh); the hidden 2D screen ([data-screen]) takes the same proportions in CSS.
// The screen is a texture copied, after the seek's decodes (ctx.afterSettle), from that hidden screen,
// which the kit's screen fold drives exactly like a flat device. The pose is a pure function of p and
// u; the renderer is cached per slot and holds GPU resources only, never visible state. A deck rest
// faces the viewer. No clock, no animation loop.
import { THREE, clamp01, smoothstep01, cssText, cssColour, stage, slab, plate, disc, sheen, sweep, lightAll, phoneBar, alloy, glass, glossy, turn, fitCanvas, mark, draw, LOOK_PARAMS, lookOf } from '../../../runtime/kit/device3d.js';
import { RoundedBoxGeometry } from '../../../runtime/vendor/three/0.170.0/RoundedBoxGeometry.js';

// the slab in portrait, in widths: a 3:4 screen inside even bezels, small round corners, a thin body
const PW = 1, PH = 1.3, D = 0.042, R = 0.09, B = 0.05, SR = 0.04, RIM = 0.014;
const BAR = 0.03, TEXT = 0.015;   // the status bar's height and its type size, as fractions of the screen's short side
const cache = new WeakMap();
const say = (g, text, x, y) => g.fillText(text, x, y);   // the top bar's words: chrome on a declared-media canvas (canvasText)

// the slab for an orientation: landscape swaps the width and the height
const dims = (orientation) => (orientation === 'landscape' ? { W: PH, H: PW } : { W: PW, H: PH });

// the tablet's status bar: the phone's bar (time on the left; 5G, signal and battery on the right) at a
// tablet's size, a phone-width strip drawn twice, once at each end of the screen, each clipped to its own half
function tabletBar(landscape, time, font) {
  const bar = phoneBar('punch', time, font, say);
  const aspect = (PW - 2 * B) / (PH - 2 * B);   // the screen's short side over its long side
  return {
    time,
    inset: (show) => (show ? BAR * (landscape ? 1 : aspect) : 0),
    draw(g, w, h, light, show) {
      if (!show) return;
      const short = Math.min(w, h), pw = short * TEXT / 0.042;   // the phone bar's type is 0.042 of its width
      const dy = short * BAR / 2 - pw * 0.0355;                   // its centre line, moved to the middle of the band
      for (const [x, cx] of [[0, 0], [w - pw, w - pw / 2]]) {
        g.save();
        g.beginPath(); g.rect(cx, 0, pw / 2, short * BAR); g.clip();
        g.translate(x, dy);
        bar.draw(g, pw, 0, light, true);
        g.restore();
      }
    },
  };
}

// the camera on the back, seen when the tablet turns: one block with one lens in the top corner. It faces
// -z, and from behind object +x is on the left
function backCamera(W, H, m) {
  const g = new THREE.Group();
  const back = -D / 2, s = 0.15, inset = 0.045, bd = 0.012;
  const x = W / 2 - inset - s / 2, y = H / 2 - inset - s / 2;
  const block = slab(s, s, bd, 0.045, 0.004, [m.back, m.rim]);
  block.position.set(x, y, back - bd / 2 + 0.001);
  const face = back - bd + 0.001, r = 0.046;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.008, 48), m.rim);
  ring.rotation.x = Math.PI / 2; ring.position.set(x, y, face - 0.004);
  const eye = disc(r * 0.8, m.glass); eye.rotation.y = Math.PI; eye.position.set(x, y, face - 0.0085);
  const pupil = disc(r * 0.34, m.lens); pupil.rotation.y = Math.PI; pupil.position.set(x, y, face - 0.009);
  g.add(block, ring, eye, pupil);
  return g;
}

function build(el, holder, orientation, kind, look) {
  const c = stage(el, look);
  c.canvas.className = 'tablet3d__canvas';
  const { W, H } = dims(orientation);
  const SW = W - 2 * B, SH = H - 2 * B;
  const col = (v) => cssColour(holder, v);
  const m = {
    rim: alloy(kind, col('--mm-device-body').lerp(col('--mm-device-rim-light'), 0.7), undefined, look.brushed),   // satin metal: the rim, the back and the keys are one piece
    back: glass(col('--mm-device-body'), 0.16, 0.5),   // the camera block's dark glass
    glass: glass(col('--mm-device-glass')),
    lens: glass(col('--mm-device-lens'), 0.02),
    ring: glass(col('--mm-device-lens-ring'), 0.02),
    island: glass(col('--mm-device-island'), 0.03),
  };
  const tablet = new THREE.Group();
  tablet.add(slab(W, H, D, R, 0.014, [m.rim, m.rim]));   // rounded sides: they sweep the studio, so a bright line runs along them
  const front = plate(W - 2 * RIM, H - 2 * RIM, R - RIM, m.glass);   // the black glass: the even bezel all round
  front.position.z = D / 2 + 0.001;
  const screen = plate(SW, SH, SR, glossy(c.tex));
  screen.position.z = D / 2 + 0.002;
  tablet.add(front, screen);
  const top = D / 2 + 0.003, cy = H / 2 - B / 2;   // the front camera: a small dot centred in the top bezel
  const dot = disc(0.0085, m.island); dot.position.set(0, cy, top);
  const eye = disc(0.0045, m.ring); eye.position.set(0, cy, top + 0.0005);
  tablet.add(dot, eye);
  // the keys: a top button on the top edge near the right corner, two volume keys on the right edge near the top
  const key = (w, h) => new THREE.Mesh(new RoundedBoxGeometry(w, h, D * 0.5, 2, 0.004), m.rim);
  const button = key(0.11, 0.012); button.position.set(W / 2 - 0.2, H / 2 + 0.002, 0);
  const up = key(0.012, 0.075); up.position.set(W / 2 + 0.002, H / 2 - 0.16, 0);
  const down = key(0.012, 0.075); down.position.set(W / 2 + 0.002, H / 2 - 0.255, 0);
  tablet.add(button, up, down);
  const doc = el.ownerDocument;
  const shine = sheen(doc, W - 2 * RIM, H - 2 * RIM, R - RIM, 0.2);   // over the screen: it crosses as the tablet turns in, then leaves
  shine.position.z = D / 2 + 0.004;
  const backShine = sheen(doc, W - 0.04, H - 0.04, R - 0.02, 0.24);
  backShine.rotation.y = Math.PI; backShine.position.z = -D / 2 - 0.001;
  tablet.add(shine, backShine, backCamera(W, H, m));
  c.scene.add(tablet);
  lightAll(c, { body: tablet, focus: new THREE.Vector3(0, 0, 0), reach: 1.6, height: H + 0.4 });
  c.floor.position.y = -H / 2 - 0.1;   // closer than the phone's: the wide contact shadow stays inside a short slot
  c.floor.userData.cast = 0.18;         // the key light's shadow of a wide slab is a large plane on the floor: kept faint
  c.glow.position.set(0, 0.05, -1.6); c.glow.scale.set(W + 1.3, H + 1.2, 1);
  Object.assign(c, { kind, brushed: look.brushed, orientation, W, H, tablet, shine, backShine, surface: cssText(holder, '--mm-color-surface'), accent: cssText(holder, '--mm-color-accent') });
  cache.set(el, c);
  return c;
}

export default {
  name: 'tablet',
  group: '3d',
  dur: 'slow',
  fragment: true,
  canvasText: true,   // the status bar's time and network words are drawn into the screen texture
  ambient: true,   // it keeps turning after it arrives: a move until the scene ends (schedule)
  params: {
    move: { type: 'enum(hero|turntable|still|showcase)', default: 'hero', meaning: 'hero turns from edge-on to facing and sways; turntable turns slowly the whole time; still holds a slight angle; showcase starts with the back to the viewer and makes a slow half-turn to face it, then holds' },
    orientation: { type: 'enum(portrait|landscape)', default: 'portrait', meaning: 'the tablet upright (3:4 screen) or on its side (4:3): the slab is built that way and the screen\'s picture takes those proportions; the front camera stays centred in the top bezel' },
    status: { type: 'enum(auto|true|false)', default: 'auto', meaning: 'the status bar (time, network, signal, battery) drawn into the screen: auto shows it on a bare screen and a captured page, and leaves it to a recording or a still, which carry their own' },
    statusTime: { type: 'string', default: '10:00', meaning: 'the time in the status bar' },
    metal: { type: 'enum(aluminium|titanium)', default: 'aluminium', meaning: 'the body: satin aluminium in a neutral, faintly cool grey; or titanium, darker and faintly warm with a finer brushed sheen' },
    ...LOOK_PARAMS,
  },
  at(el, p, ctx) {
    const holder = el.querySelector(':scope > .tablet3d');
    if (!holder) return;
    const orientation = ctx.params?.orientation === 'landscape' ? 'landscape' : 'portrait';
    const kind = ctx.params?.metal ?? 'aluminium';
    const look = lookOf(ctx.params);
    holder.dataset.orientation = orientation;   // the hidden screen's proportions (pattern.css)
    let c = cache.get(el);
    if (!c || c.orientation !== orientation || c.kind !== kind || c.studio !== look.studio || c.brushed !== look.brushed) c = ctx.seeded(() => build(el, holder, orientation, kind, look));   // Three.js names objects with Math.random: seeded here
    if (c.canvas.parentElement !== holder) holder.prepend(c.canvas);   // the seek's restore rebuilt the markup
    fitCanvas(c, holder, ctx.params);
    c.bar = { ...tabletBar(orientation === 'landscape', String(ctx.params?.statusTime ?? '10:00'), getComputedStyle(holder).getPropertyValue('--mm-font-text').trim() || 'sans-serif'), status: String(ctx.params?.status ?? 'auto') };
    const q = clamp01(p), u = Math.max(0, Number(ctx.u) || 0);
    const ry = turn(ctx.params?.move ?? 'hero', q, u, ctx);
    c.tablet.rotation.set(0.06 * (1 - q) + 0.04, ry, 0);
    c.tablet.position.set(0, -0.4 * (1 - smoothstep01(q)), 0);
    sweep(c.shine, ry, 0.74);   // off the left edge at rest: the screen reads clean
    sweep(c.backShine, ry + Math.PI, 0.18);
    // the whole tablet in its slot in any format, a little margin: far enough for its height (with room
    // below for the contact shadow) and for its width as it sways
    const tan = Math.tan((c.camera.fov * Math.PI) / 360);
    c.camera.position.set(0, 0.05, Math.max((c.H + 0.32) / 2 / tan, (c.W + 0.24) / 2 / (tan * c.camera.aspect)));
    c.camera.lookAt(0, -0.05, 0);
    holder.style.opacity = String(Math.round(clamp01(q / 0.4) * 1000) / 1000);
    mark(c, ry, { cutout: 'camera', orientation });
    draw(c, holder, ctx);
  },
};
