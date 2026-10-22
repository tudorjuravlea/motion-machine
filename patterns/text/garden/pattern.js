// text/garden: ornament grows out of the slot's own letterforms. Each letter is rasterised off
// screen (canvasText: true; the text that shows is DOM text) and read by runtime/kit/glyphs.js for
// its stroke ends, upward edges and the facing sides of its neighbours; plants root there, a little
// inside the ink. An organic kind is a preset of three parts, each settable on its own: a stem
// (curve: chains of cubic Bézier segments, a sinuous S smooth across every joint with one level of
// offshoots; branch: straighter twigs with angular joints and twigs on the offshoots; ribbon: flat
// blades rising from the baseline; root: forking threads hanging from the letters' feet; none: no
// stem, the parts sit in cushions on the letters' top edges), a leaf (round, lance, heart, or frond:
// graded leaflets along the whole stem) and a bloom (daisy, rose, tulip, bud, berry or spore).
// `mix` combines two or three part sets, seeded per stem. Circuits run 45-degree trace buses on a
// 0.08 em grid ending in vias and pads; crystals grow straight 30-degree stems ending in faceted
// shards. Stems weave: a run over a letter's ink goes behind it, and a capped share of later
// crossings passes in front, so the plant reads as growing through the type. The text never moves.
// Growth is clamped by the safe area and kept off every other filled slot. Colours are roles only:
// stems and leaves muted, blooms accent, detail lines accentInk, veins and shines canvas. Every
// window ends by p = 1, where the garden is complete and still (sway is opt-in and moves only the
// ornament). Pure in t: geometry is a cached function of the layout, the font and the params.
import { EM, INSET, analyse, anchors, bridge, candidates, maskOf, sdfAt } from '../../../runtime/kit/glyphs.js';
import { random } from '../../../runtime/kit/random.js';
import { pathOf } from '../../../runtime/kit/rough.js';
import { boxOf, safeArea } from '../../../runtime/kit/room.js';

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const out3 = (x) => 1 - (1 - clamp01(x)) ** 3;
const inOut3 = (x) => { const t = clamp01(x); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
const in2 = (x) => clamp01(x) ** 2;
const r2 = (x) => Math.round(x * 100) / 100;
const TEXT_IN = 0.16;          // the text fades in over this share of the entrance
const FRONT_CAP = 0.05;        // front-layer cover of glyph ink the plan allows (the proof holds 8 %)
const BOX_CAP = 0.06;          // ornament inside the slot's own text box, as a share of its area
// the organic kinds beyond vines and flowers carry more filled parts (leaf pairs, fronds, cushions,
// blades): their cap sits under the 5 % of the box that W-CONTRAST's percentile reads
const BOX_CAP_DENSE = 0.045;
const ORGANIC = ['vines', 'flowers', 'leaves', 'ferns', 'branches', 'roots', 'coral', 'seaweed', 'moss', 'grass'];
const KINDS = ['vines', 'flowers', 'circuits', 'crystals', 'leaves', 'ferns', 'branches', 'roots', 'coral', 'seaweed', 'moss', 'grass', 'mix', 'botanical'];
const STEMS = ['curve', 'branch', 'ribbon', 'root', 'none'];
const LEAVES = ['none', 'round', 'lance', 'heart', 'frond', 'broad'];
const BLOOMS = ['none', 'daisy', 'rose', 'tulip', 'bud', 'berry', 'spore', 'camellia', 'peony', 'lily', 'sweetpea'];
/** The illustrated blooms a botanical garden draws from, one per plant, by the seed. */
export const BOUQUET = ['camellia', 'peony', 'lily', 'sweetpea', 'bud'];
const BOTANY = new Set(['camellia', 'peony', 'lily', 'sweetpea']);

/** The parts each organic kind sets: a stem, a leaf and a bloom. */
export const PRESETS = {
  vines: { stem: 'curve', leaf: 'lance', bloom: 'daisy' },
  flowers: { stem: 'curve', leaf: 'lance', bloom: 'daisy' },
  leaves: { stem: 'curve', leaf: 'heart', bloom: 'none' },
  ferns: { stem: 'curve', leaf: 'frond', bloom: 'none' },
  branches: { stem: 'branch', leaf: 'none', bloom: 'daisy' },
  roots: { stem: 'root', leaf: 'none', bloom: 'none' },
  coral: { stem: 'branch', leaf: 'none', bloom: 'none' },
  seaweed: { stem: 'ribbon', leaf: 'none', bloom: 'none' },
  moss: { stem: 'none', leaf: 'lance', bloom: 'spore' },
  grass: { stem: 'ribbon', leaf: 'none', bloom: 'spore' },
  botanical: { stem: 'curve', leaf: 'broad', bloom: 'bouquet' },
};

const params = {
  kind: { type: `enum(${KINDS.join('|')})`, default: 'vines', meaning: 'what grows: an organic preset of a stem, a leaf and a bloom, circuit traces, crystal shards, or a mix of two or three organic presets' },
  stem: { type: 'enum(auto|curve|branch|ribbon|root|none)', default: 'auto', meaning: 'the stem: auto takes the kind\'s; curve, branch, ribbon (blades from the baseline), root (threads hanging from the feet) or none (cushions on the top edges)' },
  leaf: { type: 'enum(auto|none|round|lance|heart|frond|broad)', default: 'auto', meaning: 'the leaf: auto takes the kind\'s; frond sets graded leaflets along every stem; broad is a wide, pointed, veined leaf in two tones' },
  bloom: { type: 'enum(auto|none|daisy|rose|tulip|bud|berry|spore|camellia|peony|lily|sweetpea)', default: 'auto', meaning: 'what opens at a stem\'s end: auto takes the kind\'s (a number here is read as bloomShare); camellia, peony, lily and sweetpea are filled, shaded, veined blooms' },
  bloomShare: { type: 'number', default: 0.5, meaning: 'vines: the share of main stems that end in a bloom instead of a curl, 0 to 1' },
  density: { type: 'number', default: 1, meaning: 'how much grows, 0.5 to 1.6: anchors per letter, second plants, offshoots and bridges' },
  stemScale: { type: 'number', default: 1, meaning: 'how long stems grow, 0.5 to 2 (1: a first segment of about two thirds of the font size)' },
  seed: { type: 'number', default: 1, meaning: 'which garden: another seed grows another arrangement from the same letters' },
  bridges: { type: 'boolean', default: true, meaning: 'vines and circuits: stems that reach from a letter to its neighbour' },
  lean: { type: 'number', default: 0, meaning: 'the whole garden leans right (positive) or left (negative), -0.4 to 0.4 rad' },
  layer: { type: 'enum(weave|behind)', default: 'weave', meaning: 'weave passes some stems in front of the letters; behind keeps every stem under them' },
  sway: { type: 'enum(none|breathe)', default: 'none', meaning: 'after landing, breathe sways the ornament by its height above the root; the text never moves' },
  text: { type: 'enum(fade|present|type)', default: 'fade', meaning: 'the text fades in first, is there from the first frame, or is typed letter by letter while each letter\'s plants grow once it is there' },
  typeShare: { type: 'number', default: 0.5, meaning: 'text type: the share of the entrance the typing takes, 0.1 to 0.9; the plants of the last letter grow in the rest' },
  bed: { type: 'boolean', default: false, meaning: 'botanical: the flowers grow as a bed rising from below the headline toward its baseline, across the frame, instead of from the letters' },
  petals: { type: 'number', default: 8, meaning: 'botanical bed: loose petals that leave the blooms and drift in the air, 0 to 24' },
  drift: { type: 'enum(float|settle)', default: 'float', meaning: 'botanical: the loose petals keep floating slowly, within a small bound, or settle and hold still' },
};

const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
const part = (v, list) => (list.includes(v) ? v : 'auto');
/** The pattern's settings from a context's params, every value checked and clamped. */
export function settingsOf(ctx) {
  const p = ctx.params ?? {};
  return {
    kind: KINDS.includes(p.kind) ? p.kind : 'vines',
    stem: part(p.stem, STEMS),
    leaf: part(p.leaf, LEAVES),
    bloom: part(p.bloom, BLOOMS),
    bloomShare: num(typeof p.bloom === 'number' ? p.bloom : p.bloomShare, 0.5, 0, 1),
    density: num(p.density, 1, 0.5, 1.6),
    stemScale: num(p.stemScale, 1, 0.5, 2),
    seed: Math.round(num(p.seed, 1, -1e9, 1e9)),
    bridges: p.bridges !== false && p.bridges !== 'false',
    lean: num(p.lean, 0, -0.4, 0.4),
    layer: p.layer === 'behind' ? 'behind' : 'weave',
    sway: p.sway === 'breathe' ? 'breathe' : 'none',
    text: p.text === 'present' || p.text === 'type' ? p.text : 'fade',
    typeShare: num(p.typeShare, 0.5, 0.1, 0.9),
    bed: p.bed === true || p.bed === 'true',
    petals: Math.round(num(p.petals, 8, 0, 24)),
    drift: p.drift === 'settle' ? 'settle' : 'float',
  };
}

/**
 * The part sets a garden grows: [{ kind, stem, leaf, bloom }]. An organic kind gives one set, its
 * preset with every part the params name in place of the preset's; `mix` gives two or three
 * different organic presets drawn by the seed, each taking the named parts too. Circuits and
 * crystals give [{ kind }]: the parts do not apply to them.
 */
export function partSets(set) {
  if (set.kind === 'circuits' || set.kind === 'crystals') return [{ kind: set.kind }];
  let names = [set.kind];
  if (set.kind === 'mix') {
    const rnd = random(`garden|${set.seed}|mix`), pool = ORGANIC.slice();
    const n = rnd() < 0.5 ? 2 : 3;
    names = [];
    while (names.length < n) names.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  }
  return names.map((kind) => {
    const p = PRESETS[kind];
    return { kind, stem: set.stem === 'auto' ? p.stem : set.stem, leaf: set.leaf === 'auto' ? p.leaf : set.leaf, bloom: set.bloom === 'auto' ? p.bloom : set.bloom };
  });
}

function linear(ctx, p) {
  if (p >= 1) return 1;
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

// A spring from 0 to 1 over x in [0, 1] whose overshoot never exceeds `o`, exactly 1 from x = 1.
export function pop(x, o = 0.12) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const os = clamp(o, 0, 0.3);
  let f;
  if (os < 0.002) f = (t) => 1 - (1 + 7 * t) * Math.exp(-7 * t);
  else {
    const L = Math.log(os), z = -L / Math.sqrt(Math.PI * Math.PI + L * L);
    const wd = Math.PI / 0.4, wn = wd / Math.sqrt(1 - z * z), k = z / Math.sqrt(1 - z * z);
    f = (t) => 1 - Math.exp(-z * wn * t) * (Math.cos(wd * t) + k * Math.sin(wd * t));
  }
  return f(x) + (1 - f(1)) * x * x * x;
}

// ---------------------------------------------------------------------------------------------
// letters

const cells = new Map();
/**
 * One glyph drawn off screen at EM pixels per em, as the cell glyphs.js reads: { mask, w, h, ox, oy,
 * advance, ascent } (advance and ascent in em). The canvas never joins the page.
 */
export function glyphCell(doc, font, char) {
  const c = doc.createElement('canvas');
  let g = c.getContext('2d', { willReadFrequently: true });
  const spec = `${font.style} ${font.weight} ${EM}px ${font.family}`;
  g.font = spec;
  const m = g.measureText(char);
  const asc = Math.ceil(Math.max(m.fontBoundingBoxAscent || EM, m.actualBoundingBoxAscent || 0));
  const desc = Math.ceil(Math.max(m.fontBoundingBoxDescent || EM * 0.3, m.actualBoundingBoxDescent || 0));
  const left = Math.ceil(Math.max(0, m.actualBoundingBoxLeft || 0));
  const right = Math.ceil(Math.max(m.width, m.actualBoundingBoxRight || 0));
  const pad = Math.ceil(EM * 0.15);
  c.width = left + right + 2 * pad; c.height = asc + desc + 2 * pad;
  g = c.getContext('2d', { willReadFrequently: true });
  g.font = spec;
  const ox = pad + left, oy = pad + asc;
  g.fillText(char, ox, oy);
  const mask = maskOf(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  return { mask, w: c.width, h: c.height, ox, oy, advance: m.width / EM, ascent: (m.fontBoundingBoxAscent || EM) / EM };
}

function cellOf(doc, font, char) {
  const key = `${font.style}|${font.weight}|${font.family}|${char}`;
  let a = cells.get(key);
  if (!a) {
    const g = glyphCell(doc, font, char);
    a = Object.assign(analyse(g), { advance: g.advance, ascent: g.ascent });
    cells.set(key, a);
  }
  return a;
}

// Every non-space character of the slot's text, where it is laid out: its origin (left edge on the
// baseline) in the slot's own unscaled pixels, its word and line.
function lettersOf(el, font, fontPx) {
  const doc = el.ownerDocument;
  const box = el.getBoundingClientRect();
  const k = el.offsetWidth ? box.width / el.offsetWidth : 1;
  const walker = doc.createTreeWalker(el, 4);
  const range = doc.createRange();
  const out = [];
  let word = 0, space = true, n = 0, ci = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('svg')) continue;
    const s = node.textContent;
    for (let i = 0; i < s.length; ci++) {
      const cp = s.codePointAt(i), len = cp > 0xffff ? 2 : 1, ch = String.fromCodePoint(cp);
      if (/\s/.test(ch)) { if (!space) word++; space = true; i += len; continue; }
      space = false;
      range.setStart(node, i); range.setEnd(node, i + len);
      const r = range.getClientRects()[0];
      if (r && r.width > 0) {
        const cell = cellOf(doc, font, ch);
        out.push({ ch, index: n, ci, word, cell, x: (r.left - box.left) / k, top: (r.top - box.top) / k, base: (r.top - box.top) / k + cell.ascent * fontPx });
      }
      n++; i += len;
    }
  }
  const tops = [];
  for (const l of out) { let t = tops.findIndex((v) => Math.abs(v - l.top) < fontPx * 0.3); if (t < 0) { tops.push(l.top); t = tops.length - 1; } l.line = t; }
  return out;
}

// ---------------------------------------------------------------------------------------------
// the plan: every element of the garden, in slot pixels, with its growth window

// A coarse grid over the safe area: -1 forbidden (outside the safe area, on another text block),
// 0 free, or the id of the plant that holds the cell.
function gridOf(rect, cellPx, blocks) {
  const cols = Math.max(1, Math.ceil((rect.x1 - rect.x0) / cellPx)), rows = Math.max(1, Math.ceil((rect.y1 - rect.y0) / cellPx));
  const g = new Int32Array(cols * rows);
  const idx = (x, y) => { const c = Math.floor((x - rect.x0) / cellPx), r = Math.floor((y - rect.y0) / cellPx); return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c; };
  for (const b of blocks) {
    for (let y = b.y0; y <= b.y1; y += cellPx * 0.5) for (let x = b.x0; x <= b.x1; x += cellPx * 0.5) { const i = idx(x, y); if (i >= 0) g[i] = -1; }
  }
  return {
    at: (x, y) => { if (x < rect.x0 || y < rect.y0 || x > rect.x1 || y > rect.y1) return -1; const i = idx(x, y); return i < 0 ? -1 : g[i]; },
    mark: (x, y, id) => { const i = idx(x, y); if (i >= 0 && g[i] === 0) g[i] = id; },
    unmark: (id) => { for (let i = 0; i < g.length; i++) if (g[i] === id) g[i] = 0; },
    disc: (x, y, r, id) => { for (let yy = y - r; yy <= y + r; yy += cellPx * 0.5) for (let xx = x - r; xx <= x + r; xx += cellPx * 0.5) if (Math.hypot(xx - x, yy - y) <= r) { const i = idx(xx, yy); if (i >= 0 && g[i] === 0) g[i] = id; } },
    open: (x, y, r) => { for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2, rr = k === 16 ? 0 : r; const X = x + Math.cos(a) * rr, Y = y + Math.sin(a) * rr; if (X < rect.x0 || Y < rect.y0 || X > rect.x1 || Y > rect.y1) return false; const i = idx(X, Y); if (i < 0 || g[i] === -1) return false; } return true; },
    free: (x, y, r, id) => { for (let yy = y - r; yy <= y + r; yy += cellPx * 0.5) for (let xx = x - r; xx <= x + r; xx += cellPx * 0.5) { if (Math.hypot(xx - x, yy - y) > r) continue; const v = (xx < rect.x0 || yy < rect.y0 || xx > rect.x1 || yy > rect.y1) ? -1 : g[idx(xx, yy)]; if (v === -1 || (v !== 0 && v !== id)) return false; } return true; },
  };
}

const headingOf = (nx, ny) => Math.atan2(ny, nx);
// an anchor that faces down: a foot's edge, or a stroke end pointing down (the foot of an "A")
const isDown = (a) => a.kind === 'down' || (a.kind === 'terminal' && a.ny > 0.5);
const snap = (a, step) => Math.round(a / step) * step;

// ---------------------------------------------------------------------------------------------
// the growth model: a stem is a chain of cubic Bézier segments

const DEG = Math.PI / 180;
const between = (rnd, a, b) => a + (b - a) * rnd();
const dirOf = (a) => [Math.cos(a), Math.sin(a)];

/** The heading a stem leaves its anchor at: the outward normal (nx, ny) blended toward up by a seeded 0.3 to 0.7. */
export function startHeading(rnd, nx, ny) {
  const w = between(rnd, 0.3, 0.7);
  const x = (1 - w) * nx, y = (1 - w) * ny - w;
  return Math.hypot(x, y) < 1e-9 ? -Math.PI / 2 : Math.atan2(y, x);
}

/**
 * One stem from (x, y) leaving along `heading`: { segs, children }. Each segment { p0, c1, c2, p3,
 * len, turn, a0 } is a cubic Bézier that starts on the last one's end tangent a0 and turns it by
 * `turn`: its chord points along a0 + turn / 2 and its control points sit at a third and two thirds
 * of the chord, pushed to the outside of the bend by len × tan(turn / 2) / 3, so the tangent is
 * continuous across every joint. The first chord is size × stemScale × 0.55 to 0.85 (or `first`),
 * each next 0.72 to 0.9 of the one before; a turn is 12 to 34 degrees and its sign flips at a joint
 * with probability 0.7, which reads as a sinuous S. A main stem has 3 to 6 segments (at most
 * `maxSegs`); at each joint after the first it puts out an offshoot with probability 0.25 × density:
 * 1 to 3 segments turned 28 to 58 degrees off the parent's tangent, each offshoot on the other side
 * from the one before, its first chord 0.55 to 0.7 of the parent's segment there. Offshoots never
 * branch. The main chain is drawn before any offshoot, so density adds offshoots without reshaping it.
 *
 * Those numbers are the `curve` form; `form` grows another stem type from the same chain with its
 * own ranges (see FORMS): segment counts, first lengths, ratios, turns and the share of joints where
 * the sign flips, a bend factor on the control points (below 1 the joints turn angular, a twig's
 * crook), offshoots from joint `kidFrom` on, how many levels may branch (`depth`), and a pull that
 * leans every turn toward a `goal` heading (down for roots, up for ribbons and blades).
 */
export function sprout(rnd, { x, y, heading, size, stemScale = 1, density = 1, maxSegs = 6, child = false, first = null, form = FORMS.curve, level = child ? 1 : 0 }) {
  const f = form, kid = level > 0;
  const [s0, s1] = kid ? f.kidSegs : f.segs;
  const n = Math.min(maxSegs, s0 + Math.floor(rnd() * (s1 - s0 + 1)));
  const segs = [];
  let p0 = [x, y], a0 = heading, sign = rnd() < 0.5 ? -1 : 1, len = first ?? size * stemScale * between(rnd, f.first[0], f.first[1]);
  for (let k = 0; k < n; k++) {
    if (k) { if (rnd() < f.flip) sign = -sign; len *= between(rnd, f.ratio[0], f.ratio[1]); }
    let turn = sign * between(rnd, f.turn[0], f.turn[1]) * DEG;
    if (f.pull) turn += f.pull * wrapA(f.goal - a0 - turn);
    const [dx, dy] = dirOf(a0 + turn / 2), side = (len / 3) * Math.tan(turn / 2) * f.bend;
    // the chord's left normal is (-dy, dx); the control points move against it by `side`
    const at = (u) => [p0[0] + dx * len * u + dy * side, p0[1] + dy * len * u - dx * side];
    const p3 = [p0[0] + dx * len, p0[1] + dy * len];
    segs.push({ p0, c1: at(1 / 3), c2: at(2 / 3), p3, len, turn, a0 });
    p0 = p3; a0 += turn;
  }
  const children = [];
  if (level < f.depth) {
    let side = rnd() < 0.5 ? -1 : 1;
    for (let k = f.kidFrom; k < segs.length; k++) {
      if (rnd() >= f.kids * density) continue;
      const s = segs[k];
      let h = s.a0 + side * between(rnd, f.kidTurn[0], f.kidTurn[1]) * DEG;
      if (f.pull) h += f.pull * wrapA(f.goal - h);
      children.push({ at: k, stem: sprout(rnd, { x: s.p0[0], y: s.p0[1], heading: h, size, stemScale, density, form: f, level: level + 1, first: s.len * between(rnd, f.kidFirst[0], f.kidFirst[1]) }) });
      side = -side;
    }
  }
  return { segs, children };
}
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The growth form of each stem type: ranges in the units sprout documents. `curve` is the garden's
 * sinuous stem; `fern` arches gently and never branches; `branch` grows straighter twigs with angular
 * joints, offshoots at half the joints and twigs on the offshoots; `coral` grows short thick limbs
 * that fork often; `root` hangs and forks, pulled toward straight down; `kelp` and `blade` stand up,
 * pulled toward straight up, kelp tall and waving, a blade short and arching one way.
 */
export const FORMS = {
  curve: { segs: [3, 6], first: [0.55, 0.85], ratio: [0.72, 0.9], turn: [12, 34], flip: 0.7, bend: 1, kids: 0.25, kidFrom: 2, kidTurn: [28, 58], kidSegs: [1, 3], kidFirst: [0.55, 0.7], depth: 1, pull: 0, goal: 0 },
  fern: { segs: [3, 5], first: [0.6, 0.85], ratio: [0.8, 0.92], turn: [4, 12], flip: 0.2, bend: 1, kids: 0, kidFrom: 2, kidTurn: [28, 58], kidSegs: [1, 3], kidFirst: [0.55, 0.7], depth: 0, pull: 0, goal: 0 },
  branch: { segs: [2, 5], first: [0.4, 0.62], ratio: [0.7, 0.88], turn: [5, 18], flip: 0.5, bend: 0.35, kids: 0.55, kidFrom: 1, kidTurn: [30, 55], kidSegs: [1, 2], kidFirst: [0.5, 0.75], depth: 2, pull: 0, goal: 0 },
  coral: { segs: [2, 4], first: [0.22, 0.32], ratio: [0.82, 0.96], turn: [6, 22], flip: 0.5, bend: 0.7, kids: 0.85, kidFrom: 1, kidTurn: [20, 40], kidSegs: [1, 3], kidFirst: [0.75, 0.95], depth: 2, pull: 0, goal: 0 },
  root: { segs: [3, 6], first: [0.24, 0.36], ratio: [0.8, 0.95], turn: [8, 28], flip: 0.5, bend: 0.8, kids: 0.6, kidFrom: 1, kidTurn: [25, 50], kidSegs: [1, 3], kidFirst: [0.6, 0.85], depth: 2, pull: 0.3, goal: Math.PI / 2 },
  kelp: { segs: [3, 5], first: [0.36, 0.5], ratio: [0.88, 1.02], turn: [8, 20], flip: 0.85, bend: 1, kids: 0, kidFrom: 1, kidTurn: [0, 0], kidSegs: [1, 1], kidFirst: [1, 1], depth: 0, pull: 0.45, goal: -Math.PI / 2 },
  blade: { segs: [2, 3], first: [0.3, 0.42], ratio: [0.8, 0.95], turn: [4, 12], flip: 0.12, bend: 1, kids: 0, kidFrom: 1, kidTurn: [0, 0], kidSegs: [1, 1], kidFirst: [1, 1], depth: 0, pull: 0.15, goal: -Math.PI / 2 },
};

