// The code model behind text/code: a block of code whose steps are edits, drawn as a pure function of
// time. Pure (it runs in Node); the pattern turns the cells it returns into positioned spans.
//
//   expandTabs, lex          the text on a character grid, and its tokens in eight roles (lexed once, when the
//                            story's model is built, never per frame)
//   diffTokens               a patience diff over tokens (a common start and end first, then the tokens that
//                            occur once on each side as anchors, then the gaps); no moves, so a moved
//                            token is a delete and an insert, and a delete next to an insert is one change
//   parseSteps, applyStep    the steps: edit, append, prepend, insert, remove, replace, select, call
//   rangesIn, boxesOf        ranges by exact text or by line, and one box per line of a range
//   buildModel, stepTimes    every state of the code, with the diff between each two, and when each step runs
//   frameAt                  the cells at a second: kept tokens slide on a running cursor from where they
//                            were to where they go (arriving by 0.6 of the morph); a changed token's old text fades out over the first 0.4 of
//                            the morph, nothing shows from 0.4 to 0.6, the new text fades in over the last 0.4,
//                            drifting a quarter of the change in rows; what a selection leaves out is drawn at 0.2
//
// The code block as a scope of fragments that change at progress 0.5, the morph's windows and its vertical
// drift, the running cursor, the selection that dims the rest to 0.2, the ranges (half open, 0-based, found by
// exact text) with a box per line, the edit vocabulary, and the grid layout with tabs expanded, follow Motion
// Canvas's code component (MIT, Copyright (c) 2022 motion-canvas; see NOTICE). The lexer and the patience diff
// are written here from their descriptions: the upstream diff is adapted from another author's code and is not used.

export const TOKEN_ROLES = ['keyword', 'name', 'type', 'string', 'number', 'atom', 'comment', 'punct'];
const PALETTE = new Set(['ink', 'muted', 'accent', 'line']);
const DIM = 0.2;

/** Tabs to spaces, to the next tab stop of `width` columns. */
export function expandTabs(text, width = 2) {
  const w = Math.max(1, Math.floor(width) || 2);
  return String(text).split('\n').map((line) => {
    let out = '';
    for (const ch of line) out += ch === '\t' ? ' '.repeat(w - (Array.from(out).length % w)) : ch;
    return out;
  }).join('\n');
}

// ---- the lexer -------------------------------------------------------------------------------------

const WORDS = (s) => new Set(s.split(/\s+/).filter(Boolean));
const LANGS = {
  js: {
    keywords: WORDS('abstract as async await break case catch class const continue debugger default delete do else enum export extends finally for from function get if implements import in instanceof interface let new of private protected public readonly return set static super switch this throw try type typeof var void while with yield'),
    atoms: WORDS('true false null undefined NaN Infinity'),
    types: WORDS('string number boolean void any unknown never object bigint symbol'),
    line: ['//'], block: [['/*', '*/']], quotes: '"\'`',
  },
  py: {
    keywords: WORDS('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield self'),
    atoms: WORDS('True False None'),
    types: WORDS('int str float bool list dict set tuple bytes object'),
    line: ['#'], block: [], quotes: '"\'', triple: true,
  },
  sh: {
    keywords: WORDS('if then else elif fi for while do done case esac function in export local return'),
    atoms: WORDS(''), types: WORDS(''), line: ['#'], block: [], quotes: '"\'',
  },
  json: { keywords: WORDS(''), atoms: WORDS('true false null'), types: WORDS(''), line: [], block: [], quotes: '"' },
};
const ALIAS = { javascript: 'js', typescript: 'js', ts: 'js', jsx: 'js', tsx: 'js', python: 'py', bash: 'sh', shell: 'sh', zsh: 'sh' };
const langOf = (l) => LANGS[ALIAS[l] ?? l] ?? LANGS.js;
const OPERATOR = /[=+\-*/<>!&|?:%^~]/;
const IDENT_START = /[\p{L}_$]/u, IDENT = /[\p{L}\p{N}_$]/u;

