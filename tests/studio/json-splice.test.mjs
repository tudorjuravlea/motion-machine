// json-splice parses with byte ranges and applies a JSON patch to
// the text so that only the edited bytes change. The invariant runs over every story in the repo
// under seeded random patches: the text result parses to the value result; nothing outside the
// touched range moves; a scalar replace changes nothing but that scalar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseRanges, applyPatchValue, applyPatchText, badJSON, rawAt } from '../../scripts/studio/json-splice.js';
import { trackedFiles } from '../check/_tracked.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;

/** Every story file under the four trees, plus the pattern demos; in pieces/ only the tracked ones (a piece a user scaffolds is theirs). */
function stories() {
  const out = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      if (f.startsWith('.') || f === 'node_modules' || f === 'out') continue;
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/^story[^/]*\.json$/.test(f)) out.push(p);
    }
  };
  for (const d of ['runtime/skeletons', 'fixtures', 'patterns']) walk(join(ROOT, d));
  const tracked = trackedFiles('pieces');
  if (tracked) out.push(...tracked.filter((f) => /(^|\/)story[^/]*\.json$/.test(f) && !f.includes('/out/')).map((f) => join(ROOT, f)));
  else walk(join(ROOT, 'pieces'));
  return out.sort();
}

// FNV-1a of the repo-relative path: a story's patches depend on its own path alone
const seedOf = (s) => { let h = 0x811c9dc5; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193); return h >>> 0; };

// mulberry32: a seeded generator, so every run draws the same patches
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const esc = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');
const at = (node, ptr) => ptr.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
  .reduce((n, k) => (n.type === 'array' ? n.items[Number(k)] : n.members.find((m) => m.key === k).value), node);
const clone = (v) => JSON.parse(JSON.stringify(v));

function scalars(node, ptr = '', acc = []) {
  if (node.type === 'object') for (const m of node.members) scalars(m.value, `${ptr}/${esc(m.key)}`, acc);
  else if (node.type === 'array') node.items.forEach((it, i) => scalars(it, `${ptr}/${i}`, acc));
  else acc.push(ptr);
  return acc;
}

/** The byte span an op is allowed to touch, in the original text's coordinates. */
function gap(container, index) {   // where an insert at `index` lands
  const kids = container.type === 'array' ? container.items : container.members;
  if (!kids.length) return [container.start, container.end];
  if (index >= kids.length) return [kids[kids.length - 1].end, container.end];
  return [index ? kids[index - 1].end : container.start, kids[index].start];
}
function span(tree, op) {
  const parent = (p) => at(tree, p.split('/').slice(0, -1).join('/'));
  const last = (p) => p.split('/').pop().replace(/~1/g, '/').replace(/~0/g, '~');
  const kidSpan = (p) => {
    const c = parent(p), k = last(p);
    const kids = c.type === 'array' ? c.items : c.members;
    const i = c.type === 'array' ? Number(k) : kids.findIndex((m) => m.key === k);
    if (kids.length === 1) return [c.start, c.end];
    return [i ? kids[i - 1].end : kids[i].start, i < kids.length - 1 ? kids[i + 1].start : kids[i].end];
  };
  if (op.op === 'replace') return [at(tree, op.path).start, at(tree, op.path).end];
  if (op.op === 'remove') return kidSpan(op.path);
  if (op.op === 'add') {
    const c = parent(op.path), k = last(op.path);
    if (c.type === 'object') { const m = c.members.find((x) => x.key === k); return m ? [m.value.start, m.value.end] : gap(c, c.members.length); }
    return gap(c, k === '-' ? c.items.length : Number(k));
  }
  // move: the source and the target gap; in one array the target index is counted after the removal
  const a = kidSpan(op.from), c = parent(op.path), k = last(op.path);
  const same = op.from.split('/').slice(0, -1).join('/') === op.path.split('/').slice(0, -1).join('/');
  let idx = k === '-' ? c.items.length : Number(k);
  if (same && idx >= Number(last(op.from))) idx += 1;
  const b = gap(c, idx);
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
}