/**
 * A curl at a stem's tip: an Archimedean spiral of 1.2 to 1.8 turns that leaves `tip` along
 * `heading`, winds toward `side` (1 or -1) and shrinks from radius r0 to nothing at its centre.
 * Points at least every `step` px. Returns { pts, centre, turns }.
 */
export function spiral(rnd, tip, heading, side, r0, step) {
  const turns = between(rnd, 1.2, 1.8), span = turns * TAU;
  const [nx, ny] = dirOf(heading + side * Math.PI / 2);
  const centre = [tip[0] + nx * r0, tip[1] + ny * r0];
  const from = heading - side * Math.PI / 2;
  const n = Math.max(96, Math.ceil((span * r0) / 2 / Math.max(0.5, step)));
  const pts = [[tip[0], tip[1]]];
  for (let i = 1; i <= n; i++) {
    const f = (i / n) * span, r = r0 * (1 - i / n), a = from + side * f;
    pts.push(i === n ? [...centre] : [centre[0] + Math.cos(a) * r, centre[1] + Math.sin(a) * r]);
  }
  return { pts, centre, turns };
}

// A chain of Bézier segments as points every `step` px along its length, and the index of the
// point at each joint (joints[k] starts segment k; the last entry is the tip).
function chainPts(segs, step) {
  const dense = [segs[0].p0], marks = [0];
  for (const s of segs) {
    const m = Math.max(8, Math.ceil(s.len / (step * 0.25)));
    for (let i = 1; i <= m; i++) {
      const t = i / m, u = 1 - t;
      dense.push([u * u * u * s.p0[0] + 3 * u * u * t * s.c1[0] + 3 * u * t * t * s.c2[0] + t * t * t * s.p3[0], u * u * u * s.p0[1] + 3 * u * u * t * s.c1[1] + 3 * u * t * t * s.c2[1] + t * t * t * s.p3[1]]);
    }
    marks.push(dense.length - 1);
  }
  const pts = [dense[0]], joints = [0];
  let carry = 0, j = 1;
  for (let i = 1; i < dense.length; i++) {
    const [ax, ay] = dense[i - 1], [bx, by] = dense[i], d = Math.hypot(bx - ax, by - ay);
    let u = step - carry;
    while (u <= d) { pts.push([ax + (bx - ax) * (u / d), ay + (by - ay) * (u / d)]); u += step; }
    carry = d - (u - step);
    while (j < marks.length && marks[j] === i) { if (Math.hypot(pts.at(-1)[0] - bx, pts.at(-1)[1] - by) > step * 0.25) pts.push([bx, by]), carry = 0; joints.push(pts.length - 1); j++; }
  }
  return { pts, joints };
}

