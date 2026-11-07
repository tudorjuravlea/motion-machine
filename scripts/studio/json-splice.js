// scripts/studio/json-splice.js: format-keeping JSON patches. Parses
// JSON with byte ranges and applies an RFC 6902 patch (add, remove, replace, move) to the text so
// that only the edited bytes change: a replace rewrites the value's bytes, an add copies its
// siblings' style, a remove takes one adjoining comma. JSON.parse of the result always equals the
// patch applied to the parsed value. Pure: no node: module, no package; runs in Node and the browser.

const fail = (i, what, extra) => { const e = new SyntaxError(`invalid JSON at offset ${i}: ${what}`); e.offset = i; Object.assign(e, extra); throw e; };
/** Sets own key `k` as JSON.parse does: `__proto__` too is a plain own key, never the prototype. */
const put = (o, k, v) => { if (k === '__proto__') Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true }); else o[k] = v; };
const NUM = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/** Parses `text` into a tree of nodes with byte offsets (`end` exclusive). Throws with `offset` on invalid JSON,
 *  and on a duplicate key (with `duplicate`, the key): an edit could not say which one it means. */
export function parseRanges(text) {
  let i = 0;
  const ws = () => { while (i < text.length && (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t')) i++; };
  const str = () => {
    const start = i++;
    while (i < text.length && text[i] !== '"') { if (text[i] === '\\') i++; i++; }
    if (i >= text.length) fail(start, 'unterminated string');
    i++;
    let value;
    try { value = JSON.parse(text.slice(start, i)); } catch { fail(start, 'bad string'); }
    return { type: 'string', start, end: i, value };
  };
  const val = () => {
    ws();
    const c = text[i], start = i;
    if (c === '{') {
      i++; ws();
      const members = [], seen = new Set();
      if (text[i] === '}') i++;
      else for (;;) {
        ws();
        if (text[i] !== '"') fail(i, 'expected a key');
        const k = str(); ws();
        if (seen.has(k.value)) fail(k.start, `duplicate key ${JSON.stringify(k.value)}`, { duplicate: k.value });
        seen.add(k.value);
        if (text[i] !== ':') fail(i, 'expected ":"');
        i++;
        const v = val();
        members.push({ key: k.value, keyStart: k.start, keyEnd: k.end, start: k.start, end: v.end, value: v });
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; break; }
        fail(i, 'expected "," or "}"');
      }
      const value = {};
      for (const m of members) put(value, m.key, m.value.value);
      return { type: 'object', start, end: i, value, members };
    }
    if (c === '[') {
      i++; ws();
      const items = [];
      if (text[i] === ']') i++;
      else for (;;) {
        items.push(val()); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; break; }
        fail(i, 'expected "," or "]"');
      }
      return { type: 'array', start, end: i, value: items.map((n) => n.value), items };
    }
    if (c === '"') return str();
    for (const [w, v] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(w, i)) { i += w.length; return { type: v === null ? 'null' : 'boolean', start, end: i, value: v }; }
    }
    NUM.lastIndex = i;
    const m = NUM.exec(text);
    if (!m || !m[0].length) fail(i, i >= text.length ? 'unexpected end' : `unexpected "${c}"`);
    i += m[0].length;
    return { type: 'number', start, end: i, value: Number(m[0]) };
  };
  const root = val(); ws();
  if (i < text.length) fail(i, 'trailing characters');
  return root;
}

// ---- pointers and the value side ----
const tokens = (ptr) => {
  if (ptr === '') return [];
  if (typeof ptr !== 'string' || ptr[0] !== '/') throw new Error(`patch: bad pointer "${ptr}"`);
  return ptr.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
};
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const isIndex = (k) => /^(0|[1-9]\d*)$/.test(k);
const OPS = new Set(['add', 'remove', 'replace', 'move']);

/** Where `v` holds something JSON cannot (undefined, NaN, ±Infinity, a function…): its pointer, '' for
 *  `v` itself; null when `v` is plain JSON. */
export function badJSON(v, at = '') {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? null : at;
  if (typeof v !== 'object') return at;
  for (const [k, x] of Array.isArray(v) ? v.entries() : Object.entries(v)) { const r = badJSON(x, `${at}/${k}`); if (r !== null) return r; }
  return null;
}
/** Whether `a` and `b` are the same JSON value, whatever their keys' order. */
export function sameJSON(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => Object.hasOwn(b, k) && sameJSON(a[k], b[k]));
}
/** Refuses a patch op that would write a value JSON cannot hold, or remove the whole document. */
function checkOp(op) {
  if (!OPS.has(op.op)) throw new Error(`patch: unsupported op "${op.op}"`);
  if (op.op === 'remove' && op.path === '') throw new Error('patch: cannot remove the whole document');
  if (op.op === 'add' || op.op === 'replace') { const at = badJSON(op.value); if (at !== null) throw new Error(`patch: ${op.path}${at} is not a JSON value`); }
}

