// text/scramble: the line decodes from noise. Letters resolve left to right; those still waiting
// show seeded random glyphs that change a fixed number of times across the entrance. By default
// the noise is drawn from the line's own letters and picked for a width close to the real glyph's, so every glyph is one the bundled face has and the line keeps its density. Each
// letter keeps the width of its final glyph while it scrambles, so the line does not jitter; at
// rest the plain text is restored. Writes text and widths on spans it creates.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  changes: { type: 'number', default: 12, meaning: 'how many times the noise reshuffles across the entrance' },
  pool: { type: 'string', default: '', meaning: 'glyphs the noise is drawn from; empty uses the line\'s own letters plus digits' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const DIGITS = '0123456789';
const DONE = 0.85;
const NEAR = 4;

function linear(ctx, p) {
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

export default {
  name: 'scramble',
  group: 'text',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const lin = linear(ctx, p);
    if (lin >= 1 || !text) { el.textContent = text; return; }
    const doc = el.ownerDocument;
    const own = Array.from(new Set(Array.from(text).filter((c) => c !== ' ')));
    const pool = Array.from(String(prm.pool) || [...own, ...DIGITS].join(''));
    const ticks = Math.max(1, Math.round(Number(prm.changes)));
    const tick = Math.min(ticks - 1, Math.floor(lin * ticks));
    const letters = Array.from(text).filter((c) => c !== ' ').length;
    const rnd = ctx.random;
    const noise = Array.from({ length: letters * ticks }, () => rnd());
    el.textContent = '';
    const cells = [];
    let word = null;
    Array.from(text).forEach((ch) => {
      if (ch === ' ') { el.append(' '); word = null; return; }
      if (!word) { word = doc.createElement('span'); word.className = 'mm-scramble__word'; el.append(word); }
      const cell = doc.createElement('span');
      cell.className = 'mm-scramble__c';
      cell.textContent = ch;
      word.append(cell);
      cells.push({ cell, ch });
    });
    const widths = cells.map(({ cell }) => cell.offsetWidth);
    // noise glyphs of about the width of the real one, so the line keeps its density
    const probe = doc.createElement('span');
    probe.className = 'mm-scramble__c';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    el.append(probe);
    const poolW = pool.map((g) => { probe.textContent = g; return probe.offsetWidth; });
    probe.remove();
    const near = Math.min(NEAR, pool.length);
    cells.forEach(({ cell, ch }, i) => {
      cell.style.width = `${widths[i]}px`;
      const resolved = lin >= ((i + 1) / cells.length) * DONE;
      if (resolved) return;
      const ranked = pool.map((g, j) => j).sort((a, b) => Math.abs(poolW[a] - widths[i]) - Math.abs(poolW[b] - widths[i]) || a - b);
      cell.textContent = pool[ranked[Math.floor(noise[i * ticks + tick] * near)]] ?? ch;
    });
  },
};
