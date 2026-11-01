// The evolution strategy `mm sound clone` searches with (SPEC §9). Library only; pure; seeded. Restated from a MIT-licensed sound
// forge's search module (see NOTICE): a population of candidates in the unit cube, the elites mutated with a step that shrinks over
// the generations, a few fresh draws each time, and a cheap model-free prescreen that ranks more candidates than are scored in
// full. (The forge measured a separable CMA-ES against this at 96 to 240 scored candidates and it did not beat it.)
//
//   mulberry(seed) · gaussian(rng) · streamOf(u)    the seeded generator, a normal draw from it, and a unit vector read as a stream of draws
//   evolve({ dims, make, full?, budget, pop, elite, prescreen, seed, sigma0, sigma1, fresh })
//       make(u)  -> { u, pre, ... }   builds one candidate and its cheap score (lower is nearer); pre Infinity rejects it
//       full(c)  -> number            the expensive score of a chosen candidate (default: its pre)
//       { best, history, generations, sigmas }   history is every candidate scored in full, with `total`; best the lowest

export const mulberry = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** A normal draw (mean 0, sd 1) from a uniform generator, Box-Muller. */
export const gaussian = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

/** A function that returns the entries of `u` one after the other (wrapping): a template that draws from `rng()` is a function of u. */
export const streamOf = (u) => { let k = 0; return () => u[k++ % u.length]; };

export function evolve({ dims, make, full = null, budget = 64, pop = 16, elite = 4, prescreen = null, seed = 0, sigma0 = 0.22, sigma1 = 0.04, fresh = 0.15 }) {
  const rng = mulberry(seed >>> 0), gens = Math.max(1, Math.floor(budget / pop)), K = Math.max(pop, prescreen ?? pop);
  const history = [], sigmas = [];
  let elites = [];
  for (let g = 0; g < gens; g++) {
    const sigma = gens > 1 ? sigma0 * (sigma1 / sigma0) ** (g / (gens - 1)) : sigma0;
    sigmas.push(sigma);
    const pool = [];
    for (let attempts = 0; pool.length < K && attempts < K * 8; attempts++) {
      let u;
      if (g === 0 || !elites.length || rng() < fresh) u = Array.from({ length: dims }, () => rng());
      else {
        const parent = elites[Math.floor(rng() * Math.min(elite, elites.length))];
        u = parent.u.map((v) => Math.min(1, Math.max(0, v + sigma * gaussian(rng))));
      }
      const c = make(u);
      if (c && Number.isFinite(c.pre)) pool.push(c);
    }
    pool.sort((a, b) => a.pre - b.pre);
    for (const c of pool.slice(0, pop)) {
      c.total = full ? full(c) : c.pre;
      c.gen = g;
      if (Number.isFinite(c.total)) history.push(c);
    }
    elites = [...history].sort((a, b) => a.total - b.total).slice(0, elite);
  }
  history.sort((a, b) => a.total - b.total);
  return { best: history[0] ?? null, history, generations: gens, sigmas };
}
