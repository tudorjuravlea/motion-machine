// moves/depth-parallax: a dolly that settles, seen through a lens. A picture taken apart by `mm media
// layers` (a plate, parts with depths, and maybe a depth map) is redrawn in a canvas over the picture,
// every layer pushed off its place by how far its depth lies from the focus depth. The push is scaled
// by w = 1 - s, where s is the move's eased progress, so it shrinks to nothing as the move settles. The
// lens blurs each layer by its depth gap from the focus (the nearest layer unless set), the same blur
// all through the move; with a lens the canvas stays at rest and shows the settled, defocused picture,
// and with aperture 0 it is gone at rest and the frame is the plain picture. A depth map cuts the plate
// into bands holding equal pixel counts, each band a soft mask of the plate, drawn far to near. Parts are
// drawn far to near too, each completed behind the nearer ones, and a plate filled from around its holes
// is filled again so straight edges run on, so nothing a part leaves behind shows a gap. The
// canvas is declared media (data-media). Pure in t: the pack is loaded and its bands are built once per
// page; a seek that comes before they are ready draws in ctx.afterSettle.
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ramp = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const PATHS = { 'dolly-left': [-1, 0], 'dolly-right': [1, 0], rise: [0, -1], push: [0, 0] };
// a band's soft edge reaches this share of its width into the neighbour on each side, so a pixel near
// an edge belongs to both bands and the seam stays soft when they part
const SOFT = 0.6;
// below this weight the layers are within a few pixels of rest: without a lens the canvas fades out over
// it, so the hand-over to the plain picture shows no resampling step
const FADE = 0.08;
// the lens: a layer one whole depth from the focus is blurred by aperture x this share of the short side
const LENS = 0.01;
// below this radius (px) a layer is drawn sharp
const SHARP = 0.05;
// the layers that reach the picture's border are extended past it by this share of the pack's long
// side, mirrored across their edges: a blurred layer stays whole up to the border, and a band that
// slides at the default drift brings its own mirrored edge into view, not the plate behind it
const PAD = 0.08;

/**
 * Where a layer of depth d sits at weight w (1 at the start of the move, 0 at rest), in px of the box.
 * o = { path, amount (share of the frame's short side), focus, short (the frame's short side in px) }.
 * A dolly moves it by w x A x (d - focus) along the path, A = amount x short; push scales it about the
 * centre by 1 + w Z (d - focus), times 1 + w Z / 2 for the whole picture, Z = 2.5 x amount.
 */
export function shift(d, w, o) {
  const amount = clamp(Number(o.amount ?? 0.12) || 0, 0.02, 0.24), rel = d - o.focus;
  if (o.path === 'push') {
    const Z = 2.5 * amount;
    return { dx: 0, dy: 0, scale: (1 + w * Z * rel) * (1 + 0.5 * w * Z) };
  }
  const [ux, uy] = PATHS[o.path] ?? PATHS['dolly-right'], m = w * amount * o.short * rel;
  return { dx: m * ux, dy: m * uy, scale: 1 };
}

/**
 * The lens blur (px, a CSS blur radius) of a layer of depth d: aperture x 1 % of the short side x
 * |d - focus|. o = { aperture (0 to 1, 0.35 when absent), focus, short }. It does not depend on the
 * move's weight: the lens stays as it is while the camera travels.
 */
export function blurOf(d, o) {
  const a = o.aperture == null ? 0.35 : clamp(Number(o.aperture) || 0, 0, 1);
  return a * LENS * o.short * Math.abs(d - o.focus);
}

/** The nearest depth among a pack's layers (plate, bands, parts): where the focus sits by default. */
export function nearestDepth({ plate, bands = [], parts = [] }) {
  return Math.max(plate.depth, ...bands.map((b) => b.depth), ...parts.map((p) => p.depth));
}

/**
 * Bands of a depth map from its 256-level histogram (counts[v] pixels at depth v / 255): edges at the
 * levels where the running count passes k / n of all pixels, so every band holds about as many pixels;
 * equal edges merge, so a map with few depths gives few bands. Each band: { lo, hi, kLo, kHi, depth }
 * with depth the mean depth of its pixels; the outermost edges open to -1 and 2 so no depth falls
 * outside, and each edge's softness, a share of the narrower of the two bands that meet there, is
 * shared by both.
 */
