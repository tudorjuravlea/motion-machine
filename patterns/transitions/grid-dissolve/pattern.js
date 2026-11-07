// transitions/grid-dissolve: the incoming scene appears cell by cell on a grid, each cell on its
// own seeded schedule. A mask of one gradient layer per cell (alpha only) on the incoming section;
// the outgoing scene stays whole underneath. Cell order comes from ctx.random, so it is the same
// in every render.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['mask-image', '-webkit-mask-image', 'mask-size', '-webkit-mask-size', 'mask-position', '-webkit-mask-position', 'mask-repeat', '-webkit-mask-repeat'];

const params = {
  cols: { type: 'number', default: 8, meaning: 'cells across; rows follow from the format so cells stay near square' },
  spread: { type: 'number', default: 0.6, meaning: 'share of the transition over which cells start, 0 to 0.9: higher is more scattered' },
};

function aspect(format) {
  const m = /^(\d+)x(\d+)$/.exec(String(format));
  return m ? [Number(m[1]), Number(m[2])] : [16, 9];
}

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'grid-dissolve',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    clear(ctx.from); clear(to);
    if (p >= 1) return;
    const cols = Math.max(2, Math.round(Number(ctx.params?.cols ?? params.cols.default)));
    const spread = Math.min(0.9, Math.max(0, Number(ctx.params?.spread ?? params.spread.default)));
    const [aw, ah] = aspect(ctx.format);
    const rows = Math.max(2, Math.round((cols * ah) / aw));
    const rand = ctx.random ?? (() => 0.5);
    const solid = 'var(--mm-color-ink)'; // the mask reads only alpha
    const grow = 'calc(var(--mm-space-0) / 4)'; // cells overlap a hair so no seam shows between them
    const layers = [], sizes = [], positions = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const start = rand() * spread;
        const a = clamp01((p - start) / (1 - spread));
        if (a <= 0) continue;
        const c = `color-mix(in srgb, ${solid} ${r3(a * 100)}%, transparent)`;
        layers.push(`linear-gradient(${c}, ${c})`);
        sizes.push(`calc(100% / ${cols} + ${grow}) calc(100% / ${rows} + ${grow})`);
        positions.push(`${r3((col / (cols - 1)) * 100)}% ${r3((row / (rows - 1)) * 100)}%`);
      }
    }
    if (!layers.length) { layers.push('linear-gradient(transparent, transparent)'); sizes.push('100% 100%'); positions.push('0% 0%'); }
    for (const prefix of ['', '-webkit-']) {
      to.style.setProperty(`${prefix}mask-image`, layers.join(', '));
      to.style.setProperty(`${prefix}mask-size`, sizes.join(', '));
      to.style.setProperty(`${prefix}mask-position`, positions.join(', '));
      to.style.setProperty(`${prefix}mask-repeat`, 'no-repeat');
    }
  },
};
