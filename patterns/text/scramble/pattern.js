// text/scramble: the line decodes from noise, or one value edits into another. Every glyph has a
// window on the entrance, ranked by position (left to right by default); before it the old glyph
// shows (or noise, for a line that starts undecoded), inside it noise glyphs that hold for one step
// (20 Hz), after it the new glyph. The noise is a hash of the glyph's place and the step, so nothing is
// remembered and a seek in any order draws the same line. With `before` the common start and end of the
// two texts stay still and only what changed steps ("v1.2" to "v1.3"). By default the noise is drawn
// from the line's own letters and picked for a width close to the real glyph's, so every glyph is one
// the bundled face has and the line keeps its density; a brand may name its own pool. Each cell that
// scrambles keeps the width of its glyph, so the line does not jitter; at rest the plain text is
// restored. Noise and settled glyphs take palette roles. Writes text, widths and colour on spans it creates.
import { plan, cellsAt, poolOf, glyphOf } from '../../../runtime/kit/scramble.js';
import { graphemesOf, plainOf } from '../../../runtime/kit/split.js';
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  before: { type: 'string', default: '', meaning: 'the text the slot shows first, to edit into the beat\'s text; empty decodes the line from noise' },
  from: { type: 'enum(auto|left|right|center|random)', default: 'auto', meaning: 'which glyphs resolve first; auto goes from the right when the text shrinks' },
  charset: { type: 'string', default: 'own', meaning: 'the noise: names joined by + (own, letters, lowercase, uppercase, numbers, symbols, braille, blocks, shades), or none for a value that steps without noise' },
  pool: { type: 'string', default: '', meaning: 'the brand\'s own glyphs the noise is drawn from (a range x-y is expanded); empty uses charset' },
  rate: { type: 'number', default: 20, meaning: 'glyph steps per second: noise holds still for one step' },
  changes: { type: 'number', default: 0, meaning: 'how many times the noise reshuffles across the entrance; 0 uses rate' },
  settle: { type: 'number', default: 0.35, meaning: 'the share of the entrance each glyph spends in noise before it resolves' },
  jitter: { type: 'number', default: 0, meaning: '0 to 1: how far each glyph\'s window is shifted by a seeded amount' },
  delay: { type: 'number', default: 0, meaning: 'the share of the entrance before the first glyph moves' },
  hold: { type: 'number', default: 0.15, meaning: 'the share at the end the finished text stays still, to be read' },
  diff: { type: 'boolean', default: true, meaning: 'with `before`, keep the common start and end still and step only what changed' },
  reversed: { type: 'boolean', default: false, meaning: 'turns the order round' },
  noise: { type: 'enum(muted|ink|accent|line|inherit)', default: 'muted', meaning: 'the palette role of a glyph that is still noise' },
  settled: { type: 'enum(inherit|ink|accent|muted)', default: 'inherit', meaning: 'the palette role of a glyph that has resolved and the old text before its window; inherit keeps the slot\'s own colour' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const NEAR = 4;       // noise glyphs are picked among this many pool glyphs of the closest width
const WIDE = 64;      // a pool larger than this is not width-matched (braille, blocks)
const ROLES = new Set(['muted', 'ink', 'accent', 'line']);
const flag = (v) => v === true || v === 'true' || v === 1 || v === '1';
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);

function linear(ctx, p) {
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

const tint = (role) => (ROLES.has(role) ? `var(--mm-color-${role})` : '');

export default {
  name: 'scramble',
  group: 'text',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const after = plainOf(el.textContent);
    const lin = linear(ctx, p);
    if (lin >= 1 || !after) { el.textContent = after; return; }
    const doc = el.ownerDocument;
    const d = ctx.d > 0 ? ctx.d : ctx.style.motion.durations.slow / 1000;
    const rate = num(prm.changes, 0) > 0 ? num(prm.changes, 0) / d : num(prm.rate, 20);
    const before = plainOf(prm.before);
    const pl = plan({ before, after, from: prm.from, reversed: flag(prm.reversed), jitter: num(prm.jitter, 0), settle: num(prm.settle, 0.35), hold: num(prm.hold, 0.15), delay: num(prm.delay, 0), rate, d, seed: Math.floor(ctx.random() * 4294967296), diff: flag(prm.diff) });
    const step = Math.floor(lin * d * rate + 1e-9);
    const cells = cellsAt(pl, lin, step).flatMap((c) => (c.state === 'same' ? graphemesOf(c.ch).map((ch) => ({ state: 'same', ch, h: 0 })) : [c]));
    const pool = String(prm.charset) === 'none' && !String(prm.pool) ? [] : poolOf(String(prm.pool) || String(prm.charset), { own: `${before}${after}` });
    const settledTint = tint(prm.settled), noiseTint = tint(prm.noise);

    // the glyph a noise cell shows: from the pool, among the few of about the real glyph's width
    el.textContent = '';
    const probe = doc.createElement('span');
    probe.className = 'mm-scramble__c';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    el.append(probe);
    const widths = new Map();
    const wOf = (g) => { if (!widths.has(g)) { probe.textContent = g; widths.set(g, probe.offsetWidth); } return widths.get(g); };
    const matched = pool.length > 0 && pool.length <= WIDE;
    const near = Math.min(NEAR, pool.length);
    let word = null;
    const mk = (c) => {
      const cell = doc.createElement('span');
      cell.className = 'mm-scramble__c';
      if (c.state === 'noise') {
        const want = c.n ?? c.o ?? '';
        const w = want ? wOf(want) : 0;
        let g;
        if (!pool.length) g = c.o ?? '';
        else if (!matched) g = glyphOf(pool, c.h);
        else {
          const ranked = pool.map((x, j) => j).sort((a, b) => Math.abs(wOf(pool[a]) - w) - Math.abs(wOf(pool[b]) - w) || a - b);
          g = pool[ranked[c.h % near]] ?? want;
        }
        cell.textContent = g;
        if (w) cell.style.width = `${w}px`;
        // a glyph wider than the real one is drawn smaller, so it fits its cell instead of covering its neighbours
        const gw = g ? wOf(g) : 0;
        if (w && gw > w * 1.03) cell.style.fontSize = `${((w / gw) * 100).toFixed(1)}%`;
        if (pool.length && noiseTint) cell.style.color = noiseTint;
      } else {
        cell.textContent = c.ch;
        if (c.state === 'old' && settledTint) cell.style.color = settledTint;
        if (c.state === 'new' && settledTint) cell.style.color = settledTint;
      }
      return cell;
    };
    cells.forEach((c) => {
      if (c.ch === ' ') { el.append(' '); word = null; return; }
      if (!word) { word = doc.createElement('span'); word.className = 'mm-scramble__word'; el.append(word); }
      word.append(mk(c));
    });
    probe.remove();
  },
};