export function quantileBands(counts, n) {
  let total = 0, first = -1, last = -1;
  for (let v = 0; v < 256; v++) if (counts[v] > 0) { total += counts[v]; if (first < 0) first = v; last = v; }
  if (!total) return [{ lo: -1, hi: 2, kLo: 0.1, kHi: 0.1, depth: 0.5 }];
  const edges = [(first - 0.5) / 255];
  let run = 0, k = 1;
  for (let v = first; v <= last && k < n; v++) {
    run += counts[v];
    while (k < n && run >= (k * total) / n) { edges.push((v + 0.5) / 255); k++; }
  }
  edges.push((last + 0.5) / 255);
  const E = edges.filter((e, i) => i === 0 || e > edges[i - 1] + 1e-12);
  if (E.length < 2) E.push(E[0] + 1 / 255);
  const width = (i) => E[i + 1] - E[i], nb = E.length - 1;
  // the softness at edge j: a share of the narrower band either side (an outer edge has one), so a
  // narrow band (a flat depth, such as a wall) keeps its pixels instead of lending half to a wide neighbour
  const soft = (j) => SOFT * (j === 0 ? width(0) : j === nb ? width(nb - 1) : Math.min(width(j - 1), width(j)));
  const out = [];
  for (let i = 0; i < nb; i++) {
    let s = 0, c = 0;
    for (let v = 0; v < 256; v++) { const d = v / 255; if (counts[v] > 0 && d >= E[i] && d < E[i + 1]) { s += counts[v] * d; c += counts[v]; } }
    out.push({ lo: i === 0 ? -1 : E[i], hi: i === nb - 1 ? 2 : E[i + 1], kLo: soft(i), kHi: soft(i + 1), depth: c ? s / c : (E[i] + E[i + 1]) / 2 });
  }
  return out;
}

/**
 * The depth map with the pixels a part covers (covered[i] truthy) filled in from around them, so a
 * band cut from the plate takes the plate's fill behind a part along with the background it belongs to,
 * instead of leaving a part-shaped hole that slides off the part. Each covered run of a row takes a
 * straight line between the depths at its two ends (or the one end it has), which keeps a level edge
 * such as a horizon level behind the part; a row covered from end to end takes the same line between
 * the rows above and below it. Uncovered pixels keep their depth.
 */
export function fillUnder(depth, covered, W, H) {
  const out = Float64Array.from(depth), known = Uint8Array.from(covered, (c) => (c ? 0 : 1));
  // fill the unknown runs of a line of n pixels at i0, i0 + step, ...; returns whether it had any known pixel
  const line = (i0, step, n, src, ok) => {
    let last = -1, seen = false;
    for (let k = 0; k <= n; k++) {
      if (k < n && !ok[i0 + k * step]) continue;
      if (k < n) seen = true;
      const a = last >= 0 ? src[i0 + last * step] : null, b = k < n ? src[i0 + k * step] : null;
      for (let m = last + 1; m < k; m++) {
        const v = a == null ? b : b == null ? a : a + ((b - a) * (m - last)) / (k - last);
        if (v != null) out[i0 + m * step] = v;
      }
      last = k;
    }
    return seen;
  };
  const full = new Uint8Array(H);   // rows with no uncovered pixel
  for (let y = 0; y < H; y++) if (!line(y * W, 1, W, depth, known)) full[y] = 1;
  if (full.some(Boolean)) {
    const ok = Uint8Array.from({ length: W * H }, (_, i) => (full[Math.floor(i / W)] ? 0 : 1)), src = Float64Array.from(out);
    for (let x = 0; x < W; x++) line(x, W, H, src, ok);
  }
  return out;
}

// the line fill: ends that differ by more than this (summed over r, g, b) do not belong to one surface
const AGREE = 30;
// how strongly an edge running into the hole pulls the fill along it
const PULL = 0.5;
// a run's end lies on a line when, within this many pixels on each side across the run, something differs
const LINE = 4;

/**
 * An RGBA picture (W x H) with its hole (hole[i] truthy) filled so straight edges run on through it
 * instead of blurring. First, every row and column run of the hole whose two ends agree and lie on a line
 * (something different within a few pixels on both sides across the run: a thin line or a lip crossing
 * the hole) is filled straight between them;
 * where the two sides of that line differ (a horizon, not a thin line), it also stops the fill from
 * crossing it. Then each other pixel takes the best of: the blend of its row's ends, the blend of its
 * column's ends, or, when `both` is false, one end alone; an end that lies on a line running toward
 * the pixel pulls the fill along that line, so a vertical line runs down to the horizon and stops.
 * With `both`, only pixels between two known pixels are filled and known means opaque (a part completed
 * behind a nearer one, never grown past its own outline). Pixels outside the hole are kept.
 */
