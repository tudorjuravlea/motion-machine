// 3d/laptop: a notebook in real 3D (Three.js, vendored) to match 3d/phone: a metal base
// with a keyboard and a trackpad, a lid on a hinge with a glass face, thin bezels and a glossy
// screen that reflects the room, and the face models of devices/laptop (a camera notch, the chin,
// or none). It turns like the phone (hero, turntable, still, showcase); in a hero the lid opens as
// it arrives. The screen is copied from a hidden 2D screen the kit's screen fold drives; the pose
// is a pure function of p and u; a deck rest faces the viewer with the lid open.
import { THREE, clamp01, smoothstep01, cssText, cssColour, stage, slab, plate, disc, sheen, sweep, lightAll, menuBar, alloy, metal, glass, glossy, turn, fitCanvas, mark, draw } from '../../../runtime/kit/device3d.js';

const LW = 2, LH = 1.29, LT = 0.024, LR = 0.065;   // the lid, in scene units
const BD = 1.38, BT = 0.058, BR = 0.075;           // the base: depth (front to back) and thickness
const FACES = { notch: [0.035, 0.035, 0.05], chin: [0.034, 0.088, 0.11], plain: [0.035, 0.035, 0.035] };   // bezels: side, top, bottom
const OPEN = -0.21, SHUT = 1.48;                   // the lid's angle from upright at rest and closed (radians)
const cache = new WeakMap();
const say = (g, text, x, y) => g.fillText(text, x, y);   // the top bar's words: chrome on a declared-media canvas (canvasText)

