// device3d: what the 3D devices (3d/phone, 3d/laptop, 3d/tablet) share. A stage (renderer, room
// light for reflections, a key light and a floor shadow), shaped parts (an extruded slab with
// bevelled edges, a flat rounded plate with 0..1 UVs), the materials (metal, glass, a glossy screen
// that emits its picture and reflects the room on top), the copy of a hidden 2D screen into a
// texture, and the pose: a pure function of p (the entrance) and u (seconds since the beat arrived).
// The studio the devices stand in (a light void or a dark room, with softboxes) and the chain that draws
// a frame (supersampling, glow, occlusion, depth of field, contact shadow, mirror floor) are kit/look3d.js.
import * as THREE from '../vendor/three/0.170.0/three.module.min.js';
import { RectAreaLightUniformsLib } from '../vendor/three/0.170.0/lights/RectAreaLightUniformsLib.js';
import { Look, LOOK_PARAMS, lookOf, toneMapped } from './look3d.js';
import { seeded } from './seeded.js';
import { hash } from './random.js';

export { THREE, LOOK_PARAMS, lookOf };
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep01 = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const SHOWCASE = 3.2;   // seconds the showcase half-turn takes

// a CSS variable's resolved colour as text (for the 2D canvas) and as a THREE.Color; any colour
// syntax the browser knows (color-mix included) goes through a 1px canvas to plain rgb
export function cssText(el, v) {
  const probe = el.ownerDocument.createElement('i');
  probe.style.color = `var(${v})`;
  el.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}
let pixel = null;
export function cssColour(el, v) {
  pixel ??= el.ownerDocument.createElement('canvas').getContext('2d', { willReadFrequently: true });
  pixel.clearRect(0, 0, 1, 1);
  pixel.fillStyle = '#000';
  pixel.fillStyle = cssText(el, v);
  pixel.fillRect(0, 0, 1, 1);
  const [r, g, b] = pixel.getImageData(0, 0, 1, 1).data;
  return new THREE.Color(`rgb(${r},${g},${b})`);
}