export function fillLines(src, W, H, hole, { both = false } = {}) {
  const out = Uint8ClampedArray.from(src);
  // 0 known, 1 to fill, 2 filled (lookups pass over it), 3 filled and closing (lookups stop at it)
  const st = Uint8Array.from(hole, (h) => (h ? 1 : 0));
  const known = (x, y) => x >= 0 && y >= 0 && x < W && y < H && st[y * W + x] === 0 && (!both || src[(y * W + x) * 4 + 3] >= 128);
  const diff = (i, j) => Math.abs(src[i * 4] - src[j * 4]) + Math.abs(src[i * 4 + 1] - src[j * 4 + 1]) + Math.abs(src[i * 4 + 2] - src[j * 4 + 2]);
  // the edge across a run (along dx, dy) at its end (x, y), averaged over the end and two pixels further out
  const across = (x, y, dx, dy) => {
    let s = 0, k = 0;
    for (let m = 0; m < 3; m++) {
      const X = x + dx * m, Y = y + dy * m;
      if (known(X, Y) && known(X - dy, Y - dx) && known(X + dy, Y + dx)) { s += diff((Y - dx) * W + X - dy, (Y + dx) * W + X + dy); k++; }
    }
    return k ? s / k : 0;
  };
  // the end (x, y) of a run along (dx, dy) lies on a line: within LINE pixels on each side across the run
  // some known pixel differs from it
  const onLine = (x, y, dx, dy) => [-1, 1].every((sg) => {
    for (let r = 1; r <= LINE; r++) { const X = x + sg * r * dy, Y = y + sg * r * dx; if (known(X, Y) && diff(Y * W + X, y * W + x) > AGREE) return true; }
    return false;
  });
  const sides = (x, y, dx, dy) => (known(x - 4 * dy, y - 4 * dx) && known(x + 4 * dy, y + 4 * dx) ? diff((y - 4 * dx) * W + x - 4 * dy, (y + 4 * dx) * W + x + 4 * dy) : 0);
  const put = (i, a, b, t) => { for (let c = 0; c < 4; c++) out[i * 4 + c] = Math.round(src[a * 4 + c] * (1 - t) + src[b * 4 + c] * t); };
  // first, the lines crossing the hole: rows, then columns
  for (const [dx, dy, n, m] of [[1, 0, W, H], [0, 1, H, W]]) {
    for (let j = 0; j < m; j++) {
      for (let k = 0; k < n; k++) {
        const x = dx ? k : j, y = dx ? j : k;
        if (st[y * W + x] !== 1) continue;
        let e = k; while (e < n && st[(dx ? j : e) * W + (dx ? e : j)] === 1) e++;
        const ax = x - dx, ay = y - dy, bx = dx ? e : j, by = dx ? j : e;
        if (known(ax, ay) && known(bx, by)) {
          const a = ay * W + ax, b = by * W + bx;
          if (diff(a, b) <= AGREE && onLine(ax, ay, dx, dy) && onLine(bx, by, dx, dy)) {
            const closing = (sides(ax, ay, dx, dy) + sides(bx, by, dx, dy)) / 2 > AGREE ? 3 : 2;
            for (let q = k; q < e; q++) { const i = (dx ? j : q) * W + (dx ? q : j); put(i, a, b, (q - k + 1) / (e - k + 1)); st[i] = closing; }
          }
        }
        k = e;
      }
    }
  }
  // then every other pixel, from the known pixels around it
  const reach = (x, y, dx, dy) => {
    let X = x + dx, Y = y + dy, d = 1;
    while (X >= 0 && Y >= 0 && X < W && Y < H && (st[Y * W + X] === 1 || st[Y * W + X] === 2)) { X += dx; Y += dy; d++; }
    return known(X, Y) ? { i: Y * W + X, d, x: X, y: Y } : null;
  };
  const plan = [];
  for (let i = 0; i < W * H; i++) {
    if (st[i] !== 1) continue;
    const x = i % W, y = (i - x) / W;
    let best = null;
    const offer = (score, a, b, t) => { if (!best || score < best.score) best = { score, a, b, t }; };
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const lo = reach(x, y, -dx, -dy), hi = reach(x, y, dx, dy);
      // only an end on a line pulls: a pixel beside an edge is not a line to carry
      const pull = (e, sg) => (e && onLine(e.x, e.y, dx, dy) ? across(e.x, e.y, sg * dx, sg * dy) : 0);
      const pl = pull(lo, -1), ph = pull(hi, 1);
      if (lo && hi) offer(diff(lo.i, hi.i) - (PULL * (pl + ph)) / 2, lo.i, hi.i, lo.d / (lo.d + hi.d));
      if (!both && lo) offer(AGREE - PULL * pl, lo.i, lo.i, 0);
      if (!both && hi) offer(AGREE - PULL * ph, hi.i, hi.i, 0);
    }
    if (best) plan.push([i, best]);
  }
  for (const [i, { a, b, t }] of plan) put(i, a, b, t);
  return out;
}

