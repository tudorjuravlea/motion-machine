// Shared readings for the gate's rule files (SPEC §7, §12). Not a rule: check.mjs loads only files
// named like a rule id. Everything here is pure or reads the page through the ctx it is given.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { ROOT } from '../lib/browser.mjs';
import { decodePng } from './_pixels.mjs';
import { EPS, round, words, banActive } from './_pure.mjs';

export { ROOT };
export { EPS, round, words, banActive };

// SPEC §12 (provisional): viewport, base size, body floor, micro floor, safe margin.
export const FLOORS = {
  film: {
    '9x16': { w: 1080, h: 1920, base: 168, body: 44, micro: 28, safe: 72 },
    '1x1': { w: 1080, h: 1080, base: 152, body: 40, micro: 26, safe: 64 },
    '4x5': { w: 1080, h: 1350, base: 160, body: 42, micro: 27, safe: 68 },
    '16x9': { w: 1920, h: 1080, base: 136, body: 36, micro: 24, safe: 64 },
  },
  deck: { '16x9': { w: 1920, h: 1080, base: 128, body: 34, micro: 24, safe: 64 } },
};
export const floorsFor = (kind, format) => (kind === 'deck' && FLOORS.deck[format]) || FLOORS.film[format];

let validators = null;
/** Validates against contracts/<name>.schema.json ('story' | 'style'); returns null or a message. */
export function contractError(name, value) {
  if (!validators) {
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
    addFormats(ajv);
    const schemas = Object.fromEntries(['brand', 'motion', 'style', 'story'].map((n) => [n, JSON.parse(readFileSync(join(ROOT, 'contracts', `${n}.schema.json`), 'utf8'))]));
    for (const sc of Object.values(schemas)) ajv.addSchema(sc);
    validators = { story: ajv.getSchema(schemas.story.$id), style: ajv.getSchema(schemas.style.$id) };
  }
  const v = validators[name];
  return v(value) ? null : v.errors.slice(0, 3).map(describe).join('; ');
}

/** One schema error as a line; an unexpected property is named, and a `G-` key anywhere in `gate`, in any case, says why it is refused. */
function describe(e) {
  const prop = e.params?.additionalProperty;
  const hard = prop && /^\/gate(\/|$)/.test(e.instancePath) && /^g-/i.test(prop);
  return `${e.instancePath || '/'} ${e.message}${prop ? ` ("${prop}")` : ''}${hard ? ': G- rules are hard rules and cannot be tuned; gate adjusts warnings only' : ''}`;
}

export const isWithin = (file, dir) => file === dir || file.startsWith(dir + sep);

/** Every pattern reference a story makes, with where it is made. */
export function refsOf(story) {
  const out = [];
  for (const sc of story.scenes) {
    out.push({ ref: sc.layout, where: `${sc.id}.layout` }, { ref: sc.cut, where: `${sc.id}.cut` });
    if (sc.move) out.push({ ref: sc.move, where: `${sc.id}.move` });
    for (const b of sc.beats) {
      out.push({ ref: b.fx, where: `${sc.id}.${b.slot}.fx` });
      if (b.exit) out.push({ ref: b.exit, where: `${sc.id}.${b.slot}.exit` });
      if (b.emphasis) out.push({ ref: b.emphasis, where: `${sc.id}.${b.slot}.emphasis` });
      (b.screen ?? []).forEach((a, i) => out.push({ ref: a.do, where: `${sc.id}.${b.slot}.screen[${i}]` }));
    }
  }
  return out;
}

/** The cues a story's beats name: [{ cue, where }]. A cue is the folder patterns/sound/<cue>/, resolved apart from refsOf (a sound pattern is not a visual one). */
export function cueRefsOf(story) {
  const out = [];
  for (const sc of story.scenes) for (const b of sc.beats) if (b.cue) out.push({ cue: b.cue, where: `${sc.id}.${b.slot}.cue` });
  return out;
}

/** A reference resolves when its folder holds the file the kit loads (pattern.js or pattern.html). */
export function resolvesPattern(base, ref) {
  const dir = join(base, ref);
  return existsSync(join(dir, 'pattern.js')) || existsSync(join(dir, 'pattern.html'));
}

// ---------------------------------------------------------------------------------------------
// source text

/** Removes JS comments, leaving strings and template literals intact. */
export function stripJs(src) {
  let out = '', i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === q) q = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const chunk = src.slice(i, e < 0 ? src.length : e + 2); out += chunk.replace(/[^\n]/g, ' '); i = e < 0 ? src.length : e + 2; continue; }
    out += c; i++;
  }
  return out;
}

