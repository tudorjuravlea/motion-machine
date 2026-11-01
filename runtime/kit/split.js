// The shared text splitter. A pattern that animates a headline by line, word or letter asks for
// its units here instead of cutting the text on white space: words come from Intl.Segmenter (with a
// white-space fallback), closing punctuation is glued to the word before it and opening
// punctuation to the word after, letters are graphemes (an accent, an emoji with a skin tone or a
// joined family stays one unit), and lines are read from the laid-out words, so a line reveal
// follows the real wrapping in the brand's own face at every format.
//
// The units are plain DOM spans with indexes in custom properties (--line, --word, --char), an
// optional overflow-clip mask around each unit, a twin of each unit for a slot-roll, and (for a
// deck) the original text kept in a visually hidden copy with the fragments aria-hidden.
// The pure part (wordsOf, graphemesOf, lineIndexes) runs in Node; splitText needs a laid-out DOM.
// Look: runtime/kit/split.css (a pattern's css imports it).
//
// Word and grapheme segmentation, the glueing of punctuation, the space kept as a no-break space,
// the line rule (a word lower by more than half its height starts a line), the mask and the
// slot-roll twin, and the hidden accessible copy follow anime.js's text splitter (MIT, Copyright
// (c) 2025 Julian Garnier; see NOTICE), rewritten for plain text, with the second line test from
// the idea that a baseline shift is not a new line.

export const NBSP = ' ';

const segmenters = new Map();
const segmenter = (granularity, lang) => {
  if (typeof Intl === 'undefined' || !Intl.Segmenter) return null;
  const key = `${granularity}:${lang || ''}`;
  if (!segmenters.has(key)) {
    let s = null;
    try { s = new Intl.Segmenter(lang || undefined, { granularity }); } catch { s = new Intl.Segmenter(undefined, { granularity }); }
    segmenters.set(key, s);
  }
  return segmenters.get(key);
};

/** White space collapsed to single spaces, trimmed. */
export const plainOf = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const isSpace = (s) => /^\s+$/.test(s);
// some browsers do not call a number a word
const wordLike = (seg) => seg.isWordLike || seg.segment === ' ' || (seg.segment.trim() !== '' && !Number.isNaN(+seg.segment));

// the fallback for a runtime with no Intl.Segmenter: one cluster is a base followed by its marks,
// joiners, variation selectors and skin-tone modifiers; two regional indicators are one flag
const MARK = /^[\p{M}‍️\u{1F3FB}-\u{1F3FF}]$/u;
const REGIONAL = /^[\u{1F1E6}-\u{1F1FF}]$/u;
function clusters(text) {
  const out = [];
  const cps = Array.from(text);
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i];
    const last = out[out.length - 1];
    if (last !== undefined && (MARK.test(c) || last.endsWith('‍'))) out[out.length - 1] = last + c;
    else if (last !== undefined && REGIONAL.test(c) && REGIONAL.test(Array.from(last)[0]) && Array.from(last).length === 1) out[out.length - 1] = last + c;
    else out.push(c);
  }
  return out;
}

/**
 * The text's characters as the reader sees them: a letter with its accent, an emoji with its skin
 * tone, a joined family, a flag, each one unit.
 * @param {string} text @param {string} [lang] a BCP-47 tag @param {{ fallback?: boolean }} [opts]
 */
export function graphemesOf(text, lang, opts = {}) {
  const t = String(text ?? '');
  const seg = opts.fallback ? null : segmenter('grapheme', lang);
  return seg ? Array.from(seg.segment(t), (x) => x.segment) : clusters(t);
}

/**
 * The words of a text with their trailing space: [{ text, space }]. `space` is true when white
 * space followed the word in the source. With `spaces: 'nbsp'` the space is appended to the word
 * as a no-break space (so a unit carries its own space) and `space` is false.
 * @param {string} text @param {string} [lang] @param {{ fallback?: boolean, spaces?: 'natural'|'nbsp' }} [opts]
 */