/**
 * The tokens of a text, each { text, role }: `space` for white space, else one of the eight roles
 * (keyword, name, type, string, number, atom, comment, punct). Nothing is lost: the tokens joined are the text.
 * @param {string} text @param {string} [lang] js (also ts, jsx), py, sh, json; an unknown language is read as js
 */
export function lex(text, lang = 'js') {
  const L = langOf(lang);
  const s = String(text), n = s.length;
  const out = [];
  const push = (t, role) => { if (t) out.push({ text: t, role }); };
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (/\s/.test(c)) { let j = i + 1; while (j < n && /\s/.test(s[j])) j++; push(s.slice(i, j), 'space'); i = j; continue; }
    const lc = L.line.find((m) => s.startsWith(m, i));
    if (lc) { let j = s.indexOf('\n', i); if (j < 0) j = n; push(s.slice(i, j), 'comment'); i = j; continue; }
    const bc = L.block.find(([o]) => s.startsWith(o, i));
    if (bc) { let j = s.indexOf(bc[1], i + bc[0].length); j = j < 0 ? n : j + bc[1].length; push(s.slice(i, j), 'comment'); i = j; continue; }
    if (L.quotes.includes(c)) {
      const triple = L.triple && s.startsWith(c.repeat(3), i);
      const close = triple ? c.repeat(3) : c;
      let j = i + close.length;
      while (j < n) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s.startsWith(close, j)) { j += close.length; break; }
        if (s[j] === '\n' && !triple && c !== '`') break;
        j++;
      }
      push(s.slice(i, Math.min(j, n)), 'string'); i = Math.min(j, n); continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(s[i + 1] ?? '') && !(out.length && out.at(-1).role !== 'space' && /[\w)\]]/.test(out.at(-1).text.at(-1))))) {
      let j = i + 1;
      if (c === '0' && /[xXbBoO]/.test(s[j] ?? '')) { j++; while (j < n && /[\da-fA-F_]/.test(s[j])) j++; }
      else {
        while (j < n && /[\d_]/.test(s[j])) j++;
        if (s[j] === '.' && /\d/.test(s[j + 1] ?? '')) { j++; while (j < n && /[\d_]/.test(s[j])) j++; }
        if (/[eE]/.test(s[j] ?? '') && /[\d+-]/.test(s[j + 1] ?? '')) { j += 2; while (j < n && /\d/.test(s[j])) j++; }
      }
      push(s.slice(i, j), 'number'); i = j; continue;
    }
    if (IDENT_START.test(c)) {
      let j = i + 1; while (j < n && IDENT.test(s[j])) j++;
      const w = s.slice(i, j);
      const role = L.keywords.has(w) ? 'keyword' : L.atoms.has(w) ? 'atom' : L.types.has(w) || /^[A-Z][\p{L}\p{N}_$]*[a-z]/u.test(w) ? 'type' : 'name';
      push(w, role); i = j; continue;
    }
    if (OPERATOR.test(c)) { let j = i + 1; while (j < n && OPERATOR.test(s[j])) j++; push(s.slice(i, j), 'punct'); i = j; continue; }
    push(c, 'punct'); i++;
  }
  return out;
}

// ---- the diff --------------------------------------------------------------------------------------

/**
 * A patience diff of two token lists into hunks { same, a: [from, to), b: [from, to) } in order. Kept hunks are
 * equal text on both sides; a changed hunk has the tokens that went (a) and the tokens that came (b), either of
 * which may be empty. The start and end that the lists share are stripped first; in what is left, the tokens
 * that occur exactly once on each side anchor the longest run that keeps their order; the gaps between anchors
 * are diffed the same way. A token that moved is not matched with itself: it goes and comes back.
 * @param {string[]} a @param {string[]} b
 */