/** Applies `patch` to a copy of `value` (RFC 6902 add, remove, replace, move; `-` appends). */
export function applyPatchValue(value, patch) {
  let doc = structuredClone(value);
  const parentOf = (ptr) => {
    const t = tokens(ptr), key = t.pop();
    let c = doc;
    for (const k of t) {
      if (c === null || typeof c !== 'object' || !(Array.isArray(c) ? isIndex(k) && Number(k) < c.length : Object.hasOwn(c, k))) throw new Error(`patch: no ${ptr}`);
      c = c[k];
    }
    if (c === null || typeof c !== 'object') throw new Error(`patch: no ${ptr}`);
    return [c, key];
  };
  const has = (c, k) => (Array.isArray(c) ? isIndex(k) && Number(k) < c.length : Object.hasOwn(c, k));
  const get = (ptr) => { if (ptr === '') return doc; const [c, k] = parentOf(ptr); if (!has(c, k)) throw new Error(`patch: no ${ptr}`); return c[k]; };
  const add = (ptr, v) => {
    if (ptr === '') { doc = v; return; }
    const [c, k] = parentOf(ptr);
    if (!Array.isArray(c)) { put(c, k, v); return; }
    if (k === '-') c.push(v);
    else if (isIndex(k) && Number(k) <= c.length) c.splice(Number(k), 0, v);
    else throw new Error(`patch: no ${ptr}`);
  };
  const remove = (ptr) => {
    const [c, k] = parentOf(ptr);
    if (!has(c, k)) throw new Error(`patch: no ${ptr}`);
    const v = c[k];
    if (Array.isArray(c)) c.splice(Number(k), 1); else delete c[k];
    return v;
  };
  for (const op of patch) {
    checkOp(op);
    if (op.op === 'add') add(op.path, structuredClone(op.value));
    else if (op.op === 'remove') remove(op.path);
    else if (op.op === 'replace') { get(op.path); if (op.path === '') doc = structuredClone(op.value); else { const [c, k] = parentOf(op.path); put(c, k, structuredClone(op.value)); } }
    else {
      if (op.path.startsWith(`${op.from}/`)) throw new Error(`patch: cannot move ${op.from} into itself`);
      if (op.path !== op.from) add(op.path, remove(op.from));
      else get(op.from);
    }
  }
  return doc;
}

// ---- the text side ----
const kidsOf = (n) => n.items ?? n.members;
const lineStart = (text, pos) => text.lastIndexOf('\n', pos - 1) + 1;
const lineIndent = (text, pos) => /^[ \t]*/.exec(text.slice(lineStart(text, pos), pos))[0];
const startsLine = (text, pos) => /^[ \t]*$/.test(text.slice(lineStart(text, pos), pos));
const isMulti = (text, n) => text.slice(n.start, n.end).includes('\n');
const ONE = { multi: false, unit: '  ', colon: ': ', sep: ', ', pad: { object: ' ', array: '' } };

/** The serialising style a container node shows. */
function styleOf(text, n) {
  const kids = kidsOf(n), m = n.members?.[0];
  const colon = m && !text.slice(m.keyEnd, m.value.start).includes('\n') ? text.slice(m.keyEnd, m.value.start) : ONE.colon;
  if (isMulti(text, n)) {
    const k = kids.find((x) => startsLine(text, x.start));
    const own = lineIndent(text, n.start), child = k ? lineIndent(text, k.start) : own + '  ';
    return { multi: true, unit: child.startsWith(own) && child.length > own.length ? child.slice(own.length) : '  ', colon, sep: ONE.sep, pad: ONE.pad };
  }
  const sep = kids.length > 1 ? text.slice(kids[0].end, kids[1].start) : ONE.sep;
  const pad = kids.length ? text.slice(n.start + 1, kids[0].start) : ONE.pad[n.type];
  return { multi: false, unit: '  ', colon, sep, pad: { ...ONE.pad, [n.type]: pad } };
}

/** The template child of `tmpl` for a child value of type `type` at `key` (an index for arrays). */
function childTemplate(tmpl, key, type) {
  if (!tmpl) return null;
  if (tmpl.type === 'object') return tmpl.members.find((m) => m.key === key && m.value.type === type)?.value ?? tmpl.members.find((m) => m.value.type === type)?.value ?? null;
  const same = tmpl.items[key];
  return same?.type === type ? same : tmpl.items.find((x) => x.type === type) ?? null;
}

