// G-LOCAL (SPEC §2.6, AXIOM 7): everything travels with the piece. No http(s): anywhere
// in what the piece ships (XML namespace names excepted); every font file the style names and
// every request the page makes resolves inside the piece folder or the repo's runtime/kit, runtime/vendor,
// patterns/ or styles/fonts (a fixture piece may also use the repo's fixtures/, which is how the
// kit-smoke fixtures share their stubs); every request succeeds; every font face reports loaded.
// A dangling or undecodable font file is a FAIL naming the file, never a fallback face. At every
// rest, each visible text element (::before/::after included) must be painted only by web fonts the
// piece loads: a glyph the style's files lack falls back to a platform font, which fails (read with CDP CSS.getPlatformFontsForNode).
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { rule } from '../lib/report.mjs';
import { ROOT, auditInstants, isWithin, refsOf, resolvesPattern, round, sources, texts } from './_lib.mjs';

export const scope = 'format';

const NAMESPACES = /https?:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink|1999\/xhtml|1998\/Math\/MathML|XML\/1998\/namespace)/g;

export function allowedRoots(dir) {
  const roots = [dir, join(ROOT, 'runtime', 'kit'), join(ROOT, 'runtime', 'vendor'), join(ROOT, 'patterns'), join(ROOT, 'styles', 'fonts')];
  if (isWithin(dir, join(ROOT, 'fixtures'))) roots.push(join(ROOT, 'fixtures'));
  return roots;
}

/** Every file a prepared folder asset names: each frame of a sequence, each tile of a
 *  page. A missing one would paint a blank screen at the instants nobody samples. */
export function preparedMissing(dir, story) {
  const missing = [];
  const folders = new Set();
  for (const sc of story?.scenes ?? []) for (const b of sc.beats) {
    if (b.asset?.endsWith('/')) folders.add(b.asset);
    for (const a of b.screen ?? []) if ((a.do === 'screen/swap' || a.do === 'screen/compare') && a.params?.to?.endsWith('/')) folders.add(a.params.to);
  }
  for (const f of folders) {
    const manifest = join(dir, f, 'media.json');
    if (!existsSync(manifest)) { missing.push(relative(ROOT, manifest)); continue; }
    let m;
    try { m = JSON.parse(readFileSync(manifest, 'utf8')); } catch { missing.push(`${relative(ROOT, manifest)} (unreadable)`); continue; }
    const files = m.kind === 'sequence' ? Array.from({ length: m.frames }, (_, i) => `f${String(i + 1).padStart(5, '0')}.jpg`) : [...(m.tiles ?? []), ...(m.overlays ?? [])].map((t) => t.file);   // overlays too
    for (const name of files) if (!existsSync(join(dir, f, name))) missing.push(relative(ROOT, join(dir, f, name)));
  }
  return missing;
}

