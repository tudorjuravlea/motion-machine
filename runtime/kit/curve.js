// Custom ease curves from SVG path data or from numbers (SPEC §6). Pure: a curve is flattened once
// when it is parsed, and `f(p)` is a binary search and a lerp over the flat points, so the same p
// gives the same value in every seek order. Importable in Node and in the browser.
//
// What a brand can paste:
//   - 4 numbers          x1, y1, x2, y2 of a cubic bezier (the CSS cubic-bezier), returned exactly as that bezier;
//   - 2 + 6n numbers     a start point and n cubic segments, each as two control points and an end point,
//                        read as drawn in a unit box (y up);
//   - SVG path data      M, L, H, V, C, S and their lower-case (relative) forms. A path that starts at (0, 0)
//                        and ends at (1, 1) is read as drawn in a unit box (y up). Any other path is read as
//                        a drawing in an editor: x is shifted and scaled to 0..1, y runs down the page, so it
//                        is flipped, with 0 at the first point and 1 at the last.
// The result is made into a function of x: points that run backwards in x are dropped (and reported in
// `f.issues`), x is held inside 0..1, a vertical step is kept and read from its upper end. The ends are
// exactly (0, 0) and (1, 1).

// The CSS cubic-bezier: x(s) and y(s) are the Bezier polynomials, f(p) = y(s) where x(s) = p.
export function cubicBezier(x1, y1, x2, y2) {
  const bx = (s) => 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s;
  const by = (s) => 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s;
  const dbx = (s) => 3 * (1 - s) * (1 - s) * x1 + 6 * (1 - s) * s * (x2 - x1) + 3 * s * s * (1 - x2);
  // Solve bx(s) = x for s in [0, 1]: Newton from x, then bisection if Newton strays.
  const solve = (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let s = x;
    for (let i = 0; i < 8; i++) {
      const e = bx(s) - x, d = dbx(s);
      if (Math.abs(e) < 1e-9) return s;
      if (Math.abs(d) < 1e-9) break;
      s -= e / d;
    }
    if (!(s >= 0 && s <= 1) || Math.abs(bx(s) - x) > 1e-7) {
      let lo = 0, hi = 1;
      s = x;
      for (let i = 0; i < 60; i++) { s = (lo + hi) / 2; if (bx(s) < x) lo = s; else hi = s; }
    }
    return s;
  };
  const f = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : by(solve(p)));
  // Largest eased value over [0, p], analytically: endpoints and the roots of by'(s) = 0.
  f.maxUpTo = (p) => {
    if (p <= 0) return 0;
    const sp = solve(Math.min(1, p));
    let m = Math.max(0, by(sp));
    const a = 3 * y1 - 3 * y2 + 1, b = 2 * y2 - 4 * y1, c = y1;
    const roots = [];
    if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) roots.push(-c / b); }
    else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) roots.push((-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a));
    }
    for (const r of roots) if (r > 0 && r < sp) m = Math.max(m, by(r));
    return m;
  };
  return f;
}


const NUM = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?';
const TOKEN = new RegExp(`[A-Za-z]|${NUM}`, 'g');
const STEPS = 128;      // flat points per cubic segment
const SAME = 1e-9;      // x values closer than this are the same x

const fail = (msg) => { throw new TypeError(`curve: ${msg}`); };

// Path data → [{ kind: 'C'|'L', p: [x0, y0, ...] }], with absolute coordinates.
function segmentsOf(data) {
  const t = String(data).match(TOKEN) ?? [];
  const out = [];
  let i = 0, x = 0, y = 0, sx = 0, sy = 0, lastC = null, cmd = null, started = false;
  const num = () => { const v = Number(t[i++]); if (!Number.isFinite(v)) fail(`"${data}" has a number missing`); return v; };
  while (i < t.length) {
    if (/^[A-Za-z]$/.test(t[i])) cmd = t[i++];
    else if (cmd === null || /[Zz]/.test(cmd)) fail(`"${data}" does not start with a command`);
    const rel = cmd === cmd.toLowerCase();
    const up = cmd.toUpperCase();
    if (up === 'M') {
      const nx = num() + (rel ? x : 0), ny = num() + (rel ? y : 0);
      if (started) out.push({ kind: 'L', p: [x, y, nx, ny] });   // a second move joins up: one function of x has no gaps
      x = sx = nx; y = sy = ny; lastC = null; started = true;
      cmd = rel ? 'l' : 'L';
    } else if (up === 'L' || up === 'H' || up === 'V') {
      const nx = up === 'V' ? x : num() + (rel ? x : 0);
      const ny = up === 'H' ? y : num() + (rel ? y : 0);
      out.push({ kind: 'L', p: [x, y, nx, ny] }); x = nx; y = ny; lastC = null;
    } else if (up === 'C') {
      const a = num() + (rel ? x : 0), b = num() + (rel ? y : 0), c = num() + (rel ? x : 0), d = num() + (rel ? y : 0), e = num() + (rel ? x : 0), f = num() + (rel ? y : 0);
      out.push({ kind: 'C', p: [x, y, a, b, c, d, e, f] }); lastC = [c, d]; x = e; y = f;
    } else if (up === 'S') {
      const c = num() + (rel ? x : 0), d = num() + (rel ? y : 0), e = num() + (rel ? x : 0), f = num() + (rel ? y : 0);
      const a = lastC ? 2 * x - lastC[0] : x, b = lastC ? 2 * y - lastC[1] : y;
      out.push({ kind: 'C', p: [x, y, a, b, c, d, e, f] }); lastC = [c, d]; x = e; y = f;
    } else if (up === 'Z') {
      if (x !== sx || y !== sy) out.push({ kind: 'L', p: [x, y, sx, sy] });
      x = sx; y = sy; lastC = null;
    } else fail(`path command ${cmd} is not supported (use M, L, H, V, C, S)`);
  }
  if (!out.length) fail(`"${data}" draws nothing`);
  return out;
}