export function plan(el, ctx) {
  const doc = el.ownerDocument;
  const cs = getComputedStyle(el);
  const fontPx = parseFloat(cs.fontSize) || 16;
  const font = { style: cs.fontStyle, weight: cs.fontWeight, family: cs.fontFamily };
  const set = settingsOf(ctx);
  const letters = lettersOf(el, font, fontPx);
  const W = el.offsetWidth, H = el.offsetHeight;
  const me = boxOf(el), area = safeArea(el);
  const em = fontPx;
  const inset = 2 + fontPx * 0.03;   // half a stem and an antialiased edge
  const rect = me && area ? { x0: area.x0 - me.x0 + inset, y0: area.y0 - me.y0 + inset, x1: area.x1 - me.x0 - inset, y1: area.y1 - me.y0 - inset } : { x0: -W, y0: -H, x1: 2 * W, y1: 2 * H };
  const blocks = [];
  const scene = el.closest('.mm-camera') ?? el.parentElement;
  if (me && scene) {
    for (const n of scene.querySelectorAll('[data-slot]:not([data-empty]), [data-keep]')) {
      if (n === el || n.contains(el) || el.contains(n)) continue;
      const b = boxOf(n);
      if (!b) continue;
      const m = em * 0.08;
      blocks.push({ x0: b.x0 - me.x0 - m, y0: b.y0 - me.y0 - m, x1: b.x1 - me.x0 + m, y1: b.y1 - me.y0 + m });
    }
  }
  // the stage in the slot's own pixels: a botanical bed grows across all of it
  const rootCss = getComputedStyle(doc.documentElement);
  const fw = parseFloat(rootCss.getPropertyValue('--mm-frame-w')) || 0, fh = parseFloat(rootCss.getPropertyValue('--mm-frame-h')) || 0;
  const frame = me && fw && fh ? { x0: -me.x0, y0: -me.y0, x1: fw - me.x0, y1: fh - me.y0 } : null;
  const key = JSON.stringify([set, font, fontPx, W, H, rect, blocks, letters.map((l) => [l.ch, r2(l.x), r2(l.base), l.word, l.line])]);
  const hit = models.get(key);
  if (hit) return hit;

  const model = { key, em, set, letters: letters.map((l) => ({ ch: l.ch, index: l.index, ci: l.ci, x: l.x, base: l.base, anchors: [] })), elements: [], inkArea: 0, front: 0, box: { W, H } };
  if (!letters.length) { remember(key, model); return model; }
  // the signed distance to the nearest letter's ink, in em, at a slot point
  const inkAt = (x, y) => {
    let best = 1e3;
    for (const l of letters) {
      const c = l.cell, s = em / EM;
      if (x < l.x - c.ox * s || x > l.x + (c.w - c.ox) * s || y < l.base - c.oy * s || y > l.base + (c.h - c.oy) * s) continue;
      best = Math.min(best, sdfAt(c, (x - l.x) / em, (y - l.base) / em));
    }
    return best;
  };
  model.inkAt = inkAt;
  for (const l of letters) model.inkArea += l.cell.area;

  const grid = gridOf(rect, em * 0.08, blocks);
  const rndOf = (tag) => random(`garden|${set.seed}|${tag}`);
  const overO = Math.min(0.12, ctx.style?.motion?.overshootMax ?? 0.15);
  model.overshoot = overO;
  const els = model.elements;
  let plantId = 0;
  const nL = letters.length, lastLine = Math.max(...letters.map((l) => l.line));
  const spread = Math.min(1.1, 0.12 * nL + 0.2);
  const lengthOf = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
  const claim = (pts, id) => { for (const [x, y] of pts) grid.mark(x, y, id); };
  const tangentAt = (pts, u) => { const i = clamp(Math.round(u * (pts.length - 1)), 1, pts.length - 1); return Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]); };
  const pointAt = (pts, u) => { const f = u * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]; };
  // the growth time at which a stem drawn with out3 over [s, s + d] reaches u of its length
  const reach = (s, d, u, ease = 'out3') => s + d * (ease === 'out3' ? 1 - Math.cbrt(1 - clamp01(u)) : ease === 'in2' ? Math.sqrt(clamp01(u)) : clamp01(u));
  // room for a part centred at (x, y): its core r clear of other plants, its whole reach clear of
  // the safe margin and every other text block, and off the letters' ink
  const okBlob = (x, y, r, id, reach = r) => grid.free(x, y, r, id) && grid.open(x, y, reach) && inkAt(x, y) * em > r * 0.6;

  function stem(pts, { w0, w1, t0, dur, root, id, ease = 'out3', shape = 'taper', bridge: isBridge = false, lands = false }) {
    const e = { type: shape === 'line' ? 'line' : shape === 'trace' ? 'trace' : 'stem', pts, w0, w1, t0, dur, ease, root, id, runs: null, bridge: isBridge, lands };
    els.push(e);
    return e;
  }

  function leaf(x, y, ang, len, wid, t0, root, id, dur = 0.45, shape = 'lance') {
    els.push(shape === 'lance' ? { type: 'leaf', x, y, ang, len, wid, t0, dur, root, id } : { type: 'leaf', shape, x, y, ang, len, wid, t0, dur, root, id });
    if (shape === 'broad') els.at(-1).tone = els.length % 2 ? 'deep' : 'sage';   // broad leaves alternate their two tones
  }
  function blossom(x, y, r, ang, t0, root, id, rnd, form = 'daisy', grains = null) {
    els.push({ type: 'bloom', x, y, r, ang, t0, dur: 0.75, root, id, n: r > em * 0.2 && rnd() < 0.5 ? 6 : 5, twist: (rnd() - 0.5) * 0.3, notch: rnd() < 0.6 });
    if (form !== 'daisy') Object.assign(els.at(-1), { form, seed: Math.floor(rnd() * 1e6), grains });
    if (BOTANY.has(form)) Object.assign(els.at(-1), { botany: true, tilt: 0.72 + (els.at(-1).seed % 100) / 450 });
  }
  function bud(x, y, r, ang, t0, root, id) { els.push({ type: 'bud', x, y, r, ang, t0, dur: 0.5, root, id }); }
  // the last element pushed, tied to the stem point it grows from (the budget cuts a stem back with what hangs on it)
  const hang = (on, at) => Object.assign(els.at(-1), { on, at });
  // A bloom of the set's form at a grown stem's end, on the spring once the stem is complete: one
  // that does not fit opens smaller, then not at all; `bud` puts a bud.
  function endBloom(g, form, { id, rnd, root, R, grains = null }) {
    if (form === 'none') return;
    const e = g.e, tip = e.pts.at(-1), te = tangentAt(e.pts, 1);
    if (form === 'bud') {
      if (okBlob(tip[0], tip[1], R * 0.5, id)) { grid.disc(tip[0], tip[1], R * 0.5, id); bud(tip[0], tip[1], R * 0.45, te, g.tEnd, root, id); hang(e, e.pts.length - 1); }
      return;
    }
    const r = [1, 0.75, 0.55].map((f) => R * f).find((v) => okBlob(tip[0], tip[1], v * 0.7, id, v * 1.1));
    if (!r) return;
    grid.disc(tip[0], tip[1], r * 0.7, id);
    blossom(tip[0], tip[1], r, te, g.tEnd, root, id, rnd, form, grains);
    hang(e, e.pts.length - 1);
  }

  // -- curve and branch stems: a Bézier stem with offshoots. The main stem reveals by arc length on
  // an ease-out; an offshoot starts when the reveal passes its joint and takes 60 % of the time the
  // parent has left; ends open on the spring once their stem is complete. Flowers end in a blossom,
  // their offshoots in a bud or a pair of leaves; vines end in a curl (or, for a `bloomShare` of
  // main stems, a bloom), with a leaf at every second joint on alternating sides. Leaves set pairs
  // of leaves along every stem; ferns grow graded leaflets and end in a fiddlehead curl; branches
  // grow twigs with buds at their joints and small blossoms at their tips; coral grows thick limbs
  // that widen toward round tips.
  function plant(l, a, k, ps) {
    const flowers = ps.kind === 'flowers', branchy = ps.stem === 'branch';
    const id = ++plantId, rnd = rndOf(`plant|${l.index}|${k}`);
    if (ps.bloom === 'bouquet') ps = { ...ps, bloom: BOUQUET[Math.floor(rnd() * BOUQUET.length)] };
    const x = l.x + a.x * em, y = l.base + a.y * em;
    const down = isDown(a), lower = l.line > 0 && !down;
    // a letter's later plants reach a little higher, so their ends open in a tier of their own
    const scale = set.stemScale * (down ? 0.4 : lower ? 0.45 : 1 + 0.2 * Math.min(2, k)), grow = Math.sqrt(scale);
    const h = startHeading(rnd, a.nx, down ? -a.ny : a.ny);
    const form = branchy ? (ps.kind === 'coral' ? FORMS.coral : FORMS.branch) : ps.kind === 'ferns' ? FORMS.fern : FORMS.curve;
    const sk = sprout(rnd, { x, y, heading: (down ? -h : h) + set.lean, size: em, stemScale: scale, density: set.density, maxSegs: down || lower ? 3 : 6, form });
    const t0 = 0.12 + spread * (l.index / Math.max(1, nL - 1)) + 0.1 * k + rnd() * 0.05;
    const hasBloom = ps.bloom !== 'none';
    const bloomEnd = flowers ? hasBloom : ps.kind === 'vines' ? rnd() < set.bloomShare && hasBloom : hasBloom;
    const look = ps.kind === 'coral' ? { w0: em * 0.075 * grow, w1: em * 0.075 * grow, profile: 'club' }
      : branchy ? { w0: em * 0.042 * grow, w1: em * 0.012 }
        : ps.kind === 'ferns' || ps.kind === 'leaves' ? { w0: em * 0.024 * grow, w1: em * 0.006 } : { w0: em * 0.032 * grow, w1: em * 0.008 };
    const main = grown(sk.segs, { id, rnd, t0, root: y, ...look, curl: !bloomEnd && !branchy, curlR: em * (ps.kind === 'ferns' ? 0.085 : 0.11) * grow });
    if (!main) return;
    const { e, joints } = main;
    if (bloomEnd && !e.curl) {
      // a blossom may tuck its petal tips behind a neighbour's (its core stays clear); one that does
      // not fit opens smaller, and below half its size becomes a bud. A stem cut short by the frame
      // or a text block steps back along itself until its end fits, and ends there.
      const R = em * grow * between(rnd, 0.15, 0.22) * (ps.kind === 'branches' ? 0.62 : 1);
      for (const back of main.cut ? [0, 4, 8, 12] : [0]) {
        const i = e.pts.length - 1 - back;
        if (i < 2) break;
        const tip = e.pts[i], te = tangentAt(e.pts.slice(0, i + 1), 1), t = reach(e.t0, e.dur, i / (e.pts.length - 1));
        const r = ps.bloom === 'bud' ? null : [1, 0.75, 0.55].map((f) => R * f).find((v) => okBlob(tip[0], tip[1], v * 0.7, id, v * 1.1));
        const put = r ? () => { grid.disc(tip[0], tip[1], r * 0.7, id); blossom(tip[0], tip[1], r, te, t, y, id, rnd, ps.bloom, ps.bloom === 'spore' ? 5 : null); if (ps.kind === 'branches') els.at(-1).notch = true; }
          : okBlob(tip[0], tip[1], em * 0.06, id) ? () => bud(tip[0], tip[1], em * 0.06, te, t, y, id) : null;
        if (!put) continue;
        put(); hang(e, i);
        if (back) { e.dur = Math.max(0.2, e.dur * (i + 1) / e.pts.length); e.pts = e.pts.slice(0, i + 1); els.at(-1).t0 = e.t0 + e.dur; }
        break;
      }
    }
    if (ps.leaf === 'frond') frond(e, grow, id, y, rnd);
    else if (ps.kind === 'leaves' && ps.leaf !== 'none') pairs(e, ps.leaf, grow, id, y, rnd);
    else if (!flowers && ps.leaf !== 'none') {
      let side = rnd() < 0.5 ? -1 : 1;
      for (let j = 1; j < joints.length - 1; j += 2) {
        if (joints[j] >= e.pts.length - 1) break;
        const [jx, jy] = e.pts[joints[j]], ang = tangentAt(e.pts, joints[j] / (e.pts.length - 1)) + side * between(rnd, 0.55, 0.95);
        const len = em * grow * between(rnd, 0.2, 0.3), wid = len * between(rnd, 0.4, 0.5) * (ps.leaf === 'lance' ? 1 : ps.leaf === 'broad' ? 1.1 : 1.9);
        const cx = jx + Math.cos(ang) * len * 0.5, cy = jy + Math.sin(ang) * len * 0.5;
        side = -side;
        if (!okBlob(cx, cy, len * 0.35, id, len * 0.5)) continue;
        grid.disc(cx, cy, len * 0.35, id);
        leaf(jx, jy, ang, len, wid, reach(e.t0, e.dur, joints[j] / (e.pts.length - 1)), y, id, 0.45, ps.leaf);
        hang(e, joints[j]);
      }
    }
    if (branchy) {
      if (ps.kind === 'branches') twigBuds(e, joints, grow, id, y, rnd);
      const tipR = em * grow * 0.12;
      limbs(e, sk.children, { id, rnd, root: y, curl: false, end: ps.kind === 'coral' || !hasBloom ? null : (sub) => endBloom(sub, rnd() < 0.6 ? ps.bloom : 'bud', { id, rnd, root: y, R: tipR * between(rnd, 0.85, 1.15), grains: 5 }) });
      return;
    }
    for (const c of sk.children) {
      const at = joints[c.at];
      if (at == null || at >= e.pts.length - 1) continue;
      const ts = reach(e.t0, e.dur, at / (e.pts.length - 1));
      const sub = grown(c.stem.segs, { id, rnd, t0: ts, dur: 0.6 * (e.t0 + e.dur - ts), root: y, w0: e.w0 * 0.6 + e.w1 * 0.4, w1: em * 0.006, curl: !flowers, curlR: em * 0.07 * grow, parent: e, at });
      if (sub && ps.kind === 'leaves' && ps.leaf !== 'none') pairs(sub.e, ps.leaf, grow * 0.8, id, y, rnd);
      if (!sub || sub.cut || !flowers) continue;
      const end = sub.e.pts.at(-1), ce = tangentAt(sub.e.pts, 1);
      if (rnd() < 0.5 || ps.leaf === 'none') {
        if (okBlob(end[0], end[1], em * 0.07 * grow, id)) { grid.disc(end[0], end[1], em * 0.07 * grow, id); bud(end[0], end[1], em * 0.06 * grow, ce, sub.tEnd, y, id); hang(sub.e, sub.e.pts.length - 1); }
      } else {
        for (const s of [-1, 1]) {
          const ang = ce + s * between(rnd, 0.5, 0.75), len = em * grow * between(rnd, 0.15, 0.2);
          const cx = end[0] + Math.cos(ang) * len * 0.5, cy = end[1] + Math.sin(ang) * len * 0.5;
          if (!okBlob(cx, cy, len * 0.3, id, len * 0.45)) continue;
          grid.disc(cx, cy, len * 0.3, id);
          leaf(end[0], end[1], ang, len, len * 0.42 * (ps.leaf === 'lance' ? 1 : ps.leaf === 'broad' ? 1.2 : 1.9), sub.tEnd, y, id, 0.45, ps.leaf);
          hang(sub.e, sub.e.pts.length - 1);
        }
      }
    }
  }
  // Offshoots of a stem, and theirs in turn: each starts when its parent's reveal passes the joint
  // it grows from and takes 60 % of the time the parent has left, as wide as the parent there.
  function limbs(e, kids, { id, rnd, root, curl, curlR = 0, end = null }) {
    const n = e.pts.length - 1;
    for (const c of kids) {
      const at = e.joints[c.at];
      if (at == null || at >= n) continue;
      const ts = reach(e.t0, e.dur, at / n);
      const sub = grown(c.stem.segs, { id, rnd, t0: ts, dur: 0.6 * (e.t0 + e.dur - ts), root, w0: widthOf(e, at / n) * 0.85, w1: e.profile === 'club' ? widthOf(e, at / n) * 0.85 : Math.max(em * 0.004, e.w1 * 0.8), profile: e.profile, curl, curlR, parent: e, at });
      if (!sub) continue;
      if (c.stem.children.length) limbs(sub.e, c.stem.children, { id, rnd, root, curl, curlR, end });
      if (!sub.cut && end) end(sub);
    }
  }
  // pairs of leaves along a stem's chain (not its curl), every quarter em or so, shrinking toward the tip
  function pairs(e, shape, grow, id, root, rnd) {
    const tipI = Math.min(e.pts.length - 1, e.joints?.at(-1) ?? e.pts.length - 1);
    const chain = e.pts.slice(0, tipI + 1), L = lengthOf(chain), gap = em * 0.26 * grow;
    for (let d = gap * 0.6; d < L - gap * 0.3; d += gap * between(rnd, 0.85, 1.15)) {
      const u = d / L, i = Math.round(u * tipI), [jx, jy] = e.pts[i], tan = tangentAt(chain, u);
      const len = em * grow * between(rnd, 0.17, 0.25) * (1 - 0.35 * u), wid = len * (shape === 'lance' ? 0.45 : shape === 'frond' ? 0.5 : shape === 'broad' ? 0.55 : 0.92);
      for (const side of [-1, 1]) {
        const ang = tan + side * between(rnd, 0.75, 1.05);
        const cx = jx + Math.cos(ang) * len * 0.55, cy = jy + Math.sin(ang) * len * 0.55;
        if (!okBlob(cx, cy, len * 0.33, id, len * 0.5)) continue;
        grid.disc(cx, cy, len * 0.33, id);
        leaf(jx, jy, ang, len, wid, reach(e.t0, e.dur, i / (e.pts.length - 1)), root, id, 0.45, shape === 'frond' ? 'leaflet' : shape);
        hang(e, i);
      }
    }
  }
  // graded leaflets along a stem's chain: a fern's frond
  function frond(e, grow, id, root, rnd) {
    const tipI = Math.min(e.pts.length - 1, e.joints?.at(-1) ?? e.pts.length - 1);
    const chain = e.pts.slice(0, tipI + 1);
    for (const q of frondLeaflets(rnd, lengthOf(chain) / em, 0.2 * grow)) {
      const i = Math.round(q.u * tipI), [px, py] = e.pts[i], ang = tangentAt(chain, q.u) + q.side * q.tilt;
      const len = q.len * em, cx = px + Math.cos(ang) * len * 0.5, cy = py + Math.sin(ang) * len * 0.5;
      if (len < em * 0.025 || !okBlob(cx, cy, len * 0.22, id, len * 0.4)) continue;
      leaf(px, py, ang, len, len * 0.34, reach(e.t0, e.dur, i / (e.pts.length - 1)), root, id, 0.3, 'leaflet');
      hang(e, i);
    }
  }
  // buds at some joints of a twig, set off to one side
  function twigBuds(e, joints, grow, id, root, rnd) {
    for (let j = 1; j < joints.length - 1; j++) {
      const i = joints[j];
      if (i >= e.pts.length - 1) break;
      if (rnd() < 0.45) continue;
      const [jx, jy] = e.pts[i], ang = tangentAt(e.pts, i / (e.pts.length - 1)) + (rnd() < 0.5 ? -1 : 1) * between(rnd, 0.6, 1.0), r = em * 0.045 * grow;
      if (!okBlob(jx + Math.cos(ang) * r * 1.3, jy + Math.sin(ang) * r * 1.3, r * 0.8, id)) continue;
      bud(jx, jy, r, ang, reach(e.t0, e.dur, i / (e.pts.length - 1)), root, id);
      hang(e, i);
    }
  }

  // -- ribbon stems. Seaweed grows a tall kelp ribbon from each upward anchor, pulled toward
  // straight up, waving while it grows; it ruffles along its edges and carries a midrib. Any other
  // ribbon set grows grass from the baseline where it is open (between letters and in counters):
  // clumps of three to five blades fanned around straight up (the middle ones tallest) and, at about half of the clumps, a taller stalk ending in the set's
  // bloom (a head of grains for spore). A line with another under it grows them shorter.
  function kelp(l, a, k, ps) {
    if (isDown(a)) return;
    const id = ++plantId, rnd = rndOf(`kelp|${l.index}|${k}`), under = l.line > 0;
    const x = l.x + a.x * em, y = l.base + a.y * em;
    const sc = set.stemScale * between(rnd, 0.85, 1.25) * (under ? 0.45 : 1) * (1 + 0.15 * Math.min(2, k));
    const sk = sprout(rnd, { x, y, heading: startHeading(rnd, a.nx, a.ny) + set.lean, size: em, stemScale: sc, form: FORMS.kelp, maxSegs: under ? 2 : 5 });
    const t0 = 0.12 + spread * (l.index / Math.max(1, nL - 1)) + 0.1 * k + rnd() * 0.05;
    const g = grown(sk.segs, { id, rnd, t0, root: y, w0: em * between(rnd, 0.075, 0.1) * Math.sqrt(sc), w1: 0, profile: 'kelp' });
    if (!g) return;
    Object.assign(g.e, { wave: true, ruffle: between(rnd, 22, 34) });
    if (!g.cut) endBloom(g, ps.bloom, { id, rnd, root: y, R: em * 0.1 * Math.sqrt(sc), grains: 5 });
  }
  function ground(l, ps, k) {
    const rnd = rndOf(`ground|${l.index}|${k}`);
    const adv = l.cell.advance * em, under = l.line < lastLine;
    const n = Math.max(1, Math.round(l.cell.advance * 2 * set.density));
    for (let i = 0; i < n; i++) {
      const id = ++plantId;
      // a clump roots where the baseline is open: the first of a few seeded tries, along this letter
      // and the gap after it, with no ink a fifth of an em above the baseline
      const tries = Array.from({ length: 6 }, () => l.x + adv * between(rnd, 0, 1.25));
      const x = tries.find((X) => inkAt(X, l.base - em * 0.2) > 0.04 && inkAt(X, l.base - em * 0.05) > 0.03) ?? tries[0], y = l.base + em * 0.015;
      const t0 = 0.12 + spread * (l.index / Math.max(1, nL - 1)) + 0.06 * i + rnd() * 0.05;
      const nb = 3 + Math.floor(rnd() * 3), fan = between(rnd, 0.16, 0.26);
      for (let b = 0; b < nb; b++) {
        const off = b - (nb - 1) / 2, mid = 1 - Math.abs(off) / nb;
        const sc = set.stemScale * between(rnd, 0.85, 1.25) * (0.7 + 0.5 * mid) * (under ? 0.6 : 1);
        const sk = sprout(rnd, { x: x + off * em * 0.025, y, heading: -Math.PI / 2 + off * fan + between(rnd, -0.08, 0.08) + set.lean, size: em, stemScale: sc, form: FORMS.blade });
        grown(sk.segs, { id, rnd, t0: t0 + b * 0.04, root: y, w0: em * between(rnd, 0.024, 0.034) * Math.sqrt(sc), w1: 0, profile: 'blade' });
      }
      if (ps.bloom !== 'none' && rnd() < 0.7 * set.density) {
        const sc = set.stemScale * between(rnd, 1.25, 1.6) * (under ? 0.6 : 1);
        const sk = sprout(rnd, { x, y, heading: -Math.PI / 2 + between(rnd, -0.25, 0.25) + set.lean, size: em, stemScale: sc, form: FORMS.blade });
        const g = grown(sk.segs, { id, rnd, t0: t0 + 0.1, root: y, w0: em * 0.014, w1: em * 0.008 });
        if (g && !g.cut) endBloom(g, ps.bloom, { id, rnd, root: y, R: em * (ps.bloom === 'spore' ? 0.11 : 0.12) * Math.sqrt(sc), grains: 4 + Math.floor(rnd() * 3) });
      }
    }
  }

  // -- root stems hang from the letter's feet (its downward anchors, else the baseline under it),
  // fork twice, and carry fine hairs on their outer half: roots, or mycelium threads.
  function rooted(l, ps, list, k) {
    const rnd = rndOf(`root|${l.index}|${k}`), under = l.line < lastLine;
    const feet = list.filter(isDown).map((a) => [l.x + a.x * em, l.base + a.y * em]);
    if (!feet.length) feet.push([l.x + l.cell.advance * em * between(rnd, 0.3, 0.7), l.base + em * 0.01]);
    while (feet.length < 2) feet.push([l.x + l.cell.advance * em * between(rnd, 0.2, 0.8), l.base + em * 0.01]);
    const n = Math.min(feet.length, 1 + (rnd() < 0.6 * set.density ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const id = ++plantId, [x, y] = feet[i];
      const sc = set.stemScale * between(rnd, 0.8, 1.2) * (under ? 0.5 : 1);
      const sk = sprout(rnd, { x, y, heading: Math.PI / 2 + between(rnd, -0.7, 0.7) + set.lean, size: em, stemScale: sc, density: set.density, form: FORMS.root, maxSegs: under ? 2 : 6 });
      const t0 = 0.12 + spread * (l.index / Math.max(1, nL - 1)) + 0.08 * i + rnd() * 0.05;
      const g = grown(sk.segs, { id, rnd, t0, root: y, w0: em * 0.038 * Math.sqrt(sc), w1: em * 0.006 });
      if (!g) continue;
      const before = els.length;
      limbs(g.e, sk.children, { id, rnd, root: y, curl: false, end: null });
      if (!g.cut) endBloom(g, ps.bloom, { id, rnd, root: y, R: em * 0.09, grains: 1 });
      for (const s of [g.e, ...els.slice(before).filter((x) => x.pts)]) hairs(s, id, y, rnd);
    }
  }
  function hairs(e, id, root, rnd) {
    const n = e.pts.length - 1, step = Math.max(2, Math.round((em * 0.09) / (em * 0.03)));
    for (let i = Math.ceil(n * 0.45); i < n; i += step) {
      if (rnd() < 0.45) continue;
      const tan = tangentAt(e.pts, i / n), ang = tan + (rnd() < 0.5 ? -1 : 1) * between(rnd, 0.8, 1.3), len = em * between(rnd, 0.035, 0.08);
      const [px, py] = e.pts[i], pts = densify([[px, py], [px + Math.cos(ang) * len, py + Math.sin(ang) * len]], em * 0.03);
      if (pts.some(([X, Y]) => grid.at(X, Y) === -1)) continue;
      stem(pts, { w0: em * 0.007, w1: em * 0.007, t0: reach(e.t0, e.dur, i / n), dur: 0.25, root, id, ease: 'out3', shape: 'line' });
      hang(e, i);
    }
  }

  // -- no stem: cushions of moss on the letter's top edges. Each is a cluster of small dots set just
  // outside the edge (largest in the middle, opening from the middle out), tufts of the set's leaf,
  // and one or two fine stalks ending in the set's bloom (a capsule for spore).
  function moss(l, ps, k) {
    const rnd = rndOf(`moss|${l.index}|${k}`);
    const tops = candidates(l.cell).filter((c) => c.kind === 'up');
    if (!tops.length) return;
    const want = clamp(Math.round(l.cell.advance * 2 * set.density), 1, 3), centres = [];
    for (let tries = 0; tries < 24 && centres.length < want; tries++) {
      const c = tops[Math.floor(rnd() * tops.length)];
      if (centres.every((q) => Math.hypot(q.x - c.x, q.y - c.y) >= 0.18)) centres.push(c);
    }
    const P = (q, off) => [l.x + (q.x + q.nx * off) * em, l.base + (q.y + q.ny * off) * em];
    centres.forEach((c, ci) => {
      const id = ++plantId, root = l.base + c.y * em;
      const span = between(rnd, 0.1, 0.18) * Math.sqrt(set.stemScale);
      const near = tops.filter((q) => Math.hypot(q.x - c.x, q.y - c.y) <= span);
      const t0 = 0.12 + spread * (l.index / Math.max(1, nL - 1)) + 0.08 * ci + rnd() * 0.05;
      const m = Math.round((7 + 6 * clamp01((span - 0.1) / 0.08)) * set.density);
      for (let j = 0; j < m; j++) {
        const q = near[Math.floor(rnd() * near.length)], d = Math.hypot(q.x - c.x, q.y - c.y) / span;
        const r = em * between(rnd, 0.02, 0.042) * (1 - 0.4 * d);
        const [x, y] = P(q, INSET + (r * 0.7) / em + rnd() * 0.018);
        const xx = x + (rnd() - 0.5) * em * 0.02;
        if (!grid.free(xx, y, r, id) || !grid.open(xx, y, r) || inkAt(xx, y) * em < r * 0.45) continue;
        els.push({ type: 'dot', x: xx, y, r, t0: t0 + 0.35 * d + rnd() * 0.08, dur: 0.32, root, id });
      }
      const nT = ps.leaf === 'none' ? 0 : (rnd() < 0.7 ? 1 : 0) + (rnd() < 0.3 * set.density ? 1 : 0);
      for (let j = 0; j < nT; j++) {
        const q = near[Math.floor(rnd() * near.length)], [x, y] = P(q, INSET + 0.008);
        const ang = startHeading(rnd, q.nx, q.ny) + set.lean, len = em * between(rnd, 0.05, 0.085) * Math.sqrt(set.stemScale);
        if (!okBlob(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5, len * 0.35, id, len * 0.6)) continue;
        els.push({ type: 'tuft', x, y, ang, len, n: 3 + Math.floor(rnd() * 3), spread: between(rnd, 0.9, 1.4), shape: ps.leaf, t0: t0 + 0.2 + rnd() * 0.15, dur: 0.4, root, id });
      }
      const nS = ps.bloom === 'none' ? 0 : (rnd() < 0.6 ? 1 : 0) + (rnd() < 0.2 * set.density ? 1 : 0);
      for (let j = 0; j < nS; j++) {
        const q = near[Math.floor(rnd() * near.length)], [x, y] = P(q, 0);
        const sk = sprout(rnd, { x, y, heading: startHeading(rnd, q.nx, q.ny) + set.lean, size: em, stemScale: set.stemScale * between(rnd, 0.55, 0.85), form: FORMS.blade, maxSegs: 2 });
        const g = grown(sk.segs, { id, rnd, t0: t0 + 0.25 + j * 0.1, root, w0: em * 0.011, w1: em * 0.007 });
        if (g && !g.cut) endBloom(g, ps.bloom, { id, rnd, root, R: em * (ps.bloom === 'spore' ? 0.032 : 0.07), grains: 1 });
      }
      grid.disc(...P(c, INSET + 0.03), span * em * 0.7, id);
    });
  }
  // A chain of segments as a stem element: points every 0.03 em, a curl appended for a vine's end,
  // cut where it would leave the safe area or touch another text block. Null when what is left is
  // too short to read. Stems may cross one another; blossoms and leaves claim their discs and keep
  // off each other.
  function grown(segs, { id, rnd, t0, dur = null, root, w0, w1, curl = false, curlR, parent = null, at = 0, profile = null }) {
    const step = em * 0.03;
    let { pts, joints } = chainPts(segs, step);
    if (curl) {
      const last = segs.at(-1);
      pts = pts.concat(spiral(rnd, pts.at(-1), last.a0 + last.turn, Math.sign(last.turn) || 1, curlR, step).pts.slice(1));
    }
    let n = pts.findIndex(([X, Y]) => grid.at(X, Y) === -1);
    const cut = n >= 0;
    if (cut) pts = pts.slice(0, n);
    if (pts.length < 2 || lengthOf(pts) < em * 0.18) return null;
    const L = lengthOf(pts) / em;
    const d = dur ?? Math.max(0.4, L * 0.42);
    const e = stem(pts, { w0, w1, t0, dur: d, root, id });
    if (profile) e.profile = profile;
    Object.assign(e, { segs: segs.filter((s, k) => joints[k] < pts.length - 1), joints });
    if (curl && !cut) e.curl = true;
    if (cut) e.cut = true;
    if (parent) Object.assign(e, { parent, on: parent, at });
    return { e, joints, cut, tEnd: t0 + d };
  }

  // -- circuits: a bus of one to three parallel traces on 45-degree headings
  function circuit(l, a, k) {
    const id = ++plantId, rnd = rndOf(`plant|${l.index}|${k}`);
    const x = l.x + a.x * em, y = l.base + a.y * em;
    const down = isDown(a);
    const lower = l.line > 0 && !down;   // under a line above: short runs only
    if (lower && rnd() < 0.5) return;
    const h0 = snap(headingOf(a.nx, a.ny - (down ? -0.3 : 0.9)) + set.lean * 0.5, Math.PI / 4);
    const stepPx = em * 0.08, k1 = (n) => Math.max(1, Math.round((lower ? n / 2 : n) * 1.5 * set.stemScale));
    const legs = [[h0, k1(2 + Math.floor(rnd() * 3))]];
    const turn = (rnd() < 0.5 ? -1 : 1) * Math.PI / 4;
    legs.push([h0 + turn, k1(1 + Math.floor(rnd() * 4))]);
    if (!lower && rnd() < 0.6) legs.push([h0 + (rnd() < 0.5 ? 0 : 2 * turn), k1(1 + Math.floor(rnd() * 3))]);
    const route = [[x, y]];
    let cx = x, cy = y;
    outer: for (const [h, steps] of legs) {
      for (let i = 0; i < steps; i++) {
        const nx = cx + Math.cos(h) * stepPx, ny = cy + Math.sin(h) * stepPx;
        const v = grid.at(nx, ny);
        if (v === -1 || (v !== 0 && v !== id && route.length > 2)) break outer;
        route.push([nx, ny]); cx = nx; cy = ny;
      }
    }
    if (lengthOf(route) < em * 0.25) return;
    const lanes = 1 + Math.floor(rnd() * Math.min(3, 1 + set.density * 1.4));
    const gap = em * 0.055, t0 = 0.12 + spread * (l.index / Math.max(1, nL - 1)) + 0.1 * k + rnd() * 0.05;
    for (let j = 0; j < lanes; j++) {
      const off = (j - (lanes - 1) / 2) * gap;
      let pts = offset(route, off);
      const drop = j === 0 ? 0 : Math.min(pts.length - 2, Math.floor(rnd() * 2) + j);   // staggered ends
      if (drop > 0) pts = pts.slice(0, pts.length - drop);
      pts = densify(pts, em * 0.03);
      if (pts.some(([X, Y]) => grid.at(X, Y) === -1)) continue;
      const L = lengthOf(pts) / em, dur = Math.max(0.3, L * 0.5);
      const t = t0 + j * 0.06;
      claim(pts, id);
      stem(pts, { w0: em * 0.02, w1: em * 0.02, t0: t, dur, root: y, id, ease: 'inOut3', shape: 'trace' });
      const end = pts.at(-1), te = tangentAt(pts, 1);
      const via = rnd() < 0.55;
      const r = em * (via ? 0.042 : 0.05);
      if (grid.open(end[0] + Math.cos(te) * r, end[1] + Math.sin(te) * r, r * 1.2) && inkAt(end[0], end[1]) * em > r) els.push({ type: via ? 'via' : 'pad', x: end[0] + Math.cos(te) * r * (via ? 0.8 : 0.9), y: end[1] + Math.sin(te) * r * (via ? 0.8 : 0.9), r, ang: te, t0: reach(t, dur, 0.97, 'inOut3'), dur: 0.3, root: y, id });
    }
  }
  // A polyline moved sideways by `d` px, mitred at its corners so parallel lanes stay parallel.
  function offset(pts, d) {
    if (!d) return pts.map((p) => [...p]);
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const h1 = Math.atan2(p[1] - a[1], p[0] - a[0]), h2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
      const hh = i === 0 ? h2 : i === pts.length - 1 ? h1 : Math.atan2(Math.sin(h1) + Math.sin(h2), Math.cos(h1) + Math.cos(h2));
      const half = i === 0 || i === pts.length - 1 ? 0 : (h2 - h1) / 2;
      const m = d / Math.max(0.5, Math.cos(half));
      return [p[0] - Math.sin(hh) * m, p[1] + Math.cos(hh) * m];
    });
  }
  function densify(pts, step) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
      for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * (k / n), ay + (by - ay) * (k / n)]);
    }
    return out;
  }

  // -- crystals: a straight stem on 30-degree headings, a branch at 60 degrees, faceted shards
  function crystal(l, a, k) {
    const id = ++plantId, rnd = rndOf(`plant|${l.index}|${k}`);
    const x = l.x + a.x * em, y = l.base + a.y * em;
    const down = isDown(a);
    if (down && rnd() < 0.6) return;
    const lower = l.line > 0 && !down;
    if (lower && rnd() < 0.5) return;
    const h0 = snap(headingOf(a.nx, a.ny - (down ? -0.2 : 1.1)) + set.lean * 0.5, Math.PI / 6);
    const len = em * set.stemScale * (down ? 0.18 + rnd() * 0.12 : lower ? 0.16 + rnd() * 0.08 : 1.4 * (0.28 + rnd() * 0.34));
    const pts = densify([[x, y], [x + Math.cos(h0) * len, y + Math.sin(h0) * len]], em * 0.03);
    let ok = [pts[0]];
    for (const p of pts.slice(1)) { const v = grid.at(p[0], p[1]); if (v === -1 || (v !== 0 && v !== id && ok.length > 4)) break; ok.push(p); }
    if (lengthOf(ok) < em * 0.15) return;
    claim(ok, id);
    const t0 = 0.12 + spread * (l.index / Math.max(1, nL - 1)) + 0.1 * k + rnd() * 0.05;
    const L = lengthOf(ok) / em, dur = Math.max(0.28, L * 0.55);
    stem(ok, { w0: em * 0.016, w1: em * 0.016, t0, dur, root: y, id, ease: 'in2', shape: 'line' });
    const tips = [[ok.at(-1), h0, t0 + dur * 0.92, 1]];
    if (!down && !lower && rnd() < 0.8 * set.density) {
      const u = 0.45 + rnd() * 0.3, [bx, by] = pointAt(ok, u), hb = h0 + (rnd() < 0.5 ? -1 : 1) * Math.PI / 3, lb = lengthOf(ok) * (0.45 + rnd() * 0.2);
      const bp = densify([[bx, by], [bx + Math.cos(hb) * lb, by + Math.sin(hb) * lb]], em * 0.03);
      if (bp.every(([X, Y]) => { const v = grid.at(X, Y); return v === 0 || v === id; })) {
        claim(bp, id);
        const tb = reach(t0, dur, u, 'in2'), db = Math.max(0.22, (lb / em) * 0.55);
        stem(bp, { w0: em * 0.013, w1: em * 0.013, t0: tb, dur: db, root: y, id, ease: 'in2', shape: 'line' });
        tips.push([bp.at(-1), hb, tb + db * 0.92, 0.7]);
      }
    }
    for (const [[tx, ty], h, ts, sc] of tips) {
      const n = 1 + Math.floor(rnd() * 3);
      for (let j = 0; j < n; j++) {
        const ang = h + (j === 0 ? 0 : (j === 1 ? -1 : 1) * (0.42 + rnd() * 0.18));
        const sl = em * 1.35 * Math.sqrt(set.stemScale) * (0.2 + rnd() * 0.16) * sc * (j ? 0.62 : 1), sw = sl * (0.34 + rnd() * 0.06);
        const cx = tx + Math.cos(ang) * sl * 0.5, cy = ty + Math.sin(ang) * sl * 0.5;
        if (!okBlob(cx, cy, sl * 0.45, id, sl * 0.58)) continue;
        grid.disc(cx, cy, sl * 0.4, id);
        els.push({ type: 'shard', x: tx, y: ty, ang, len: sl, wid: sw, t0: ts + j * 0.07, dur: 0.42, root: y, id });
      }
    }
  }

  // -- bridges between neighbours of one word, on one line
  function bridges() {
    for (let i = 0; i + 1 < letters.length; i++) {
      const A = letters[i], B = letters[i + 1];
      if (A.word !== B.word || A.line !== B.line) continue;
      const rnd = rndOf(`bridge|${i}`);
      if (rnd() > Math.min(0.9, 0.5 * set.density)) continue;
      const br = bridge(A.cell, B.cell, (B.x - A.x) / em, { seed: set.seed, index: i });
      if (!br) continue;
      if (set.kind === 'circuits' && (B.x + br.to.x * em) - (A.x + br.from.x * em) < em * 0.3) continue;   // too close for a link
      const id = ++plantId;
      const p0 = [A.x + br.from.x * em, A.base + br.from.y * em], p3 = [B.x + br.to.x * em, B.base + br.to.y * em];
      const bulge = (rnd() < 0.6 ? -1 : 1) * em * (0.22 + rnd() * 0.3);
      let pts;
      if (set.kind === 'circuits') {
        // a link over the top of the pair: up, a 45-degree shoulder, across, a shoulder, down
        const midY = Math.min(p0[1], p3[1]) - Math.abs(bulge), c = Math.min(Math.abs(p3[0] - p0[0]) * 0.3, em * 0.08);
        pts = densify([p0, [p0[0], midY + c], [p0[0] + c, midY], [p3[0] - c, midY], [p3[0], midY + c], p3].filter((p, j, all) => j === 0 || Math.hypot(p[0] - all[j - 1][0], p[1] - all[j - 1][1]) > 0.5), em * 0.03);
      } else {
        const c1 = [p0[0] + br.from.nx * em * 0.25, p0[1] + bulge], c2 = [p3[0] + br.to.nx * em * 0.25, p3[1] + bulge];
        pts = [];
        for (let j = 0; j <= 28; j++) { const t = j / 28, m = 1 - t; pts.push([m * m * m * p0[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * p3[0], m * m * m * p0[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * p3[1]]); }
      }
      let lands = true;
      if (set.kind !== 'circuits' && rnd() < 0.4) { pts = pts.slice(0, Math.max(6, Math.round(pts.length * (0.7 + rnd() * 0.18)))); lands = false; pts = pts.concat(spiral(rnd, pts.at(-1), tangentAt(pts, 1), bulge < 0 ? 1 : -1, em * 0.05, em * 0.03).pts.slice(1)); }
      if (pts.some(([X, Y]) => grid.at(X, Y) === -1)) continue;
      claim(pts, id);
      const n0 = els.length;
      const t0 = 0.22 + spread * (i / Math.max(1, nL - 1)) + rnd() * 0.08;
      const L = lengthOf(pts) / em;
      stem(pts, set.kind === 'circuits'
        ? { w0: em * 0.018, w1: em * 0.018, t0, dur: Math.max(0.3, L * 0.5), root: Math.max(p0[1], p3[1]), id, ease: 'inOut3', shape: 'trace', bridge: true, lands: true }
        : { w0: em * 0.018, w1: em * 0.007, t0, dur: Math.max(0.34, L * 0.6), root: Math.max(p0[1], p3[1]), id, bridge: true, lands });
      rootOn(n0, i + 1);
    }
  }

  // cubic segments through waypoints, tangents from their neighbours; the first leaves along
  // `startAng` (straight up by default), the last arrives along `endAng` when given
  const through = (way, endAng, startAng = -Math.PI / 2) => {
    const tan = way.map((p, i) => {
      if (i === 0) { const d = Math.hypot(way[1][0] - p[0], way[1][1] - p[1]); return [Math.cos(startAng) * d, Math.sin(startAng) * d]; }
      if (i === way.length - 1 && endAng != null) { const d = Math.hypot(p[0] - way[i - 1][0], p[1] - way[i - 1][1]); return [Math.cos(endAng) * d, Math.sin(endAng) * d]; }
      const a = way[Math.max(0, i - 1)], b = way[Math.min(way.length - 1, i + 1)];
      return [(b[0] - a[0]) / 2, (b[1] - a[1]) / 2];
    });
    const segs = [];
    for (let i = 0; i + 1 < way.length; i++) {
      const p0 = way[i], p3 = way[i + 1];
      segs.push({ p0, c1: [p0[0] + tan[i][0] / 3, p0[1] + tan[i][1] / 3], c2: [p3[0] - tan[i + 1][0] / 3, p3[1] - tan[i + 1][1] / 3], p3, len: Math.hypot(p3[0] - p0[0], p3[1] - p0[1]), a0: startAng, turn: 0 });
    }
    return segs;
  };

  // -- botanical on the letters: each anchor grows a cluster in the bed's look. A short curving
  // stem leaves the letter (up from its top, down from its feet) and ends in one large bloom clear of
  // the line, a camellia, peony or lily (a smaller one below the line); broad leaves fan from the stem;
  // a lily carries a slender bud beside it; a sweet pea grows a spray of flowers up its stem and ends
  // in a tendril; a bud stands alone. A bloom that does not fit opens smaller, then as a bud.
  const CLUSTER = { camellia: 1.15, peony: 1, lily: 1.05, sweetpea: 0.5, bud: 0.3 };
  function cluster(l, a, k, ps) {
    const id = ++plantId, rnd = rndOf(`cluster|${l.index}|${k}`);
    const form = ps.bloom === 'bouquet' ? BOUQUET[Math.floor(rnd() * BOUQUET.length)] : ps.bloom === 'none' ? 'bud' : ps.bloom;
    const down = isDown(a), dir = down ? 1 : -1, x = l.x + a.x * em, y = l.base + a.y * em;
    const reachE = em * (down ? between(rnd, 0.9, 1.3) : between(rnd, 1.5, 2.0) + 0.35 * Math.min(2, k)) * set.stemScale;
    const lean = between(rnd, -0.4, 0.4) + set.lean;
    const head = [x + Math.sin(lean) * reachE, y + dir * Math.cos(lean) * reachE];
    const mid = [(x + head[0]) / 2 + between(rnd, -0.14, 0.14) * em, (y + head[1]) / 2];
    const t0 = 0.12 + spread * (l.index / Math.max(1, nL - 1)) + 0.1 * k + rnd() * 0.05;
    const g = grown(through([[x, y], mid, head], null, dir * Math.PI / 2 + lean * 0.5), { id, rnd, t0, root: y, w0: em * 0.04, w1: em * 0.018, curl: form === 'sweetpea', curlR: em * 0.1 });
    if (!g) return;
    const e = g.e;
    e.cls = 'mm-garden__b-stem';
    const n = e.pts.length - 1, tipI = form === 'sweetpea' ? Math.min(n, e.joints?.at(-1) ?? n) : n;
    const at = (u) => { const i = clamp(Math.round(u * tipI), 1, tipI); return { p: e.pts[i], tan: tangentAt(e.pts.slice(0, tipI + 1), i / tipI), t: reach(e.t0, e.dur, i / n), i }; };
    // a bud is a bud element (the budget's own type), drawn as the botanical bud
    const flower = (f, p, r, ang, t, extra = {}) => { els.push({ type: f === 'bud' ? 'bud' : 'bloom', form: f, botany: true, x: p[0], y: p[1], r, ang, tilt: f === 'camellia' ? between(rnd, 0.86, 0.95) : f === 'peony' ? between(rnd, 0.62, 0.8) : between(rnd, 0.5, 0.85), seed: Math.floor(rnd() * 1e6), t0: t, dur: f === 'camellia' ? 1.1 : 0.85, root: y, id, n: 5, twist: 0, notch: false, ...extra }); };
    // leaves first, so the bloom lies over them
    const nLeaves = 3 + Math.floor(rnd() * 3);
    for (let j = 0; j < nLeaves; j++) {
      const q = at(between(rnd, 0.3, 0.95)), side = j % 2 ? 1 : -1, ang = q.tan + side * between(rnd, 0.6, 1.3);
      const len = em * between(rnd, 0.6, 0.9) * (down ? 0.75 : 1), cx = q.p[0] + Math.cos(ang) * len * 0.5, cy = q.p[1] + Math.sin(ang) * len * 0.5;
      if (!okBlob(cx, cy, len * 0.28, id, len * 0.45)) continue;
      grid.disc(cx, cy, len * 0.28, id);
      const tone = form === 'camellia' || rnd() < 0.25 ? 'deep' : 'sage';
      els.push({ type: 'leaf', shape: 'broad', x: q.p[0], y: q.p[1], ang, len, wid: len * between(rnd, 0.42, 0.52), tone, light: tone === 'sage' && rnd() < 0.2, skew: between(rnd, 0.82, 1), bend: between(rnd, -1.2, 1.4) * side, t0: q.t, dur: 0.6, root: y, id });
      hang(e, q.i);
    }
    const tip = e.pts[tipI], te = tangentAt(e.pts.slice(0, tipI + 1), 1), tEnd = reach(e.t0, e.dur, tipI / n);
    if (form === 'sweetpea') {
      // a spray: flowers up the stem's top half, alternating sides, the last at the tip
      let side = rnd() < 0.5 ? -1 : 1;
      for (const u of [0.55, 0.78, 1]) {
        const q = at(u), r = em * between(rnd, 0.3, 0.36) * (down ? 0.8 : 1), p = [q.p[0] + Math.cos(q.tan + side * 1.2) * r * 0.6, q.p[1] + Math.sin(q.tan + side * 1.2) * r * 0.6];
        if (!okBlob(p[0], p[1], r * 0.6, id, r)) continue;
        grid.disc(p[0], p[1], r * 0.6, id);
        flower('sweetpea', p, r, side > 0 ? -0.35 : Math.PI + 0.35, q.t + 0.15);
        hang(e, q.i);
        side = -side;
      }
      return;
    }
    if (form === 'lily') {
      const q = at(0.6), side = rnd() < 0.5 ? -1 : 1, ba = q.tan + side * 0.55, r = em * 0.12;
      const p = [q.p[0] + Math.cos(ba) * em * 0.3, q.p[1] + Math.sin(ba) * em * 0.3];
      if (okBlob(p[0], p[1], r * 1.2, id, r * 2.6)) { grid.disc(p[0], p[1], r * 1.2, id); flower('bud', p, r, ba, q.t + 0.2, { budPaint: 'lilybud' }); hang(e, q.i); }
    }
    // blooms may overlap their neighbours' rims, as in a bed; their cores stay clear
    const R0 = em * between(rnd, 0.82, 1.02) * CLUSTER[form] * (down ? 0.7 : 1);
    const r = form === 'bud' ? null : [1, 0.82, 0.66].map((f) => R0 * f).find((v) => okBlob(tip[0], tip[1], v * 0.45, id, v * 0.9));
    if (r) {
      grid.disc(tip[0], tip[1], r * 0.45, id);
      flower(form, tip, r, form === 'lily' ? te + between(rnd, -0.5, 0.5) : -Math.PI / 2 + between(rnd, -0.2, 0.2), tEnd);
    } else {
      const rb = em * between(rnd, 0.17, 0.22);
      if (!okBlob(tip[0], tip[1], rb * 0.8, id)) return;
      grid.disc(tip[0], tip[1], rb * 0.8, id);
      flower('bud', tip, rb, te, tEnd, { budPaint: rnd() < 0.6 ? 'peony' : 'camellia' });
    }
    hang(e, tipI);
  }

  // -- the botanical bed: the plants bedLayout places, grown from below the frame. Each stem rises
  // from its root through one or two bowed waypoints (a climber through three) to its bloom, on the
  // garden's ease-out; leaves open as the reveal passes them; the bloom opens once the stem is
  // there, with side buds on short pedicels; a sweet pea climber carries flowers on pedicels up its
  // top half and ends in tendrils. Loose petals leave a bloom of their colour after it opens. All of
  // it lies in the back layer, drawn row by row, back to front.
  function bedGrow() {
    const lastBase = Math.max(...letters.map((l) => l.base));
    const bed = bedLayout({ frame, box: { W, H }, base: lastBase, em, blocks, seed: set.seed, petals: set.petals, density: set.density });
    const U = bed.U, step = U * 0.006;
    model.U = U; model.bed = true;
    const main = [];   // each plant's own bloom, where loose petals leave from
    bed.plants.forEach((p, pi) => {
      const id = ++plantId, rnd = rndOf(`bed|${pi}`), depth = p.depth, root = p.root[1], climber = p.type === 'sweetpea';
      const tag = (e) => Object.assign(e, { bed: true, depth });
      const r0 = U * 0.016, top = climber ? [p.tip[0], p.tip[1] + r0] : p.head;
      const way = [p.root], mids = climber ? 3 : Math.hypot(top[0] - p.root[0], top[1] - p.root[1]) > 0.45 * U ? 2 : 1;
      for (let k = 1; k <= mids; k++) {
        const f = k / (mids + 1), wob = climber ? (k % 2 ? 1 : -1) * U * between(rnd, 0.03, 0.06) : U * between(rnd, -0.05, 0.05);
        way.push([p.root[0] + (top[0] - p.root[0]) * f + wob, p.root[1] + (top[1] - p.root[1]) * f]);
      }
      way.push(top);
      const { pts } = chainPts(through(way, climber ? null : p.ang), step);
      const dur = 0.5 + 0.9 * (lengthOf(pts) / U), tEnd = p.t0 + dur;
      const w0 = U * (p.type === 'camellia' ? 0.008 : climber ? 0.0042 : 0.0055), w1 = U * (climber ? 0.0025 : 0.0032);
      const e = tag(stem(pts, { w0, w1, t0: p.t0, dur, root, id }));
      e.cls = 'mm-garden__b-stem';
      const n = pts.length - 1;
      const on = (u) => { const i = clamp(Math.round(u * n), 1, n); return { p: pts[i], tan: tangentAt(pts, i / n), t: reach(p.t0, dur, i / n), i }; };
      for (const lf of bed.leaves.filter((q) => q.plant === pi)) {
        const q = on(lf.u), la = q.tan + lf.side * lf.turn, ox = Math.cos(la) * (lf.out ?? 0), oy = Math.sin(la) * (lf.out ?? 0);
        // a leaf that points up stops short of the space under the text
        const up = -Math.sin(la), room = q.p[1] + oy - bed.ceil, len = up > 0.15 ? Math.min(lf.len, Math.max(lf.len * 0.5, room / up)) : lf.len;
        els.push(tag({ type: 'leaf', shape: 'broad', x: q.p[0] + ox, y: q.p[1] + oy, ang: la, len, wid: lf.wid * (len / lf.len), tone: lf.tone, light: lf.light, skew: lf.skew, bend: lf.bend * lf.side, t0: q.t, dur: 0.7, root, id, on: e, at: q.i }));
      }
      const bloom = (form, x, y, r, ang, t0, extra = {}) => els.push(tag({ type: 'bloom', form, x, y, r, ang, tilt: p.tilt, botany: true, seed: Math.floor(rnd() * 1e6), t0, dur: form === 'camellia' ? 1.5 : 1.1, root, id, n: 5, twist: 0, notch: false, ...extra }));
      // a short pedicel from u along the stem, out to one side and up, ending in a bud of `len` px;
      // none whose bud would reach over the text
      const sideBud = (u, len, paint, side) => {
        const q = on(u), pa = q.tan + side * between(rnd, 0.5, 0.9), pl = U * between(rnd, 0.04, 0.07);
        const end = [q.p[0] + Math.cos(pa) * pl, q.p[1] + Math.sin(pa) * pl];
        const ba = -Math.PI / 2 + side * between(rnd, 0.2, 0.5);
        if (end[1] - len < bed.ceil) return;
        const ped = tag(stem(densify([q.p, [(q.p[0] + end[0]) / 2, (q.p[1] + end[1]) / 2 - pl * 0.1], end], step), { w0: U * 0.004, w1: U * 0.003, t0: q.t, dur: 0.35, root, id }));
        ped.cls = 'mm-garden__b-stem';
        bloom('bud', end[0], end[1], paint === 'lilybud' ? len / 2.6 : len / 2, ba, q.t + 0.3, { budPaint: paint });
      };
      if (p.type === 'camellia' || p.type === 'peony' || p.type === 'lily') {
        bloom(p.type, p.head[0], p.head[1], p.r, p.ang, tEnd - 0.05);
        main[pi] = els.at(-1);
        const side = rnd() < 0.5 ? -1 : 1;
        if (p.type === 'camellia' && rnd() < 0.7) sideBud(0.8, U * 0.06, 'camellia', side);
        if (p.type === 'peony' && rnd() < 0.25) sideBud(0.78, U * 0.05, 'peony', side);
        if (p.type === 'lily') { const nb = 1 + Math.floor(rnd() * 2); for (let k = 0; k < nb; k++) sideBud(0.72 + 0.1 * k, U * between(rnd, 0.05, 0.07), 'lilybud', k % 2 ? -side : side); }
      } else if (p.type === 'bud') {
        bloom('bud', p.head[0], p.head[1], p.r, p.ang, tEnd - 0.05, { budPaint: rnd() < 0.6 ? 'peony' : 'camellia' });
      } else if (p.type === 'lilybud') {
        bloom('bud', p.head[0], p.head[1], p.r / 2.6, p.ang, tEnd - 0.05, { budPaint: 'lilybud' });
        if (rnd() < 0.6) sideBud(0.75, p.r * 0.75, 'lilybud', rnd() < 0.5 ? -1 : 1);
      } else if (climber) {
        // flowers on pedicels up the top half, alternating sides, smaller toward the top
        const nf = 5 + Math.floor(rnd() * 3);
        let side = rnd() < 0.5 ? -1 : 1;
        for (let k = 0; k < nf; k++) {
          const q = on(0.32 + (0.58 * k) / Math.max(1, nf - 1)), pl = U * between(rnd, 0.022, 0.038), pa = q.tan + side * between(rnd, 0.7, 1.1);
          const end = [q.p[0] + Math.cos(pa) * pl, q.p[1] + Math.sin(pa) * pl], fr = p.r * (1 - 0.08 * k);
          if (end[1] - fr * 1.2 < bed.ceil) break;
          const ped = tag(stem(densify([q.p, end], step), { w0: U * 0.0028, w1: U * 0.0024, t0: q.t, dur: 0.3, root, id, shape: 'line' }));
          ped.cls = 'mm-garden__b-tendril';
          bloom('sweetpea', end[0], end[1], fr, side > 0 ? -0.35 : Math.PI + 0.35, q.t + 0.25);
          if (!main[pi]) main[pi] = els.at(-1);
          side = -side;
        }
        // tendrils: one at the tip, the rest from the upper stem
        const tendril = (start, heading, sd, r, t0) => {
          const tp = spiral(rnd, start, heading, sd, r, U * 0.004).pts;
          const te = tag(stem(tp, { w0: U * 0.0024, w1: U * 0.0024, t0, dur: 0.6, root, id, shape: 'line' }));
          te.cls = 'mm-garden__b-tendril';
        };
        tendril(top, tangentAt(pts, 1), rnd() < 0.5 ? -1 : 1, r0, tEnd - 0.1);
        for (let k = 1; k < p.tendrils; k++) {
          const q = on(between(rnd, 0.55, 0.9)), sd = rnd() < 0.5 ? -1 : 1, h = q.tan + sd * between(rnd, 0.6, 1.0), lead = U * between(rnd, 0.02, 0.035);
          const st = [q.p[0] + Math.cos(h) * lead, q.p[1] + Math.sin(h) * lead];
          if (st[1] - 2 * r0 < bed.ceil) continue;
          const te = tag(stem(densify([q.p, st], step), { w0: U * 0.0024, w1: U * 0.0024, t0: q.t, dur: 0.25, root, id, shape: 'line' }));
          te.cls = 'mm-garden__b-tendril';
          tendril(st, h, sd, r0 * between(rnd, 0.7, 1.1), q.t + 0.25);
        }
      }
    });
    for (const q of bed.petals) {
      const b = main[q.src] ?? main[0];
      els.push({ type: 'petal', form: q.form, src: [b.x, b.y], home: q.home, x: q.home[0], y: q.home[1], r: q.r, lift: q.lift, a0: q.a0, a1: q.a0 + q.turn, spin: q.spin, phase: q.phase, amp: q.amp, seed: q.seed, t0: b.t0 + b.dur * 0.55 + q.lag, dur: q.dur, root: frame.y1, id: ++plantId, bed: true, depth: 99 });
    }
  }

  // plants per letter, in reading order. Anchor-borne stems (curve, branch) grow one plant per
  // anchor; a ribbon, root or stemless set grows once per letter, wherever its stem type roots. With
  // several sets (mix) each anchor draws its set from a stream of the seed and the letter.
  const sets = partSets(set);
  model.sets = sets;
  // every part grown from here on roots on letter i (text: type starts it once that letter is there)
  const rootOn = (n0, i) => { for (const x of els.slice(n0)) x.letter = i; };
  const grow1 = (l, a, k, ps, list, once) => {
    if (ps.kind === 'circuits') return circuit(l, a, k);
    if (ps.kind === 'crystals') return crystal(l, a, k);
    if (ps.kind === 'botanical') return cluster(l, a, k, ps);
    if (ps.stem === 'curve' || ps.stem === 'branch') {
      const n0 = els.length;
      plant(l, a, k, ps);
      if (ps.kind === 'botanical') for (const x of els.slice(n0)) if (x.type === 'bud') Object.assign(x, { botany: true, budPaint: 'peony', seed: x.id * 7919 });
      return;
    }
    if (ps.stem === 'ribbon' && ps.kind === 'seaweed') return kelp(l, a, k, ps);
    if (once.has(ps.kind)) return;
    once.add(ps.kind);
    if (ps.stem === 'ribbon') ground(l, ps, k);
    else if (ps.stem === 'root') rooted(l, ps, list, k);
    else moss(l, ps, k);
  };
  const SECOND = { vines: 0.4, flowers: 0.3, leaves: 0.4, ferns: 0.3, branches: 0.45, coral: 0.55, seaweed: 0.5, mix: 0.4 };
  if (set.kind === 'botanical' && set.bed && frame) bedGrow();
  else for (const l of letters) {
    const list = anchors(l.cell, { seed: set.seed, density: set.density, index: l.index, char: l.ch });
    model.letters[letters.indexOf(l)].anchors = list;
    // upward plants per letter: one, a second on more letters as density rises, a third on some above 1
    const more = random(`garden|${set.seed}|second|${l.index}`);
    const second = more() < (SECOND[set.kind] ?? 0.6) * set.density, third = more() < (set.density - 1) * 0.5;
    const cap = second ? (third ? 3 : 2) : 1;
    const pick = sets.length > 1 ? random(`garden|${set.seed}|mix|${l.index}`) : null, once = new Set();
    let up = 0, down = 0;
    const n0 = els.length;
    list.forEach((a, k) => {
      if (isDown(a)) { if (down >= 1) return; down++; } else { if (up >= cap) return; up++; }
      grow1(l, a, k, pick ? sets[Math.floor(pick() * sets.length)] : sets[0], list, once);
    });
    rootOn(n0, letters.indexOf(l));
  }
  if (set.bridges && (set.kind === 'vines' || set.kind === 'circuits')) bridges();
  model.botany = model.elements.some((e) => e.botany || e.shape === 'broad' || e.type === 'petal');

  budget(model, em, ['vines', 'flowers', 'circuits', 'crystals'].includes(set.kind) ? BOX_CAP : BOX_CAP_DENSE);
  // a slot left with nothing grows one plant on its most upward anchor of the first line
  const grew = () => model.elements.some((e) => e.pts || e.type === 'dot');
  if (!grew()) {
    const best = letters.flatMap((l, i) => model.letters[i].anchors.filter((a) => !isDown(a)).map((a, k) => ({ l, a, k, list: model.letters[i].anchors }))).sort((p, q) => p.l.line - q.l.line || p.a.ny - q.a.ny);
    for (const { l, a, list } of best) {
      const n0 = model.elements.length;
      grow1(l, a, 9, sets[0], list, new Set());
      for (const x of model.elements.slice(n0)) x.letter = letters.indexOf(l);
      if (grew()) break;
    }
    model.boxShare = boxShareOf(model);
  }
  weave(model, set, em);
  // growth windows: seconds of the garden's own clock, mapped onto [0.06, 1] of the entrance; typed,
  // each plant starts once its letter is whole
  if (set.text === 'type' && !model.bed) {
    const all = typeReveal(Math.max(1, ...letters.map((l) => l.ci + 1)), set.typeShare);
    model.reveal = letters.map((l) => all[l.ci]);
    typedWindows(model.elements, (i) => model.reveal[i].done);
  } else typedWindows(model.elements, null);
  // a bed is drawn row by row, back to front; within a row (and in every other garden) by part
  model.elements.sort((p, q) => (p.depth ?? 0) - (q.depth ?? 0) || z(p) - z(q));
  remember(key, model);
  return model;
}

const Z = { stem: 0, trace: 0, line: 0, leaf: 1, dot: 1, tuft: 1, bud: 2, shard: 2, via: 2, pad: 2, bloom: 3 };

/**
 * When each of n characters of a typed line shows: [{ at, done }] in entrance progress. The typing
 * takes the first `share` of the entrance, one even slot per character in reading order (a space
 * takes its slot too); a character waits for most of its slot, then wipes in over its last 40 %, so
 * it is whole at the slot's end and the last one exactly at `share`.
 */
export function typeReveal(n, share) {
  const slot = share / Math.max(1, n);
  return Array.from({ length: n }, (_, j) => ({ at: (j + 0.6) * slot, done: (j + 1) * slot }));
}

/**
 * Growth windows [s, e] (entrance progress) for elements whose t0 and dur are seconds of the
 * garden's own clock. Without `doneOf`, or for an element on no letter, the whole clock maps onto
 * [0.06, 1]. With it, each plant (the elements of one id) on a letter starts when doneOf(letter) says
 * the letter is whole and keeps its own clock's order and proportions; every plant grows at one
 * speed, the fastest that lets the slowest to fit end exactly at p = 1.
 */
export function typedWindows(elements, doneOf) {
  let end = 0;
  for (const e of elements) if (!doneOf || e.letter == null) end = Math.max(end, e.t0 + e.dur);
  const k = end > 0 ? 0.94 / end : 1;
  const plants = new Map();
  for (const e of elements) {
    if (!doneOf || e.letter == null) { e.s = 0.06 + e.t0 * k; e.e = 0.06 + (e.t0 + e.dur) * k; continue; }
    const p = plants.get(e.id) ?? { from: Infinity, to: 0, at: 0, els: [] };
    p.from = Math.min(p.from, e.t0); p.to = Math.max(p.to, e.t0 + e.dur); p.at = Math.max(p.at, doneOf(e.letter)); p.els.push(e);
    plants.set(e.id, p);
  }
  let speed = Infinity;
  for (const p of plants.values()) speed = Math.min(speed, (1 - p.at) / Math.max(1e-9, p.to - p.from));
  for (const p of plants.values()) for (const e of p.els) { e.s = p.at + (e.t0 - p.from) * speed; e.e = e.s + e.dur * speed; }
}

/**
 * A stem's width at u along it (0 root, 1 tip), by its profile: a straight taper from w0 to w1 by
 * default; `club` widens toward a round tip (coral); `blade` swells from its root and narrows to a
 * point (grass); `kelp` swells fast, holds, rounds off at the tip and ruffles along its edges.
 */
export function widthOf(e, u) {
  if (e.profile === 'club') return e.w0 * (0.72 + 0.5 * u);
  if (e.profile === 'blade') return e.w0 * Math.min(1, 0.5 + u * 5) * Math.max(0, 1 - u ** 1.8) ** 0.7;
  if (e.profile === 'kelp') return e.w0 * Math.min(1, 0.35 + u * 4) * Math.sqrt(Math.max(0, 1 - u ** 5)) * (1 + 0.12 * Math.sin(u * (e.ruffle ?? 28)));
  return e.w0 + (e.w1 - e.w0) * u;
}
const z = (e) => Z[e.type] ?? 0;

const models = new Map();
function remember(key, model) {
  if (models.size > 48) models.delete(models.keys().next().value);
  models.set(key, model);
}

// The weave: each stem's points split into runs on and off the ink. The root's run sits under its
// letter; a later run over ink passes in front for a share of crossings, alternating, unless it
// is a bridge's landing. Then the front layer is capped: crossings are sent behind, last first,
// until the front covers at most FRONT_CAP of the glyph ink.
function weave(model, set, em) {
  const rnd = random(`garden|${set.seed}|weave`);
  const fronts = [];
  for (const e of model.elements) {
    if (!e.pts) continue;
    // a bed lies wholly under the type
    if (e.bed) { e.runs = [{ i0: 0, i1: e.pts.length - 1, over: false, layer: 'back' }]; continue; }
    const over = e.pts.map(([x, y]) => model.inkAt(x, y) < -0.004);
    const runs = [];
    for (let i = 0; i < over.length; i++) {
      if (!runs.length || runs.at(-1).over !== over[i]) runs.push({ i0: i, i1: i, over: over[i], layer: 'back' });
      else runs.at(-1).i1 = i;
    }
    let flip = rnd() < 0.6;
    runs.forEach((r, j) => {
      if (!r.over || j === 0 || set.layer === 'behind') return;
      if (j === runs.length - 1 && e.lands) return;
      if (flip) { r.layer = 'front'; fronts.push({ e, r }); }
      flip = !flip;
    });
    e.runs = runs;
  }
  const coverOf = (e, r) => {
    let a = 0;
    for (let i = Math.max(1, r.i0); i <= r.i1; i++) {
      const [x0, y0] = e.pts[i - 1], [x1, y1] = e.pts[i];
      const u = i / (e.pts.length - 1);
      a += (Math.hypot(x1 - x0, y1 - y0) / em) * (widthOf(e, u) / em);
    }
    return a;
  };
  let front = fronts.reduce((s, f) => s + coverOf(f.e, f.r), 0);
  const cap = FRONT_CAP * model.inkArea;
  while (front > cap && fronts.length) { const f = fronts.pop(); front -= coverOf(f.e, f.r); f.r.layer = 'back'; }
  model.front = model.inkArea ? front / model.inkArea : 0;
}

// The area of an element inside the slot's own box, in px².
function inBoxArea(model, e) {
  const { W, H } = model.box;
  const inBox = (x, y) => x >= 0 && y >= 0 && x <= W && y <= H;
  // the share of a disc inside the box, on a 5 x 5 grid
  const discIn = (x, y, r) => { let n = 0; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (inBox(x + (a / 2.5) * r, y + (b / 2.5) * r)) n++; return n / 25; };
  if (e.pts) { let a = 0; for (let i = 1; i < e.pts.length; i++) if (inBox(...e.pts[i])) a += Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]) * (e.profile ? widthOf(e, i / (e.pts.length - 1)) : (e.w0 + e.w1) / 2); return a; }
  // a shaped leaf (round, heart, leaflet) counts its fuller outline and the antialiased edge round it
  if (e.type === 'leaf' && e.shape) { const cx = e.x + Math.cos(e.ang) * e.len / 2, cy = e.y + Math.sin(e.ang) * e.len / 2; return discIn(cx, cy, e.len / 2) * 0.78 * (e.len + 2) * (e.wid + 2); }
  if (e.type === 'leaf' || e.type === 'shard') { const cx = e.x + Math.cos(e.ang) * e.len / 2, cy = e.y + Math.sin(e.ang) * e.len / 2; return discIn(cx, cy, e.len / 2) * 0.62 * e.len * e.wid; }
  if (e.type === 'tuft') { const cx = e.x + Math.cos(e.ang) * e.len / 2, cy = e.y + Math.sin(e.ang) * e.len / 2; return discIn(cx, cy, e.len / 2) * 0.62 * (e.len + 2) * (e.len * 0.2 + 2) * e.n; }
  if (e.type === 'dot') return discIn(e.x, e.y, e.r) * Math.PI * (e.r + 1) * (e.r + 1);
  return discIn(e.x, e.y, e.r) * Math.PI * e.r * e.r;
}
const boxShareOf = (model) => { const { W, H } = model.box; return W * H ? model.elements.reduce((s, e) => s + inBoxArea(model, e), 0) / (W * H) : 0; };