/** Serialises `value` at base indentation `indent` in the style of node `tmpl`, else the inherited
 *  style; `one` forces one line (a value inside a one-line container stays on that line). */
function serialise(text, value, tmpl, indent, nl, one = false, inherited = ONE) {
  const type = typeOf(value);
  if (type !== 'object' && type !== 'array') return JSON.stringify(value);
  const entries = type === 'array' ? value.map((v, i) => [i, v]) : Object.entries(value);
  if (!entries.length) return type === 'array' ? '[]' : '{}';
  // an empty container (`{}`, `[]`) shows no style: its one line says nothing about how its siblings are laid out
  const own = tmpl && tmpl.type === type && kidsOf(tmpl).length ? tmpl : null;
  let s = own ? styleOf(text, own) : inherited;
  if (one && s.multi) s = { ...s, multi: false, sep: ONE.sep, pad: ONE.pad };
  const [open, close] = type === 'array' ? ['[', ']'] : ['{', '}'];
  const inner = s.multi ? indent + s.unit : indent;
  const parts = entries.map(([k, v]) => (type === 'object' ? JSON.stringify(k) + s.colon : '') + serialise(text, v, childTemplate(own, k, typeOf(v)), inner, nl, !s.multi, s));
  return s.multi ? `${open}${parts.map((p) => nl + inner + p).join(',')}${nl}${indent}${close}` : `${open}${s.pad[type]}${parts.join(s.sep)}${s.pad[type]}${close}`;
}

/** Walks `tree` along `t`; returns the chain of nodes [root, …, target] (target undefined when missing). */
function walk(tree, t) {
  const chain = [tree];
  for (const k of t) {
    const n = chain[chain.length - 1];
    const next = n?.type === 'object' ? n.members.find((m) => m.key === k)?.value : n?.type === 'array' && isIndex(k) ? n.items[Number(k)] : undefined;
    chain.push(next);
  }
  return chain;
}

/** The nearest node of `type` to serialise a new child of `parent` by: a cousin with the same key, a sibling, an ancestor. */
function findTemplate(chain, parent, key, index, type) {
  const grand = chain[chain.length - 2];
  if (parent.type === 'object' && grand && grand.type === 'array') {
    const at = grand.items.indexOf(parent);
    const cousins = grand.items.map((n, i) => [Math.abs(i - at), n]).filter(([d, n]) => d && n.type === 'object').sort((a, b) => a[0] - b[0]);
    for (const [, n] of cousins) { const m = n.members.find((x) => x.key === key && x.value.type === type); if (m) return m.value; }
  }
  const kids = parent.items ?? parent.members.map((m) => m.value);
  const sib = kids.map((n, i) => [Math.abs(i - index), n]).filter(([, n]) => n.type === type).sort((a, b) => a[0] - b[0])[0];
  if (sib) return sib[1];
  for (let j = chain.length - 1; j >= 0; j--) if (chain[j]?.type === type) return chain[j];
  return null;
}

const reindent = (raw, from, to, nl) => raw.split(nl).map((l, i) => (i && l.startsWith(from) ? to + l.slice(from.length) : l)).join(nl);