/** How much of a pixel of depth d a band draws: a rise over its lower edge times a fall over its upper one. */
export function bandWeight(d, b) {
  return ramp(b.lo - b.kLo, b.lo + b.kLo, d) * (1 - ramp(b.hi - b.kHi, b.hi + b.kHi, d));
}

/** The extra scale the plate takes so that, scaled by pose.scale and moved by (dx, dy), it still covers a w x h box. */
export function plateBleed(pose, w, h) {
  const need = Math.max((w / 2 + Math.abs(pose.dx)) / (w / 2), (h / 2 + Math.abs(pose.dy)) / (h / 2)) / pose.scale;
  return Math.max(1, need);
}

/**
 * The extra scale a layer takes at its pose in a bw x bh box: the plate always covers the box; on a push
 * a band does too, so the background never shrinks inside the frame; a part, and a band on a dolly,
 * keeps its pose (a dolly band slides, and the plate shows behind its opened edge).
 */
export function layerScale(kind, pose, o, bw, bh) {
  if (kind === 'plate' || (kind === 'band' && o.path === 'push')) return plateBleed(pose, bw, bh);
  return 1;
}

// ---------------------------------------------------------------------------------------------- pack

const PACKS = new Map();
function image(url) { const im = new Image(); im.src = url; return im.decode().then(() => im); }
function pixelsOf(doc, im) {
  const c = doc.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}
// the plate seen through one band's mask, as a canvas at the pack's size
// (depth: one level 0..255 per pixel)
function bandCanvas(doc, plate, depth, band) {
  const c = doc.createElement('canvas');
  c.width = plate.width; c.height = plate.height;
  const g = c.getContext('2d'), out = g.createImageData(c.width, c.height), o = out.data, p = plate.data;
  for (let i = 0; i < o.length; i += 4) {
    o[i] = p[i]; o[i + 1] = p[i + 1]; o[i + 2] = p[i + 2];
    o[i + 3] = Math.round(p[i + 3] * bandWeight(depth[i >> 2] / 255, band));
  }
  g.putImageData(out, 0, 0);
  return c;
}

// a layer drawn at w x h and mirrored outward across its edges by [left, top, right, bottom] px:
// { im, l, t, pw, ph }, drawn at (x - l, y - t) and pw x ph in pack px
function padded(doc, im, w, h, [l, t, r, b]) {
  if (!(l || t || r || b)) return { im, l: 0, t: 0, pw: w, ph: h };
  const c = doc.createElement('canvas');
  c.width = w + l + r; c.height = h + t + b;
  const g = c.getContext('2d');
  g.drawImage(im, l, t, w, h);
  // each margin is the strip just inside the edge (no wider than the layer), flipped across the edge
  // into a dw x dh rect at (dx, dy); sides first, then the full rows, so the corners are mirrored too
  const flip = (sx, sy, sw, sh, dx, dy, dw, dh, fx, fy) => {
    g.setTransform(fx, 0, 0, fy, fx < 0 ? 2 * dx + dw : 0, fy < 0 ? 2 * dy + dh : 0);
    g.drawImage(c, sx, sy, sw, sh, dx, dy, dw, dh);
  };
  const sl = Math.min(l, w), sr = Math.min(r, w);
  if (l) flip(l, t, sl, h, 0, t, l, h, -1, 1);
  if (r) flip(l + w - sr, t, sr, h, l + w, t, r, h, -1, 1);
  const CW = c.width, st = Math.min(t, h), sb = Math.min(b, h);
  if (t) flip(0, t, CW, st, 0, 0, CW, t, 1, -1);
  if (b) flip(0, t + h - sb, CW, sb, 0, t + h, CW, b, 1, -1);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return { im: c, l, t, pw: c.width, ph: c.height };
}