// The text box budget: ornament inside the slot's own box (where the gate reads the text's
// contrast against what lies under it) stays under BOX_CAP of the box (BOX_CAP_DENSE for the dense kinds). What gives first: leaves,
// shards and moss dots inside the box, largest first, then moss tufts; then stems are cut back from the tip, the one that
// sheds the most ornament inside the box first, to no less than 40 % of their points, taking
// what grows beyond the cut with them; then whole plants without a blossom, the one with the most
// ornament inside first; then blossoms inside become buds; then any plant.
function budget(model, em, share = BOX_CAP) {
  const { W, H } = model.box;
  const areaOf = (e) => inBoxArea(model, e);
  const cap = share * W * H;
  let total = model.elements.reduce((s, e) => s + areaOf(e), 0);
  const drop = (pred) => { const gone = model.elements.filter(pred); for (const e of gone) total -= areaOf(e); model.elements = model.elements.filter((e) => !pred(e)); };
  for (const e of model.elements.filter((x) => (x.type === 'leaf' || x.type === 'shard' || x.type === 'dot' || x.type === 'tuft') && areaOf(x) > 0).sort((p, q) => (p.type === 'tuft') - (q.type === 'tuft') || areaOf(q) - areaOf(p))) {
    if (total <= cap) break;
    drop((x) => x === e);
  }
  // what hangs on a stem from point `keep` on, with everything that hangs on that in turn
  const beyond = (stem, keep) => {
    const out = [];
    const walk = (s, k) => { for (const x of model.elements) if (x.on === s && x.at >= k) { out.push(x); if (x.pts) walk(x, 0); } };
    walk(stem, keep);
    return out;
  };
  const tipArea = (e, keep) => areaOf({ ...e, pts: e.pts.slice(Math.max(0, keep - 1)) }) + beyond(e, keep - 1).reduce((s, x) => s + areaOf(x), 0);
  const cuttable = model.elements.filter((e) => e.pts && !e.bridge && e.pts.length > 8).map((e) => [e, tipArea(e, Math.ceil(e.pts.length * 0.4))]).filter(([, v]) => v > 0).sort((p, q) => q[1] - p[1]);
  for (const [e] of cuttable) {
    for (const share of [0.85, 0.7, 0.55, 0.4]) {
      if (total <= cap) break;
      if (!model.elements.includes(e)) break;
      const n = e.pts.length, keep = Math.max(2, Math.ceil(n * share));
      if (keep >= n) continue;
      const gone = beyond(e, keep - 1);
      drop((x) => gone.includes(x));
      total -= areaOf(e);
      e.pts = e.pts.slice(0, keep); e.dur = Math.max(0.2, e.dur * keep / n); e.curl = false;
      if (e.joints) e.segs = e.segs.filter((sg, k) => e.joints[k] < keep - 1);
      total += areaOf(e);
    }
  }
  const plants = (withBloom) => {
    const per = new Map(), bloomy = new Set(model.elements.filter((e) => e.type === 'bloom').map((e) => e.id));
    for (const e of model.elements) per.set(e.id, (per.get(e.id) ?? 0) + areaOf(e));
    return [...per].filter(([id, v]) => v > 0 && (withBloom || !bloomy.has(id))).sort((p, q) => q[1] - p[1] || p[0] - q[0]).map(([id]) => id);
  };
  for (const id of plants(false)) { if (total <= cap) break; drop((e) => e.id === id); }
  for (const e of model.elements.filter((x) => x.type === 'bloom' && areaOf(x) > 0).sort((p, q) => areaOf(q) - areaOf(p))) {
    if (total <= cap) break;
    total -= areaOf(e); Object.assign(e, { type: 'bud', r: em * 0.055, dur: 0.5 }); total += areaOf(e);
  }
  for (const id of plants(true)) { if (total <= cap) break; drop((e) => e.id === id); }
  model.boxShare = W * H ? total / (W * H) : 0;
}

