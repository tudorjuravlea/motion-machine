// Builds out/deck/: a deck that stands alone (SPEC §2.10, §8). It must open from file://,
// where Chromium refuses module scripts, fetch() and dynamic import() of sibling files. So the
// JavaScript (the piece's module, the kit, every pattern module) and the HTML fragments travel
// inside index.html as one JSON payload and are turned into blob modules at start; CSS and fonts
// are plain files beside it (those do load from file://). Paths are rewritten so nothing points
// at `../`. The deck runs the same kit code through the same mount(); only its loading differs.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { ROOT } from './browser.mjs';
import { UsageError, fontFiles, slug } from './cli.mjs';
import { patternsBaseOf } from './patterns-base.mjs';
import { resolveStory, forFormat } from '../../runtime/kit/schedule.js';

const KIT_IMPORT = /@import url\('\.\.\/\.\.\/\.\.\/runtime\/kit\/([\w-]+\.css)'\);/g;
const KIT = join(ROOT, 'runtime/kit');
const posix = (p) => p.split(sep).join('/');
const copy = (from, to) => { mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to); };

/** Pattern refs a story uses, as the kit collects them: roles and positions resolved against the
 *  style, screen actions, and screen/play for a folder asset (the kit adds it to a recording). */
export function patternRefs(story, style) {
  const refs = new Set();
  // every format's scenes, so a pattern only a variant uses is packed too
  const formats = [null, ...new Set(story.scenes.flatMap((sc) => Object.keys(sc.variants ?? {})))];
  const scenes = formats.flatMap((f) => { const s = f ? forFormat(story, f) : story; return (style ? resolveStory(s, style) : s).scenes; });
  for (const sc of scenes) {
    refs.add(sc.layout); refs.add(sc.cut);
    if (sc.move) refs.add(sc.move);
    for (const b of sc.beats) {
      refs.add(b.fx); if (b.exit) refs.add(b.exit); if (b.emphasis) refs.add(b.emphasis);
      for (const a of b.screen ?? []) refs.add(a.do);
      if (b.asset?.endsWith('/')) refs.add('screen/play');
    }
  }
  return [...refs].filter((r) => r && !String(r).startsWith('style:'));
}

/** The cue names a story names, over every format's scenes (a beat's `cue`). */
export function cueNames(story) {
  const out = new Set();
  const scenes = [...story.scenes, ...story.scenes.flatMap((sc) => Object.values(sc.variants ?? {}))];
  for (const sc of scenes) for (const b of sc.beats ?? []) if (b.cue) out.add(b.cue);
  return [...out];
}

/**
 * Builds out/deck/. `sound` is a deck sprite ({ bytes, mime, cues, events }: scripts/lib/deck-sound.mjs) to embed, or null; the
 * deck player (scripts/lib/deck-player.js) travels in every deck, for the press in real time and the postMessage steering.
 */
