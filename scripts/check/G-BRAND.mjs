// G-BRAND (SPEC §3, §7, AXIOM 2): the piece stays the brand. At every rest every computed text colour,
// background and border colour is one of the style's seven roles (an alpha of a role is a blend, judged
// by pixels); every visible text element's computed font-family starts with a style family; and the
// rendered pixels at each rest are the palette. A colour or a face the brand does not own fails;
// literal syntax that renders one the brand owns is W-LITERAL's, a warning.
//
// The pixel half: a pixel is off when it lies farther than ΔE 2 (CIE76) from every role, every sRGB
// blend of two roles and every sRGB blend of three (a gradient through brand colours, a translucent role
// or a glow over one), or a multiply or screen blend of roles, and is not the brand ground or a blend of
// it with a role. Black and white are no roles: a multiply darker than the darkest role or a screen
// lighter than the lightest is off, and so is a contrast or saturation grade, which moves the roles
// themselves; the style's `finish` is the brand-safe way to finish a piece. ΔE 2 is calibrated: the
// four golden pieces in every format peak at ΔE 1.13, and the three presets' calibration sheet
// (fixtures/negatives/_palette) keeps every flat role and antialiased edge under it. Off pixels form
// 4-connected regions; a region under 2 px tall or under 2 px wide is antialiasing, so it is never a
// finding of its own (the region test) but its pixels still count toward the share.
// The rest fails when more than 0.5 % of its pixels are off (diffuse drift, stripes, a dither), or when
// one region exceeds 256 px (a small solid area: a recoloured mark). Only media is masked, by its
// content box: img, video,
// embed, iframe, SVG image, an object without fallback content, and a leaf a pattern declares
// `data-media` (canvas only inside one). Masked pixels are read from the same frame shot with that media
// hidden, so a mask never hides what lies around or behind it. A background-image never masks, and piece
// code may not declare media.
import { rule } from '../lib/report.mjs';
import { auditInstants, firstFamily, frameAt, groundAt, mediaAt, palette, parseColor, rgbKey, round, sources, stripJs, texts } from './_lib.mjs';
import { offPalette, paletteDistance } from './_pixels.mjs';

export const scope = 'format';
export const DELTA_E = 2;
export const OFF_MAX = 0.005;
export const REGION_MAX = 256;

const DECLARES_MEDIA = /\bdata-media\b|\bdataset\s*\.\s*media\b|\bdataset\s*\[\s*(['"`])media\1\s*\]/;

export default async function (ctx) {
  for (const s of sources(ctx)) {
    if (s.owner !== 'piece' || !['.js', '.mjs', '.html', '.htm'].includes(s.ext)) continue;
    const text = s.ext === '.js' || s.ext === '.mjs' ? stripJs(s.text) : s.text;
    const m = DECLARES_MEDIA.exec(text);
    if (m) return rule('G-BRAND', 'FAIL', { file: s.rel, line: text.slice(0, m.index).split('\n').length, measured: `data-media: ${m[0]}`, reason: 'media declared by piece code (only a pattern declares data-media); media is masked from the palette test, so it cannot be declared here' });
  }

  const rests = auditInstants(ctx.schedule);
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
  if (off.length) return rule('G-BRAND', 'FAIL', { ...off[0], reason: 'computed colour is not one of the style palette roles', all: off.slice(0, 20) });
  if (fam.length) return rule('G-BRAND', 'FAIL', { ...fam[0], reason: `computed font-family does not start with a style family (${[...families].join(', ')})`, all: fam.slice(0, 20) });

  // The pixel half: filters, blend modes, shadows, gradients, SVG paint and canvas all end here.
  const rgbOf = (keys) => keys.map((k) => k.split(',').map(Number));
  const dist = paletteDistance(rgbOf([...roles.keys()]), { blendOf: rgbOf([...roles].filter(([, name]) => !name.startsWith('ground-')).map(([k]) => k)) });   // roles and ground colours; multiply and screen blends are of the roles
  let worst = null, region = null;
  for (const t of rests) {
    const s = await ctx.sample(t);
    const { img } = await frameAt(ctx, t);
    const { masks, behind } = await mediaAt(ctx, t);
    const ground = await groundAt(ctx, t);   // blobs overlap, so the ground and blends over it pass
    const r = offPalette(img, dist, DELTA_E, { rect: s.probe.frame, masks, behind, ground });
    const share = r.total ? r.all / r.total : 0;
    if (!worst || share > worst.share) worst = { instant: t, share, colours: r.colours, masked: masks.length };
    if (!region || r.largest.size > region.size) region = { instant: t, size: r.largest.size, box: r.largest.box, colours: r.colours, masked: masks.length };
  }
  const ev = { rests: rests.length, threshold: `${OFF_MAX * 100} % of pixels, or a ${REGION_MAX} px region, beyond ΔE ${DELTA_E}` };
  if (worst && worst.share > OFF_MAX) {
    return rule('G-BRAND', 'FAIL', { ...ev, instant: round(worst.instant), measured: `${round(worst.share * 100, 2)} %`, colours: worst.colours, masked: worst.masked,
      reason: `${round(worst.share * 100, 2)} % of the rendered pixels are off the palette and its blends of up to three roles (e.g. ${worst.colours.join(', ')})` });
  }
  if (region && region.size > REGION_MAX) {
    const b = region.box;
    return rule('G-BRAND', 'FAIL', { ...ev, instant: round(region.instant), measured: `${region.size} px region`, box: b, colours: region.colours, masked: region.masked,
      reason: `a solid region of ${region.size} px (${b.w}×${b.h} at ${b.x},${b.y}) is off the palette and its blends of up to three roles (e.g. ${region.colours.join(', ')})` });
  }
  return rule('G-BRAND', 'PASS', { ...ev, measured: worst ? `${round(worst.share * 100, 3)} %` : null, largestRegion: region?.size ?? 0 });
}