/** One random single-op patch for a story. */
function draw(r, v, tree) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const scenes = Array.isArray(v.scenes) && v.scenes.length ? v.scenes : null;
  const kind = r();
  const newScalar = () => pick([Math.round(r() * 6000) / 100, 0, -1.5, 'é "quoted" \\ line\nbreak ✓', '', true, false, null, 12]);
  if (kind < 0.35 || !scenes) {
    const s = scalars(tree).filter(Boolean);
    if (!s.length || (!scenes && r() < 0.5)) {   // a top-level member: add or remove
      const keys = Object.keys(v);
      return r() < 0.5 || keys.length < 2 ? [{ op: 'add', path: '/zz-new', value: { a: [1, 'b'], c: null } }] : [{ op: 'remove', path: `/${esc(pick(keys))}` }];
    }
    return [{ op: 'replace', path: pick(s), value: newScalar() }];
  }
  const si = Math.floor(r() * scenes.length), sc = scenes[si];
  const beats = Array.isArray(sc.beats) ? sc.beats : [];
  const bi = Math.floor(r() * beats.length);
  const bp = `/scenes/${si}/beats`;
  const choice = Math.floor(r() * 9);
  switch (choice) {
    case 0: return [{ op: 'add', path: `/scenes/${r() < 0.5 ? '-' : Math.floor(r() * (scenes.length + 1))}`, value: { ...clone(sc), id: 'zz-added' } }];
    case 1: return beats.length ? [{ op: 'add', path: `${bp}/${r() < 0.4 ? '-' : Math.floor(r() * (beats.length + 1))}`, value: { ...clone(beats[bi]), at: 0.25 } }] : [{ op: 'add', path: `${bp}`, value: [] }];
    case 2: return beats.length ? [{ op: 'add', path: `${bp}/${bi}/${pick(['cue', 'out', 'params', 'zz'])}`, value: pick(['tick', 2.5, { dur: 'slow', d: 12 }, [1, 2]]) }] : [{ op: 'add', path: `/scenes/${si}/cutParams`, value: { direction: 'left' } }];
    case 3: return beats.length > 0 ? [{ op: 'remove', path: `${bp}/${bi}` }] : [{ op: 'remove', path: `/scenes/${si}` }];
    case 4: return [{ op: 'remove', path: `/scenes/${si}` }];
    case 5: { const keys = beats.length ? Object.keys(beats[bi]) : []; return keys.length ? [{ op: 'remove', path: `${bp}/${bi}/${esc(pick(keys))}` }] : [{ op: 'remove', path: `/scenes/${si}/say` }]; }
    case 6: return [{ op: 'move', from: `/scenes/${si}`, path: `/scenes/${Math.floor(r() * scenes.length)}` }];
    case 7: return beats.length ? [{ op: 'move', from: `${bp}/${bi}`, path: `${bp}/${Math.floor(r() * beats.length)}` }] : [{ op: 'replace', path: `/scenes/${si}/id`, value: 'zz' }];
    default: {   // a beat into another scene's beats, or a whole beat replaced
      const sj = Math.floor(r() * scenes.length), other = Array.isArray(scenes[sj].beats) ? scenes[sj].beats : null;
      if (beats.length && other && sj !== si) return [{ op: 'move', from: `${bp}/${bi}`, path: `/scenes/${sj}/beats/${Math.floor(r() * (other.length + 1))}` }];
      return beats.length ? [{ op: 'replace', path: `${bp}/${bi}`, value: { at: 1, slot: 'zz', fx: 'entrances/rise', params: { side: 'left' } } }] : [{ op: 'replace', path: `/scenes/${si}/say`, value: 'x' }];
    }
  }
}