export const stripCss = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** Declarations inside innermost blocks: [{ prop, value, line }]. */
export function cssDeclarations(src) {
  const text = stripCss(src);
  const out = [];
  for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
    let offset = m.index + 1;
    for (const part of m[1].split(';')) {
      const k = part.indexOf(':');
      if (k > 0) {
        const prop = part.slice(0, k).trim().toLowerCase(), value = part.slice(k + 1).trim();
        if (prop && /^[-a-z]+$/.test(prop)) out.push({ prop, value, line: lineAt(text, offset + part.search(/\S/)) });
      }
      offset += part.length + 1;
    }
  }
  return out;
}

const TIME_PROPS = /^(transition|transition-duration|transition-delay|animation|animation-duration|animation-delay)$/;
/** CSS named colours and system colours (CSS Color 4); `transparent` and `currentcolor` are not literals. */
export const NAMED_COLORS = new Set(`aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey
darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey
darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite
gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon
lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue
lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid
mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff
peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen
accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field fieldtext graytext highlight highlighttext
linktext mark marktext selecteditem selecteditemtext visitedtext`.split(/\s+/));
const COLOR_PROP = /color|background|border|outline|shadow|^fill|^stroke|decoration|emphasis|text-stroke|text-fill|filter|column-rule|scrollbar|^mask/;
const SPACE_PROP = /^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap)$|^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/;
const GENERIC_FAMILY = /(^|,)\s*(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|emoji|math)\s*$/i;
const tokens = (v) => v.toLowerCase().split(/[\s,()/]+/).filter(Boolean);

