// Shared by tests: a static walk of a module's import graph. Every module the entry reaches through
// `import … from`, `export … from` and `import(…)` with a literal must be a relative file; a `node:`
// built-in or a bare package name is reported. It cannot see `import(variable)`.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';

export function specifiers(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out = [];
  for (const re of [/\b(?:import|export)\s[^'"`;]*?\bfrom\s*(['"])([^'"]+)\1/g, /\bimport\s*(['"])([^'"]+)\1/g, /\bimport\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g]) {
    for (const m of code.matchAll(re)) out.push(m[2]);
  }
  return out;
}

/** { files: repo-relative paths reached, bad: what imports a built-in, a package or a missing file }. */
export function importGraph(entry) {
  const seen = new Set(), bad = [];
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      if (!spec.startsWith('./') && !spec.startsWith('../')) { bad.push(`${relative(ROOT, file)} imports ${spec}`); continue; }
      const next = resolve(dirname(file), spec);
      if (!existsSync(next)) { bad.push(`${relative(ROOT, file)} imports a missing ${spec}`); continue; }
      walk(next);
    }
  };
  walk(entry);
  return { files: [...seen].map((f) => relative(ROOT, f)), bad };
}
