// 3d/particles-to-shape: the words gather out of a cloud in real depth. Seeded particles start on a
// shell around the slot, in front of and behind it, and fly in through a slowly turning 3D space to
// points sampled from the words' own letterforms; as they land the real text fades in and the
// particles fade out. At p = 1 the slot is its plain text and the canvas is gone. Three.js
// (vendored) draws the points on a canvas declared media and 3D; the sampling text is drawn off
// screen only (canvasText: true). The renderer is cached per slot and holds GPU resources only;
// every random draw comes from the slot's seed in a fixed order. No clock, no animation loop.
import * as THREE from '../../../runtime/vendor/three/0.170.0/three.module.min.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const out3 = (x) => 1 - (1 - x) ** 3;
const LAND = 0.78, LATE = 0.3;
const cache = new WeakMap();

const params = {
  particles: { type: 'number', default: 900, meaning: 'how many particles build the words, 300 to 2400' },
  depth: { type: 'number', default: 1, meaning: 'how deep the cloud reaches in front of and behind the words, 0.3 to 1.6' },
};

function linear(ctx, p) {
  if (p >= 1) return 1;
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

function build(n) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = 'mm-p3d';
  canvas.setAttribute('data-media', '');
  canvas.setAttribute('data-3d', '');
  canvas.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({ size: 4, sizeAttenuation: true, transparent: true, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 100000);
  return { renderer, canvas, scene, points, geo, mat, camera, n };
}

export default {
  name: 'particles-to-shape',
  group: '3d',
  dur: 'slow',
  canvasText: true,
  params,
  at(el, p, ctx) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const q = linear(ctx, p);
    if (q >= 1 || !text) { el.textContent = text; return; }
    const doc = el.ownerDocument;
    el.textContent = '';
    const holder = doc.createElement('span');
    holder.className = 'mm-p3d__text';
    for (const [i, w] of text.split(' ').entries()) { if (i) holder.append(' '); const s = doc.createElement('span'); s.textContent = w; holder.append(s); }
    el.append(holder);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const W = el.offsetWidth, H = el.offsetHeight;
    if (!W || !H) return;
    const box = el.getBoundingClientRect(), k = box.width / W || 1;
    const cs = getComputedStyle(holder);
    const fontPx = parseFloat(cs.fontSize);
    // the sampling target: each word drawn off screen at its own laid-out box, read on a grid
    const off = doc.createElement('canvas');
    off.width = W; off.height = H;
    const g = off.getContext('2d', { willReadFrequently: true });
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${fontPx}px ${cs.fontFamily}`;
    if (cs.letterSpacing !== 'normal') g.letterSpacing = cs.letterSpacing;
    for (const w of holder.children) { const r = w.getBoundingClientRect(); g.fillText(w.textContent, (r.left - box.left) / k, (r.bottom - box.top) / k - fontPx * 0.22); }
    const px = g.getImageData(0, 0, W, H).data;
    const step = Math.max(2, Math.round(fontPx / 22));
    const spots = [];
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (px[(y * W + x) * 4 + 3] > 128) spots.push([x, y]);
    if (!spots.length) return;
    const n = Math.min(2400, Math.max(300, Math.round(Number(ctx.params?.particles ?? 900))));
    const depth = Math.min(1.6, Math.max(0.3, Number(ctx.params?.depth ?? 1)));
    const c0 = cache.get(el);
    const c = c0 && c0.n === n ? c0 : ctx.seeded(() => build(n));   // Three.js names objects with Math.random: seeded here
    cache.set(el, c);
    const M = Math.round(fontPx * 1.5);                              // the canvas reaches past the slot
    const cw = W + 2 * M, ch = H + 2 * M;
    c.canvas.style.left = `${-M}px`; c.canvas.style.top = `${-M}px`;
    el.append(c.canvas);
    if (c.canvas.width !== cw || c.canvas.height !== ch) { c.renderer.setSize(cw, ch, false); c.camera.aspect = cw / ch; }
    // a camera that maps the z = 0 plane 1:1 onto the canvas's pixels, so the landed words match the DOM
    const dist = (ch / 2) / Math.tan((c.camera.fov * Math.PI) / 360);
    c.camera.position.set(0, 0, dist); c.camera.lookAt(0, 0, 0); c.camera.updateProjectionMatrix();
    const R = Math.hypot(W, H) * 0.55;
    const pos = c.geo.attributes.position.array;
    const rnd = ctx.random;
    const turn = (1 - out3(clamp01(q / LAND))) * 0.9;                  // the cloud turns about y as it closes
    const cosT = Math.cos(turn), sinT = Math.sin(turn);
    for (let i = 0; i < n; i++) {
      // six draws per particle, always in this order
      const [tx, ty] = spots[Math.floor(rnd() * spots.length)];
      const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), r0 = R * (0.8 + rnd() * 0.6), late = rnd() * LATE, jitter = rnd() - 0.5;
      const e = out3(clamp01((q / LAND - late) / (1 - LATE)));
      const sx = r0 * Math.sin(ph) * Math.cos(th), sy = r0 * Math.cos(ph) * 0.7, sz = r0 * Math.sin(ph) * Math.sin(th) * depth;
      const gx = tx - W / 2, gy = H / 2 - ty;
      let x = sx + (gx - sx) * e, y = sy + (gy - sy) * e, z = (sz + jitter * fontPx) * (1 - e);
      if (e < 1) { const rx = x * cosT + z * sinT, rz = -x * sinT + z * cosT; x = rx; z = rz; }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    c.geo.attributes.position.needsUpdate = true;
    c.mat.color = new THREE.Color(cs.color);
    c.mat.size = Math.max(2, fontPx * 0.07);
    const fade = clamp01((q - LAND) / (1 - LAND));
    c.mat.opacity = 1 - fade;
    holder.style.opacity = fade.toFixed(4);
    ctx.afterSettle(() => ctx.seeded(() => c.renderer.render(c.scene, c.camera)));   // a first render compiles programs named with Math.random
  },
};
