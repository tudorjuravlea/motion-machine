// The code model (runtime/kit/code.js): tabs expanded, a lexer that loses no text and maps tokens to eight
// roles, a patience diff over tokens, the steps of an edit (edit, append, prepend, insert, remove, replace,
// select, call), ranges that anchor on exact text, and a morph that keeps kept tokens, fades the rest at
// the stated windows and dims what is not selected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKEN_ROLES, expandTabs, lex, diffTokens, parseSteps, applyStep, rangesIn, boxesOf, buildModel, stepTimes, frameAt, tintOf } from '../../runtime/kit/code.js';

test('tabs expand to the next stop, not to a fixed run of spaces', () => {
  assert.equal(expandTabs('\tx', 2), '  x');
  assert.equal(expandTabs('a\tb', 2), 'a b');
  assert.equal(expandTabs('ab\tc', 4), 'ab  c');
  assert.equal(expandTabs('a\n\tb', 4), 'a\n    b');
  assert.equal(expandTabs('no tabs', 2), 'no tabs');
});

test('the lexer loses nothing: the tokens put back are the text', () => {
  const src = 'const url = `/api/${id}`; // fetch it\nasync function load(x: number) {\n  return await fetch(url, { retry: 3, ok: true });\n}\n';
  assert.equal(lex(src, 'js').map((t) => t.text).join(''), src);
  assert.equal(lex('', 'js').length, 0);
});

test('tokens fall into eight roles and whitespace', () => {
  assert.equal(TOKEN_ROLES.length, 8);
  const r = (src, text, lang = 'js') => lex(src, lang).find((t) => t.text === text)?.role;
  assert.equal(r('const a = 1', 'const'), 'keyword');
  assert.equal(r('const a = 1', 'a'), 'name');
  assert.equal(r('const a = 1', '1'), 'number');
  assert.equal(r('x = "hi there"', '"hi there"'), 'string');
  assert.equal(r('x = true', 'true'), 'atom');
  assert.equal(r('x = null', 'null'), 'atom');
  assert.equal(r('x // note', '// note'), 'comment');
  assert.equal(r('new Client()', 'Client'), 'type');
  assert.equal(r('f(a)', '('), 'punct');
  assert.equal(r('f(a)', 'f'), 'name');
  assert.equal(r('def f(): pass', 'def', 'py'), 'keyword');
  assert.equal(r('x = None  # n', '# n', 'py'), 'comment');
  assert.equal(r('{"a": 1}', '"a"', 'json'), 'string');
  assert.equal(lex('a b', 'js').find((t) => t.text === ' ').role, 'space');
  for (const t of lex('const a = f(1, "x", true) // c', 'js')) assert.ok(t.role === 'space' || TOKEN_ROLES.includes(t.role), t.role);
});

test('a template literal and a block comment are each one token, even over lines', () => {
  assert.equal(lex('x = `a\nb`', 'js').filter((t) => t.role === 'string').length, 1);
  assert.equal(lex('/* a\n b */ x', 'js')[0].role, 'comment');
});

const rebuild = (a, b, hunks) => ({
  a: hunks.map((h) => a.slice(h.a[0], h.a[1]).join('')).join(''),
  b: hunks.map((h) => b.slice(h.b[0], h.b[1]).join('')).join(''),
});

test('diffTokens: equal inputs are one kept hunk', () => {
  const h = diffTokens(['a', 'b'], ['a', 'b']);
  assert.deepEqual(h, [{ same: true, a: [0, 2], b: [0, 2] }]);
});

test('diffTokens keeps the start and end and changes the middle', () => {
  const h = diffTokens(['f', '(', 'x', ')'], ['f', '(', 'y', ')']);
  assert.deepEqual(h.map((x) => [x.same, x.a, x.b]), [[true, [0, 2], [0, 2]], [false, [2, 3], [2, 3]], [true, [3, 4], [3, 4]]]);
});

test('diffTokens: an insert has no before and a delete has no after, adjacent delete and insert are one hunk', () => {
  const ins = diffTokens(['a', 'c'], ['a', 'b', 'c']);
  assert.deepEqual(ins.map((x) => [x.same, x.a, x.b]), [[true, [0, 1], [0, 1]], [false, [1, 1], [1, 2]], [true, [1, 2], [2, 3]]]);
  const del = diffTokens(['a', 'b', 'c'], ['a', 'c']);
  assert.deepEqual(del.map((x) => [x.same, x.a, x.b]), [[true, [0, 1], [0, 1]], [false, [1, 2], [1, 1]], [true, [2, 3], [1, 2]]]);
  const rep = diffTokens(['a', 'b', 'c', 'd'], ['a', 'x', 'y', 'd']);
  assert.equal(rep.filter((x) => !x.same).length, 1);
});