test('parseRanges gives byte ranges for every node and member, end exclusive', () => {
  const t = '{ "a": [1, true, null], "b" : {"c":"x\\"y"} }';
  const n = parseRanges(t);
  assert.equal(n.type, 'object');
  assert.equal(n.start, 0); assert.equal(n.end, t.length);
  const [a, b] = n.members;
  assert.equal(a.key, 'a'); assert.equal(t.slice(a.keyStart, a.keyEnd), '"a"');
  assert.equal(t.slice(a.start, a.end), '"a": [1, true, null]');
  assert.deepEqual(a.value.items.map((i) => [i.type, t.slice(i.start, i.end)]), [['number', '1'], ['boolean', 'true'], ['null', 'null']]);
  assert.equal(t.slice(b.value.start, b.value.end), '{"c":"x\\"y"}');
  assert.equal(b.value.members[0].value.value, 'x"y');
  assert.deepEqual(n.value, JSON.parse(t));
});

test('parseRanges throws on invalid JSON and names the offset', () => {
  for (const [t, off] of [['{"a": }', 6], ['[1, 2', 5], ['{"a": 1} x', 9], ['{"a" 1}', 5], ['[01]', 2]]) {
    assert.throws(() => parseRanges(t), (e) => e.offset === off && new RegExp(`\\b${off}\\b`).test(e.message), t);
  }
});

test('applyPatchValue applies add, remove, replace and move without mutating its input', () => {
  const v = { a: [1, 2], b: { c: 1 } };
  const out = applyPatchValue(v, [{ op: 'add', path: '/a/-', value: 3 }, { op: 'add', path: '/a/0', value: 0 }, { op: 'replace', path: '/b/c', value: 9 },
    { op: 'move', from: '/a/3', path: '/b/d' }, { op: 'remove', path: '/a/1' }, { op: 'add', path: '/b/e~1f', value: true }]);
  assert.deepEqual(out, { a: [0, 2], b: { c: 9, d: 3, 'e/f': true } });
  assert.deepEqual(v, { a: [1, 2], b: { c: 1 } });
  assert.throws(() => applyPatchValue(v, [{ op: 'remove', path: '/zz' }]), /zz/);
  assert.throws(() => applyPatchValue(v, [{ op: 'replace', path: '/a/5', value: 1 }]), /a\/5/);
  assert.throws(() => applyPatchValue(v, [{ op: 'copy', from: '/a', path: '/z' }]), /copy/);
});

test('a scalar replace rewrites only the value bytes', () => {
  const t = '{\n  "x": 1.50,\n  "y" :  "a"\n}\n';
  assert.equal(applyPatchText(t, [{ op: 'replace', path: '/x', value: 2 }]), '{\n  "x": 2,\n  "y" :  "a"\n}\n');
  assert.equal(applyPatchText(t, [{ op: 'replace', path: '/y', value: 'b"c' }]), '{\n  "x": 1.50,\n  "y" :  "b\\"c"\n}\n');
});

test('a member added to a one-line container stays on that line, copying the separator', () => {
  assert.equal(applyPatchText('{"o": { "a": 1, "b": 2 }}', [{ op: 'add', path: '/o/c', value: 'x' }]), '{"o": { "a": 1, "b": 2, "c": "x" }}');
  assert.equal(applyPatchText('[1,2]', [{ op: 'add', path: '/1', value: 9 }]), '[1,9,2]');
  assert.equal(applyPatchText('[1, 2]', [{ op: 'add', path: '/0', value: 9 }]), '[9, 1, 2]');
  assert.equal(applyPatchText('{"a": []}', [{ op: 'add', path: '/a/-', value: 1 }]), '{"a": [1]}');
});

test('a member added to a multi-line container gets its own line at the siblings indentation', () => {
  const t = '{\n  "a": 1,\n  "b": [\n    1\n  ]\n}';
  assert.equal(applyPatchText(t, [{ op: 'add', path: '/c', value: true }]), '{\n  "a": 1,\n  "b": [\n    1\n  ],\n  "c": true\n}');
  assert.equal(applyPatchText(t, [{ op: 'add', path: '/b/0', value: 0 }]), '{\n  "a": 1,\n  "b": [\n    0,\n    1\n  ]\n}');
});