// a part (p: its box in the pack) completed behind the nearer parts that cover it: where a nearer part
// sits over it and it is not opaque, it is filled between its own opaque pixels along rows and columns
// (fillLines with both ends required), so it never grows past its outline; untouched when nothing covers it
function completed(doc, im, p, nearer) {
  if (!nearer.length) return im;
  const c = doc.createElement('canvas');
  c.width = p.w; c.height = p.h;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (const { q, im: qi } of nearer) g.drawImage(qi, q.x - p.x, q.y - p.y, q.w, q.h);
  const over = g.getImageData(0, 0, p.w, p.h).data;
  g.clearRect(0, 0, p.w, p.h);
  g.drawImage(im, 0, 0, p.w, p.h);
  const own = g.getImageData(0, 0, p.w, p.h), hole = new Uint8Array(p.w * p.h);
  let any = false;
  for (let i = 0; i < hole.length; i++) if (over[i * 4 + 3] > 0 && own.data[i * 4 + 3] < 128) { hole[i] = 1; any = true; }
  if (!any) return im;
  g.putImageData(new ImageData(fillLines(own.data, p.w, p.h, hole, { both: true }), p.w, p.h), 0, 0);
  return c;
}

// source.png's url + band count -> { ready, data: { W, H, plate: { im, depth }, bands, parts, focus } | null }
function load(doc, src, n) {
  const key = `${src}|${n}`;
  let e = PACKS.get(key);
  if (e) return e;
  e = { ready: false, data: null };
  const at = (f) => new URL(f, src).href;
  e.promise = fetch(at('media.json')).then((r) => (r.ok ? r.json() : null)).then(async (meta) => {
    if (meta?.kind !== 'layers' || !meta.plate?.file) return;
    const [plate, ...parts] = await Promise.all([image(at(meta.plate.file)), ...(meta.parts ?? []).map((p) => image(at(p.file)))]);
    const W = plate.naturalWidth, H = plate.naturalHeight, P = Math.ceil(PAD * Math.max(W, H)), metaParts = meta.parts ?? [];
    const depthOf = (p) => clamp(Number(p.depth) || 0, 0, 1);
    // every pixel a part touches
    const cover = doc.createElement('canvas');
    cover.width = W; cover.height = H;
    const cg = cover.getContext('2d', { willReadFrequently: true });
    metaParts.forEach((p, i) => cg.drawImage(parts[i], p.x, p.y, p.w, p.h));
    const ca = cg.getImageData(0, 0, W, H).data, covered = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) covered[i] = ca[i * 4 + 3] > 0 ? 1 : 0;
    // a plate filled from around its holes is filled again so straight edges run on through them (the
    // holes grown by the one pixel the fill widened them by); a supplied clean plate is kept as it is
    let pp = pixelsOf(doc, plate), plateIm = plate;
    if (meta.plate.fill === 'push-pull') {
      const hole = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!covered[y * W + x]) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) hole[Y * W + X] = 1; }
      }
      pp = new ImageData(fillLines(pp.data, W, H, hole), W, H);
      plateIm = doc.createElement('canvas');
      plateIm.width = W; plateIm.height = H;
      plateIm.getContext('2d').putImageData(pp, 0, 0);
    }
    // a part is completed behind every nearer part (a shelf runs on behind a bottle), then extended
    // only along the sides where it meets the picture's border; parts are drawn far to near
    const layers = metaParts.map((p, i) => {
      const im = completed(doc, parts[i], p, metaParts.map((q, j) => ({ q, im: parts[j] })).filter(({ q }) => depthOf(q) > depthOf(p)));
      return { ...padded(doc, im, p.w, p.h, [p.x <= 0 ? P : 0, p.y <= 0 ? P : 0, p.x + p.w >= W ? P : 0, p.y + p.h >= H ? P : 0]),
        x: p.x, y: p.y, z: p.z ?? i, depth: depthOf(p) };
    }).sort((a, b) => a.depth - b.depth || a.z - b.z);
    let bands = [];
    if (meta.depth?.file) {
      const dm = pixelsOf(doc, await image(at(meta.depth.file)));
      if (dm.width === W && dm.height === H) {
        // the pixels the parts cover take the depth around them (the background the plate shows there)
        const raw = new Float64Array(W * H);
        for (let i = 0; i < W * H; i++) raw[i] = dm.data[i * 4];
        const depth = fillUnder(raw, covered, W, H), counts = new Float64Array(256);
        for (let i = 0; i < depth.length; i++) counts[clamp(Math.round(depth[i]), 0, 255)]++;
        bands = quantileBands(counts, n).map((b) => ({ depth: b.depth, ...padded(doc, bandCanvas(doc, pp, depth, b), W, H, [P, P, P, P]) }));
      }
    }
    const base = { ...padded(doc, plateIm, W, H, [P, P, P, P]), depth: clamp(Number(meta.plate.depth) || 0, 0, 1) };
    e.data = { W, H, plate: base, bands, parts: layers, focus: nearestDepth({ plate: base, bands, parts: layers }) };
  }).catch(() => { e.data = null; }).finally(() => { e.ready = true; });
  PACKS.set(key, e);
  while (PACKS.size > 8) PACKS.delete(PACKS.keys().next().value);
  return e;
}