// ---------------------------------------------------------------------------------------------
// paint: the garden at growth g (0 nothing, 1 complete), into a back and a front layer

const easeOf = { out3, inOut3, in2 };

function svgOf(doc, el, cls) {
  const s = doc.createElementNS(NS, 'svg');
  s.setAttribute('class', `mm-garden ${cls}`);
  s.setAttribute('width', String(el.offsetWidth || 1));
  s.setAttribute('height', String(el.offsetHeight || 1));
  s.setAttribute('aria-hidden', 'true');
  return s;
}
function add(layer, cls, d, extra = {}) {
  const p = layer.ownerDocument.createElementNS(NS, 'path');
  p.setAttribute('class', cls);
  p.setAttribute('d', d);
  for (const [k, v] of Object.entries(extra)) p.setAttribute(k, String(v));
  layer.append(p);
  return p;
}
const lineD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${Math.round(p[0] * 10) / 10} ${Math.round(p[1] * 10) / 10}`).join('');

// The drawn part of a polyline: its first f of points, the last one interpolated.
function partOf(pts, f) {
  const n = pts.length - 1, at = clamp01(f) * n, i = Math.floor(at), t = at - i;
  const out = pts.slice(0, i + 1);
  if (i < n && t > 1e-6) out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
  return out;
}
// A tapered ribbon along points: width w(u) by the point's place on the whole stem.
function ribbon(pts, i0, widthAt) {
  if (pts.length < 2) return '';
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const h = Math.atan2(b[1] - a[1], b[0] - a[0]), w = widthAt(i0 + i) / 2;
    L.push([pts[i][0] + Math.sin(h) * w, pts[i][1] - Math.cos(h) * w]);
    R.push([pts[i][0] - Math.sin(h) * w, pts[i][1] + Math.cos(h) * w]);
  }
  return pathOf(L.concat(R.reverse()), true);
}

const at = (x, y, ang, s, ox, oy) => [x + (Math.cos(ang) * ox - Math.sin(ang) * oy) * s, y + (Math.sin(ang) * ox + Math.cos(ang) * oy) * s];

/**
 * A leaf's outline at scale s, from its stalk at (x, y) along `ang`: `lance` (the default) a narrow
 * blade with a bowed midrib; `leaflet` the same drawn slimmer, for fronds and tufts; `round` nearly
 * as wide as it is long; `heart` notched at its stalk, its two lobes reaching back past the notch,
 * widest low and narrowing to a point. Round and heart blades sit on a short stalk (the first 15 %
 * of the length).
 */
export function leafPts(e, s) {
  const shape = e.shape ?? 'lance';
  const pts = [];
  if (shape === 'lance' || shape === 'leaflet') {
    for (const side of [1, -1]) {
      for (let k = 0; k <= 8; k++) {
        const u = side > 0 ? k / 8 : 1 - k / 8;
        const half = 0.5 * e.wid * Math.sin(Math.PI * u ** 0.72) * (1 - 0.15 * u);
        const bow = 0.1 * e.len * Math.sin(Math.PI * u);
        pts.push(at(e.x, e.y, e.ang, s, u * e.len, bow * 0.4 + side * half));
      }
    }
    return pts;
  }
  if (shape === 'broad') {
    // wide and pointed, widest a little below its middle, its midrib bowed; `skew` narrows the
    // second side, `bend` scales the bow
    for (const side of [1, -1]) {
      for (let k = 0; k <= 16; k++) {
        const u = side > 0 ? k / 16 : 1 - k / 16;
        const half = 0.5 * e.wid * Math.sin(Math.PI * u ** 0.85) ** 0.8 * (1 - 0.08 * u) * (side > 0 ? 1 : (e.skew ?? 0.92));
        pts.push(at(e.x, e.y, e.ang, s, u * e.len, 0.06 * e.len * Math.sin(Math.PI * u) * (e.bend ?? 1) + side * half));
      }
    }
    return pts;
  }
  const stalk = 0.15 * e.len, blade = e.len - stalk;
  if (shape === 'round') {
    for (const side of [1, -1]) {
      for (let k = 0; k <= 12; k++) {
        const u = side > 0 ? k / 12 : 1 - k / 12;
        pts.push(at(e.x, e.y, e.ang, s, stalk + u * blade, side * 0.5 * e.wid * Math.sin(Math.PI * u) ** 0.55 * (1 - 0.12 * u)));
      }
    }
    return pts;
  }
  // heart: one side runs from the notch (q = 0) back round its lobe and on to the tip (q = 1); the
  // other side mirrors it. `LOBE` sets how far the lobe swings behind the notch, `BACK` shifts the
  // outline so the lobes start at the stalk's end.
  const LOBE = 0.9, BACK = 0.135;
  for (const side of [1, -1]) {
    for (let k = 0; k <= 20; k++) {
      const q = side > 0 ? k / 20 : 1 - k / 20;
      const u = (1 - Math.cos(Math.PI * q)) / 2 - LOBE * Math.sin(Math.PI * q) ** 3 * (1 - q);
      const half = 0.5 * e.wid * Math.sin(Math.PI * q) ** 0.9 * (1 - 0.25 * q);
      pts.push(at(e.x, e.y, e.ang, s, stalk + ((u + BACK) / (1 + BACK)) * blade, side * half));
    }
  }
  return pts;
}
function petalPts(cx, cy, ang, L, Wd, s, notch) {
  const pts = [];
  for (let k = 0; k < 22; k++) {
    const phi = (k / 22) * TAU;
    let u = 0.5 - 0.5 * Math.cos(phi);
    const v = Wd * Math.sin(phi) * Math.sqrt(u) * (1 - 0.18 * u * u);
    if (notch) u -= 0.07 * Math.exp(-(((phi - Math.PI) / 0.22) ** 2));
    pts.push(at(cx, cy, ang, s, u * L, v));
  }
  return pts;
}

/**
 * A fern frond's leaflets along a stem `length` em long, the longest `size` em: [{ u, side, len,
 * tilt }], u the place along the stem (0 root, 1 tip), side 1 or -1, len in em, tilt the angle off
 * the stem in radians (swept toward the tip). A pair every third of the longest leaflet, the second
 * of each pair half a step higher; they reach full length just above the root and shorten toward the
 * tip, so the frond tapers.
 */
export function frondLeaflets(rnd, length, size) {
  const out = [];
  if (!(length > 0) || !(size > 0)) return out;
  const gap = size * 0.32;
  for (let d = 0.06 * length; d < 0.94 * length; d += gap) {
    for (const side of [1, -1]) {
      const u = Math.min(0.96, d / length + (side < 0 ? (gap * 0.5) / length : 0));
      out.push({ u, side, len: size * Math.min(1, 0.55 + u * 6) * (1 - u) ** 0.85, tilt: between(rnd, 1.0, 1.2) });
    }
  }
  return out.sort((a, b) => a.u - b.u);
}

// ---------------------------------------------------------------------------------------------
// botanical: filled, shaded, veined blooms and leaves. Each part is a path in its own frame (its
// base at the origin, its tip along +x) placed by an SVG transform. It is painted twice: a flat
// role, then a gradient laid along the part's own box made of alphas of one other role at a time
// (the ink deepening the base where the part tucks under its neighbour, the canvas lighting its
// rim), so every point renders a blend of two roles; a fine ink line or a shade over it stays a
// blend of three roles at most.

/**
 * The botanical paints: name → { base: role, stops: [[offset, role, alpha]] }, the stops from a
 * part's base (0) to its tip (1). Where the overlay changes role, one side of the change is fully
 * transparent, so two overlay roles never mix.
 */
export const GRADIENTS = {
  // a bloom's petal shows only its outer lobe past the ring inside it: a crease of shade where it
  // leaves that ring, a light rim
  camellia: { base: 'accent', stops: [[0, 'ink', 0.44], [0.3, 'ink', 0.24], [0.6, 'ink', 0.08], [0.78, 'ink', 0], [0.78, 'canvas', 0], [1, 'canvas', 0.14]] },
  // a loose camellia petal shows whole: deeper at its base, light at its rim
  coral: { base: 'accent', stops: [[0, 'ink', 0.3], [0.5, 'ink', 0], [0.5, 'canvas', 0], [1, 'canvas', 0.26]] },
  sweetpea: { base: 'accent', stops: [[0, 'canvas', 0.12], [0.5, 'canvas', 0.24], [1, 'canvas', 0.46]] },
  // a sweet pea's wings: the pale surface, flushed with the accent toward the rim
  wing: { base: 'surface', stops: [[0, 'accent', 0], [0.6, 'accent', 0.06], [1, 'accent', 0.26]] },
  peony: { base: 'surface', stops: [[0, 'accentInk', 0.4], [0.45, 'accentInk', 0.16], [0.8, 'accentInk', 0.03], [1, 'accentInk', 0]] },
  lily: { base: 'accentInk', stops: [[0, 'accent', 0.5], [0.22, 'accent', 0.16], [0.42, 'accent', 0], [0.42, 'canvas', 0], [1, 'canvas', 0.12]] },
  lilybud: { base: 'accentInk', stops: [[0, 'muted', 1], [0.5, 'muted', 0.45], [1, 'muted', 0]] },
  deep: { base: 'line', stops: [[0, 'ink', 0.3], [0.5, 'ink', 0], [0.5, 'canvas', 0], [1, 'canvas', 0.2]] },
  sage: { base: 'muted', stops: [[0, 'ink', 0.46], [0.6, 'ink', 0.24], [0.9, 'ink', 0.06], [1, 'ink', 0.02]] },
  // the lighter sage leaves, a minority: the muted lit toward its tip
  sagelight: { base: 'muted', stops: [[0, 'canvas', 0.06], [1, 'canvas', 0.36]] },
};

const n1 = (v) => Math.round(v * 10) / 10;
const n3 = (v) => Math.round(v * 1000) / 1000;
const tfOf = (x, y, ...ops) => `translate(${n1(x)} ${n1(y)})${ops.join('')}`;
const rot = (a) => (a ? ` rotate(${n1(a / DEG)})` : '');
const scl = (sx, sy = sx) => ` scale(${n3(sx)} ${n3(sy)})`;
const mov = (x, y) => (x || y ? ` translate(${n1(x)} ${n1(y)})` : '');
// an ellipse as a path, centred at (x, y)
const oval = (x, y, rx, ry = rx) => `M${n1(x - rx)} ${n1(y)}a${n1(rx)} ${n1(ry)} 0 1 0 ${n1(2 * rx)} 0a${n1(rx)} ${n1(ry)} 0 1 0 ${n1(-2 * rx)} 0Z`;
const curve = (a, c, b) => `M${n1(a[0])} ${n1(a[1])}Q${n1(c[0])} ${n1(c[1])} ${n1(b[0])} ${n1(b[1])}`;

/**
 * A rounded petal in its own frame, from its base at the origin to its rim at x = L, W wide: a
 * narrow claw (`claw` of the width at the base) widening to a broad round rim. `ruffle` dents the
 * rim between `n` scallops, `notch` dents its middle, `phase` shifts the scallops. Points, closed.
 */
export function roundPetal(L, W, { ruffle = 0, n = 5, notch = 0, phase = 0, claw = 0.2 } = {}) {
  const b = W / 2, a = clamp(b * 1.05, L * 0.12, L * 0.55), X0 = L - a, pts = [];
  const side = (u, sg) => [X0 * u, sg * b * (claw + (1 - claw) * Math.sin((u * Math.PI) / 2) ** 0.85)];
  for (let k = 0; k <= 8; k++) pts.push(side(k / 8, -1));
  const N = 30;
  for (let k = 1; k < N; k++) {
    const th = -Math.PI / 2 + (k / N) * Math.PI;
    const bump = Math.abs(Math.sin((th + Math.PI / 2) * n + phase)) ** 0.6;
    const m = 1 - ruffle * (1 - bump) - notch * Math.exp(-((th / 0.15) ** 2));
    pts.push([X0 + a * Math.cos(th) * m, b * Math.sin(th) * m]);
  }
  for (let k = 8; k >= 0; k--) pts.push(side(k / 8, 1));
  return pts;
}

/**
 * A pointed petal or tepal in its own frame, L long and W wide at most, widest at about two fifths
 * of its length and sharp at its tip; `bend` curves its midline to one side (a recurved tip).
 * Returns { pts, mid(u), half(u) }.
 */
export function pointPetal(L, W, { bend = 0, waist = 0.1 } = {}) {
  const half = (u) => (W / 2) * (waist * (1 - u) + (1 - waist) * Math.sin(Math.PI * u ** 0.75) ** 0.9 * (1 - u) ** 0.12);
  const mid = (u) => [u * L, bend * L * u * u];
  const pts = [];
  for (const sg of [-1, 1]) {
    for (let k = 0; k <= 18; k++) {
      const u = sg < 0 ? k / 18 : 1 - k / 18, [mx, my] = mid(u), sl = Math.atan(2 * bend * u), h = half(u);
      pts.push([mx - Math.sin(sl) * sg * h, my + Math.cos(sl) * sg * h]);
    }
  }
  return { pts, mid, half };
}

// fine veins of a rounded petal: curves from near its claw out toward its rim
function roundVeins(L, W, n, from = 0.3) {
  const b = W / 2, a = clamp(b * 1.05, L * 0.12, L * 0.55), X0 = L - a;
  let d = '';
  for (let j = 0; j < n; j++) {
    const v = n > 1 ? j / (n - 1) - 0.5 : 0, th = v * Math.PI * 0.72;
    const end = [X0 + a * Math.cos(th) * 0.9, b * Math.sin(th) * 0.88], start = [L * from, end[1] * 0.22];
    d += curve(start, [(start[0] + end[0]) / 2, end[1] * 0.7], end);
  }
  return d;
}

const lineW = (w) => ({ 'stroke-width': r2(Math.max(0.5, w)), 'vector-effect': 'non-scaling-stroke' });

/**
 * A broad petal with an irregular wavy rim, in its own frame from its base at the origin to its rim
 * at x = L, W wide: a narrow claw (`claw` of the width) widening fast to a round rim, the rim dented
 * by two seeded waves (`waves` and twice that plus one, `depth` deep) and, with `notch`, at its
 * middle; `skew` makes one side fuller. Every random choice comes from `rnd`, drawn here. Returns
 * { pts, rim, c }: the closed outline, the rim's own points (base side excluded) and the rim's centre.
 */
export function wavyPetal(L, W, rnd, { claw = 0.3, waves = 2, depth = 0.08, notch = 0, skew = 0 } = {}) {
  const b = W / 2, a = clamp(b, L * 0.18, L * 0.62), X0 = L - a;
  const p1 = rnd() * TAU, p2 = rnd() * TAU, mix = between(rnd, 0.3, 0.6), f2 = waves * 2 + 1;
  const side = (u, sg) => [X0 * u, sg * b * (1 + skew * sg) * (claw + (1 - claw) * Math.sin((u * Math.PI) / 2) ** 0.7)];
  const pts = [], rim = [];
  for (let k = 0; k <= 10; k++) pts.push(side(k / 10, -1));
  const N = 36;
  for (let k = 1; k < N; k++) {
    const v = k / N, th = -Math.PI / 2 + v * Math.PI;
    const w = (1 - mix) * Math.sin(v * Math.PI * waves + p1) + mix * Math.sin(v * Math.PI * f2 + p2);
    const m = 1 - depth * (0.5 + 0.5 * w) - notch * Math.exp(-((th / 0.13) ** 2));
    const q = [X0 + a * Math.cos(th) * m, b * (1 + skew * Math.sin(th)) * Math.sin(th) * m];
    pts.push(q); rim.push(q);
  }
  for (let k = 10; k >= 0; k--) pts.push(side(k / 10, 1));
  return { pts, rim, c: [X0, 0] };
}

// The turned-back rim of a cupped petal: the band between its rim (the middle `span` of it) and the
// rim pulled `deep` of the way toward the petal's base, as a closed path, and its inner edge, where
// the fold casts its line.
function foldOf(shape, deep = 0.2, span = 0.7) {
  const n = shape.rim.length, i0 = Math.round(n * (1 - span) / 2), i1 = n - 1 - i0;
  const outer = shape.rim.slice(i0, i1 + 1);
  const inner = outer.map(([x, y], k) => { const f = deep * Math.sin((Math.PI * (k + 0.5)) / outer.length) ** 0.6; return [x - (x - shape.c[0] * 0.35) * f, y - y * f * 0.6]; });
  return { d: pathOf(outer.concat(inner.slice().reverse()), true), line: lineD(inner) };
}

// Fine radial veins of a broad petal: `n` lines from near its claw out to most of the way to its rim.
function fanVeins(shape, n, from = 0.25, to = 0.7) {
  const r = shape.rim, L = shape.c[0];
  let d = '';
  for (let j = 0; j < n; j++) {
    const q = r[Math.round(((j + 0.5) / n) * (r.length - 1))], a = [L * from, q[1] * 0.12], b = [a[0] + (q[0] - a[0]) * to, a[1] + (q[1] - a[1]) * to];
    d += curve(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + (b[1] - a[1]) * 0.12], b);
  }
  return d;
}

// A point of a 3-vector projected on the frame (orthographic: the frame's x and y), and vector helpers
const v3 = { add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], unit: (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; } };

/**
 * A lily's tepal in three quarters, in the bloom's frame: it leaves the throat at the origin along
 * the cone round the flower's axis `ax` (half-angle `cone`) at azimuth `phi`, sweeps out and recurves
 * by `curl` toward its tip, `L` long and `W` wide. Returns { pts, mid, z, facing, tip } projected on
 * the frame: the outline, its midline, the depth of its middle (toward the viewer is positive), and
 * whether the viewer sees its inner face.
 */
export function tepal3(ax, phi, L, W, { cone = 1.0, curl = 0.9, waist = 0.14 } = {}) {
  const up = Math.abs(ax[2]) > 0.98 ? [1, 0, 0] : [0, 0, 1];
  const u = v3.unit(v3.cross(ax, up)), v = v3.cross(ax, u);
  const radial = v3.add(v3.mul(u, Math.cos(phi)), v3.mul(v, Math.sin(phi))), tang = v3.add(v3.mul(u, -Math.sin(phi)), v3.mul(v, Math.cos(phi)));
  const M = 16, mid = [[0, 0, 0]], dirs = [];
  for (let k = 0; k <= M; k++) {
    const s = k / M, a = cone * (0.55 + 0.45 * Math.min(1, s * 2.2)) + curl * s * s;
    dirs.push(v3.add(v3.mul(ax, Math.cos(a)), v3.mul(radial, Math.sin(a))));
    if (k) mid.push(v3.add(mid[k - 1], v3.mul(dirs[k], L / M)));
  }
  const half = (s) => (W / 2) * (waist * (1 - s) + (1 - waist) * Math.sin(Math.PI * s ** 0.7) ** 0.85 * (1 - s) ** 0.18);
  const left = [], right = [];
  for (let k = 0; k <= M; k++) { const h = half(k / M); left.push(v3.add(mid[k], v3.mul(tang, h))); right.push(v3.add(mid[k], v3.mul(tang, -h))); }
  const P = (q) => [q[0], q[1]];
  // the inner face looks along sin(a) ax - cos(a) radial, at the middle of the tepal
  const am = cone + curl * 0.25, inner = Math.sin(am) * ax[2] - Math.cos(am) * radial[2];
  return { pts: left.map(P).concat(right.reverse().map(P)), mid: mid.map(P), z: mid[M >> 1][2], facing: inner >= 0, tip: P(mid[M]) };
}

/**
 * The shapes of an illustrated bloom at (x, y), facing `e.ang`, of radius `e.r`, at local progress
 * t: [{ d, tf, paint | cls, attrs, ...meta }], each a path in its own frame placed by `tf`. A
 * camellia is seven rings of rounded petals drawn from the outside in round a deep heart; a peony is
 * ruffled petals in rings round a golden heart of stamens, its inner petals curling over the front
 * of the heart; a lily is six pointed, recurved tepals with spots and a midrib, six stamens and a
 * pistil; a sweet pea is a ruffled standard, two wings and a keel on a green calyx; a bud is a
 * shaded closed bud between sepals (`budPaint`: peony, camellia, sweetpea, or lilybud for a long
 * lily bud). `tilt` foreshortens the flower's face. Every random choice is drawn from the bloom's
 * own seed before t is read, so a petal never jumps between frames.
 */
function botany(e, x, y, t, mode, o) {
  const out = [], R = e.r, sc = (v) => scaleOf(clamp01(v), mode, o);
  const rnd = random(`garden|${e.form}|${e.seed ?? 0}`);
  const face = (e.ang ?? -Math.PI / 2) + Math.PI / 2, tilt = e.tilt ?? 1;
  const plane = tfOf(x, y, rot(face), scl(1, tilt));
  const bs = sc(t / 0.32);
  if (e.form === 'camellia') {
    // [radius, petals, where a petal starts as a share of its ring]: a few very large, broad petals
    // with wavy rims, then smaller and smaller cupped petals whose rims curl back, folding into a
    // tight swirl at the heart
    const rings = [[1, 8, 0.34], [0.84, 7, 0.32], [0.68, 7, 0.3], [0.54, 6, 0.28], [0.41, 6, 0.26], [0.3, 5, 0.24], [0.2, 4, 0.2], [0.12, 3, 0.15]];
    const spin = rnd() * TAU;
    const petals = rings.map(([k, n, from], ri) => Array.from({ length: n }, (_, i) => {
      const inner = R * k * from, L = (R * k - inner) * between(rnd, 0.88, 1.12);
      const W = Math.min(2 * R * k * Math.sin(Math.PI / n) * between(rnd, 1.3, 1.65), L * (ri < 2 ? 1.35 : 1.2));
      const th = spin + ri * 0.61 + ((i + (rnd() - 0.5) * 0.4) * TAU) / n;
      const sh = wavyPetal(L, W, rnd, { claw: 0.3, waves: 1 + Math.floor(rnd() * 2), depth: between(rnd, 0.05, ri < 2 ? 0.14 : 0.1), notch: rnd() < 0.35 ? 0.05 : 0, skew: between(rnd, -0.14, 0.14) });
      // the shadow a petal casts on the one beneath it: its own outline a little larger
      const grown = (f) => pathOf(sh.pts.map(([px, py]) => [px * (1 + 0.6 * f) + R * k * 0.02 * f * 10, py * (1 + f)]), true);
      const shadow = ri ? [grown(0.045), grown(0.1)] : null;
      return { inner, th, d: pathOf(sh.pts, true), shadow, fold: ri >= 1 && rnd() < 0.8 ? foldOf(sh, between(rnd, 0.12, ri < 3 ? 0.22 : 0.32), between(rnd, 0.4, 0.8)) : null, veins: ri < 5 ? fanVeins(sh, 9, 0.32, 0.7) : '' };
    }));
    if (bs <= 0.001) return out;
    out.push({ d: oval(0, 0, R * 0.42), tf: plane + scl(bs), cls: 'mm-garden__b-on-accent', ring: -1 });
    rings.forEach(([k], ri) => {
      const open = clamp01((t - 0.06 - 0.05 * ri) / 0.5), s = bs * (0.3 + 0.7 * sc(open)), turn = (1 - out3(open)) * 0.5;
      // the inner rings sit higher, so the bloom reads as a cup seen from the front
      const lift = mov(0, -(1 - k) * 0.2 * R);
      if (ri === 4) out.push({ d: oval(0, 0, R * 0.3), tf: plane + scl(s) + lift, cls: 'mm-garden__b-core', ring: ri });
      for (const q of petals[ri]) {
        const tf = plane + scl(s) + lift + rot(q.th + turn) + mov(q.inner, 0);
        if (q.shadow) for (const d of q.shadow) out.push({ d, tf, cls: 'mm-garden__b-cast', ring: ri });
        out.push({ d: q.d, tf, paint: 'camellia', edge: R * 0.008, ring: ri });
        if (q.veins && R * k * s > 30) out.push({ d: q.veins, tf, cls: 'mm-garden__b-streak', attrs: lineW(R * 0.004), ring: ri });
        if (q.fold) {
          out.push({ d: q.fold.d, tf, cls: 'mm-garden__b-rimlight', ring: ri });
          out.push({ d: q.fold.line, tf, cls: 'mm-garden__b-fold', attrs: lineW(R * 0.005), ring: ri });
        }
        out.push({ d: q.d, tf, cls: 'mm-garden__b-detail', attrs: lineW(R * 0.005), ring: ri });
      }
    });
    return out;
  }
  if (e.form === 'peony') {
    // a globe of many thin, ruffled petals: a back fan, guard petals at the sides, golden stamens
    // peeking at the top, a crowd of small ruffled petals round them and a bowl of broad petals in front
    const petal = (L, W, ruff) => {
      const n = 5 + Math.floor(rnd() * 4), l = L * between(rnd, 0.88, 1.1), w = W * between(rnd, 0.85, 1.15);
      const sh = wavyPetal(l, w, rnd, { claw: 0.34, waves: n, depth: ruff * between(rnd, 0.8, 1.25), skew: between(rnd, -0.15, 0.15) });
      return { l, n, d: pathOf(sh.pts, true), veins: fanVeins(sh, 3, 0.35, 0.5) };
    };
    const fan = Array.from({ length: 9 }, (_, i) => ({ th: -Math.PI + 0.32 + (i / 8) * (Math.PI - 0.64) + (rnd() - 0.5) * 0.18, y: 0.04, ...petal(R * 0.8, R * 0.5, 0.2) }));
    const guards = [Math.PI + 0.2, Math.PI * 0.84, -0.2, Math.PI * 0.16].map((a) => ({ th: a + (rnd() - 0.5) * 0.2, y: 0.1, ...petal(R * 0.86, R * 0.6, 0.16) }));
    const gold = Array.from({ length: 22 }, () => { const a = rnd() * TAU, d = Math.sqrt(rnd()); return { x: Math.cos(a) * d * R * 0.2, y: -0.21 * R + Math.sin(a) * d * R * 0.08, r: R * between(rnd, 0.012, 0.026), deep: rnd() < 0.35 }; });
    const crowd = Array.from({ length: 18 }, () => {
      const a = rnd() * TAU, d = Math.sqrt(rnd()), x = Math.cos(a) * d * R * 0.44, y = -0.02 * R + Math.sin(a) * d * R * 0.26;
      return { x, y, th: Math.atan2(y + 0.3 * R, x) + (rnd() - 0.5) * 0.9, ...petal(R * between(rnd, 0.3, 0.44), R * between(rnd, 0.3, 0.42), 0.22) };
    }).sort((p, q) => p.y - q.y);
    const bowl = Array.from({ length: 6 }, (_, i) => ({ th: 0.12 * Math.PI + (i / 5) * 0.76 * Math.PI + (rnd() - 0.5) * 0.2, ...petal(R * 0.62, R * 0.64, 0.1) }));
    if (bs <= 0.001) return out;
    const upright = tfOf(x, y, rot(face));
    const put = (q, tf, ri) => {
      out.push({ d: q.d, tf, paint: 'peony', edge: R * 0.006, ruffle: q.n, ring: ri });
      if (q.l > 26) out.push({ d: q.veins, tf, cls: 'mm-garden__b-fine', attrs: lineW(R * 0.004), ring: ri });
      out.push({ d: q.d, tf, cls: 'mm-garden__b-detail', attrs: lineW(R * 0.012), ring: ri });
    };
    const o1 = clamp01((t - 0.05) / 0.5), s1 = bs * (0.3 + 0.7 * sc(o1)), sq = scl(1, Math.min(1, tilt * 1.15));
    for (const q of fan) put(q, upright + sq + scl(s1) + mov(0, q.y * R) + rot(q.th + (1 - out3(o1)) * 0.3), 0);
    for (const q of guards) put(q, upright + sq + scl(s1) + mov(0, q.y * R) + rot(q.th - (1 - out3(o1)) * 0.3), 1);
    const g = sc((t - 0.25) / 0.45);
    if (g > 0.001) {
      out.push({ d: oval(0, -0.2 * R, R * 0.13 * g, R * 0.05 * g), tf: upright, cls: 'mm-garden__b-gold' });
      for (const q of gold) out.push({ d: oval(q.x, q.y, q.r * g), tf: upright, cls: q.deep ? 'mm-garden__b-gold-deep' : 'mm-garden__b-gold' });
    }
    const s2 = bs * sc((t - 0.3) / 0.55);
    if (s2 > 0.001) for (const q of crowd) put(q, upright + scl(s2) + mov(q.x, q.y) + rot(q.th), 2);
    const s3 = bs * sc((t - 0.4) / 0.55);
    if (s3 > 0.001) for (const q of bowl) put(q, upright + sq + scl(s3) + mov(0, 0.02 * R) + rot(q.th), 3);
    return out;
  }
  if (e.form === 'lily') {
    // a trumpet in three quarters: six tepals on a cone round the flower's axis, sweeping out and
    // recurving at their tips, drawn from the back to the front; golden, orange toward the throat,
    // spotted, each creased along its midrib; short stamens with orange-brown anthers
    const az = clamp(0.1 + 0.6 * (e.tilt ?? 0.75), 0.3, 0.75), ang = e.ang ?? -Math.PI / 2, pl = Math.sqrt(1 - az * az);
    const ax = [Math.cos(ang) * pl, Math.sin(ang) * pl, az];
    const spin = rnd() * TAU;
    const tepals = Array.from({ length: 6 }, (_, i) => {
      const L = R * between(rnd, 0.92, 1.05), W = R * (i % 2 ? 0.72 : 0.6) * between(rnd, 0.92, 1.08);
      const g = tepal3(ax, spin + (i * Math.PI) / 3 + (rnd() - 0.5) * 0.2, L, W, { cone: between(rnd, 0.55, 0.75), curl: between(rnd, 1.0, 1.4) });
      const a = Math.atan2(g.tip[1], g.tip[0]), c = Math.cos(-a), sn = Math.sin(-a), loc = (q) => [q[0] * c - q[1] * sn, q[0] * sn + q[1] * c];
      const pts = g.pts.map(loc), mid = g.mid.map(loc), M = mid.length - 1;
      const spots = Array.from({ length: g.facing ? 4 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 2) }, () => { const m = mid[2 + Math.floor(rnd() * 6)], off = (rnd() - 0.5) * W * 0.5; return [m[0], m[1] + off, R * between(rnd, 0.008, 0.014)]; });
      return { a, d: pathOf(pts, true), shade: pathOf(pts.slice(0, M + 1).concat(mid.slice().reverse()), true), mid: lineD(mid.slice(1, M - 2)), z: g.z, facing: g.facing, spots };
    }).sort((p, q) => p.z - q.z);
    const stamens = Array.from({ length: 6 }, (_, i) => {
      const ph = spin + (i * Math.PI) / 3 + Math.PI / 6, rad = [Math.cos(ph), Math.sin(ph)];
      const len = R * between(rnd, 0.32, 0.44), sp = R * between(rnd, 0.06, 0.12);
      return { end: [ax[0] * len + rad[0] * sp * az, ax[1] * len + rad[1] * sp * az], bow: (rnd() - 0.5) * 0.3 };
    });
    if (bs <= 0.001) return out;
    const open = clamp01((t - 0.08) / 0.55), s = bs * (0.38 + 0.62 * sc(open)), turn = (1 - out3(open)) * 0.35;
    const base = tfOf(x, y, scl(s));
    tepals.forEach((q, k) => {
      const tf = base + rot(q.a + turn);
      out.push({ d: q.d, tf, paint: 'lily', edge: R * 0.007 });
      out.push({ d: q.shade, tf, cls: q.facing ? 'mm-garden__b-crease' : 'mm-garden__b-shade' });
      out.push({ d: q.mid, tf, cls: 'mm-garden__b-midrib', attrs: lineW(R * 0.012) });
      for (const [sx, sy, sr] of q.spots) out.push({ d: oval(sx, sy, sr * 1.4, sr), tf, cls: 'mm-garden__b-spot' });
      out.push({ d: q.d, tf, cls: 'mm-garden__b-detail', attrs: lineW(R * 0.006) });
    });
    const st = sc((t - 0.45) / 0.45);
    if (st > 0.001) {
      const sf = tfOf(x, y, scl(s * st));
      for (const q of stamens) {
        const [ex, ey] = q.end, mx = ex / 2 - ey * q.bow, my = ey / 2 + ex * q.bow, a = Math.atan2(ey, ex);
        out.push({ d: curve([0, 0], [mx, my], q.end), tf: sf, cls: 'mm-garden__b-filament', attrs: lineW(R * 0.006) });
        out.push({ d: oval(0, 0, R * 0.055, R * 0.022), tf: sf + mov(ex, ey) + rot(a + Math.PI / 2), cls: 'mm-garden__b-pollen' });
        out.push({ d: oval(0, 0, R * 0.055, R * 0.022), tf: sf + mov(ex, ey) + rot(a + Math.PI / 2), cls: 'mm-garden__b-anther' });
      }
      const pe = [ax[0] * R * 0.48, ax[1] * R * 0.48];
      out.push({ d: curve([0, 0], [pe[0] * 0.5, pe[1] * 0.5 + R * 0.03], pe), tf: sf, cls: 'mm-garden__b-filament', attrs: lineW(R * 0.009) });
      out.push({ d: oval(pe[0], pe[1], R * 0.03), tf: sf, cls: 'mm-garden__b-stigma' });
    }
    return out;
  }
  if (e.form === 'sweetpea') {
    // seen from the side: a large upright standard with a wavy, notched rim and a crease down its
    // middle, two pale wings flushed with the standard's colour at their rims, a keel, a green calyx
    const flip = Math.cos(e.ang ?? 0) < 0 ? -1 : 1, base = tfOf(x, y, rot(e.ang ?? 0), scl(1, flip));
    const std = wavyPetal(R * 1.05, R * 1.55, rnd, { claw: 0.22, waves: 3, depth: 0.1, notch: 0.08, skew: between(rnd, -0.1, 0.1) });
    const wings = [-0.38, 0.04].map((a) => ({ a: a + (rnd() - 0.5) * 0.12, d: pathOf(wavyPetal(R * 0.74, R * 0.6, rnd, { claw: 0.3, waves: 2, depth: 0.08 }).pts, true) }));
    const keel = pathOf(pointPetal(R * 0.55, R * 0.26, { bend: 0.2, waist: 0.3 }).pts, true);
    const calyx = pathOf(pointPetal(R * 0.42, R * 0.34, { waist: 0.5 }).pts, true), sepal = pathOf(pointPetal(R * 0.34, R * 0.1).pts, true);
    if (bs <= 0.001) return out;
    const sw = scl(bs), su = scl(0.35 + 0.65 * sc((t - 0.15) / 0.6));
    out.push({ d: calyx, tf: base + sw, paint: 'sage', part: 'calyx' });
    for (const a of [-0.55, 0.55]) out.push({ d: sepal, tf: base + sw + mov(R * 0.25, 0) + rot(a), paint: 'sage', part: 'calyx' });
    const stdTf = base + sw + mov(R * 0.26, 0) + rot(-1.45) + su;
    const stdD = pathOf(std.pts, true);
    out.push({ d: stdD, tf: stdTf, paint: 'sweetpea', edge: R * 0.02, part: 'standard' });
    if (R * bs > 14) out.push({ d: fanVeins(std, 7, 0.25, 0.6), tf: stdTf, cls: 'mm-garden__b-fine', attrs: lineW(R * 0.008) });
    out.push({ d: lineD([[R * 0.1, 0], [R * 0.85, R * 0.02]]), tf: stdTf, cls: 'mm-garden__b-fold', attrs: lineW(R * 0.014) });
    out.push({ d: stdD, tf: stdTf, cls: 'mm-garden__b-detail', attrs: lineW(R * 0.014) });
    const wingAt = (w) => base + sw + mov(R * 0.3, R * 0.04) + rot(w.a);
    out.push({ d: wings[0].d, tf: wingAt(wings[0]), paint: 'wing', edge: R * 0.016, part: 'wing' });
    out.push({ d: wings[0].d, tf: wingAt(wings[0]), cls: 'mm-garden__b-detail', attrs: lineW(R * 0.012) });
    out.push({ d: keel, tf: base + sw + mov(R * 0.3, R * 0.12) + rot(0.16), paint: 'wing', part: 'keel' });
    out.push({ d: wings[1].d, tf: wingAt(wings[1]), paint: 'wing', edge: R * 0.016, part: 'wing' });
    out.push({ d: wings[1].d, tf: wingAt(wings[1]), cls: 'mm-garden__b-detail', attrs: lineW(R * 0.012) });
    return out;
  }
  // a bud
  const kind = e.budPaint ?? 'peony';
  if (kind === 'lilybud') {
    const p = pointPetal(R * 2.5, R * 1.0, { waist: 0.3 }), d = pathOf(p.pts, true);
    const s = sc(t);
    if (s <= 0.001) return out;
    const tf = tfOf(x, y, rot(e.ang ?? -Math.PI / 2), scl(s));
    out.push({ d, tf, paint: 'lilybud' });
    out.push({ d, tf, cls: 'mm-garden__b-detail', attrs: lineW(R * 0.02) });
    out.push({ d: curve(p.mid(0.1), [R * 1.3, R * 0.06], p.mid(0.92)), tf, cls: 'mm-garden__b-fine', attrs: lineW(R * 0.015) });
    return out;
  }
  const body = pathOf(roundPetal(R * 2, R * 1.7, { claw: 0.45, ruffle: 0.02, n: 3 }), true);
  const sepals = [-0.5, 0.5, 0].map((a) => ({ a: a + (rnd() - 0.5) * 0.12, d: pathOf(pointPetal(R * (a ? 0.95 : 0.8), R * 0.72, { waist: 0.4 }).pts, true) }));
  const s = sc(t);
  if (s <= 0.001) return out;
  const tf = tfOf(x, y, rot(e.ang ?? -Math.PI / 2), scl(s));
  out.push({ d: body, tf, paint: kind === 'sweetpea' ? 'sweetpea' : kind === 'camellia' ? 'camellia' : 'peony' });
  out.push({ d: body, tf, cls: 'mm-garden__b-detail', attrs: lineW(R * 0.02) });
  for (const q of sepals) {
    out.push({ d: q.d, tf: tf + rot(q.a), paint: 'sage' });
    out.push({ d: q.d, tf: tf + rot(q.a), cls: 'mm-garden__b-detail', attrs: lineW(R * 0.02) });
  }
  return out;
}

/**
 * Where a loose petal is at local progress x and piece time T: { x, y, ang, s, flip }. It leaves its
 * bloom (`src`) small, arcs up by `lift` and lands on its place in the air (`home`) on an ease-out,
 * turning from `a0` to `a1` and tumbling `spin` half turns (flip is the cosine of its tumble). Then
 * it floats round home: within `amp` px, a slow sway, turn and tumble, all sines of T with phases
 * from its seed. `ramp` scales the float (0: none, so a settled petal holds still); the float also
 * grows with the flight, so it is zero as the petal leaves and continuous from the flight to the
 * hold and on into an exit.
 */
export function petalAt(e, x, T = 0, ramp = 0) {
  const u = out3(x), m = 1 - u;
  const [sx, sy] = e.src, [hx, hy] = e.home;
  const cx = (sx + hx) / 2, cy = Math.min(sy, hy) - e.lift;
  let px = m * m * sx + 2 * m * u * cx + u * u * hx, py = m * m * sy + 2 * m * u * cy + u * u * hy;
  let ang = e.a0 + (e.a1 - e.a0) * u, tumble = (e.phase ?? 0) + e.spin * Math.PI * u;
  const f = ramp * u;
  if (f > 0) {
    const r = random(`garden|petal|${e.seed ?? 0}`), w = () => TAU / between(r, 5, 9), ph = () => r() * TAU;
    const w1 = w(), p1 = ph(), w2 = w(), p2 = ph(), w3 = w(), p3 = ph(), w4 = w(), p4 = ph();
    px += f * e.amp * 0.8 * Math.sin(w1 * T + p1);
    py += f * e.amp * 0.6 * Math.sin(w2 * T + p2);
    ang += f * 0.35 * Math.sin(w3 * T + p3);
    tumble += f * 0.8 * Math.sin(w4 * T + p4);
  }
  return { x: px, y: py, ang, s: clamp01(x * 5), flip: Math.cos(tumble) };
}

const BED_WEIGHTS = { back: [['lily', 0.3], ['lilybud', 0.32], ['peony', 0.14], ['foliage', 0.24]], mid: [['peony', 0.28], ['lily', 0.3], ['bud', 0.14], ['foliage', 0.28]], front: [['peony', 0.36], ['lily', 0.32], ['foliage', 0.32]] };
const BED_SIZE = { camellia: [0.25, 0.25], peony: [0.09, 0.125], lily: [0.11, 0.145], bud: [0.028, 0.038], lilybud: [0.065, 0.09], sweetpea: [0.04, 0.05], foliage: [0.02, 0.02] };
const BED_SPAN = { peony: 1.7, lily: 1.6, bud: 2.4, lilybud: 2.2, foliage: 6 };
// leaves per plant: [fewest, most, shortest, longest (in U), share in the deep tone]
const BED_LEAVES = { camellia: [3, 5, 0.22, 0.34, 1], peony: [3, 5, 0.1, 0.15, 0.08], lily: [3, 5, 0.09, 0.14, 0.05], bud: [2, 3, 0.07, 0.1, 0.1], lilybud: [2, 3, 0.07, 0.11, 0], sweetpea: [5, 8, 0.05, 0.075, 0], foliage: [5, 8, 0.08, 0.13, 0.15] };

/**
 * The bed: where each plant of a botanical bed roots and blooms, in the slot's own pixels, from the
 * frame (`frame`, the stage in slot pixels), the text box (W x H from the slot's origin), the last
 * baseline `base`, other text `blocks`, the seed and the number of loose petals. Returns { U, ceil,
 * massTop, plants, leaves, petals }. U, the bed's unit, is the frame's short side, less when the room
 * under the text is short. The bed is one dense, overlapping mass of blooms and leaves whose top
 * line (`massTop`) sits low, about 0.44 of the room under the text from the frame's bottom (0.62 in
 * a portrait frame), with a few things rising above it: one hero camellia, about half the short
 * side across, left of centre (near the middle in a portrait frame); two climbing sweet pea sprays,
 * one at the far left and one right of centre, reaching up toward the text; slender lily buds. In the
 * mass, rows of peonies, lilies, buds and leafy sprays overlap from back to front, the front row cut by
 * the frame's bottom edge; every plant carries leaves near its bloom. Every bloom sits under the text
 * box (its top at least 3 % of the short side below the box and below any block near it); only the
 * climbers' tendril tips reach toward the last baseline, never above it. Petals float in the air
 * between the text and the mass, never by the text, each leaving a bloom of its own colour.
 */
export function bedLayout({ frame, box, base, em, blocks = [], seed = 1, petals = 8, density = 1 }) {
  const rnd = random(`garden|${seed}|bed`);
  const Wf = frame.x1 - frame.x0, Hf = frame.y1 - frame.y0, S = Math.min(Wf, Hf), gap = 0.03 * S;
  const near = blocks.filter((b) => b.y0 < box.H + 0.35 * S);
  const ceilAt = (x0, x1) => Math.max(box.H + gap, ...near.filter((b) => b.x1 > x0 && b.x0 < x1).map((b) => b.y1 + gap));
  const tipAt = (x) => Math.max(base + 0.04 * em, ...near.filter((b) => b.x1 + gap > x && b.x0 - gap < x).map((b) => b.y1 + gap));
  const ceil = box.H + gap, room = frame.y1 - ceil;
  const U = Math.min(S, Math.max(0.3 * S, room / 0.62));
  const portrait = Hf > Wf * 1.2;
  const massTop = frame.y1 - Math.min(room - 0.12 * U, (portrait ? 0.62 : 0.44) * room);
  const hits = (x, y, r) => blocks.some((b) => Math.hypot(clamp(x, b.x0, b.x1) - x, clamp(y, b.y0, b.y1) - y) < r);
  const pick = (list) => { let v = rnd() * list.reduce((a, [, w]) => a + w, 0); for (const [k, w] of list) { v -= w; if (v <= 0) return k; } return list.at(-1)[0]; };
  const plants = [];
  const facing = { camellia: [-0.15, 0.15], peony: [-0.3, 0.3], lily: [-1.1, 1.1], bud: [-0.4, 0.4], lilybud: [-0.25, 0.25], sweetpea: [-0.2, 0.2], foliage: [-0.6, 0.6] };
  const TILT = { camellia: [0.86, 0.95], peony: [0.62, 0.8], lily: [0.45, 0.85] };
  const add = (type, x, y, r, row, depth) => {
    const p = { type, root: [x + between(rnd, -0.1, 0.1) * U, frame.y1 + between(rnd, 0.01, 0.04) * U], head: [x, y], r, ang: -Math.PI / 2 + between(rnd, ...facing[type]), tilt: TILT[type] ? between(rnd, ...TILT[type]) : 1, depth, row, seed: Math.floor(rnd() * 1e6) };
    p.t0 = 0.05 + 0.45 * ((x - frame.x0) / Wf) + 0.2 * rnd() + ({ front: 0, mid: 0.12, back: 0.3, hero: 0.1, climb: 0.2 })[row];
    plants.push(p);
    return p;
  };
  const Rh = U * BED_SIZE.camellia[0];
  const hx = frame.x0 + Wf * (portrait ? between(rnd, 0.36, 0.6) : between(rnd, 0.28, 0.4));
  let hy = Math.max(ceilAt(hx - Rh, hx + Rh) + Rh + 0.02 * U, massTop - 0.35 * Rh);
  while (hits(hx, hy, Rh) && hy < frame.y1) hy += 0.02 * U;
  // rows of the mass, back to front: [kind, top, bottom of the band the heads sit in]
  const rows = [{ kind: 'back', y0: massTop - 0.08 * U, y1: massTop + 0.07 * U }];
  const midTop = massTop + 0.1 * U, midBottom = frame.y1 - 0.12 * U;
  const nMid = midBottom < midTop ? 0 : Math.max(1, Math.round((midBottom - midTop) / (0.13 * U)) + 1);
  for (let i = 0; i < nMid; i++) { const c = nMid === 1 ? (midTop + midBottom) / 2 : midTop + (i / (nMid - 1)) * (midBottom - midTop); rows.push({ kind: 'mid', y0: c - 0.05 * U, y1: c + 0.05 * U }); }
  rows.push({ kind: 'front', y0: frame.y1 - 0.06 * U, y1: frame.y1 + 0.04 * U });
  const hero = add('camellia', hx, hy, Rh, 'hero', 1.5);
  // two climbing sweet pea sprays: one at the far left, one right of centre (near the right in a portrait frame)
  for (const [f0, f1] of portrait ? [[0.05, 0.14], [0.78, 0.9]] : [[0.04, 0.1], [0.6, 0.7]]) {
    const cx = frame.x0 + Wf * between(rnd, f0, f1), r = U * between(rnd, ...BED_SIZE.sweetpea);
    add('sweetpea', cx, Math.max(massTop + between(rnd, -0.02, 0.06) * U, ceilAt(cx - r, cx + r) + r), r, 'climb', 1);
  }
  rows.forEach((row, ri) => {
    let x = frame.x0 - 0.05 * U + rnd() * 0.06 * U, prev = null;
    while (x < frame.x1 + 0.05 * U) {
      let type = pick(BED_WEIGHTS[row.kind]);
      if (type === prev) type = pick(BED_WEIGHTS[row.kind]);
      const r = U * between(rnd, ...BED_SIZE[type]) * (row.kind === 'front' && type === 'peony' ? 1.12 : 1);
      const step = ((type === 'foliage' ? U * 0.12 : r * BED_SPAN[type]) * between(rnd, 0.85, 1.15)) / density;
      const cx = x + step * 0.5;
      let cy = type === 'lilybud' ? between(rnd, row.y0 - 0.14 * U, row.y0) : between(rnd, row.y0, row.y1);
      cy = Math.max(cy, ceilAt(cx - r, cx + r) + r);
      x += step;
      const dh = Math.hypot(cx - hero.head[0], cy - hero.head[1]);
      if (row.kind === 'front' ? dh < Rh * 0.6 : dh < (Rh + r) * (row.kind === 'back' ? 0.95 : 0.8)) continue;
      if (hits(cx, cy, r * 1.1) || cy - r > frame.y1 - 0.02 * U) continue;
      prev = type;
      add(type, cx, cy, r, row.kind, row.kind === 'back' ? 1 : row.kind === 'front' ? 3 + nMid : 2 + ri);
    }
  });
  // every bed shows each flower: convert plants until it has two peonies, two lilies, two sweet peas and a bud
  const count = (t) => plants.filter((p) => p.type === t).length;
  const need = [['sweetpea', 2, ['back', 'mid']], ['peony', 2, ['mid', 'front']], ['lily', 2, ['back', 'mid', 'front']], ['bud', 1, ['mid', 'front', 'back']]];
  const keep = { sweetpea: 2, peony: 2, lily: 2, bud: 1, lilybud: 0, foliage: 0 };
  for (const [type, n, rowsOk] of need) {
    for (const p of plants) {
      if (count(type) >= n) break;
      if (p.type === 'camellia' || p.type === type || !rowsOk.includes(p.row) || count(p.type) <= (keep[p.type] ?? 0)) continue;
      p.type = type;
      p.r = U * (BED_SIZE[type][0] + BED_SIZE[type][1]) / 2;
      p.head[1] = Math.max(p.head[1], ceilAt(p.head[0] - p.r, p.head[0] + p.r) + p.r);
    }
  }
  for (const [i, p] of plants.entries()) {
    if (p.type !== 'sweetpea') continue;
    p.tendrils = 2 + Math.floor(rnd() * 3);
    // the spray right of centre reaches up toward the text; the one at the edge stops lower
    const high = i > 1 && plants.indexOf(plants.find((q) => q.type === 'sweetpea')) !== i;
    p.tip = [p.head[0] + between(rnd, -0.04, 0.04) * U, 0];
    p.tip[1] = high ? tipAt(p.tip[0]) + between(rnd, 0.01, 0.06) * U : Math.max(tipAt(p.tip[0]), Math.min(p.head[1] - 0.2 * U, massTop - between(rnd, 0.18, 0.26) * U));
    p.tip[1] = Math.min(p.tip[1], p.head[1] - 0.06 * U);
    p.tip[1] = Math.max(p.tip[1], tipAt(p.tip[0]));
  }
  const leaves = [];
  plants.forEach((p, i) => {
    const [n0, n1, l0, l1, deep] = BED_LEAVES[p.type];
    const n = n0 + Math.floor(rnd() * (n1 - n0 + 1));
    for (let k = 0; k < n; k++) {
      const big = p.type === 'camellia' && k === 0;
      const len = U * between(rnd, l0, l1) * (big ? 1.3 : 1), tone = rnd() < deep ? 'deep' : 'sage';
      // a camellia's big leaves spread sideways from under its bloom; a spray fans its leaves along
      // its stem; others crowd their leaves up and out round the bloom
      const u = p.type === 'camellia' ? between(rnd, big ? 0.9 : 0.7, 0.97) : p.type === 'sweetpea' ? between(rnd, 0.12, 0.8) : p.type === 'foliage' ? between(rnd, 0.35, 1) : between(rnd, 0.5, 0.92);
      leaves.push({ plant: i, u, out: p.type === 'camellia' ? p.r * between(rnd, 0.45, 0.7) : 0, side: big || k % 2 ? 1 : -1, len, wid: len * (p.type === 'lily' || p.type === 'lilybud' || p.type === 'sweetpea' ? 0.36 : between(rnd, 0.42, 0.52)), tone, light: tone === 'sage' && rnd() < 0.22, turn: big ? between(rnd, 0.95, 1.2) : p.type === 'camellia' ? between(rnd, 1.6, 2.4) : between(rnd, 0.5, 1.3), skew: between(rnd, 0.82, 1), bend: between(rnd, -1.2, 1.4) });
    }
  });
  if (!leaves.some((l) => l.tone === 'deep')) leaves.find((l) => plants[l.plant].type === 'camellia').tone = 'deep';
  if (!leaves.some((l) => l.tone === 'sage')) leaves.at(-1).tone = 'sage';
  const out = [];
  const FORMS_OF = [['camellia', 0.4], ['sweetpea', 0.35], ['lily', 0.25]];
  const airTop = Math.max(frame.y0 + 0.04 * U, ceil - 0.06 * U), airBottom = Math.max(airTop + 0.04 * U, massTop - 0.06 * U);
  for (let i = 0; i < petals; i++) {
    const form = pick(FORMS_OF), r = U * between(rnd, 0.024, 0.034);
    let hxp = frame.x0 + Wf * ((i + between(rnd, 0.2, 0.8)) / petals), hyp = between(rnd, airTop, airBottom);
    hxp = clamp(hxp, frame.x0 + 2 * r, frame.x1 - 2 * r);
    if (hxp > -2 * r && hxp < box.W + 2 * r && hyp < box.H + 2 * r) hyp = box.H + 2 * r + between(rnd, 0, 0.06) * U;
    for (let k = 0; k < 6 && hits(hxp, hyp, 2 * r); k++) hyp += 0.04 * U;
    // never over the hero camellia: out to its nearer side
    const dx = hxp - hero.head[0], reachH = Rh * 1.45 + 2 * r;
    if (Math.hypot(dx, hyp - hero.head[1]) < reachH) hxp = hero.head[0] + Math.sign(dx || 1) * Math.sqrt(Math.max(0, reachH * reachH - (hyp - hero.head[1]) ** 2));
    hyp = clamp(hyp, frame.y0 + 2 * r, frame.y1 - 0.3 * U);
    const from = plants.filter((p) => p.type === form);
    const src = (from.length ? from : [hero]).reduce((a, p) => (Math.abs(p.head[0] - hxp) < Math.abs(a.head[0] - hxp) ? p : a));
    out.push({ form, r, home: [hxp, hyp], src: plants.indexOf(src), lift: U * between(rnd, 0.05, 0.12), a0: rnd() * TAU, turn: between(rnd, -2.5, 2.5), spin: between(rnd, 0.6, 1.6), phase: rnd() * TAU, amp: U * between(rnd, 0.008, 0.014), seed: Math.floor(rnd() * 1e6), lag: between(rnd, 0, 0.5), dur: between(rnd, 1.3, 2) });
  }
  return { U, ceil, massTop, plants, leaves, petals: out };
}

const scaleOf = (x, mode, o) => (mode === 'wither' ? 1 - (1 - x) * (1 - x) : pop(x, o));
/**
 * The shapes of a bloom at (x, y) facing `e.ang` (the stem's end tangent), at local progress t
 * (0 closed, 1 open): [{ cls, pts } (a closed outline) | { cls, line } | { cls, circle: [x, y, r] },
 * with optional attrs]. Growing, parts open on the spring; withering, they close on an ease without
 * overshoot. `daisy` (the default): petals open one after another, an inner ring, a heart with
 * dots; `rose`: three rings of overlapping outlined petals opening from the heart out round a
 * spiral; `tulip`: a cup of three petals that splay a little as they open; `bud`: a closed petal
 * between two sepals; `berry`: three to six berries packed round the stem's end, each with a shine;
 * `spore`: a capsule with a cap when small (or `grains` 1), else a head of three to seven grains
 * along the stem. Random choices come from the bloom's own `seed`, never from the frame.
 */
export function bloomShapes(e, x, y, t, mode, o, em) {
  if (e.botany && (BOTANY.has(e.form) || e.form === 'bud')) return botany(e, x, y, t, mode, o);
  const form = e.form ?? 'daisy', out = [], R = e.r;
  const sw = { 'stroke-width': r2(Math.max(0.6, em * 0.006)) };
  const sc = (v) => scaleOf(clamp01(v), mode, o);
  if (form === 'daisy') {
    const n = e.n;
    const step = 0.42 / n;   // petals open one after another over the first 70 % of the bloom
    const open = (i) => clamp01((t - i * step) / 0.42);
    const petalScale = (i) => (mode === 'wither' ? 1 - (1 - open(i)) ** 2 : pop(open(i), o));
    for (let i = 0; i < n; i++) {
      const s = petalScale(i);
      if (s <= 0.001) continue;
      const ang = e.ang + e.twist + (i * TAU) / n + (1 - out3(open(i))) * 0.45;
      out.push({ cls: 'mm-garden__petal', pts: petalPts(x, y, ang, R, R * 0.46, s, e.notch) });
      if (R > 22 && s > 0.5) out.push({ cls: 'mm-garden__crease', line: [at(x, y, ang, s, R * 0.24, 0), at(x, y, ang, s, R * 0.6, R * 0.015)], attrs: sw });
    }
    const inner = clamp01((t - 0.3) / 0.45);
    const si = mode === 'wither' ? 1 - (1 - inner) ** 2 : pop(inner, o);
    if (si > 0.001) {
      for (let i = 0; i < n; i++) {
        const ang = e.ang + e.twist + ((i + 0.5) * TAU) / n - (1 - out3(inner)) * 0.35;
        out.push({ cls: 'mm-garden__petal mm-garden__petal--inner', pts: petalPts(x, y, ang, R * 0.56, R * 0.3, si, false), attrs: sw });
      }
    }
    const heart = clamp01((t - 0.62) / 0.38);
    const sh = mode === 'wither' ? 1 - (1 - heart) ** 2 : pop(heart, o);
    if (sh > 0.001) {
      out.push({ cls: 'mm-garden__heart', circle: [x, y, R * 0.15 * sh] });
      if (R > 18) {
        for (let i = 0; i < 6; i++) {
          const a = e.ang + (i * TAU) / 6 + 0.3;
          out.push({ cls: 'mm-garden__heart', circle: [x + Math.cos(a) * R * 0.27 * sh, y + Math.sin(a) * R * 0.27 * sh, R * 0.035 * sh] });
        }
      }
    }
    return out;
  }
  if (form === 'bud') {
    const s = sc(t);
    if (s <= 0.001) return out;
    out.push({ cls: 'mm-garden__petal', pts: petalPts(x, y, e.ang, R * 2.3, R * 0.85, s, false) });
    for (const side of [-1, 1]) out.push({ cls: 'mm-garden__leaf', pts: petalPts(x, y, e.ang + side * 0.5, R * 1.1, R * 0.35, s, false) });
    return out;
  }
  if (form === 'rose') {
    // [radius, petals, width, opens at]: the outer ring is drawn first, so the inner rings lie on it
    const rings = [[1, 5, 0.62, 0.4], [0.72, 5, 0.5, 0.25], [0.46, 4, 0.36, 0.1]];
    rings.forEach(([k, n, w, start], ri) => {
      const op = clamp01((t - start) / 0.5), s = sc(op);
      if (s <= 0.001) return;
      for (let i = 0; i < n; i++) {
        const ang = e.ang + (e.twist ?? 0) + ((i + ri * 0.5) * TAU) / n + (1 - out3(op)) * 0.5;
        out.push({ cls: 'mm-garden__petal mm-garden__petal--inner', pts: petalPts(x, y, ang, R * k, R * w, s, false), attrs: sw });
      }
    });
    const ss = sc(t / 0.4);
    if (ss > 0.001) {
      const line = [];
      for (let j = 0; j <= 28; j++) { const f = j / 28, a = e.ang + f * 1.75 * TAU, r = R * 0.26 * (1 - f) * ss; line.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
      out.push({ cls: 'mm-garden__crease', line, attrs: sw });
    }
    return out;
  }
  if (form === 'tulip') {
    const s = sc(t), splay = 0.36 * out3(t);
    if (s <= 0.001) return out;
    for (const side of [-1, 1]) out.push({ cls: 'mm-garden__petal mm-garden__petal--inner', pts: petalPts(x, y, e.ang + side * splay, R * 1.45, R * 0.5, s, false), attrs: sw });
    out.push({ cls: 'mm-garden__petal', pts: petalPts(x, y, e.ang, R * 1.5, R * 0.52, s, false) });
    if (R * s > 10) out.push({ cls: 'mm-garden__crease', line: [at(x, y, e.ang, s, R * 0.35, 0), at(x, y, e.ang, s, R * 1.1, 0)], attrs: sw });
    return out;
  }
  if (form === 'berry') {
    const rnd = random(`garden|berry|${e.seed ?? 0}`), n = 3 + Math.floor(rnd() * 4), ring = n <= 3 ? 0.4 : 0.46;
    for (let i = 0; i < n; i++) {
      const a = e.ang + (i * TAU) / n + (rnd() - 0.5) * 0.4, rb = R * between(rnd, 0.3, 0.36);
      const s = sc((t - i * 0.1) / 0.6);
      if (s <= 0.001) continue;
      const bx = x + Math.cos(a) * R * ring, by = y + Math.sin(a) * R * ring;
      out.push({ cls: 'mm-garden__berry', circle: [bx, by, rb * s] });
      out.push({ cls: 'mm-garden__shine', circle: [bx - rb * 0.32 * s, by - rb * 0.32 * s, rb * 0.26 * s] });
    }
    return out;
  }
  if (form === 'spore') {
    const rnd = random(`garden|spore|${e.seed ?? 0}`);
    const n = e.grains ?? (R < em * 0.2 ? 1 : 3 + Math.floor(rnd() * 5));
    if (n <= 1) {
      const s = sc(t);
      if (s <= 0.001) return out;
      out.push({ cls: 'mm-garden__petal', pts: petalPts(x, y, e.ang, R * 2, R * 0.75, s, false) });
      out.push({ cls: 'mm-garden__heart', circle: [...at(x, y, e.ang, s, R * 1.9, 0), R * 0.22 * s] });
      return out;
    }
    for (let j = 0; j < n; j++) {
      const side = j === n - 1 ? 0 : j % 2 ? 1 : -1, tilt = side * between(rnd, 0.35, 0.55);
      const s = sc((t - (j / n) * 0.5) / 0.5);
      if (s <= 0.001) continue;
      const [gx, gy] = at(x, y, e.ang, 1, R * (0.3 + (1.15 * j) / Math.max(1, n - 1)), side * R * 0.08);
      out.push({ cls: 'mm-garden__petal', pts: petalPts(gx, gy, e.ang + tilt, R * 0.62, R * 0.24, s, false) });
    }
    return out;
  }
  return out;
}

function emit(layer, sh) {
  if (sh.d) {
    // a botanical part: its flat role, then its gradient of alphas of another role, in the same frame
    const g = sh.paint ? GRADIENTS[sh.paint] : null, extra = sh.extra ? ` ${sh.extra}` : '';
    const one = (cls, attrs) => { const p = add(layer, cls, sh.d, attrs); if (sh.tf) p.setAttribute('transform', sh.tf); };
    if (g) {
      one(`mm-garden__b-on-${g.base}${sh.edge ? ` mm-garden__b-edge-${g.base}` : ''}${extra}`, sh.edge ? lineW(sh.edge) : undefined);
      one(`mm-garden__b-fill${extra}`, { fill: `url(#${layer.dataset.pid}-${sh.paint})` });
      layer.dataset.used = '1';
    } else one(sh.cls, sh.attrs);
    return;
  }
  if (sh.circle) {
    const c = layer.ownerDocument.createElementNS(NS, 'circle');
    c.setAttribute('class', sh.cls);
    c.setAttribute('cx', String(r2(sh.circle[0]))); c.setAttribute('cy', String(r2(sh.circle[1]))); c.setAttribute('r', String(r2(sh.circle[2])));
    for (const [k, v] of Object.entries(sh.attrs ?? {})) c.setAttribute(k, String(v));
    layer.append(c);
    return;
  }
  add(layer, sh.cls, sh.pts ? pathOf(sh.pts, true) : lineD(sh.line), sh.attrs);
}
// a kelp ribbon's travelling wave while it grows: by its height above the root, fading to nothing at x = 1
function waved(pts, e, x, em) {
  const amp = 0.06 * em * (1 - x) ** 1.5, ph = TAU * 1.3 * x;
  return pts.map(([px, py]) => { const h = Math.max(0, (e.root - py) / em); return [px + amp * h * Math.sin(ph - 2.2 * h), py]; });
}