// a product studio for the reflections: the room the device is lit by, as the metal and glass mirror
// it. dark: a dark room lit by bright softbox strips (overhead, both sides, a box behind the camera that
// the screen catches as glare, and a low strip behind for the rim). light: a white void, graded from a
// pale floor to a bright ceiling, with the same strips and two black flags at the sides that give dark metal
// and glass an edge to read against. brand: the light void tinted by the brand's canvas role.
// Metal and glass mirror the strips as crisp streaks that slide across them as they turn.
function studio(kind = 'dark', tint = null) {
  const s = new THREE.Scene();
  const light = kind !== 'dark';
  const [floor, ceiling, bend] = light ? [0.5, 1.0, 1.2] : [0.02, 0.35, 1.8];
  const void_ = light && tint ? tint : new THREE.Color(1, 1, 1.02);
  const room = new THREE.BoxGeometry(24, 24, 24, 1, 12, 1);   // walls graded from a floor to a ceiling
  const pos = room.attributes.position, tone = [];
  for (let i = 0; i < pos.count; i++) { const k = floor + (ceiling - floor) * ((pos.getY(i) + 12) / 24) ** bend; tone.push(void_.r * k, void_.g * k, void_.b * k); }
  room.setAttribute('color', new THREE.Float32BufferAttribute(tone, 3));
  s.add(new THREE.Mesh(room, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w, h, x, y, z, k, tilt = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    m.rotateZ(tilt);
    s.add(m);
  };
  const k = light ? 1.5 : 1;   // the strips brighter against a bright void
  panel(16, 4, 0, 10, 2, 12 * k);         // overhead softbox
  panel(3.2, 16, -8, 2, 6, 14 * k);       // left strip, in front: the long line down the frame
  panel(3.2, 16, 8.5, 2, 3, 10 * k);      // right strip
  panel(2.2, 18, -2.5, 3, 10, 18 * k, 0.5);   // a narrow slanted strip near the camera: the diagonal sheen that sweeps the glass as it turns
  panel(16, 2, 0, 0, -11, 10 * k);        // low strip behind: the rim
  panel(2, 14, -9, 1, -6, 6 * k);         // a back-left kicker: the far edge
  if (light) { panel(3, 16, -11, 1, -2, 0.02); panel(3, 16, 11, 1, -2, 0.02); }   // flags: black cards at the sides
  return s;
}

// a few rectangular softboxes as real lights: crisp, rectangular highlights on glass and metal from the lights themselves
// (they light standard materials, cast no shadow, and read the linear texture library RectAreaLightUniformsLib.init() installs)
let areaReady = false;
function softboxes(kind, accent) {
  if (!areaReady) { RectAreaLightUniformsLib.init(); areaReady = true; }
  const g = new THREE.Group();
  const box = (w, h, x, y, z, intensity, colour = 0xffffff) => {
    const l = new THREE.RectAreaLight(colour, intensity, w, h);
    l.position.set(x, y, z);
    l.lookAt(0, 0, 0);
    g.add(l);
  };
  const k = kind === 'dark' ? 0.6 : 1;
  box(4, 1.5, 0, 4.2, 1.5, 6 * k);          // overhead
  box(0.9, 4, -3.6, 0.8, 2.6, 7 * k);       // left strip
  box(0.7, 3.6, 3.8, 0.6, 1.8, 5 * k);      // right strip
  if (kind === 'brand') box(0.6, 3.6, 3.6, 1.2, -3.2, 8, accent);   // the accent role as a rim from behind
  return g;
}

// What the stage draws around the device, the floor's shadow of the key light and the lit backdrop's glow,
// fades to nothing toward each edge of the canvas (its last 14 %), and the shadow also away from the device's
// foot (from `reach` out to 1.6 times it, set by lightAll): a slot narrower than the frame, or a shadow longer
// than the floor, never ends in a hard line. `u` holds the canvas size (fitCanvas) and the reach.
function softEdges(m, u, radial) {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    if (radial) shader.vertexShader = `varying vec2 vMmFloor;\n${shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vMmFloor = position.xy;')}`;
    const fade = radial ? ' * ( 1.0 - smoothstep( mmReach, mmReach * 1.6, length( vMmFloor ) ) )' : '';
    const fs = shader.fragmentShader, end = fs.lastIndexOf('}');
    shader.fragmentShader = `uniform vec2 mmView; uniform float mmReach;${radial ? ' varying vec2 vMmFloor;' : ''}
float mmEdge() { vec2 q = gl_FragCoord.xy / mmView; vec2 e = smoothstep( 0.0, 0.14, q ) * smoothstep( 0.0, 0.14, 1.0 - q ); return e.x * e.y; }
${fs.slice(0, end)}  gl_FragColor.a *= mmEdge()${fade};\n}${fs.slice(end + 1)}`;
  };
  m.customProgramCacheKey = () => `mm-soft-edges ${radial ? 'floor' : 'glow'}`;
  return m;
}

