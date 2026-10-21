#!/usr/bin/env node
// mm pattern lint | list (SPEC §5, contracts/pattern-card.md, AXIOM 4). A pattern folder
// patterns/<group>/<name>/ is complete when it holds its group's files, a PATTERN.md with exactly
// the seven sections in order (each non-empty), provenance that PROVENANCE.md knows, no literal
// in its CSS or JS, none of the forbidden time sources, and a demo story that validates and uses
// it. Only complete patterns are listed.
//
//   node scripts/pattern-lint.mjs [lint|list] [name|folder|root=patterns/] [--json]
// `lint <name>` lints one pattern: `group/name` or a bare name unique across patterns/, or
// a pattern folder; any other folder is a root of group/name folders. Exit: 0 every pattern
// complete (lint) or listing printed (list); 1 any FAIL; 2 usage (unknown or ambiguous name).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rule } from './lib/report.mjs';
import { ROOT, contractError, cssLiterals, jsLiterals, refsOf, timeOffenders } from './check/_lib.mjs';

export const GROUPS = ['entrances', 'exits', 'emphasis', 'transitions', 'layouts', 'moves', 'text', 'data', 'devices', 'sound', 'screen', '3d'];
export const SECTIONS = ['Purpose', 'Use when / Do not use when', 'Params', 'Style variables consumed', 'Legibility and rest notes', 'Provenance', 'Known limits'];
const NEEDS_JS = new Set(['entrances', 'exits', 'emphasis', 'transitions', 'moves', 'data', 'sound', 'screen', '3d']);
const NEEDS_HTML = new Set(['layouts', 'text', 'data', 'devices', '3d']);