// ---------------------------------------------------------------------------------------------- draw

// box: the picture's box inside the canvas, { x, y, w, h } in canvas px
function paint(canvas, data, w, prm, box) {
  const bw = box.w, bh = box.h, g = canvas.getContext('2d');
  const focus = prm.focus ?? data.focus, o = { path: prm.path, amount: prm.amount, aperture: prm.aperture, focus, short: prm.short };
  // pack px -> box px: the picture covers the box (object-fit: cover), centred
  const cs = Math.max(bw / data.W, bh / data.H), ox = box.x + (bw - data.W * cs) / 2, oy = box.y + (bh - data.H * cs) / 2, cx = box.x + bw / 2, cy = box.y + bh / 2;
  const put = (pose, extra = 1) => {
    const S = pose.scale * extra;
    g.setTransform(S * cs, 0, 0, S * cs, cx + S * (ox - cx) + pose.dx, cy + S * (oy - cy) + pose.dy);
  };
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.save();
  g.beginPath(); g.rect(box.x, box.y, bw, bh); g.clip();
  g.imageSmoothingQuality = 'high';
  const lens = (d) => { const r = blurOf(d, o); g.filter = r < SHARP ? 'none' : `blur(${r.toFixed(2)}px)`; return r; };
  const pp = shift(data.plate.depth, w, o);
  lens(data.plate.depth); put(pp, layerScale('plate', pp, o, bw, bh));
  const draw = (L, x = 0, y = 0) => g.drawImage(L.im, x - L.l, y - L.t, L.pw, L.ph);
  draw(data.plate);
  for (const b of data.bands) { const bp = shift(b.depth, w, o); lens(b.depth); put(bp, layerScale('band', bp, o, bw, bh)); draw(b); }
  for (const p of data.parts) { lens(p.depth); put(shift(p.depth, w, o)); draw(p, p.x, p.y); }
  g.restore();
}

// Where the canvas goes so that it covers the picture's layout box (fractional px, untransformed):
// { left, top, cw, ch (the canvas's size), box (the picture's box inside it) }. When the page draws at
// one CSS px per pixel, the canvas is laid on whole pixels and the box sits inside it at its fraction,
// so the canvas is shown pixel for pixel, never resampled; otherwise it is the box itself.
function placeOf(img, host) {
  const cs = getComputedStyle(img), w = parseFloat(cs.width) || img.offsetWidth, h = parseFloat(cs.height) || img.offsetHeight;
  const r = img.getBoundingClientRect(), hr = host.getBoundingClientRect();
  if (Math.abs(r.width - w) < 0.02 && Math.abs(r.height - h) < 0.02) {
    const fx = r.left - Math.floor(r.left), fy = r.top - Math.floor(r.top);
    return { left: `${r.left - fx - hr.left - host.clientLeft}px`, top: `${r.top - fy - hr.top - host.clientTop}px`,
      cw: Math.ceil(r.right) - Math.floor(r.left), ch: Math.ceil(r.bottom) - Math.floor(r.top), box: { x: fx, y: fy, w: r.width, h: r.height } };
  }
  const left = cs.position === 'absolute' ? cs.left : `${img.offsetLeft}px`, top = cs.position === 'absolute' ? cs.top : `${img.offsetTop}px`;
  return { left, top, cw: w, ch: h, box: { x: 0, y: 0, w: Math.ceil(w), h: Math.ceil(h) } };
}