test('a new nested value takes the style of its nearest sibling of the same type, else one line', () => {
  const multi = '{\n  "beats": [\n    {\n      "at": 0,\n      "params": {\n        "d": 1\n      }\n    }\n  ]\n}\n';
  const out = applyPatchText(multi, [{ op: 'add', path: '/beats/-', value: { at: 1, params: { d: 2, side: 'up' } } }]);
  assert.equal(out, JSON.stringify(JSON.parse(out), null, 2) + '\n');
  const inline = '{\n  "beats": [\n    { "at": 0, "slot": "a" }\n  ]\n}';
  assert.equal(applyPatchText(inline, [{ op: 'add', path: '/beats/-', value: { at: 1, slot: 'b' } }]), '{\n  "beats": [\n    { "at": 0, "slot": "a" },\n    { "at": 1, "slot": "b" }\n  ]\n}');
  // no sibling, cousin or ancestor of the type: one line
  assert.equal(applyPatchText('[\n  1\n]', [{ op: 'add', path: '/-', value: { d: [1, 2] } }]), '[\n  1,\n  { "d": [1, 2] }\n]');
  // a cousin (the same key in a sibling beat) wins over the multi-line ancestor
  const cousin = '{\n  "beats": [\n    {\n      "params": { "d": 1 }\n    },\n    {\n      "at": 1\n    }\n  ]\n}';
  assert.equal(applyPatchText(cousin, [{ op: 'add', path: '/beats/1/params', value: { d: 2 } }]), '{\n  "beats": [\n    {\n      "params": { "d": 1 }\n    },\n    {\n      "at": 1,\n      "params": { "d": 2 }\n    }\n  ]\n}');
});

test('remove takes the member, exactly one adjoining comma and its whitespace', () => {
  const t = '{\n  "a": 1,\n  "b": 2,\n  "c": 3\n}';
  assert.equal(applyPatchText(t, [{ op: 'remove', path: '/a' }]), '{\n  "b": 2,\n  "c": 3\n}');
  assert.equal(applyPatchText(t, [{ op: 'remove', path: '/b' }]), '{\n  "a": 1,\n  "c": 3\n}');
  assert.equal(applyPatchText(t, [{ op: 'remove', path: '/c' }]), '{\n  "a": 1,\n  "b": 2\n}');
  assert.equal(applyPatchText('[ 1 ]', [{ op: 'remove', path: '/0' }]), '[]');
  assert.equal(applyPatchText('{ "a": 1, "b": 2 }', [{ op: 'remove', path: '/b' }]), '{ "a": 1 }');
});

test('an add naming `before` (an RFC 6902 extension member) lands in front of that sibling', () => {
  const t = '{\n  "at": 1,\n  "slot": "a",\n  "cue": "tick"\n}';
  assert.equal(applyPatchText(t, [{ op: 'add', path: '/text', value: 'x', before: 'cue' }]), '{\n  "at": 1,\n  "slot": "a",\n  "text": "x",\n  "cue": "tick"\n}');
  assert.equal(applyPatchText('{"a": 1, "c": 3}', [{ op: 'add', path: '/b', value: 2, before: 'c' }]), '{"a": 1, "b": 2, "c": 3}');
  assert.equal(applyPatchText('{"a": 1}', [{ op: 'add', path: '/b', value: 2, before: 'gone' }]), '{"a": 1, "b": 2}');
});

