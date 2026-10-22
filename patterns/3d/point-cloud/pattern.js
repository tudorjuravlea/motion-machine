// 3d/point-cloud: a picture, a mark or the slot's words rebuilt as a free-floating object of sparse,
// glittering points in a void. A cut-out picture is inflated into a pillow by its distance field (a
// picture on a flat ground is keyed first, one on a busy ground refused), a picture with a depth map is
// displaced by it (its far ground removed), an SVG mark and the words are extruded. The reveal: a single
// bright seed lights at the object's centre, bursts into a swirling cloud of pale streaks tinted from the
// accent that spreads past the object, and a front grows from the seed sending each point home, where it
// loses its streak and takes its own colour. At rest the object lives: each point twinkles on its own
// seeded rhythm and the object, turned three-quarters, sways a few degrees. Every position is a closed
// form of the entrance's progress (runtime/kit/points.js flightOf) and the rest a closed form of the
// item's seconds; the twinkle is a closed form in the shader. Colours: the picture's own on a canvas
// declared media, or brand roles (a brightness ramp) with nothing masked; words take the slot's colour
// and rest as the slot's own text, turned with the object. Three.js (vendored) draws plain quads (four
// vertices per point), each a dot with a soft halo or a streak along its motion on screen; the renderer
// is cached per slot and holds GPU resources only; the render runs after the seek's decodes. No clock.
import * as THREE from '../../../runtime/vendor/three/0.170.0/three.module.min.js';
import { samplePicture, paletteRamp, keyBackground, flightOf, FLIGHT } from '../../../runtime/kit/points.js';
import { random } from '../../../runtime/kit/random.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const clamp01 = (x) => clamp(x, 0, 1);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const FOV = 30;          // the lens, degrees of the frame's height
const SAMPLE = 640;      // a raster picture is read at most this many pixels on its long side
const VECTOR = 2048;     // an SVG is read at the size it shows, at most this many pixels on its long side
const FILL = 0.6;        // the object's height, a share of the frame's
const ROOM = 0.94;       // and never more than this share of its slot
const LAND = 0.85;       // the words fade in over the rest of the entrance
const DEPTH_MIN = 0.06;  // a depth map darker than this is ground
const SHUTTER = 0.07;    // seconds of motion a streak shows
const SWAY_S = 7;        // seconds of one sway; the tilt runs on a longer, unrelated cycle
const SPACING = 9;       // px² per front point at density 1 (a point every 3 px)
const SHARE = { pillow: 0.42, extrude: 0.6 };   // the front face's share of the points
const ORIGINS = { center: [0, 0], left: [-0.5, 0], right: [0.5, 0], top: [0, 0.5], bottom: [0, -0.5] };
const clouds = new Map();      // sampled pictures by url and sampling params (a promise of the cloud)
const cache = new WeakMap();   // per slot: the renderer and what it last uploaded
let ids = 0;

const params = {
  points: { type: 'number', default: 16000, meaning: 'the most points the object takes, 2000 to 40000' },
  density: { type: 'number', default: 0.22, meaning: 'how close the points sit, 0.1 (a sparse dust) to 1 (a point every 3 px on the front surface): the count follows the object\'s size on screen, up to `points`' },
  colors: { type: 'enum', values: ['palette', 'source'], default: 'palette', meaning: '`palette` maps the picture\'s tones onto brand roles (neutral parts canvas, muted, ink; vivid parts canvas, accent, ink); `source` keeps its own colours on a canvas declared media. Words always take the slot\'s colour' },
  relief: { type: 'enum', values: ['auto', 'pillow', 'map', 'extrude', 'luma'], default: 'auto', meaning: 'how the points take volume: `pillow` inflates the cut-out by its distance field; `map` reads `depthMap`; `extrude` builds a front, a back and walls along the outline; `luma` brings light pixels forward; `auto` takes `map` with a depth map, `extrude` for an SVG mark and the slot\'s words, else `pillow`' },
  depth: { type: 'number', default: 0.4, meaning: 'how thick the object is, a share of its short side, 0 to 1' },
  depthMap: { type: 'string', default: '', meaning: 'a greyscale picture under assets/ the same shape as the asset, white near and black far; black is ground and takes no point' },
  yaw: { type: 'number', default: 20, meaning: 'the three-quarter turn in degrees the object rests at, -60 to 60 (the slot\'s words face the viewer and only sway, so they stay readable)' },
  sway: { type: 'number', default: 6, meaning: 'how far, in degrees, the object sways round its turn while it rests, 0 to 20' },
  drift: { type: 'number', default: 0.6, meaning: 'how far the burst cloud spreads past the object, 0 to 1' },
  streak: { type: 'number', default: 10, meaning: 'the longest streak, in dot widths, 1 to 40' },
  origin: { type: 'enum', values: ['center', 'left', 'right', 'top', 'bottom'], default: 'center', meaning: 'where on the object the seed lights and the front starts' },
};

