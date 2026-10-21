// G-PLACEHOLDER (SPEC §7): no TODO, lorem, […], XXX or {{ in the story's own text (beat text, scene say,
// cta, share), nor in the text visible at any rest
// (::before/::after/::marker text included), nor in the <text> of an SVG the piece ships: an .svg file, or an
// SVG data: URI inside its CSS or markup (raster images of text stay a reviewer's call), with
// every XML entity form decoded before matching. ::marker text counts.
import { rule } from '../lib/report.mjs';
import { auditInstants, expandDtd, round, sources, svgDataUris, texts, xmlText } from './_lib.mjs';

export const scope = 'format';
export const PLACEHOLDER = /TODO|XXX|\{\{|\[(?:…|\.\.\.)\]|lorem/i;
const CASED = /TODO|XXX|\{\{|\[(?:…|\.\.\.)\]|[Ll]orem/;

/**
 * The text content of every SVG <text> (and <foreignObject>) in a document: [{ text, offset }]. Entities are resolved first
 *: DTD-declared ones across the document, then CDATA, the predefined names and decimal and
 * hex character references inside each element, so `T&#79;DO` reads as it renders.
 */
export function svgTexts(svg) {
  const out = [];
  for (const m of expandDtd(svg).matchAll(/<(text|foreignObject)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = xmlText(m[2]).replace(/\s+/g, ' ').trim();
    if (text) out.push({ text, offset: m.index });
  }
  return out;
}

export { svgDataUris };

export default async function (ctx) {
  for (const s of sources(ctx)) {
    const docs = s.ext === '.svg' ? [{ svg: s.text, offset: 0 }] : ['.css', '.html', '.htm'].includes(s.ext) ? svgDataUris(s.text) : [];
    for (const d of docs) {
      for (const { text, offset } of svgTexts(d.svg)) {
        const m = CASED.exec(text);
        if (m) return rule('G-PLACEHOLDER', 'FAIL', { file: s.rel, line: s.text.slice(0, d.offset + (s.ext === '.svg' ? offset : 0)).split('\n').length, measured: m[0], reason: `placeholder text in an SVG the piece ships: "${text.slice(0, 80)}"` });
      }
    }
  }
  for (const t of auditInstants(ctx.schedule)) {
    const s = await ctx.sample(t);
    for (const el of texts(s)) {
      const m = CASED.exec(el.text);
      if (m) return rule('G-PLACEHOLDER', 'FAIL', { instant: round(t), selector: el.selector, measured: m[0], reason: `placeholder text on screen: "${el.text.slice(0, 80)}"` });
    }
  }
  // The story's own text, whether or not a frame shows it at an instant the gate samples: a line that
  // appears and leaves between rests is read here.
  const fields = [['cta.text', ctx.story.cta?.text], ['cta.url', ctx.story.cta?.url], ['share', ctx.story.share]];
  ctx.story.scenes.forEach((sc, i) => {
    fields.push([`scenes[${i}].say`, sc.say]);
    sc.beats.forEach((b, j) => fields.push([`scenes[${i}].beats[${j}].text`, b.text]));
  });
  for (const [field, text] of fields) {
    const m = typeof text === 'string' ? CASED.exec(text) : null;
    if (m) return rule('G-PLACEHOLDER', 'FAIL', { file: 'story.json', selector: field, measured: m[0], reason: `placeholder text in the story (${field}): "${text.slice(0, 80)}"` });
  }
  return rule('G-PLACEHOLDER', 'PASS', { rests: auditInstants(ctx.schedule).length });
}