test('move keeps the moved value bytes, re-indented when its depth changes', () => {
  const t = '{\n  "s": [\n    { "id": "a", "beats": [ {"at":0} ] },\n    {\n      "id": "b"\n    }\n  ],\n  "v": {\n    "x": [\n      9\n    ]\n  }\n}';
  assert.equal(applyPatchText(t, [{ op: 'move', from: '/s/0', path: '/s/1' }]), '{\n  "s": [\n    {\n      "id": "b"\n    },\n    { "id": "a", "beats": [ {"at":0} ] }\n  ],\n  "v": {\n    "x": [\n      9\n    ]\n  }\n}');
  assert.equal(applyPatchText(t, [{ op: 'move', from: '/s/1', path: '/v/x/0' }]), '{\n  "s": [\n    { "id": "a", "beats": [ {"at":0} ] }\n  ],\n  "v": {\n    "x": [\n      {\n        "id": "b"\n      },\n      9\n    ]\n  }\n}');
});

test('a hand-formatted story edited many times keeps every byte outside the edited values (review focus 1)', () => {
  const t0 = readFileSync(join(ROOT, 'runtime/skeletons/film/story.json'), 'utf8');
  const r = rng(7);
  let t = t0;
  const undo = [];
  for (let k = 0; k < 60; k++) {
    const v = JSON.parse(t), path = '/scenes/0/beats/0/at', old = v.scenes[0].beats[0].at;
    const next = Math.round(r() * 300) / 100;
    const n = parseRanges(t), node = at(n, path);
    const t2 = applyPatchText(t, [{ op: 'replace', path, value: next }]);
    assert.equal(t2, t.slice(0, node.start) + JSON.stringify(next) + t.slice(node.end));
    undo.push([{ op: 'replace', path, value: old }]);
    t = t2;
  }
  for (const p of undo.reverse()) t = applyPatchText(t, p);
  assert.equal(t, t0);
});

test('parseRanges refuses a duplicate key, naming it and its offset', () => {
  assert.throws(() => parseRanges('{"a": 1, "b": {"c": 0, "c": 2}}'), (e) => e instanceof SyntaxError && /duplicate key "c"/.test(e.message) && e.offset === 23 && e.duplicate === 'c');
  assert.throws(() => applyPatchText('{"a": 1, "a": 2}', [{ op: 'replace', path: '/a', value: 3 }]), /duplicate key "a"/);
});

test('a __proto__ key is an own key on both sides, as JSON.parse makes it', () => {
  const t = '{"__proto__": {"a": 1}, "b": 1}';
  const v = parseRanges(t).value;
  assert.deepEqual(Object.keys(v), ['__proto__', 'b']);
  assert.equal(Object.getPrototypeOf(v), Object.prototype);
  assert.deepEqual(v, JSON.parse(t));
  for (const [text, patch] of [
    ['{"x": 1}', [{ op: 'add', path: '/__proto__', value: { polluted: 1 } }]],
    ['{"__proto__": 1, "x": 1}', [{ op: 'replace', path: '/__proto__', value: 2 }]],
    ['{"a": {\n"__proto__": 1}, "b": [0]}', [{ op: 'move', from: '/a', path: '/b/0' }]],
  ]) assert.deepEqual(JSON.parse(applyPatchText(text, patch)), applyPatchValue(JSON.parse(text), patch), JSON.stringify(patch));
  assert.equal({}.polluted, undefined);
  // removing the whole document is refused the same way on both sides
  assert.throws(() => applyPatchValue({ undefined: 1 }, [{ op: 'remove', path: '' }]), /cannot remove the whole document/);
  assert.throws(() => applyPatchText('{"undefined": 1}', [{ op: 'remove', path: '' }]), /cannot remove the whole document/);
});

test('a value JSON cannot hold is refused on both sides, never written', () => {
  for (const value of [undefined, NaN, Infinity, () => 1, { a: undefined }, [1, NaN], { a: [{ b: -Infinity }] }]) {
    const patch = [{ op: 'add', path: '/b', value }];
    assert.throws(() => applyPatchText('{"a": 1}', patch), /not a JSON value/, String(value));
    assert.throws(() => applyPatchValue({ a: 1 }, patch), /not a JSON value/, String(value));
  }
  assert.equal(badJSON({ a: [1, { b: undefined }] }), '/a/1/b');
  assert.equal(badJSON(NaN), '');
  assert.equal(badJSON({ a: [1, 'x', null, true, { b: 2 }] }), null);
});