test('diffTokens anchors on tokens that occur once on each side and does not detect moves', () => {
  const a = ['let', ' ', 'x', ' ', '=', ' ', '1', ';', ' ', 'let', ' ', 'y', ' ', '=', ' ', '2', ';'];
  const b = ['let', ' ', 'y', ' ', '=', ' ', '2', ';', ' ', 'let', ' ', 'x', ' ', '=', ' ', '1', ';'];
  const h = diffTokens(a, b);
  assert.deepEqual(rebuild(a, b, h), { a: a.join(''), b: b.join('') });
  // the two statements swapped places: one is kept, the other is a delete and an insert
  assert.ok(h.some((x) => !x.same));
  const keptTexts = h.filter((x) => x.same).map((x) => a.slice(x.a[0], x.a[1]).join(''));
  assert.ok(keptTexts.some((t) => t.includes('let')), keptTexts.join('|'));
});

test('diffTokens: for many inputs the hunks rebuild both sides and every kept hunk is equal text', () => {
  let s = 12345;
  const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  const words = ['a', 'b', 'c', 'd', 'e', ' ', '(', ')'];
  for (let n = 0; n < 200; n++) {
    const a = Array.from({ length: Math.floor(rnd() * 14) }, () => words[Math.floor(rnd() * words.length)]);
    const b = Array.from({ length: Math.floor(rnd() * 14) }, () => words[Math.floor(rnd() * words.length)]);
    const h = diffTokens(a, b);
    assert.deepEqual(rebuild(a, b, h), { a: a.join(''), b: b.join('') }, `${a} / ${b}`);
    for (const x of h) if (x.same) assert.deepEqual(a.slice(...x.a), b.slice(...x.b));
  }
});

test('parseSteps reads an op, its arguments and its payload, split by a line of three dashes', () => {
  const src = 'edit\nfoo(1)\nbar\n---\nappend\n// done\n---\nreplace "retry: 3" => "retry: 5"\n---\nselect L2-3\n---\ncall "retry" | Retries\n---\nremove "x"\n---\ninsert L2\nnew line\n---\nselect none';
  const s = parseSteps(src);
  assert.deepEqual(s.map((x) => x.op), ['edit', 'append', 'replace', 'select', 'call', 'remove', 'insert', 'select']);
  assert.equal(s[0].text, 'foo(1)\nbar');
  assert.equal(s[1].text, '// done');
  assert.deepEqual([s[2].find, s[2].text], ['retry: 3', 'retry: 5']);
  assert.equal(s[3].range, 'L2-3');
  assert.deepEqual([s[4].range, s[4].label], ['"retry"', 'Retries']);
  assert.equal(s[5].range, '"x"');
  assert.deepEqual([s[6].range, s[6].text], ['L2', 'new line']);
  assert.equal(s[7].range, 'none');
});

test('a step may name the second it starts at: "@3.5"', () => {
  const s = parseSteps('edit @3.5\nx\n---\nappend @6\ny');
  assert.deepEqual(s.map((x) => x.at), [3.5, 6]);
});

test('an unknown op or a missing argument is named, not guessed', () => {
  assert.throws(() => parseSteps('explode\nx'), /unknown op "explode"/);
  assert.throws(() => parseSteps('replace x'), /replace/);
});

test('every op makes the next code', () => {
  const c = 'a\nb\nc';
  assert.equal(applyStep(c, { op: 'edit', text: 'z' }), 'z');
  assert.equal(applyStep(c, { op: 'append', text: 'd' }), 'a\nb\nc\nd');
  assert.equal(applyStep(c, { op: 'prepend', text: '0' }), '0\na\nb\nc');
  assert.equal(applyStep(c, { op: 'insert', range: 'L2', text: 'x' }), 'a\nx\nb\nc');
  assert.equal(applyStep('f(a)', { op: 'insert', range: 'L1:2', text: 'z, ' }), 'f(z, a)');
  assert.equal(applyStep(c, { op: 'remove', range: 'L2' }), 'a\nc');
  assert.equal(applyStep('f(a, b)', { op: 'remove', range: '", b"' }), 'f(a)');
  assert.equal(applyStep('f(a, b)', { op: 'replace', find: 'a', text: 'q' }), 'f(q, b)');
  assert.equal(applyStep(c, { op: 'select', range: 'L1' }), c);
  assert.equal(applyStep(c, { op: 'call', range: 'L1', label: 'x' }), c);
});