/** The card's `## ` sections in order: [{ title, body }], plus its `# ` title. */
export function parseCard(md) {
  const lines = md.replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const title = (lines.find((l) => /^# /.test(l)) ?? '').slice(2).trim();
  const sections = [];
  for (const l of lines) {
    if (/^## /.test(l)) sections.push({ title: l.slice(3).trim(), body: '' });
    else if (sections.length) sections.at(-1).body += l + '\n';
  }
  sections.forEach((s) => { s.body = s.body.trim(); });
  return { title, sections };
}

/**
 * Source names in PROVENANCE.md: only the rows of its source tables (a table whose header's
 * first cell is "Source"; the pattern-level credits table is not one). A row names its source by
 * the whole first cell and by each comma-separated name in it, parenthetical notes removed, so
 * "ManimCommunity/manim, three.js" names both. Normalised; a card source must equal one exactly.
 */
export function provenanceSources(file = join(ROOT, 'PROVENANCE.md')) {
  if (!existsSync(file)) return [];
  const out = new Set();
  let inSource = false, header = false;
  for (const l of readFileSync(file, 'utf8').split('\n')) {
    if (!/^\|/.test(l)) { inSource = false; header = false; continue; }
    const first = (l.split('|')[1] ?? '').trim();
    if (!header) { header = true; inSource = norm(first) === 'source'; continue; }
    if (!inSource || /^-+$/.test(first.replace(/[:\s]/g, ''))) continue;
    const cell = bare(first);
    if (cell) out.add(cell);
    for (const part of stripNotes(first).split(',')) { const n = norm(part); if (n) out.add(n); }
  }
  return [...out];
}
const norm = (s) => s.toLowerCase().replace(/[*`_[\]"“”]/g, ' ').replace(/\s+/g, ' ').trim();
const stripNotes = (s) => { let t = s, prev; do { prev = t; t = t.replace(/\([^()]*\)/g, ' '); } while (t !== prev); return t; };
const bare = (s) => norm(stripNotes(s));

/** Each line of a Provenance section that names a source: its name before the first comma. */
export function cardSources(body) {
  if (/^[-*\s]*`?original\b/i.test(body.split('\n')[0].trim())) return [];
  return body.split('\n').map((l) => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean).map((l) => l.split(',')[0].trim());
}

/** Lints one pattern folder. Returns { ref, group, name, complete, rules }. */
export function lintPattern(dir, { provenance = join(ROOT, 'PROVENANCE.md') } = {}) {
  dir = resolve(dir);
  const name = basename(dir), group = basename(dirname(dir)), ref = `${group}/${name}`;
  const card = [], prov = [], lit = [], time = [];
  const has = (f) => existsSync(join(dir, f));
  const read = (f) => readFileSync(join(dir, f), 'utf8');
  if (!GROUPS.includes(group)) card.push({ reason: `unknown group "${group}"` });
  const visual = group !== 'sound';
  const required = ['PATTERN.md', ...(NEEDS_JS.has(group) ? ['pattern.js'] : []), ...(NEEDS_HTML.has(group) ? ['pattern.html'] : []),
    ...(visual ? ['pattern.css', 'demo/story.json'] : ['demo/cue.json'])];
  for (const f of required) if (!has(f)) card.push({ file: `${ref}/${f}`, reason: `missing ${f}` });

  if (has('PATTERN.md')) {
    const { title, sections } = parseCard(read('PATTERN.md'));
    if (title !== ref) card.push({ file: `${ref}/PATTERN.md`, reason: `title "# ${title}" should be "# ${ref}"` });
    const got = sections.map((s) => s.title);
    if (got.join('|') !== SECTIONS.join('|')) {
      const missing = SECTIONS.filter((s) => !got.includes(s)), extra = got.filter((s) => !SECTIONS.includes(s));
      card.push({ file: `${ref}/PATTERN.md`, reason: missing.length || extra.length ? `sections ${[...missing.map((s) => `missing "${s}"`), ...extra.map((s) => `unexpected "${s}"`)].join(', ')}` : `sections out of order: ${got.join(' · ')}` });
    }
    for (const s of sections) if (SECTIONS.includes(s.title) && !s.body) card.push({ file: `${ref}/PATTERN.md`, reason: `section "${s.title}" is empty` });
    const params = sections.find((s) => s.title === 'Params');
    if (params) {
      for (const row of params.body.split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l)).slice(1)) {
        const def = (row.split('|')[3] ?? '').trim();
        if (/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\d\s*ms\b/i.test(def)) card.push({ file: `${ref}/PATTERN.md`, reason: `param default "${def}" is a literal; use a role or a unitless number` });
      }
    }
    const p = sections.find((s) => s.title === 'Provenance');
    if (p && p.body) {
      const known = provenanceSources(provenance);
      for (const src of cardSources(p.body)) {
        const n = bare(src);
        if (!n || !known.includes(n)) prov.push({ file: `${ref}/PATTERN.md`, measured: src, reason: `source "${src}" has no row in PROVENANCE.md` });
      }
    } else if (p) prov.push({ file: `${ref}/PATTERN.md`, reason: 'Provenance is empty: say `original` or name each source' });
    else prov.push({ file: `${ref}/PATTERN.md`, reason: 'no Provenance section' });
  } else {
    prov.push({ file: `${ref}/PATTERN.md`, reason: 'no card, so no provenance' });
  }

  if (has('pattern.css')) for (const h of cssLiterals(read('pattern.css'))) lit.push({ file: `${ref}/pattern.css`, line: h.line, measured: `${h.prop}: ${h.value}`, reason: h.kind });
  if (has('pattern.js')) {
    const js = read('pattern.js');
    for (const h of jsLiterals(js)) lit.push({ file: `${ref}/pattern.js`, line: h.line, measured: h.value, reason: h.kind });
    for (const h of timeOffenders(js)) time.push({ file: `${ref}/pattern.js`, line: h.line, measured: h.match, reason: `forbidden in pattern code: ${h.match}` });
  }

  if (visual && has('demo/story.json')) {
    let story = null;
    try { story = JSON.parse(read('demo/story.json')); } catch (e) { card.push({ file: `${ref}/demo/story.json`, reason: `invalid JSON: ${e.message}` }); }
    if (story) {
      const err = contractError('story', story);
      if (err) card.push({ file: `${ref}/demo/story.json`, reason: `demo story does not validate: ${err}` });
      else if (!refsOf(story).some((r) => r.ref === ref)) card.push({ file: `${ref}/demo/story.json`, reason: `demo story never uses ${ref}` });
    }
  }
  if (!visual && has('demo/cue.json')) {
    try { const c = JSON.parse(read('demo/cue.json')); if (!Array.isArray(c.at) || !c.at.length) card.push({ file: `${ref}/demo/cue.json`, reason: 'demo/cue.json names no `at` instants' }); }
    catch (e) { card.push({ file: `${ref}/demo/cue.json`, reason: `invalid JSON: ${e.message}` }); }
  }

  const row = (id, list) => (list.length ? rule(id, 'FAIL', { ...list[0], all: list }) : rule(id, 'PASS', {}));
  const rules = [row('G-PATTERN-CARD', card), row('G-PROVENANCE', prov), row('G-LITERAL', lit), row('G-TIME', time)];
  return { ref, group, name, dir, complete: rules.every((r) => r.status !== 'FAIL'), rules };
}

/** Every pattern folder under root (root/<group>/<name>/), linted. */
export function lintRoot(root = join(ROOT, 'patterns'), opts = {}) {
  root = resolve(root);
  const patterns = [];
  if (existsSync(root)) {
    for (const g of readdirSync(root).sort()) {
      const gd = join(root, g);
      if (g.startsWith('.') || !statSync(gd).isDirectory()) continue;
      for (const n of readdirSync(gd).sort()) {
        const pd = join(gd, n);
        if (!n.startsWith('.') && statSync(pd).isDirectory()) patterns.push(lintPattern(pd, opts));
      }
    }
  }
  return { root, patterns, complete: patterns.filter((p) => p.complete).map((p) => p.ref) };
}

export const listComplete = (root, opts) => lintRoot(root, opts).complete;

/** For `mm pattern list`: the complete patterns under root (default patterns/), as the lint judges them. */
export function list(root = join(ROOT, 'patterns'), opts = {}) { return listComplete(root, opts); }

const isPatternDir = (dir) => GROUPS.includes(basename(dirname(dir))) && ['PATTERN.md', 'pattern.js', 'pattern.html', 'pattern.css'].some((f) => existsSync(join(dir, f)));

/**
 * What `lint <arg>` names: { pattern } (one folder) or { root }, or { error }. `group/name` and a
 * bare name unique across patterns/ resolve to one library pattern; an existing folder is a pattern
 * when its parent is a group, else a root.
 */
export function resolveTarget(arg, library = join(ROOT, 'patterns')) {
  if (/^[a-z0-9]+\/[a-z0-9-]+$/.test(arg) && existsSync(join(library, arg)) && statSync(join(library, arg)).isDirectory()) return { pattern: join(library, arg) };
  if (/^[a-z0-9-]+$/.test(arg) && !existsSync(resolve(arg))) {
    const hits = existsSync(library) ? readdirSync(library).filter((g) => GROUPS.includes(g) && existsSync(join(library, g, arg))) : [];
    if (hits.length === 1) return { pattern: join(library, hits[0], arg) };
    if (hits.length > 1) return { error: `pattern name "${arg}" is ambiguous: ${hits.map((g) => `${g}/${arg}`).join(', ')}` };
    return { error: `no pattern named "${arg}" under ${relative(ROOT, library) || '.'}/` };
  }
  const dir = resolve(arg);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return { error: `no folder ${dir}` };
  return isPatternDir(dir) ? { pattern: dir } : { root: dir };
}

export function main(argv = process.argv.slice(2)) {
  let verb = 'lint', root = join(ROOT, 'patterns'), json = false;
  const pos = [];
  for (const a of argv) { if (a === '--json') json = true; else if (a.startsWith('--')) { console.error(`pattern-lint: unknown flag ${a}`); return 2; } else pos.push(a); }
  if (pos[0] === 'lint' || pos[0] === 'list') verb = pos.shift();
  if (pos.length > 1) { console.error('usage: node scripts/pattern-lint.mjs [lint|list] [name|folder] [--json]'); return 2; }
  let res;
  if (pos[0]) {
    const t = resolveTarget(pos[0]);
    if (t.error) { console.error(`pattern-lint: ${t.error}`); return 2; }
    if (t.pattern && verb === 'list') { console.error('pattern-lint: list takes a root folder, not one pattern'); return 2; }
    if (t.pattern) { const p = lintPattern(t.pattern); res = { root: dirname(dirname(t.pattern)), patterns: [p], complete: p.complete ? [p.ref] : [] }; }
    else root = t.root;
  }
  if (!existsSync(root)) { console.error(`pattern-lint: no folder ${root}`); return 2; }
  res ??= lintRoot(root);
  if (verb === 'list') {
    if (json) console.log(JSON.stringify({ root: relative(ROOT, res.root), complete: res.complete }, null, 2));
    else console.log(res.complete.join('\n'));
    return 0;
  }
  if (json) {
    console.log(JSON.stringify({ root: relative(ROOT, res.root), complete: res.complete,
      patterns: res.patterns.map((p) => ({ ref: p.ref, complete: p.complete, rules: p.rules })) }, null, 2));
  } else {
    for (const p of res.patterns) {
      const fails = p.rules.filter((r) => r.status === 'FAIL');
      console.log(`${fails.length ? 'FAIL' : 'PASS'}  ${p.ref}${fails.map((r) => `\n      ${r.id}: ${r.evidence.reason}${r.evidence.all.length > 1 ? ` (+${r.evidence.all.length - 1} more)` : ''}`).join('')}`);
    }
    console.log(`\n${res.complete.length} of ${res.patterns.length} patterns complete.`);
  }
  return res.patterns.every((p) => p.complete) ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
