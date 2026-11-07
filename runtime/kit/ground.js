// The brand ground (SPEC §3): what sits behind every scene. Browser ESM; the arithmetic is pure and
// importable in Node. A ground is one `kind`: `blobs` (blurred shapes in the brand's own colours, the
// first kind and the default), `bloom` (a radial light rising from the bottom centre), `graph-paper`
// (a fine and a heavy grid that drift and an optional scan band) or `dots` (the dot grid alone), and
// an optional `mark` on any of them. Every colour of the three newer kinds is a palette role, every
// size a share of the frame, every speed a param, so a brand makes the ground its own by choosing the
// kind, the role, the density and the strength. Nothing here reads a clock: a ground is a function of
// the instant, the scene's start and the style, so any seek order draws the same pixels.

/** The palette roles a ground may be drawn in. */
export const GROUND_ROLES = ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'];

/** The ground kinds. `blobs` is the default and needs `blobs` and `blur`; the others need nothing. */
export const GROUND_KINDS = ['blobs', 'bloom', 'graph-paper', 'dots'];

/**
 * Defaults of every param the newer kinds read, as the schema documents them. `bloom` (the light):
 * `role`; `width` and `height` the reach of its ellipse, shares of the frame width and height;
 * `strength` the share of the role at its centre. `dots` (also a bloom's faint dot grid): `role`,
 * `spacing` a share of the frame width, `size` the dot's diameter as a share of the spacing,
 * `strength`. `grid` (graph-paper): `role`; `spacing` of the fine cell, a share of the frame width;
 * `every` fine cells per heavy line; `weight` the fine line's width, a share of the frame width (the
 * heavy line is twice it); `strength` the heavy line's share of the role (the fine line is 45 % of
 * it); `drift` how far the grid wanders, a share of the frame width; `cycle` the seconds one drift,
 * and one scan, take: the motion repeats exactly every `cycle`. `scan` (optional): `role`, `size` the
 * band's height as a share of the frame height, `strength`.
 */
export const GROUND_DEFAULTS = {
  bloom: { role: 'accent', width: 1.2, height: 0.75, strength: 0.5 },
  dots: { role: 'line', spacing: 0.025, size: 0.12, strength: 0.6 },
  grid: { role: 'line', spacing: 0.02, every: 5, weight: 0.0006, strength: 0.7, drift: 0.012, cycle: 8 },
  scan: { role: 'accent', size: 0.18, strength: 0.1 },
};

/** The bloom starts this share of its size and grows to 1 over the scene's first beat. */
export const BLOOM_FROM = 0.9;

// how the light falls off from its centre to its edge: [share of the radius, share of the strength]
const FALLOFF = [[0, 1], [0.2, 0.62], [0.4, 0.3], [0.6, 0.12], [0.8, 0.03], [1, 0]];
const FINE_OF_HEAVY = 0.45;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** A ground with its kind and every param of that kind filled in (a block the brand did not give reads its defaults). */
export function groundSpec(ground) {
  const kind = ground?.kind ?? 'blobs';
  const out = { kind, mark: ground?.mark ?? null };
  if (kind === 'blobs') return { ...out, blobs: ground?.blobs ?? [], blur: ground?.blur ?? 0 };
  if (kind === 'bloom') {
    out.bloom = { ...GROUND_DEFAULTS.bloom, ...(ground.bloom ?? {}) };
    if (ground.dots) out.dots = { ...GROUND_DEFAULTS.dots, ...ground.dots };
  } else if (kind === 'dots') {
    out.dots = { ...GROUND_DEFAULTS.dots, ...(ground.dots ?? {}) };
  } else if (kind === 'graph-paper') {
    out.grid = { ...GROUND_DEFAULTS.grid, ...(ground.grid ?? {}) };
    if (ground.grid?.scan) out.grid.scan = { ...GROUND_DEFAULTS.scan, ...ground.grid.scan };
  }
  return out;
}

/** True when the ground moves with the piece's time (the bloom grows per scene; graph-paper drifts). */
export const isAnimated = (spec) => spec.kind === 'bloom' || spec.kind === 'graph-paper';