// numbers only: 2 + 6n of them are a start point and n cubics
function segmentsOfNumbers(nums) {
  if ((nums.length - 2) % 6 !== 0 || nums.length < 8) fail(`${nums.length} numbers; give 4 (a cubic-bezier) or 2 + 6 per segment`);
  const out = [];
  for (let k = 2; k < nums.length; k += 6) {
    const prev = k === 2 ? [nums[0], nums[1]] : [nums[k - 2], nums[k - 1]];
    out.push({ kind: 'C', p: [prev[0], prev[1], ...nums.slice(k, k + 6)] });
  }
  return out;
}

function flatten(segs) {
  const pts = [[segs[0].p[0], segs[0].p[1]]];
  for (const { kind, p } of segs) {
    if (kind === 'L') { pts.push([p[2], p[3]]); continue; }
    const [x0, y0, x1, y1, x2, y2, x3, y3] = p;
    for (let k = 1; k <= STEPS; k++) {
      const s = k / STEPS, u = 1 - s;
      const a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
      pts.push(k === STEPS ? [x3, y3] : [a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3]);
    }
  }
  return pts;
}

/** The curve for `data` (a string of path data or numbers). `f.issues` lists what was repaired. */
export function curve(data) {
  const text = String(data).trim();
  const letters = /[A-Za-z]/.test(text.replace(/[eE](?=[-+]?\d)/g, ''));
  const nums = letters ? null : (text.match(new RegExp(NUM, 'g')) ?? []).map(Number);
  if (nums && nums.length === 4) {
    const f = cubicBezier(...nums);
    f.issues = [];
    return f;
  }
  const segs = nums ? segmentsOfNumbers(nums) : segmentsOf(text);
  let pts = flatten(segs);
  if (pts.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) fail(`"${data}" has a value that is not a number`);

  const first = pts[0], last = pts.at(-1);
  const unit = nums !== null || (first[0] === 0 && first[1] === 0 && last[0] === 1 && last[1] === 1);
  const issues = [];
  const w = last[0] - first[0];
  if (!unit) {
    if (!(Math.abs(w) > 1e-12)) fail('the curve has no width (its first and last points share an x)');
    const rise = first[1] - last[1];
    if (!(Math.abs(rise) > 1e-12)) { issues.push({ kind: 'curve-flat', message: 'the curve ends at the height it starts at, so it has nothing to ease to; it is read as a straight line' }); pts = [[0, 0], [1, 1]]; }
    else pts = pts.map(([x, y]) => [(x - first[0]) / w, (first[1] - y) / rise]);
  } else if (!(Math.abs(w - 1) < 1e-12 && Math.abs(first[0]) < 1e-12)) {
    // numbers that do not span 0..1 in x: scale them there
    if (!(Math.abs(w) > 1e-12)) fail('the curve has no width (its first and last points share an x)');
    pts = pts.map(([x, y]) => [(x - first[0]) / w, y]);
  }

  // a function of x: hold x in 0..1, drop what runs backwards, keep a vertical step
  const kept = [[0, 0]];
  let backward = false;
  for (let k = 1; k < pts.length; k++) {
    let [x, y] = pts[k];
    if (x > 1) x = 1;
    if (x < 0) x = 0;
    const px = kept.at(-1)[0];
    if (x < px - SAME) { backward = true; continue; }
    if (Math.abs(x - px) <= SAME) { if (y !== kept.at(-1)[1]) kept.push([px, y]); continue; }
    kept.push([x, y]);
  }
  if (backward) issues.push({ kind: 'curve-backward', message: 'the curve runs backwards in x, so it is not a function of x; the backward stretch is dropped' });
  kept[0] = [0, 0];
  const end = kept.at(-1);
  if (end[0] < 1 - SAME) kept.push([1, 1]);
  else { kept[kept.length - 1] = [1, 1]; if (kept.length > 1 && Math.abs(kept.at(-2)[0] - 1) <= SAME && kept.at(-2)[1] === 1) kept.pop(); }
  const xs = kept.map((q) => q[0]), ys = kept.map((q) => q[1]);

  const f = (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    // the last index whose x is <= p; the next one is strictly to the right
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= p) lo = mid; else hi = mid; }
    const dx = xs[hi] - xs[lo];
    return dx > 0 ? ys[lo] + ((ys[hi] - ys[lo]) * (p - xs[lo])) / dx : ys[hi];
  };
  f.maxUpTo = (p) => {
    if (p <= 0) return 0;
    const q = Math.min(1, p);
    let m = 0;
    for (let k = 0; k < xs.length && xs[k] <= q; k++) m = Math.max(m, ys[k]);
    return Math.max(m, f(q));
  };
  f.issues = issues;
  return f;
}