export function diffTokens(a, b) {
  const out = [];
  const emit = (same, a0, a1, b0, b1) => {
    if (a0 === a1 && b0 === b1) return;
    const last = out.at(-1);
    if (last && last.same === same && last.a[1] === a0 && last.b[1] === b0) { last.a[1] = a1; last.b[1] = b1; return; }
    out.push({ same, a: [a0, a1], b: [b0, b1] });
  };
  const gap = (a0, a1, b0, b1) => {
    if (a0 === a1 || b0 === b1) return emit(false, a0, a1, b0, b1);
    const na = new Map(), nb = new Map();
    for (let i = a0; i < a1; i++) na.set(a[i], na.has(a[i]) ? -1 : i);
    for (let j = b0; j < b1; j++) nb.set(b[j], nb.has(b[j]) ? -1 : j);
    const pairs = [];
    for (let i = a0; i < a1; i++) { const j = nb.get(a[i]); if (na.get(a[i]) === i && j !== undefined && j >= 0) pairs.push([i, j]); }
    if (!pairs.length) return emit(false, a0, a1, b0, b1);
    // the longest run of pairs that rises in b (patience sorting), by tails and back-pointers
    const tails = [], prev = new Array(pairs.length).fill(-1);
    pairs.forEach(([, j], k) => {
      let lo = 0, hi = tails.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (pairs[tails[mid]][1] < j) lo = mid + 1; else hi = mid; }
      if (lo) prev[k] = tails[lo - 1];
      tails[lo] = k;
    });
    const run = [];
    for (let k = tails.at(-1); k !== undefined && k >= 0; k = prev[k]) run.unshift(pairs[k]);
    let pa = a0, pb = b0;
    for (const [i, j] of run) { span(pa, i, pb, j); emit(true, i, i + 1, j, j + 1); pa = i + 1; pb = j + 1; }
    span(pa, a1, pb, b1);
  };
  function span(a0, a1, b0, b1) {
    let p = 0;
    while (a0 + p < a1 && b0 + p < b1 && a[a0 + p] === b[b0 + p]) p++;
    emit(true, a0, a0 + p, b0, b0 + p);
    a0 += p; b0 += p;
    let s = 0;
    while (a1 - s > a0 && b1 - s > b0 && a[a1 - 1 - s] === b[b1 - 1 - s]) s++;
    gap(a0, a1 - s, b0, b1 - s);
    emit(true, a1 - s, a1, b1 - s, b1);
  }
  span(0, a.length, 0, b.length);
  return out;
}

// ---- the steps -------------------------------------------------------------------------------------