/**
 * The seconds a scene's bloom takes to rise: from the scene's start to the end of its first beat's
 * arrival, but never less than `floorS` (a standard duration), so a scene whose first beat is
 * instant still lets the light rise. `beats` are `{ start, d }` in the film's seconds; a scene with
 * none takes `floorS`.
 */
export function firstBeatWindow(beats, sceneStart, floorS) {
  let end = null;
  for (const b of beats) {
    if (!Number.isFinite(b.start) || !Number.isFinite(b.d)) continue;
    if (end == null || b.start < end.start) end = b;
  }
  const span = end ? end.start + end.d - sceneStart : 0;
  return Math.max(floorS, span);
}

/**
 * The bloom's scale at `u` seconds into its scene: 0.9 rising to 1 with the enter ease over `windowS`.
 * `enter` maps 0..1 to 0..1 (the style's enter easing). A deck rest passes u = windowS: scale 1.
 */
export function bloomScale(u, windowS, enter = (p) => p) {
  if (!(windowS > 0)) return 1;
  return BLOOM_FROM + (1 - BLOOM_FROM) * enter(clamp01(u / windowS));
}

/** Where in its cycle the piece's time falls, 0 up to (not including) 1. Exact for any t, negative too. */
export function phaseOf(t, cycle) {
  const c = cycle > 0 ? cycle : 1;
  const p = (((t % c) + c) % c) / c;
  return p >= 1 ? 0 : p;
}

/**
 * The grid's wander at piece time `t`, in px: it drifts out and back (a yoyo) by half a cosine, so
 * it starts and ends the cycle at rest at the origin and the first frame of the next cycle is the
 * last. `amp` is the share of the frame width at the far end; the vertical wander is half of the
 * horizontal one.
 */
export function gridOffset(t, cycle, amp, frameW) {
  const k = (1 - Math.cos(2 * Math.PI * phaseOf(t, cycle))) / 2;
  return { x: amp * frameW * k, y: amp * frameW * k * 0.5 };
}

/** The scan band's top edge as a share of the frame height: it enters above the frame and leaves below it once per cycle. */
export function scanTop(t, cycle, bandShare) {
  return -bandShare + phaseOf(t, cycle) * (1 + bandShare);
}

/**
 * Stop-motion on the ground: a style that animates on twos or threes (`motion.frameHold`) steps the
 * ambient motion on the same grid as every other element (1/30 s steps, from t = 0).
 */
export function heldTime(t, frameHold) {
  return frameHold > 1 ? Math.floor((t * 30) / frameHold + 1e-6) * (frameHold / 30) : t;
}

// ---------------------------------------------------------------------------------------------
// the picture

const tint = (role, pct) => `color-mix(in srgb, var(--mm-color-${role}) ${Math.round(pct * 100) / 100}%, transparent)`;
const px = (v) => `${Math.round(v * 100) / 100}px`;
const whole = (v, min = 1) => Math.max(min, Math.round(v));

/**
 * The ground element of one scene. Chrome, not content: hidden from assistive tech and from the
 * label and ban rules, present from the first frame. `media` collects the promise of anything to
 * decode (the mark). The parts that move are drawn by paintGround().
 */
