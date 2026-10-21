// Where a piece mounts its patterns from, read the one way every verb reads it. The gate, the
// studio, the timeline, the exporter and `mm sound` import `<base>/<ref>/pattern.js` in Node, so
// the base is code the user's machine runs: it comes only from the `patternsBase: new URL('…')`
// of the piece's module script (the inline script, or the file its `src` names), never from a
// comment or any other text of the page, and it must lie inside the repository.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT } from './browser.mjs';
import { UsageError } from './cli.mjs';

const inside = (file, dir) => file === dir || file.startsWith(dir + sep);

/** `text` with its comments blanked out; string and template literals are skipped over, not parsed as code. */
export function withoutComments(text, { html = false } = {}) {
  let out = '';
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (html && text.startsWith('<!--', i)) { const e = text.indexOf('-->', i + 4); i = e < 0 ? text.length : e + 3; out += ' '; continue; }
    if (!html && c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (!html && c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 2; out += ' '; continue; }
    if (!html && (c === '"' || c === "'" || c === '`')) {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

/** The module scripts of an index.html, as [{ file, source }]: inline ones and the files their `src` names. */
function moduleScripts(htmlFile) {
  const html = withoutComments(readFileSync(htmlFile, 'utf8'), { html: true });
  const found = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\btype\s*=\s*["']?module\b/i.test(m[1])) continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[1]);
    if (!src) { found.push({ file: htmlFile, source: m[2] }); continue; }
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(src[1])) continue;   // a script from another origin is not read
    const file = resolve(dirname(htmlFile), src[1]);
    if (existsSync(file)) found.push({ file, source: readFileSync(file, 'utf8') });
  }
  return found;
}

/**
 * The patterns folder the piece mounts with: the `patternsBase: new URL('…', import.meta.url)` of its
 * module script, else the repository's patterns/. A base that is not a file URL, or that lies outside
 * the repository (also through a symlink), is a setup error (exit 2) naming the piece.
 */
export function patternsBaseOf(dir) {
  const htmlFile = join(dir, 'index.html');
  if (!existsSync(htmlFile)) return join(ROOT, 'patterns');
  for (const { file, source } of moduleScripts(htmlFile)) {
    const m = /patternsBase\s*:\s*new URL\(\s*(['"`])([^'"`]+)\1/.exec(withoutComments(source));
    if (!m) continue;
    let base;
    try {
      const url = new URL(m[2], pathToFileURL(file));
      if (url.protocol !== 'file:') throw new Error('not a file URL');
      base = resolve(fileURLToPath(url));
    } catch { throw new UsageError(`${relative(ROOT, dir) || dir}: patternsBase ${m[2]} is not a folder inside the repository`); }
    const real = existsSync(base) ? realpathSync(base) : base;
    if (!inside(base, ROOT) || !inside(real, realpathSync(ROOT))) {
      throw new UsageError(`${relative(ROOT, dir) || dir}: patternsBase ${m[2]} lies outside the repository; patterns run as code, so a piece may only use patterns inside it`);
    }
    return base;
  }
  return join(ROOT, 'patterns');
}