// The botanical gradients, as one layer's defs: ids from the layer's pid, stops of role alphas.
function defsInto(layer) {
  const doc = layer.ownerDocument, defs = doc.createElementNS(NS, 'defs');
  for (const [name, { stops }] of Object.entries(GRADIENTS)) {
    const lg = doc.createElementNS(NS, 'linearGradient');
    lg.setAttribute('id', `${layer.dataset.pid}-${name}`);
    for (const [off, r, a] of stops) {
      const st = doc.createElementNS(NS, 'stop');
      st.setAttribute('offset', String(off));
      st.setAttribute('style', `stop-color: var(--mm-color-${r}); stop-opacity: ${a}`);
      lg.append(st);
    }
    defs.append(lg);
  }
  layer.prepend(defs);
}
const hashOf = (str) => { let h = 7; for (const c of str) h = (h * 31 + c.codePointAt(0)) >>> 0; return h.toString(36); };

function warpOf(model, sway) {
  if (!sway) return null;
  const em = model.em;
  if (model.bed) {
    // a bed sways by its height above the ground, in its own unit: the tops move a few pixels
    const U = model.U;
    return ([x, y], root) => { const h = Math.max(0, (root - y) / U); return [x + Math.sin(sway + 0.002 * x + 1.2 * h) * 0.02 * U * h * h, y]; };
  }
  return ([x, y], root) => { const h = Math.max(0, (root - y) / em); return [x + Math.sin(sway + 0.004 * x + 1.1 * h) * 0.035 * em * h * h, y + Math.cos(sway + 0.003 * x) * 0.008 * em * h]; };
}

