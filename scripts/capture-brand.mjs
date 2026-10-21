#!/usr/bin/env node
// `capture-brand --from <url|path/to/index.html|figma-export.json|DESIGN.md> --name <name> --out <piece>/capture/<name>.json`
// (`mm brand capture`, SPEC §13): reads a brand's look and writes a brand half plus
// `<out>.capture-notes.md` with the evidence for every guess. Best effort, and it says so: the
// director approves the composed style before it is used.
//
// Site heuristics (all measured on computed styles in headless Chromium):
//   canvas    = the background colour covering most of the page, by a grid of painted-area samples
//   ink       = the text colour with the most characters on the canvas
//   accent    = the most saturated colour (chroma >= 0.2) used on buttons, links and headings, other than ink/canvas
//   muted     = the next text colour on the canvas that is neither ink nor accent
//   surface   = the next most common background that is neither canvas nor accent
//   line      = the most common visible border colour
//   accentInk = the text colour with the most characters on the accent, else canvas or ink by contrast
//   type      = families by text length; display = headings, text = the rest, mono = monospace; each is mapped
//               to the nearest bundled family (name, then serif/sans/mono class) and its files are copied
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validators } from './lib/validate.mjs';
import { ROLES, parseDesignMd } from './export-designmd.mjs';
import { ROOT } from './lib/browser.mjs';
import { isArgsError, usageText } from './lib/cli.mjs';

export { ROOT };
const fail = (message, exitCode = 2) => Object.assign(new Error(message), { exitCode });
const explain = (v) => (v.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

// ---------------------------------------------------------------- colour maths

export const parseHex = (h) => { const x = h.replace('#', ''); const f = x.length <= 4 ? x.replace(/./g, '$&$&') : x; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
export const toHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
export const normHex = (h) => toHex(parseHex(h));
const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const luminance = (h) => { const [r, g, b] = parseHex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
export const chroma = (h) => { const c = parseHex(h); return (Math.max(...c) - Math.min(...c)) / 255; };
export const mix = (a, b, t) => { const [x, y] = [parseHex(a), parseHex(b)]; return toHex(x.map((v, i) => v * (1 - t) + y[i] * t)); };
const better = (bg, ...opts) => opts.reduce((best, o) => (contrast(o, bg) > contrast(best, bg) ? o : best));

// ---------------------------------------------------------------- bundled fonts and the banned list

const CLASS = { Fraunces: 'serif', Archivo: 'sans', Manrope: 'sans', 'IBM Plex Mono': 'mono' };
const PREFER = { display: ['Fraunces', 'Archivo', 'Manrope'], text: ['Manrope', 'Fraunces', 'Archivo'], mono: ['IBM Plex Mono'] };
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', '-apple-system', 'blinkmacsystemfont']);
const SERIF_NAME = /serif(?!.*sans)|georgia|times|garamond|playfair|baskerville|bodoni|didot|merriweather|lora|fraunces|cormorant|cinzel|prata|caslon|palatino|crimson|spectral|literata/i;
const MONO_NAME = /mono|code|courier|consolas|menlo|monaco|typewriter/i;

/** Bundled families as the shipped brand halves use them: { family -> { cls, files } }, files that exist on disk only. */
export function bundledFamilies() {
  const out = new Map();
  const dir = join(ROOT, 'styles', 'brands');
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith('.json')).sort() : []) {
    const b = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const face of Object.values(b.type ?? {})) {
      const e = out.get(face.family) ?? { family: face.family, cls: CLASS[face.family] ?? 'sans', files: [] };
      for (const file of face.files) if (!e.files.some((x) => x.src === file.src) && existsSync(join(ROOT, file.src))) e.files.push(file);
      out.set(face.family, e);
    }
  }
  return out;
}

