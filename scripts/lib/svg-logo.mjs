// Makes a logo SVG safe to keep and to embed: no script, no foreign content, no event handlers, nothing that
// reaches outside the file, and a viewBox in place of a fixed size. The file is read as tags and rebuilt from
// them, so an oddly spelled tag (`<svg/onload=…>`, an entity-encoded `url(`) cannot hide what is removed.
// Also lists the fill and stroke colours a logo uses and writes the one-colour variant.
import { UsageError } from './cli.mjs';
import { normHex } from '../capture-brand.mjs';
import { parsePaint } from './mascot-svg.mjs';

const DROPPED = new Set(['script', 'foreignobject', 'iframe', 'embed', 'object']);
const ANIMATIONS = new Set(['set', 'animate', 'animatetransform', 'animatemotion']);
const PAINTS = new Set(['fill', 'stroke', 'stop-color']);
const local = (name) => name.toLowerCase().replace(/^.*:/, '');
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const codePoint = (n) => (n > 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : ' ');
const decode = (s) => s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (m, hx, dec, name) => (name ? ENTITIES[name.toLowerCase()] : codePoint(Number.parseInt(hx ?? dec, hx ? 16 : 10))));
const encodeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const encodeAttr = (s) => encodeText(s).replace(/"/g, '&quot;');

/** Splits SVG text into tokens (text, cdata, open with its decoded attributes, close); comments, the doctype and processing instructions are dropped. */
function tokenize(text) {
  const out = []; let i = 0;
  const addText = (s) => { if (s) out.push({ t: 'text', s }); };
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) { addText(text.slice(i)); break; }
    addText(text.slice(i, lt));
    i = lt;
    if (text.startsWith('<!--', i)) { const e = text.indexOf('-->', i + 4); i = e < 0 ? text.length : e + 3; continue; }
    if (text.startsWith('<![CDATA[', i)) { const e = text.indexOf(']]>', i); out.push({ t: 'cdata', s: text.slice(i + 9, e < 0 ? text.length : e) }); i = e < 0 ? text.length : e + 3; continue; }
    if (text.startsWith('<!', i)) {
      let depth = 0; let j = i + 2;
      for (; j < text.length; j++) { if (text[j] === '[') depth++; else if (text[j] === ']') depth--; else if (text[j] === '>' && depth <= 0) break; }
      i = j + 1; continue;
    }
    if (text.startsWith('<?', i)) { const e = text.indexOf('?>', i); i = e < 0 ? text.length : e + 2; continue; }
    if (text.startsWith('</', i)) {
      const m = /^<\/\s*([^\s>/]+)[^>]*>?/.exec(text.slice(i, i + 400));
      if (m) { out.push({ t: 'close', name: m[1] }); i += m[0].length; } else i += 2;
      continue;
    }
    const nm = /^<([A-Za-z_][^\s/>]*)/.exec(text.slice(i, i + 200));
    if (!nm) { addText('<'); i++; continue; }
    const attrs = []; let j = i + nm[0].length; let self = false;
    for (;;) {
      while (j < text.length && /[\s/]/.test(text[j])) { if (text[j] === '/') self = true; j++; }
      if (j >= text.length) break;
      if (text[j] === '>') { j++; break; }
      self = false;
      const an = /^[^\s"'<>/=]+/.exec(text.slice(j, j + 300));
      if (!an) { j++; continue; }
      j += an[0].length;
      while (/\s/.test(text[j] ?? '')) j++;
      let value = '';
      if (text[j] === '=') {
        j++; while (/\s/.test(text[j] ?? '')) j++;
        if (text[j] === '"' || text[j] === "'") { const e = text.indexOf(text[j], j + 1); value = text.slice(j + 1, e < 0 ? text.length : e); j = e < 0 ? text.length : e + 1; }
        else { const vm = /^[^\s>]*/.exec(text.slice(j)); value = vm[0]; j += vm[0].length; }
      }
      attrs.push([an[0], decode(value)]);
    }
    out.push({ t: 'open', name: nm[1], attrs, self });
    i = j;
    if (!self && local(nm[1]) === 'script') {   // the body of a script is not markup
      const e = text.slice(i).search(/<\/\s*script\b/i);
      const stop = e < 0 ? text.length : i + e;
      addText(text.slice(i, stop)); i = stop;
    }
  }
  return out;
}