export function stage(el, cfg = {}) {
  const kind = ['light', 'dark', 'brand'].includes(cfg.studio) ? cfg.studio : 'light';
  const doc = el.ownerDocument;
  // antialias is off: the frame is drawn into a half-float target and the output pass writes the canvas
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;   // a soft-edged shadow: the key light's, and the floor catches it
  renderer.outputColorSpace = THREE.SRGBColorSpace;   // the output pass writes it; tone mapping is in the materials (toneMapped), so the screen opts out
  const canvas = renderer.domElement;
  canvas.setAttribute('data-media', '');
  canvas.setAttribute('data-3d', '');
  const scene = new THREE.Scene();
  const tint = kind === 'brand' ? cssColour(el, '--mm-color-canvas').lerp(new THREE.Color(1, 1, 1), 0.35) : null;
  const accent = kind === 'brand' ? cssColour(el, '--mm-color-accent') : null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const wide = pmrem._setSize;   // three.js renders the studio at 256; at 512 the strips mirror crisper on metal
  if (typeof wide === 'function') pmrem._setSize = function () { wide.call(this, 512); };
  const env = pmrem.fromScene(studio(kind, tint), 0.01).texture;
  const edges = { mmView: { value: new THREE.Vector2(1, 1) }, mmReach: { value: 1.6 } };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), softEdges(new THREE.ShadowMaterial({ opacity: 0.28 }), edges, true));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.catcher = true;
  floor.userData.cast = 0.28;   // how dark the key light's shadow is (the look eases it as the contact shadow takes over)
  scene.add(floor);
  const key = new THREE.DirectionalLight(0xffffff, kind === 'dark' ? 1.5 : 1.1);
  key.position.set(2.5, 4.5, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 7; key.shadow.blurSamples = 12;
  key.shadow.camera.left = key.shadow.camera.bottom = -4.5;
  key.shadow.camera.right = key.shadow.camera.top = 4.5;
  key.shadow.camera.near = 1; key.shadow.camera.far = 16;
  scene.add(key);
  for (const [x, v] of [[-4, 2.2], [4, 1.6]]) {      // rim lights from behind: a bright edge on the metal
    const rim = new THREE.DirectionalLight(0xffffff, kind === 'dark' ? v : v * 0.7);
    rim.position.set(x, 2.5, -4);
    scene.add(rim);
  }
  scene.add(softboxes(kind, accent));
  const halo = doc.createElement('canvas');   // a soft glow behind the device, like a lit backdrop
  halo.width = halo.height = 256;
  const hg = halo.getContext('2d'), grad = hg.createRadialGradient(128, 128, 0, 128, 128, 128), lit = new THREE.Color(1, 1, 1);
  grad.addColorStop(0, lit.getStyle()); grad.addColorStop(0.45, `rgba(${lit.r * 255},${lit.g * 255},${lit.b * 255},0.45)`); grad.addColorStop(1, `rgba(${lit.r * 255},${lit.g * 255},${lit.b * 255},0)`);
  hg.fillStyle = grad; hg.fillRect(0, 0, 256, 256);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), softEdges(new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(halo), transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }), edges, false));
  glow.renderOrder = -1;
  glow.userData.noDepth = true;
  scene.add(glow);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.5, 60);
  const tex2d = doc.createElement('canvas');
  const tex = new THREE.CanvasTexture(tex2d);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { renderer, canvas, scene, env, floor, key, glow, camera, tex, tex2d, studio: kind, edges };
}

export function rrect(w, h, r) {
  const s = new THREE.Shape(), x = w / 2, y = h / 2;
  r = Math.min(r, x, y);
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y); s.absarc(x - r, -y + r, r, -Math.PI / 2, 0);
  s.lineTo(x, y - r); s.absarc(x - r, y - r, r, 0, Math.PI / 2);
  s.lineTo(-x + r, y); s.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI);
  s.lineTo(-x, -y + r); s.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}

// Standard materials only: the physical ones (clearcoat) take seconds longer to compile in software.
// Gives every material the studio as its own envMap: three.js ignores a material's envMapIntensity
// when the light comes from scene.environment, and each part here reflects by its own amount
// Also gives each material its tone mapping (in its own shader: the screen opts out) and, with
// `opts` ({ body, focus, reach, height }: the device group, a point of it that stays in focus, how far its
// shadow and reflection reach and how tall it is), builds the stage's look: the chain that draws the frame.
export function lightAll(c, opts) {
  c.scene.traverse((o) => {
    for (const mt of [o.material ?? []].flat()) {
      if (mt.isMeshStandardMaterial) {
        mt.envMap = c.env; mt.needsUpdate = true;
        // a bright void mirrors far more than the dark room did: the screen and the glass take less of it, so the picture
        // stays as it is and the bezel stays dark
        if (c.studio !== 'dark' && mt.metalness === 0 && !mt.userData.envScaled) { mt.userData.envScaled = true; mt.envMapIntensity *= mt.userData.glowSource ? 0.2 : 0.45; }
      }
      if (mt.isMeshStandardMaterial || mt.isShadowMaterial) toneMapped(mt);
    }
  });
  if (opts?.reach && c.edges) c.edges.mmReach.value = opts.reach;
  if (opts) c.look = new Look(c, opts);
}