/** The banned families: the `families` column of the table under "Banned fonts" in references/bans.md (advice only, SPEC §15). */
export function bannedFonts() {
  const p = join(ROOT, 'references', 'bans.md');
  if (!existsSync(p)) return [];
  const t = readFileSync(p, 'utf8');
  const section = t.match(/^## Banned fonts[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
  const cells = [...section.matchAll(/^\|[^|\n]*\|\s*([^|\n]+?)\s*\|/gm)].map((m) => m[1]).filter((c) => !/^[-: ]+$/.test(c) && c !== 'families');
  return [...new Set(cells.flatMap((c) => c.split(/,\s*/)).filter(Boolean))];
}

const normName = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const classify = (family, generic) => (generic?.includes('mono') || MONO_NAME.test(family) ? 'mono' : generic === 'serif' || generic === 'ui-serif' || SERIF_NAME.test(family) ? 'serif' : 'sans');

/** Nearest bundled family by name, then by class; returns the face fields (files copied from a shipped brand half). */
export function nearestBundled(role, family, generic, weight, tracking) {
  const catalogue = bundledFamilies();
  const cls = classify(family, generic);
  const exact = [...catalogue.values()].find((e) => normName(e.family) === normName(family));
  const byClass = PREFER[role].map((n) => catalogue.get(n)).filter(Boolean);
  const pick = exact ?? byClass.find((e) => e.cls === cls) ?? byClass[0];
  if (!pick) throw fail('no bundled font families found under styles/brands + styles/fonts');
  const weights = [...new Set(pick.files.map((f) => f.weight))];
  const snapped = weights.reduce((b, w) => (Math.abs(w - weight) < Math.abs(b - weight) ? w : b));
  return {
    face: { family: pick.family, weight: snapped, tracking: Math.max(-0.2, Math.min(0.5, Math.round(tracking * 1000) / 1000)), files: pick.files.map((f) => ({ ...f })) },
    how: exact ? 'same name' : pick.cls === cls ? `nearest by classification, ${cls}` : `no ${cls} family is bundled, so the ${role} default`,
    snappedFrom: snapped === weight ? null : weight, cls,
  };
}

// ---------------------------------------------------------------- reading a site

/** Runs inside the page. No closures over module scope. Returns raw tallies. */
function readPage() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (s) => {
    const m = s.match(/^rgba?\(([^)]+)\)$/);
    if (m) { const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); if (p.every((x) => !Number.isNaN(x))) return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = s; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255];
  };
  const hex = (c) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  const over = (top, base) => [0, 1, 2].map((i) => top[i] * top[3] + base[i] * (1 - top[3])).concat(1);
  const sel = (el) => { let s = el.tagName.toLowerCase(); if (el.id) s += `#${el.id}`; else if (typeof el.className === 'string' && el.className.trim()) s += `.${el.className.trim().split(/\s+/)[0]}`; return s; };
  const cache = new Map();
  const backdrop = (el) => {
    if (cache.has(el)) return cache.get(el);
    const layers = []; let owner = null;
    for (let e = el; e; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) { layers.push(c); owner ??= e; if (c[3] >= 0.99) break; }
    }
    if (!layers.some((l) => l[3] >= 0.99) && rgba(getComputedStyle(document.documentElement).backgroundColor)[3] === 0) {
      const b = rgba(getComputedStyle(document.body).backgroundColor); // CSS propagates the body's background to the whole canvas
      if (b[3] > 0) { layers.push(b); owner ??= document.body; }
    }
    let base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    const r = { hex: hex(base), owner: owner ? sel(owner) : 'html (default white)' };
    cache.set(el, r); return r;
  };

  const bg = new Map(); let samples = 0;
  const stepX = Math.max(8, Math.floor(innerWidth / 64)); const stepY = Math.max(8, Math.floor(innerHeight / 96));
  for (let y = stepY / 2; y < innerHeight; y += stepY) {
    for (let x = stepX / 2; x < innerWidth; x += stepX) {
      const el = document.elementFromPoint(x, y); if (!el) continue;
      const b = backdrop(el); samples++;
      const e = bg.get(b.hex) ?? { n: 0, sel: b.owner }; e.n++; bg.set(b.hex, e);
    }
  }

  const texts = []; const accent = [];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE', 'HEAD', 'TEMPLATE']);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const BTN = 'button, [role=button], input[type=submit], input[type=button], .btn, .button, a[class*=button], a[class*=btn]';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const len = node.nodeValue.replace(/\s+/g, ' ').trim().length; const el = node.parentElement;
    if (!len || !el || SKIP.has(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || el.getClientRects().length === 0) continue;
    const back = backdrop(el); const baseRgb = [...rgba(`#${back.hex.slice(1)}`)];
    const col = hex(over(rgba(cs.color), baseRgb));
    const kind = el.closest('code, pre, kbd, samp') ? 'code' : el.closest('h1, h2, h3, h4, h5, h6') ? 'heading' : 'body';
    const size = parseFloat(cs.fontSize);
    texts.push([col, back.hex, len, sel(el), kind, cs.fontFamily, parseInt(cs.fontWeight, 10) || 400, size, cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0]);
    const inBtn = el.closest(BTN);
    if (inBtn) accent.push([col, 'button text', len, sel(inBtn)]);
    else if (el.closest('a')) accent.push([col, 'link', len, sel(el.closest('a'))]);
    else if (kind === 'heading') accent.push([col, 'heading', len, sel(el)]);
  }
  for (const b of document.querySelectorAll(BTN)) {
    if (b.getClientRects().length === 0) continue;
    const c = rgba(getComputedStyle(b).backgroundColor);
    if (c[3] > 0.5) accent.push([hex(c), 'button background', 1, sel(b)]);
  }

  const borders = new Map();
  for (const el of document.body.querySelectorAll('*')) {
    if (SKIP.has(el.tagName) || el.getClientRects().length === 0) continue;
    const cs = getComputedStyle(el); const own = hex(rgba(cs.backgroundColor)); const back = backdrop(el).hex;
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (!(parseFloat(cs[`border${side}Width`]) > 0) || /none|hidden/.test(cs[`border${side}Style`])) continue;
      const c = rgba(cs[`border${side}Color`]); if (c[3] === 0) continue;
      const h = hex(over(c, rgba(`#${back.slice(1)}`))); if (h === back || h === own) continue;
      const e = borders.get(h) ?? { n: 0, sel: sel(el) }; e.n++; borders.set(h, e);
    }
  }
  return { samples, bg: [...bg], texts, accent, borders: [...borders] };
}