export function buildStandalone(dir, outDeck, { story, style, sound = null }) {
  const warnings = [];
  // a font is copied with its licence or not at all: checked before the old deck folder is touched
  for (const { family, file } of fontFiles(style)) {
    const abs = resolve(dir, file.src);
    if (existsSync(abs) && !existsSync(join(dirname(abs), 'LICENSE.txt'))) {
      throw new UsageError(`font ${family} (${file.src}) has no LICENSE.txt beside it; a deck ships each font with its licence`);
    }
  }
  rmSync(outDeck, { recursive: true, force: true });
  mkdirSync(outDeck, { recursive: true });

  const htmlFile = join(dir, 'index.html');
  const html = readFileSync(htmlFile, 'utf8');
  const tag = /<script\b([^>]*\btype=["']module["'][^>]*)>([\s\S]*?)<\/script>/i.exec(html);
  if (!tag) throw new UsageError(`${htmlFile} has no <script type="module"> to bundle`);
  const srcAttr = /\bsrc=["']([^"']+)["']/.exec(tag[1]);
  const entryFile = srcAttr ? resolve(dir, srcAttr[1]) : htmlFile;
  const entrySource = srcAttr ? readFileSync(entryFile, 'utf8') : tag[2];
  const patternsDir = patternsBaseOf(dir);

  // ---- the module graph -------------------------------------------------------------------
  const modules = [], ids = new Map(), active = new Set();
  const addModule = (abs, source = null) => {
    if (ids.has(abs)) return ids.get(abs);
    if (active.has(abs)) throw new UsageError(`import cycle through ${abs}`);
    active.add(abs);
    const isKit = abs.startsWith(KIT + sep);
    let src = source ?? readFileSync(abs, 'utf8');
    const dep = (spec) => {
      const target = resolve(dirname(abs), spec);
      if (!existsSync(target)) throw new UsageError(`${relative(ROOT, abs)} imports ${spec}, which does not exist`);
      return `@@mm:${addModule(target)}@@`;
    };
    src = src
      .replace(/(\bfrom\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (_, pre, q, spec) => `${pre}${q}${dep(spec)}${q}`)
      .replace(/(\bimport\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (_, pre, q, spec) => `${pre}${q}${dep(spec)}${q}`)
      .replace(/new URL\(\s*(['"])(?:\.\.\/)+patterns\/\1\s*,\s*import\.meta\.url\s*\)/g, "new URL('patterns/', document.baseURI)")
      .replace(/patternsBase:\s*new URL\(\s*['"][^'"]+['"]\s*,\s*import\.meta\.url\s*\)/g, "patternsBase: new URL('patterns/', document.baseURI)")
      .replace(/import\.meta\.url/g, isKit ? "new URL('kit/', document.baseURI).href" : 'document.baseURI')
      .replace(/(?<![\w.$])import\s*\(/g, '__mmImport(');
    if (/(^|[^\w])\.\.\//.test(src)) warnings.push(`${relative(ROOT, abs)}: a "../" remained in the bundled source and was rewritten to "./"`);
    src = src.replace(/\.\.\//g, './');
    active.delete(abs);
    const id = modules.length;
    modules.push({ id, src });
    ids.set(abs, id);
    return id;
  };
  const entry = addModule(entryFile, srcAttr ? null : entrySource);
  const player = addModule(join(ROOT, 'scripts/lib/deck-player.js'));

  // ---- patterns: css as files, html and js in the payload ------------------------------------
  const files = {}, patternJs = {};
  for (const ref of patternRefs(story, style)) {
    const folder = join(patternsDir, ref);
    const css = join(folder, 'pattern.css');
    if (existsSync(css)) {
      // a pattern may import a kit stylesheet (`@import url('../../../runtime/kit/split.css')`); the deck has no
      // runtime/ beside its patterns, so the import is written inline, and any other path out of the folder warns
      const text = readFileSync(css, 'utf8').replace(KIT_IMPORT, (_, name) => readFileSync(join(KIT, name), 'utf8'));
      if (/\.\.\/|https?:/.test(text)) warnings.push(`patterns/${ref}/pattern.css references a path outside itself or a URL`);
      mkdirSync(join(outDeck, 'patterns', ref), { recursive: true });
      writeFileSync(join(outDeck, 'patterns', ref, 'pattern.css'), text);
    }
    const ph = join(folder, 'pattern.html');
    if (ref.startsWith('layouts/') && !existsSync(ph)) throw new UsageError(`layout ${ref} has no pattern.html in ${relative(ROOT, patternsDir)}`);
    // a layout's markup, and a device's, text's or data pattern's fragment (fragment: true)
    if (existsSync(ph)) files[`patterns/${ref}/pattern.html`] = readFileSync(ph, 'utf8');
    const pj = join(folder, 'pattern.js');
    if (!ref.startsWith('layouts/') && existsSync(pj)) patternJs[`${ref}/pattern.js`] = addModule(pj);
  }
  // the cues the story names: the kit reads each one's module (its anchor and length) as it mounts; a cue that is data is a recipe the kit fetches
  for (const cue of cueNames(story)) {
    const folder = join(patternsDir, 'sound', cue);
    if (existsSync(join(folder, 'pattern.js'))) patternJs[`sound/${cue}/pattern.js`] = addModule(join(folder, 'pattern.js'));
    if (existsSync(join(folder, 'recipe.json'))) files[`patterns/sound/${cue}/recipe.json`] = readFileSync(join(folder, 'recipe.json'), 'utf8');
  }
  if (existsSync(join(KIT, 'render.css'))) copy(join(KIT, 'render.css'), join(outDeck, 'kit/render.css'));

  // ---- fonts: files beside the page, srcs rewritten ------------------------------------------
  const outStyle = structuredClone(style);
  for (const { family, file } of fontFiles(outStyle)) {
    const abs = resolve(dir, file.src);
    if (!existsSync(abs)) throw new UsageError(`font file missing: ${file.src} (relative to ${relative(ROOT, dir)})`);
    const rel = `fonts/${slug(family)}/${basename(abs)}`;
    copy(abs, join(outDeck, rel));
    copy(join(dirname(abs), 'LICENSE.txt'), join(outDeck, 'fonts', slug(family), 'LICENSE.txt'));
    file.src = rel;
  }
  files['story.json'] = JSON.stringify(story);
  files['style.json'] = JSON.stringify(outStyle);
  writeFileSync(join(outDeck, 'story.json'), JSON.stringify(story, null, 2) + '\n');
  writeFileSync(join(outDeck, 'style.json'), JSON.stringify(outStyle, null, 2) + '\n');

  // ---- the rest of the piece: stylesheets and assets (everything except fonts) ---------------
  let page = html.replace(tag[0], '@@LOADER@@');
  for (const m of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    const href = m[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/')) throw new UsageError(`index.html links ${href}: a standalone deck links only files inside the piece`);
    const abs = resolve(dir, href);
    if (relative(dir, abs).startsWith('..')) throw new UsageError(`index.html links ${href}, outside the piece folder`);
    if (existsSync(abs)) copy(abs, join(outDeck, relative(dir, abs)));
  }
  const assets = join(dir, 'assets');
  if (existsSync(assets)) {
    const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (!(d === assets && e.name === 'fonts')) walk(p); return; }
      copy(p, join(outDeck, 'assets', relative(assets, p)));
      // a prepared asset's manifest is read by the kit's fetch(), which file:// refuses: it travels in the payload
      // (so is a recording's pointer track, which the kit reads with it)
      if (e.name === 'media.json' || e.name === 'cursor.json') files[posix(join('assets', relative(assets, p)))] = readFileSync(p, 'utf8');
    });
    walk(assets);
  }

  // ---- index.html ------------------------------------------------------------------------------
  const embedded = sound ? { src: `data:${sound.mime};base64,${Buffer.from(sound.bytes).toString('base64')}`, cues: sound.cues, events: sound.events } : null;
  const payload = JSON.stringify({ entry, player, modules, patternJs, files, sound: embedded }).replace(/</g, '\\u003c');
  const loader = `<script id="mm-payload" type="application/json">${payload}</script>
  <script type="module">
    // Standalone loader: turns the payload into blob modules, serves story, style and layout
    // fragments to the kit's fetch() and pattern modules to its import(), then runs the piece.
    const P = JSON.parse(document.getElementById('mm-payload').textContent);
    const urls = [];
    for (const m of P.modules) {
      let src = m.src;
      for (let i = 0; i < urls.length; i++) src = src.split('@@mm:' + i + '@@').join(urls[i]);
      urls[m.id] = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    }
    const here = new URL('.', document.baseURI).href;
    const patterns = new URL('patterns/', document.baseURI).href;
    window.__mmImport = (href) => {
      const id = P.patternJs[String(href).slice(patterns.length)];
      return id == null ? Promise.reject(new Error('pattern not bundled: ' + href)) : import(urls[id]);
    };
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const href = String(input && input.url ? input.url : input);
      const text = href.startsWith(here) ? P.files[href.slice(here.length)] : undefined;
      return text !== undefined ? Promise.resolve(new Response(text, { status: 200 })) : realFetch(input, init);
    };
    await import(urls[P.entry]);
    // the deck player: a press in real time, the sprite's cues after the first gesture, a mute button, steering from a parent page
    (await import(urls[P.player])).startDeckPlayer({ sound: P.sound });
  </script>`;
  page = page.replace('@@LOADER@@', () => loader);
  if (/\.\.\//.test(page)) warnings.push('index.html still contains "../"');
  writeFileSync(join(outDeck, 'index.html'), page);
  return { dir: outDeck, patternsDir: posix(relative(ROOT, patternsDir)), modules: modules.length, warnings, sound: embedded ? { cues: Object.keys(sound.cues).length, bytes: Buffer.byteLength(embedded.src) } : null };
}