// a w x h x d slab centred on the origin, corners of radius r, edges bevelled by b; mats: [faces, sides]
export function slab(w, h, d, r, b, mats) {
  const g = new THREE.ExtrudeGeometry(rrect(w - 2 * b, h - 2 * b, Math.max(0.001, r - b)), {
    depth: Math.max(0.0005, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 5, curveSegments: 24,
  });
  g.translate(0, 0, -(d - 2 * b) / 2);
  const m = new THREE.Mesh(g, mats);
  m.castShadow = true;
  return m;
}

// a flat rounded plate facing +z whose UVs run 0..1 across it (a picture maps onto it whole)
export function plate(w, h, r, mat) {
  const g = new THREE.ShapeGeometry(rrect(w, h, r), 24);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return new THREE.Mesh(g, mat);
}

// a sheen: a soft slanted band of light over a glass face, added on top; sweep() slides it across as
// the device turns, so the glass flashes the way a product film's does (a flat face mirrors too narrow
// a cone of the studio to make that band by itself)
// the light adds up in linear light now, where it once added up in the screen's encoded values: the same band is
// brighter on dark glass, so its strength is eased to the look it was tuned to
const SHEEN_LINEAR = 0.7;
export function sheen(doc, w, h, r, opacity) {
  const cv = doc.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d'), lit = (a) => `rgba(255,255,255,${a})`;
  g.translate(256, 256); g.rotate(-0.42);
  const band = (x, half, peak) => {
    const grad = g.createLinearGradient(x - half, 0, x + half, 0);
    grad.addColorStop(0, lit(0)); grad.addColorStop(0.3, lit(peak * 0.35)); grad.addColorStop(0.5, lit(peak)); grad.addColorStop(0.7, lit(peak * 0.35)); grad.addColorStop(1, lit(0));
    g.fillStyle = grad; g.fillRect(x - half, -700, half * 2, 1400);
  };
  band(0, 70, 1); band(95, 22, 0.6);   // a broad band and a thin echo beside it
  g.setTransform(1, 0, 0, 1, 0, 0);    // a clear border: the texture clamps to its edge pixels when the band slides off
  g.clearRect(0, 0, 512, 3); g.clearRect(0, 509, 512, 3); g.clearRect(0, 0, 3, 512); g.clearRect(509, 0, 3, 512);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = plate(w, h, r, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: opacity * SHEEN_LINEAR, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.userData.noDepth = true;   // a layer of light, not a surface: the depth and normal passes skip it
  return m;
}
// slide a sheen: a is the face's turn from facing the viewer (radians); at 0 the band sits at rest
export function sweep(m, a, rest) {
  const t = Math.atan2(Math.sin(a), Math.cos(a));
  m.material.map.offset.x = rest + t * 1.15;
}

export function disc(r, mat) { return new THREE.Mesh(new THREE.CircleGeometry(r, 40), mat); }

export const metal = (color, roughness = 0.14) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness });
// anodised aluminium: the finish's lightness in a neutral, faintly cool grey (no warm nickel cast) and a
// satin surface, so the softboxes spread into soft wide highlights instead of mirror lines
// A brushed grain (`brushed` above 0) stretches the highlight along the grain, the streak of a brushed
// alloy: a physical material with anisotropy, which costs more to compile and to draw than a standard one.
const satin = (color, roughness, brushed) => (brushed > 0
  ? new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness, anisotropy: brushed, anisotropyRotation: Math.PI / 2 })
  : new THREE.MeshStandardMaterial({ color, metalness: 1, roughness }));
export function aluminium(color, roughness = 0.34, brushed = 0) {
  const l = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return satin(new THREE.Color(l * 0.97, l * 0.99, l * 1.03), roughness, brushed);
}
// titanium: darker than aluminium and faintly warm, with a finer brushed sheen
export function titanium(color, roughness = 0.26, brushed = 0) {
  const l = 0.62 * (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b);
  return satin(new THREE.Color(l * 1.03, l * 1.0, l * 0.95), roughness, brushed);
}
export const alloy = (kind, color, roughness, brushed = 0) => (kind === 'titanium' ? titanium(color, undefined, brushed) : aluminium(color, roughness, brushed));
export const glass = (color, roughness = 0.04, envMapIntensity = 0.35) => new THREE.MeshStandardMaterial({ color, metalness: 0, roughness, envMapIntensity });
// the screen: the picture is emitted as it is, lit by nothing (the rectangular softboxes would lay a veil over it);
// the sheen carries the glare
export function glossy(tex) {
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  m.userData.glowSource = true;   // the look blooms this surface's picture
  return m;
}