export function wordRuns(text, lang, opts = {}) {
  const t = plainOf(text);
  if (!t) return [];
  const seg = opts.fallback ? null : segmenter('word', lang);
  const segs = seg
    ? Array.from(seg.segment(t), (x) => ({ segment: x.segment, isWordLike: x.isWordLike }))
    : t.split(/(\s+)/).filter((x) => x !== '').map((x) => ({ segment: x, isWordLike: !isSpace(x) }));
  // join segments into pieces: a word-like segment after a word-like one starts a new piece; marks that
  // are not words stick to the piece before them (closing) or, when it is a space, start one that the next word joins (opening)
  const pieces = [];
  let prev = null;
  for (const s of segs) {
    const wl = wordLike(s);
    if (!prev || (wl && wordLike(prev))) pieces.push(s.segment);
    else {
      const last = pieces.length - 1;
      if (!/\s/.test(pieces[last]) && !/\s/.test(s.segment)) pieces[last] += s.segment;
      else pieces.push(s.segment);
    }
    prev = s;
  }
  const out = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (isSpace(p)) { if (out.length) out[out.length - 1].space = true; continue; }
    out.push({ text: p, space: false });
  }
  if (opts.spaces === 'nbsp') for (const r of out) if (r.space) { r.text += NBSP; r.space = false; }
  return out;
}

/** The words of a text, punctuation glued: ['Hello,', 'world!']. */
export const wordsOf = (text, lang, opts) => wordRuns(text, lang, opts).map((r) => r.text);

/**
 * Which line each word is on, from the words' laid-out boxes in reading order ({ top, left, width,
 * height }). A word starts a new line when it sits lower than the word before by more than half its
 * height and its left edge is back inside that word's span (not further right: a word lowered by a
 * baseline shift stays on its line). Read offsets, not transformed rects, so a camera move or a
 * rotated ancestor changes nothing.
 */
export function lineIndexes(boxes) {
  const out = [];
  let line = 0;
  for (let i = 0; i < boxes.length; i++) {
    if (i) {
      const p = boxes[i - 1], b = boxes[i];
      if (b.top - p.top > b.height * 0.5 && b.left < p.left + p.width - 1) line++;
    }
    out.push(line);
  }
  return out;
}

const SIDES = { top: ['top', 'bottom'], bottom: ['top', 'top'], left: ['left', 'left'], right: ['left', 'left'] };
const make = (doc, kind, tag = 'span') => { const e = doc.createElement(tag); e.className = `mm-split__${kind}`; return e; };
const setIdx = (e, name, i) => { e.style.setProperty(`--${name}`, String(i)); e.dataset[name] = String(i); };

/**
 * Splits an element's text into units. The element's children are replaced; the kit restores them on
 * the next seek, so a pattern that splits does it on every draw (the result depends on the text and the
 * laid-out width only).
 *
 * options: `words` (default true; words are always built, they hold the letters and keep a word whole),
 * `chars` (default false), `lines` (false; `true` or 'wrap' wraps each line in a block span, 'vars' only
 * writes --line), `spaces` ('natural' keeps the real spaces between words; 'nbsp' ends each word with a
 * no-break space), `mask` (false, 'lines', 'words' or 'chars': an overflow-clip box around each unit
 * of that kind), `clone` (false, 'top', 'bottom', 'left' or 'right': each letter, or each word when
 * there are no letters, gets an inert twin beside it, so a translate of 100 % rolls one out and the other in; it
 * implies a mask), `accessible` (false; true keeps the original text in a visually hidden first child and
 * marks the fragments aria-hidden), `lang`, `text` (instead of the element's text).
 * Returns { text, lines, words, chars }: the unit elements to animate (inside any mask), in reading order;
 * `masks` holds the clip boxes by kind.
 * @param {HTMLElement} el @param {object} [options]
 */