const MAX_STAGED_FILE = 50 * 1024 * 1024;
const MAX_STAGED_FILES = 500;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/** The local files a page or stylesheet names: src, poster, srcset, <link href>, url(…) and @import. */
function referencesOf(text) {
  const refs = [];
  for (const m of text.matchAll(/\b(?:src|poster|data-src)\s*=\s*(["'])(.*?)\1/gis)) refs.push(m[2]);
  for (const m of text.matchAll(/\bsrcset\s*=\s*(["'])(.*?)\1/gis)) for (const c of m[2].split(',')) refs.push(c.trim().split(/\s+/)[0]);
  for (const m of text.matchAll(/<link\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1/gis)) refs.push(m[2]);
  for (const m of text.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gis)) refs.push(m[2]);
  for (const m of text.matchAll(/@import\s+(["'])(.*?)\1/gi)) refs.push(m[2]);
  return refs.map((r) => r.trim()).filter((r) => r && !EXTERNAL.test(r)).map((r) => { try { return decodeURI(r.split(/[?#]/)[0]); } catch { return r.split(/[?#]/)[0]; } });
}

/**
 * A temporary folder that holds a saved page and only the files it (and its stylesheets) reference
 * from its own folder or below, laid out as they were. The page is served from there, so it cannot
 * read a neighbouring file it never named. Returns { dir, entry, files, remove }.
 */
export function stageLocalSite(htmlFile) {
  const abs = resolve(htmlFile); const base = dirname(abs);
  const dir = mkdtempSync(join(tmpdir(), 'mm-brand-site-'));
  const files = []; const seen = new Set();
  const take = (file) => {
    if (seen.has(file) || files.length >= MAX_STAGED_FILES) return;
    seen.add(file);
    const rel = relative(base, file);
    if (!rel || rel.startsWith('..') || rel.split(sep).some((seg) => seg.startsWith('.')) || !existsSync(file)) return;
    const st = statSync(file);
    if (!st.isFile() || st.size > MAX_STAGED_FILE) return;
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    copyFileSync(file, join(dir, rel));
    files.push(join(dir, rel));
    if (/\.css$/i.test(file)) for (const r of referencesOf(readFileSync(file, 'utf8'))) take(resolve(dirname(file), r));
  };
  take(abs);
  for (const r of referencesOf(readFileSync(abs, 'utf8'))) take(resolve(base, r));
  return { dir, entry: basename(abs), files, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

async function readSite(target) {
  const { launchBrowser, serveRoot } = await import('./lib/browser.mjs');
  const remote = /^https?:\/\//i.test(target);
  let server = null; let staged = null; let url = target;
  if (!remote) {
    staged = stageLocalSite(target);
    server = await serveRoot(staged.dir);
    url = `${server.url}/${encodeURIComponent(staged.entry)}`;
  }
  let browser;
  try {
    // a saved page is as untrusted as the site it came from: sandboxed, and offline except for its own staged files
    browser = await launchBrowser({ untrusted: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    if (!remote) {
      await ctx.route('**/*', (route) => (route.request().url().startsWith(`${server.url}/`) ? route.continue() : route.abort()));
      await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    }
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
    await page.evaluate(() => document.fonts.ready);
    const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    await page.setViewportSize({ width: 1440, height: Math.min(Math.max(h, 900), 6000) });
    return { raw: await page.evaluate(readPage), pageHeight: h };
  } finally { await browser?.close(); if (server) await server.close(); staged?.remove(); }
}

const tally = (rows, keyOf, weightOf) => { const m = new Map(); for (const r of rows) { const k = keyOf(r); const e = m.get(k) ?? { key: k, n: 0, sel: r[3] ?? r.sel }; e.n += weightOf(r); m.set(k, e); } return [...m.values()].sort((a, b) => b.n - a.n); };
const famOf = (stack) => { const parts = stack.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')); return { family: parts.find((p) => !GENERIC.has(p.toLowerCase())) ?? parts[0], generic: parts.find((p) => GENERIC.has(p.toLowerCase()))?.toLowerCase() ?? null }; };
const pct = (n, total) => `${Math.round((1000 * n) / total) / 10}%`;

/** Maps raw page tallies to the seven roles and three faces, each with its evidence line. */
export function mapSite(raw) {
  const roles = {}; const faces = {}; const T = raw.samples || 1;
  const bgs = raw.bg.map(([key, v]) => ({ key, n: v.n, sel: v.sel })).sort((a, b) => b.n - a.n);
  const canvas = bgs[0];
  roles.canvas = { hex: canvas.key, evidence: `covers ${pct(canvas.n, T)} of the painted page (${canvas.n} of ${T} grid samples), painted by ${canvas.sel}` };

  const onCanvas = raw.texts.filter((t) => t[1] === canvas.key);
  const inkRows = tally(onCanvas.length ? onCanvas : raw.texts, (t) => t[0], (t) => t[2]);
  const ink = inkRows[0];
  const charsOnCanvas = (onCanvas.length ? onCanvas : raw.texts).reduce((s, t) => s + t[2], 0);
  roles.ink = { hex: ink.key, evidence: `${ink.n} of ${charsOnCanvas} text characters on the canvas (${pct(ink.n, charsOnCanvas)}), e.g. ${ink.sel}` };

  const cands = tally(raw.accent.filter((a) => a[0] !== canvas.key && a[0] !== ink.key), (a) => a[0], (a) => a[2])
    .map((c) => ({ ...c, c: chroma(c.key), kinds: [...new Set(raw.accent.filter((a) => a[0] === c.key).map((a) => a[1]))] }));
  const sat = cands.filter((c) => c.c >= 0.2).sort((a, b) => b.c - a.c || b.n - a.n);
  if (sat[0]) roles.accent = { hex: sat[0].key, evidence: `most saturated colour on buttons, links and headings (chroma ${sat[0].c.toFixed(2)}; ${sat[0].kinds.join(', ')}; ${cands.length} candidate colours), e.g. ${sat[0].sel}` };
  else if (cands[0]) roles.accent = { hex: cands[0].key, derived: true, evidence: `GUESS: no saturated colour on buttons, links or headings; took the most used (${cands[0].kinds.join(', ')}), e.g. ${cands[0].sel}` };
  else roles.accent = { hex: ink.key, derived: true, evidence: 'GUESS: no button, link or heading colour differs from ink and canvas, so the accent is the ink' };

  const mutedRow = tally(onCanvas, (t) => t[0], (t) => t[2]).find((r) => r.key !== ink.key && r.key !== roles.accent.hex);
  roles.muted = mutedRow
    ? { hex: mutedRow.key, evidence: `second text colour on the canvas (${mutedRow.n} characters), e.g. ${mutedRow.sel}` }
    : { hex: mix(ink.key, canvas.key, 0.45), derived: true, evidence: 'GUESS: only one text colour on the canvas; mixed 45% from ink towards canvas' };

  const surf = bgs.find((b) => b.key !== canvas.key && b.key !== roles.accent.hex);
  roles.surface = surf
    ? { hex: surf.key, evidence: `most common non-canvas background, ${pct(surf.n, T)} of the painted page (${surf.n} samples), painted by ${surf.sel}` }
    : { hex: mix(canvas.key, ink.key, 0.04), derived: true, evidence: 'GUESS: no second background colour on the page; canvas mixed 4% towards ink' };

  const bd = raw.borders.map(([key, v]) => ({ key, n: v.n, sel: v.sel })).sort((a, b) => b.n - a.n)[0];
  roles.line = bd
    ? { hex: bd.key, evidence: `most common visible border colour (${bd.n} border sides), e.g. ${bd.sel}` }
    : { hex: mix(canvas.key, ink.key, 0.14), derived: true, evidence: 'GUESS: no visible borders on the page; canvas mixed 14% towards ink' };

  const onAccent = tally(raw.texts.filter((t) => t[1] === roles.accent.hex && t[0] !== roles.accent.hex), (t) => t[0], (t) => t[2])[0];
  roles.accentInk = onAccent
    ? { hex: onAccent.key, evidence: `text colour on the accent background (${onAccent.n} characters), e.g. ${onAccent.sel}` }
    : { hex: better(roles.accent.hex, canvas.key, ink.key), derived: true, evidence: 'GUESS: no text sits on the accent; took whichever of canvas and ink contrasts more with it' };

  // type
  const rows = raw.texts.map((t) => ({ ...famOf(t[5]), kind: t[4], len: t[2], weight: t[6], size: t[7], track: t[8], sel: t[3] }));
  const isMono = (r) => r.kind === 'code' || r.generic?.includes('mono') || MONO_NAME.test(r.family);
  const stats = (subset) => {
    const fam = tally(subset, (r) => r.family, (r) => r.len)[0]; if (!fam) return null;
    const mine = subset.filter((r) => r.family === fam.key); const chars = mine.reduce((s, r) => s + r.len, 0);
    const weight = tally(mine, (r) => r.weight, (r) => r.len)[0].key;
    const track = mine.reduce((s, r) => s + (r.track / r.size) * r.len, 0) / chars;
    const tags = [...new Set(mine.map((r) => r.sel.split(/[.#]/)[0]))].slice(0, 3).join(', ');
    return { family: fam.key, generic: mine.find((r) => r.generic)?.generic ?? null, chars, weight: Number(weight), track, sel: fam.sel, tags, total: subset.reduce((s, r) => s + r.len, 0) };
  };
  const heading = stats(rows.filter((r) => r.kind === 'heading' && !isMono(r)));
  const body = stats(rows.filter((r) => r.kind === 'body' && !isMono(r))) ?? heading;
  const mono = stats(rows.filter(isMono));
  const ev = (s, what) => `${s.family} (declared${s.generic ? `, ${s.generic} fallback` : ''}) carries ${s.chars} of ${s.total} ${what} characters, weight ${s.weight}, tracking ${Math.round(s.track * 1000) / 1000}em, on ${s.tags}`;
  if (body) faces.text = { ...body, evidence: ev(body, 'body') };
  if (heading) faces.display = { ...heading, evidence: ev(heading, 'heading') };
  if (mono) faces.mono = { ...mono, evidence: ev(mono, 'monospace') };
  const seen = [...new Set(rows.map((r) => r.family))];
  return { roles, faces, seen };
}

// ---------------------------------------------------------------- reading tokens (Figma, DESIGN.md)

const WEIGHTS = { thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400, book: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, heavy: 800, black: 900 };
const weightOf = (v) => (typeof v === 'number' ? v : typeof v === 'string' ? (/^\d+$/.test(v) ? Number(v) : WEIGHTS[v.toLowerCase().replace(/[\s-]/g, '').replace(/italic$/, '')] ?? null) : null);
const colourOfValue = (v) => {
  const m = typeof v === 'string' ? v.trim().match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i) : null;
  if (m) return normHex(m[1].length <= 4 ? m[1].slice(0, 3).replace(/./g, '$&$&') : m[1].slice(0, 6));
  if (v && typeof v === 'object' && ['r', 'g', 'b'].every((k) => typeof v[k] === 'number')) { const s = [v.r, v.g, v.b].every((x) => x <= 1) ? 255 : 1; return toHex([v.r * s, v.g * s, v.b * s]); }
  return null;
};
const NOISE = /^(\d+|paints|fills|fill|color|colors|value|\$value|variables|meta|styles|textStyles|text|tokens)$/;

/** Colours and text styles from a Figma variables export, a Figma styles export, a tokens-style JSON or a DESIGN.md token object. */
export function extractTokens(json) {
  const colors = []; const fonts = [];
  const nameOf = (path) => path.filter((p) => !NOISE.test(p) || path.length === 1).join('/') || path.join('/');
  const font = (node, path) => {
    const family = node.fontFamily ?? node.family ?? node['font-family'] ?? node.fontName?.family;
    if (typeof family !== 'string') return false;
    const size = typeof node.fontSize === 'number' ? node.fontSize : parseFloat(node.fontSize);
    let tr = node.letterSpacing; if (tr && typeof tr === 'object') tr = tr.unit === 'PERCENT' ? tr.value / 100 : tr.value / (size || 16);
    else if (typeof tr === 'string') tr = tr.endsWith('em') ? parseFloat(tr) : parseFloat(tr) / (size || 16);
    fonts.push({ name: nameOf(path), family, weight: weightOf(node.fontWeight ?? node.weight ?? node.fontName?.style), size: Number.isFinite(size) ? size : null, tracking: Number.isFinite(tr) ? tr : 0 });
    return true;
  };
  const walk = (node, path) => {
    const c = colourOfValue(node); if (c) { colors.push({ name: nameOf(path), hex: c }); return; }
    if (Array.isArray(node)) { node.forEach((item, i) => walk(item, [...path, item && typeof item === 'object' && typeof item.name === 'string' ? item.name : String(i)])); return; }
    if (!node || typeof node !== 'object') return;
    if (font(node, path)) return;
    if ('$value' in node || ('value' in node && typeof node.value !== 'object')) { const v = node.$value ?? node.value; const cv = colourOfValue(v); if (cv) colors.push({ name: nameOf(path), hex: cv }); else if (v && typeof v === 'object') font(v, path); return; }
    for (const [k, v] of Object.entries(node)) if (k !== 'name' && !k.startsWith('$')) walk(v, [...path, k]);
  };
  if (json?.meta?.variables) { // Figma REST: GET /v1/files/:key/variables/local
    const cols = json.meta.variableCollections ?? {};
    for (const v of Object.values(json.meta.variables)) {
      const mode = cols[v.variableCollectionId]?.defaultModeId ?? Object.keys(v.valuesByMode ?? {})[0];
      const val = v.valuesByMode?.[mode];
      if (v.resolvedType === 'COLOR') { const c = colourOfValue(val); if (c) colors.push({ name: v.name, hex: c }); }
      else if (v.resolvedType === 'STRING' && /font.*family|typeface/i.test(v.name) && typeof val === 'string') fonts.push({ name: v.name, family: val, weight: null, size: null, tracking: 0 });
    }
    const { meta, ...rest } = json; walk(rest, []);
  } else walk(json, []);
  const dedupe = (xs, k) => xs.filter((x, i) => xs.findIndex((y) => k(y) === k(x)) === i);
  return { colors: dedupe(colors, (c) => `${c.name}|${c.hex}`), fonts: dedupe(fonts, (f) => `${f.name}|${f.family}`) };
}

const words = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s/_.\-]+/).filter(Boolean).join(' ');
const EXACT = { canvas: 'canvas', ink: 'ink', muted: 'muted', surface: 'surface', line: 'line', accent: 'accent', 'accent ink': 'accentInk' };
const NAME_RULES = [
  ['accentInk', /\b(on (primary|accent|brand|cta|action)|(primary|accent|brand|cta|button) (text|foreground|fg|ink|label|contrast)|(text|foreground|fg) on (primary|accent|brand))\b/],
  ['ink', /\bon (background|surface|canvas|page|base)\b/],
  ['line', /\b(border|line|divider|outline|stroke|separator|hairline|rule)\b/],
  ['muted', /\b(muted|subtle|secondary (text|foreground|fg|ink|content)|(text|foreground|fg|content) (secondary|tertiary|muted|subtle)|tertiary|caption|placeholder|variant)\b/],
  ['surface', /\b(surface|card|panel|container|elevated|tile|sheet|layer)\b/],
  ['canvas', /\b(canvas|background|bg|page|base|app)\b/],
  ['ink', /\b(ink|foreground|fg|text|body|heading|content|copy)\b/],
  ['accent', /\b(accent|primary|brand|cta|action|highlight|link|interactive)\b/],
];
export function roleOfColourName(name) {
  const w = words(name); if (EXACT[w]) return EXACT[w];
  const last = w.split(' ').slice(-2).join(' '); if (EXACT[last]) return EXACT[last];
  return NAME_RULES.find(([, re]) => re.test(w))?.[0] ?? null;
}
export function roleOfFontName(name) {
  const w = words(name);
  if (/\b(mono|code|courier)\b/.test(w)) return 'mono';
  if (/\b(display|heading|headline|title|hero|h[1-3])\b/.test(w)) return 'display';
  if (/\b(body|text|paragraph|copy|base|label|caption|ui|sans|serif)\b/.test(w)) return 'text';
  return null;
}

/** Roles and faces from named tokens; unnamed gaps are derived and marked GUESS. */
export function mapTokens({ colors, fonts }, where) {
  const roles = {}; const used = new Set();
  for (const role of ROLES) {
    const hits = colors.filter((c) => roleOfColourName(c.name) === role);
    if (hits[0]) { roles[role] = { hex: hits[0].hex, evidence: `named "${hits[0].name}" in ${where}${hits.length > 1 ? ` (first of ${hits.length} candidates: ${hits.map((h) => h.name).join(', ')})` : ''}` }; used.add(hits[0].hex); }
  }
  const spare = colors.filter((c) => !used.has(c.hex) && c.hex !== roles.canvas?.hex && c.hex !== roles.ink?.hex);
  if (!roles.canvas && !roles.ink && !colors.length) throw fail(`no colours found in ${where}`);
  if (!roles.canvas) {
    const ink = roles.ink?.hex ?? colors[0].hex;
    roles.canvas = { hex: luminance(ink) < 0.4 ? mix(ink, '#FFFFFF', 0.96) : mix(ink, '#000000', 0.94), derived: true, evidence: 'GUESS: no token reads as a background; derived from the ink' };
  }
  if (!roles.ink) roles.ink = { hex: luminance(roles.canvas.hex) > 0.4 ? mix(roles.canvas.hex, '#000000', 0.9) : mix(roles.canvas.hex, '#FFFFFF', 0.92), derived: true, evidence: 'GUESS: no token reads as text; derived from the canvas' };
  const { canvas: c, ink: i } = { canvas: roles.canvas.hex, ink: roles.ink.hex };
  if (!roles.accent) {
    const s = spare.filter((x) => chroma(x.hex) >= 0.2).sort((a, b) => chroma(b.hex) - chroma(a.hex))[0];
    roles.accent = s ? { hex: s.hex, derived: true, evidence: `GUESS: no token is named like an accent; the most saturated unassigned colour, "${s.name}"` } : { hex: i, derived: true, evidence: 'GUESS: no accent token; the ink stands in' };
  }
  roles.muted ??= { hex: mix(i, c, 0.45), derived: true, evidence: 'GUESS: no token reads as secondary text; ink mixed 45% towards canvas' };
  roles.surface ??= { hex: mix(c, i, 0.04), derived: true, evidence: 'GUESS: no token reads as a surface; canvas mixed 4% towards ink' };
  roles.line ??= { hex: mix(c, i, 0.14), derived: true, evidence: 'GUESS: no token reads as a border; canvas mixed 14% towards ink' };
  roles.accentInk ??= { hex: better(roles.accent.hex, c, i), derived: true, evidence: 'GUESS: no token reads as text on the accent; whichever of canvas and ink contrasts more' };

  const faces = {};
  for (const f of fonts) {
    const role = roleOfFontName(f.name);
    if (role && !faces[role]) faces[role] = { family: f.family, generic: null, weight: f.weight ?? (role === 'display' ? 700 : 400), track: f.tracking ?? 0, evidence: `named "${f.name}" in ${where}` };
  }
  for (const f of fonts) if (!faces.text && MONO_NAME.test(f.family) === false && !Object.values(faces).some((x) => x.family === f.family)) faces.text = { family: f.family, generic: null, weight: f.weight ?? 400, track: f.tracking ?? 0, evidence: `first unnamed text style "${f.name}" in ${where}` };
  return { roles, faces, seen: [...new Set(fonts.map((f) => f.family))] };
}

const pxOf = (v) => { if (typeof v === 'number') return v; const m = String(v).match(/^(-?[\d.]+)\s*(px|rem|em)?$/); return m ? Number(m[1]) * (m[2] === 'px' || !m[2] ? 1 : 16) : null; };

// ---------------------------------------------------------------- stills

const STILL = /\.(png|jpe?g|webp)$/i;
// every still decoded small (96 px wide) to RGB, every second pixel kept: enough to find a palette
function readStills(folder) {
  const files = readdirSync(folder).filter((f) => STILL.test(f)).sort();
  if (!files.length) throw fail(`no stills (.png, .jpg, .webp) and no index.html in ${folder}`);
  const px = [];
  for (const f of files) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', join(folder, f), '-vf', 'scale=96:-2:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 << 20 });
    if (r.status !== 0) throw fail(`could not read ${f}: ${String(r.stderr).trim()}`);
    for (let i = 0; i + 2 < r.stdout.length; i += 6) px.push([r.stdout[i], r.stdout[i + 1], r.stdout[i + 2]]);
  }
  return { files, px };
}
// k-means with a deterministic farthest-point start (the most common colour, then each time the
// pixel farthest from every centre so far), so a small accent gets its own centre and the same
// stills always give the same palette
export function clusters(px, k = 8, rounds = 14) {
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const freq = new Map(); for (const c of px) { const key = (c[0] << 16) | (c[1] << 8) | c[2]; freq.set(key, (freq.get(key) ?? 0) + 1); }
  let top = 0, tn = -1; for (const [key, v] of freq) if (v > tn) { tn = v; top = key; }
  let cs = [[top >> 16, (top >> 8) & 255, top & 255]];
  const near = px.map((c) => d2(c, cs[0]));
  while (cs.length < k) {
    let far = -1, fd = 0; near.forEach((d, i) => { if (d > fd) { fd = d; far = i; } });
    if (far < 0 || fd < 100) break;   // nothing left further than 10 levels from a centre
    cs.push([...px[far]]);
    px.forEach((c, i) => { const d = d2(c, px[far]); if (d < near[i]) near[i] = d; });
  }
  let assign = new Array(px.length).fill(0);
  for (let r = 0; r < rounds; r++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    px.forEach((c, i) => {
      let best = 0, bd = Infinity;
      cs.forEach((m, j) => { const d = (c[0] - m[0]) ** 2 + (c[1] - m[1]) ** 2 + (c[2] - m[2]) ** 2; if (d < bd) { bd = d; best = j; } });
      assign[i] = best; const s = sum[best]; s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; s[3]++;
    });
    cs = cs.map((m, j) => (sum[j][3] ? [sum[j][0] / sum[j][3], sum[j][1] / sum[j][3], sum[j][2] / sum[j][3]] : m));
  }
  const n = cs.map(() => 0); for (const a of assign) n[a]++;
  // each centre snaps to its cluster's most frequent exact colour: flat brand colours come back
  // exactly, and the blended edge pixels a downscale makes do not pull them off
  const modes = cs.map(() => new Map());
  px.forEach((c, i) => { const key = (c[0] << 16) | (c[1] << 8) | c[2]; const m = modes[assign[i]]; m.set(key, (m.get(key) ?? 0) + 1); });
  cs = cs.map((m, j) => { let best = null, bn = 0; for (const [key, v] of modes[j]) if (v > bn) { bn = v; best = key; } return best == null ? m : [best >> 16, (best >> 8) & 255, best & 255]; });
  // merge near-identical centres (k is generous), then sort by area
  const out = [];
  cs.forEach((m, j) => { if (!n[j]) return; const hex = toHex(m); const twin = out.find((o) => parseHex(o.hex).every((v, i) => Math.abs(v - parseHex(hex)[i]) < 10));
    if (twin) twin.share += n[j] / px.length; else out.push({ hex, share: n[j] / px.length }); });
  return out.sort((a, b) => b.share - a.share);
}
function mapStills(found, files) {
  const pct = (x) => `${Math.round(x * 1000) / 10}%`;
  const where = `across ${files.length} still${files.length > 1 ? 's' : ''}`;
  const roles = {};
  const canvas = found[0];
  roles.canvas = { hex: canvas.hex, evidence: `sampled, ${pct(canvas.share)} of the pixels ${where}: the largest area` };
  const inkC = found.filter((c) => c !== canvas && c.share >= 0.01).sort((a, b) => contrast(b.hex, canvas.hex) - contrast(a.hex, canvas.hex))[0];
  roles.ink = inkC ? { hex: inkC.hex, evidence: `sampled, ${pct(inkC.share)} of the pixels ${where}: the strongest contrast with the canvas` }
    : { hex: luminance(canvas.hex) > 0.4 ? mix(canvas.hex, '#000000', 0.9) : mix(canvas.hex, '#FFFFFF', 0.92), derived: true, evidence: 'GUESS: no second colour covers 1 % of the frames; derived from the canvas' };
  const acc = found.filter((c) => c !== canvas && c.hex !== roles.ink.hex && c.share >= 0.003 && chroma(c.hex) >= 0.2).sort((a, b) => chroma(b.hex) - chroma(a.hex))[0];
  roles.accent = acc ? { hex: acc.hex, evidence: `sampled, ${pct(acc.share)} of the pixels ${where}: the most saturated colour` } : { hex: roles.ink.hex, derived: true, evidence: 'GUESS: no saturated colour in the frames; the ink stands in (asked)' };
  const c = roles.canvas.hex, i = roles.ink.hex;
  roles.muted = { hex: mix(i, c, 0.45), derived: true, evidence: 'GUESS: ink mixed 45% towards canvas' };
  roles.surface = { hex: mix(c, i, 0.04), derived: true, evidence: 'GUESS: canvas mixed 4% towards ink' };
  roles.line = { hex: mix(c, i, 0.14), derived: true, evidence: 'GUESS: canvas mixed 14% towards ink' };
  roles.accentInk = { hex: better(roles.accent.hex, c, i), derived: true, evidence: 'GUESS: whichever of canvas and ink contrasts more with the accent' };
  // fonts cannot be read from pixels: the shipped template's faces stand in and the fields are asked
  const tpl = templateHalf();
  const faces = {};
  for (const role of ['display', 'text', 'mono']) { const f = tpl.type[role]; if (f) faces[role] = { family: f.family, generic: null, weight: f.weight, track: f.tracking ?? 0, evidence: `ASK: fonts cannot be read from stills; the "${tpl.name}" half's ${role} face stands in` }; }
  const ask = ['type.display', 'type.text', ...(acc ? [] : ['color.accent'])];
  return { mapped: { roles, faces, seen: [] }, ask };
}
// --color role=#hex, given by the user: it always wins over a sampled or guessed value
function typed(mapped, ask, list = []) {
  for (const t of list) {
    const m = /^([a-zA-Z]+)=(#?[0-9a-fA-F]{6})$/.exec(String(t).trim());
    if (!m || !ROLES.includes(m[1])) throw fail(`--color expects role=#rrggbb with a role among ${ROLES.join(', ')}: ${t}`);
    const hex = normHex(m[2].startsWith('#') ? m[2] : `#${m[2]}`);
    mapped.roles[m[1]] = { hex, evidence: 'typed by the user' };
    const i = ask.indexOf(`color.${m[1]}`); if (i >= 0) ask.splice(i, 1);
  }
}

// ---------------------------------------------------------------- finishing

function templateHalf() {
  const dir = join(ROOT, 'styles', 'brands');
  const f = existsSync(join(dir, 'paper.json')) ? 'paper.json' : readdirSync(dir).find((x) => x.endsWith('.json'));
  if (!f) throw fail('no shipped brand half to take scale, space, radius and bans defaults from');
  return JSON.parse(readFileSync(join(dir, f), 'utf8'));
}

function finish({ name, source, out, mapped, via, extra = {} }) {
  const tpl = templateHalf(); const notes = []; const color = {}; const type = {};
  for (const r of ROLES) color[r] = mapped.roles[r].hex;
  const banned = bannedFonts(); const hit = new Set();
  const fallback = { display: 'text', text: 'display', mono: null };
  const typeLines = [];
  for (const role of ['display', 'text', 'mono']) {
    let s = mapped.faces[role]; let carried = null;
    if (!s && fallback[role] && mapped.faces[fallback[role]]) { s = mapped.faces[fallback[role]]; carried = `GUESS: no separate ${role} family found; the ${fallback[role]} family is reused`; }
    if (!s) { const n = nearestBundled(role, 'IBM Plex Mono', 'monospace', 400, 0); type[role] = n.face; typeLines.push(`- **type.${role}** ${n.face.family}, weight ${n.face.weight}: GUESS, no monospace text found; the bundled mono is the default`); continue; }
    const n = nearestBundled(role, s.family, s.generic, s.weight, s.track);
    type[role] = n.face;
    const bundled = n.how === 'same name';
    if (banned.some((b) => normName(b) === normName(s.family))) hit.add(s.family);
    typeLines.push(`- **type.${role}** ${s.family} -> ${n.face.family} (${n.how}${bundled ? '' : '; the captured family is not bundled'}), weight ${n.face.weight}${n.snappedFrom ? ` (measured ${n.snappedFrom}, nearest bundled weight)` : ''}, tracking ${n.face.tracking}em. Evidence: ${carried ?? s.evidence}`);
  }
  for (const f of mapped.seen) if (banned.some((b) => normName(b) === normName(f))) hit.add(f);

  const scale = tpl.scale; let space = tpl.space; let radius = tpl.radius; const copied = ['scale (ratios of the format base size)', 'composition (alignment, headline scale, density)', 'bans'];
  const sp = extra.space?.length >= 5 && extra.space.length <= 9 ? extra.space : null; const rd = extra.radius?.length >= 3 && extra.radius.length <= 7 ? extra.radius : null;
  if (sp) space = sp; else copied.push('space');
  if (rd) radius = rd; else copied.push('radius');
  const brand = { name, version: 1, fictional: false, source, color, type, scale, space, radius, composition: tpl.composition, bans: tpl.bans, allow: [], ...(extra.ask?.length ? { ask: extra.ask } : {}) };
  const v = validators().brand;
  if (!v(brand)) throw fail(`the captured brand half is invalid, nothing written: ${explain(v)}`, 1);

  const warnings = [];
  const mutedRatio = contrast(color.muted, color.canvas);
  if (mutedRatio < 4.5) warnings.push(`muted ${color.muted} on canvas ${color.canvas} is ${mutedRatio.toFixed(2)}:1, below the 4.5:1 that W-CONTRAST asks of video text; darken muted (or lighten it on a dark canvas) in the half before composing`);

  const lines = [
    `# Capture notes: ${name}`, '',
    `Source: ${source} (${via}). Captured ${new Date().toISOString().slice(0, 10)}. Best effort: every value below is a guess with its evidence, and the director approves the composed style before it is used (SPEC §13).`, '',
    '## Colour roles', '',
    ...ROLES.map((r) => `- **${r}** ${mapped.roles[r].hex}: ${mapped.roles[r].evidence}`), '',
    '## Type roles', '', ...typeLines, '',
    ...(extra.ask?.length ? ['## Asked (confirm before composing; W-ASK warns while `ask` lists anything)', '', ...extra.ask.map((a) => `- ASK: **${a}**: not measurable from this source; set it, then remove it from \`ask\`.`), ''] : []),
    '## Warnings', '',
    ...(warnings.length ? warnings.map((w) => `- WARN: ${w}.`) : ['- None: muted on canvas is at least 4.5:1.']), '',
    '## Banned fonts (advice only)', '',
    ...(hit.size ? [...hit].map((f) => `- NOTE: **${f}** is on the banned-fonts list (references/bans.md, SPEC §15). Advice, not a gate: nothing fails on a font. The piece uses the bundled stand-in named above; keep the captured family only if you hold the right to ship it.`) : ['- No captured family is on the banned-fonts list.']), '',
    '## Copied defaults (not measured)', '',
    `- ${copied.join(', ')} are copied from the shipped brand half "${tpl.name}"; adjust by hand if the brand differs.`,
    `- \`source\` is "${source}" and \`fictional\` is false.`, '',
  ];
  const outAbs = resolve(out); mkdirSync(dirname(outAbs), { recursive: true });
  const notesPath = outAbs.replace(/\.json$/, '') + '.capture-notes.md';
  writeFileSync(outAbs, `${JSON.stringify(brand, null, 2)}\n`);
  writeFileSync(notesPath, lines.join('\n'));
  return { brand, notes: lines.join('\n'), notesPath, bannedHit: [...hit], warnings };
}

const slug = (s) => s.toLowerCase().replace(/^www\./, '').replace(/\.[a-z]{2,}$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, 'b-').slice(0, 40) || 'captured';

export async function captureBrand({ from, name, out, color: typedColors }) {
  if (!from) throw fail(usageText('brand capture'));
  const isUrl = /^https?:\/\//i.test(from);
  let target = from; let kind;
  if (isUrl) kind = 'site';
  else {
    if (!existsSync(from)) throw fail(`--from not found: ${from}`);
    if (statSync(from).isDirectory()) target = existsSync(join(from, 'index.html')) ? join(from, 'index.html') : from;
    const ext = extname(target).toLowerCase();
    kind = target === from && statSync(from).isDirectory() ? 'stills' : ext === '.json' ? 'figma' : ext === '.md' ? 'designmd' : ['.html', '.htm'].includes(ext) ? 'site' : null;
    if (!kind || !existsSync(target)) throw fail(`cannot tell what ${from} is: expected a URL, an .html file, a Figma export .json or a DESIGN.md`);
  }
  const host = isUrl ? new URL(from).host : null;
  const rel = isUrl ? null : relative(ROOT, resolve(target));
  const source = host ?? (rel.startsWith('..') ? basename(target) : rel.split(sep).join('/'));
  name ??= out ? slug(basename(out).replace(/\.json$/i, '')) : slug(host ?? basename(dirname(resolve(target))));   // --out harbour-pine.json names the brand harbour-pine
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(name)) throw fail(`--name must match ^[a-z][a-z0-9-]{1,40}$: ${name}`);
  out ??= join(ROOT, 'styles', 'brands', `${name}.json`);

  if (kind === 'stills') {
    const { files, px } = readStills(target);
    const { mapped, ask } = mapStills(clusters(px), files);
    typed(mapped, ask, typedColors);
    return finish({ name, source, out, mapped, via: `palette clustered across ${files.length} stills`, extra: { ask } });
  }
  if (kind === 'site') { const { raw } = await readSite(target); return finish({ name, source, out, mapped: mapSite(raw), via: 'computed styles in headless Chromium' }); }
  if (kind === 'figma') {
    const json = JSON.parse(readFileSync(target, 'utf8')); const t = extractTokens(json);
    return finish({ name, source, out, mapped: mapTokens(t, 'the Figma export'), via: 'Figma export, colours and text styles mapped by name' });
  }
  const { tokens, via } = parseDesignMd(readFileSync(target, 'utf8'));
  if (!tokens) throw fail(`no tokens found in ${from}: expected a YAML front block, a fenced yaml block with colors:, or a table of name | value rows`);
  const t = extractTokens({ colors: tokens.colors ?? {}, typography: tokens.typography ?? {} });
  const steps = (o) => (o && typeof o === 'object' ? Object.values(o).map(pxOf).filter((x) => x !== null) : []);
  return finish({ name, source, out, mapped: mapTokens(t, 'the DESIGN.md tokens'), via: `DESIGN.md ${via}, tokens mapped by key name`, extra: { space: steps(tokens.spacing), radius: steps(tokens.rounded) } });
}

export async function main(argv) {
  try {
    const a = parseArgs({ args: argv, options: { from: { type: 'string' }, name: { type: 'string' }, out: { type: 'string' }, color: { type: 'string', multiple: true } }, strict: true }).values;
    const r = await captureBrand(a);
    console.log(`wrote ${a.out ?? `styles/brands/${r.brand.name}.json`} and ${relative(process.cwd(), r.notesPath)}`);
    if (r.bannedHit.length) console.log(`note: banned-list font captured (advice only): ${r.bannedHit.join(', ')}`);
    for (const w of r.warnings) console.log(`warning: ${w}`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('brand capture')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