const cssUrls = (s) => s.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi, (m, a, b, c) => ((a ?? b ?? c ?? '').trim().startsWith('#') ? m : 'none'));
/** A stylesheet or style attribute (already decoded) with every outside reference taken out. */
const cleanCss = (css) => cssUrls(css.replace(/\\/g, '').replace(/@import[^;{]*;?/gi, '').replace(/javascript:/gi, ''));
/** The fill, stroke and stop colours a stylesheet or style attribute declares. */
const declared = (css) => [...css.matchAll(/(?:^|[;{\s])(fill|stroke|stop-color)\s*:\s*([^;}!]+)/gi)].map((m) => m[2].trim());
const hexOfPaint = (v) => { const p = parsePaint(v); return Array.isArray(p) ? normHex(`#${p.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`) : null; };

const serialise = (tokens) => tokens.map((k) => {
  if (k.t === 'text') return k.s;
  if (k.t === 'cdata') return encodeText(k.s);
  if (k.t === 'close') return `</${k.name}>`;
  return `<${k.name}${k.attrs.map(([n, v]) => ` ${n}="${encodeAttr(v)}"`).join('')}${k.self ? '/' : ''}>`;
}).join('');

/**
 * The logo as a clean SVG with a viewBox and no fixed size, and the colours it paints with:
 * { svg, colors: ['#RRGGBB', …] } (first use first). Throws a usage error for anything that is not an SVG, or an
 * SVG with neither a viewBox nor a width and height to make one from.
 */
export function sanitiseSvg(text) {
  if (/<!ENTITY/i.test(text)) throw new UsageError('the SVG declares entities; export it again without a DOCTYPE');
  const out = []; const colors = [];
  let skip = null; let depth = 0; let root = false;
  let style = null;   // while inside <style>: where its body starts in `out`, and the raw text so far
  const note = (v) => { const h = hexOfPaint(v); if (h && !colors.includes(h)) colors.push(h); };
  const endStyle = () => {
    const css = cleanCss(decode(style.text.join('')));
    declared(css).forEach(note);
    out.splice(style.at, out.length - style.at, { t: 'text', s: encodeText(css) });
    style = null;
  };
  for (const k of tokenize(text)) {
    if (skip) {
      if (k.t === 'open' && !k.self && local(k.name) === skip) depth++;
      else if (k.t === 'close' && local(k.name) === skip && --depth === 0) skip = null;
      continue;
    }
    if (k.t === 'open') {
      const name = local(k.name);
      const attrName = (k.attrs.find(([n]) => n.toLowerCase() === 'attributename') ?? [])[1] ?? '';
      if (DROPPED.has(name) || (ANIMATIONS.has(name) && /^(xlink:)?href$|^on/i.test(attrName.trim()))) {
        if (!k.self) { skip = name; depth = 1; }
        continue;
      }
      const attrs = [];
      for (const [n, raw] of k.attrs) {
        const nl = n.toLowerCase();
        if (nl.startsWith('on') || nl === 'src') continue;
        let v = raw.replace(/\\/g, '');
        if (nl === 'href' || nl.endsWith(':href')) { if (!v.trim().startsWith('#')) continue; }
        else if (nl === 'style') { v = cleanCss(v); declared(v).forEach(note); }
        else if (/url\(/i.test(v)) v = cssUrls(v);
        if (PAINTS.has(nl)) note(v);
        attrs.push([n, v]);
      }
      if (!root) {
        if (name !== 'svg') throw new UsageError('the file is not an SVG: its first element is not <svg>');
        root = true;
        const get = (n) => attrs.find(([a]) => a.toLowerCase() === n)?.[1];
        if (get('viewbox') === undefined) {
          const num = (s) => { const m = /^\s*([\d.]+)\s*(?:px)?\s*$/.exec(s ?? ''); return m ? Number(m[1]) : null; };
          const [w, h] = [num(get('width')), num(get('height'))];
          if (!(w > 0 && h > 0)) throw new UsageError('the SVG has no viewBox and no usable width and height to make one from; add a viewBox');
          attrs.push(['viewBox', `0 0 ${w} ${h}`]);
        }
        for (let a = attrs.length - 1; a >= 0; a--) if (/^(width|height)$/i.test(attrs[a][0])) attrs.splice(a, 1);
        if (!attrs.some(([a]) => a === 'xmlns')) attrs.unshift(['xmlns', 'http://www.w3.org/2000/svg']);
      }
      out.push({ ...k, attrs });
      if (name === 'style' && !k.self) style = { at: out.length, text: [] };
      continue;
    }
    if (!root) {
      if (k.t === 'text' && !k.s.trim()) continue;
      throw new UsageError('the file is not an SVG: it does not start with an <svg> element');
    }
    if (style && (k.t === 'text' || k.t === 'cdata')) { style.text.push(k.s); out.push(k); continue; }
    if (k.t === 'close' && style && local(k.name) === 'style') endStyle();
    out.push(k);
  }
  if (!root) throw new UsageError('the file is not an SVG: it holds no <svg> element');
  if (style) endStyle();
  return { svg: `${serialise(out).trim()}\n`, colors };
}

const keepsPaint = (v) => /^\s*(none|transparent|inherit|currentcolor)\s*$/i.test(v);
const monoCss = (css) => css.replace(/(fill|stroke|stop-color)(\s*:\s*)([^;}!]+)/gi, (m, p, c, val) => (keepsPaint(val) ? m : `${p}${c}currentColor`));

/** The one-colour variant of a clean logo: every fill, stroke and stop colour is currentColor (none stays none). */
export function monoSvg(svg) {
  let root = true; let inStyle = false;
  const out = tokenize(svg).map((k) => {
    if (k.t === 'open') {
      const attrs = k.attrs.map(([n, v]) => {
        const nl = n.toLowerCase();
        if (PAINTS.has(nl) && !keepsPaint(v)) return [n, 'currentColor'];
        return [n, nl === 'style' ? monoCss(v) : v];
      });
      if (root && local(k.name) === 'svg') { root = false; if (!attrs.some(([n]) => n.toLowerCase() === 'fill')) attrs.push(['fill', 'currentColor']); }
      if (!k.self && local(k.name) === 'style') inStyle = true;
      return { ...k, attrs };
    }
    if (k.t === 'close' && local(k.name) === 'style') inStyle = false;
    if (inStyle && k.t === 'text') return { t: 'text', s: encodeText(monoCss(decode(k.s))) };
    return k;
  });
  return `${serialise(out).trim()}\n`;
}