const OPS = new Set(['edit', 'append', 'prepend', 'insert', 'remove', 'replace', 'select', 'call']);
const unquote = (s) => { const m = /^(["'`])([\s\S]*)\1$/.exec(s.trim()); return m ? m[2] : null; };

/**
 * The steps of a code beat: blocks separated by a line of three dashes. A block's first line is the op and its
 * argument (and `@seconds` to pin the second it starts at), the rest is the code that goes with it:
 *   edit | append | prepend           the code that follows is the new code, the code to add at the end, or at the start
 *   insert L3 | insert L3:7           the code that follows goes in before line 3 (1-based), or into line 3 at column 7 (0-based)
 *   remove L2-3 | remove "text"       what goes: lines (1-based), or the exact text (the first match; add * after it for every match)
 *   replace "old" => "new"            the exact text and what replaces it (or the code that follows replaces it)
 *   select L2-3 | select "text" | select none      dim all but this range; none clears it
 *   call "text" | label               a box on the range with a label; call none clears it
 */
export function parseSteps(src) {
  const text = String(src ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  return text.split(/\n---[ \t]*(?:\n|$)/).map((block) => {
    const nl = block.indexOf('\n');
    let head = (nl < 0 ? block : block.slice(0, nl)).trim();
    const body = nl < 0 ? '' : block.slice(nl + 1).replace(/\n+$/, '');
    let at = null;
    const pin = /\s@(\d+(?:\.\d+)?)\s*$/.exec(head);
    if (pin) { at = Number(pin[1]); head = head.slice(0, pin.index).trim(); }
    const op = head.split(/\s+/, 1)[0];
    if (!OPS.has(op)) throw new Error(`unknown op "${op}": use edit, append, prepend, insert, remove, replace, select or call`);
    const arg = head.slice(op.length).trim();
    const step = { op, at, text: body };
    if (op === 'replace') {
      const m = /^(["'`])([\s\S]*?)\1(?:\s*=>\s*(["'`])([\s\S]*)\3)?$/.exec(arg);
      if (!m) throw new Error('replace needs the exact text in quotes: replace "old" => "new"');
      step.find = m[2];
      step.text = m[3] ? m[4] : body;
    } else if (op === 'call') {
      const k = arg.lastIndexOf(' | ');
      step.range = (k < 0 ? arg : arg.slice(0, k)).trim();
      step.label = k < 0 ? '' : arg.slice(k + 3).trim();
      if (!step.range) throw new Error('call needs a range: call "text" | label');
    } else if (op === 'select' || op === 'remove' || op === 'insert') {
      step.range = arg;
      if (!arg) throw new Error(`${op} needs a range (L2, L2-3, "text")`);
    }
    return step;
  });
}

const lineCol = (code, index) => { const before = code.slice(0, index).split('\n'); return [before.length - 1, before.at(-1).length]; };
const indexOfLC = (code, line, col) => { const ls = code.split('\n'); let i = 0; for (let k = 0; k < line && k < ls.length; k++) i += ls[k].length + 1; return i + Math.min(col, (ls[line] ?? '').length); };

/**
 * Ranges by spec, as half-open [[line, column], [line, column]] pairs, 0-based (a column of Infinity is the end of its
 * line): `"text"` the exact text (the first match; `"text" *` every match), `L2` one line, `L2-4` lines, `L2:5+3` three
 * columns from column 5 of line 2 (lines are 1-based in a spec, columns 0-based). `none` is null (no range).
 */
export function rangesIn(spec, code) {
  const s = String(spec ?? '').trim();
  if (s === 'none') return null;
  const q = /^(["'`])([\s\S]*)\1(\s*\*)?$/.exec(s);
  if (q) {
    const out = [];
    if (!q[2]) return out;
    for (let i = code.indexOf(q[2]); i >= 0; i = code.indexOf(q[2], i + q[2].length)) {
      out.push([lineCol(code, i), lineCol(code, i + q[2].length)]);
      if (!q[3]) break;
    }
    return out;
  }
  let m = /^L(\d+)-(\d+)$/.exec(s);
  if (m) return [[[Number(m[1]) - 1, 0], [Number(m[2]) - 1, Infinity]]];
  m = /^L(\d+)$/.exec(s);
  if (m) return [[[Number(m[1]) - 1, 0], [Number(m[1]) - 1, Infinity]]];
  m = /^L(\d+):(\d+)\+(\d+)$/.exec(s);
  if (m) return [[[Number(m[1]) - 1, Number(m[2])], [Number(m[1]) - 1, Number(m[2]) + Number(m[3])]]];
  return [];
}

/** One box per line of each range, { row, from, to } in columns, clipped to the line. */
export function boxesOf(ranges, code) {
  const lines = code.split('\n');
  const out = [];
  for (const [[l0, c0], [l1, c1]] of ranges ?? []) {
    for (let l = l0; l <= Math.min(l1, lines.length - 1); l++) {
      const len = Array.from(lines[l]).length;
      const from = l === l0 ? Math.min(c0, len) : 0;
      const to = l === l1 ? Math.min(c1, len) : len;
      if (to > from) out.push({ row: l, from, to });
    }
  }
  return out;
}

const within = (ranges, row, col) => ranges.some(([[l0, c0], [l1, c1]]) => ((row === l0 && col >= c0) || row > l0) && ((row === l1 && col < c1) || row < l1));

/** The code after one step. */
export function applyStep(code, step) {
  const lines = code.split('\n');
  switch (step.op) {
    case 'edit': return step.text;
    case 'append': return `${code.replace(/\n+$/, '')}\n${step.text}`;
    case 'prepend': return `${step.text}\n${code}`;
    case 'insert': {
      const p = /^L(\d+)(?::(\d+))?$/.exec(step.range.trim());
      if (!p) throw new Error(`insert needs a place: L3 (before line 3) or L3:7 (line 3, column 7), not "${step.range}"`);
      const line = Math.min(Number(p[1]), lines.length + 1) - 1;
      if (p[2] === undefined) { lines.splice(line, 0, ...step.text.split('\n')); return lines.join('\n'); }
      const at = indexOfLC(code, line, Number(p[2]));
      return code.slice(0, at) + step.text + code.slice(at);
    }
    case 'remove': {
      const r = rangesIn(step.range, code);
      if (!r || !r.length) return code;
      const [[l0, c0], [l1, c1]] = r[0];
      if (/^L\d+(-\d+)?$/.test(step.range.trim())) { lines.splice(l0, Math.min(l1, lines.length - 1) - l0 + 1); return lines.join('\n'); }
      const a = indexOfLC(code, l0, c0), b = Number.isFinite(c1) ? indexOfLC(code, l1, c1) : indexOfLC(code, l1, Infinity);
      return code.slice(0, a) + code.slice(b);
    }
    case 'replace': {
      const i = code.indexOf(step.find);
      return i < 0 ? code : code.slice(0, i) + step.text + code.slice(i + step.find.length);
    }
    default: return code;
  }
}

// ---- the model -------------------------------------------------------------------------------------

function layout(tokens) {
  let row = 0, col = 0;
  return tokens.map((t) => {
    const at = { ...t, row, col };
    for (const ch of t.text) { if (ch === '\n') { row++; col = 0; } else col++; }
    return at;
  });
}
const rowsOf = (text) => text.split('\n').length;
const colsOf = (text) => Math.max(...text.split('\n').map((l) => Array.from(l).length));
const newRows = (toks) => toks.reduce((n, t) => n + (t.text.split('\n').length - 1), 0);
// where a token index sits in the flow: the start of that token, or the end of the text when it is past the last
const pointAt = (toks, end, i) => {
  if (i < toks.length) return { row: toks[i].row, col: toks[i].col };
  const l = toks[toks.length - 1];
  if (!l) return { row: 0, col: 0 };
  const parts = l.text.split('\n');
  return parts.length > 1 ? { row: l.row + parts.length - 1, col: Array.from(parts.at(-1)).length } : { row: l.row, col: l.col + Array.from(l.text).length };
};

/**
 * The model of a code beat: the code at each step (state 0 is the beat's own code), the lexed tokens with
 * their place on the grid, the hunks between each two states, and the size of the largest. Built once.
 * @param {string} initial @param {string} stepsSrc @param {{ lang?: string, tab?: number }} [opts]
 */
export function buildModel(initial, stepsSrc, { lang = 'js', tab = 2 } = {}) {
  const steps = parseSteps(stepsSrc);
  const norm = (c) => expandTabs(String(c).replace(/\r\n?/g, '\n'), tab);
  const states = [];
  let code = norm(initial), sel = null, call = null;
  const keep = (extra) => states.push(extra);
  const make = (c, sl, cl) => {
    const tokens = layout(lex(c, lang));
    const selRanges = sl ? rangesIn(sl, c) : null;
    const callout = cl ? { label: cl.label, boxes: boxesOf(rangesIn(cl.range, c), c), range: cl.range } : null;
    return { code: c, tokens, sel: sl, selRanges: selRanges && selRanges.length ? selRanges : null, call: callout && callout.boxes.length ? callout : null };
  };
  keep(make(code, null, null));
  for (const st of steps) {
    code = norm(applyStep(code, st));
    if (st.op === 'select') sel = st.range.trim() === 'none' ? null : st.range;
    if (st.op === 'call') call = st.range.trim() === 'none' ? null : { range: st.range, label: st.label };
    keep(make(code, sel, call));
  }
  const trans = steps.map((_, i) => {
    const A = states[i], B = states[i + 1];
    return diffTokens(A.tokens.map((t) => t.text), B.tokens.map((t) => t.text)).map((h) => ({
      ...h,
      startA: pointAt(A.tokens, A.code, h.a[0]), startB: pointAt(B.tokens, B.code, h.b[0]),
      rowsA: newRows(A.tokens.slice(h.a[0], h.a[1])), rowsB: newRows(B.tokens.slice(h.b[0], h.b[1])),
    }));
  });
  return { steps, states, trans, rows: Math.max(...states.map((s) => rowsOf(s.code))), cols: Math.max(...states.map((s) => colsOf(s.code))), lang };
}

/**
 * When each step runs, in seconds into the beat: [{ start, len }]. After the `intro` the steps share the rest of the
 * entrance `d` equally, each starting a third of its share in (so the previous change is read first), unless a step is
 * pinned with `@seconds`. A morph lasts `morph` seconds or seven tenths of its share, whichever is less, and no step
 * starts before the one before it has finished or ends after `d`.
 */
export function stepTimes(model, d, { intro = 0, morph = 0.5 } = {}) {
  const n = model.steps.length;
  const share = n ? Math.max(0, (d - intro) / n) : 0;
  const out = [];
  let free = intro;
  model.steps.forEach((st, i) => {
    const len = Math.max(0, Math.min(morph, share * 0.7 || morph));
    const want = st.at ?? intro + i * share + share * 0.3;
    const start = Math.max(free, Math.min(want, d - len));
    out.push({ start, len });
    free = start + len;
  });
  return out;
}

// ---- the frame -------------------------------------------------------------------------------------

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
// the windows of a morph: the old text out over the first 0.4, nothing, the new text in over the last 0.4
// a value within a billionth of an end is that end, so a window's edge is exactly 0 or 1 whatever the float left over
const snap = (x) => (x < 1e-9 ? 0 : x > 1 - 1e-9 ? 1 : x);
const fadeOut = (q) => snap(clamp01((0.4 - q) / 0.4));
const fadeIn = (q) => snap(clamp01((q - 0.6) / 0.4));

/** A role spec as css: `accent`, `muted/70` (a tint of one role). Only the palette roles; anything else is null. */
export function tintOf(spec) {
  const m = /^\s*([a-zA-Z]+)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*$/.exec(String(spec ?? ''));
  if (!m || !PALETTE.has(m[1])) return null;
  const pct = m[2] === undefined ? null : Number(m[2]);
  return pct != null && pct > 0 && pct < 100 ? `color-mix(in srgb, var(--c-${m[1]}) ${pct}%, transparent)` : `var(--c-${m[1]})`;
}

/**
 * The cells at second `u` of the beat: { text, role, row, col, alpha } for every piece of ink (rows and columns are
 * grid units, fractional while a token slides), and the call-out now showing. `times` is stepTimes(); `ease(name, p)`
 * is the kit's; `intro` is the length of the first reveal (each line fades in over its part of it).
 * @returns {{ cells: object[], call: object|null, calls: object[], rows: number, cols: number }}
 */
export function frameAt(model, u, times, { ease = (_n, p) => p, intro = 0 } = {}) {
  const cells = [];
  const calls = [];
  const out = () => ({ cells, call: calls.at(-1) ?? null, calls, rows: model.rows, cols: model.cols });
  const pushCells = (toks, from, to, place, fade, selOf) => {
    for (let k = from; k < to; k++) {
      const t = toks[k];
      if (t.role === 'space') continue;
      const parts = t.text.split('\n');
      parts.forEach((part, pi) => {
        if (!part) return;
        const chars = Array.from(part);
        const { row, col } = place(t, pi);
        // a run per stretch of equal selection, so a range that cuts a token cuts its ink
        let start = 0, cur = selOf(t, pi, 0);
        for (let c = 1; c <= chars.length; c++) {
          const v = c < chars.length ? selOf(t, pi, c) : null;
          if (c === chars.length || v !== cur) {
            cells.push({ text: chars.slice(start, c).join(''), role: t.role, row, col: col + start, alpha: fade * (DIM + (1 - DIM) * cur) });
            start = c; cur = v;
          }
        }
      });
    }
  };
  const selIn = (state) => (state.selRanges ? (t, pi, c) => (within(state.selRanges, t.row + pi, (pi ? 0 : t.col) + c) ? 1 : 0) : () => 1);
  const stateCalls = (s, alpha) => { if (s.call && alpha > 0) calls.push({ label: s.call.label, boxes: s.call.boxes, alpha }); };

  let i = -1;
  times.forEach((t, k) => { if (u >= t.start) i = k; });
  if (i >= 0 && u >= times[i].start + times[i].len - 1e-9) {
    // the step has finished: the next state, at rest (the steps after it have not started)
    const s = model.states[i + 1];
    pushCells(s.tokens, 0, s.tokens.length, (t, pi) => ({ row: t.row + pi, col: pi ? 0 : t.col }), 1, selIn(s));
    stateCalls(s, 1);
    return out();
  }
  if (i < 0) {
    const s = model.states[0];
    const win = intro > 0 ? intro * 0.5 : 0;
    const fade = (row) => (intro > 0 ? clamp01(ease('enter', clamp01((u - (row / Math.max(1, model.rows)) * win) / win))) : 1);
    for (let k = 0; k < s.tokens.length; k++) {
      const t = s.tokens[k];
      if (t.role === 'space') continue;
      pushCells(s.tokens, k, k + 1, (tk, pi) => ({ row: tk.row + pi, col: pi ? 0 : tk.col }), fade(t.row), selIn(s));
    }
    stateCalls(s, fade(0) >= 1 ? 1 : 0);
    return out();
  }
  // inside the morph of step i
  const step = model.steps[i];
  const A = model.states[i], B = model.states[i + 1];
  const q = clamp01(ease('move', clamp01((u - times[i].start) / (times[i].len || 1))));
  const mirrored = Math.abs(q - 0.5) * 2;
  // the running cursor gets there by 0.6, where the new text starts to show, so new ink never lands on ink still on its way
  const qs = clamp01(q / 0.6);
  const selA = selIn(A), selB = selIn(B);
  for (const h of model.trans[i]) {
    const S = { row: lerp(h.startA.row, h.startB.row, qs), col: lerp(h.startA.col, h.startB.col, qs) };
    const placeOf = (start, S2, dy) => (t, pi) => {
      const dr = t.row + pi - start.row;
      return { row: S2.row + dr + dy, col: dr === 0 ? S2.col + t.col - start.col : pi ? 0 : t.col };
    };
    if (h.same) {
      const shift = placeOf(h.startA, S, 0);
      for (let k = h.a[0]; k < h.a[1]; k++) {
        const t = A.tokens[k];
        // the same char sits at the same offset in the hunk on both sides: read its selection in each layout, and blend
        const idx = k - h.a[0];
        const tb = B.tokens[h.b[0] + idx];
        const sel = (tk, pi, c) => lerp(selA(tk, pi, c), selB(tb, pi, c), q);
        pushCells(A.tokens, k, k + 1, shift, 1, sel);
      }
    } else {
      const bigger = h.rowsB > h.rowsA ? 1 : -1;
      const isBefore = q < 0.5 ? 1 : -1;
      const dy = h.rowsA === h.rowsB ? 0 : (Math.abs(h.rowsB - h.rowsA) / (bigger * isBefore * 4)) * (1 - mirrored);
      if (q < 0.5) pushCells(A.tokens, h.a[0], h.a[1], placeOf(h.startA, S, dy), fadeOut(q), selA);
      else pushCells(B.tokens, h.b[0], h.b[1], placeOf(h.startB, S, dy), fadeIn(q), selB);
    }
  }
  // call-outs: one that is the same on both sides stays; otherwise the old goes out and the new comes in
  const same = A.call && B.call && A.call.label === B.call.label && JSON.stringify(A.call.boxes) === JSON.stringify(B.call.boxes);
  if (same) stateCalls(B, 1);
  else if (step.op === 'call') { stateCalls(A, 1 - q); stateCalls(B, q); }
  else { stateCalls(A, fadeOut(q)); stateCalls(B, fadeIn(q)); }
  return out();
}