const read = (p = {}) => ({
  points: Math.round(clamp(Number(p.points ?? 16000) || 16000, 2000, 40000)),
  density: clamp(Number(p.density ?? 0.22) || 0.22, 0.1, 1),
  colors: p.colors === 'source' ? 'source' : 'palette',
  relief: ['pillow', 'map', 'extrude', 'luma'].includes(p.relief) ? p.relief : 'auto',
  depth: clamp(Number(p.depth ?? 0.4) || 0, 0, 1),
  depthMap: typeof p.depthMap === 'string' ? p.depthMap : '',
  yaw: clamp(Number(p.yaw ?? 20) || 0, -60, 60),
  sway: clamp(Number(p.sway ?? 6) || 0, 0, 20),
  drift: clamp(Number(p.drift ?? 0.6), 0, 1),
  streak: clamp(Number(p.streak ?? 10) || 1, 1, 40),
  origin: ORIGINS[p.origin] ? p.origin : 'center',
});

function linear(ctx, p) {
  if (p >= 1) return 1;
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

// a quad per point (four vertices that share the point's attributes, each with its own corner: plain
// geometry, which software rendering draws far faster than instancing). The vertex shader projects the
// point now and a shutter earlier and spans the quad between them on screen: a round dot with a soft halo
// at rest, a streak along its motion in flight. The cloud pass draws what has not landed in the tint, the
// object pass what has, in its own colour; landed points twinkle (a slow flicker and a rare glint, each
// on its own seeded rhythm, a closed form of the item's seconds).
const VERT = `
attribute vec2 corner; attribute vec3 aPrev; attribute vec2 aState; attribute vec4 aCol; attribute vec3 aLife;
uniform vec2 uRes; uniform vec3 uTint;
uniform float uDot, uHalo, uStreak, uTime, uTwinkle, uAlpha, uDepth, uCue;
varying vec2 vLocal; varying float vHalf; varying float vR; varying vec3 vCol; varying float vA; varying float vGlow;
void main() {
  float land = aState.x;
#ifdef CLOUD
  float w = (1.0 - land) * aState.y;
#else
  float w = land;
#endif
  // depth cue: the near side of the object brighter, the far side dimmer, so the volume reads at rest
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float zc = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
  w *= uAlpha * mix(1.0, clamp(1.0 - uCue + uCue * (mv.z - zc) / uDepth, 1.0 - 2.0 * uCue, 1.0), land);
  if (w < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 b = projectionMatrix * mv;
  vec4 a = projectionMatrix * modelViewMatrix * vec4(aPrev, 1.0);
  vec2 pb = b.xy / b.w * 0.5 * uRes, pa = a.xy / a.w * 0.5 * uRes;
  vec2 dv = pb - pa;
  float len = length(dv);
  if (len > uStreak) { dv *= uStreak / len; len = uStreak; }
  vec2 ax = len > 0.01 ? dv / len : vec2(1.0, 0.0), ay = vec2(-ax.y, ax.x);
  float fl = 0.8 + 0.2 * sin(6.2832 * (uTime * aLife.x + aLife.y));
  float gl = pow(max(0.0, sin(6.2832 * (uTime * aLife.x * 0.31 + aLife.z))), 24.0);
  float on = uTwinkle * land;
  float r = 0.5 * uDot * aCol.w * (1.0 + 0.35 * gl * on);
  float R = r * uHalo;
  float h = 0.5 * len;
  vec2 local = vec2(corner.x * 2.0 * (h + R), corner.y * 2.0 * R);
  vec2 p = pb - ax * h + ax * local.x + ay * local.y;
  gl_Position = vec4(p / (0.5 * uRes) * b.w, b.z, b.w);
  vLocal = local; vHalf = h; vR = r;
  vA = w * mix(1.0, fl + 1.4 * gl, on);
  vGlow = 1.0 + 6.0 * land * (1.0 - land);
#ifdef CLOUD
  vCol = uTint;
#else
  vCol = mix(uTint, aCol.rgb, smoothstep(0.35, 1.0, land));
#endif
}`;
const FRAG = `
uniform float uHalo, uHaloK;
varying vec2 vLocal; varying float vHalf; varying float vR; varying vec3 vCol; varying float vA; varying float vGlow;
void main() {
  float d = length(vec2(max(abs(vLocal.x) - vHalf, 0.0), vLocal.y));
  float core = 1.0 - smoothstep(vR - 0.6, vR + 0.6, d);
  float s = vR * uHalo;
  float halo = exp(-3.0 * d * d / (s * s)) * uHaloK * vGlow;
  float along = vHalf > 0.0 ? clamp(vLocal.x / vHalf * 0.5 + 0.5, 0.0, 1.0) : 1.0;
  float body = mix(0.2, 1.0, along) * sqrt(vR / (vR + vHalf));
  float a = clamp((core + halo) * body * vA, 0.0, 1.0);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * a, a);
}`;
// the seed: one quad at the origin, a hot core in a wide soft glow
const SEED_VERT = `
uniform float uSize; uniform vec2 uRes; varying vec2 vUv;
void main() {
  vec4 c = projectionMatrix * modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vUv = position.xy;
  gl_Position = c + vec4(position.xy * uSize / (0.5 * uRes) * c.w, 0.0, 0.0);
}`;
const SEED_FRAG = `
uniform vec3 uColor; uniform float uPower; varying vec2 vUv;
void main() {
  float d = length(vUv);
  float a = (exp(-d * d * 60.0) + 0.45 * exp(-d * d * 7.0)) * uPower;
  a = clamp(a, 0.0, 1.0);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

const blend = (mat, additive) => Object.assign(mat, {
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendEquationAlpha: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor,
  blendDst: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor, blendDstAlpha: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
});

function build(n) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'mm-pc__canvas';
  canvas.setAttribute('data-3d', '');
  canvas.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene(), group = new THREE.Group();
  scene.add(group);
  const geo = new THREE.BufferGeometry();
  const attr = (size, dynamic) => { const a = new THREE.BufferAttribute(new Float32Array(n * 4 * size), size); if (dynamic) a.setUsage(THREE.DynamicDrawUsage); return a; };
  const aPos = attr(3, true), aPrev = attr(3, true), aState = attr(2, true), aCol = attr(4, false), aLife = attr(3, false), corner = attr(2, false), index = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    corner.array.set([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], i * 8);
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  geo.setAttribute('position', aPos); geo.setAttribute('aPrev', aPrev); geo.setAttribute('corner', corner);
  geo.setAttribute('aState', aState); geo.setAttribute('aCol', aCol); geo.setAttribute('aLife', aLife);
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.setDrawRange(0, 0);
  const shared = { uRes: { value: new THREE.Vector2(1, 1) }, uTint: { value: new THREE.Vector3() }, uDot: { value: 2 }, uHalo: { value: 3 }, uHaloK: { value: 0.3 }, uStreak: { value: 20 }, uTime: { value: 0 }, uTwinkle: { value: 1 }, uDepth: { value: 100 }, uCue: { value: 0.38 } };
  const mat = (cloud) => new THREE.ShaderMaterial({ uniforms: { ...shared, uAlpha: { value: 1 } }, vertexShader: VERT, fragmentShader: FRAG, defines: cloud ? { CLOUD: 1 } : {}, transparent: true, depthTest: false, depthWrite: false });
  const cloudMesh = new THREE.Mesh(geo, mat(true)), objMesh = new THREE.Mesh(geo, mat(false));
  cloudMesh.frustumCulled = false; objMesh.frustumCulled = false;
  cloudMesh.renderOrder = 0; objMesh.renderOrder = 1;
  group.add(cloudMesh, objMesh);
  const seedGeo = new THREE.BufferGeometry();
  seedGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  seedGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new THREE.Mesh(seedGeo, new THREE.ShaderMaterial({ uniforms: { uSize: { value: 0 }, uRes: shared.uRes, uColor: { value: new THREE.Vector3(1, 1, 1) }, uPower: { value: 0 } }, vertexShader: SEED_VERT, fragmentShader: SEED_FRAG, transparent: true, depthTest: false, depthWrite: false }));
  seed.frustumCulled = false; seed.renderOrder = 2;
  group.add(seed);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 1e6);
  return { renderer, canvas, scene, group, geo, aPos, aPrev, aState, aCol, aLife, shared, cloudMesh, objMesh, seed, camera, n, homeKey: null, colKey: null, stateKey: null };
}

// a picture's pixels, read `long` px on its long side (smoothed when scaled)
async function pixelsOf(doc, url, long) {
  const im = doc.createElement('img');
  im.src = url;
  await im.decode();
  const s = long / Math.max(im.naturalWidth, im.naturalHeight);
  const w = Math.max(1, Math.round(im.naturalWidth * s)), h = Math.max(1, Math.round(im.naturalHeight * s));
  const c = doc.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(im, 0, 0, w, h);
  return g.getImageData(0, 0, w, h);
}
const share = (pix, test) => { let t = 0; for (let i = 0; i < pix.width * pix.height; i++) if (test(i)) t++; return t / (pix.width * pix.height); };

// each point's own life, drawn once from the seed: its burst direction (on the sphere), its reach in the
// cloud, its front jitter, its twinkle's rate and phases and its dot's size; the object's bounds and range
function withLives(cloud, seed, vector) {
  const rnd = random(seed ^ 0x5bd1e995), n = cloud.count, life = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, k = Math.sqrt(1 - u * u);
    life.set([k * Math.cos(a), k * Math.sin(a), u, 0.25 + 0.75 * Math.cbrt(rnd()), rnd(), 0.15 + 0.4 * rnd(), rnd(), rnd(), 0.6 + 0.8 * rnd()], i * 9);
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = cloud.pos[i * 3], y = cloud.pos[i * 3 + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return Object.assign(cloud, { id: ++ids, life, range: rangeOf(cloud), box: { x0, x1, y0, y1 }, vector });
}

// the picture's brightness range (1st to 99th percentile), which the palette ramp spans
function rangeOf(cloud) {
  const bins = new Uint32Array(256), n = cloud.count;
  for (let i = 0; i < n; i++) bins[Math.round((2126 * cloud.rgb[i * 3] + 7152 * cloud.rgb[i * 3 + 1] + 722 * cloud.rgb[i * 3 + 2]) / 10000)]++;
  const at = (s) => { let sum = 0; for (let b = 0; b < 256; b++) { sum += bins[b]; if (sum > s * n) return b / 255; } return 1; };
  return { lo: at(0.01), hi: at(0.99) };
}

// a picture as a volume: keyed (or refused), then sampled; null when it cannot become an object
function pictureCloud(doc, url, mapUrl, o) {
  const key = JSON.stringify([url, mapUrl, o]);
  if (!clouds.has(key)) clouds.set(key, (async () => {
    let pix = await pixelsOf(doc, url, o.long).catch(() => null);
    if (!pix) return null;
    const map = mapUrl ? await pixelsOf(doc, mapUrl, Math.min(SAMPLE, o.long)).catch(() => null) : null;
    let relief = o.relief;
    if (relief === 'auto') relief = map ? 'map' : o.vector ? 'extrude' : 'pillow';
    if (relief === 'map' && !map) relief = 'pillow';
    let ground = 'cut';
    const lum = (d, i) => (2126 * d[i * 4] + 7152 * d[i * 4 + 1] + 722 * d[i * 4 + 2]) / 2550000;
    const farShare = map ? share(map, (i) => lum(map.data, i) < DEPTH_MIN) : 0;
    if (!(relief === 'map' && farShare > 0.02)) {
      const k = keyBackground(pix);
      if (!k.pic) return { refused: true };
      if (!k.cut) ground = 'keyed';
      pix = k.pic;
    } else ground = 'map';
    const cloud = samplePicture(pix, { count: o.n, seed: o.seed, relief, depth: o.depth, depthMap: map, depthMin: map ? DEPTH_MIN : 0, jitter: relief === 'pillow' ? 0.04 : 0.08 });
    if (!cloud.count) return { refused: true };
    Object.assign(cloud, { relief, ground });
    return withLives(cloud, o.seed, o.vector);
  })());
  return clouds.get(key);
}

// the slot's words drawn off screen where they are laid out, in the slot's own face and colour
// (canvasText): each word at its left edge on its own baseline, read from a zero-size inline-block
// set at the word's start (its bottom edge sits on the baseline), then extruded behind the text's plane
function textCloud(c, root, words, W, H, o) {
  const cs = getComputedStyle(words), fontPx = parseFloat(cs.fontSize);
  const box = root.getBoundingClientRect(), k = box.width / W || 1;
  const probe = root.ownerDocument.createElement('i');
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  const spots = [...words.children].map((w) => {
    const t = w.textContent;
    w.prepend(probe);
    const r = w.getBoundingClientRect(), base = probe.getBoundingClientRect().bottom;
    probe.remove();
    return [t, Math.round(((r.left - box.left) / k) * 100) / 100, Math.round(((base - box.top) / k) * 100) / 100];
  });
  const font = `${cs.fontStyle} ${cs.fontWeight} ${fontPx}px ${cs.fontFamily}`;
  const key = JSON.stringify([font, cs.letterSpacing, cs.color, W, H, spots, o]);
  if (c.text?.key === key) return c.text.cloud;
  const off = root.ownerDocument.createElement('canvas');
  off.width = W; off.height = H;
  const g = off.getContext('2d', { willReadFrequently: true });
  g.font = font;
  if (cs.letterSpacing !== 'normal') g.letterSpacing = cs.letterSpacing;
  g.fillStyle = cs.color;
  for (const [t, x, y] of spots) g.fillText(t, x, y);
  const cloud = samplePicture(g.getImageData(0, 0, W, H), { count: o.n, seed: o.seed, relief: 'extrude', depth: o.depth, jitter: 0.08 });
  const D = o.depth * Math.min(W, H);
  for (let i = 0; i < cloud.count; i++) cloud.pos[i * 3 + 2] -= D / 2;   // the front face on the text's own plane
  Object.assign(cloud, { relief: 'extrude', ground: 'cut' });
  withLives(cloud, o.seed, false);
  c.text = { key, cloud };
  return cloud;
}

// a CSS colour (a role's variable or a computed value) as [r, g, b]
let pixel = null;
function rgbOf(el, value) {
  const doc = el.ownerDocument, probe = doc.createElement('i');
  probe.style.color = value;
  el.append(probe);
  const css = getComputedStyle(probe).color;
  probe.remove();
  pixel ??= doc.createElement('canvas').getContext('2d', { willReadFrequently: true });
  pixel.clearRect(0, 0, 1, 1);
  pixel.fillStyle = css;
  pixel.fillRect(0, 0, 1, 1);
  const d = pixel.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}
const role = (el, name) => rgbOf(el, `var(--mm-color-${name})`);
const lumOf = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// the instant: homes, colours and lives when their inputs change; flights while the reveal runs
function paint(c, el, cloud, g, q, prm, u) {
  const front = SHARE[cloud.relief] ?? 1;
  const n = Math.min(c.n, cloud.count, Math.max(g.text ? 3000 : 400, Math.round((prm.density * cloud.area * g.k * g.k) / SPACING / front)));
  const { box } = cloud;
  const cx = g.text ? 0 : (box.x0 + box.x1) / 2, cy = g.text ? 0 : (box.y0 + box.y1) / 2;
  const [ox, oy] = ORIGINS[prm.origin];
  const origin = [ox * (box.x1 - box.x0) * g.k, oy * (box.y1 - box.y0) * g.k, 0];
  const homeKey = `${cloud.id}|${g.k}|${n}|${prm.origin}`;
  if (c.homeKey !== homeKey) {
    const home = new Float32Array(n * 3);
    let far = 1, deep = 1;
    for (let i = 0; i < n; i++) {
      const x = (cloud.pos[i * 3] - cx) * g.k, y = (cloud.pos[i * 3 + 1] - cy) * g.k, z = cloud.pos[i * 3 + 2] * g.k;
      home[i * 3] = x; home[i * 3 + 1] = y; home[i * 3 + 2] = z;
      far = Math.max(far, Math.hypot(x - origin[0], y - origin[1], z));
      deep = Math.max(deep, Math.abs(z));
    }
    const life = c.aLife.array;
    for (let i = 0; i < n; i++) {
      const L = cloud.life, b = i * 9;
      for (let v = i * 12; v < i * 12 + 12; v += 3) { life[v] = L[b + 5]; life[v + 1] = L[b + 6]; life[v + 2] = L[b + 7]; }
    }
    c.aLife.needsUpdate = true;
    Object.assign(c, { homeKey, home, far, deep, stateKey: null, colKey: null });
  }
  const canvasRgb = role(el, 'canvas'), inkRgb = role(el, 'ink'), accent = role(el, 'accent');
  const light = lumOf(canvasRgb) > lumOf(inkRgb);
  const ramp = g.text || prm.colors === 'source' ? null : paletteRamp({ canvas: canvasRgb, muted: role(el, 'muted'), ink: inkRgb, accent }, cloud.range);
  const deepen = light && !ramp && !g.text ? 0.78 : 1;   // a picture's own colours, deepened on a light ground so the object reads
  const colKey = `${c.homeKey}|${ramp ? JSON.stringify([canvasRgb, inkRgb, accent]) : `own${deepen}`}`;
  if (c.colKey !== colKey) {
    const col = c.aCol.array;
    for (let i = 0; i < n; i++) {
      const r = cloud.rgb[i * 3], gg = cloud.rgb[i * 3 + 1], b = cloud.rgb[i * 3 + 2];
      const [cr, cg, cb] = ramp ? ramp(r, gg, b) : [r * deepen, gg * deepen, b * deepen];
      for (let v = i * 16; v < i * 16 + 16; v += 4) { col[v] = cr / 255; col[v + 1] = cg / 255; col[v + 2] = cb / 255; col[v + 3] = cloud.life[i * 9 + 8]; }
    }
    c.aCol.needsUpdate = true;
    c.colKey = colKey;
  }
  // the flights: every point's place now and a shutter earlier, while the reveal runs; home once it is done
  const rest = q >= FLIGHT.F1;
  const stateKey = rest ? `${c.homeKey}|rest` : null;
  if (!rest || c.stateKey !== stateKey) {
    const pos = c.aPos.array, prev = c.aPrev.array, st = c.aState.array, L = cloud.life;
    const o = { origin, reach: c.far * (1.15 + 0.8 * prm.drift) * (g.text ? 0.6 : 1), far: c.far, swirl: 4.2, size: c.far * 0.7 };
    const now = [0, 0, 0, 0, 0], was = [0, 0, 0, 0, 0], q0 = Math.max(0, q - g.dq);
    let landed = 0;
    for (let i = 0; i < n; i++) {
      const hx = c.home[i * 3], hy = c.home[i * 3 + 1], hz = c.home[i * 3 + 2], b = i * 9;
      if (rest) { now[0] = was[0] = hx; now[1] = was[1] = hy; now[2] = was[2] = hz; now[3] = 1; now[4] = 1; }
      else {
        flightOf(q, hx, hy, hz, L[b], L[b + 1], L[b + 2], L[b + 3], L[b + 4], o, now);
        flightOf(q0, hx, hy, hz, L[b], L[b + 1], L[b + 2], L[b + 3], L[b + 4], o, was);
      }
      if (now[3] >= 0.5) landed++;
      for (let v = 0; v < 4; v++) {
        const j = i * 4 + v;
        pos[j * 3] = now[0]; pos[j * 3 + 1] = now[1]; pos[j * 3 + 2] = now[2];
        prev[j * 3] = was[0]; prev[j * 3 + 1] = was[1]; prev[j * 3 + 2] = was[2];
        st[j * 2] = now[3]; st[j * 2 + 1] = now[4];
      }
    }
    c.aPos.needsUpdate = true; c.aPrev.needsUpdate = true; c.aState.needsUpdate = true;
    c.stateKey = stateKey;
    c.landed = landed / n;
  }
  c.geo.setDrawRange(0, n * 6);
  c.cloudMesh.visible = !rest;
  // the look: dots of 1 to 3 px with a soft halo; on a light ground larger, firmer and with less halo
  const spacing = Math.sqrt((cloud.area * g.k * g.k) / (n * front));
  const dot = clamp(spacing * 0.42, 1.1, 3.2) * (light ? 1.3 : 1);
  const lightest = [canvasRgb, inkRgb, role(el, 'surface'), role(el, 'muted')].reduce((a, b) => (lumOf(b) > lumOf(a) ? b : a));
  const tint = light ? mixRgb(accent, inkRgb, 0.25) : mixRgb(accent, lightest, 0.55);
  const additive = !light;
  blend(c.cloudMesh.material, additive);
  blend(c.objMesh.material, additive && prm.colors === 'source' && !g.text);   // brand roles rest as plain blends
  blend(c.seed.material, additive);
  const s = c.shared;
  s.uRes.value.set(g.cw, g.ch);
  s.uTint.value.set(tint[0] / 255, tint[1] / 255, tint[2] / 255);
  s.uDot.value = dot;
  s.uHalo.value = light ? 2.2 : 3.2;
  s.uHaloK.value = light ? 0.1 : 0.28;
  s.uStreak.value = prm.streak * dot;
  s.uTime.value = g.deck ? 0 : u;
  s.uTwinkle.value = g.deck ? 0 : 1;
  s.uDepth.value = c.deep;
  s.uCue.value = light ? 0.15 : 0.38;   // a light ground keeps the far side firm, so the object reads
  c.cloudMesh.material.uniforms.uAlpha.value = light ? 0.85 : 0.8;
  c.objMesh.material.uniforms.uAlpha.value = g.text ? 1 - 0.3 * (g.fade ?? 0) : 1;
  // the seed: it lights, flares, and gives itself to the burst
  const seedOn = smooth(0, 0.05, q) * (1 - smooth(FLIGHT.B0 + 0.02, FLIGHT.B0 + 0.16, q));
  const seedRgb = light ? accent : mixRgb(lightest, accent, 0.15);
  c.seed.visible = seedOn > 0.002;
  c.seed.position.set(origin[0], origin[1], origin[2]);
  c.seed.material.uniforms.uSize.value = c.far * (0.12 + 0.3 * smooth(FLIGHT.B0 - 0.02, FLIGHT.B0 + 0.1, q));
  c.seed.material.uniforms.uPower.value = seedOn * 1.6;
  c.seed.material.uniforms.uColor.value.set(seedRgb[0] / 255, seedRgb[1] / 255, seedRgb[2] / 255);
  // the turn: three-quarters, swaying round it while it lives (still in a deck)
  const live = g.deck ? 0 : u;
  const yaw = g.yaw + prm.sway * Math.sin((2 * Math.PI * live) / SWAY_S);
  const tilt = 0.3 * prm.sway * Math.sin((2 * Math.PI * live) / (SWAY_S * 1.37) + 1);
  c.group.rotation.set((tilt * Math.PI) / 180, (yaw * Math.PI) / 180, 0);
  // the camera's eye on the axis through the slot's centre, its frustum spanning the whole canvas
  const near = 1, kz = near / g.dist;
  c.camera.position.set(0, 0, g.dist);
  c.camera.projectionMatrix.makePerspective(g.left * kz, g.right * kz, g.top * kz, g.bottom * kz, near, g.dist * 20);
  c.camera.projectionMatrixInverse.copy(c.camera.projectionMatrix).invert();
  Object.assign(c.canvas.dataset, {
    points: String(n), relief: cloud.relief, ground: cloud.ground, landed: c.landed.toFixed(4), yaw: yaw.toFixed(2), tilt: tilt.toFixed(2),
    colors: g.text ? 'slot' : prm.colors, sample: `${cloud.width}x${cloud.height}`, phase: rest ? 'rest' : q < FLIGHT.B0 ? 'seed' : q < FLIGHT.F0 ? 'burst' : 'front',
    dot: dot.toFixed(2),
  });
  return { yaw, tilt };
}

// A note for the story author in mm.warnings, once per text.
function warn(el, msg) { const w = el.ownerDocument.defaultView?.mm?.warnings; if (Array.isArray(w) && !w.includes(msg)) w.push(msg); }
const selectorOf = (el) => { const sc = el.closest('[data-scene]')?.getAttribute('data-scene'), slot = el.getAttribute('data-slot'); return sc && slot ? `[data-scene="${sc}"] [data-slot="${slot}"]` : 'a point-cloud slot'; };
// an element's layout offset from an ancestor (transforms play no part)
function offsetIn(e, top) {
  const base = (n) => { let a = 0, b = 0; for (let m = n; m; m = m.offsetParent) { a += m.offsetLeft; b += m.offsetTop; } return [a, b]; };
  const [ex, ey] = base(e), [tx, ty] = base(top);
  return [ex - tx, ey - ty];
}

export default {
  name: 'point-cloud',
  group: '3d',
  dur: 'slow',
  fragment: true,
  canvasText: true,
  params,
  at(el, p, ctx) {
    const root = el.querySelector(':scope > .mm-pc');
    if (!root) return;
    const img = root.querySelector(':scope > .mm-pc__img'), words = root.querySelector(':scope > .mm-pc__text');
    const url = img?.getAttribute('src') ? img.src : null;
    const prm = read(ctx.params);
    const q = linear(ctx, p);
    if (ctx.params?.land != null) warn(el, `3d/point-cloud: ${selectorOf(el)}: land is not read; the object rests as points`);
    const fade = clamp01((q - LAND) / (1 - LAND));
    const u = Number.isFinite(ctx.u) ? Math.max(0, ctx.u) : 0;
    if (!url) {
      const text = (words.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (words.children.length === 0 || words.dataset.mmWords !== text) {
        words.textContent = '';
        for (const [i, w] of text.split(' ').entries()) { if (i) words.append(' '); const s = el.ownerDocument.createElement('span'); s.textContent = w; words.append(s); }
        words.dataset.mmWords = text;
      }
      words.style.opacity = fade.toFixed(4);
    } else img.style.display = 'none';
    const W = root.offsetWidth, H = root.offsetHeight;
    if (!W || !H) return;
    const frame = el.closest('[data-scene]') ?? el.ownerDocument.querySelector('.mm-stage') ?? root;
    const FW = frame.offsetWidth || W, FH = frame.offsetHeight || H;
    const seed = Math.floor(ctx.random() * 4294967296);
    const c0 = cache.get(el);
    const c = c0 && c0.n === prm.points ? c0 : ctx.seeded(() => build(prm.points));   // Three.js names objects with Math.random: seeded here
    cache.set(el, c);
    // the canvas covers the whole frame, so the burst can spread past the slot; the world's origin is
    // the slot's centre, one world unit a CSS pixel on the plane through it
    const [rx, ry] = frame === root ? [0, 0] : offsetIn(root, frame);
    const cw = Math.round(FW), ch = Math.round(FH);
    c.canvas.style.left = `${-rx}px`; c.canvas.style.top = `${-ry}px`;
    c.canvas.style.width = `${cw}px`; c.canvas.style.height = `${ch}px`;
    if (url && prm.colors === 'source') c.canvas.setAttribute('data-media', ''); else c.canvas.removeAttribute('data-media');
    root.append(c.canvas);
    if (c.canvas.width !== cw || c.canvas.height !== ch) c.renderer.setSize(cw, ch, false);
    const dist = (ch / 2) / Math.tan((FOV * Math.PI) / 360);
    const view = { left: -rx - W / 2, right: -rx - W / 2 + cw, top: ry + H / 2, bottom: ry + H / 2 - ch, dist, cw, ch };
    const doc = el.ownerDocument;
    const mapUrl = url && prm.depthMap ? new URL(prm.depthMap, doc.baseURI).href : null;
    // a raster picture is read at most SAMPLE px long; an SVG at the size it shows, so a small icon is as crisp as a large mark
    const vector = !!url && (/\.svg([?#]|$)/i.test(url) || url.startsWith('data:image/svg'));
    const natural = url ? Math.max(img.naturalWidth, img.naturalHeight) : 0;
    const long = vector ? Math.min(VECTOR, Math.round(Math.max(W, H))) : Math.min(SAMPLE, natural || SAMPLE);
    const o = { n: prm.points, seed, relief: prm.relief, depth: prm.depth };
    const dq = ctx.d > 0 ? SHUTTER / ctx.d : 0.02;
    const yaw = url ? prm.yaw : 0;   // words face the viewer and only sway
    ctx.afterSettle(async () => {
      const cloud = url ? await pictureCloud(doc, url, mapUrl, { ...o, long, vector }) : textCloud(c, root, words, W, H, o);
      if (!cloud || cloud.refused || !cloud.count) {
        if (cloud?.refused) warn(el, `3d/point-cloud: ${selectorOf(el)}: the picture has no transparent ground and its border is not one flat colour, so it is not drawn; give a cut-out, a depth map or a picture on a flat ground`);
        c.canvas.remove();
        return;
      }
      // the object fills about 60 % of the frame's height, never more than its slot allows; words keep their laid-out size
      const bw = cloud.box.x1 - cloud.box.x0 || 1, bh = cloud.box.y1 - cloud.box.y0 || 1;
      const k = url ? Math.min((FILL * FH) / bh, (ROOM * H) / bh, (ROOM * W) / bw) : 1;
      const turn = paint(c, el, cloud, { k, ...view, text: !url, fade, dq, deck: !!ctx.deck, yaw }, q, prm, u);
      if (!url) {
        // the words turn with the object: the same eye, the same distance, the same turn
        words.style.transformOrigin = '50% 50%';
        words.style.transform = `perspective(${dist.toFixed(2)}px) rotateX(${(-turn.tilt).toFixed(3)}deg) rotateY(${turn.yaw.toFixed(3)}deg)`;
      }
      ctx.seeded(() => c.renderer.render(c.scene, c.camera));   // a first render compiles programs named with Math.random
    });
  },
};
