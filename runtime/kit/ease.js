// Easing curves (SPEC §6). Pure. `ease(name, p, style)` accepts a style role ('enter', 'exit',
// 'move', resolved through style.motion.easings) or a CSS easing string ('linear', 'ease-in',
// 'ease-out', 'ease-in-out', 'ease', 'cubic-bezier(a, b, c, d)').

const KEYWORDS = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

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

const cache = new Map();

export function parseEasing(str) {
  const key = String(str).trim();
  if (cache.has(key)) return cache.get(key);
  let pts = KEYWORDS[key];
  if (!pts) {
    const m = /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(key);
    if (!m) throw new TypeError(`ease: unknown easing "${str}"`);
    pts = m.slice(1).map(Number);
  }
  const f = cubicBezier(...pts);
  cache.set(key, f);
  return f;
}

function resolve(name, style) {
  const roles = style?.motion?.easings;
  return parseEasing(roles && roles[name] ? roles[name] : name);
}

export function ease(name, p, style) {
  return resolve(name, style)(p);
}

// Overshoot so far: max(0, max eased value over [0, p] − 1).
ease.overshoot = function overshoot(name, p, style) {
  return Math.max(0, resolve(name, style).maxUpTo(p) - 1);
};