// copy the hidden screen into the texture, from its pictures' live boxes (scroll, zoom, swap)
export function paintScreen(c, scr) {
  const box = scr.getBoundingClientRect();
  const k = 2;                                            // texture pixels per css px
  const w = Math.max(2, Math.round(box.width * k)), h = Math.max(2, Math.round(box.height * k));
  if (c.tex2d.width !== w || c.tex2d.height !== h) { c.tex2d.width = w; c.tex2d.height = h; }
  const g = c.tex2d.getContext('2d');
  g.save();
  g.fillStyle = c.surface; g.fillRect(0, 0, w, h);
  // the paint's own choice (the hidden screen hides all by inheritance), in stacking order: a swap or
  // a compare raises its layer with z-index, and the flat screen honours it, so the texture must too
  const z = (el) => Number(el.style.zIndex) || 0;
  const shown = [...scr.querySelectorAll('.mm-screen__content')].filter((el) => el.style.visibility !== 'hidden').map((el, i) => ({ el, i })).sort((a, b) => z(a.el) - z(b.el) || a.i - b.i).map((x) => x.el);
  const own = shown.some((el) => [...el.querySelectorAll('img.mm-screen__media')].some((i) => i.complete && i.naturalWidth));   // a recording or a still carries its own status bar
  const bar = !!c.bar && (c.bar.status === 'true' || (c.bar.status !== 'false' && !own));
  const page = !own && shown.length > 0;                  // a captured page: the laptop shows it in a browser window
  const win = !!c.bar?.browser && (c.bar.browser === 'true' || (c.bar.browser !== 'false' && page));
  const inset = Math.round(c.bar ? c.bar.inset(bar && !own, win) * h : 0);   // a page starts below the bars, as on a real screen
  g.translate(0, inset);
  let frame = null;
  for (const content of shown) {
    g.globalAlpha = content.style.opacity === '' ? 1 : Number(content.style.opacity);
    const clip = content.dataset.clip != null ? Number(content.dataset.clip) : null;   // screen/compare: only right of the line
    if (clip != null) { g.save(); g.beginPath(); g.rect(clip * w, -inset, w, h + inset); g.clip(); }
    for (const img of content.querySelectorAll('img')) {
      if (!img.complete || !img.naturalWidth) continue;
      const r = img.getBoundingClientRect();
      const x = (r.left - box.left) * k, y = (r.top - box.top) * k, dw = r.width * k, dh = r.height * k;
      if (img.classList.contains('mm-screen__media')) {
        // object-fit: cover, as the flat device draws it
        const s = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
        const sw = dw / s, sh = dh / s;
        g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, dw, dh);
        frame = img.getAttribute('src');
      } else g.drawImage(img, x, y, dw, dh);
    }
    if (clip != null) g.restore();
  }
  g.globalAlpha = 1;
  const divider = scr.querySelector('.mm-screen-fx[data-do="screen/compare"]');
  if (divider && divider.style.display === 'block') {   // screen/compare's line and knob, drawn into the glass
    const x = Number(divider.dataset.x) * w, lw = Math.max(2, w * 0.008), r = w * 0.045;
    g.fillStyle = c.accent; g.fillRect(x - lw / 2, -inset, lw, h + inset);
    g.beginPath(); g.arc(x, h / 2 - inset, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = c.surface; g.beginPath(); g.arc(x, h / 2 - inset, r * 0.45, 0, Math.PI * 2); g.fill();
    c.canvas.dataset.compare = divider.dataset.x;
  } else delete c.canvas.dataset.compare;
  for (const ring of scr.querySelectorAll('.mm-screen-fx .tap')) {
    if (ring.parentElement.style.display === 'none') continue;
    const r = ring.getBoundingClientRect();
    g.globalAlpha = ring.style.opacity === '' ? 1 : Number(ring.style.opacity);
    g.strokeStyle = c.accent; g.lineWidth = Math.max(2, r.width * k * 0.06);
    g.beginPath(); g.arc((r.left + r.width / 2 - box.left) * k, (r.top + r.height / 2 - box.top) * k, r.width * k / 2, 0, Math.PI * 2); g.stroke();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  if (inset) {                                             // the bar's band: the page's own top colour, read from the top of
    const band = pageTop(c, shown, scr.ownerDocument);     // the captured page, not from what scrolls under it (no smear)
    g.fillStyle = band; g.fillRect(0, 0, w, inset);
    c.canvas.dataset.band = band;
  } else delete c.canvas.dataset.band;
  if (bar || win) c.bar.draw(g, w, h, topTone(g, w, h), bar, win);
  c.canvas.dataset.browser = win ? 'on' : 'off';
  c.canvas.dataset.status = bar ? c.bar.time : 'off';
  g.restore();
  c.tex.needsUpdate = true;
  return frame;
}

// the colour at the very top of a captured page (its first tile's first rows), cached per tile: the
// band behind a top bar keeps it while the page scrolls, as a phone keeps a page's theme colour
function pageTop(c, shown, doc) {
  const tile = shown.flatMap((el) => [...el.querySelectorAll('img')]).find((i) => i.complete && i.naturalWidth && !i.classList.contains('mm-screen__media'));
  if (!tile) return c.surface;
  const src = tile.getAttribute('src');
  c.tops ??= new Map();
  if (!c.tops.has(src)) {
    pixel ??= doc.createElement('canvas').getContext('2d', { willReadFrequently: true });
    pixel.clearRect(0, 0, 1, 1);
    pixel.drawImage(tile, 0, 0, tile.naturalWidth, Math.min(6, tile.naturalHeight), 0, 0, 1, 1);
    const [r, g, b] = pixel.getImageData(0, 0, 1, 1).data;
    c.tops.set(src, `rgb(${r},${g},${b})`);
  }
  return c.tops.get(src);
}

// is the top of the picture light? the bar's text goes dark on light content and light on dark
function topTone(g, w, h) {
  const d = g.getImageData(0, 0, w, Math.max(1, Math.round(h * 0.06))).data;
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4 * 37) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
  return sum / Math.max(1, n) > 140;
}
const ink = (light, a = 1) => { const k = light ? 0 : 255; return `rgba(${k},${k},${k},${a})`; };