test('ranges are half-open [line, column] pairs, 0-based, found by exact text or by line', () => {
  const code = 'fetch(url, {\n  retry: 3,\n  retry: 3\n})';
  assert.deepEqual(rangesIn('"retry: 3"', code), [[[1, 2], [1, 10]]]);
  assert.deepEqual(rangesIn('L2', code), [[[1, 0], [1, Infinity]]]);
  assert.deepEqual(rangesIn('L2-3', code), [[[1, 0], [2, Infinity]]]);
  assert.deepEqual(rangesIn('L2:2+5', code), [[[1, 2], [1, 7]]]);
  assert.deepEqual(rangesIn('"nowhere"', code), []);
  assert.deepEqual(rangesIn('"retry: 3" *', code), [[[1, 2], [1, 10]], [[2, 2], [2, 10]]]);
  assert.equal(rangesIn('none', code), null);
});

test('boxesOf gives one box per line of a range, clipped to the line', () => {
  const code = 'ab\ncdef\ng';
  assert.deepEqual(boxesOf([[[0, 1], [2, 1]]], code), [{ row: 0, from: 1, to: 2 }, { row: 1, from: 0, to: 4 }, { row: 2, from: 0, to: 1 }]);
  assert.deepEqual(boxesOf([[[1, 1], [1, Infinity]]], code), [{ row: 1, from: 1, to: 4 }]);
});

test('a role spec is a palette role, or a role with a tint; anything else is refused', () => {
  assert.equal(tintOf('accent'), 'var(--c-accent)');
  assert.equal(tintOf('muted/70'), 'color-mix(in srgb, var(--c-muted) 70%, transparent)');
  assert.equal(tintOf('ink'), 'var(--c-ink)');
  assert.equal(tintOf('#ff0000'), null);
  assert.equal(tintOf('red'), null);
  assert.equal(tintOf('accent/150'), 'var(--c-accent)');
  assert.equal(tintOf('canvas'), null);
});

const SRC = 'fetch(url, {\n  retry: 3,\n})';
const STEPS = 'replace "retry: 3" => "retry: 5"\n---\nselect "retry"';
const model = () => buildModel(SRC, STEPS, { lang: 'js', tab: 2 });
const ease = (_name, p) => p;

test('the model keeps one code per step and its size over all of them', () => {
  const m = model();
  assert.equal(m.states.length, 3);
  assert.equal(m.states[1].code, 'fetch(url, {\n  retry: 5,\n})');
  assert.equal(m.rows, 3);
  assert.equal(m.cols, 'fetch(url, {'.length);
});

test('steps are spaced over the entrance after an intro, and an "@" pins one', () => {
  const m = buildModel('a', 'append\nb\n---\nappend @5\nc\n---\nappend\nd', { lang: 'js', tab: 2 });
  const t = stepTimes(m, 9, { intro: 1, morph: 0.5 });
  assert.equal(t.length, 3);
  assert.ok(t[0].start >= 1 && t[0].start < t[2].start);
  assert.equal(t[1].start, 5);
  assert.ok(t.every((x) => x.len > 0 && x.len <= 0.5 + 1e-9));
  assert.ok(t[2].start + t[2].len <= 9 + 1e-9, 'the last morph ends inside the entrance');
});

const cellsAt = (m, u, d = 6) => frameAt(m, u, stepTimes(m, d, { intro: 0.6, morph: 1 }), { ease, intro: 0.6 }).cells;
const textOf = (cells) => cells.filter((c) => c.alpha > 0.001).sort((a, b) => a.row - b.row || a.col - b.col).map((c) => c.text).join('');

test('before the intro nothing is drawn, at its end the first code is there', () => {
  const m = model();
  assert.equal(textOf(cellsAt(m, 0)), '');
  assert.equal(textOf(cellsAt(m, 0.7)).replace(/\s/g, ''), SRC.replace(/\s/g, ''));
});

test('a changed token fades out over the first 0.4 of its morph, nothing shows of it from 0.4 to 0.6, the new one fades in over the last 0.4', () => {
  const m = model();
  const t = stepTimes(m, 6, { intro: 0.6, morph: 1 })[0];
  const at = (q) => cellsAt(m, t.start + t.len * q);
  const alphaOf = (cells, text) => cells.find((c) => c.text === text)?.alpha ?? 0;
  assert.equal(alphaOf(at(0), '3'), 1);
  assert.ok(Math.abs(alphaOf(at(0.2), '3') - 0.5) < 1e-6);
  assert.equal(alphaOf(at(0.4), '3'), 0);
  assert.equal(alphaOf(at(0.5), '3'), 0);
  assert.equal(alphaOf(at(0.5), '5'), 0);
  assert.equal(alphaOf(at(0.6), '5'), 0);
  assert.ok(Math.abs(alphaOf(at(0.8), '5') - 0.5) < 1e-6);
  assert.equal(alphaOf(at(1), '5'), 1);
  assert.equal(alphaOf(at(1), '3'), 0);
});

