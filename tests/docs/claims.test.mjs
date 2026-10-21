// The documents make claims about the tree: how many patterns and gate rules there are, which
// formats and presets exist, which version the grammar is, and which files they link to. This test
// reads those claims and compares them with the tree, so a document cannot drift quietly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const names = (dir, ext) => readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)).sort();

/** Markdown files that make claims: the top-level documents, docs/**, evals, the skill and the kit. */
function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = dir ? `${dir}/${name}` : name;
    if (rel === 'docs/private' || name === 'node_modules' || name.startsWith('.git')) continue;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (name.endsWith('.md')) out.push(rel);
  }
  return out;
}
const topLevel = readdirSync(ROOT).filter((f) => f.endsWith('.md'));
const claimDocs = [...new Set([...topLevel, ...walk('docs'), ...walk('evals'), 'skill/motion-machine/SKILL.md', 'runtime/kit/README.md', 'scripts/studio/README.md'])]
  .filter((f) => existsSync(join(ROOT, f)));
// Counts are claimed in prose by these documents; PROVENANCE and the golden demo copy use numbers of their own.
const countDocs = claimDocs.filter((f) => /^(README|AGENTS|GUIDE|CONTRIBUTING)\.md$|^docs\/|^skill\/motion-machine\/SKILL\.md$/.test(f));

/** What the text says outside fenced and inline code, so a command or a JSON sample is not read as a claim. */
const prose = (text) => text.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' ')).replace(/~~~[\s\S]*?~~~/g, '');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// ---- the facts of the tree ----
const patternCount = readdirSync(join(ROOT, 'patterns')).flatMap((g) => statSync(join(ROOT, 'patterns', g)).isDirectory()
  ? readdirSync(join(ROOT, 'patterns', g)).filter((n) => existsSync(join(ROOT, 'patterns', g, n, 'PATTERN.md'))) : []).length;
const ruleCount = readdirSync(join(ROOT, 'scripts/check')).filter((f) => /^[GW]-.+\.mjs$/.test(f)).length;
const FORMATS = [...new Set([...read('SPEC.md').matchAll(/^\| (\d+x\d+) (?:film|deck) \|/gm)].map((m) => m[1]))];
const PRESETS = names('styles/presets', '.json');
const BRANDS = names('styles/brands', '.json');

test('the tree has the things the claims count', () => {
  assert.ok(patternCount > 0 && ruleCount > 0);
  assert.deepEqual(FORMATS.slice().sort(), ['16x9', '1x1', '4x5', '9x16']);
  assert.ok(PRESETS.length >= 3 && BRANDS.length >= 3);
});

test('a document that counts the patterns counts them right', () => {
  let seen = 0;
  for (const f of countDocs) {
    const text = prose(read(f));
    for (const m of text.matchAll(/\b(\d+)\s+(?:brand-neutral\s+)?patterns\b/g)) {
      seen++;
      assert.equal(Number(m[1]), patternCount, `${f}:${lineOf(text, m.index)} says "${m[0]}"; patterns/ holds ${patternCount}`);
    }
  }
  assert.ok(seen > 0, 'no document states the pattern count; the claim is untested');
});

test('a document that counts the gate rules counts them right', () => {
  let seen = 0;
  for (const f of countDocs) {
    const text = prose(read(f));
    for (const m of text.matchAll(/\b(\d+)\s+(?:gate\s+)?(?:rules|checks)\b/g)) {
      seen++;
      assert.equal(Number(m[1]), ruleCount, `${f}:${lineOf(text, m.index)} says "${m[0]}"; scripts/check/ holds ${ruleCount} rules`);
    }
  }
  assert.ok(seen > 0, 'no document states the rule count; the claim is untested');
});