// the glyphs of devices/phone, in their viewBox units (signal 18 x 12, wifi 16 x 12, battery 27 x 12)
function glyph(g, kind, x, y, s, light) {
  g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = ink(light); g.strokeStyle = ink(light, 0.45); g.lineWidth = 1;
  if (kind === 'signal') for (const [bx, by, bh] of [[0, 8, 4], [5, 5.5, 6.5], [10, 3, 9], [15, 0, 12]]) { g.beginPath(); g.roundRect(bx, by, 3, bh, 1); g.fill(); }
  else if (kind === 'wifi') {
    g.beginPath(); g.moveTo(8, 11.5); g.lineTo(5.6, 9); g.arc(8, 11.5, 3.4, Math.PI * 1.25, Math.PI * 1.75); g.closePath(); g.fill();
    for (const [r, t] of [[6.6, 2], [9.8, 2]]) { g.beginPath(); g.arc(8, 11.5, r, Math.PI * 1.25, Math.PI * 1.75); g.arc(8, 11.5, r - t, Math.PI * 1.75, Math.PI * 1.25, true); g.closePath(); g.fill(); }
  } else {
    g.beginPath(); g.roundRect(0.5, 0.5, 23, 11, 3); g.stroke();
    g.beginPath(); g.roundRect(2, 2, 17, 8, 1.6); g.fill();
    g.globalAlpha = 0.45; g.beginPath(); g.roundRect(24.5, 4, 2, 4, 1); g.fill();
  }
  g.restore();
}