export function paint(el, model, g, { mode = 'grow', sway = 0, time = 0 } = {}) {
  const doc = el.ownerDocument;
  for (const old of el.querySelectorAll(':scope > svg.mm-garden')) old.remove();
  if (!model.elements.length || g <= 0) return;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.style.isolation = 'isolate';
  const back = svgOf(doc, el, 'mm-garden--back'), front = svgOf(doc, el, 'mm-garden--front');
  el.prepend(back); el.append(front);
  if (model.botany) { const pid = `g${hashOf(selectorOf(el))}`; back.dataset.pid = `${pid}b`; front.dataset.pid = `${pid}f`; }
  // loose petals float only when the garden lets them drift
  const ramp = model.set?.drift === 'float' ? 1 : 0;
  const em = model.em, o = model.overshoot ?? 0.12;
  const warp = warpOf(model, sway);
  const W = (pts, root) => (warp ? pts.map((p) => warp(p, root)) : pts);
  const local = (e) => clamp01((g - e.s) / Math.max(1e-6, e.e - e.s));
  // growing, a part springs; withering, it eases out without overshoot
  const grow = (x) => (mode === 'wither' ? 1 - (1 - x) * (1 - x) : pop(x, o));
  const layerOf = (x, y, size) => (model.inkAt(x, y) * em > size ? front : back);
  for (const e of model.elements) {
    const x = local(e);
    if (x <= 0) continue;
    if (e.pts) {
      const f = mode === 'wither' ? x : easeOf[e.ease](x);
      const n = e.pts.length - 1, upto = f * n;
      const widthAt = (i) => widthOf(e, i / n);
      let tip = null;
      for (const r of e.runs) {
        if (r.i0 > upto) break;
        const i0 = Math.max(0, r.i0 - (r.i0 > 0 ? 1 : 0));
        const seg = partOf(e.pts.slice(i0, r.i1 + 1), Math.min(1, (upto - i0) / Math.max(1e-6, r.i1 - i0)));
        if (seg.length < 2) continue;
        const layer = r.layer === 'front' ? front : back;
        let pts = W(seg, e.root);
        if (e.wave && x < 1) pts = waved(pts, e, x, em);
        if (e.type === 'stem') {
          const d = ribbon(pts, i0, widthAt);
          add(layer, e.cls ?? 'mm-garden__stem', d);
          // a botanical stem is the muted darkened by the ink
          if (e.cls === 'mm-garden__b-stem') add(layer, 'mm-garden__b-stem-shade', d);
        }
        else add(layer, e.cls ?? (e.type === 'trace' ? 'mm-garden__trace' : 'mm-garden__line'), lineD(pts), { 'stroke-width': r2(e.w0) });
        // a kelp ribbon's midrib, short of its rounded tip
        if (e.profile === 'kelp') { const v = pts.slice(0, Math.max(0, Math.floor(n * 0.9) - i0 + 1)); if (v.length > 1) add(layer, 'mm-garden__vein', lineD(v), { 'stroke-width': r2(Math.max(0.6, em * 0.007)) }); }
        tip = { layer, p: pts.at(-1) };
      }
      // a coral limb ends round, at its full width, while it grows and at rest
      if (tip && e.profile === 'club') emit(tip.layer, { cls: 'mm-garden__stem', circle: [tip.p[0], tip.p[1], widthOf(e, Math.min(1, upto / n)) / 2] });
      continue;
    }
    const s = grow(x);
    if (s <= 0.001) continue;
    const [px, py] = warp ? warp([e.x, e.y], e.root) : [e.x, e.y];
    const ang = e.ang + (warp ? 0.1 * Math.sin(sway + e.id) : 0);
    if (e.type === 'petal') {
      const q = petalAt(e, x, time, ramp);
      if (q.s <= 0.001) continue;
      // a curled petal: a wavy rim, one edge turned back as a light band with the line it casts
      const pr = random(`garden|petal-shape|${e.seed ?? 0}`), camellia = e.form === 'camellia';
      const sh = wavyPetal(e.r * 2.3, e.r * (camellia ? 1.4 : e.form === 'lily' ? 1.0 : 1.25), pr, { claw: 0.28, waves: 2, depth: between(pr, 0.06, 0.14), notch: camellia || e.form === 'sweetpea' ? 0.06 : 0, skew: between(pr, -0.22, 0.22) });
      const fold = foldOf(sh, between(pr, 0.22, 0.34), between(pr, 0.5, 0.8));
      const fl = q.flip < 0 ? -(0.55 + 0.45 * -q.flip) : 0.55 + 0.45 * q.flip;
      const d = pathOf(sh.pts, true), tf = tfOf(q.x, q.y, rot(q.ang), scl(q.s, q.s * fl), mov(-e.r, 0));
      emit(back, { d, tf, paint: camellia ? 'coral' : e.form, edge: e.r * 0.05, extra: 'mm-garden__b-drift' });
      emit(back, { d: fold.d, tf, cls: 'mm-garden__b-rimlight mm-garden__b-drift' });
      emit(back, { d: fold.line, tf, cls: 'mm-garden__b-fold mm-garden__b-drift', attrs: lineW(e.r * 0.04) });
      emit(back, { d, tf, cls: 'mm-garden__b-detail mm-garden__b-drift', attrs: lineW(e.r * 0.05) });
      continue;
    }
    if (e.type === 'leaf' && e.shape === 'broad') {
      const layer = e.bed ? back : layerOf(e.x + Math.cos(e.ang) * e.len / 2, e.y + Math.sin(e.ang) * e.len / 2, e.wid * 0.5);
      broadInto(layer, e, px, py, ang, s);
      continue;
    }
    if (e.type === 'leaf') {
      const layer = layerOf(e.x + Math.cos(e.ang) * e.len / 2, e.y + Math.sin(e.ang) * e.len / 2, e.wid * 0.5);
      const q = { ...e, x: px, y: py, ang };
      const stalked = e.shape === 'round' || e.shape === 'heart';
      if (stalked) add(layer, 'mm-garden__line', lineD([[px, py], at(px, py, ang, s, e.len * 0.17, 0)]), { 'stroke-width': r2(Math.max(0.6, em * 0.01)) });
      add(layer, e.shape ? `mm-garden__leaf mm-garden__leaf--${e.shape}` : 'mm-garden__leaf', pathOf(leafPts(q, s), true));
      if (e.len * s > 14 && e.shape !== 'leaflet') {
        add(layer, 'mm-garden__vein', lineD(stalked ? [at(px, py, ang, s, e.len * 0.27, 0), at(px, py, ang, s, e.len * 0.6, e.len * 0.02), at(px, py, ang, s, e.len * 0.88, e.len * 0.01)]
          : [at(px, py, ang, s, e.len * 0.08, 0), at(px, py, ang, s, e.len * 0.45, e.len * 0.022), at(px, py, ang, s, e.len * 0.78, e.len * 0.03)]), { 'stroke-width': r2(Math.max(0.6, em * 0.006)) });
      }
    } else if (e.type === 'bud') {
      const layer = e.bed ? back : layerOf(e.x, e.y, e.r);
      for (const sh of bloomShapes({ ...e, ang, form: 'bud' }, px, py, x, mode, o, em)) emit(layer, sh);
    } else if (e.type === 'bloom') {
      const layer = e.bed ? back : layerOf(e.x, e.y, e.r);
      for (const sh of bloomShapes(e, px, py, x, mode, o, em)) emit(layer, sh);
    } else if (e.type === 'dot') {
      emit(layerOf(e.x, e.y, e.r), { cls: 'mm-garden__dot', circle: [px, py, e.r * s] });
    } else if (e.type === 'tuft') {
      const layer = layerOf(e.x + Math.cos(e.ang) * e.len / 2, e.y + Math.sin(e.ang) * e.len / 2, e.len * 0.3);
      const shape = e.shape === 'lance' || e.shape === 'frond' ? 'leaflet' : e.shape;
      for (let j = 0; j < e.n; j++) {
        const f = e.n > 1 ? j / (e.n - 1) - 0.5 : 0, len = e.len * (0.7 + 0.3 * (1 - 2 * Math.abs(f)));
        add(layer, `mm-garden__leaf mm-garden__leaf--${shape}`, pathOf(leafPts({ x: px, y: py, ang: ang + e.spread * f, len, wid: len * (shape === 'leaflet' ? 0.2 : 0.75), shape }, s), true));
      }
    } else if (e.type === 'via' || e.type === 'pad') {
      const layer = layerOf(e.x, e.y, e.r);
      if (e.type === 'via') {
        const c = doc.createElementNS(NS, 'circle');
        c.setAttribute('class', 'mm-garden__via');
        c.setAttribute('cx', String(r2(px))); c.setAttribute('cy', String(r2(py)));
        c.setAttribute('r', String(r2(e.r * 0.78 * s))); c.setAttribute('stroke-width', String(r2(e.r * 0.42 * s)));
        layer.append(c);
      } else {
        const hw = e.r * 1.05 * s, hh = e.r * 0.62 * s;
        add(layer, 'mm-garden__pad', pathOf([at(px, py, ang, 1, -hw, -hh), at(px, py, ang, 1, hw, -hh), at(px, py, ang, 1, hw, hh), at(px, py, ang, 1, -hw, hh)].flatMap((p, i, all) => { const q = all[(i + 1) % 4]; return [p, [p[0] + (q[0] - p[0]) * 0.2, p[1] + (q[1] - p[1]) * 0.2], [p[0] + (q[0] - p[0]) * 0.8, p[1] + (q[1] - p[1]) * 0.8]]; }), true));
      }
    } else if (e.type === 'shard') {
      const cx = e.x + Math.cos(e.ang) * e.len / 2, cy = e.y + Math.sin(e.ang) * e.len / 2;
      shardInto(layerOf(cx, cy, e.wid * 0.5), e, px, py, ang, mode === 'wither' ? s : out3(x), em);
    }
  }
  for (const layer of [back, front]) if (layer.dataset.used) { delete layer.dataset.used; defsInto(layer); }
}