// color-mix() is a literal unless it mixes at most one role (a var()) with transparent: an alpha of
// a role renders as a two-colour blend; two roles mixed make a third colour.
function colorMixLiteral(v) {
  for (const m of v.matchAll(/color-mix\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi)) {
    const ops = m[1].split(',').slice(1).map((x) => x.trim().replace(/\s+\d*\.?\d+%$/, '').replace(/^\d*\.?\d+%\s+/, '').trim().toLowerCase());
    const vars = ops.filter((o) => /^var\(/.test(o)).length;
    if (vars > 1 || ops.some((o) => !/^var\(/.test(o) && o !== 'transparent' && o !== 'currentcolor')) return true;
  }
  return false;
}

/** SPEC §7 W-LITERAL regexes over one CSS text: [{ line, prop, value, kind }]. */
export function cssLiterals(src) {
  const hits = [];
  for (const d of cssDeclarations(src)) {
    const v = d.value.replace(/var\([^()]*\)/g, 'var()');
    const add = (kind) => hits.push({ line: d.line, prop: d.prop, value: d.value, kind });
    const custom = d.prop.startsWith('--');
    if (/#[0-9a-f]{3,8}\b/i.test(v)) add('hex colour');
    if (/\brgba?\(/i.test(v)) add('rgb()');
    if (/\bhsla?\(/i.test(v)) add('hsl()');
    if (/\b(oklch|oklab|lab|lch|hwb)\(/i.test(v)) add('colour function');
    if (/\bcolor\(/i.test(v)) add('color()');
    if (/color-mix\(/i.test(d.value) && colorMixLiteral(d.value)) add('color-mix() of two colours');
    if ((COLOR_PROP.test(d.prop) || custom) && !/^(font|animation-name|content)/.test(d.prop) && tokens(d.value.replace(/var\([^()]*\)/g, ' ').replace(/(["']).*?\1/g, ' ')).some((w) => NAMED_COLORS.has(w))) add('named colour');
    if (/cubic-bezier\(/i.test(v)) add('cubic-bezier()');
    if (/\b\d*\.?\d+ms\b/i.test(v) || (TIME_PROPS.test(d.prop) && /(^|[\s,(])\d*\.?\d+s\b/i.test(v))) add('duration literal');
    if (d.prop === 'font-family' && !/^var\(/.test(d.value)) add('font-family not var()');
    if (custom && (GENERIC_FAMILY.test(d.value) || /^\s*(["'])[^"']+\1\s*(,|$)/.test(d.value))) add('font family in a custom property');
    if (d.prop === 'font-size' && /\b\d*\.?\d+(px|pt|rem|em)\b/i.test(v)) add('font-size literal');
    if (SPACE_PROP.test(d.prop) && /(^|[\s,(+*/-])(?!0+(\.0+)?px)\d*\.?\d+px\b/i.test(v)) add(/radius/.test(d.prop) ? 'radius literal' : 'space literal');
  }
  return hits;
}

/** Literal colours and easings inside JS strings (pattern lint): [{ line, kind, value }]. */
export function jsLiterals(src) {
  const text = stripJs(src), hits = [];
  for (const m of text.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    const s = m[2], line = lineAt(text, m.index);
    if (/^#[0-9a-f]{3,8}$|[\s:(]#[0-9a-f]{3,8}\b/i.test(s)) hits.push({ line, kind: 'hex colour', value: s });
    if (/\b(rgba?|hsla?)\(/i.test(s)) hits.push({ line, kind: 'colour function', value: s });
    if (/cubic-bezier\(/i.test(s)) hits.push({ line, kind: 'cubic-bezier()', value: s });
    if (/\b\d*\.?\d+ms\b/.test(s)) hits.push({ line, kind: 'duration literal', value: s });
  }
  return hits;
}

// SPEC §2.4, plus: a task scheduler with a delay, a thread or a new realm
// (each has its own clock), and per-load entropy (timeOrigin, event time stamps, a blob URL's UUID).
const TIME_NAMES = /\b(setTimeout|setInterval|requestAnimationFrame|performance\s*\.\s*now|Math\s*\.\s*random|getRandomValues|randomUUID|Date|timeOrigin|postTask|(?:Shared|Service)?Worker|serviceWorker|iframe|timeStamp|createObjectURL)\b/g;
/** SPEC §2.4 forbidden names in one JS text (comments ignored): [{ line, match }]. */
export function timeOffenders(src) {
  const text = stripJs(src), hits = [];
  for (const m of text.matchAll(TIME_NAMES)) hits.push({ line: lineAt(text, m.index), match: m[1].replace(/\s+/g, '') });
  for (const m of text.matchAll(/\bautoplay\b/g)) hits.push({ line: lineAt(text, m.index), match: 'autoplay' });
  for (const m of text.matchAll(/createElementNS\s*\([^,()]*,\s*(['"`])(animate\w*|set)\1/g)) hits.push({ line: lineAt(text, m.index), match: `SVG <${m[2]}>` });
  return hits;
}

/**
 * Markup that starts a clock or a realm of its own: `<iframe>`, `<frame>`, and SVG SMIL
 * animation elements, in an HTML, SVG or JS text: [{ line, match }].
 */
export function markupOffenders(src) {
  const hits = [];
  for (const m of src.matchAll(/<(iframe|frame)\b/gi)) hits.push({ line: lineAt(src, m.index), match: `<${m[1].toLowerCase()}>` });
  for (const m of src.matchAll(/<(animate|set|animateTransform|animateMotion|animateColor)\b/gi)) hits.push({ line: lineAt(src, m.index), match: `SVG <${m[1]}>` });
  return hits;
}

const DURATION_PROPS = /^(transition|transition-duration|transition-delay|animation|animation-duration|animation-delay)$/;
/** CSS transitions and animations whose timing comes through a custom property. */
export function cssTimeOffenders(src) {
  return cssDeclarations(src).filter((d) => DURATION_PROPS.test(d.prop) && /var\(/i.test(d.value)).map((d) => ({ line: d.line, match: `${d.prop}: ${d.value}` }));
}

/** Text the walk cannot read: shadow roots and canvas text, in a JS or HTML text. */
export function hiddenTextOffenders(src) {
  const hits = [];
  for (const m of src.matchAll(/\b(attachShadow|shadowrootmode|shadowroot|fillText|strokeText)\b/gi)) hits.push({ line: lineAt(src, m.index), match: m[1] });
  return hits;
}

const XML_NAMED = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
/** An XML document with the entities its internal DTD declares expanded (they may carry markup), nested ones too. */
export function expandDtd(src) {
  const declared = {};
  for (const m of src.matchAll(/<!ENTITY\s+([\w.-]+)\s+(["'])([\s\S]*?)\2\s*>/g)) declared[m[1]] = m[3];
  if (!Object.keys(declared).length) return src;
  const body = src.replace(/<!DOCTYPE[^[>]*\[[\s\S]*?\]\s*>/i, '');
  const expand = (s, depth) => s.replace(/&([\w.-]+);/g, (all, k) => (declared[k] != null && depth < 8 ? expand(declared[k], depth + 1) : all));
  return expand(body, 0);
}
/**
 * The character data of an XML fragment: CDATA unwrapped, tags removed, then the five
 * predefined entities and decimal and hex character references decoded.
 */
export function xmlText(fragment) {
  const esc = (c) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return fragment.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => esc(c)).replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (all, k) => {
      if (k[0] !== '#') return XML_NAMED[k.toLowerCase()] ?? all;
      const n = /^#x/i.test(k) ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      try { return String.fromCodePoint(n); } catch { return all; }
    });
}

/** SVG documents embedded as data: URIs in a CSS or HTML text, decoded: [{ svg, offset }]. */
export function svgDataUris(src) {
  const out = [];
  for (const m of src.matchAll(/data:image\/svg\+xml(;base64)?,([^"')\s]+|"[^"]*"|'[^']*')/gi)) {
    const body = m[2].replace(/^["']|["']$/g, '');
    try { out.push({ svg: m[1] ? Buffer.from(body, 'base64').toString('utf8') : decodeURIComponent(body), offset: m.index }); } catch { /* undecodable: not text */ }
  }
  return out;
}
/** `<video autoplay>` / `<audio autoplay>` in markup. */
export function autoplayOffenders(html) {
  const hits = [];
  for (const m of html.matchAll(/<(video|audio)\b[^>]*\bautoplay\b/gi)) hits.push({ line: lineAt(html, m.index), match: `<${m[1].toLowerCase()} autoplay>` });
  return hits;
}

/** Inline <script> bodies (no src), <style> bodies and style="" values of one HTML text. */
export function htmlParts(html) {
  const scripts = [], styles = [], attrs = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/\bsrc\s*=/.test(m[1])) scripts.push({ text: m[2], line: lineAt(html, m.index) });
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) styles.push({ text: m[1], line: lineAt(html, m.index) });
  for (const m of html.matchAll(/\sstyle\s*=\s*(["'])(.*?)\1/gi)) attrs.push({ text: `x{${m[2]}}`, line: lineAt(html, m.index) });
  return { scripts, styles, attrs };
}

const TEXT_EXT = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.json', '.svg']);
function walk(dir, skip, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || skip.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, skip, acc); else if (TEXT_EXT.has(extname(name).toLowerCase())) acc.push(p);
  }
  return acc;
}

/**
 * Every text file the piece ships plus the files of the patterns it references:
 * [{ file, rel, ext, owner: 'piece'|'pattern', ref?, text }]. Cached on ctx.
 */
export function sources(ctx) {
  if (ctx.cache.sources) return ctx.cache.sources;
  const list = [];
  for (const file of walk(ctx.dir, new Set(['out', 'node_modules']))) {
    list.push({ file, rel: relative(ctx.dir, file), ext: extname(file).toLowerCase(), owner: 'piece', text: readFileSync(file, 'utf8') });
  }
  const seen = new Set();
  for (const { ref } of refsOf(ctx.story)) {
    if (seen.has(ref) || ref.startsWith('sound/')) continue;
    seen.add(ref);
    for (const f of ['pattern.html', 'pattern.css', 'pattern.js']) {
      const file = join(ctx.patternsBase, ref, f);
      if (existsSync(file)) list.push({ file, rel: relative(ROOT, file), ext: extname(f), owner: 'pattern', ref, text: readFileSync(file, 'utf8') });
    }
  }
  return (ctx.cache.sources = list);
}

// ---------------------------------------------------------------------------------------------
// colour

export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
}
export function parseColor(s) {
  if (!s) return null;
  if (s.startsWith('#')) return hexToRgb(s);
  const cs = /^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (cs) {
    const a = cs[4] == null ? 1 : cs[4].endsWith('%') ? parseFloat(cs[4]) / 100 : parseFloat(cs[4]);
    return [Math.round(+cs[1] * 255), Math.round(+cs[2] * 255), Math.round(+cs[3] * 255), a];
  }
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(s);
  if (!m) return null;
  const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), a];
}
export const rgbKey = (c) => `${c[0]},${c[1]},${c[2]}`;
/** The style's seven roles, and its ground colours as ground-<n>, as a map from "r,g,b" to role name. */
export function palette(style) {
  const keys = new Map();
  for (const [role, hex] of Object.entries(style.color)) keys.set(rgbKey(hexToRgb(hex)), role);
  (style.ground?.blobs ?? []).forEach((b, i) => { const k = rgbKey(hexToRgb(b.color)); if (!keys.has(k)) keys.set(k, `ground-${i}`); });
  return keys;
}
const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ---------------------------------------------------------------------------------------------
// instants

/** Rests the gate audits: deck 0..presses; film the schedule's settle instants (else the end). */
export function restInstants(schedule) {
  if (schedule.kind === 'deck') return schedule.rests;
  return schedule.rests.length ? schedule.rests : [schedule.duration];
}

const SCENE_LAST = 1e-3;   // a scene's last instant: its end minus a millisecond
const MID = 1e-6;          // progress is u/d in floating point: within this of 0 or 1 is not mid-entrance

/**
 * The instants the hard rules read the frame at: the rests, and for a film the last instant of every
 * scene that has no rest (its last arrival is still running at its cut; W-SCENE-END only advises on
 * that), so no scene ships unread. The last instant is where the most of the scene has arrived while the
 * scene is still alone on the stage; what is still arriving there is marked `moving` by sample().
 */
export function auditInstants(schedule) {
  if (schedule.kind === 'deck') return schedule.rests;
  const resting = new Set(schedule.holds.map((h) => h.scene));
  const last = schedule.scenes.length - 1;
  const ends = schedule.scenes.flatMap((sc, i) => (resting.has(sc.id) ? [] : [i === last ? schedule.duration : round(sc.end - SCENE_LAST, 6)]));
  return [...new Set([...schedule.rests, ...ends])].sort((a, b) => a - b);
}

/** G-DETERMINISM's and G-TIME's three instants, all from the schedule (SPEC §2.5). */
export function threeInstants(schedule) {
  const arrive = schedule.events.find((e) => e.kind === 'arrive' && (schedule.kind === 'deck' ? e.to > e.from : e.d > 0));
  if (schedule.kind === 'deck') {
    return { first: 0, midEntrance: arrive ? (arrive.from + arrive.to) / 2 : schedule.presses / 2, lastRest: schedule.presses };
  }
  return { first: 0, midEntrance: arrive ? arrive.t + arrive.d / 2 : schedule.duration / 2, lastRest: schedule.rests.at(-1) ?? schedule.duration };
}

// ---------------------------------------------------------------------------------------------
// the page probe: every visible element of the stage, with what the rules read

function probeInPage(itemSelectors) {
  const stage = document.querySelector('.mm-stage');
  if (!stage) return { frame: null, elements: [] };
  const sr = stage.getBoundingClientRect();
  const items = itemSelectors.map((s) => document.querySelector(s));
  const transparent = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  const effBg = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const b = getComputedStyle(n).backgroundColor; if (!transparent(b)) return b; }
    return getComputedStyle(document.documentElement).backgroundColor;
  };
  const gradient = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (/gradient/.test(getComputedStyle(n).backgroundImage)) return true; return false; };
  const opacity = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  // Rendered scale (transforms, the `scale` property and SVG user units included): border box on
  // screen over the untransformed border box, the smaller axis.
  const scaleOf = (el, cs, r) => {
    if (el instanceof SVGElement) {
      const m = el.getScreenCTM && el.getScreenCTM();
      return m ? Math.min(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)) : 1;
    }
    const box = (prop, a, b, off) => {
      const v = parseFloat(cs[prop]);
      if (!Number.isFinite(v) || cs[prop] === 'auto') return off;
      return cs.boxSizing === 'border-box' ? v : v + parseFloat(cs[`padding${a}`]) + parseFloat(cs[`padding${b}`]) + parseFloat(cs[`border${a}Width`]) + parseFloat(cs[`border${b}Width`]);
    };
    const w = cs.display.startsWith('inline') && !cs.display.includes('-') ? el.offsetWidth : box('width', 'Left', 'Right', el.offsetWidth);
    const h = cs.display.startsWith('inline') && !cs.display.includes('-') ? el.offsetHeight : box('height', 'Top', 'Bottom', el.offsetHeight);
    const s = [w > 0 ? r.width / w : null, h > 0 ? r.height / h : null].filter((x) => x != null);
    if (!s.length) return 1;
    const v = Math.min(...s);
    return Math.abs(v - 1) < 0.005 ? 1 : v;
  };
  const pathOf = (el) => {
    const sc = el.closest('[data-scene]');
    if (el.dataset?.slot && sc) return `[data-scene="${sc.dataset.scene}"] [data-slot="${el.dataset.slot}"]`;
    if (el.dataset?.scene) return `[data-scene="${el.dataset.scene}"]`;
    const parts = [];
    for (let n = el; n && n !== stage && !(n.dataset && n.dataset.scene); n = n.parentElement) {
      const cls = n.classList.length ? '.' + [...n.classList].join('.') : '';
      parts.unshift(`${n.tagName.toLowerCase()}${cls}:nth-child(${[...n.parentElement.children].indexOf(n) + 1})`);
    }
    return (sc ? `[data-scene="${sc.dataset.scene}"] > ` : '.mm-stage > ') + parts.join(' > ');
  };
  // The text a ::before/::after paints: its string tokens and attr() values.
  const pseudoText = (el, content) => {
    if (!content || content === 'none' || content === 'normal') return '';
    let out = '';
    for (const m of content.matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|attr\(\s*([-\w]+)\s*\)/g)) {
      if (m[3]) out += el.getAttribute(m[3]) ?? '';
      else out += (m[1] ?? m[2]).replace(/\\([0-9a-f]{1,6})\s?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, '$1');
    }
    return out.replace(/\s+/g, ' ').trim();
  };
  const all = [...stage.querySelectorAll('*')];
  const out = [];
  all.forEach((el, idx) => {
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none') return;
    if (!el.getClientRects().length) return;
    const r = el.getBoundingClientRect();
    const op = opacity(el);
    if (op < 0.01) return;
    const tag = el.tagName.toLowerCase();
    const scale = scaleOf(el, cs, r);
    const itemIndex = items.findIndex((i) => i && (i === el || i.contains(el)));
    const shared = {
      scene: el.closest('[data-scene]')?.dataset.scene ?? null,
      micro: !!el.closest('[data-micro]'), microItem: (() => { const m = el.closest('[data-micro]'); return !!m && itemIndex >= 0 && (m === items[itemIndex] || m.contains(items[itemIndex])); })(),
      decor: !!el.closest('[data-decor]'), decorItem: (() => { const m = el.closest('[data-decor]'); return !!m && itemIndex >= 0 && (m === items[itemIndex] || m.contains(items[itemIndex])); })(), bleed: !!el.closest('[data-bleed]'), chrome: !!el.closest('[data-chrome]'), over: !!el.closest('[data-over]'), keep: !!el.closest('[data-keep]'),
      caption: !!el.closest('[data-caption]'), item: itemIndex >= 0 ? itemSelectors[itemIndex] : null,
    };
    for (const pseudo of ['before', 'after']) {
      const pcs = getComputedStyle(el, `::${pseudo}`);
      if (pcs.display === 'none' || pcs.visibility !== 'visible') continue;
      const text = pseudoText(el, pcs.content);
      if (!text) continue;
      const pop = op * parseFloat(pcs.opacity);
      if (pop < 0.01) continue;
      out.push({
        ...shared, idx, pseudo, selector: `${pathOf(el)}::${pseudo}`, tag: `${tag}::${pseudo}`, structural: false, text, ink: null, box: null,
        fontPx: parseFloat(pcs.fontSize), scale, renderedPx: parseFloat(pcs.fontSize) * scale, fontFamily: pcs.fontFamily, color: pcs.color,
        bg: transparent(pcs.backgroundColor) ? effBg(el) : pcs.backgroundColor, ownBg: transparent(pcs.backgroundColor) ? null : pcs.backgroundColor,
        borderColors: [], framed: false, outlineColor: null, painted: true, gradient: gradient(el), opacity: pop, itemAncestor: false,
      });
    }
    // ::marker text (a list item's content or string list-style-type) and ::first-letter/::first-line
    // styled away from their host: each is a text entry of its own, measured at its own size.
    const extra = [];
    if (cs.display === 'list-item') {
      const mcs = getComputedStyle(el, '::marker');
      const text = pseudoText(el, mcs.content) || (/^["']/.test(cs.listStyleType) ? pseudoText(el, cs.listStyleType) : '');
      if (text) extra.push(['marker', mcs, text]);
    }
    const allText = el.textContent.replace(/\s+/g, ' ').trim();
    if (allText && !/^(inline|contents)$/.test(cs.display)) {
      for (const pseudo of ['first-letter', 'first-line']) {
        const pcs = getComputedStyle(el, `::${pseudo}`);
        if (pcs.fontSize === cs.fontSize && pcs.color === cs.color && pcs.fontFamily === cs.fontFamily) continue;
        extra.push([pseudo, pcs, pseudo === 'first-letter' ? allText.slice(0, 1) : allText.slice(0, 60)]);
      }
    }
    for (const [pseudo, pcs, text] of extra) {
      out.push({
        ...shared, idx, pseudo, selector: `${pathOf(el)}::${pseudo}`, tag: `${tag}::${pseudo}`, structural: false, text, ink: null, box: null,
        fontPx: parseFloat(pcs.fontSize), scale, renderedPx: parseFloat(pcs.fontSize) * scale, fontFamily: pcs.fontFamily, color: pcs.color,
        bg: effBg(el), ownBg: null, borderColors: [], framed: false, outlineColor: null, painted: true, gradient: gradient(el), opacity: op, itemAncestor: false,
      });
    }
    const textNodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    const text = textNodes.map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    let ink = null;
    if (textNodes.length) {
      const rg = document.createRange();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of textNodes) {
        rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) { if (q.width < 0.01 && q.height < 0.01) continue; x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); }
      }
      if (x1 > x0) ink = { x: x0 - sr.x, y: y0 - sr.y, w: x1 - x0, h: y1 - y0 };
    }
    if (!ink && r.width < 0.5 && r.height < 0.5) return;
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((s) => parseFloat(cs[`border${s}Width`]) > 0 && !['none', 'hidden'].includes(cs[`border${s}Style`]));
    const outline = parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none';
    const ownBg = transparent(cs.backgroundColor) ? null : cs.backgroundColor;
    out.push({
      ...shared, idx, pseudo: null, selector: pathOf(el), tag,
      structural: el.classList.contains('mm-scene') || el.classList.contains('mm-camera'),
      text, ink, box: { x: r.x - sr.x, y: r.y - sr.y, w: r.width, h: r.height },
      fontPx: parseFloat(cs.fontSize), scale, renderedPx: parseFloat(cs.fontSize) * scale, fontFamily: cs.fontFamily, color: cs.color, bg: effBg(el), ownBg,
      borderColors: sides.map((s) => cs[`border${s}Color`]), framed: sides.length === 4 || outline, outlineColor: outline ? cs.outlineColor : null,
      painted: !!ownBg || sides.length > 0 || outline || cs.backgroundImage !== 'none' || /^(img|svg|canvas|video)$/.test(tag),
      gradient: gradient(el), opacity: op,
      itemAncestor: items.some((i) => i && i !== el && el.contains(i)),
    });
  });
  return { frame: { x: sr.x, y: sr.y, w: sr.width, h: sr.height }, elements: out };
}

/**
 * The media the pixel test does not judge: the content box of each replaced element
 * (img, video, embed, iframe, SVG image; object without fallback content) and of each leaf element a
 * pattern declares as media (`data-media`, never piece code: G-BRAND's static half), canvas only
 * inside such a declaration. A background-image never masks. `hide: true` also hides exactly these
 * elements (inline visibility, restored by `hide: false`) so the frame behind them can be shot.
 */
export function mediaInPage(hide) {
  const stage = document.querySelector('.mm-stage');
  if (!stage) return [];
  if (hide === false) {
    for (const el of stage.querySelectorAll('[data-mm-hidden]')) {
      const [v, p] = el.getAttribute('data-mm-hidden').split('|');
      if (v) el.style.setProperty('visibility', v, p); else el.style.removeProperty('visibility');
      el.removeAttribute('data-mm-hidden');
    }
    return [];
  }
  const sr = stage.getBoundingClientRect();
  const leaf = (el) => !el.firstElementChild && !el.textContent.trim();
  const out = [];
  for (const el of stage.querySelectorAll('img, video, embed, iframe, object, image, canvas, [data-media]')) {
    const tag = el.localName.toLowerCase();
    const ok = tag === 'canvas' ? !!el.closest('[data-media]') : tag === 'object' ? leaf(el) : /^(img|video|embed|iframe|image)$/.test(tag) ? true : leaf(el);
    if (!ok) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none' || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    let box = { x: r.x - sr.x, y: r.y - sr.y, w: r.width, h: r.height };
    if (!(el instanceof SVGElement) && el.offsetWidth > 0 && el.offsetHeight > 0) {
      const sx = r.width / el.offsetWidth, sy = r.height / el.offsetHeight, px = (k) => parseFloat(cs[k]) || 0;
      const l = (px('borderLeftWidth') + px('paddingLeft')) * sx, rt = (px('borderRightWidth') + px('paddingRight')) * sx;
      const t = (px('borderTopWidth') + px('paddingTop')) * sy, b = (px('borderBottomWidth') + px('paddingBottom')) * sy;
      box = { x: box.x + l, y: box.y + t, w: Math.max(0, box.w - l - rt), h: Math.max(0, box.h - t - b) };
    }
    if (box.w < 0.5 || box.h < 0.5) continue;
    out.push({ ...box, tag });
    if (hide === true) {
      el.setAttribute('data-mm-hidden', `${el.style.getPropertyValue('visibility')}|${el.style.getPropertyPriority('visibility')}`);
      el.style.setProperty('visibility', 'hidden', 'important');
    }
  }
  return out;
}

/**
 * The media of the frame at `instant` (page coordinates) and, when there is any, the same frame shot
 * with that media hidden: { masks, behind } (G-BRAND reads masked pixels from `behind`).
 */
/**
 * the frame at `instant` with only the brand ground showing (every scene's camera hidden, and the mark, which is masked as media),
 * for G-BRAND's pixel half; null for a style without a ground.
 */
export async function groundAt(ctx, instant) {
  if (!ctx.style.ground) return null;
  await ctx.mm.seek(instant);
  await ctx.page.evaluate(() => document.documentElement.classList.add('mm-ground-only'));
  const style = await ctx.page.addStyleTag({ content: '.mm-ground-only .mm-camera, .mm-ground-only .mm-ground__mark { visibility: hidden !important; }' });
  try {
    return decodePng(await ctx.page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' }));
  } finally {
    await style.evaluate((el) => el.remove());
    await ctx.page.evaluate(() => document.documentElement.classList.remove('mm-ground-only'));
  }
}

export async function mediaAt(ctx, instant) {
  await ctx.mm.seek(instant);
  const found = await ctx.page.evaluate(mediaInPage, true);
  if (!found.length) return { masks: [], behind: null };
  try {
    const png = await ctx.page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
    const f = await ctx.page.evaluate(() => { const r = document.querySelector('.mm-stage').getBoundingClientRect(); return { x: r.x, y: r.y }; });
    return { masks: found.map((m) => ({ ...m, x: m.x + f.x, y: m.y + f.y })), behind: decodePng(png) };
  } finally {
    await ctx.page.evaluate(mediaInPage, false);
  }
}

// The page's CDP session (DOM + CSS agents), opened once per page.
export async function cdpOf(ctx) {
  if (ctx.cache.cdp?.page === ctx.page) return ctx.cache.cdp.session;
  const session = await ctx.page.context().newCDPSession(ctx.page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  ctx.cache.cdp = { page: ctx.page, session };
  return session;
}

/**
 * Reads what the DOM cannot say about text: the platform fonts that painted each visible
 * text element (CSS.getPlatformFontsForNode) and the boxes of ::before/::after text.
 */
async function augment(ctx, probe) {
  const textual = probe.elements.filter((e) => e.text);
  if (!textual.length) return;
  const cdp = await cdpOf(ctx);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const byId = new Map();
  const index = (n) => { byId.set(n.nodeId, n); for (const c of [...(n.children ?? []), ...(n.pseudoElements ?? []), ...(n.shadowRoots ?? [])]) index(c); };
  index(root);
  const { nodeId: stageId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.mm-stage' });
  if (!stageId) return;
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: stageId, selector: '*' });
  for (const e of textual) {
    let nodeId = nodeIds[e.idx];
    if (e.pseudo) {
      const pn = (byId.get(nodeId)?.pseudoElements ?? []).find((p) => p.pseudoType === e.pseudo);
      nodeId = pn?.nodeId;
      if (nodeId) {
        try {
          const { model } = await cdp.send('DOM.getBoxModel', { nodeId });
          const q = model.border, xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
          const x = Math.min(...xs) - probe.frame.x, y = Math.min(...ys) - probe.frame.y;
          e.ink = e.box = { x, y, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        } catch { /* no layout box: falls back to the host's below */ }
      }
      if (!e.ink) {
        const host = probe.elements.find((h) => h.idx === e.idx && !h.pseudo);
        if (host) e.ink = e.box = /^first-/.test(e.pseudo) ? host.ink ?? host.box : host.box;   // ::first-* restyle the host's own lines
      }
    }
    if (!nodeId) continue;
    try {
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      e.fonts = fonts.map((f) => ({ family: f.familyName, postScript: f.postScriptName, custom: f.isCustomFont, glyphs: f.glyphCount }));
    } catch { e.fonts = null; }
  }
}

/** Seeks to `instant` and returns { instant, report, probe }, cached per ctx. A page without a stage is a setup error. */
export async function sample(ctx, instant) {
  const key = String(round(instant, 6));
  ctx.cache.samples ??= new Map();
  if (ctx.cache.samples.has(key)) return ctx.cache.samples.get(key);
  await ctx.mm.seek(instant);
  const report = await ctx.mm.report();
  const probe = await ctx.page.evaluate(probeInPage, ctx.schedule.items.map((it) => it.selector));
  if (!probe.frame) throw new Error('the page has no .mm-stage: nothing to measure');
  const arriving = report.elements.filter((e) => e.progress > MID && e.progress < 1 - MID).map((e) => e.selector);
  const inside = arriving.length ? new Set(await ctx.page.evaluate((sels) => {
    const roots = sels.map((q) => document.querySelector(q)).filter(Boolean);
    return [...document.querySelector('.mm-stage').querySelectorAll('*')].flatMap((el, i) => (roots.some((r) => r === el || r.contains(el)) ? [i] : []));
  }, arriving)) : new Set();
  for (const e of probe.elements) e.moving = inside.has(e.idx);
  await augment(ctx, probe);
  const s = { instant, report, probe };
  ctx.cache.samples.set(key, s);
  return s;
}

/** The frame at `instant` as PNG bytes and decoded RGBA, cached per ctx (G-BRAND, W-HOOK). */
export async function frameAt(ctx, instant) {
  const key = String(round(instant, 6));
  ctx.cache.frames ??= new Map();
  if (ctx.cache.frames.has(key)) return ctx.cache.frames.get(key);
  await ctx.mm.seek(instant);
  const png = await ctx.page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
  const f = { png, img: decodePng(png) };
  ctx.cache.frames.set(key, f);
  return f;
}

/** The visible text elements of a sample (pseudo-element text included). */
export const texts = (s) => s.probe.elements.filter((e) => e.text && e.ink);

/** The text elements of a sample that are not still arriving: where they sit and how big they are is judged only once they are in place. */
export const settledTexts = (s) => texts(s).filter((e) => !e.moving);

/** The first family of a computed font-family list, unquoted and lower-cased. */
export const firstFamily = (list) => String(list ?? '').split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