// a phone's status bar: the time in the left ear, signal, network and battery in the right, on the
// cutout's centre line (island: as devices/phone places it; punch: an edge-aligned bar)
export function phoneBar(model, time, font, say) {   // say(g, text, x, y): the pattern's own text call (it declares canvasText)
  return {
    time,
    inset: (show) => (show ? (model === 'punch' ? 0.062 : 0.066) : 0),
    draw(g, w, h, light, show) {
      if (!show) return;
      const u = w / 393, y = model === 'punch' ? h * 0.0196 + w * 0.0355 : h * 0.0377;
      const s = u * 0.95, gy = y - 6 * s;
      g.fillStyle = ink(light); g.textBaseline = 'middle';
      g.font = `600 ${Math.round(16.5 * u)}px ${font}`;
      if (model === 'punch') {
        g.textAlign = 'left'; say(g, time, w * 0.075, y);
        let x = w * 0.925 - 27 * s;
        glyph(g, 'battery', x, gy, s, light); x -= 6 * s + 18 * s;
        glyph(g, 'signal', x, gy, s, light); x -= 4 * s;
        g.textAlign = 'right'; g.font = `600 ${Math.round(12.5 * u)}px ${font}`; say(g, '5G', x, y);
      } else {
        g.textAlign = 'center'; say(g, time, w * 0.205, y);
        const total = (18 + 5 + 16 + 5 + 27) * s;
        let x = w * 0.805 - total / 2;
        glyph(g, 'signal', x, gy, s, light); x += 23 * s;
        glyph(g, 'wifi', x, gy, s, light); x += 21 * s;
        glyph(g, 'battery', x, gy, s, light);
      }
    },
  };
}

// a laptop's menu bar across the top of the screen: menu items on the left (the first bold), wifi,
// battery and the time on the right, on a translucent band that follows the content's tone
export function menuBar(items, time, font, height, url, say) {
  const tool = 0.058;   // the browser's toolbar, below the menu bar
  return {
    time,
    inset: (show, win) => (show ? height : 0) + (win ? tool : 0),
    draw(g, w, h, light, show, win) {
      const bh = show ? h * height : 0;
      if (win) {                                           // a browser window: three dots, back and forward, an address pill
        const tb = h * tool, y0 = bh, cy = y0 + tb / 2, k = light ? 246 : 40;
        g.fillStyle = `rgb(${k},${k},${k})`; g.fillRect(0, y0, w, tb);
        g.fillStyle = ink(light, 0.12); g.fillRect(0, y0 + tb - Math.max(1, tb * 0.03), w, Math.max(1, tb * 0.03));
        for (let i = 0; i < 3; i++) { g.fillStyle = ink(light, 0.22); g.beginPath(); g.arc(tb * 0.5 + i * tb * 0.36, cy, tb * 0.1, 0, Math.PI * 2); g.fill(); }
        g.strokeStyle = ink(light, 0.5); g.lineWidth = Math.max(1.5, tb * 0.05); g.lineCap = 'round';
        for (const [x, dir] of [[tb * 1.75, -1], [tb * 2.25, 1]]) { g.beginPath(); g.moveTo(x - dir * tb * 0.08, cy - tb * 0.14); g.lineTo(x + dir * tb * 0.08, cy); g.lineTo(x - dir * tb * 0.08, cy + tb * 0.14); g.stroke(); }
        const pw = Math.min(w * 0.46, w - tb * 6), ph = tb * 0.62, px = (w - pw) / 2;
        g.fillStyle = light ? `rgb(${k - 18},${k - 18},${k - 18})` : `rgb(${k + 22},${k + 22},${k + 22})`;
        g.beginPath(); g.roundRect(px, cy - ph / 2, pw, ph, ph / 2); g.fill();
        g.font = `400 ${Math.round(ph * 0.5)}px ${font}`; g.textBaseline = 'middle'; g.textAlign = 'center';
        const label = url || '';
        const tw = label ? g.measureText(label).width : 0, lx = w / 2 - tw / 2 - ph * 0.42;
        g.fillStyle = ink(light, 0.45);                    // a padlock before the address
        g.beginPath(); g.roundRect(lx - ph * 0.13, cy - ph * 0.04, ph * 0.26, ph * 0.22, ph * 0.04); g.fill();
        g.strokeStyle = ink(light, 0.45); g.lineWidth = Math.max(1, ph * 0.06);
        g.beginPath(); g.arc(lx, cy - ph * 0.05, ph * 0.09, Math.PI, 0); g.stroke();
        if (label) { g.fillStyle = ink(light, 0.7); say(g, label, w / 2, cy); }
      }
      if (!show) return;
      g.fillStyle = light ? `rgba(255,255,255,0.62)` : `rgba(0,0,0,0.38)`;
      g.fillRect(0, 0, w, bh);
      g.fillStyle = ink(light); g.textBaseline = 'middle'; g.textAlign = 'left';
      let x = bh * 0.8;
      items.forEach((it, i) => {
        g.font = `${i ? 400 : 700} ${Math.round(bh * 0.56)}px ${font}`;
        say(g, it, x, bh / 2); x += g.measureText(it).width + bh * 0.85;
      });
      g.textAlign = 'right'; g.font = `500 ${Math.round(bh * 0.56)}px ${font}`;
      let r = w - bh * 0.8;
      say(g, time, r, bh / 2); r -= g.measureText(time).width + bh * 0.7;
      const s = bh * 0.042, gy = bh / 2 - 6 * s;
      glyph(g, 'battery', r - 27 * s, gy, s, light); r -= 27 * s + bh * 0.6;
      glyph(g, 'wifi', r - 16 * s, gy, s, light);
    },
  };
}