export function splitText(el, options = {}) {
  const o = { chars: false, lines: false, spaces: 'natural', mask: false, clone: false, accessible: false, ...options };
  const doc = el.ownerDocument;
  const text = plainOf(o.text ?? el.textContent);
  const lang = o.lang ?? el.closest?.('[lang]')?.getAttribute('lang') ?? undefined;
  const lineMode = o.lines === true ? 'wrap' : o.lines || false;
  const cloneKind = o.clone ? (o.chars ? 'chars' : 'words') : null;
  const maskKind = (k) => (o.mask === k || cloneKind === k ? k : null);
  const res = { text, lines: [], words: [], chars: [], masks: { lines: [], words: [], chars: [] } };
  // lines are blocks that do not wrap, so the slot would shrink to its widest line: keep the box it had
  if (lineMode === 'wrap' && el.offsetWidth) el.style.minWidth = `${el.offsetWidth}px`;
  el.textContent = '';
  if (!text) return res;

  const boxed = (kind, unit) => {
    if (!maskKind(kind)) return unit;
    const m = make(doc, 'mask');
    if (kind === 'lines') m.classList.add('mm-split__mask--block');
    m.append(unit);
    res.masks[kind].push(m);
    return m;
  };
  const unitOf = (kind, label) => {
    const u = make(doc, kind === 'chars' ? 'char' : 'word');
    if (cloneKind === kind) {
      u.classList.add('mm-split__rolls');
      const face = make(doc, 'face'); face.textContent = label;
      const twin = make(doc, 'twin');
      twin.textContent = label;
      twin.setAttribute('inert', '');
      twin.setAttribute('aria-hidden', 'true');
      twin.classList.add(`mm-split__twin--${o.clone}`);
      u.append(face, twin);
    } else u.textContent = label;
    return u;
  };

  const runs = wordRuns(text, lang, { spaces: o.spaces });
  const flat = [];   // top-level nodes in order: a word (or its mask), or the space text node between words
  const tops = [];   // the word-level nodes whose boxes decide the lines
  let ci = 0;
  runs.forEach((r, wi) => {
    const w = make(doc, 'word');
    setIdx(w, 'word', wi);
    if (o.chars) {
      const gs = graphemesOf(r.text, lang);
      gs.forEach((g) => {
        const c = unitOf('chars', g);
        setIdx(c, 'char', ci); setIdx(c, 'word', wi);
        ci++;
        res.chars.push(c);
        w.append(boxed('chars', c));
      });
    } else if (cloneKind === 'words') {
      w.classList.add('mm-split__rolls');
      w.append(...unitOf('words', r.text).childNodes);
    } else w.textContent = r.text;
    res.words.push(w);
    const top = boxed('words', w);
    tops.push(top);
    flat.push(top);
    if (r.space) flat.push(doc.createTextNode(' '));
  });
  el.append(...flat);

  let lineOf = null;
  if (lineMode) {
    // read every box first, write after: one layout
    const boxes = tops.map((n) => ({ top: n.offsetTop, left: n.offsetLeft, width: n.offsetWidth, height: n.offsetHeight }));
    lineOf = lineIndexes(boxes);
  }
  if (lineMode === 'wrap') {
    const lines = [];
    tops.forEach((n, i) => {
      if (!lines[lineOf[i]]) lines[lineOf[i]] = [];
      lines[lineOf[i]].push(n);
    });
    el.textContent = '';
    lines.forEach((nodes, li) => {
      const l = make(doc, 'line');
      setIdx(l, 'line', li);
      nodes.forEach((n, k) => { if (k) l.append(' '); l.append(n); });
      res.lines.push(l);
      el.append(boxed('lines', l));
    });
    // a space at a line end is gone with the line; a space a word owned between two words on one line was kept above
  }
  if (lineOf) tops.forEach((n, i) => {
    const w = res.words[i];
    const targets = [w, ...w.querySelectorAll('.mm-split__char')];
    for (const e of targets) setIdx(e, 'line', lineOf[i]);
  });

  el.style.setProperty('--lines', String(lineOf ? lineOf[lineOf.length - 1] + 1 : 0));
  el.style.setProperty('--words', String(res.words.length));
  el.style.setProperty('--chars', String(res.chars.length));

  if (o.accessible) {
    const sr = make(doc, 'sr');
    sr.textContent = text;
    el.prepend(sr);
    for (const e of el.children) if (e !== sr) e.setAttribute('aria-hidden', 'true');
  }
  return res;
}

/**
 * The units a split left in an element, or null when it holds none: a pattern that draws twice on one
 * seek (an entrance, then an emphasis) reuses them instead of splitting again.
 */
export function unitsOf(el) {
  const words = [...el.querySelectorAll('.mm-split__word')];
  if (!words.length) return null;
  return { lines: [...el.querySelectorAll('.mm-split__line')], words, chars: [...el.querySelectorAll('.mm-split__char')] };
}

/** The side words an element's twin sits on, for a pattern that rolls: [the axis the unit translates on, the sign that brings the twin in]. */
export const rollOf = (side) => ({ top: ['y', 1], bottom: ['y', -1], left: ['x', 1], right: ['x', -1] }[side] ?? ['y', -1]);
