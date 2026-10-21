// G-LITERAL (SPEC §3, §7, AXIOM 2): no literal colour, family, size, space, radius,
// duration or easing in piece or pattern CSS (the kit's own files are exempt); at every rest every
// computed text colour, background and border colour is one of the style's seven roles (an alpha of
// a role is a blend, judged by pixels); every visible text element's computed font-family starts
// with a style family; and the rendered pixels at each rest are the palette.
//
// The pixel half: a pixel is off when it lies farther
// than ΔE 2 (CIE76) from every role and every sRGB blend of two roles. ΔE 2 is calibrated: the four
// golden pieces in every format peak at ΔE 1.13, and the three presets' calibration sheet
// (fixtures/negatives/_palette) keeps every flat role and two-role antialiased edge under it. The rest
// fails when more than 0.5 % of its pixels are off (diffuse drift), or when one 4-connected region of
// off pixels exceeds 256 px (a small solid area: a recoloured mark). Three-colour antialiasing, as on
// ink over the text/highlight pattern's tint, reaches ΔE 15 on single edges but never a region above
// 99 px. Only media is masked, by its content box: img, video, embed, iframe, SVG image, an object
// without fallback content, and a leaf a pattern declares `data-media` (canvas only inside one).
// Masked pixels are read from the same frame shot with that media hidden, so a mask never hides what
// lies around or behind it. A background-image never masks, and piece code may not declare media.
import { rule } from '../lib/report.mjs';
import { cssLiterals, firstFamily, frameAt, groundAt, htmlParts, mediaAt, palette, parseColor, restInstants, rgbKey, round, sources, stripJs, texts } from './_lib.mjs';
import { offPalette, paletteDistance } from './_pixels.mjs';

export const scope = 'format';
export const DELTA_E = 2;
export const OFF_MAX = 0.005;
export const REGION_MAX = 256;

const DECLARES_MEDIA = /\bdata-media\b|\bdataset\s*\.\s*media\b|\bdataset\s*\[\s*(['"`])media\1\s*\]/;

export default async function (ctx) {
  const hits = [];
  for (const s of sources(ctx)) {
    if (s.ext === '.css') for (const h of cssLiterals(s.text)) hits.push({ file: s.rel, ...h });
    if (s.ext === '.html') {
      const parts = htmlParts(s.text);
      for (const p of [...parts.styles, ...parts.attrs]) for (const h of cssLiterals(p.text)) hits.push({ file: s.rel, ...h, line: p.line + h.line - 1 });
    }
  }
  for (const s of sources(ctx)) {
    if (s.owner !== 'piece' || !['.js', '.mjs', '.html', '.htm'].includes(s.ext)) continue;
    const text = s.ext === '.js' || s.ext === '.mjs' ? stripJs(s.text) : s.text;
    const m = DECLARES_MEDIA.exec(text);
    if (m) hits.push({ file: s.rel, line: text.slice(0, m.index).split('\n').length, prop: 'data-media', value: m[0], kind: 'media declared by piece code (only a pattern declares data-media)' });
  }
  if (hits.length) {
    const h = hits[0];
    return rule('G-LITERAL', 'FAIL', { file: h.file, line: h.line, measured: `${h.prop}: ${h.value}`, reason: `${h.kind} in CSS; use the --mm-* variables`, hits: hits.slice(0, 20) });
  }

  const rests = restInstants(ctx.schedule);
  const roles = palette(ctx.style);
  const families = new Set(Object.values(ctx.style.type).map((f) => f.family.toLowerCase()));
  const off = [], fam = [];
  const check = (instant, el, what, value) => {
    const c = parseColor(value);
    if (!c) { off.push({ instant: round(instant), selector: el.selector, measured: `${what} ${value}` }); return; }
    if (c[3] === 0) return;
    if (!roles.has(rgbKey(c))) off.push({ instant: round(instant), selector: el.selector, measured: `${what} ${value}` });
  };
  for (const t of rests) {
    const s = await ctx.sample(t);
    for (const el of s.probe.elements) {
      if (el.text && el.ink) check(t, el, 'color', el.color);
      if (el.ownBg) check(t, el, 'background-color', el.ownBg);
      for (const b of el.borderColors) check(t, el, 'border-color', b);
      if (el.outlineColor) check(t, el, 'outline-color', el.outlineColor);
    }
    for (const el of texts(s)) if (!families.has(firstFamily(el.fontFamily))) fam.push({ instant: round(t), selector: el.selector, measured: el.fontFamily });
  }
  if (off.length) return rule('G-LITERAL', 'FAIL', { ...off[0], reason: 'computed colour is not one of the style palette roles', all: off.slice(0, 20) });
  if (fam.length) return rule('G-LITERAL', 'FAIL', { ...fam[0], reason: `computed font-family does not start with a style family (${[...families].join(', ')})`, all: fam.slice(0, 20) });

  // The pixel half: filters, blend modes, shadows, gradients, SVG paint and canvas all end here.
  const dist = paletteDistance([...roles.keys()].map((k) => k.split(',').map(Number)));   // roles and ground colours
  let worst = null, region = null;
  for (const t of rests) {
    const s = await ctx.sample(t);
    const { img } = await frameAt(ctx, t);
    const { masks, behind } = await mediaAt(ctx, t);
    const ground = await groundAt(ctx, t);   // blobs overlap, so the ground and blends over it pass
    const r = offPalette(img, dist, DELTA_E, { rect: s.probe.frame, masks, behind, ground });
    const share = r.total ? r.off / r.total : 0;
    if (!worst || share > worst.share) worst = { instant: t, share, colours: r.colours, masked: masks.length };
    if (!region || r.largest.size > region.size) region = { instant: t, size: r.largest.size, box: r.largest.box, colours: r.colours, masked: masks.length };
  }
  const ev = { rests: rests.length, threshold: `${OFF_MAX * 100} % of pixels, or a ${REGION_MAX} px region, beyond ΔE ${DELTA_E}` };
  if (worst && worst.share > OFF_MAX) {
    return rule('G-LITERAL', 'FAIL', { ...ev, instant: round(worst.instant), measured: `${round(worst.share * 100, 2)} %`, colours: worst.colours, masked: worst.masked,
      reason: `${round(worst.share * 100, 2)} % of the rendered pixels are off the palette and its two-colour blends (e.g. ${worst.colours.join(', ')})` });
  }
  if (region && region.size > REGION_MAX) {
    const b = region.box;
    return rule('G-LITERAL', 'FAIL', { ...ev, instant: round(region.instant), measured: `${region.size} px region`, box: b, colours: region.colours, masked: region.masked,
      reason: `a solid region of ${region.size} px (${b.w}×${b.h} at ${b.x},${b.y}) is off the palette and its two-colour blends (e.g. ${region.colours.join(', ')})` });
  }
  return rule('G-LITERAL', 'PASS', { ...ev, measured: worst ? `${round(worst.share * 100, 3)} %` : null, largestRegion: region?.size ?? 0 });
}