// the cross move: facing the viewer at `from` (a fraction of the holder's width from its
// centre), then from crossAt for crossFor seconds after arrival, one smooth move to `to` with one full
// turn, the back to the viewer half-way (where a screen swap goes unseen); a deck rests at `to`
export function cross(q, u, prm = {}, ctx = {}) {
  const from = Number(prm.from ?? -0.28), to = Number(prm.to ?? 0.28);
  const at = Number(prm.crossAt ?? 2), dur = Math.max(0.1, Number(prm.crossFor ?? 2.4));
  const k = ctx.deck ? (q >= 1 ? 1 : 0) : smoothstep01((u - at) / dur);
  return { x: from + (to - from) * k, ry: ctx.deck && k === 1 ? 0 : -2 * Math.PI * k };
}

// the turn about the vertical axis for a move; a deck rest faces the viewer
export function turn(move, q, u, ctx) {
  const deck = !!ctx.deck;
  if (deck && q >= 1) return 0;
  if (move === 'turntable') return deck ? 0 : -0.5 + u * 0.35;
  if (move === 'still') return deck ? 0 : -0.25;
  if (move === 'showcase') return -Math.PI * (1 - smoothstep01(deck ? q : u / SHOWCASE));
  return (1 - smoothstep01(q)) * -1.35 + (deck || q < 1 ? 0 : 0.06 * Math.sin((u - (ctx.d ?? 0)) * 0.9));
}

const LOOK_SEED = hash('look3d');

// size the canvas and the camera to the holder
// With the beat's params, also sets the look's chain (anti-aliasing, glow, occlusion ...) from them.
export function fitCanvas(c, holder, params) {
  if (c.look && params) {
    const cfg = lookOf(params, holder.ownerDocument.documentElement.hasAttribute('data-render'));
    seeded(LOOK_SEED, () => c.look.configure(cfg));   // new targets and passes: Three.js names them randomly, so seeded here
    c.canvas.dataset.aa = cfg.aa;
    c.canvas.dataset.studio = cfg.studio;
  }
  const cw = Math.max(2, Math.round(holder.clientWidth)), ch = Math.max(2, Math.round(holder.clientHeight));
  c.edges?.mmView.value.set(cw, ch);
  if (c.canvas.width !== cw || c.canvas.height !== ch) {
    c.renderer.setSize(cw, ch, false);
    c.camera.aspect = cw / ch;
    c.camera.updateProjectionMatrix();
  }
  if (c.look) seeded(LOOK_SEED, () => c.look.setSize(cw, ch));
}

// the readouts the tests and the gate see: the turn, which face shows, the cutout built
export function mark(c, ry, extra = {}) {
  const d = c.canvas.dataset;
  d.ry = String(Math.round(ry * 1e6) / 1e6);
  d.face = Math.cos(ry) < 0 ? 'back' : 'front';
  for (const [k, v] of Object.entries(extra)) d[k] = String(v);
}

// render after the seek's decodes, with the screen copied for this t
export function draw(c, holder, ctx) {
  const scr = holder.querySelector('[data-screen]');
  ctx.afterSettle(() => ctx.seeded(() => {   // a first render compiles programs, and Three.js names them randomly: seeded here
    const frame = scr ? paintScreen(c, scr) : null;
    if (frame) c.canvas.dataset.frame = frame; else delete c.canvas.dataset.frame;
    if (c.look) c.look.render(); else c.renderer.render(c.scene, c.camera);
  }));
}