/** Runs of names in prose, such as "9x16, 4x5, 1x1 and 16x9" or "`editorial`, `kinetic` and `calm-product`". */
function runs(text, words) {
  const alt = words.map((w) => w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
  const item = `\`?(?:${alt})\`?`;
  const re = new RegExp(`(?<![\\w-])${item}(?:(?:,\\s*|\\s+and\\s+|\\s+or\\s+|,\\s+and\\s+|,\\s+or\\s+|\\s*\\|\\s*)${item})+(?![\\w-])`, 'g');
  return [...text.matchAll(re)].map((m) => ({ index: m.index, found: [...new Set(m[0].replace(/`/g, '').split(/[^\w-]+/).filter((w) => words.includes(w)))] }));
}

// A list that names three or more formats and includes 16x9 is a list of every format; a list of the
// feed formats ("9x16, 4x5 and 1x1") leaves 16x9 out on purpose and is not a claim about the set.
test('a list of the formats that includes 16x9 lists them all', () => {
  for (const f of claimDocs) {
    const text = prose(read(f));
    for (const r of runs(text, FORMATS)) {
      if (r.found.length < 3 || !r.found.includes('16x9')) continue;
      const missing = FORMATS.filter((x) => !r.found.includes(x));
      assert.deepEqual(missing, [], `${f}:${lineOf(text, r.index)} lists ${r.found.join(', ')} and leaves out ${missing.join(', ')}`);
    }
  }
});

test('a list of three or more presets lists them all; a list of brands lists them all', () => {
  for (const f of claimDocs) {
    const text = prose(read(f));
    for (const r of runs(text, PRESETS)) {
      if (r.found.length < 3) continue;
      const missing = PRESETS.filter((x) => !r.found.includes(x));
      assert.deepEqual(missing, [], `${f}:${lineOf(text, r.index)} lists presets ${r.found.join(', ')} and leaves out ${missing.join(', ')}`);
    }
    for (const r of runs(text, BRANDS)) {
      if (r.found.length < 3) continue;
      const missing = BRANDS.filter((x) => !r.found.includes(x));
      assert.deepEqual(missing, [], `${f}:${lineOf(text, r.index)} lists brands ${r.found.join(', ')} and leaves out ${missing.join(', ')}`);
    }
  }
});

test('the version in the title of SPEC.md is the version the gate stamps into out/check.json', () => {
  const title = /^# SPEC — Motion Machine grammar \(version (\d+\.\d+)\)$/m.exec(read('SPEC.md'));
  assert.ok(title, 'SPEC.md line 1 must read "# SPEC — Motion Machine grammar (version X.Y)"');
  const stamp = /SPEC_VERSION\s*=\s*'([^']+)'/.exec(read('scripts/lib/report.mjs'));
  assert.ok(stamp, 'SPEC_VERSION not found in scripts/lib/report.mjs');
  assert.equal(stamp[1], title[1]);
});

// ---- links ----
const slug = (heading) => heading.trim().toLowerCase().replace(/`/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
function anchors(file) {
  const out = new Set();
  const seen = new Map();
  for (const line of prose(read(file)).split('\n')) {
    const h = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!h) continue;
    const base = slug(h[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'));
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

test('every relative Markdown link in the top-level documents and docs/** resolves', () => {
  const docs = claimDocs.filter((f) => !f.includes('/') || f.startsWith('docs/') || f.startsWith('.github/'));
  const github = walk('.github').filter((f) => f.endsWith('.md'));
  const problems = [];
  let links = 0;
  for (const f of [...new Set([...docs, ...github])]) {
    const text = prose(read(f)).replace(/`[^`\n]*`/g, (m) => m.replace(/[^\n]/g, ' '));
    const targets = [...text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => ({ t: m[1], index: m.index }))
      .concat([...text.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm)].map((m) => ({ t: m[1], index: m.index })));
    for (const { t, index } of targets) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('//')) continue;
      links++;
      const [pathPart, hash] = t.split('#');
      const target = pathPart ? resolve(ROOT, dirname(f), decodeURIComponent(pathPart)) : resolve(ROOT, f);
      const where = `${f}:${lineOf(text, index)} -> ${t}`;
      if (!target.startsWith(ROOT) || !existsSync(target)) { problems.push(`${where} (no such file)`); continue; }
      if (hash && target.endsWith('.md') && !anchors(relative(ROOT, target)).has(decodeURIComponent(hash).toLowerCase())) problems.push(`${where} (no such heading)`);
    }
  }
  assert.deepEqual(problems, []);
  assert.ok(links > 0);
});

test('every repository path named in code spans of docs/ARCHITECTURE.md and docs/README.md exists', () => {
  const top = /^(?:runtime|scripts|patterns|contracts|tests|styles|skill|fixtures|pieces|docs|references|evals|\.github)\//;
  const problems = [];
  for (const f of ['docs/ARCHITECTURE.md', 'docs/README.md']) {
    if (!existsSync(join(ROOT, f))) { problems.push(`${f} is missing`); continue; }
    const text = read(f);
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
      const p = m[1].trim().replace(/[.,;:]$/, '');
      if (!top.test(p) || /[<>*{}…\s]/.test(p) || p.endsWith('/…')) continue;
      if (!existsSync(join(ROOT, p))) problems.push(`${f}:${lineOf(text, m.index)} names ${p}, which is not in the tree`);
    }
  }
  assert.deepEqual(problems, []);
});