test('kept tokens are never faded by the edit', () => {
  const m = model();
  const t = stepTimes(m, 6, { intro: 0.6, morph: 1 })[0];
  for (const q of [0, 0.3, 0.5, 0.7, 1]) {
    const cells = cellsAt(m, t.start + t.len * q);
    for (const w of ['fetch', 'url', 'retry']) assert.equal(cells.find((c) => c.text === w).alpha, 1, `${w} at ${q}`);
  }
});

test('a kept token slides to its new place with the running cursor', () => {
  const m = buildModel('a b', 'edit\nxxxx b', { lang: 'js', tab: 2 });
  const t = stepTimes(m, 6, { intro: 0.6, morph: 1 })[0];
  const col = (q) => cellsAt(m, t.start + t.len * q).find((c) => c.text === 'b').col;
  assert.equal(col(0), 2);
  assert.equal(col(1), 5);
  assert.ok(col(0.5) > 2 && col(0.5) < 5);
});

test('a select step dims everything outside it to 0.2 and leaves the selected text at 1', () => {
  const m = model();
  const t = stepTimes(m, 6, { intro: 0.6, morph: 1 })[1];
  const done = cellsAt(m, t.start + t.len + 0.01);
  const a = (w) => done.find((c) => c.text === w).alpha;
  assert.equal(a('retry'), 1);
  assert.ok(Math.abs(a('fetch') - 0.2) < 1e-6);
  assert.ok(Math.abs(a('url') - 0.2) < 1e-6);
  const mid = cellsAt(m, t.start + t.len * 0.5);
  assert.ok(Math.abs(mid.find((c) => c.text === 'fetch').alpha - 0.6) < 1e-6, 'halfway between 1 and 0.2');
});

test('a selection that cuts a token splits it, so the range is exact', () => {
  const m = buildModel('abcdef', 'select "cd"', { lang: 'js', tab: 2 });
  const t = stepTimes(m, 6, { intro: 0.6, morph: 1 })[0];
  const cells = cellsAt(m, t.start + t.len + 0.01);
  const dim = cells.filter((c) => Math.abs(c.alpha - 0.2) < 1e-6).map((c) => c.text).join('');
  const lit = cells.filter((c) => c.alpha === 1).map((c) => c.text).join('');
  assert.equal(lit, 'cd');
  assert.equal(dim.replace(/\s/g, ''), 'abef');
});

test('a call step anchors boxes on the exact range and a label, shown once the step has run', () => {
  const m = buildModel(SRC, 'call "retry: 3" | Retries\n---\ncall none', { lang: 'js', tab: 2 });
  const times = stepTimes(m, 8, { intro: 0.6, morph: 1 });
  const f = (u) => frameAt(m, u, times, { ease, intro: 0.6 });
  assert.equal(f(1).call, null);
  const done = f(times[0].start + times[0].len + 0.01).call;
  assert.equal(done.label, 'Retries');
  assert.deepEqual(done.boxes.map((b) => [b.row, b.from, b.to]), [[1, 2, 10]]);
  assert.ok(done.alpha > 0.99);
  const gone = f(times[1].start + times[1].len + 0.01).call;
  assert.equal(gone, null);
});

test('every frame is a pure function of u: the same instants give the same cells in any order', () => {
  const m = model();
  const us = [0, 0.3, 0.7, 1.4, 2.2, 3.1, 4.4, 5.9, 6];
  const shot = (u) => JSON.stringify(cellsAt(m, u));
  const fwd = us.map(shot);
  const rev = [...us].reverse().map(shot).reverse();
  assert.deepEqual(rev, fwd);
});

test('at the end of the entrance the last state rests: every token drawn once, at full alpha where selected', () => {
  const m = buildModel(SRC, 'replace "retry: 3" => "retry: 5"', { lang: 'js', tab: 2 });
  const cells = cellsAt(m, 100);
  assert.equal(textOf(cells), 'fetch(url,{retry:5,})');
  assert.ok(cells.every((c) => c.alpha === 1));
});

test('syntax roles only: no cell carries a colour, only a role name from the eight', () => {
  const m = model();
  for (const c of cellsAt(m, 100)) {
    assert.ok(TOKEN_ROLES.includes(c.role) || c.role === 'space', c.role);
    assert.equal(c.color, undefined);
  }
});