test('rawAt gives a node\'s own bytes without its line indentation; an add carrying them writes them back', () => {
  const t = '{\n  "beats": [\n    {\n      "at": 0.50,\n      "fx": "x"\n    },\n    { "at": 1 }\n  ]\n}\n';
  assert.equal(rawAt(t, '/beats/0'), '{\n  "at": 0.50,\n  "fx": "x"\n}');
  assert.equal(rawAt(t, '/beats/0/at'), '0.50');
  const removed = applyPatchText(t, [{ op: 'remove', path: '/beats/0' }]);
  assert.equal(applyPatchText(removed, [{ op: 'add', path: '/beats/0', value: { at: 0.5, fx: 'x' }, raw: rawAt(t, '/beats/0'), rawIndent: '' }]), t);
});

test('an empty container shows no style: a new object next to an existing `{}` still follows the file (a JSON.stringify file stays one)', () => {
  const base = { scenes: [{ id: 'a', beats: [{ at: 0, params: {}, screen: [] }] }] };
  const t = JSON.stringify(base, null, 2) + '\n';
  const value = { id: 'b', beats: [{ at: 0, params: { size: 'large' }, screen: [{ do: 'screen/island', at: 1, params: { text: 'T' } }] }] };
  const out = applyPatchText(t, [{ op: 'add', path: '/scenes/1', value }]);
  assert.equal(out, JSON.stringify({ scenes: [base.scenes[0], value] }, null, 2) + '\n');
});

test('the splice invariant holds over every story under 2,000+ seeded random patches', () => {
  const files = stories();
  assert.ok(files.length >= 150, `found ${files.length} stories`);
  const per = 14;   // patches per story; each file draws its own stream, so adding or removing a story changes no other file's patches
  let n = 0, multi = 0;
  for (const f of files) {
    const t = readFileSync(f, 'utf8'), name = relative(ROOT, f);
    const r = rng(seedOf(name));
    const v = JSON.parse(t), tree = parseRanges(t);
    assert.deepEqual(tree.value, v, name);
    const canonical = Array.isArray(v.scenes) && t === JSON.stringify(v, null, 2) + "\n";   // (an empty container gains one line, as no sibling shows another style)
    for (let k = 0; k < per; k++) {
      const p = draw(r, v, tree);
      const want = applyPatchValue(v, p);
      const out = applyPatchText(t, p);
      const label = `${name} ${JSON.stringify(p)}`;
      assert.deepEqual(JSON.parse(out), want, label);
      const [lo, hi] = span(tree, p[0]);
      const kept = out.startsWith(t.slice(0, lo)) && out.endsWith(t.slice(hi)) && out.length - (t.length - hi) >= lo;
      assert.ok(kept, `${label}: bytes outside [${lo}, ${hi}) changed`);
      if (p[0].op === 'replace' && at(tree, p[0].path).type !== 'object' && at(tree, p[0].path).type !== 'array') {
        const node = at(tree, p[0].path);
        assert.equal(out, t.slice(0, node.start) + JSON.stringify(p[0].value) + t.slice(node.end), label);
      }
      if (canonical) assert.equal(out, JSON.stringify(want, null, 2) + '\n', `${label}: a JSON.stringify file stays JSON.stringify`);
      n++;
      // and a chain of three patches over the result
      const p2 = draw(r, want, parseRanges(out)), w2 = applyPatchValue(want, p2);
      const p3 = draw(r, w2, parseRanges(applyPatchText(out, p2)));
      assert.deepEqual(JSON.parse(applyPatchText(t, [...p, ...p2, ...p3])), applyPatchValue(v, [...p, ...p2, ...p3]), `${label} then ${JSON.stringify([...p2, ...p3])}`);
      multi++;
    }
  }
  assert.ok(n >= 2000, `${n} patches`);
  assert.ok(multi >= 2000);
});