const MOVE = {
  name: 'depth-parallax',
  group: 'moves',
  params: {
    path: { type: 'enum(dolly-left|dolly-right|rise|push)', default: 'dolly-right', meaning: 'dolly-left / dolly-right: the camera slides sideways and settles, the layers behind the focus sliding past it; rise: it settles downward onto the shot; push: layers in front of the focus start enlarged, those behind it smaller, the picture a little larger, and all settle back to the shot' },
    amount: { type: 'number', default: 0.12, meaning: 'the drift as a share of the frame\'s short side, 0.02 to 0.24: a layer one whole depth from the focus starts this far from its place' },
    focus: { type: 'enum(auto|0..1)', default: 'auto', meaning: 'the depth the camera is locked on, 0 (far) to 1 (near): it stays put and stays sharp; auto takes the nearest layer of the picture (the plate, a band of the depth map or a part)' },
    aperture: { type: 'number', default: 0.35, meaning: 'the lens, 0 to 1: each layer is blurred by aperture x 1 % of the short side x its depth gap from the focus, so at 0.35 a layer one whole depth away is softened by 0.35 % of the short side; 0 keeps every layer sharp and the rest is the plain picture' },
    bands: { type: 'number', default: 10, meaning: 'how many bands of equal pixel count the plate is cut into when the pack has a depth map, 6 to 16' },
    end: { type: 'enum(scene|settle)', default: 'settle', meaning: 'settle: the drift ends at the scene\'s settle instant and the rest holds the settled picture; scene: it runs the whole scene' },
  },
  at(camera, p, ctx) {
    const prm = { ...Object.fromEntries(Object.entries(MOVE.params).map(([k, v]) => [k, v.default])), ...ctx?.params };
    // settling progress: the move's own seconds to the settle instant (or the scene's end), eased
    const dur = prm.end === 'scene' ? ctx?.d : (ctx?.settle ?? ctx?.d);
    const s = ctx?.u != null && dur > 0 ? ctx.ease('move', clamp(ctx.u / dur, 0, 1)) : clamp(p, 0, 1);
    const w = Math.max(0, 1 - s);
    const aperture = clamp(Number(prm.aperture) || 0, 0, 1);
    // without a lens the rest is the plain picture; with one the canvas stays, settled and defocused
    if (!(w > 1e-6) && !(aperture > 0)) return;
    const doc = camera.ownerDocument, sec = camera.closest('[data-scene]') ?? camera;
    const n = Math.round(clamp(Number(prm.bands) || 10, 6, 16));
    const f = Number(prm.focus);
    const opts = { path: PATHS[prm.path] ? prm.path : 'dolly-right', amount: Number(prm.amount), aperture, focus: prm.focus === 'auto' || prm.focus == null || !Number.isFinite(f) ? null : clamp(f, 0, 1),
      short: Math.min(sec.offsetWidth, sec.offsetHeight) || 1080 };
    for (const img of camera.querySelectorAll('img[data-media][src]')) {
      if (!img.offsetWidth || !img.offsetHeight || !/source\.png(\?|$)/.test(img.src)) continue;
      const e = load(doc, img.src, n);
      if (e.ready && !e.data) continue;
      const host = img.parentElement;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      const at = placeOf(img, host), canvas = doc.createElement('canvas');
      canvas.className = 'mm-depth-parallax';
      canvas.setAttribute('data-media', '');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.width = Math.ceil(at.cw); canvas.height = Math.ceil(at.ch);
      canvas.style.left = at.left; canvas.style.top = at.top;
      canvas.style.width = `${at.cw}px`; canvas.style.height = `${at.ch}px`;
      if (!(aperture > 0)) canvas.style.opacity = String(Math.min(1, w / FADE));
      host.append(canvas);
      if (e.ready) paint(canvas, e.data, w, opts, at.box);
      else ctx.afterSettle(() => e.promise.then(() => { if (!e.data) canvas.remove(); else if (canvas.isConnected) paint(canvas, e.data, w, opts, at.box); }));
    }
  },
};
export default MOVE;