// A broad leaf in its own frame: the leaf in its tone (deep teal or sage), one half in shade, a
// light midrib and side veins, a fine ink edge; it unfolds as it opens (its width trails its length).
function broadInto(layer, e, x, y, ang, s) {
  const loc = leafPts({ x: 0, y: 0, ang: 0, len: e.len, wid: e.wid, shape: 'broad', skew: e.skew, bend: e.bend }, 1);
  const d = pathOf(loc, true), tf = tfOf(x, y, rot(ang), scl(s, s * (0.45 + 0.55 * s)));
  const bow = (u) => 0.06 * e.len * Math.sin(Math.PI * u) * (e.bend ?? 1);
  emit(layer, { d, tf, paint: e.tone === 'deep' ? 'deep' : e.light ? 'sagelight' : 'sage', edge: Math.max(0.6, e.len * 0.008) });
  const mid = Array.from({ length: 13 }, (_, k) => { const u = 1 - k / 12; return [u * e.len, bow(u)]; });
  emit(layer, { d: pathOf(loc.slice(0, 17).concat(mid), true), tf, cls: 'mm-garden__b-shade' });
  emit(layer, { d: lineD(mid.slice(1, -1).reverse()), tf, cls: 'mm-garden__b-vein', attrs: lineW(Math.max(0.8, e.len * 0.012)) });
  let veins = '';
  const halfAt = (u, side) => 0.5 * e.wid * Math.sin(Math.PI * u ** 0.85) ** 0.8 * (1 - 0.08 * u) * (side > 0 ? 1 : (e.skew ?? 0.92));
  for (let j = 1; j <= 6; j++) {
    const u0 = 0.08 + j * 0.115, u1 = Math.min(0.97, u0 + 0.16);
    for (const side of [1, -1]) {
      const a = [u0 * e.len, bow(u0)], b = [u1 * e.len, bow(u1) + side * halfAt(u1, side) * 0.82];
      veins += curve(a, [(a[0] + b[0]) / 2 - e.len * 0.02, a[1] + side * halfAt(u0, side) * 0.55], b);
    }
  }
  emit(layer, { d: veins, tf, cls: 'mm-garden__b-vein-fine', attrs: lineW(Math.max(0.6, e.len * 0.006)) });
  emit(layer, { d, tf, cls: 'mm-garden__b-detail', attrs: lineW(Math.max(0.6, e.len * 0.007)) });
}

// A crystal shard: a hexagonal prism seen from the side, three faces in three tones of the accent,
// ridge lines in accentInk, grown along its axis from the base.
function shardInto(layer, e, x, y, ang, s, em) {
  if (s <= 0.001) return;
  const L = e.len * s, w = e.wid * (0.55 + 0.45 * s), shoulder = L * 0.72;
  const P = (u, v) => at(x, y, ang, 1, u, v);
  const xs = [-w / 2, -w / 6, w / 6, w / 2];
  const face = (a, b, shade) => {
    const d = lineD([P(0, xs[a]), P(shoulder + (Math.abs(xs[a]) < w / 3 ? L * 0.06 : 0), xs[a]), P(L, 0), P(shoulder + (Math.abs(xs[b]) < w / 3 ? L * 0.06 : 0), xs[b]), P(0, xs[b])]) + 'Z';
    add(layer, 'mm-garden__facet', d);
    if (shade) add(layer, `mm-garden__shade--${shade}`, d);
  };
  face(0, 1, 'a');
  face(2, 3, 'b');
  face(1, 2, null);
  if (L > 16) add(layer, 'mm-garden__edge', lineD([P(0, xs[1]), P(shoulder + L * 0.06, xs[1]), P(L, 0), P(shoulder + L * 0.06, xs[2]), P(0, xs[2])]), { 'stroke-width': r2(Math.max(0.6, em * 0.005)) });
}

// ---------------------------------------------------------------------------------------------

// A note for the story author in mm.warnings, once per text.
function warn(el, msg) { const w = el.ownerDocument.defaultView?.mm?.warnings; if (Array.isArray(w) && !w.includes(msg)) w.push(msg); }
const selectorOf = (el) => { const sc = el.closest('[data-scene]')?.getAttribute('data-scene'), slot = el.getAttribute('data-slot'); return sc && slot ? `[data-scene="${sc}"] [data-slot="${slot}"]` : 'a garden slot'; };

// The typed text at progress q: the slot's text moves into one block (it inherits the slot's
// measure, alignment and wrapping, so the lines, the shaping and every glyph stay where the plain
// text sets them, and it gives the clip one box) clipped to the characters whole by q, the one
// being typed cut at its share of its own width, measured from the laid-out glyph boxes; and a
// caret in the ink at the typing position. All of it is a function of q.
function typeInto(el, text, q, share) {
  const doc = el.ownerDocument;
  const span = doc.createElement('span');
  span.className = 'mm-garden__text mm-garden__text--typed';
  span.textContent = text;
  el.textContent = '';
  el.append(span);
  const node = span.firstChild, range = doc.createRange();
  const box = el.getBoundingClientRect(), k = el.offsetWidth ? box.width / el.offsetWidth : 1;
  const chars = [];
  for (let i = 0; i < text.length;) {
    const len = text.codePointAt(i) > 0xffff ? 2 : 1;
    range.setStart(node, i); range.setEnd(node, i + len);
    const r = range.getBoundingClientRect();
    chars.push({ x0: (r.left - box.left) / k, x1: (r.right - box.left) / k, y0: (r.top - box.top) / k, y1: (r.bottom - box.top) / k });
    i += len;
  }
  const times = typeReveal(chars.length, share);
  // the typed prefix, line by line: [x0, y0, x1, y1] in the slot's own pixels
  const lines = [];
  let edge = null;
  chars.forEach((c, j) => {
    const f = clamp01((q - times[j].at) / (times[j].done - times[j].at));
    if (f <= 0) return;
    const x1 = c.x0 + (c.x1 - c.x0) * f, line = lines.find((l) => Math.abs(l[1] - c.y0) < (c.y1 - c.y0) * 0.5);
    if (line) { line[2] = Math.max(line[2], x1); line[3] = Math.max(line[3], c.y1); } else lines.push([c.x0, c.y0, x1, c.y1]);
    edge = { x: x1, y0: c.y0, y1: c.y1 };
  });
  if (!edge) { const c = chars[0]; edge = { x: c.x0, y0: c.y0, y1: c.y1 }; }
  // the clip is laid on the block's own box
  const sb = span.getBoundingClientRect(), ox = (sb.left - box.left) / k, oy = (sb.top - box.top) / k;
  const d = lines.map(([x0, y0, x1, y1]) => `M${r2(x0 - ox)} ${r2(y0 - oy)}H${r2(x1 - ox)}V${r2(y1 - oy)}H${r2(x0 - ox)}Z`).join('');
  span.style.clipPath = `path('${d || 'M0 0Z'}')`;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const caret = doc.createElement('span');
  caret.className = 'mm-garden__caret';
  caret.setAttribute('aria-hidden', 'true');
  caret.style.left = `${r2(edge.x)}px`;
  caret.style.top = `${r2((edge.y0 + edge.y1) / 2)}px`;
  el.append(caret);
}

const seen = new WeakMap();
/** The plan last painted into a slot (for the wither exit and for tests). */
export const modelOf = (el) => seen.get(el) ?? null;

export default {
  name: 'garden',
  group: 'text',
  dur: 'hold',
  canvasText: true,
  params,
  at(el, p, ctx) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (el.textContent !== text) el.textContent = text;
    const set = settingsOf(ctx);
    const q = linear(ctx, p);
    // the text: a fade over the first TEXT_IN of the entrance, then the slot's own plain text
    if (set.text === 'fade' && q < TEXT_IN) {
      const span = el.ownerDocument.createElement('span');
      span.className = 'mm-garden__text';
      span.textContent = text;
      el.textContent = '';
      el.append(span);
      span.style.opacity = String(Math.round(out3(q / TEXT_IN) * 1000) / 1000);
    }
    // typed: the slot's text in one span, clipped to the characters typed so far, and a caret
    if (set.text === 'type' && q < set.typeShare) typeInto(el, text, q, set.typeShare);
    const model = plan(el, ctx);
    seen.set(el, model);
    const plants = new Set(model.elements.filter((e) => e.pts && !e.bridge).map((e) => e.id)).size;
    if (plants < 2) warn(el, `text/garden: ${selectorOf(el)} grows ${plants ? 'a single plant' : 'nothing'}; another seed, a higher density or a longer line grows more`);
    const after = ctx.u != null && ctx.d != null && Number.isFinite(ctx.u) ? Math.max(0, ctx.u - ctx.d) : 0;
    const sway = set.sway === 'breathe' && q >= 1 && after > 0 ? (TAU * after) / 3.2 : 0;
    paint(el, model, q, { sway, time: ctx.t ?? 0 });
  },
};