export function groundOf(ground, spec, media) {
  const s = groundSpec(ground);
  const g = document.createElement('div');
  g.className = 'mm-ground';
  g.dataset.kind = s.kind;
  g.setAttribute('aria-hidden', 'true');
  g.setAttribute('data-chrome', '');
  g.setAttribute('data-keep', '');   // present from the first frame, never an entrance
  const pct = (v) => `${Math.round(v * 1e6) / 1e4}%`;
  const layer = (cls, css) => { const e = document.createElement('span'); e.className = `mm-ground__${cls}`; Object.assign(e.style, css); g.append(e); return e; };
  if (s.kind === 'blobs') {
    for (const b of s.blobs) {
      layer('blob', { left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h), background: b.color, opacity: String(b.alpha), filter: `blur(${px(s.blur * spec.w)})` });
    }
  }
  if (s.bloom) {
    const { role, width, height, strength } = s.bloom;
    const bw = width * spec.w, bh = height * spec.h;
    // an ellipse centred on the frame's bottom edge: the half below it is clipped by the frame
    const stops = FALLOFF.map(([at, k]) => `${tint(role, strength * k * 100)} ${Math.round(at * 100)}%`).join(', ');
    layer('bloom', { left: px(spec.w / 2 - bw / 2), top: px(spec.h - bh), width: px(bw), height: px(2 * bh), backgroundImage: `radial-gradient(closest-side, ${stops})` });
  }
  if (s.dots) {
    const { role, size, strength } = s.dots;
    const sp = whole(s.dots.spacing * spec.w, 4), r = Math.max(0.6, (size * sp) / 2);
    const c = tint(role, strength * 100);
    layer('dots', { backgroundImage: `radial-gradient(circle at 50% 50%, ${c} 0, ${c} ${px(r)}, transparent ${px(r + 1)})`, backgroundSize: `${sp}px ${sp}px` });
  }
  if (s.grid) {
    const { role, every, weight, strength, spacing } = s.grid;
    const sp = whole(spacing * spec.w, 4), w = whole(weight * spec.w), hv = sp * every;
    const fine = tint(role, strength * FINE_OF_HEAVY * 100), heavy = tint(role, strength * 100);
    const line = (dir, c, wd) => `linear-gradient(${dir}, ${c} 0, ${c} ${wd}px, transparent ${wd}px)`;
    const size = `${hv}px ${hv}px, ${hv}px ${hv}px, ${sp}px ${sp}px, ${sp}px ${sp}px`;
    layer('grid', { backgroundImage: [line('90deg', heavy, w * 2), line('180deg', heavy, w * 2), line('90deg', fine, w), line('180deg', fine, w)].join(', '), backgroundSize: size });
    if (s.grid.scan) {
      const { role: sr, size: band, strength: ss } = s.grid.scan;
      const c = tint(sr, ss * 100);
      layer('scan', { left: '0', width: '100%', height: px(band * spec.h), backgroundImage: `linear-gradient(180deg, transparent, ${c} 50%, transparent)` });
    }
  }
  if (s.mark) {
    const m = document.createElement('img');
    m.className = 'mm-ground__mark';
    m.alt = '';
    Object.assign(m.style, { width: pct(s.mark.width), opacity: String(s.mark.alpha) });
    m.setAttribute('src', s.mark.src);
    media.push(m.decode().then(() => null, () => `ground mark ${s.mark.src} did not load`));
    g.append(m);
  }
  return g;
}

/**
 * Draws the moving parts of one scene's ground at one instant. `at`: `t` (piece time; a deck passes
 * nothing moving), `u` seconds into the scene, `windowS` the bloom's rise, `enter` the style's
 * enter easing, `hold` the style's frameHold, `deck` true for a deck. A deck draws a still ground:
 * the bloom full size (a rest is finished), the grid at its origin, the scan band off the frame.
 */
export function paintGround(g, spec, frame, at) {
  const bloom = g.querySelector(':scope > .mm-ground__bloom');
  if (bloom) bloom.style.transform = `scale(${Math.round(bloomScale(at.deck ? Infinity : at.u, at.windowS, at.enter) * 1e5) / 1e5})`;
  const grid = g.querySelector(':scope > .mm-ground__grid');
  if (!grid) return;
  const { cycle, drift } = spec.grid;
  const t = at.deck ? 0 : heldTime(at.t, at.hold);
  const o = gridOffset(t, cycle, drift, frame.w);
  grid.style.backgroundPosition = `${px(o.x)} ${px(o.y)}`;
  const scan = g.querySelector(':scope > .mm-ground__scan');
  if (scan) {
    const band = spec.grid.scan.size;
    scan.style.top = px((at.deck ? -band : scanTop(t, cycle, band)) * frame.h);
  }
}