// the deck: a keyboard well with its keys and a trackpad, drawn once into a texture (back edge at the top)
function deckTexture(doc, col) {
  const cv = doc.createElement('canvas');
  cv.width = 1024; cv.height = Math.round(1024 * BD / LW);
  const g = cv.getContext('2d'), w = cv.width, h = cv.height;
  g.fillStyle = col.body; g.fillRect(0, 0, w, h);
  const kx = w * 0.09, kw = w * 0.82, ky = h * 0.07, kh = h * 0.43;
  g.fillStyle = col.well; g.beginPath(); g.roundRect(kx, ky, kw, kh, 10); g.fill();
  g.fillStyle = col.key;
  const gap = kw * 0.006, rows = [[14, 0.55], [14, 1], [14, 1], [13, 1], [12, 1], [0, 1]];
  const unit = (kh - gap * 7) / 5.55;
  let y = ky + gap;
  for (const [n, hh] of rows) {
    const rh = unit * hh;
    if (n) {
      const kwid = (kw - gap * (n + 1)) / n;
      for (let i = 0; i < n; i++) { g.beginPath(); g.roundRect(kx + gap + i * (kwid + gap), y, kwid, rh, 5); g.fill(); }
    } else {                                     // the bottom row: modifiers, a space bar, arrows
      const sizes = [1, 1, 1, 1.3, 5.2, 1.3, 1, 1, 1];
      const total = sizes.reduce((a, b) => a + b, 0), span = kw - gap * (sizes.length + 1);
      let x = kx + gap;
      for (const s of sizes) { const kwid = span * s / total; g.beginPath(); g.roundRect(x, y, kwid, rh, 5); g.fill(); x += kwid + gap; }
    }
    y += rh + gap;
  }
  g.fillStyle = col.pad; g.beginPath(); g.roundRect(w * 0.31, h * 0.56, w * 0.38, h * 0.37, 14); g.fill();
  g.strokeStyle = col.edge; g.lineWidth = 2; g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function build(el, holder, model, kind) {
  const c = stage(el);
  c.canvas.className = 'laptop3d__canvas';
  const col = (v) => cssColour(holder, v);
  const shellColour = col('--mm-device-body').lerp(col('--mm-device-rim-light'), 0.55);
  const shade = (k) => shellColour.clone().multiplyScalar(k).getStyle();   // the deck's tones, from the shell's own colour
  const m = {
    shell: alloy(kind, shellColour, 0.4),
    glass: glass(col('--mm-device-glass')),
    lens: glass(col('--mm-device-lens-ring'), 0.02),
  };
  const deck = new THREE.MeshStandardMaterial({
    map: deckTexture(el.ownerDocument, { body: shade(0.62), well: shade(0.36), key: shade(0.14), pad: shade(0.7), edge: shade(0.4) }),
    metalness: 0.3, roughness: 0.5, envMapIntensity: 0.45,
  });
  const laptop = new THREE.Group();
  const base = slab(LW, BD, BT, BR, 0.024, [m.shell, m.shell]);
  base.rotation.x = -Math.PI / 2;
  base.position.y = BT / 2;
  const top = plate(LW - 0.05, BD - 0.05, BR - 0.025, deck);
  top.rotation.x = -Math.PI / 2;
  top.position.y = BT + 0.0015;
  top.receiveShadow = true;
  laptop.add(base, top);

  const [side, upper, lower] = FACES[model] ?? FACES.notch;
  const SW = LW - 2 * side, SH = LH - upper - lower;
  const lid = new THREE.Group();                      // pivots on the hinge at the back of the base
  lid.position.set(0, BT, -BD / 2 + 0.05);
  const shell = slab(LW, LH, LT, LR, 0.011, [m.shell, m.shell]);
  shell.position.set(0, LH / 2, -LT / 2);
  const face = plate(LW - 0.014, LH - 0.014, LR - 0.007, m.glass);
  face.position.set(0, LH / 2, 0.001);
  const screen = plate(SW, SH, 0.022, glossy(c.tex));
  screen.position.set(0, lower + SH / 2, 0.002);
  const shine = sheen(el.ownerDocument, LW - 0.014, LH - 0.014, LR - 0.007, 0.16);
  shine.position.set(0, LH / 2, 0.0035);
  const backShine = sheen(el.ownerDocument, LW - 0.03, LH - 0.03, LR - 0.015, 0.3);
  backShine.rotation.y = Math.PI; backShine.position.set(0, LH / 2, -LT - 0.001);
  lid.add(shell, face, screen, shine, backShine);
  let cutout = 'none';
  if (model === 'chin') {
    const cam = disc(0.012, m.lens); cam.position.set(0, LH - upper / 2, 0.0025);
    lid.add(cam);
    cutout = 'chin';
  } else if (model !== 'plain') {
    const nw = 0.075 * SW, nh = 0.032 * SH;
    const notch = plate(nw, nh + 0.02, 0.014, m.glass); notch.position.set(0, LH - upper - nh / 2 + 0.01, 0.0025);
    const cam = disc(0.008, m.lens); cam.position.set(0, LH - upper - nh / 2 + 0.006, 0.003);
    lid.add(notch, cam);
    cutout = 'notch';
  }
  laptop.add(lid);
  c.scene.add(laptop);
  lightAll(c);
  c.floor.position.y = -0.002;
  c.glow.position.set(0, 0.7, -2.2); c.glow.scale.set(4.6, 2.9, 1);
  c.key.position.set(2.5, 5, 4.5);
  Object.assign(c, { kind, laptop, lid, shine, backShine, cutout, model, surface: cssText(holder, '--mm-color-surface'), accent: cssText(holder, '--mm-color-accent') });
  cache.set(el, c);
  return c;
}

export default {
  name: 'laptop',
  group: '3d',
  dur: 'slow',
  fragment: true,
  canvasText: true,   // the top bar's time, network and menu words are drawn into the screen texture
  ambient: true,   // it keeps turning after it arrives: a move until the scene ends (schedule)
  params: {
    move: { type: 'enum(hero|turntable|still|showcase)', default: 'hero', meaning: 'hero turns from the side to facing while the lid opens, then sways; turntable turns slowly the whole time; still holds a slight angle; showcase starts with the back to the viewer and makes a slow half-turn to face it, then holds' },
    status: { type: 'enum(auto|true|false)', default: 'auto', meaning: 'the menu bar (menu items, wifi, battery, time) drawn across the top of the screen: auto shows it on a bare screen and a captured page, and leaves it to a recording or a still, which carry their own' },
    statusTime: { type: 'string', default: '10:00', meaning: 'the time in the menu bar' },
    browser: { type: 'enum(auto|true|false)', default: 'auto', meaning: 'a browser window around the screen picture (three dots, back and forward, an address pill): auto shows it for a captured page, not for a recording or a still' },
    url: { type: 'string', default: '', meaning: 'the address shown in the browser window\'s pill; empty shows the pill with its padlock only' },
    menu: { type: 'string', default: 'File,Edit,View,Window,Help', meaning: 'the menu bar items, comma-separated, the first in bold; at most 6' },
    metal: { type: 'enum(aluminium|titanium)', default: 'aluminium', meaning: 'the frame: satin aluminium in a neutral, faintly cool grey; or titanium, darker and faintly warm with a finer brushed sheen' },
    model: { type: 'enum(notch|chin|plain)', default: 'notch', meaning: 'the face of the lid: a camera notch with thin even bezels; a deeper top with a small camera and a chin; or even bezels and no camera' },
  },
  at(el, p, ctx) {
    const holder = el.querySelector(':scope > .laptop3d');
    if (!holder) return;
    const model = ctx.params?.model ?? 'notch';
    const kind = ctx.params?.metal ?? 'aluminium';
    let c = cache.get(el);
    if (!c || c.model !== model || c.kind !== kind) c = ctx.seeded(() => build(el, holder, model, kind));   // Three.js names objects with Math.random: seeded here
    if (c.canvas.parentElement !== holder) holder.prepend(c.canvas);   // the seek's restore rebuilt the markup
    fitCanvas(c, holder);
    const items = String(ctx.params?.menu ?? 'File,Edit,View,Window,Help').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6);
    c.bar = { ...menuBar(items, String(ctx.params?.statusTime ?? '10:00'), getComputedStyle(holder).getPropertyValue('--mm-font-text').trim() || 'sans-serif', 0.032, String(ctx.params?.url ?? ''), say), status: String(ctx.params?.status ?? 'auto'), browser: String(ctx.params?.browser ?? 'auto') };
    const q = clamp01(p), u = Math.max(0, Number(ctx.u) || 0);
    const move = ctx.params?.move ?? 'hero';
    const ry = turn(move, q, u, ctx) * (move === 'hero' ? 0.75 : 1);
    const opened = move === 'hero' && !(ctx.deck && q >= 1) ? smoothstep01((q - 0.15) / 0.85) : 1;
    const lid = SHUT + (OPEN - SHUT) * opened;
    c.lid.rotation.x = lid;
    c.laptop.rotation.set(0, ry, 0);
    c.laptop.position.set(0, -0.3 * (1 - smoothstep01(q)), 0);
    sweep(c.shine, ry, 0.74);
    sweep(c.backShine, ry + Math.PI, 0.18);
    // the camera looks a little down onto the deck, far enough for the whole notebook in any aspect
    const tan = Math.tan((c.camera.fov * Math.PI) / 360);
    const dist = Math.max(1.0 / tan, 1.35 / (tan * c.camera.aspect));
    c.camera.position.set(0, 0.5 + dist * 0.26, dist);
    c.camera.lookAt(0, 0.48, 0);
    holder.style.opacity = String(Math.round(clamp01(q / 0.4) * 1000) / 1000);
    mark(c, ry, { cutout: c.cutout, lid: Math.round(lid * 1e6) / 1e6 });
    draw(c, holder, ctx);
  },
};