export default async function (ctx) {
  const bad = [];
  const roots = allowedRoots(ctx.dir);
  const inside = (file) => roots.some((r) => isWithin(file, r));
  const lost = preparedMissing(ctx.dir, ctx.story);
  if (lost.length) return rule('G-LOCAL', 'FAIL', { file: lost[0], reason: `${lost.length} file${lost.length > 1 ? 's' : ''} of a prepared asset missing (mm media prep, mm capture site)`, missing: lost.slice(0, 20) });

  for (const s of sources(ctx)) {
    if (s.ext === '.json') continue; // data, not shipped markup or code; style.json font files are checked below
    const text = s.text.replace(NAMESPACES, '');
    for (const m of text.matchAll(/https?:\/\/[^\s'"`)<>]*/gi)) {
      bad.push({ file: s.rel, line: text.slice(0, m.index).split('\n').length, measured: m[0], reason: 'network URL in a shipped file' });
    }
  }

  for (const face of Object.values(ctx.style.type)) {
    for (const f of face.files ?? []) {
      if (/^https?:/i.test(f.src)) { bad.push({ file: f.src, reason: 'font file is a network URL' }); continue; }
      const file = resolve(ctx.dir, f.src);
      if (!inside(file)) bad.push({ file: f.src, reason: `font file resolves outside the piece and the shared roots: ${relative(ROOT, file)}` });
      else if (!existsSync(file)) bad.push({ file: f.src, reason: `font file does not exist: ${relative(ROOT, file)}` });
    }
  }

  const mark = ctx.style.ground?.mark?.src;   // the ground mark travels like a font file
  if (mark) {
    const file = resolve(ctx.dir, mark);
    if (/^https?:/i.test(mark)) bad.push({ file: mark, reason: 'ground mark is a network URL' });
    else if (!inside(file)) bad.push({ file: mark, reason: `ground mark resolves outside the piece and the shared roots: ${relative(ROOT, file)}` });
    else if (!existsSync(file)) bad.push({ file: mark, reason: `ground mark does not exist: ${relative(ROOT, file)}` });
  }

  // A pattern the story names but the base lacks is G-PATTERN-REF's finding, not a travel failure.
  const unresolved = refsOf(ctx.story).filter((r) => !resolvesPattern(ctx.patternsBase, r.ref)).map((r) => join(ctx.patternsBase, r.ref));
  // A cue's sound module is optional for the page (the kit starts the cue on its beat's arrival and
  // the mixer reads the library's sound patterns), so its failed import is not a travel failure.
  for (const sc of ctx.story.scenes) for (const b of sc.beats) if (b.cue && !existsSync(join(ctx.patternsBase, 'sound', b.cue, 'pattern.js'))) unresolved.push(join(ctx.patternsBase, 'sound', b.cue));
  const origin = new URL(ctx.server.url).origin;
  for (const r of ctx.requests) {
    if (/^(data|blob|about):/.test(r.url)) continue;
    const u = new URL(r.url);
    if (u.origin !== origin) { bad.push({ file: r.url, reason: 'request leaves the machine' }); continue; }
    if (u.pathname === '/favicon.ico') continue;
    const file = resolve(ROOT, '.' + decodeURIComponent(u.pathname));
    const rel = relative(ROOT, file);
    if (!inside(file)) bad.push({ file: rel, reason: 'request resolves outside the piece and the shared roots' });
    else if ((r.failed || (r.status != null && r.status >= 400)) && !unresolved.some((d) => isWithin(file, d))) bad.push({ file: rel, reason: `request failed (${r.failed ?? r.status})` });
  }

  for (const f of ctx.meta.fonts ?? []) {
    if (f.status !== 'loaded') bad.push({ file: f.src, reason: `font ${f.family} ${f.weight} is ${f.status}: no fallback face may stand in` });
  }

  if (bad.length) return rule('G-LOCAL', 'FAIL', { file: bad[0].file, line: bad[0].line, measured: bad[0].measured, reason: bad[0].reason, all: bad.slice(0, 20) });

  const platform = [];
  let unread = 0, read = 0;
  for (const t of auditInstants(ctx.schedule)) {
    const s = await ctx.sample(t);
    for (const el of texts(s)) {
      if (!el.fonts) { unread++; continue; }
      read++;
      for (const f of el.fonts) if (!f.custom) platform.push({ instant: round(t), selector: el.selector, measured: `${f.family} (${f.glyphs} glyph${f.glyphs === 1 ? '' : 's'})`, text: el.text.slice(0, 60) });
    }
  }
  if (platform.length) {
    const p = platform[0];
    return rule('G-LOCAL', 'FAIL', { ...p, reason: `text painted by the platform font ${p.measured}, not by a face the piece ships: the style's files lack a glyph of "${p.text}"`, all: platform.slice(0, 20) });
  }
  if (unread && !read) return rule('G-LOCAL', 'SKIP', { partial: true, reason: 'partial: the platform fonts of the visible text could not be read (CDP CSS.getPlatformFontsForNode)' });
  return rule('G-LOCAL', 'PASS', { requests: ctx.requests.length, fonts: (ctx.meta.fonts ?? []).length, textChecked: read });
}