function applyOne(text, op) {
  checkOp(op);
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const splice = (a, b, s) => text.slice(0, a) + s + text.slice(b);
  const tree = parseRanges(text);
  const find = (ptr) => { const n = walk(tree, tokens(ptr)).pop(); if (!n) throw new Error(`patch: no ${ptr}`); return n; };

  if (op.op === 'remove') {
    const t = tokens(op.path), key = t.pop(), parent = walk(tree, t).pop();
    if (!parent || (parent.type !== 'object' && parent.type !== 'array')) throw new Error(`patch: no ${op.path}`);
    const kids = kidsOf(parent), i = parent.type === 'array' ? (isIndex(key) ? Number(key) : -1) : parent.members.findIndex((m) => m.key === key);
    if (!kids[i]) throw new Error(`patch: no ${op.path}`);
    if (kids.length === 1) return splice(parent.start + 1, parent.end - 1, '');
    if (i === kids.length - 1 || (i > 0 && !startsLine(text, kids[i].start))) return splice(kids[i - 1].end, kids[i].end, '');
    return splice(kids[i].start, kids[i + 1].start, '');
  }

  // what goes in: a value to serialise, or (move) the source's own bytes
  let value = op.value, raw = null, rawIndent = '';
  if (op.op === 'move') {
    if (op.path === op.from) { find(op.from); return text; }
    if (op.path.startsWith(`${op.from}/`)) throw new Error(`patch: cannot move ${op.from} into itself`);
    const src = find(op.from);
    value = src.value; raw = text.slice(src.start, src.end); rawIndent = lineIndent(text, src.start);
    text = applyOne(text, { op: 'remove', path: op.from });
    return applyOne(text, { op: 'add', path: op.path, value, raw, rawIndent, before: op.before });
  }
  if (op.raw != null) { raw = op.raw; rawIndent = op.rawIndent; }
  const body = (indent, oneLine, tmpl) => {
    if (raw != null && !(oneLine && raw.includes('\n'))) return reindent(raw, rawIndent, indent, nl);
    return serialise(text, value, tmpl, indent, nl, oneLine);
  };

  const t = tokens(op.path);
  if (!t.length) {   // the whole document
    if (op.op === 'replace' || op.op === 'add') return splice(tree.start, tree.end, body('', false, tree.type === typeOf(value) ? tree : null));
  }
  const key = t.pop(), chain = walk(tree, t), parent = chain[chain.length - 1];
  if (!parent || (parent.type !== 'object' && parent.type !== 'array')) throw new Error(`patch: no ${op.path}`);
  const kids = kidsOf(parent), oneLine = !isMulti(text, parent);
  const existing = parent.type === 'object' ? parent.members.find((m) => m.key === key)?.value : isIndex(key) ? parent.items[Number(key)] : undefined;

  if (op.op === 'replace' || (op.op === 'add' && parent.type === 'object' && existing)) {
    if (!existing) throw new Error(`patch: no ${op.path}`);
    const index = kids.findIndex((k) => (k.value ?? k) === existing);
    const tmpl = existing.type === typeOf(value) ? existing : findTemplate(chain, parent, key, index, typeOf(value));
    return splice(existing.start, existing.end, body(lineIndent(text, existing.start), oneLine, tmpl));
  }

  // add: a new member or item
  let index;
  if (parent.type === 'array') {
    index = key === '-' ? kids.length : isIndex(key) ? Number(key) : NaN;
    if (!(index <= kids.length)) throw new Error(`patch: no ${op.path}`);
  } else {
    const b = op.before == null ? -1 : parent.members.findIndex((m) => m.key === op.before);
    index = b >= 0 ? b : kids.length;
  }
  const colon = parent.type === 'object' ? styleOf(text, parent).colon : '';
  const head = parent.type === 'object' ? JSON.stringify(key) + colon : '';
  const tmpl = findTemplate(chain, parent, key, index, typeOf(value));
  if (!kids.length) {
    if (oneLine) { const pad = ONE.pad[parent.type]; return splice(parent.start + 1, parent.end - 1, pad + head + body('', true, tmpl) + pad); }
    const close = lineIndent(text, parent.end - 1), inner = close + '  ';
    return splice(parent.start + 1, parent.end - 1, nl + inner + head + body(inner, false, tmpl) + nl + close);
  }
  if (oneLine) {
    const sep = kids.length > 1 ? text.slice(kids[0].end, kids[1].start) : ', ';
    const entry = head + body('', true, tmpl);
    return index < kids.length ? splice(kids[index].start, kids[index].start, entry + sep) : splice(kids[kids.length - 1].end, kids[kids.length - 1].end, sep + entry);
  }
  if (index < kids.length && startsLine(text, kids[index].start)) {
    const x = lineIndent(text, kids[index].start);
    return splice(kids[index].start, kids[index].start, head + body(x, false, tmpl) + ',' + nl + x);
  }
  const lined = kids.find((k) => startsLine(text, k.start));
  const ind = lined ? lineIndent(text, lined.start) : lineIndent(text, parent.start) + '  ';
  if (index === 0) return splice(kids[0].start, kids[0].start, head + body(ind, false, tmpl) + ',' + nl + ind);
  const after = kids[index - 1].end;
  return splice(after, after, ',' + nl + ind + head + body(ind, false, tmpl));
}

/** The bytes of the node at `ptr` in `text`, with its line's indentation taken off every line after the
 *  first: an add or replace carrying them as `raw` (with `rawIndent: ''`) writes them back as they were. */
export function rawAt(text, ptr) {
  const n = walk(parseRanges(text), tokens(ptr)).pop();
  if (!n) throw new Error(`patch: no ${ptr}`);
  return reindent(text.slice(n.start, n.end), lineIndent(text, n.start), '', text.includes('\r\n') ? '\r\n' : '\n');
}

/** Applies `patch` to JSON `text`, changing only the bytes the patch touches. */
export function applyPatchText(text, patch) {
  for (const op of patch) text = applyOne(text, op);
  return text;
}
