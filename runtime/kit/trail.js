// trail.js: ribbon, flag and cable motion faked from delayed copies of a main motion. Point i of a trail
// is where the anchor was i·lag seconds ago, so the free end follows the held end the way cloth or a
// cable does, and it needs no state: any instant is drawn from the main motion alone. A flutter (a wave
// travelling down the trail, growing toward the free end) is added across it, and the caller lets it die
// out as the motion settles, so the trail lies still, or collapses onto its anchor, at rest.

const TAU = Math.PI * 2;

/**
 * The trail at time `t`: `points` [[x, y]] from the anchor (i = 0) to the free end (i = n), and
 * `outline`, a closed polygon of the trail at `width` [atAnchor, atEnd] px. `pathAt(s)` is the anchor's
 * place at time s (it is asked for times before 0, where it should hold its start). `wave` is the
 * flutter's amplitude at the free end in px, `waveHz` its frequency, `waves` how many crests the trail
 * holds at once.
 */
export function trailOf(pathAt, t, { n = 16, lag = 0.03, wave = 0, waveHz = 2.2, waves = 1.2, width = [8, 2] } = {}) {
  const base = Array.from({ length: n + 1 }, (_, i) => pathAt(t - i * lag));
  const points = base.map(([x, y], i) => {
    if (!wave) return [x, y];
    const [nx, ny] = normalAt(base, i);
    const k = i / n, off = wave * k * Math.sin(TAU * (waveHz * (t - i * lag) - waves * k));
    return [x + nx * off, y + ny * off];
  });
  const left = [], right = [];
  points.forEach(([x, y], i) => {
    const [nx, ny] = normalAt(points, i), w = (width[0] + (width[1] - width[0]) * (i / n)) / 2;
    left.push([x + nx * w, y + ny * w]); right.push([x - nx * w, y - ny * w]);
  });
  return { points, outline: [...left, ...right.reverse()] };
}

/** The unit normal of a polyline at point i (from its neighbours); [0, -1] where it has no length. */
export function normalAt(pts, i) {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  return len > 1e-9 ? [-dy / len, dx / len] : [0, -1];
}

/** How long the trail is, from anchor to free end along its points (px): 0 once it has caught up. */
export const trailLength = (points) => points.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);

/** An SVG path `d` for a closed polygon. */
export const polygonPath = (pts) => (pts.length ? `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z` : '');
