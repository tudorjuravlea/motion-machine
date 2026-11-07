// What the package ships must run: every relative import reachable from the scripts and the runtime
// resolves to a file the `files` list of package.json ships, and so does every top-level folder a
// script reads through `join(ROOT, '<folder>')`. (pack.test.mjs packs the tarball and runs it.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { specifiers } from '../check/_import-graph.mjs';

const { files: FILES } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const globToRe = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
const includes = FILES.filter((f) => !f.startsWith('!'));
const excludes = FILES.filter((f) => f.startsWith('!')).map((f) => globToRe(f.slice(1).replace(/^\*\*\//, '').replace(/\/$/, '')));

/** Whether package.json `files` ships the repo-relative path (npm's rules for the entries this list uses). */
function shipped(rel) {
  const path = rel.split(sep).join('/');
  if (!includes.some((inc) => (inc.endsWith('/') ? path.startsWith(inc) : path === inc))) return false;
  return !path.split('/').slice(0, -1).some((seg) => excludes.some((re) => re.test(seg)));
}

// runtime/skeletons/ holds the templates `mm new` copies (their kit import is rewritten for the new piece)
const sources = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
  const rel = join(dir, e.name);
  if (e.isDirectory()) return e.name === 'out' || e.name === 'skeletons' || e.name.startsWith('.') ? [] : sources(rel);
  return /\.(mjs|js)$/.test(e.name) ? [rel] : [];
});

test('the package is private: the supported use is a clone, so an accidental publish is refused', () => {
  assert.equal(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).private, true);
});

test('the files list ships the code and leaves out dot-folders, scratch folders and outputs', () => {
  for (const f of ['scripts/mm.mjs', 'runtime/kit/kit.js', 'scripts/lib/validate.mjs', 'patterns/entrances/rise/pattern.js', 'LICENSE']) assert.ok(shipped(f), f);
  for (const f of ['tests/cli/pack.test.mjs', 'scripts/.cache/x.js', 'scripts/.local-tool/x.js', '.tmp-cli-x/film/index.html', 'pieces/a/out/x.mp4', 'scripts/x/out/y.js', 'docs/ARCHITECTURE.md']) assert.ok(!shipped(f), f);
});

test('every relative import reachable from scripts/ and runtime/ resolves to a shipped file', () => {
  const entries = [...sources('scripts'), ...sources('runtime')].filter(shipped);
  assert.ok(entries.includes(join('scripts', 'mm.mjs')) && entries.length > 40);
  const seen = new Set(), problems = [];
  const walk = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    for (const spec of specifiers(readFileSync(join(ROOT, rel), 'utf8'))) {
      if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
      const next = relative(ROOT, resolve(dirname(join(ROOT, rel)), spec));
      if (!existsSync(join(ROOT, next))) problems.push(`${rel} imports ${spec}, which is not there`);
      else if (!shipped(next)) problems.push(`${rel} imports ${spec} (${next}), which the package does not ship`);
      else if (/\.(mjs|js)$/.test(next)) walk(next);
    }
  };
  entries.forEach(walk);
  assert.deepEqual(problems, []);
});

// folders the scripts only compare paths against, or look a piece up in; they read nothing from them
const NOT_READ = new Set(['.', 'package.json', 'fixtures', 'pieces']);

test('every top-level folder or file a shipped script reads from the repository root is shipped', () => {
  const problems = [];
  for (const rel of [...sources('scripts'), ...sources('runtime')].filter(shipped)) {
    for (const m of readFileSync(join(ROOT, rel), 'utf8').matchAll(/\bjoin\(\s*ROOT,\s*['"]([A-Za-z0-9._-]+)['"]/g)) {
      const top = m[1];
      if (!NOT_READ.has(top) && !FILES.some((f) => f === top || f === `${top}/`)) problems.push(`${rel} reads ${top}, which the package does not ship`);
    }
  }
  assert.deepEqual(problems, []);
});
